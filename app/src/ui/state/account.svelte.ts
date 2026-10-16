// A conta e o sync na tela (spec 7 e 9): o estado que Ajustes, o diálogo de entrar e o indicador leem. O motor (sync/engine.ts) e os
// gatilhos (sync/triggers.ts) ficam por trás. Só a aba líder (o lock 'klick-sync') sincroniza, e só ela escreve o cursor; as outras recebem
// o estado pelo canal 'klick-sync' e pedem por ele "Sincronizar agora", o primeiro login, parar e voltar. Sem conta neste aparelho, ou com
// a conta desligada no ambiente (spec 8.4), o motor não roda: nenhum pedido sai além de /api/health (spec 4.1).
import type { SyncState } from '../../core/sync/types';
import { newId } from '../../data/ids';
import { defaultSyncState, type ChangeKind, type ChangeOrigin, type ChannelLike, type Repository } from '../../data/repository';
import { createBackup } from '../../data/safety';
import { T } from '../../strings';
import type { Health, SyncApi } from '../../sync/api';
import { type Account, createServerClock, createSyncEngine, idleStatus, type ServerClock, type SyncEngine, type SyncStatus } from '../../sync/engine';
import { acquireLeadership, browserTriggerEnv, type LocksLike, startTriggers, type TriggerEnv, type Triggers } from '../../sync/triggers';

const CHANNEL = 'klick-sync';
// Quanto uma aba que não lidera espera a líder parar o motor (sair, apagar os dados). Sem resposta, segue: o repositório confere a conta
// dentro da transação que junta um lote, e um banco apagado (ou de outra conta) não recebe nada.
const STOP_WAIT_MS = 10_000;

export interface AccountDeps {
  api: SyncApi;
  clock?: ServerClock; // a hora do servidor: boot.ts passa a mesma que dá o `now` do repositório (padrão: uma só do motor)
  locks?: LocksLike | null; // padrão: navigator.locks; null: a aba lidera sozinha
  channel?: ChannelLike | null; // padrão: BroadcastChannel('klick-sync'); null: sem canal
  env?: TriggerEnv; // padrão: window, document e os timers (também as esperas e novas tentativas do motor)
}

// O que a conta usa do app.
export interface AccountHost {
  repo(): Repository;
  busy(): boolean; // o timer (ou o do treino) está ocupado: o sync espera
  now(): number;
  announce(text: string): void; // a região aria-live
}

// O que as abas dizem umas às outras pelo canal.
type Message =
  | { type: 'now' } // "Sincronizar agora" numa aba que não lidera
  | { type: 'wrote' } // uma gravação numa aba que não lidera: a líder sincroniza 5 s depois da última
  | { type: 'ask' } // uma aba que acabou de abrir pede o estado
  | { type: 'status'; status: SyncStatus } // o estado do motor da líder
  | { type: 'stop'; id: string } // sair numa aba que não lidera: a líder para o motor...
  | { type: 'stopped'; id: string } // ...e responde quando ele parou
  | { type: 'resume' } // a mesma conta voltou
  | { type: 'login'; account: Account }; // o primeiro login (ou a outra conta) pedido numa aba que não lidera

// As mudanças que a fila de saída leva: uma gravação delas pede o sync 5 s depois da última ('meta' e 'sync' não sobem).
const SYNCED_KINDS: readonly ChangeKind[] = ['solves', 'sessions', 'practice', 'profile', 'all'];

function defaultChannel(): ChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(CHANNEL) as unknown as ChannelLike;
  } catch {
    return null;
  }
}

const defaultLocks = (): LocksLike | null => (globalThis.navigator as { locks?: LocksLike } | undefined)?.locks ?? null;

const isStatus = (s: unknown): s is SyncStatus => typeof s === 'object' && s !== null && typeof (s as SyncStatus).phase === 'string';
const isAccount = (a: unknown): a is Account =>
  typeof a === 'object' && a !== null && typeof (a as Account).accountId === 'string' && typeof (a as Account).email === 'string';

export class AccountState {
  sync = $state<SyncState>(defaultSyncState()); // o bloco sync do meta, relido a cada aviso 'sync' (desta aba ou de outra)
  status = $state<SyncStatus>(idleStatus()); // o do motor desta aba, se ela lidera; senão, o último que a líder mandou
  leader = $state(false); // esta aba é a que sincroniza
  siteKey = $state<string | null>(null); // a site key do Turnstile, de /api/health
  // A última resposta de /api/health: undefined antes de perguntar, null sem servidor (sem rede, ou o app servido sem o Worker).
  private health = $state<Health | null | undefined>(undefined);

  protected readonly host: AccountHost;
  protected readonly deps: AccountDeps;
  protected readonly engine: SyncEngine;
  private readonly env: TriggerEnv;
  private readonly channel: ChannelLike | null;
  private readonly ownsChannel: boolean;
  private triggers: Triggers | null = null;
  private release: (() => void) | null = null;
  private started: Promise<void> | null = null;
  private closed = false;
  private failing = false; // a região aria-live já disse que o sync parou: só volta a falar quando ele voltar
  private readonly waits = new Map<string, () => void>(); // as paradas pedidas à líder, à espera da resposta

  constructor(host: AccountHost, deps: AccountDeps) {
    this.host = host;
    this.deps = deps;
    this.env = deps.env ?? browserTriggerEnv();
    this.ownsChannel = deps.channel === undefined;
    this.channel = deps.channel === undefined ? defaultChannel() : deps.channel;
    this.engine = createSyncEngine({
      repo: () => host.repo(),
      api: deps.api,
      now: () => host.now(),
      clock: deps.clock ?? createServerClock(),
      busy: () => host.busy(),
      backup: async () => {
        await createBackup(host.repo(), 'pre-sync', host.now());
      },
      onStatus: (s) => this.publish(s),
      schedule: (fn, ms) => this.env.schedule(fn, ms),
      sleep: (ms) =>
        new Promise<void>((resolve) => {
          this.env.schedule(resolve, ms);
        }),
    });
  }

  get signedIn(): boolean {
    return this.sync.signedIn && this.sync.accountId !== null;
  }

  // A conta aparece (Ajustes, o indicador, o convite): o ambiente diz que ela está ligada (spec 8.4). Sem resposta do servidor (sem rede),
  // aparece para quem já está numa conta. Com ela desligada, nada de conta aparece nem sincroniza, nem num aparelho que já está numa conta.
  get available(): boolean {
    return this.health ? this.health.accounts : this.signedIn;
  }

  // Ao abrir (AppState.init, sem esperar): lê o estado, pergunta ao servidor se a conta está ligada e só então disputa a liderança: com a
  // conta desligada, nenhuma rodada sai, nem a de abrir.
  start(): Promise<void> {
    this.started ??= this.begin();
    return this.started;
  }

  private async begin(): Promise<void> {
    if (this.channel) this.channel.onmessage = (ev) => this.receive(ev.data);
    await this.refresh();
    await this.checkHealth();
    if (this.closed) return;
    this.post({ type: 'ask' });
    this.release = acquireLeadership(this.deps.locks === undefined ? defaultLocks() : this.deps.locks, () => this.lead());
  }

  private lead(): void {
    if (this.closed) return;
    this.leader = true;
    this.triggers = startTriggers(() => void this.tick(), this.env);
    // Uma parada pedida à líder anterior, que fechou sem responder: esta aba é a líder agora, e o motor dela para.
    if (this.waits.size > 0) void this.engine.stop().then(() => [...this.waits.values()].forEach((done) => done()));
  }

  async checkHealth(): Promise<void> {
    let health: Health | null;
    try {
      health = await this.deps.api.health();
    } catch {
      health = null;
    }
    this.health = health;
    this.siteKey = health?.turnstileSiteKey ?? null;
    if (health && !health.accounts) void this.engine.stop(); // desligada no ambiente: nem a nova tentativa agendada sai (spec 8.4)
  }

  async refresh(): Promise<void> {
    try {
      this.sync = await this.host.repo().getSyncState();
    } catch {
      // A conexão caiu (o AppState a reabre): o próximo aviso 'sync' relê.
    }
  }

  // Um aviso do repositório: 'sync' relê o estado da conta; uma gravação desta aba pede o sync 5 s depois da última (a líder agenda; as
  // outras avisam a líder pelo canal). O que veio de fora não agenda nada: de outra aba, ela mesma avisa a líder; do servidor (o que o
  // motor acabou de juntar), não há o que mandar.
  changed(kind: ChangeKind, origin: ChangeOrigin): void {
    if (kind === 'sync') {
      void this.refresh();
      return;
    }
    if (origin !== 'local' || !SYNCED_KINDS.includes(kind)) return;
    if (this.leader) this.triggers?.wrote();
    else this.post({ type: 'wrote' });
  }

  // "Sincronizar agora" (spec 6.2): na aba líder, roda; nas outras, pede pelo canal.
  async syncNow(): Promise<void> {
    await this.started;
    if (this.leader) await this.tick();
    else this.post({ type: 'now' });
  }

  // O primeiro login (spec 6.5) ou juntar à outra conta (spec 7.6): roda na líder. A promessa resolve quando a rodada da líder terminou
  // (nesta aba) ou quando o pedido saiu (nas outras: o estado chega pelo canal).
  async firstLogin(account: Account): Promise<void> {
    const plain = { accountId: account.accountId, email: account.email };
    if (this.leader || !this.channel) {
      await this.engine.firstLogin(plain);
      return;
    }
    this.engine.resume(); // se esta aba liderar depois, o motor dela não fica parado
    this.post({ type: 'login', account: plain });
  }

  // Para o sync em todas as abas antes de sair ou apagar os dados (Task 15, spec 7.7): na líder, espera o motor dela parar (o pedido em
  // andamento voltar e ser juntado); nas outras, pede à líder pelo canal e espera a resposta, por no máximo STOP_WAIT_MS. O motor fica parado
  // até resumeSync() ou firstLogin().
  async stopSync(): Promise<void> {
    const own = this.engine.stop();
    if (this.leader || !this.channel) return own;
    await own; // o motor desta aba não tem rodada (ela não lidera): só fica parado, se ela liderar depois
    const id = newId(this.host.now());
    await new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.waits.delete(id);
        resolve();
      };
      const timer = setTimeout(done, STOP_WAIT_MS);
      this.waits.set(id, done);
      this.post({ type: 'stop', id });
    });
  }

  // A mesma conta voltou (Task 15): o motor volta a aceitar rodadas, nesta aba e na líder.
  resumeSync(): void {
    this.engine.resume();
    if (!this.leader) this.post({ type: 'resume' });
  }

  // A aba fecha (ou o AppState é trocado): solta o lock, para os gatilhos e o motor.
  stop(): void {
    this.closed = true;
    this.triggers?.stop();
    this.triggers = null;
    void this.engine.stop();
    this.release?.();
    this.release = null;
    this.leader = false;
    for (const done of [...this.waits.values()]) done();
    if (this.channel) this.channel.onmessage = null;
    if (this.ownsChannel) this.channel?.close?.();
  }

  // Um gatilho ou "Sincronizar agora": roda o motor se a conta está ligada e este aparelho está nela. Num aparelho que está numa conta, se
  // /api/health ficou sem resposta (sem rede ao abrir), pergunta de novo antes: com a conta desligada no ambiente, o sync não sai (spec 8.4).
  // Sem conta, a pergunta é uma por abertura.
  private async tick(): Promise<void> {
    if (this.health === null && this.signedIn) await this.checkHealth();
    if (this.available && this.signedIn) await this.engine.run();
  }

  private publish(next: SyncStatus): void {
    this.show(next);
    if (this.leader) this.post({ type: 'status', status: next });
  }

  // O estado na tela. A região aria-live segue o erro (spec 9.6): fala quando um erro aparece e quando uma rodada termina bem depois dele.
  // As rodadas ('syncing'), a falta de rede ('offline', que o indicador mostra) e sair da conta ('off') não falam.
  private show(next: SyncStatus): void {
    if (next.error !== null && !this.failing) {
      this.failing = true;
      this.host.announce(T.conta.syncFailedLive);
    } else if (this.failing && next.phase === 'idle') {
      this.failing = false;
      this.host.announce(T.conta.syncBackLive);
    } else if (next.phase === 'off') {
      this.failing = false;
    }
    this.status = next;
  }

  private post(message: Message): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // O canal fechou: cada aba segue com os próprios gatilhos.
    }
  }

  private receive(data: unknown): void {
    const m = data as Partial<Message> | null;
    switch (m?.type) {
      case 'now':
        if (this.leader) void this.tick();
        break;
      case 'wrote':
        if (this.leader) this.triggers?.wrote();
        break;
      case 'ask':
        if (this.leader) this.post({ type: 'status', status: this.engine.status() });
        break;
      case 'status':
        if (!this.leader && isStatus(m.status)) this.show(m.status);
        break;
      case 'stop':
        if (this.leader && typeof m.id === 'string') {
          const id = m.id;
          void this.engine.stop().then(() => this.post({ type: 'stopped', id }));
        }
        break;
      case 'stopped':
        if (typeof m.id === 'string') this.waits.get(m.id)?.();
        break;
      case 'resume':
        if (this.leader) this.engine.resume();
        break;
      case 'login':
        if (this.leader && isAccount(m.account)) void this.engine.firstLogin({ accountId: m.account.accountId, email: m.account.email });
        break;
    }
  }
}

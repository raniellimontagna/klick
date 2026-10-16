// A conta e o sync na tela (spec 7 e 9): o estado que Ajustes, o diálogo de entrar e o indicador leem. O motor (sync/engine.ts) e os
// gatilhos (sync/triggers.ts) ficam por trás. Só a aba líder (o lock 'klick-sync') sincroniza, e só ela escreve o cursor; as outras recebem
// o estado pelo canal 'klick-sync' e pedem por ele "Sincronizar agora", o primeiro login, parar e voltar. Sem conta neste aparelho, ou com
// a conta desligada no ambiente (spec 8.4), o motor não roda: nenhum pedido sai além de /api/health (spec 4.1).
import type { SyncState } from '../../core/sync/types';
import { newId } from '../../data/ids';
import { defaultSyncState, PendingChangesError, type ChangeKind, type ChangeOrigin, type ChannelLike, type Repository } from '../../data/repository';
import { createBackup } from '../../data/safety';
import { T } from '../../strings';
import { ApiError, type CloudCopy, type Health, type SyncApi } from '../../sync/api';
import { type AuthClientLike, type AuthUser, loadAuthClient, type PasskeyInfo, type SendResult, type VerifyResult } from '../../sync/auth';
import { type Captcha, CaptchaError, turnstile } from '../../sync/captcha';
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
  auth?: () => Promise<AuthClientLike>; // padrão: o cliente do Better Auth, carregado na hora (sync/auth.ts)
  captcha?: Captcha; // padrão: o Turnstile da Cloudflare, carregado na hora (sync/captcha.ts)
}

// Depois do código (ou da passkey): o primeiro login neste aparelho, a volta da mesma conta, ou outra conta (spec 7.6).
export type SignInNext = 'first' | 'resume' | 'other-account';
export type VerifyOutcome = { ok: true; next: SignInNext } | Extract<VerifyResult, { ok: false }>;

// O primeiro sync pedido pelo diálogo de entrar (continueSignIn), visto pelo estado que esta aba recebe: 'waiting', a conta ainda não
// entrou; 'started', entrou e o sync corre; 'done', a rodada terminou depois do pedido, sem erro e sem primeiro sync por fazer;
// 'cancelled', uma parada (sair, nesta aba ou noutra) o cancelou antes disso.
export type SignInSync = 'waiting' | 'started' | 'done' | 'cancelled';

// O que a conta usa do app.
export interface AccountHost {
  repo(): Repository;
  busy(): boolean; // o timer (ou o do treino) está ocupado: o sync espera
  now(): number;
  announce(text: string): void; // a região aria-live
  afterWipe(): Promise<void>; // os dados deste aparelho foram apagados: o app relê e cria a sessão padrão
}

// O que as abas dizem umas às outras pelo canal.
type Message =
  | { type: 'now' } // "Sincronizar agora" numa aba que não lidera
  | { type: 'wrote' } // uma gravação numa aba que não lidera: a líder sincroniza 5 s depois da última
  | { type: 'ask' } // uma aba que acabou de abrir pede o estado
  | { type: 'status'; status: SyncStatus } // o estado do motor da líder
  | { type: 'stop'; id: string } // sair: o que esperava a líder fica para trás em todas; pedido por uma aba que não lidera, a líder para o motor...
  | { type: 'stopped'; id: string } // ...e responde quando ele parou
  // A conta voltou (ou entrou): todas as abas tiram o motor da parada; pedido por uma aba que não lidera... `accountId`: a conta em que a
  // líder entrou (o primeiro login dela), e o login pedido por outra aba para outra conta fica para trás.
  | { type: 'resume'; accountId?: string }
  | { type: 'resumed' } // ...a líder responde que voltou a aceitar rodadas
  | { type: 'login'; account: Account }; // o primeiro login (ou a outra conta) pedido numa aba que não lidera (a resposta é o aviso 'sync')

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
  passkeys = $state<PasskeyInfo[] | null>(null); // as passkeys da conta (Ajustes); null enquanto não lidas
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
  private heard = false; // esta aba (que não lidera) já recebeu um estado da líder: o primeiro é só o ponto de partida, não uma mudança
  private readonly waits = new Map<string, () => void>(); // as paradas pedidas à líder, à espera da resposta
  // O primeiro login e a volta da conta pedidos à líder e ainda sem resposta. Se a líder some antes de atender (fechando, ou soltando o lock),
  // o pedido não se perde: a aba que passa a liderar o refaz. O login fica em todas as abas que o viram passar (a que assume pode não ser a
  // que pediu) até o estado gravado mostrar a conta, dentro (o aviso 'sync' do começo dele); a volta, nesta aba, até a líder responder
  // 'resumed'. Sair em qualquer aba, a líder também (stopSync nesta, ou o 'stop' de outra), desfaz os dois em todas: senão a aba que
  // liderasse depois refaria um login de antes de sair, e o aparelho entraria sozinho na conta.
  private pendingLogin: Account | null = null;
  private pendingResume = false;
  private unlisten: (() => void)[] = [];
  private user: AuthUser | null = null; // quem acabou de entrar (o código ou a passkey), até continueSignIn ou cancelSignIn
  private next: SignInNext | null = null; // o caminho que o login de `user` deu: continueSignIn só aceita o modo que bate com ele
  // O primeiro sync que o diálogo de entrar espera (signInSync): a conta, quando foi pedido (o relógio do aparelho, o mesmo de lastSyncAt) e
  // se uma parada o cancelou.
  private joining = $state<{ accountId: string; since: number; cancelled: boolean } | null>(null);
  private client: Promise<AuthClientLike> | null = null;

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

  // O diálogo de entrar espera por aqui, não pela promessa: numa aba que não lidera, o pedido resolve antes de a líder fazer o trabalho, e o
  // estado chega depois, pelo canal e pelo aviso 'sync'. "Pronto" só depois de uma rodada que terminou depois do pedido, com a conta dentro.
  get signInSync(): SignInSync | null {
    const j = this.joining;
    if (!j) return null;
    if (j.cancelled) return 'cancelled';
    if (!this.sync.signedIn || this.sync.accountId !== j.accountId) return 'waiting';
    const s = this.status;
    const done = !this.sync.firstSync && s.phase === 'idle' && s.error === null && s.lastSyncAt !== null && s.lastSyncAt >= j.since;
    return done ? 'done' : 'started';
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
    // Voltar a ficar visível ou online vale em qualquer aba (spec 6.2): a que não lidera pede o sync à líder. A líder tem os próprios gatilhos.
    const nudge = (): void => {
      if (!this.leader && !this.closed) this.post({ type: 'now' });
    };
    this.unlisten = [this.env.onOnline(nudge), this.env.onVisible(nudge)];
    await this.refresh();
    await this.checkHealth();
    if (this.closed) return;
    // Numa conta, a sessão de 90 dias renova com o uso (spec 7.3), e o cookie só renova por get-session: um pedido ao abrir, sem esperar.
    if (this.available && this.signedIn) void this.renewSession();
    this.post({ type: 'ask' });
    this.release = acquireLeadership(this.deps.locks === undefined ? defaultLocks() : this.deps.locks, () => this.lead());
  }

  // Esta aba passa a sincronizar. Antes dos gatilhos, refaz o que foi pedido à líder anterior e ela não atendeu, na ordem em que pode ter sido
  // pedido: a parada antes (sair desfaz o login e a volta pedidos antes dela, então o que sobrou veio depois). Repetir é seguro: a parada de um
  // motor parado não espera nada, a volta só tira o motor da parada, e o primeiro login de uma conta já gravada não recomeça nada.
  private lead(): void {
    if (this.closed) return;
    this.leader = true;
    // Uma parada pedida à líder anterior, que fechou sem responder: o motor desta aba para, e a espera termina.
    if (this.waits.size > 0) void this.engine.stop().then(() => [...this.waits.values()].forEach((done) => done()));
    if (this.pendingResume) {
      this.pendingResume = false;
      this.engine.resume();
    }
    const login = this.pendingLogin;
    this.pendingLogin = null;
    if (login) void this.engine.firstLogin(login);
    this.triggers = startTriggers(() => void this.tick(), this.env);
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
      const state = await this.host.repo().getSyncState();
      const before = this.sync;
      this.sync = state;
      // A lista de passkeys é da conta: fora dela, ou noutra (saiu ou trocou, nesta aba ou noutra), Ajustes relê.
      if (!state.signedIn || state.accountId !== before.accountId) this.passkeys = null;
      // O primeiro login pedido à líder começou: a conta está gravada, dentro. Não precisa mais ser refeito.
      if (this.pendingLogin && state.signedIn && state.accountId === this.pendingLogin.accountId) this.pendingLogin = null;
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
  // (nesta aba) ou quando o pedido saiu (nas outras: o estado chega pelo canal). Se a líder some antes de começá-lo, a aba que assume o faz.
  // Na líder, avisa as outras ('resume'): uma delas pode ter parado o próprio motor ao sair, e liderar depois.
  async firstLogin(account: Account): Promise<void> {
    const plain = { accountId: account.accountId, email: account.email };
    if (this.leader || !this.channel) {
      this.post({ type: 'resume', accountId: plain.accountId });
      await this.engine.firstLogin(plain);
      return;
    }
    this.engine.resume(); // se esta aba liderar depois, o motor dela não fica parado
    this.pendingLogin = plain;
    this.post({ type: 'login', account: plain });
  }

  // Para o sync em todas as abas antes de sair ou apagar os dados (signOut e continueSignIn, spec 7.6 e 7.7): na líder, espera o motor dela
  // parar (o pedido em andamento voltar e ser juntado; uma rodada que espera o timer para na hora) e avisa as outras, que deixam para trás o
  // login e a volta que ainda esperavam; nas outras, pede à líder pelo canal e espera a resposta, por no máximo STOP_WAIT_MS (pelo relógio
  // dos gatilhos). O motor fica parado até resumeSync() ou firstLogin().
  async stopSync(): Promise<void> {
    this.pendingLogin = null; // sair vale por cima do que ainda esperava a líder
    this.pendingResume = false;
    this.cancelJoining();
    const own = this.engine.stop();
    if (this.leader || !this.channel) {
      this.post({ type: 'stop', id: newId(this.host.now()) }); // as outras não lideram: só limpam o que esperavam, sem responder
      return own;
    }
    await own; // o motor desta aba não tem rodada (ela não lidera): só fica parado, se ela liderar depois
    const id = newId(this.host.now());
    await new Promise<void>((resolve) => {
      let cancel: () => void = () => undefined;
      const done = (): void => {
        cancel();
        this.waits.delete(id);
        resolve();
      };
      this.waits.set(id, done);
      cancel = this.env.schedule(done, STOP_WAIT_MS);
      this.post({ type: 'stop', id });
    });
  }

  // A mesma conta voltou (continueSignIn): o motor volta a aceitar rodadas, nesta aba, na líder e nas outras (uma delas pode liderar depois,
  // e o motor dela pode ter parado ao sair). Feito na líder, ela só avisa; numa aba que não lidera, o pedido espera a resposta da líder.
  resumeSync(): void {
    this.engine.resume();
    if (!this.leader) this.pendingResume = true; // antes do aviso: a resposta da líder pode chegar logo
    this.post({ type: 'resume' });
  }

  // --- Entrar, sair e passkeys (spec 7) ---

  private auth(): Promise<AuthClientLike> {
    this.client ??= (this.deps.auth ?? loadAuthClient)().catch((err: unknown) => {
      this.client = null; // o pedaço não carregou (sem rede): a próxima tentativa carrega de novo
      throw err;
    });
    return this.client;
  }

  private async renewSession(): Promise<void> {
    try {
      await (await this.auth()).renewSession();
    } catch {
      // sem o cliente (sem rede): nada muda aqui, e a próxima abertura renova
    }
  }

  // O código por e-mail (spec 7.2): primeiro um token novo do Turnstile, no elemento `host` da tela do e-mail (o token vale uma vez, e o
  // servidor o gasta até no 429). 'captcha' e 'limited' vêm do guarda do Worker, cada um com a sua mensagem; o desafio recusado aqui também
  // é 'captcha'. Sem a site key (o /api/health não respondeu ao abrir), pergunta de novo antes; sem resposta, 'failed'.
  async sendCode(email: string, host: HTMLElement): Promise<SendResult> {
    if (this.siteKey === null) await this.checkHealth();
    const siteKey = this.siteKey;
    if (siteKey === null) return 'failed';
    let token: string;
    try {
      token = await (this.deps.captcha ?? turnstile).token(siteKey, host);
    } catch (err) {
      return err instanceof CaptchaError ? 'captcha' : 'failed'; // o script que não carregou: sem rede
    }
    try {
      return await (await this.auth()).sendCode(email.trim(), token);
    } catch {
      return 'failed';
    }
  }

  // Quantas mudanças esperam para subir: apagar os dados deste aparelho recusa com alguma (decisão 12), e o aviso diz quantas.
  pending(): Promise<number> {
    return this.host.repo().outboxCount();
  }

  async verifyCode(email: string, code: string): Promise<VerifyOutcome> {
    let result: VerifyResult;
    try {
      result = await (await this.auth()).verifyCode(email.trim(), code);
    } catch {
      return { ok: false, reason: 'failed' };
    }
    return result.ok ? { ok: true, next: await this.adopt(result.user) } : result;
  }

  async passkeySignIn(): Promise<SignInNext | null> {
    try {
      const user = await (await this.auth()).passkeySignIn();
      return user ? await this.adopt(user) : null;
    } catch {
      return null;
    }
  }

  // Quem entrou fica guardado, com o caminho que deu, até continuar ou desistir. A lista de passkeys relê: a que não carregou antes (sem rede,
  // a sessão expirada) ficaria vazia até recarregar.
  private async adopt(user: AuthUser): Promise<SignInNext> {
    this.user = null;
    this.next = null;
    const { accountId } = await this.host.repo().getSyncState();
    const next: SignInNext = accountId === null ? 'first' : accountId === user.id ? 'resume' : 'other-account';
    this.user = user;
    this.next = next;
    this.passkeys = null;
    return next;
  }

  // O modo de continueSignIn bate com o caminho do login? 'join' é o primeiro login ou juntar à outra conta; 'erase', só na outra conta;
  // 'resume', só a mesma conta de antes. Fora disso, 'resume' depois de outra conta gravaria o e-mail dela na conta de antes, dentro, e
  // sincronizaria a fila e o cursor de uma com o cookie da outra.
  private static fits(next: SignInNext, mode: 'join' | 'erase' | 'resume'): boolean {
    if (next === 'first') return mode === 'join';
    if (next === 'resume') return mode === 'resume';
    return mode === 'join' || mode === 'erase';
  }

  // Depois de entrar: 'join' junta os dados deste aparelho à conta (o primeiro login, ou a outra conta da spec 7.6); 'erase' apaga os dados
  // deste aparelho antes (spec 7.6) e recusa ('pending') se ainda há mudanças esperando para subir (decisão 12); 'resume' é a mesma conta de
  // antes, que só volta a sincronizar. O modo que não bate com o caminho do login é recusado ('refused'), e nada muda. Trocar de conta para
  // o sync antes (o motor espera a rodada em andamento): a volta de uma rodada da conta anterior não cai no meio da troca, e a região
  // aria-live não fala de falha. O sync segue em segundo plano: a promessa resolve quando ele foi pedido. Uma parada depois disso (sair,
  // numa aba) cancela o primeiro login que ainda não começou: quem chama confere o estado (signInSync), não esta promessa.
  async continueSignIn(mode: 'join' | 'erase' | 'resume'): Promise<'ok' | 'pending' | 'refused'> {
    const user = this.user;
    const next = this.next;
    if (!user || !next) return 'ok';
    if (!AccountState.fits(next, mode)) return 'refused';
    const repo = this.host.repo();
    const state = await repo.getSyncState();
    const switching = state.accountId !== null && state.accountId !== user.id;
    if (mode === 'erase') {
      if ((await repo.outboxCount()) > 0) return 'pending';
      await this.stopSync();
      try {
        await repo.wipeData();
      } catch (err) {
        this.resumeSync(); // nada foi apagado: a conta de antes segue como estava
        if (err instanceof PendingChangesError) return 'pending'; // uma gravação entre a conferência e o apagar
        throw err;
      }
      // A passkey criada há pouco, no diálogo, continua neste aparelho: a tela de entrar a oferece primeiro (spec 7.2).
      if (state.passkey) await repo.saveSyncState({ passkey: true });
      await this.host.afterWipe();
    } else if (mode === 'join' && switching) {
      await this.stopSync();
    }
    this.user = null;
    this.next = null;
    this.joining = { accountId: user.id, since: this.host.now(), cancelled: false };
    if (mode === 'resume') {
      await repo.saveSyncState({ signedIn: true, email: user.email });
      await this.refresh();
      this.resumeSync(); // sair parou o motor: sem isso, o sync só voltaria ao recarregar
      void this.syncNow();
    } else {
      void this.firstLogin({ accountId: user.id, email: user.email });
    }
    return 'ok';
  }

  // Desistir no diálogo da outra conta (spec 7.6): sai da sessão nova; nada daqui muda.
  async cancelSignIn(): Promise<void> {
    this.user = null;
    this.next = null;
    await (await this.auth().catch(() => null))?.signOut();
  }

  // Sair (spec 7.7). Primeiro o sync para em todas as abas (espera a rodada em andamento): a volta dela não cai num banco recém-apagado nem
  // depois de sair. Com `erase`, apaga os dados deste aparelho, mas só sem mudanças esperando para subir ('pending', decisão 12): a recusa
  // vem antes de tudo, e a conta segue como estava. Sem `erase`, o accountId fica (a mesma conta, de volta, só sobe o que mudou).
  async signOut(erase: boolean): Promise<'ok' | 'pending'> {
    const repo = this.host.repo();
    if (erase && (await repo.outboxCount()) > 0) return 'pending';
    await this.stopSync();
    try {
      if (erase) await repo.wipeData();
      else await repo.saveSyncState({ signedIn: false });
    } catch (err) {
      this.resumeSync(); // nada mudou aqui: a conta segue como estava, sincronizando
      if (err instanceof PendingChangesError) return 'pending'; // uma gravação entre a conferência e o apagar
      throw err;
    }
    await (await this.auth().catch(() => null))?.signOut();
    await this.refresh();
    this.show(idleStatus());
    if (erase) await this.host.afterWipe();
    return 'ok';
  }

  // Sair de todos os aparelhos (spec 7.7): revoga todas as sessões, esta também. Sem rede, nada muda, e o sync segue.
  async signOutEverywhere(): Promise<boolean> {
    await this.stopSync();
    const ok = (await (await this.auth().catch(() => null))?.signOutEverywhere()) === true;
    const out = ok && (await this.host.repo().saveSyncState({ signedIn: false }).then(() => true, () => false));
    if (!out) {
      // Sem rede, nada muda e o sync segue. Revogadas sem gravar aqui (o banco falhou), a próxima rodada recebe 401 e Ajustes pede para
      // entrar de novo.
      this.resumeSync();
      return ok;
    }
    await this.refresh();
    this.show(idleStatus());
    return true;
  }

  async loadPasskeys(): Promise<void> {
    try {
      this.passkeys = await (await this.auth()).listPasskeys();
    } catch {
      this.passkeys = [];
    }
  }

  // Criar uma passkey marca este aparelho (meta.sync.passkey): a tela de entrar a oferece primeiro (spec 7.2).
  async addPasskey(): Promise<boolean> {
    const ok = await (await this.auth().catch(() => null))?.addPasskey();
    if (!ok) return false;
    await this.host.repo().saveSyncState({ passkey: true });
    await this.refresh();
    await this.loadPasskeys();
    return true;
  }

  async removePasskey(id: string): Promise<boolean> {
    const ok = await (await this.auth().catch(() => null))?.removePasskey(id);
    if (ok) await this.loadPasskeys();
    return ok === true;
  }

  // --- Cópias na nuvem e apagar a conta (spec 7.7 e 8.3) ---

  // As cópias dos últimos 30 dias, a mais nova primeiro. Sem rede (ou sem a sessão), rejeita: o diálogo avisa.
  cloudCopies(): Promise<CloudCopy[]> {
    return this.deps.api.cloudCopies();
  }

  // Restaurar um dia (spec 8.3): o servidor grava antes a cópia "antes de restaurar" e troca a conta inteira. A mudança chega aqui pelo sync
  // normal, pedido à líder, com a cópia 'pre-sync' da spec 6.6 quando o lote apaga muitos solves daqui. 'gone': a cópia não existe mais (a
  // regra do bucket apaga as de mais de 30 dias); 'failed': sem rede ou outro erro, e nada mudou.
  async restoreCloudCopy(name: string): Promise<'ok' | 'gone' | 'failed'> {
    try {
      await this.deps.api.restoreCloudCopy(name);
    } catch (err) {
      return err instanceof ApiError && err.status === 404 ? 'gone' : 'failed';
    }
    void this.syncNow();
    return 'ok';
  }

  // Apagar a conta (spec 7.7): o e-mail digitado confirma, sem diferença de maiúsculas nem de espaços nas pontas. Antes do servidor, o sync
  // para em todas as abas (espera a rodada em andamento): a volta dela depois do apagar seria um 401, e a região aria-live diria que o sync
  // parou. Sem resposta do servidor, a conta continua e o sync volta. Apagada, os dados e a fila ficam neste aparelho, fora de qualquer
  // conta; as outras abas saem pelo aviso 'sync' do repositório, e o motor de todas fica parado até um novo primeiro login.
  async deleteAccount(email: string): Promise<'ok' | 'mismatch' | 'failed'> {
    const typed = email.trim();
    const expected = this.sync.email?.trim().toLowerCase();
    if (!expected || typed.toLowerCase() !== expected) return 'mismatch';
    await this.stopSync();
    try {
      await this.deps.api.deleteAccount(typed);
    } catch {
      this.resumeSync(); // a conta continua: o sync não fica parado
      return 'failed';
    }
    this.user = null;
    this.next = null;
    await this.host.repo().forgetAccount();
    await this.refresh();
    this.passkeys = null;
    this.show(idleStatus());
    return 'ok';
  }

  // Uma parada antes do fim do primeiro sync pedido pelo diálogo o cancela (o motor esquece o login que não começou). Depois do fim, nada muda.
  private cancelJoining(): void {
    if (this.joining && !this.joining.cancelled && this.signInSync !== 'done') this.joining = { ...this.joining, cancelled: true };
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
    for (const off of this.unlisten) off();
    this.unlisten = [];
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
        if (!this.leader && isStatus(m.status)) {
          // Uma aba que abre com o sync já falhando não anuncia a falha como se tivesse acabado de acontecer (spec 9.6): o primeiro estado
          // que ela conhece é o ponto de partida; só o que muda depois fala.
          if (!this.heard) {
            this.heard = true;
            this.failing = m.status.error !== null;
          }
          this.show(m.status);
        }
        break;
      case 'stop':
        // Sair, numa aba: o que ainda esperava a líder fica para trás em todas, e o primeiro sync que o diálogo de entrar esperava parou.
        this.pendingLogin = null;
        this.pendingResume = false;
        this.cancelJoining();
        if (this.leader && typeof m.id === 'string') {
          const id = m.id;
          void this.engine.stop().then(() => this.post({ type: 'stopped', id }));
        }
        break;
      case 'stopped':
        if (typeof m.id === 'string') this.waits.get(m.id)?.();
        break;
      case 'resume':
        // Também nas abas que não lideram: uma delas pode ter parado o próprio motor ao sair, e liderar depois. A líder entrou noutra conta:
        // o login pedido aqui para outra, e perdido, não pode ser refeito por esta aba se ela liderar depois (trocaria de conta sozinha).
        if (typeof m.accountId === 'string' && this.pendingLogin?.accountId !== m.accountId) this.pendingLogin = null;
        this.engine.resume();
        if (this.leader) this.post({ type: 'resumed' });
        break;
      case 'resumed':
        this.pendingResume = false;
        break;
      case 'login':
        if (!isAccount(m.account)) break;
        if (this.leader) void this.engine.firstLogin({ accountId: m.account.accountId, email: m.account.email });
        else {
          // Fica até o estado mostrar a conta: se a líder some antes de atender e esta aba assume, ela o faz. O motor daqui sai da parada,
          // como o da aba que pediu.
          this.engine.resume();
          this.pendingLogin = { accountId: m.account.accountId, email: m.account.email };
        }
        break;
    }
  }
}

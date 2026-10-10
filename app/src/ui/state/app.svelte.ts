// Estado do app: o que a interface lê (sessões, solves, perfil, meta, aba, embaralhamento, avisos, diálogo aberto).
// Runes numa classe: os campos são $state e os derivados são getters. Só applyPrefs toca no DOM (atributos da raiz).
//
// Duas coisas andam numa fila única, na ordem em que foram pedidas: as leituras do banco (reload) e as contas depois de cada
// solve gravado (afterSave). Assim, uma leitura que começou antes de um solve gravado não volta a esconder esse solve.
import { dayKey } from '../../core/stats';
import { defaultSettings } from '../../core/types';
import type { EventId, Meta, Penalty, Profile, Session, Settings, Solve } from '../../core/types';
import { backupFileName, type DirHandleLike, saveToFolder } from '../../data/folder';
import { newId } from '../../data/ids';
import type { KlickExport, NewSolve, Repository } from '../../data/repository';
import {
  countSolveSaved,
  createBackup,
  createSaveQueue,
  planAfterSolve,
  planOnOpen,
  requestPersistence,
  restoreBackup,
  type SafetyPlan,
  type SaveQueue,
  type StorageLike,
  TRASH_MS,
} from '../../data/safety';
import { readV1, toKlickJson } from '../../data/transfer';
import type { ScrambleQueue } from '../../scramble/queue';
import { T, TRAIL } from '../../strings';

export type Tab = 'timer' | 'evolucao' | 'companion' | 'ajustes';
export type DialogId = 'sessions' | 'shortcuts' | 'onboarding' | 'export' | 'import' | 'backups' | 'trash' | 'install';
export interface Toast {
  text: string;
  action?: string;
  onAction?: () => void;
}
export interface AppDeps {
  repo: Repository;
  queue: ScrambleQueue;
  now?: () => number;
  storage?: Pick<Storage, 'getItem'> | null; // para achar dados da v1 (padrão: localStorage, ou null)
  storageManager?: StorageLike | null; // armazenamento persistente (padrão: navigator.storage)
  reopen?: () => Promise<Repository>; // abre uma conexão nova com o banco; sem ela, uma conexão morta não é trocada
}

const DEFAULT_EVENT: EventId = '333';
const UNDO_MS = 6000; // janela de Desfazer: a mesma do aviso que a oferece
const TOAST_MS = 6000;
const LIVE_DELAY_MS = 50; // o leitor de tela só anuncia de novo se o texto mudar depois de um intervalo
// Quanto a abertura espera pelo primeiro embaralhamento. Se o cubing demora mais, a casca aparece em branco e o embaralhamento
// chega depois, pela reatividade.
const FIRST_SCRAMBLE_WAIT_MS = 150;
// Uma gravação em voo por mais tempo que isto está presa (o IndexedDB não respondeu): a pessoa vê o aviso fixo e o banco é reaberto.
const STALL_MS = 5000;
// Erros que dizem que a conexão morreu (o iOS derruba a conexão com o app em segundo plano). Cota cheia não está nesta lista.
const CONNECTION_ERRORS: readonly string[] = ['InvalidStateError', 'UnknownError', 'TransactionInactiveError'];

const compareId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
// A ordem do repositório: o instante e, empatando, o id.
const bySolveTime = (a: Solve, b: Solve): number => a.at - b.at || compareId(a.id, b.id);

const isConnectionError = (err: unknown): boolean => {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined;
  return typeof name === 'string' && CONNECTION_ERRORS.includes(name);
};

// Junta os solves gravados com os que a fila ainda segura, na ordem de tempo, sem repetir um id que já está.
const withPending = (stored: Solve[], pending: Solve[]): Solve[] => {
  const ids = new Set(stored.map((solve) => solve.id));
  return [...stored, ...pending.filter((solve) => !ids.has(solve.id))].sort(bySolveTime);
};

// Sem a API de mídia (fora do navegador), a resposta é "não".
const mediaMatches = (query: string): boolean => typeof matchMedia === 'function' && matchMedia(query).matches;

// O acesso ao localStorage pode lançar (navegador com o armazenamento bloqueado): então não há dados da v1 para oferecer.
function defaultStorage(): Pick<Storage, 'getItem'> | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const defaultStorageManager = (): StorageLike | null => globalThis.navigator?.storage ?? null;

// Só enquanto o init não lê o perfil de verdade: a interface nunca mostra este valor.
const placeholderProfile = (): Profile => ({
  settings: defaultSettings(),
  trail: TRAIL.map(() => false),
  finish: 'fosco',
  onboarded: false,
  currentSessionId: null,
});

// Quem tem dados da v1 neste navegador. Uma leitura que lança é tratada como "não há nada".
function hasV1(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return readV1(storage) !== null;
  } catch {
    return false;
  }
}

// O que a contagem grava: só os contadores, para não sobrescrever campos que outra aba acabou de mudar (a cópia, por exemplo).
const counters = (m: Meta): Partial<Meta> => ({
  solvesSinceBackup: m.solvesSinceBackup,
  solvesSinceExport: m.solvesSinceExport,
  solvesSinceFolderSave: m.solvesSinceFolderSave,
});

export class AppState {
  sessions = $state<Session[]>([]); // não excluídas, em ordem de order
  solves = $state<Solve[]>([]); // todos os eventos, não excluídos, em ordem de at
  profile = $state<Profile>(placeholderProfile());
  meta = $state<Meta | null>(null);
  tab = $state<Tab>('timer');
  scramble = $state(''); // embaralhamento atual do evento da sessão; '' enquanto gera
  scrambleError = $state(false); // true se o gerador falhou
  savePending = $state(0); // solves esperando gravação
  saveStalled = $state(false); // uma gravação está presa há mais de STALL_MS (a tela mostra o aviso fixo junto com savePending)
  toast = $state<Toast | null>(null);
  live = $state(''); // texto da região aria-live
  dialog = $state<DialogId | null>(null);
  v1Available = $state(false); // há dados da v1 ainda não oferecidos
  exportReminder = $state(false); // mostrar o lembrete de exportar

  private repo: Repository; // troca quando a conexão é reaberta (useRepo)
  private readonly queue: ScrambleQueue;
  private readonly now: () => number;
  private readonly reopenDb: (() => Promise<Repository>) | undefined;
  private unsubscribe: (() => void) | null = null;
  private reopening: Promise<void> | null = null; // a reabertura em andamento, reaproveitada por quem pede enquanto ela não termina
  private readonly storage: Pick<Storage, 'getItem'> | null;
  private readonly storageManager: StorageLike | null;
  private readonly saves: SaveQueue;
  // Um por solve gravado: a fila entrega o mesmo objeto ao enqueue e ao onSaved, e a conta só acontece uma vez.
  private readonly afterSaves = new WeakMap<Solve, Promise<void>>();
  private chain: Promise<void> = Promise.resolve();
  private undo: { id: string; until: number } | null = null;
  private undoAction: (() => void) | null = null;
  private scrambleRequest = 0;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private liveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(deps: AppDeps) {
    this.repo = deps.repo;
    this.queue = deps.queue;
    this.now = deps.now ?? (() => Date.now());
    this.reopenDb = deps.reopen;
    this.storage = deps.storage === undefined ? defaultStorage() : deps.storage;
    this.storageManager = deps.storageManager === undefined ? defaultStorageManager() : deps.storageManager;
    // A arrow function: a fila grava pelo repositório atual, não pelo que existia quando ela foi criada.
    this.saves = createSaveQueue((s) => this.saveWatched(s), {
      // A fila só avisa numa falha (n > 0) e quando esvazia depois dela (0). Nos dois casos o número é o que ela tem agora.
      onChange: (pending) => {
        const before = this.savePending;
        this.savePending = pending;
        // A primeira falha vai para a região aria-live: o aviso fixo da tela do Timer não é lido sozinho.
        if (before === 0 && pending > 0) this.announce(T.data.saveFailed);
        // Depois de uma falha, a fila esvaziou: a pessoa fica sabendo que está tudo salvo.
        if (pending === 0) this.announce(T.data.saved);
      },
      onSaved: (s) => {
        // Cada gravação bem-sucedida tira um item da fila, e a fila não avisa nesse caso: o número é lido aqui.
        this.savePending = this.saves.pending();
        void this.recordSaved(s);
      },
      // Conexão morta: reabre o banco antes da nova tentativa da fila, que já grava pelo repositório que estiver em uso.
      onSaveError: (err) => {
        if (isConnectionError(err)) void this.reopenRepo();
      },
    });
  }

  // Há solve que ainda não foi gravado (na fila) ou uma gravação presa: fechar a aba perderia o que está só na memória.
  get unsaved(): boolean {
    return this.saves.pending() > 0 || this.saveStalled;
  }

  get currentSession(): Session | null {
    const id = this.profile.currentSessionId;
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  get event(): EventId {
    return this.currentSession?.event ?? DEFAULT_EVENT;
  }

  get sessionSolves(): Solve[] {
    const id = this.currentSession?.id;
    return this.solves.filter((s) => s.sessionId === id);
  }

  get eventSolves(): Solve[] {
    const event = this.event;
    return this.solves.filter((s) => s.event === event);
  }

  async init(): Promise<void> {
    // Pedir o armazenamento persistente não espera a resposta: o navegador pode perguntar e a pergunta não segura o app.
    void requestPersistence(this.storageManager).catch(() => undefined);
    await this.reload();
    // Assina antes do primeiro embaralhamento: a espera pelo cubing pode ser longa, e uma mudança de outra aba nesse tempo não
    // pode ficar de fora. As leituras que as próprias escritas disparam entram na fila; a última espera por elas no fim.
    this.subscribe();
    await this.ensureSession();
    const meta = this.meta ?? (await this.repo.getMeta());
    const folder = await this.folderConfigured();
    const plan = planOnOpen(meta, this.now(), folder);
    try {
      await this.repo.purgeTrash(TRASH_MS);
    } catch {
      // Limpar a lixeira é manutenção: a falha não apaga nada, e a próxima abertura tenta de novo. Sem aviso.
    }
    this.v1Available = !meta.v1ImportOffered && hasV1(this.storage);
    // Não espera o cubing além de FIRST_SCRAMBLE_WAIT_MS: a casca pode aparecer antes do embaralhamento.
    let patience: ReturnType<typeof setTimeout> | undefined;
    const waited = new Promise<void>((resolve) => {
      patience = setTimeout(resolve, FIRST_SCRAMBLE_WAIT_MS);
    });
    try {
      await Promise.race([this.nextScramble(), waited]);
    } finally {
      clearTimeout(patience);
    }
    this.queue.prefetch(this.event);
    await this.reload();
    // As cópias do dia e da pasta vêm depois do primeiro embaralhamento e rodam em segundo plano: uma cópia grande não segura a
    // casca. backup() e copyToFolder() já tratam as próprias falhas (com aviso); o catch só evita uma rejeição sem dono.
    void this.openingCopies(plan).catch(() => undefined);
  }

  private async openingCopies(plan: SafetyPlan): Promise<void> {
    if (plan.backup) await this.backup(plan.backup);
    if (plan.folderSave) await this.copyToFolder();
  }

  // Relê sessões, solves, perfil e meta do banco. Na mesma fila que as contas, então nunca fica por cima de um solve novo.
  reload(): Promise<void> {
    return this.serial(async () => {
      const [sessions, solves, profile, meta] = await Promise.all([
        this.repo.listSessions(),
        this.repo.listSolves(),
        this.repo.getProfile(),
        this.repo.getMeta(),
      ]);
      this.sessions = sessions;
      this.solves = solves;
      this.profile = profile;
      this.meta = meta;
      this.applyPrefs();
    });
  }

  // Leitura que falha não pode virar uma promessa sem dono: a pessoa vê o aviso.
  private refresh(): Promise<void> {
    return this.reload().catch(() => {
      this.showToast(T.data.readFailed);
    });
  }

  private serial(job: () => Promise<void>): Promise<void> {
    const run = this.chain.then(job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  async addSolve(r: { ms: number; penalty: Penalty; at: number }): Promise<Solve | null> {
    this.closeUndo(); // um solve novo encerra o desfazer pendente
    let session: Session;
    try {
      session = await this.ensureSession();
    } catch {
      // Sem sessão e sem poder gravar uma: o solve não entra na fila (não há a quem atribuí-lo), e a pessoa fica sabendo.
      this.showToast(T.data.saveFailed);
      return null;
    }
    const solve = await this.saves.enqueue({
      id: newId(this.now()), // o id é de quem grava: as tentativas seguintes usam este mesmo, e a gravação não duplica
      sessionId: session.id,
      event: session.event,
      ms: r.ms,
      penalty: r.penalty,
      at: r.at,
      scramble: this.scramble,
    });
    if (solve) await this.recordSaved(solve);
    await this.nextScramble();
    return solve;
  }

  async setPenalty(id: string, penalty: Penalty): Promise<void> {
    await this.write(() => this.repo.updateSolve(id, { penalty }));
    await this.refresh();
  }

  async setNote(id: string, note: string): Promise<void> {
    await this.write(() => this.repo.updateSolve(id, { note }));
    await this.refresh();
  }

  async deleteSolve(id: string): Promise<void> {
    const ok = await this.write(() => this.repo.deleteSolve(id));
    if (ok) {
      const undoAction = () => void this.undoDelete();
      this.undo = { id, until: this.now() + UNDO_MS };
      this.undoAction = undoAction;
      this.showToast(T.toast.deleted, this.undoLabel(), undoAction, UNDO_MS);
    }
    await this.refresh();
  }

  // Restaura se o prazo ainda não passou. Qualquer resposta encerra a janela: desfazer uma vez não se repete.
  async undoDelete(): Promise<boolean> {
    const undo = this.undo;
    this.closeUndo();
    if (!undo || this.now() > undo.until) return false;
    const ok = await this.write(() => this.repo.restoreSolve(undo.id));
    await this.refresh();
    return ok;
  }

  async createSession(event: EventId, name?: string): Promise<void> {
    this.clearScramble(); // antes da gravação: um solve que caia nessa janela não leva o embaralhamento do evento antigo
    await this.write(async () => {
      const session = await this.repo.createSession({ event, name });
      await this.repo.saveProfile({ currentSessionId: session.id });
    });
    await this.refresh();
    await this.nextScramble(); // zerado acima, então é preciso pedir outro, mesmo que a gravação tenha falhado
  }

  async switchSession(id: string): Promise<void> {
    if (id === this.profile.currentSessionId || !this.sessions.some((s) => s.id === id)) return;
    this.clearScramble(); // antes da gravação, como em createSession
    await this.write(() => this.repo.saveProfile({ currentSessionId: id }));
    await this.refresh();
    await this.nextScramble();
  }

  async renameSession(id: string, name: string): Promise<void> {
    await this.write(() => this.repo.renameSession(id, name));
    await this.refresh();
  }

  // Se a sessão apagada era a atual, a primeira que sobrou assume (ou uma de 3×3 nova, se não sobrou nenhuma).
  async deleteSession(id: string): Promise<void> {
    const wasCurrent = id === this.profile.currentSessionId;
    if (wasCurrent) this.clearScramble(); // antes da gravação, como em createSession e switchSession
    const ok = await this.write(() => this.repo.deleteSession(id));
    await this.refresh();
    const replaced = ok && !this.currentSession && (await this.write(() => this.ensureSession()));
    if (wasCurrent || replaced) await this.nextScramble();
  }

  // Troca tudo pela cópia escolhida. Antes, a fila precisa estar vazia: um solve que ainda não foi gravado ficaria de fora da troca,
  // e uma gravação presa nunca termina, então com ela a troca é recusada direto.
  async restoreFromBackup(id: string): Promise<boolean> {
    if (!this.saveStalled) await this.saves.flush();
    if (this.saveStalled || this.saves.pending() > 0) {
      this.showToast(T.data.restoreBlocked);
      return false;
    }
    await restoreBackup(this.repo, id, this.now());
    await this.reload();
    await this.nextScramble(); // a cópia pode ter trazido outra sessão, de outro evento
    return true;
  }

  // Exportação de emergência: o que está gravado no banco, mais o que a fila ainda segura (com os mesmos ids). Se o banco falha
  // ou não responde em STALL_MS (IndexedDB travado), o que está na memória é o que a pessoa viu por último.
  async exportData(): Promise<KlickExport> {
    const pending = this.saves.pendingItems().map((s) => this.solveOf(s));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const stored = await Promise.race([
        this.repo.exportAll(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('exportAll não respondeu a tempo')), STALL_MS);
        }),
      ]);
      return { ...stored, solves: withPending(stored.solves, pending) };
    } catch {
      return {
        format: 'klick',
        version: 1,
        exportedAt: this.now(),
        sessions: $state.snapshot(this.sessions),
        solves: withPending($state.snapshot(this.solves), pending),
        profile: $state.snapshot(this.profile),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const ok = await this.write(async () => {
      this.profile = await this.repo.saveProfile({ settings: patch });
    });
    if (ok) this.applyPrefs();
    await this.refresh();
  }

  async updateProfile(patch: Partial<Omit<Profile, 'settings'>>): Promise<void> {
    await this.write(async () => {
      this.profile = await this.repo.saveProfile(patch);
    });
    await this.refresh();
  }

  // Tira o embaralhamento da tela e invalida os pedidos em voo: o que chegar depois não é mais deste evento.
  private clearScramble(): void {
    this.scrambleRequest++;
    this.scramble = '';
    this.scrambleError = false;
  }

  async nextScramble(): Promise<void> {
    const event = this.event;
    this.clearScramble();
    const request = this.scrambleRequest;
    try {
      const next = await this.queue.next(event);
      // Um pedido mais novo (outra sessão, outro evento) já passou por aqui: este embaralhamento não é mais o da tela.
      if (request === this.scrambleRequest) this.scramble = next;
    } catch {
      if (request === this.scrambleRequest) this.scrambleError = true;
    }
  }

  // Ajustes do aparelho nos atributos da raiz: o CSS da casca lê estes atributos.
  applyPrefs(): void {
    const { theme, reducedMotion, mobileArm } = this.profile.settings;
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    root.dataset.reducedMotion = String(reducedMotion === 'always' || mediaMatches('(prefers-reduced-motion: reduce)'));
    root.dataset.arm = mobileArm;
  }

  // Zera a região e põe o texto depois de um intervalo: o leitor de tela anuncia de novo mesmo que o texto se repita.
  announce(text: string): void {
    this.live = '';
    clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => {
      this.live = text;
    }, LIVE_DELAY_MS);
  }

  showToast(text: string, action?: string, onAction?: () => void, ms: number = TOAST_MS): void {
    this.toast = { text, action, onAction };
    this.announce(text); // o aviso também vai para a região aria-live: o leitor de tela não pode perdê-lo
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = null;
    }, ms);
  }

  async dismissExportReminder(): Promise<void> {
    this.exportReminder = false;
  }

  // Uma escrita pedida pela pessoa: se falha, o aviso aparece e a operação não é dada como feita. Nada some em silêncio.
  private async write(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch {
      this.showToast(T.data.saveFailed);
      return false;
    }
  }

  private undoLabel(): string {
    return mediaMatches('(pointer: coarse)') ? T.toast.undoTouch : T.toast.undo;
  }

  // Tira o desfazer pendente e, se o aviso dele ainda está na tela, tira o aviso também (identidade da função, não do texto).
  private closeUndo(): void {
    const action = this.undoAction;
    this.undo = null;
    this.undoAction = null;
    if (action && this.toast?.onAction === action) this.toast = null;
  }

  // Um solve da fila como ele seria gravado (exportação de emergência): as datas são o instante do solve.
  private solveOf(s: NewSolve): Solve {
    const at = Number.isFinite(s.at) ? s.at : this.now();
    return {
      id: s.id ?? newId(this.now()),
      sessionId: s.sessionId,
      event: s.event,
      ms: s.ms,
      penalty: s.penalty,
      at,
      scramble: s.scramble,
      note: '',
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    };
  }

  // Uma gravação em voo. Passado STALL_MS sem resposta, o aviso fixo sai e o banco é reaberto; a gravação continua esperando, e o
  // solve segue na fila até ela responder (nada se perde). Quando ela responde, o aviso sai.
  private async saveWatched(s: NewSolve): Promise<Solve> {
    const stall: ReturnType<typeof setTimeout> = setTimeout(() => this.stalled(), STALL_MS);
    try {
      return await this.repo.addSolve(s);
    } finally {
      clearTimeout(stall);
      this.saveStalled = false;
    }
  }

  private stalled(): void {
    this.saveStalled = true;
    this.announce(T.data.saveFailed);
    void this.reopenRepo();
  }

  // Uma reabertura por vez: quem pede enquanto ela não termina recebe a mesma. Se falha, o repositório antigo segue.
  private reopenRepo(): Promise<void> {
    const open = this.reopenDb;
    if (!open) return Promise.resolve();
    if (!this.reopening) {
      this.reopening = Promise.resolve()
        .then(open)
        .then((next) => this.useRepo(next))
        .catch(() => undefined) // sem conexão nova, a fila tenta de novo com o repositório que tem e o aviso fixo continua
        .finally(() => {
          this.reopening = null;
        });
    }
    return this.reopening;
  }

  // Troca o repositório pela conexão nova. A leitura que vem depois traz o que outra aba gravou enquanto a conexão antiga estava morta.
  private useRepo(next: Repository): void {
    this.repo = next;
    this.subscribe();
    void this.refresh();
  }

  // Um só ouvinte de mudanças, do repositório atual: trocar o repositório tira o ouvinte do antigo.
  private subscribe(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.repo.onChange(() => {
      void this.refresh();
    });
  }

  // Sem sessão atual (a gravada sumiu, ou o banco estava vazio): escolhe a primeira, ou cria uma de 3×3, e grava a escolha.
  private async ensureSession(): Promise<Session> {
    const current = this.currentSession;
    if (current) return current;
    const session = this.sessions[0] ?? (await this.repo.createSession({ event: DEFAULT_EVENT }));
    await this.repo.saveProfile({ currentSessionId: session.id });
    await this.reload();
    return this.currentSession ?? session;
  }

  private recordSaved(solve: Solve): Promise<void> {
    let done = this.afterSaves.get(solve);
    if (!done) {
      done = this.serial(() => this.afterSave(solve));
      this.afterSaves.set(solve, done);
    }
    return done;
  }

  // As contas de um solve gravado: entra na lista, soma nos contadores e roda o que o plano pede. Não rejeita: cada falha vira aviso.
  private async afterSave(solve: Solve): Promise<void> {
    this.upsertSolve(solve);
    try {
      const counted = countSolveSaved(this.meta ?? (await this.repo.getMeta()));
      this.meta = counted; // antes de gravar: se a gravação falhar, a contagem em memória continua certa
      this.meta = await this.repo.saveMeta(counters(counted));
      const plan = planAfterSolve(counted, await this.folderConfigured());
      if (plan.backup) await this.backup(plan.backup);
      if (plan.remindExport) this.exportReminder = true;
      if (plan.folderSave) await this.copyToFolder();
    } catch {
      this.showToast(T.data.saveFailed);
    }
  }

  // Um solve que já está na lista não entra de novo (a leitura pode tê-lo trazido antes).
  private upsertSolve(solve: Solve): void {
    if (solve.deletedAt !== null || this.solves.some((s) => s.id === solve.id)) return;
    this.solves = [...this.solves, solve].sort(bySolveTime);
  }

  private async backup(reason: 'auto50' | 'daily'): Promise<void> {
    try {
      await createBackup(this.repo, reason, this.now());
      this.meta = await this.repo.getMeta();
    } catch {
      this.showToast(T.data.saveFailed); // a contagem não zera: a próxima tentativa insiste
    }
  }

  private async copyToFolder(): Promise<void> {
    try {
      const handle = (await this.repo.getFolderHandle()) as DirHandleLike | null;
      if (!handle) return;
      const now = this.now();
      const text = toKlickJson(await this.repo.exportAll({ includeDeleted: false }));
      // Sem permissão a pasta fica como está: a cópia continua devida e a próxima tentativa a faz.
      if (!(await saveToFolder(handle, backupFileName(now), text, { ask: false }))) return;
      this.meta = await this.repo.saveMeta({ solvesSinceFolderSave: 0, lastFolderSaveAt: now, lastFolderSaveDay: dayKey(now) });
    } catch {
      this.showToast(T.data.saveFailed);
    }
  }

  private async folderConfigured(): Promise<boolean> {
    return (await this.repo.getFolderHandle()) !== null;
  }
}

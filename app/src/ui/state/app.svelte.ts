// Estado do app: o que a interface lê (sessões, solves, perfil, meta, aba, embaralhamento, avisos, diálogo aberto).
// Runes numa classe: os campos são $state e os derivados são getters. Só applyPrefs toca no DOM (atributos da raiz).
//
// Duas coisas andam numa fila única, na ordem em que foram pedidas: as leituras do banco (reload) e as contas depois de cada
// solve gravado (afterSave). Assim, uma leitura que começou antes de um solve gravado não volta a esconder esse solve.
import { dayKey } from '../../core/stats';
import { defaultSettings } from '../../core/types';
import type { EventId, Meta, Penalty, Profile, Session, Settings, Solve } from '../../core/types';
import { backupFileName, type DirHandleLike, saveToFolder } from '../../data/folder';
import type { Repository } from '../../data/repository';
import {
  countSolveSaved,
  createBackup,
  createSaveQueue,
  planAfterSolve,
  planOnOpen,
  requestPersistence,
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
}

const DEFAULT_EVENT: EventId = '333';
const UNDO_MS = 6000; // janela de Desfazer: a mesma do aviso que a oferece
const TOAST_MS = 6000;
const LIVE_DELAY_MS = 50; // o leitor de tela só anuncia de novo se o texto mudar depois de um intervalo

const compareId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
// A ordem do repositório: o instante e, empatando, o id.
const bySolveTime = (a: Solve, b: Solve): number => a.at - b.at || compareId(a.id, b.id);

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
  toast = $state<Toast | null>(null);
  live = $state(''); // texto da região aria-live
  dialog = $state<DialogId | null>(null);
  v1Available = $state(false); // há dados da v1 ainda não oferecidos
  exportReminder = $state(false); // mostrar o lembrete de exportar

  private readonly repo: Repository;
  private readonly queue: ScrambleQueue;
  private readonly now: () => number;
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
    this.storage = deps.storage === undefined ? defaultStorage() : deps.storage;
    this.storageManager = deps.storageManager === undefined ? defaultStorageManager() : deps.storageManager;
    // A arrow function: a fila grava pelo addSolve atual do repositório, não pelo que existia quando ela foi criada.
    this.saves = createSaveQueue((s) => this.repo.addSolve(s), {
      onChange: (pending) => {
        this.savePending = pending;
        // Depois de uma falha, a fila esvaziou: a pessoa fica sabendo que está tudo salvo.
        if (pending === 0) this.announce(T.data.saved);
      },
      onSaved: (s) => {
        void this.recordSaved(s);
      },
    });
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
    this.repo.onChange(() => {
      void this.refresh();
    });
    await this.ensureSession();
    const meta = this.meta ?? (await this.repo.getMeta());
    const folder = await this.folderConfigured();
    const plan = planOnOpen(meta, this.now(), folder);
    if (plan.backup) await this.backup(plan.backup);
    if (plan.folderSave) await this.copyToFolder();
    try {
      await this.repo.purgeTrash(TRASH_MS);
    } catch {
      this.showToast(T.data.saveFailed);
    }
    this.v1Available = !meta.v1ImportOffered && hasV1(this.storage);
    await this.nextScramble();
    this.queue.prefetch(this.event);
    await this.reload();
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
    const ok = await this.write(async () => {
      const session = await this.repo.createSession({ event, name });
      await this.repo.saveProfile({ currentSessionId: session.id });
    });
    await this.refresh();
    if (ok) await this.nextScramble();
  }

  async switchSession(id: string): Promise<void> {
    if (id === this.profile.currentSessionId || !this.sessions.some((s) => s.id === id)) return;
    const ok = await this.write(() => this.repo.saveProfile({ currentSessionId: id }));
    await this.refresh();
    if (ok) await this.nextScramble();
  }

  async renameSession(id: string, name: string): Promise<void> {
    await this.write(() => this.repo.renameSession(id, name));
    await this.refresh();
  }

  // Se a sessão apagada era a atual, a primeira que sobrou assume (ou uma de 3×3 nova, se não sobrou nenhuma).
  async deleteSession(id: string): Promise<void> {
    const ok = await this.write(() => this.repo.deleteSession(id));
    await this.refresh();
    if (!ok || this.currentSession) return;
    if (await this.write(() => this.ensureSession())) await this.nextScramble();
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

  async nextScramble(): Promise<void> {
    const event = this.event;
    const request = ++this.scrambleRequest;
    this.scramble = '';
    this.scrambleError = false;
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
    if (this.solves.some((s) => s.id === solve.id)) return;
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

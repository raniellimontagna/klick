// Estado do app: o que a interface lê (sessões, solves, perfil, meta, aba, embaralhamento, avisos, diálogo aberto).
// Runes numa classe: os campos são $state e os derivados são getters. Só applyPrefs toca no DOM (atributos da raiz).
//
// Duas coisas andam numa fila única, na ordem em que foram pedidas: as leituras do banco (reload) e as contas depois de cada
// solve gravado (afterSave). Assim, uma leitura que começou antes de um solve gravado não volta a esconder esse solve.
import { dayKey } from '../../core/stats';
import { defaultSettings } from '../../core/types';
import type { EventId, Meta, Penalty, Profile, Session, Solve } from '../../core/types';
import type { BackupRecord } from '../../data/db';
import { backupFileName, type DirHandleLike, pickFolder, saveToFolder } from '../../data/folder';
import { newId } from '../../data/ids';
import type { KlickExport, NewSolve, ProfilePatch, Repository } from '../../data/repository';
import {
  countSolveSaved,
  createBackup,
  createSaveQueue,
  planAfterSolve,
  planOnOpen,
  type PersistResult,
  requestPersistence,
  restoreBackup,
  type SafetyPlan,
  type SaveQueue,
  type StorageLike,
  storageStatus as readStorage,
  TRASH_MS,
} from '../../data/safety';
import {
  type CsTimerSession,
  csTimerToKlick,
  readV1,
  readV1Invalid,
  toCsTimerJson,
  toKlickJson,
  v1ToKlick,
} from '../../data/transfer';
import type { ScrambleQueue } from '../../scramble/queue';
import { T, TRAIL } from '../../strings';
import { downloadText } from '../download';

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

export type ExportFormat = 'klick' | 'cstimer';
// Uma exportação que o navegador não baixou: o texto vai para o ExportDialog, que a pessoa copia.
export interface PendingExport {
  format: ExportFormat;
  text: string;
}
// O que uma importação trouxe, para o resumo: solves gravados, os que já existiam e o que ficou de fora.
export interface ImportSummary {
  solves: number;
  existing: number;
  skippedSessions: number; // sessões sem evento (csTimer) ou de um puzzle que o Klick não tem (versão anterior)
  unreadable: number; // registros da versão anterior que não puderam ser lidos
  offerNotMarked?: boolean; // os solves entraram, mas a marca "oferta feita" não foi gravada (a importação pode ser refeita)
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
// Passado este prazo, a tentativa desiste (TimeoutError) e a fila tenta de novo, com o mesmo id, no repositório atual.
const SAVE_DEADLINE_MS = 8000;
// Uma reabertura que não responde nesse prazo é desistida: o repositório atual segue e a próxima falha pode pedir outra.
const REOPEN_DEADLINE_MS = 8000;
// A restauração inteira (ler a cópia, trocar, recarregar). Passado o prazo, a chamada devolve false com o aviso, mas o portão segue
// fechado até a troca terminar de verdade: as gravações ficam na memória, sem cair no meio de uma troca tardia.
const RESTORE_DEADLINE_MS = 30000;
// Erros que dizem que a conexão morreu (o iOS derruba a conexão com o app em segundo plano), ou que a tentativa não teve resposta
// no prazo. Cota cheia não está nesta lista.
const CONNECTION_ERRORS: readonly string[] = ['InvalidStateError', 'UnknownError', 'TransactionInactiveError', 'TimeoutError'];

const compareId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
// A ordem do repositório: o instante e, empatando, o id.
const bySolveTime = (a: Solve, b: Solve): number => a.at - b.at || compareId(a.id, b.id);

const isConnectionError = (err: unknown): boolean => {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined;
  return typeof name === 'string' && CONNECTION_ERRORS.includes(name);
};

// Junta os solves gravados com os que a fila ainda segura, na ordem de tempo, sem repetir um id (o gravado vale).
const withPending = (stored: Solve[], pending: Solve[]): Solve[] => {
  const byId = new Map(stored.map((solve) => [solve.id, solve] as const));
  for (const solve of pending) if (!byId.has(solve.id)) byId.set(solve.id, solve);
  return [...byId.values()].sort(bySolveTime);
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

// Quem tem dados da v1 para oferecer: os que batem, ou só registros que não batem (a oferta mostra quantos ficaram de fora). Uma
// leitura que lança é tratada como "não há nada".
function hasV1(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return readV1(storage) !== null || readV1Invalid(storage) > 0;
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
  pendingExport = $state<PendingExport | null>(null); // texto de uma exportação que o navegador não baixou (ExportDialog)
  // A importação de arquivo (ui/import-flow.ts) é uma só, para os dois seletores: o estado vive aqui, e o ImportDialog o mostra.
  importDraft = $state<CsTimerSession[] | null>(null); // sessões de um csTimer à espera de o evento ser escolhido
  importSummary = $state<string[] | null>(null); // linhas do resumo da última importação
  importBusy = $state(false); // uma importação (arquivo ou versão anterior) está gravando
  timerBusy = $state(false); // o timer está na inspeção, armado, pronto ou rodando (a tela atualiza): o guia de instalação e o lembrete esperam

  private repo: Repository; // troca quando a conexão é reaberta (useRepo)
  private readonly queue: ScrambleQueue;
  private readonly now: () => number;
  private readonly reopenDb: (() => Promise<Repository>) | undefined;
  private unsubscribe: (() => void) | null = null;
  private reopening: Promise<void> | null = null; // a reabertura em andamento, reaproveitada por quem pede enquanto ela não termina
  private restoring: Promise<void> | null = null; // o portão: fechado enquanto a troca não acaba (mesmo depois do prazo); as gravações esperam
  private restoreBusy = false; // uma restauração por vez, desde o começo (inclui a espera pela fila)
  private importing: Promise<ImportSummary | null> | null = null; // a importação que está gravando: a restauração espera por ela
  private persistAsked = false; // o pedido automático de proteção já saiu nesta sessão (uma vez, mesmo sem resposta ainda)
  private attempts = 0; // tentativas de gravação já começadas: só a mais recente mexe em saveStalled
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

  // Uma restauração em curso, ou com o portão ainda fechado (passou do prazo e a troca segue): não se começa outra.
  get restoreRunning(): boolean {
    return this.restoreBusy || this.restoring !== null;
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

  private serial<R>(job: () => Promise<R>): Promise<R> {
    const run = this.chain.then(job);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // Um solve nunca se perde. Se não há sessão para atribuí-lo (ensureSession falhou), ele vai para a fila com a sessão atual ou
  // com um id de sessão novo: a fila tenta de novo, e o aviso fixo (savePending) fica na tela até gravar. Devolve null só quando
  // o solve ficou na fila; o próximo embaralhamento não segura a reação.
  async addSolve(r: { ms: number; penalty: Penalty; at: number }): Promise<Solve | null> {
    this.closeUndo(); // um solve novo encerra o desfazer pendente
    const session = await this.ensureSession().catch(() => null);
    if (!session) this.showToast(T.data.saveFailed);
    const solve = await this.saves.enqueue({
      id: newId(this.now()), // o id é de quem grava: as tentativas seguintes usam este mesmo, e a gravação não duplica
      sessionId: session?.id ?? this.currentSession?.id ?? this.profile.currentSessionId ?? newId(this.now()),
      event: session?.event ?? this.event,
      ms: r.ms,
      penalty: r.penalty,
      at: r.at,
      scramble: this.scramble,
    });
    if (solve) await this.recordSaved(solve);
    void this.nextScramble();
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

  // Troca tudo pela cópia escolhida. Uma por vez: a segunda sai com false sem tocar em nada. Antes, espera uma reabertura em curso (a
  // troca usa o repositório que ela devolver) e a fila precisa estar vazia: um solve que ainda não foi gravado ficaria de fora da
  // troca, e uma gravação presa nunca termina, então com ela a troca é recusada direto.
  async restoreFromBackup(id: string): Promise<boolean> {
    // Enquanto uma corre, ou o portão ainda está fechado por uma troca que passou do prazo, a chamada sai com false.
    if (this.restoreBusy || this.restoring) return false;
    this.restoreBusy = true;
    try {
      return await this.restoreNow(id);
    } finally {
      this.restoreBusy = false;
    }
  }

  private async restoreNow(id: string): Promise<boolean> {
    if (this.reopening) await this.reopening;
    // Uma importação que já está gravando termina antes da troca: a cópia de segurança (a pre-restore) leva o que ela trouxe, e o
    // replaceAll não cai no meio dela. Imports que chegam agora são recusados (importJob).
    if (this.importing) await this.importing;
    if (!this.saveStalled) await this.saves.flush();
    if (this.saveStalled || this.saves.pending() > 0) {
      this.showToast(T.data.restoreBlocked);
      return false;
    }
    // O portão: as gravações que chegarem esperam (saveWatched) até a troca acabar, para não caírem no meio do replaceAll. Ele só
    // abre quando a troca termina de verdade (com sucesso ou com erro), mesmo que a chamada já tenha devolvido false pelo prazo.
    let openGate!: () => void;
    this.restoring = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    let ownsStall = false; // o aviso de gravação presa que esta troca acendeu: só ela o apaga
    const finish = (): void => {
      this.restoring = null;
      openGate();
      if (ownsStall) {
        this.saveStalled = false;
        ownsStall = false;
      }
    };
    const section = this.replaceFromBackup(id);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<'expired'>((resolve) => {
      deadline = setTimeout(() => resolve('expired'), RESTORE_DEADLINE_MS);
    });
    let outcome: 'done' | 'expired';
    try {
      outcome = await Promise.race([section.then(() => 'done' as const), expired]);
    } catch (err) {
      clearTimeout(deadline);
      finish();
      throw err;
    }
    clearTimeout(deadline);
    if (outcome === 'done') {
      finish();
      await this.nextScramble(); // a cópia pode ter trazido outra sessão, de outro evento
      return true;
    }
    // Passou do prazo: o aviso acende (as gravações ficam na fila e na memória) e a chamada devolve false. A troca continua; quando
    // termina, o portão abre e o aviso sai. Se ela termina com erro, nada mudou (o replaceAll é uma transação): só o portão abre.
    ownsStall = !this.saveStalled;
    this.saveStalled = true;
    this.showToast(T.data.restoreTimeout);
    void section.then(
      async () => {
        finish();
        await this.nextScramble();
      },
      () => finish(),
    );
    return false;
  }

  // A troca em si: lê a cópia, grava por cima de tudo e recarrega. Lê o repositório atual no momento da chamada.
  private async replaceFromBackup(id: string): Promise<void> {
    await restoreBackup(this.repo, id, this.now());
    await this.reload();
  }

  // Exportação de emergência: o que está gravado no banco, mais o que a fila ainda segura (com os mesmos ids). Se o banco falha
  // ou não responde em STALL_MS (IndexedDB travado), o que está na memória é o que a pessoa viu por último.
  async exportData(): Promise<KlickExport> {
    // A fila é lida no começo e de novo depois da espera: um solve que entrou enquanto o banco respondia também sai no export.
    const before = this.pendingSolves();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const stored = await Promise.race([
        this.repo.exportAll(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('exportAll não respondeu a tempo')), STALL_MS);
        }),
      ]);
      return { ...stored, solves: withPending(stored.solves, [...before, ...this.pendingSolves()]) };
    } catch {
      return {
        format: 'klick',
        version: 1,
        exportedAt: this.now(),
        sessions: $state.snapshot(this.sessions),
        solves: withPending($state.snapshot(this.solves), [...before, ...this.pendingSolves()]),
        profile: $state.snapshot(this.profile),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private pendingSolves(): Solve[] {
    return this.saves.pendingItems().map((s) => this.solveOf(s));
  }

  // --- Seus dados: armazenamento, cópias, lixeira, exportar e importar. A tela chama só estes métodos. ---

  // Armazenamento: protegido ou não, e o espaço em uso. Não rejeita: sem a API, persisted vem null.
  storageInfo() {
    return readStorage(this.storageManager);
  }

  // "Proteger meus dados": pede ao navegador e grava o pedido. Se o navegador lança, vira aviso e a resposta é null.
  async requestProtection(): Promise<PersistResult | null> {
    let result: PersistResult;
    try {
      result = await requestPersistence(this.storageManager);
    } catch {
      this.showToast(T.dados.persistFailed);
      return null;
    }
    await this.updateMeta({ persistRequested: true });
    return result;
  }

  listBackups(): Promise<BackupRecord[]> {
    return this.repo.listBackups();
  }

  listTrash(): Promise<{ sessions: Session[]; solves: Solve[] }> {
    return this.repo.listTrash();
  }

  // Devolve um item da lixeira. Uma sessão traz de volta os solves excluídos dela (o repositório faz isso na mesma transação).
  async restoreFromTrash(item: { kind: 'solve' | 'session'; id: string }): Promise<boolean> {
    const ok = await this.write(() => (item.kind === 'solve' ? this.repo.restoreSolve(item.id) : this.repo.restoreSession(item.id)));
    await this.refresh();
    return ok;
  }

  // Exporta para um arquivo. Se o navegador baixa, a exportação conta (zera o lembrete). Se não baixa (iframe, ou o download falhou),
  // o texto vai para o ExportDialog, e a exportação só conta quando a pessoa copia o texto.
  async exportFile(format: ExportFormat): Promise<void> {
    const data = await this.exportData();
    const stamp = backupFileName(this.now()).replace(/^klick-|\.json$/g, ''); // AAAA-MM-DD-HHmm, o mesmo carimbo das cópias da pasta
    const klick = format === 'klick';
    const text = klick ? toKlickJson(data) : toCsTimerJson(data.sessions, data.solves);
    const name = klick ? `klick-${stamp}.json` : `klick-csTimer-${stamp}.txt`;
    if (downloadText(name, text, klick ? 'application/json' : 'text/plain')) {
      await this.markExported();
      return;
    }
    // O ExportDialog é da tela Ajustes (Seus dados): a exportação que não baixa leva para lá, de qualquer aba.
    this.pendingExport = { format, text };
    this.tab = 'ajustes';
    this.dialog = 'export';
  }

  // Fim do tour (fechar por qualquer caminho, ou uma das opções): a primeira vez não se repete.
  finishOnboarding(): Promise<void> {
    return this.updateProfile({ onboarded: true });
  }

  // Depois de exportar (download ou cópia): zera o contador do lembrete e grava quando foi. Devolve se a gravação deu certo: quem
  // diz "copiado" só deve dizer isso se deu (a falha já saiu como aviso de salvar).
  async markExported(): Promise<boolean> {
    this.exportReminder = false;
    return this.write(() =>
      this.serial(async () => {
        this.meta = await this.repo.saveMeta({ solvesSinceExport: 0, lastExportAt: this.now() });
      }),
    );
  }

  // Se já há uma pasta escolhida para as cópias automáticas.
  hasBackupFolder(): Promise<boolean> {
    return this.folderConfigured();
  }

  // Escolhe a pasta (o seletor é do navegador, então vem de um clique) e grava a primeira cópia nela. Cancelar não muda nada.
  async chooseBackupFolder(): Promise<boolean> {
    let handle: DirHandleLike | null;
    try {
      handle = await pickFolder();
    } catch {
      this.showToast(T.dados.folderFailed);
      return false;
    }
    if (!handle) return false;
    const chosen = handle;
    if (!(await this.write(() => this.repo.saveFolderHandle(chosen)))) return false;
    await this.copyToFolder();
    await this.refresh();
    return true;
  }

  // Uma importação por vez, na fila das leituras: dois cliques no mesmo botão não gravam os mesmos solves duas vezes (os ids são
  // novos). A importação é uma transação (importAll): se falha, nada entrou e o aviso sai; devolve null nesse caso. Durante uma
  // restauração, a importação é recusada com aviso: a troca substitui tudo, e um import no meio dela se perderia.
  private async importJob(job: () => Promise<ImportSummary>): Promise<ImportSummary | null> {
    if (this.restoreRunning) {
      this.showToast(T.dados.importWhileRestoring);
      return null;
    }
    const run = this.serial(async () => {
      try {
        return await job();
      } catch {
        this.showToast(T.dados.importFailed);
        return null;
      }
    });
    this.importing = run;
    let summary: ImportSummary | null;
    try {
      summary = await run;
    } finally {
      if (this.importing === run) this.importing = null;
    }
    await this.refresh();
    return summary;
  }

  // Um arquivo do Klick: junta por id. Nada é apagado; o que já existe e não é mais novo fica como está.
  importKlick(data: KlickExport): Promise<ImportSummary | null> {
    return this.importJob(async () => {
      const report = await this.repo.importAll(data);
      return { solves: report.solvesAdded + report.solvesUpdated, existing: report.skipped, skippedSessions: 0, unreadable: 0 };
    });
  }

  // Sessões de um arquivo do csTimer. `mapping` traz o evento escolhido para cada sessão sem evento (pela chave dela no arquivo);
  // as que ficam sem evento não entram. Os solves viram registros novos; os que já existem (até os da lixeira) não entram de novo.
  importCsTimer(sessions: CsTimerSession[], mapping: Record<string, EventId | undefined>): Promise<ImportSummary | null> {
    return this.importJob(async () => {
      const [existingSessions, existingSolves] = await Promise.all([
        this.repo.listSessions({ includeDeleted: true }),
        this.repo.listSolves({ includeDeleted: true }),
      ]);
      const now = this.now();
      const plan = csTimerToKlick(sessions, mapping, { now, newId: () => newId(now), existingSessions, existingSolves });
      const report = await this.repo.importAll({
        format: 'klick',
        version: 1,
        exportedAt: now,
        sessions: plan.sessions,
        solves: plan.solves,
        profile: null,
      });
      return { solves: report.solvesAdded, existing: plan.duplicates, skippedSessions: plan.skippedSessions, unreadable: 0 };
    });
  }

  // Dados da versão anterior (a chave do localStorage antigo). Só o que bate é importado; o que não bate é contado em unreadable.
  async importV1(): Promise<ImportSummary | null> {
    // A contagem vem antes: um arquivo sem nenhum registro legível ainda tem o que avisar, e a oferta continua na tela.
    const unreadable = readV1Invalid(this.storage);
    const v1 = readV1(this.storage);
    if (!v1) {
      if (unreadable > 0) return { solves: 0, existing: 0, skippedSessions: 0, unreadable };
      this.v1Available = false;
      this.showToast(T.dados.nothingV1);
      return null;
    }
    return this.importJob(async () => {
      const [existingSessions, existingSolves] = await Promise.all([
        this.repo.listSessions({ includeDeleted: true }),
        this.repo.listSolves({ includeDeleted: true }),
      ]);
      const now = this.now();
      const plan = v1ToKlick(v1, { now, existingSessions, existingSolves });
      const report = await this.repo.importAll({
        format: 'klick',
        version: 1,
        exportedAt: now,
        sessions: plan.sessions,
        solves: plan.solves,
        profile: null,
      });
      // A marca vai por último. Se ela falha depois de a importação ter entrado, os solves já estão lá: o resumo sai com uma nota,
      // e uma nova importação não duplica nada (os ids são os mesmos).
      let offerMarked = true;
      try {
        await this.repo.saveMeta({ v1ImportOffered: true });
      } catch {
        offerMarked = false;
      }
      if (offerMarked) this.v1Available = false; // sem a marca, a oferta segue na tela: importar de novo é seguro
      return {
        solves: report.solvesAdded,
        existing: plan.duplicates,
        skippedSessions: plan.skippedSessions,
        unreadable,
        offerNotMarked: !offerMarked,
      };
    });
  }

  // Os ajustes podem vir parciais, inclusive o grupo de sons (um só som): o repositório junta com o que está gravado.
  async updateSettings(patch: NonNullable<ProfilePatch['settings']>): Promise<void> {
    const ok = await this.write(async () => {
      this.profile = await this.repo.saveProfile({ settings: patch });
    });
    if (ok) this.applyPrefs();
    await this.refresh();
  }

  // Marcas que a interface grava no meta (guia de instalação dispensado, pedido de proteção). Só os campos dados mudam.
  async updateMeta(patch: Partial<Meta>): Promise<void> {
    await this.write(() =>
      this.serial(async () => {
        this.meta = await this.repo.saveMeta(patch);
      }),
    );
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

  // Uma tentativa de gravação. Antes dela, espera uma restauração em curso (a gravação cai depois do replaceAll, não no meio).
  // Passado STALL_MS sem resposta, o aviso fixo sai e o banco é reaberto. Passado SAVE_DEADLINE_MS, a tentativa falha com
  // TimeoutError: a fila a tenta de novo, com o mesmo id, no repositório atual. Nada se perde: o solve fica na fila até gravar.
  private async saveWatched(s: NewSolve): Promise<Solve> {
    while (this.restoring) await this.restoring;
    const attempt = ++this.attempts;
    const repo = this.repo;
    const stall: ReturnType<typeof setTimeout> = setTimeout(() => this.stalled(), STALL_MS);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => reject(Object.assign(new Error(), { name: 'TimeoutError' })), SAVE_DEADLINE_MS);
    });
    try {
      return await Promise.race([repo.addSolve(s), late]);
    } finally {
      clearTimeout(stall);
      clearTimeout(deadline);
      // Só a tentativa mais recente mexe no aviso: uma anterior que termina tarde não apaga o aviso de uma tentativa presa.
      if (attempt === this.attempts) this.saveStalled = false;
    }
  }

  private stalled(): void {
    this.saveStalled = true;
    this.announce(T.data.saveFailed);
    void this.reopenRepo();
  }

  // Uma reabertura por vez: quem pede enquanto ela não termina recebe a mesma. Se falha, ou não responde em REOPEN_DEADLINE_MS, o
  // repositório antigo segue: a fila tenta de novo com ele e o aviso fixo continua. Uma conexão que responde depois do prazo é fechada.
  private reopenRepo(): Promise<void> {
    const open = this.reopenDb;
    if (!open) return Promise.resolve();
    if (!this.reopening) {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<'late'>((resolve) => {
        deadline = setTimeout(() => resolve('late'), REOPEN_DEADLINE_MS);
      });
      const opening = Promise.resolve().then(open);
      this.reopening = Promise.race([opening, late])
        .then((won) => {
          if (won === 'late') {
            void opening.then((next) => next.close(), () => undefined);
            return;
          }
          this.useRepo(won);
        })
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(deadline);
          this.reopening = null;
        });
    }
    return this.reopening;
  }

  // Troca o repositório pela conexão nova. A leitura que vem depois traz o que outra aba gravou enquanto a conexão antiga estava morta.
  private useRepo(next: Repository): void {
    if (next === this.repo) return; // a reabertura devolveu o mesmo repositório: nada a trocar nem a fechar
    const replaced = this.repo;
    this.repo = next;
    this.subscribe();
    replaced.close(); // a conexão antiga já não é usada por ninguém (as gravações pendentes usam a nova)
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

  // Depois do primeiro solve gravado, pede o armazenamento persistente em silêncio (spec 6.2: nunca ao abrir o app). Sai uma vez por
  // sessão: os solves gravados antes da resposta não pedem de novo. Uma resposta marca o pedido feito; uma rejeição fica para a
  // próxima sessão.
  private askPersistence(): void {
    if (this.persistAsked) return;
    this.persistAsked = true;
    void requestPersistence(this.storageManager)
      .then(() => this.updateMeta({ persistRequested: true }))
      .catch(() => undefined);
  }

  // As contas de um solve gravado: entra na lista, soma nos contadores e roda o que o plano pede. Não rejeita: cada falha vira aviso.
  private async afterSave(solve: Solve): Promise<void> {
    this.upsertSolve(solve);
    try {
      const counted = countSolveSaved(this.meta ?? (await this.repo.getMeta()));
      this.meta = counted; // antes de gravar: se a gravação falhar, a contagem em memória continua certa
      this.meta = await this.repo.saveMeta(counters(counted));
      if (!counted.persistRequested) this.askPersistence();
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

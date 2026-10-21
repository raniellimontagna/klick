// Estado do app: o que a interface lê (sessões, solves, perfil, meta, aba, embaralhamento, avisos, diálogo aberto).
// Runes numa classe: os campos são $state e os derivados são getters. Só applyPrefs toca no DOM (atributos da raiz).
//
// Duas coisas andam numa fila única, na ordem em que foram pedidas: as leituras do banco (reload) e as contas depois de cada
// solve gravado (afterSave). Assim, uma leitura que começou antes de um solve gravado não volta a esconder esse solve.
import { untrack } from 'svelte';
import { cleanDuelName } from '../../core/duel/link';
import { eventInfo } from '../../core/events';
import { createSeasonTracker, defaultSeason, type MarkStatus, planAdvance, seasonKey } from '../../core/season';
import { dayKey, type RECORD_SIZES } from '../../core/stats';
import { isTypedDnf } from '../../core/typed';
import type { CaseSet, TrailStep } from '../../core/trail/types';
import { defaultSettings } from '../../core/types';
import type { Duel, EventId, Meta, Penalty, Practice, Profile, SeasonState, Session, Solve } from '../../core/types';
import type { BackupRecord } from '../../data/db';
import { backupFileName, type DirHandleLike, folderGranted, pickFolder, saveToFolder } from '../../data/folder';
import { defaultSessionId, newId } from '../../data/ids';
import { type ChangeKind, DuelConflictError, type KlickExport, type NewSolve, type ProfilePatch, type Repository } from '../../data/repository';
import {
  countSolveSaved,
  createBackup,
  createSaveQueue,
  planAfterSolve,
  planOnOpen,
  type PersistResult,
  requestPersistence,
  restoreBackup,
  restoreExport,
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
import { isIOS, isStandalone } from '../platform';
import { type ShareFile, shareFile } from '../share';
import { type AccountDeps, AccountState } from './account.svelte';
import { type DuelDeps, DuelState } from './duel.svelte';

export type Tab = 'timer' | 'evolucao' | 'trilha' | 'companion' | 'ajustes';
// Onde a aba Trilha está (spec do sub-projeto 4, seção 8.2): o começo, a aula de uma etapa, um conjunto do treino ou a rodada dele.
// Fica no AppState: a tela da Trilha só existe com a aba aberta, e a pessoa volta ao mesmo lugar.
export type TrailView = { kind: 'home' } | { kind: 'lesson'; step: TrailStep } | { kind: 'set'; set: CaseSet } | { kind: 'round'; set: CaseSet };
// Onde a aba Evolução está (a maquete aprovada do desafio, 9a a 9c): os números de sempre, a lista dos Desafios ou uma partida aberta. Como a
// da Trilha, fica no AppState: "Ver em Desafios", no fim de uma partida, abre a lista de outra aba.
export type EvolucaoView = { kind: 'stats' } | { kind: 'duels' } | { kind: 'duel'; id: string };
// 'duel': a folha da pílula do modo desafio (continuar, sair ou descartar). 'move': a folha de mover solves para outra sessão (app.moveRequest).
// 'solve': o detalhe de um solve (app.solveRequest). 'record': a folha de um recorde da sessão (app.recordRequest).
export type DialogId = 'sessions' | 'shortcuts' | 'onboarding' | 'export' | 'import' | 'backups' | 'trash' | 'install' | 'signin' | 'signout' | 'cloud' | 'deleteAccount' | 'duel' | 'move' | 'solve' | 'record';
// O que a folha de mover move: os ids (a seleção da lista, ou o solve do detalhe), o número do solve no filtro quando é um só (o título
// "Mover o solve #10.471") e quem pediu, avisado quando o lote passou para a outra sessão (a lista sai da seleção). `back`: aberta pelo
// detalhe, devolve o foco à linha da lista de onde o detalhe abriu (ou à que ficou no lugar dela) quando a folha fecha, por qualquer caminho.
export interface MoveRequest {
  ids: string[];
  number?: number;
  done?: () => void;
  back?: () => void;
}
// O solve que o detalhe mostra e de onde a contagem vem: a sessão do filtro da lista ('all': todas as do evento dele), que dá o número
// do solve e as médias que terminam nele. O solve em si é lido ao vivo de app.solves. `back`: devolve o foco à linha da lista de onde ele
// abriu, ou à que ficou no lugar dela (o solve foi excluído, ou saiu do filtro); passa para a folha de mover, se for ela que abre depois.
export interface SolveRequest {
  id: string;
  sessionId: string;
  back?: () => void;
}
// Um recorde do quadro: o melhor single ou a melhor média de 5, 12, 50, 100 ou 1000.
export type RecordKind = 'single' | (typeof RECORD_SIZES)[number];
// O recorde que a folha mostra e de onde ele vem: o evento e a sessão do filtro da lista ('all': todas as do evento). Os solves que o
// formam são lidos ao vivo de app.solves.
export interface RecordRequest {
  kind: RecordKind;
  event: EventId;
  sessionId: string;
}
// "Ver na lista": o último solve da janela do recorde, quantos solves ela tem (as linhas que a lista marca) e o filtro onde ele está. A
// Evolução atende o pedido (ajusta o filtro e o período, e rola a lista) e o apaga.
export interface ListJump {
  id: string;
  span: number;
  event: EventId;
  sessionId: string;
}
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
  share?: ShareFile | null; // exportar pela folha de compartilhar (padrão: a do sistema no iPhone e no iPad; nos outros, o download)
  account?: AccountDeps | null; // a conta e o sync (sub-projeto 5a); sem eles (os testes de antes), nada de conta existe
  duel?: DuelDeps; // o desafio por link: o gerador dos sete embaralhamentos (padrão: o cubing.js)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// A promessa, ou TimeoutError se ela não termina dentro do prazo (ela continua; o resultado tardio é ignorado).
async function within<R>(promise: Promise<R>, ms: number): Promise<R> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('sem resposta'), { name: 'TimeoutError' })), ms);
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    clearTimeout(timer);
  }
}

// 'done' se a promessa termina (com sucesso ou erro) dentro do prazo; 'late' se não.
async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<'done' | 'late'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), ms);
  });
  try {
    return await Promise.race([promise.then(() => 'done' as const, () => 'done' as const), late]);
  } finally {
    clearTimeout(timer);
  }
}

// A sessão que recebe mais solves numa importação (no empate, a primeira que aparece). null quando não há solve.
function busiestSession(solves: readonly { sessionId: string }[]): string | null {
  const counts = new Map<string, number>();
  for (const s of solves) counts.set(s.sessionId, (counts.get(s.sessionId) ?? 0) + 1);
  let best: string | null = null;
  for (const [id, n] of counts) if (best === null || n > counts.get(best)!) best = id;
  return best;
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
  missed: number; // solves que a conta do arquivo tinha como novos e o repositório deixou de fora (um id repetido): o resumo diz quantos
  offerNotMarked?: boolean; // os solves entraram, mas a marca "oferta feita" não foi gravada (a importação pode ser refeita)
  settingsApplied?: boolean; // o arquivo do Klick trouxe perfil: os ajustes e o progresso dele valem agora
  repeated?: number; // solves com o mesmo id repetido no arquivo do Klick: entrou a versão mais nova, e estes ficaram de fora
  refused?: number; // registros que o sync recusaria (um id que não serve de chave, por exemplo): ficaram de fora (spec 6.6)
}

// O que o "Desfazer" desfaz (o aviso e a tecla Z): uma exclusão (de um solve ou de um lote) volta da lixeira; uma mudança de sessão volta
// cada solve para a sessão de onde ele saiu.
type UndoAction = { kind: 'delete'; ids: string[] } | { kind: 'move'; moves: { id: string; from: string }[] };

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
// Uma leitura do banco que passa de READ_DEADLINE_MS sem resposta pede uma sondagem (uma leitura mínima, do meta): se o banco responde
// em PROBE_MS, a leitura só está lenta (histórico grande, celular lento) e é esperada; se não, a conexão está morta: a leitura desiste
// (TimeoutError), a fila segue e o banco é reaberto. Sem isso, uma leitura presa segurava a fila inteira para sempre.
const READ_DEADLINE_MS = 8000;
const PROBE_MS = 3000;
// As contas de um solve gravado (ler e gravar o meta) são mínimas: sem resposta neste prazo, desistem com aviso, e a fila segue.
const COUNT_DEADLINE_MS = 8000;
// As cópias depois de um solve podem demorar de verdade com um histórico grande; o prazo largo só impede que prendam a fila para sempre.
const AFTER_COUNT_DEADLINE_MS = 60000;
// Uma leitura que falha na hora com erro de conexão reabre o banco, mas no máximo uma vez neste intervalo: se as leituras falham sempre
// (um registro estragado) e o banco abre, sem o limite o app reabriria em laço, com um aviso a cada volta.
const READ_REOPEN_EVERY_MS = 10000;
// A restauração espera uma importação em andamento terminar, mas não para sempre.
const IMPORT_WAIT_MS = 8000;
// A restauração inteira (ler a cópia, trocar, recarregar). Passado o prazo, a chamada devolve false com o aviso, mas o portão segue
// fechado até a troca terminar de verdade: as gravações ficam na memória, sem cair no meio de uma troca tardia.
const RESTORE_DEADLINE_MS = 30000;
// Erros que dizem que a conexão morreu (o iOS derruba a conexão com o app em segundo plano), ou que a tentativa não teve resposta
// no prazo. Cota cheia não está nesta lista.
const CONNECTION_ERRORS: readonly string[] = ['InvalidStateError', 'UnknownError', 'TransactionInactiveError', 'TimeoutError'];

const compareId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
// A ordem do repositório: o instante e, empatando, o id.
const bySolveTime = (a: Solve, b: Solve): number => a.at - b.at || compareId(a.id, b.id);
const byPracticeTime = (a: Practice, b: Practice): number => a.at - b.at || compareId(a.id, b.id);

// Onde um solve entra na lista ordenada: a primeira posição que não vem antes dele (busca binária, sem reordenar a lista).
function lowerBound(list: readonly Solve[], solve: Solve): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bySolveTime(list[mid], solve) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Os tipos que a memória do app lê do banco (um aviso 'all' são todos). O aviso 'sync' é o estado da conta: a conta o relê, e nenhum
// dado da tela muda por ele.
type ReadKind = Exclude<ChangeKind, 'all' | 'sync'>;
const ALL_READS: readonly ReadKind[] = ['sessions', 'solves', 'profile', 'meta', 'practice'];
const readsOf = (kind: ChangeKind): readonly ReadKind[] => (kind === 'all' ? ALL_READS : kind === 'sync' ? [] : [kind]);

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
  season: defaultSeason(),
  lessonAt: {},
  algChoice: {},
  trainOff: [],
  duelName: '',
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
  // Todos os eventos, não excluídos, em ordem de at. Lista de referência (não é proxy): cada mudança troca o array, e a tela vê a troca.
  solves = $state.raw<Solve[]>([]);
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
  moveRequest = $state.raw<MoveRequest | null>(null); // o que a folha de mover leva (dialog 'move')
  solveRequest = $state.raw<SolveRequest | null>(null); // o solve do detalhe (dialog 'solve')
  recordRequest = $state.raw<RecordRequest | null>(null); // o recorde da folha (dialog 'record')
  listJump = $state.raw<ListJump | null>(null); // o pedido de rolar a lista da Evolução até um solve ("Ver na lista")
  v1Available = $state(false); // há dados da v1 ainda não oferecidos
  exportReminder = $state(false); // mostrar o lembrete de exportar
  pendingExport = $state<PendingExport | null>(null); // texto de uma exportação que o navegador não baixou (ExportDialog)
  // A importação de arquivo (ui/import-flow.ts) é uma só, para os dois seletores: o estado vive aqui, e o ImportDialog o mostra.
  importDraft = $state<CsTimerSession[] | null>(null); // sessões de um csTimer à espera de o evento ser escolhido
  importSummary = $state<string[] | null>(null); // linhas do resumo da última importação
  importBusy = $state(false); // uma importação (arquivo ou versão anterior) está gravando
  // timerBusy, pendingInspect, trainerRunning e duelRunning (os getters e setters, depois do construtor): seguram o sync desta aba e o das
  // outras.
  private busyTimer = $state(false);
  private busyInspect = $state(false);
  private busyTrainer = $state(false);
  private busyDuel = $state(false);
  folderNeedsPermission = $state(false); // a pasta de cópias perdeu a permissão de gravar: Ajustes pede de novo, num clique
  private folderCheck = 0; // geração da última conferência da pasta: uma resposta velha não apaga a de uma tentativa mais nova
  solvesInFlight = $state(0); // addSolve ainda não voltou (o solve não está gravado nem na fila): o unsaved espera por ele
  // Trilha e treino (spec do sub-projeto 4). O treino tem a própria lista: nada dele entra em solves, recordes, temporadas ou marcos.
  practice = $state.raw<Practice[]>([]); // as tentativas do treino, em ordem de at (lista de referência, como os solves)
  trailView = $state<TrailView>({ kind: 'home' });
  trailFlashes = $state(0); // soma 1 a cada vez que uma etapa nova fica marcada: o Centro da Trilha pisca a face lateral
  evolucaoView = $state<EvolucaoView>({ kind: 'stats' });
  // Soma 1 a cada aviso de mudança nos desafios ('duels' ou 'all', desta aba ou de fora): a Evolução relê a lista deles. Os desafios não
  // ficam na memória do app (só a Evolução os mostra, e só o aberto, no DuelState, joga).
  duelChanges = $state(0);

  readonly account: AccountState | null; // a conta e o sync; null sem os deps (AppDeps.account)
  readonly duel: DuelState; // o desafio por link (spec do desafio): um modo do Timer; parado ('idle'), nada muda
  private repo: Repository; // troca quando a conexão é reaberta (useRepo)
  private readonly queue: ScrambleQueue;
  private readonly now: () => number;
  private readonly reopenDb: (() => Promise<Repository>) | undefined;
  // A sessão atual que outra aba excluiu: segue apontada no perfil, na lixeira. O próximo solve vai para ela (o repositório a revive).
  private parked = $state.raw<Session | null>(null);
  private allSessions: Session[] = []; // todas as sessões, excluídas inclusive: a sessão que o perfil aponta sai daqui
  private scrambleEvent: EventId | null = null; // o evento do embaralhamento que a tela pediu (null: nenhum, ou zerado)
  private unsubscribe: (() => void) | null = null;
  private reopening: Promise<void> | null = null; // a reabertura em andamento, reaproveitada por quem pede enquanto ela não termina
  private restoring: Promise<void> | null = null; // o portão: fechado enquanto a troca não acaba (mesmo depois do prazo); as gravações esperam
  private restoreBusy = false; // uma restauração por vez, desde o começo (inclui a espera pela fila)
  private importing: Promise<unknown> | null = null; // a importação que está gravando: a restauração espera por ela
  private persistAsked = false; // o pedido automático de proteção já saiu nesta sessão (uma vez, mesmo sem resposta ainda)
  private attempts = 0; // tentativas de gravação já começadas: só a mais recente mexe em saveStalled
  private readonly storage: Pick<Storage, 'getItem'> | null;
  private readonly storageManager: StorageLike | null;
  private readonly share: ShareFile | null;
  private readonly saves: SaveQueue;
  // Um por solve gravado: a fila entrega o mesmo objeto ao enqueue e ao onSaved, e a conta só acontece uma vez.
  private readonly afterSaves = new WeakMap<Solve, Promise<void>>();
  private readonly seasonTracker = createSeasonTracker();
  private readonly seasonMemo = new WeakMap<Solve[], { key: string; status: MarkStatus[] }>();
  private chain: Promise<void> = Promise.resolve();
  // As escritas da trilha e do treino no perfil, em fila: cada uma lê o perfil depois da gravação anterior (o perfil grava inteiro).
  private trailWrites: Promise<unknown> = Promise.resolve();
  private undo: (UndoAction & { until: number }) | null = null; // o "Desfazer" pendente: o que desfazer e até quando
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
    this.share = deps.share === undefined ? (isIOS() ? shareFile : null) : deps.share;
    // O sync espera o timer, o espaço segurado antes da inspeção, o timer do treino (spec 6.2, decisão 14) e o desafio (a confirmação e a
    // revelação de B). As arrow functions: o motor usa o repositório atual (o reaberto, depois de o iOS derrubar a conexão).
    this.account = deps.account
      ? new AccountState(
          {
            repo: () => this.repo,
            busy: () => this.timerBusy || this.pendingInspect || this.trainerRunning || this.duelRunning,
            now: () => this.now(),
            announce: (text) => this.announce(text),
            afterWipe: () => this.afterWipe(),
            restoreExport: (data) => this.restoreFromCloud(data),
          },
          deps.account,
        )
      : null;
    // As arrow functions, como na conta: o desafio grava pelo repositório atual e lê o perfil de agora.
    this.duel = new DuelState(
      {
        repo: () => this.repo,
        event: () => this.event,
        duelName: () => this.profile.duelName,
        setDuelName: (name) => this.setDuelName(name),
        running: (busy) => {
          this.duelRunning = busy;
        },
        settled: async () => {
          while (this.restoring) await this.restoring; // como a gravação de um solve: depois do replaceAll, não no meio
        },
        showToast: (text) => this.showToast(text),
        now: () => this.now(),
      },
      deps.duel,
    );
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

  // O timer está na inspeção, armado, pronto ou rodando (a tela atualiza): o guia de instalação e o lembrete esperam.
  get timerBusy(): boolean {
    return this.busyTimer;
  }
  set timerBusy(busy: boolean) {
    this.setBusy('busyTimer', busy);
  }

  // O espaço segurado antes da inspeção (o timer ainda parado): conta como ocupado, como o timerBusy.
  get pendingInspect(): boolean {
    return this.busyInspect;
  }
  set pendingInspect(busy: boolean) {
    this.setBusy('busyInspect', busy);
  }

  // O timer do treino está rodando: os atalhos da tela do Timer esperam (a tecla que para não troca de aba).
  get trainerRunning(): boolean {
    return this.busyTrainer;
  }
  set trainerRunning(busy: boolean) {
    this.setBusy('busyTrainer', busy);
  }

  // B confere a penalidade ou vê o ponto (o solve em si já é do timerBusy): segura o sync como o timer. Quem muda é o DuelState.
  get duelRunning(): boolean {
    return this.busyDuel;
  }
  set duelRunning(busy: boolean) {
    this.setBusy('busyDuel', busy);
  }

  // Os quatro seguram o sync de todas as abas (revisão final 5.5): só uma mudança de verdade avisa a conta, que conta às outras abas. Sem
  // rastrear o que lê: quem escreve de dentro de um efeito não passa a depender destes campos (como na escrita de um $state comum).
  private setBusy(key: 'busyTimer' | 'busyInspect' | 'busyTrainer' | 'busyDuel', busy: boolean): void {
    untrack(() => {
      if (this[key] === busy) return;
      this[key] = busy;
      this.account?.busyChanged();
    });
  }

  // Há solve que ainda não foi gravado (em voo, na fila) ou uma gravação presa, ou o desafio tem o que gravar (uma ação em voo, B conferindo
  // a penalidade): fechar a aba perderia o que está só na memória. Os campos são $state, então quem lê o getter (o aviso de nova versão)
  // acompanha as mudanças.
  get unsaved(): boolean {
    return this.solvesInFlight > 0 || this.savePending > 0 || this.saveStalled || this.duel.unsaved;
  }

  // Uma restauração em curso, ou com o portão ainda fechado (passou do prazo e a troca segue): não se começa outra.
  get restoreRunning(): boolean {
    return this.restoreBusy || this.restoring !== null;
  }

  get currentSession(): Session | null {
    const id = this.profile.currentSessionId;
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  // A sessão que recebe o próximo solve: a atual viva, ou a que outra aba excluiu (o solve a revive). Ela é a que a tela mostra.
  get activeSession(): Session | null {
    return this.currentSession ?? this.parked;
  }

  get event(): EventId {
    return this.activeSession?.event ?? DEFAULT_EVENT;
  }

  get sessionSolves(): Solve[] {
    const id = this.activeSession?.id;
    return this.solves.filter((s) => s.sessionId === id);
  }

  get eventSolves(): Solve[] {
    const event = this.event;
    return this.solves.filter((s) => s.event === event);
  }

  // Os marcos de uma temporada (a atual, por padrão) sobre uma lista de solves (a de agora, por padrão). Guardado por lista: a mesma
  // lista não se conta duas vezes, e uma lista que só ganhou solves no fim continua a conta de onde parou (createSeasonTracker).
  seasonStatus(list: Solve[] = this.solves, state: SeasonState = this.profile.season.current): MarkStatus[] {
    const key = seasonKey(state);
    const hit = this.seasonMemo.get(list);
    if (hit?.key === key) return hit.status;
    const status = this.seasonTracker.evaluate(state, list);
    this.seasonMemo.set(list, { key, status });
    return status;
  }

  // A lista sobre a qual se contam os marcos de antes de uma ação desta aba sobre um solve: gravá-lo, ou trocar a penalidade (`previous` é a
  // versão de antes). É a lista de agora com só essa ação desfeita: solves de outro aparelho que o sync juntou durante a gravação ficam dos
  // dois lados, e a virada que eles fecharam não é desta ação nem é anunciada aqui (spec 6.4: só o aparelho que causou a virada a anuncia).
  // Sem nada juntado no meio, é a própria `listBefore`, cuja conta já está guardada.
  solvesBefore(listBefore: Solve[], solve: Solve, previous?: Solve): Solve[] {
    const undone = previous ? this.solves.map((s) => (s.id === solve.id ? previous : s)) : this.solves.filter((s) => s.id !== solve.id);
    return undone.length === listBefore.length && undone.every((s, i) => s === listBefore[i]) ? listBefore : undone;
  }

  // Fecha a temporada atual quando os 9 marcos estão feitos (spec do sub-projeto 3, seção 5.5). Na fila: vê a lista e o perfil depois
  // das gravações que já estavam nela. A virada é condicional no repositório: se outra aba já virou, o perfil gravado volta e nada vira
  // duas vezes. Uma falha ou uma virada sem resposta no prazo mostra o aviso; os marcos continuam feitos, então a conferência seguinte
  // tenta de novo. Não rejeita: a abertura espera por ela.
  // Dentro da fila, chame sem esperar (void): a fila espera o trabalho que está rodando.
  checkSeason(): Promise<void> {
    return this.serial(async () => {
      try {
        const progress = $state.snapshot(this.profile.season);
        const plan = planAdvance(progress, this.solves, this.now(), this.seasonStatus(this.solves, progress.current));
        if (!plan) return;
        await this.write(async () => {
          this.profile = await within(this.repo.advanceSeason(plan.fromN, plan.record, plan.next), COUNT_DEADLINE_MS);
        });
      } catch {
        // A conta falhou (um erro de código, não do banco): sem aviso, a pessoa não tem o que fazer. A temporada fica como está, e a
        // próxima conferência (o próximo solve, uma edição, a próxima abertura) tenta de novo.
      }
    });
  }

  async init(): Promise<void> {
    await this.readKinds(ALL_READS, false); // a abertura não desiste: um histórico grande num celular lento só demora
    // Assina antes do primeiro embaralhamento: a espera pelo cubing pode ser longa, e uma mudança de outra aba nesse tempo não
    // pode ficar de fora. As leituras que as próprias escritas disparam entram na fila; a última espera por elas no fim.
    this.subscribe();
    // Aberto instalado: pede a proteção, se o navegador ainda não a deu (uma vez por sessão).
    if (isStandalone()) void this.askPersistence();
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
    await this.readKinds(ALL_READS, false);
    // Quem já tinha os 9 marcos antes desta versão fecha a temporada ao abrir. Depois da última leitura: a conta fica guardada para a
    // lista que a tela vai ler (contar antes dela refaria a conta inteira na tela, com os solves relidos).
    await this.checkSeason();
    // As cópias do dia e da pasta vêm depois do primeiro embaralhamento e rodam em segundo plano: uma cópia grande não segura a
    // casca. backup() e copyToFolder() já tratam as próprias falhas (com aviso); o catch só evita uma rejeição sem dono.
    void this.openingCopies(plan).catch(() => undefined);
    void this.checkFolderPermission();
    // A conta e o sync (spec 6.2): /api/health e o primeiro sync saem daqui, sem segurar a abertura.
    void this.account?.start();
  }

  private async openingCopies(plan: SafetyPlan): Promise<void> {
    if (plan.backup) await this.backup(plan.backup);
    if (plan.folderSave) await this.copyToFolder();
  }

  // Relê sessões, solves, perfil e meta do banco. Na mesma fila que as contas, então nunca fica por cima de um solve novo.
  reload(): Promise<void> {
    return this.readKinds(ALL_READS);
  }

  // Relê só os tipos pedidos (cada um é uma leitura do banco) e recalcula o que deles depende. Na mesma fila que as contas.
  private readKinds(kinds: readonly ReadKind[], deadline = true): Promise<void> {
    const want = new Set<ReadKind>(kinds);
    return this.serial(async () => {
      const repo = this.repo;
      const reading = Promise.all([
        want.has('sessions') ? repo.listSessions({ includeDeleted: true }) : undefined,
        want.has('solves') ? repo.listSolves() : undefined,
        want.has('profile') ? repo.getProfile() : undefined,
        want.has('meta') ? repo.getMeta() : undefined,
        want.has('practice') ? repo.listPractice() : undefined,
      ] as const);
      const [sessions, solves, profile, meta, practice] = deadline ? await this.withReadDeadline(reading, repo) : await reading;
      if (sessions) {
        this.allSessions = sessions;
        this.sessions = sessions.filter((s) => s.deletedAt === null);
      }
      if (solves) this.solves = solves;
      if (profile) this.profile = profile;
      if (meta) this.meta = meta;
      if (practice) this.practice = practice;
      // A sessão que o perfil aponta, se outra aba a excluiu (está na lixeira): depende das sessões e do perfil.
      if (sessions || profile) {
        this.parked = this.allSessions.find((s) => s.deletedAt !== null && s.id === this.profile.currentSessionId) ?? null;
      }
      if (profile) this.applyPrefs();
      // O embaralhamento da tela é de outro evento (outra aba trocou de sessão, ou a atual foi excluída): pede o do evento certo.
      if (this.scrambleEvent !== null && this.scrambleEvent !== this.event) void this.nextScramble();
    });
  }

  // Uma leitura do banco com prazo e sondagem (READ_DEADLINE_MS, PROBE_MS). Banco vivo: espera a leitura, por lenta que seja. Banco
  // mudo: desiste (TimeoutError) e reabre; a resposta que chegar tarde é ignorada.
  //
  // A sondagem é na conexão em que a leitura começou (readRepo). Se ela já foi trocada (uma gravação presa reabriu o banco), a leitura
  // ficou na conexão velha e desiste: quem a substituiu relê pela nova. Banco vivo e lento: sonda de novo a cada prazo.
  private async withReadDeadline<R>(reading: Promise<R>, readRepo: Repository): Promise<R> {
    const timeout = (): Error => Object.assign(new Error('leitura sem resposta'), { name: 'TimeoutError' });
    for (;;) {
      if ((await settlesWithin(reading, READ_DEADLINE_MS)) === 'done') {
        try {
          return await reading;
        } catch (err) {
          // Falhou na hora com a conexão morta: reabre (no máximo uma vez por READ_REOPEN_EVERY_MS).
          if (isConnectionError(err) && this.now() - this.lastReadReopen >= READ_REOPEN_EVERY_MS) {
            this.lastReadReopen = this.now();
            void this.reopenRepo();
          }
          throw err;
        }
      }
      if (this.repo !== readRepo) throw timeout();
      const probe = readRepo.getMeta().then(
        () => 'alive' as const,
        () => 'dead' as const,
      );
      const answer = await Promise.race([probe, sleep(PROBE_MS).then(() => 'dead' as const)]);
      if (answer === 'dead') {
        void this.reopenRepo();
        throw timeout();
      }
    }
  }

  // Outra aba mudou estes solves: lê só eles e os encaixa na lista em memória, em vez de reler o histórico inteiro.
  private refreshSolveIds(solveIds: string[]): Promise<void> {
    const ids = [...new Set(solveIds)]; // um id repetido no aviso não põe o solve duas vezes
    return this.serial(async () => {
      const repo = this.repo;
      const fetched = await this.withReadDeadline(repo.getSolves(ids), repo);
      const changed = new Set(ids);
      const kept = this.solves.filter((s) => !changed.has(s.id));
      const active = fetched.filter((s): s is Solve => s !== undefined && s.deletedAt === null);
      if (active.length > 32) {
        this.solves = [...kept, ...active].sort(bySolveTime);
        return;
      }
      for (const s of active) kept.splice(lowerBound(kept, s), 0, s);
      this.solves = kept;
    }).catch(() => {
      if (!this.superseded) this.showToast(T.data.readFailed);
    });
  }

  // Leitura que falha não pode virar uma promessa sem dono: a pessoa vê o aviso (menos quando esta aba já foi substituída).
  private refreshKinds(kinds: readonly ReadKind[]): Promise<void> {
    return this.readKinds(kinds).catch(() => {
      if (!this.superseded) this.showToast(T.data.readFailed);
    });
  }

  private refresh(): Promise<void> {
    return this.refreshKinds(ALL_READS);
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
  async addSolve(r: { ms: number; penalty: Penalty; at: number; phases?: number[] }): Promise<Solve | null> {
    this.solvesInFlight += 1; // conta até o solve estar gravado ou na fila (e o finally sempre desconta)
    try {
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
        ...(r.phases ? { phases: r.phases } : {}), // só com fases ligadas; sem elas o solve não ganha o campo
      });
      if (solve) await this.recordSaved(solve);
      void this.nextScramble();
      return solve;
    } finally {
      this.solvesInFlight -= 1;
    }
  }

  // Penalidade e nota: o repositório devolve o solve gravado, e a memória recebe esse mesmo (sem reler os solves).
  private async editSolve(change: () => Promise<Solve>): Promise<void> {
    await this.write(async () => {
      const updated = await change();
      await this.serial(async () => this.replaceSolve(updated));
    });
    void this.checkSeason(); // tirar um DNF pode completar uma média
  }

  async setPenalty(id: string, penalty: Penalty): Promise<void> {
    // O DNF digitado (ms 0) não tem tempo por trás: não vira OK nem +2 por caminho nenhum (o Timer, o detalhe, o atalho P). Sem gravar.
    const current = this.solves.find((x) => x.id === id);
    if (current && penalty !== 'DNF' && isTypedDnf(current)) return;
    await this.editSolve(() => this.repo.updateSolve(id, { penalty }));
  }

  async setNote(id: string, note: string): Promise<void> {
    await this.editSolve(() => this.repo.updateSolve(id, { note }));
  }

  async deleteSolve(id: string): Promise<void> {
    const ok = await this.write(async () => {
      await this.repo.deleteSolve(id);
      await this.serial(async () => this.removeSolves([id]));
    });
    if (ok) {
      void this.checkSeason(); // tirar um DNF pode completar uma média (ou a variação de 5 seguidos)
      this.offerUndo({ kind: 'delete', ids: [id] }, T.toast.deleted);
    }
  }

  // Exclui um lote (a seleção da lista) numa transação, com um "Desfazer" só para o lote inteiro. A memória tira os excluídos sem reler o
  // histórico. Devolve se gravou.
  async deleteSolves(ids: readonly string[]): Promise<boolean> {
    let gone: string[] = [];
    const ok = await this.write(async () => {
      gone = await this.repo.deleteSolves(ids);
      await this.serial(async () => this.removeSolves(gone));
    });
    if (ok && gone.length > 0) {
      void this.checkSeason();
      this.offerUndo({ kind: 'delete', ids: gone }, T.historico.deleted(gone.length));
    }
    return ok;
  }

  // Move solves (um, pelo detalhe, ou um lote) para outra sessão do mesmo evento, com um "Desfazer" só. Outro evento ou uma sessão que foi
  // para a lixeira o repositório recusa: nada muda, e o aviso de falha aparece. A memória lê só os solves que mudaram (o instante deles é o
  // mesmo, então a ordem também). Devolve se gravou.
  async moveSolves(ids: readonly string[], sessionId: string): Promise<boolean> {
    let moves: { id: string; from: string }[] = [];
    const ok = await this.write(async () => {
      moves = await this.repo.moveSolves(ids, sessionId);
    });
    if (!ok || moves.length === 0) return ok;
    await this.refreshSolveIds(moves.map((m) => m.id));
    void this.checkSeason();
    const name = this.sessions.find((s) => s.id === sessionId)?.name ?? '';
    this.offerUndo({ kind: 'move', moves }, T.historico.moved(moves.length, name));
    return true;
  }

  // Abre a folha de mover com estes solves (a barra da seleção; o detalhe de um solve). Sem nenhum, não abre.
  openMove(ids: readonly string[], options: { number?: number; done?: () => void; back?: () => void } = {}): void {
    if (ids.length === 0) return;
    this.moveRequest = { ids: [...ids], ...options };
    this.dialog = 'move';
  }

  // Abre o detalhe de um solve (uma linha da lista). `sessionId` é o filtro da lista ('all' para todas as sessões do evento); sem ele, vale
  // a sessão do próprio solve. `back` devolve o foco à lista (SolveRequest). Um id que não existe (já excluído) não abre nada.
  openSolve(id: string, sessionId?: string, back?: () => void): void {
    const solve = this.solves.find((s) => s.id === id);
    if (!solve) return;
    this.solveRequest = { id, sessionId: sessionId ?? solve.sessionId, ...(back ? { back } : {}) };
    this.dialog = 'solve';
  }

  // Abre a folha de um recorde (uma linha do quadro; o selo do detalhe). `sessionId` é o filtro da lista ('all' para todas as sessões do
  // evento); sem ele, vale a sessão atual. O evento é o da sessão, quando há uma, ou o dado; sem nenhum dos dois, o de agora.
  openRecord(kind: RecordKind, sessionId?: string, event?: EventId): void {
    const id = sessionId ?? this.profile.currentSessionId ?? 'all';
    const session = id === 'all' ? undefined : this.sessions.find((s) => s.id === id);
    this.recordRequest = { kind, event: event ?? session?.event ?? this.event, sessionId: id };
    this.dialog = 'record';
  }

  // "Ver na lista": a Evolução abre (a aba e a vista dos números) e a lista rola até o solve. Se a tela já está montada, atende na hora;
  // se não, atende ao montar.
  showInList(jump: ListJump): void {
    this.tab = 'evolucao';
    this.evolucaoView = { kind: 'stats' };
    this.listJump = jump;
  }

  // Junta duas sessões do mesmo evento (o diálogo das Sessões): os solves de `fromId` passam para `toId`, e ela vai para a lixeira. Se ela
  // era a atual, a de destino passa a ser. Não tem "Desfazer": a sessão volta pela lixeira, sem os solves. Devolve se gravou.
  async mergeSessions(fromId: string, toId: string): Promise<boolean> {
    const wasCurrent = fromId === this.profile.currentSessionId;
    let count = 0;
    const ok = await this.write(async () => {
      count = await this.repo.mergeSessions(fromId, toId);
    });
    if (!ok) return false;
    // O "Desfazer" de antes deixa de valer: devolver um solve à sessão juntada a traria de volta da lixeira só com ele.
    this.closeUndo();
    if (wasCurrent) await this.switchSession(toId);
    await this.refreshKinds(['solves', 'sessions']); // sem os ids no retorno: relê os solves (uma junção é rara)
    void this.checkSeason();
    this.showToast(T.historico.merged(count, this.sessions.find((s) => s.id === toId)?.name ?? ''));
    return true;
  }

  // O "Desfazer" do aviso e da tecla Z, se o prazo ainda não passou. Qualquer resposta encerra a janela: desfazer uma vez não se repete.
  // Uma exclusão volta da lixeira numa transação. Uma mudança de sessão volta um pedido por sessão de origem: a volta para uma sessão que foi
  // para a lixeira no meio (outra aba) é recusada e as outras voltam, com o aviso de que alguns não voltaram; se nenhuma origem existe mais,
  // o aviso diz que não há o que desfazer. A temporada é conferida quando algo voltou. Devolve se tudo voltou.
  async undoLast(): Promise<boolean> {
    const undo = this.undo;
    this.closeUndo();
    if (!undo || this.now() > undo.until) return false;
    let ok = true;
    let changed = true; // algo voltou: as contas mudaram
    let ids: string[];
    if (undo.kind === 'delete') {
      ids = undo.ids;
      ok = await this.write(() => this.repo.restoreSolves(undo.ids));
      changed = ok;
    } else {
      ids = undo.moves.map((m) => m.id);
      const result = await this.moveBack(undo.moves);
      ok = result.ok;
      changed = result.moved;
    }
    // A memória lê só os solves do lote, como ficaram (os que voltaram e os que não). Restaurar pode reviver a sessão deles, se outra aba a
    // mandou para a lixeira: relê as sessões também.
    await this.refreshSolveIds(ids);
    if (undo.kind === 'delete') await this.refreshKinds(['sessions']);
    if (changed) await this.checkSeason();
    return ok;
  }

  // A volta de uma mudança de sessão, um pedido por sessão de origem. A origem que foi para a lixeira (ou sumiu) recusa a volta
  // ('move-session'): os outros voltam, e o aviso diz o que aconteceu; outra falha tem o aviso de sempre.
  private async moveBack(moves: readonly { id: string; from: string }[]): Promise<{ ok: boolean; moved: boolean }> {
    const back = new Map<string, string[]>();
    for (const m of moves) {
      const group = back.get(m.from);
      if (group) group.push(m.id);
      else back.set(m.from, [m.id]);
    }
    let moved = false;
    let refused = false;
    let failed = false;
    for (const [from, group] of back) {
      try {
        if ((await this.repo.moveSolves(group, from)).length > 0) moved = true;
      } catch (err) {
        if (err instanceof Error && err.message === 'move-session') refused = true;
        else failed = true;
      }
    }
    if (failed) this.showToast(T.data.changeFailed);
    else if (refused) this.showToast(moved ? T.historico.undoMoveRefused : T.historico.undoNothing);
    return { ok: !failed && !refused, moved };
  }

  async createSession(event: EventId, name?: string): Promise<void> {
    this.clearScramble(); // antes da gravação: um solve que caia nessa janela não leva o embaralhamento do evento antigo
    await this.write(async () => {
      const session = await this.repo.createSession({ event, name });
      await this.repo.saveProfile({ currentSessionId: session.id });
    });
    await this.refreshKinds(['sessions', 'profile']);
    await this.nextScramble(); // zerado acima, então é preciso pedir outro, mesmo que a gravação tenha falhado
  }

  async switchSession(id: string): Promise<void> {
    if (id === this.profile.currentSessionId || !this.sessions.some((s) => s.id === id)) return;
    this.clearScramble(); // antes da gravação, como em createSession
    await this.write(() => this.repo.saveProfile({ currentSessionId: id }));
    await this.refreshKinds(['profile']);
    await this.nextScramble();
  }

  async renameSession(id: string, name: string): Promise<void> {
    await this.write(() => this.repo.renameSession(id, name));
    await this.refreshKinds(['sessions']);
  }

  // Se a sessão apagada era a atual, a primeira que sobrou assume (ou uma de 3×3 nova, se não sobrou nenhuma).
  async deleteSession(id: string): Promise<void> {
    const wasCurrent = id === this.profile.currentSessionId;
    if (wasCurrent) this.clearScramble(); // antes da gravação, como em createSession e switchSession
    const ok = await this.write(() => this.repo.deleteSession(id));
    await this.refresh();
    if (ok) void this.checkSeason(); // os solves dela saem da conta: tirar DNFs pode completar uma média
    const replaced = ok && !this.currentSession && (await this.write(() => this.replaceCurrent()));
    if (wasCurrent || replaced) await this.nextScramble();
  }

  // Troca tudo pela cópia escolhida. Uma por vez: a segunda sai com false sem tocar em nada. Antes, espera uma reabertura em curso (a
  // troca usa o repositório que ela devolver) e a fila precisa estar vazia: um solve que ainda não foi gravado ficaria de fora da
  // troca, e uma gravação presa nunca termina, então com ela a troca é recusada direto.
  async restoreFromBackup(id: string): Promise<boolean> {
    return this.restoreGuarded(() => this.replaceFromBackup(id));
  }

  // A restauração de uma cópia baixada da nuvem (a conta grande: o servidor não cabe a troca e ela é daqui). Passa pelo mesmo portão da
  // cópia local: espera a importação, confere a fila, fecha as gravações durante a troca e tem o prazo. Devolve false quando ele a
  // segurou (o aviso já saiu; passando do prazo, a troca ainda termina, e guarda o piso dela, A1).
  restoreFromCloud(data: KlickExport): Promise<boolean> {
    // Outra troca em andamento: o aviso é daqui (o diálogo das cópias na nuvem não avisa nada no 'held').
    if (this.restoreRunning) this.showToast(T.conta.cloudRestoreBusy);
    return this.restoreGuarded(() => this.replaceFromCloud(data));
  }

  private async restoreGuarded(replace: () => Promise<void>): Promise<boolean> {
    // Enquanto uma corre, ou o portão ainda está fechado por uma troca que passou do prazo, a chamada sai com false.
    if (this.restoreBusy || this.restoring) return false;
    this.restoreBusy = true;
    try {
      return await this.restoreWith(replace);
    } finally {
      this.restoreBusy = false;
    }
  }

  // O portão de toda troca do banco inteiro (a cópia local e a da nuvem): `replace` é a troca em si.
  private async restoreWith(replace: () => Promise<void>): Promise<boolean> {
    if (this.reopening) await this.reopening;
    // Uma importação que já está gravando termina antes da troca: a cópia de segurança (a pre-restore) leva o que ela trouxe, e o
    // replaceAll não cai no meio dela. Imports que chegam agora são recusados (importJob).
    if (this.importing && (await settlesWithin(this.importing, IMPORT_WAIT_MS)) === 'late') {
      this.showToast(T.data.restoreImportBusy);
      return false;
    }
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
    const section = replace();
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
    await this.checkSeason();
  }

  // A troca pela cópia da nuvem: a cópia local 'pre-restore' e só as diferenças (restoreExport, com o piso), e então recarrega, como a da
  // cópia local.
  private async replaceFromCloud(data: KlickExport): Promise<void> {
    await restoreExport(this.repo, data, this.now());
    await this.reload();
    await this.checkSeason();
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
        practice: $state.snapshot(this.practice),
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

  listTrash(): Promise<{ sessions: Session[]; solves: Solve[]; duels: Duel[] }> {
    return this.repo.listTrash();
  }

  // Devolve um item da lixeira. Uma sessão traz de volta os solves excluídos dela (o repositório faz isso na mesma transação). Um desafio
  // (o excluído em Evolução, ou o que uma restauração mandou para a lixeira) volta sozinho: ele não entra nos solves nem nas contas.
  async restoreFromTrash(item: { kind: 'solve' | 'session' | 'duel'; id: string }): Promise<boolean> {
    if (item.kind === 'duel') return this.duelWrite(() => this.repo.restoreDuel(item.id));
    const ok = await this.write(() => (item.kind === 'solve' ? this.repo.restoreSolve(item.id) : this.repo.restoreSession(item.id)));
    await this.refresh();
    if (ok) await this.checkSeason();
    return ok;
  }

  // --- Os desafios guardados (Evolução › Desafios). O que joga é o DuelState; aqui, a lista e a lixeira. ---

  // Os desafios fora da lixeira, os mais novos primeiro (pela criação).
  listDuels(): Promise<Duel[]> {
    return this.repo.listDuels();
  }

  // Abre a Evolução na lista dos Desafios (ou numa partida).
  openDuels(view: EvolucaoView = { kind: 'duels' }): void {
    this.evolucaoView = view;
    this.tab = 'evolucao';
  }

  // "Excluir" (9c): para a lixeira, só o registro que a tela mostrou (se ele mudou por fora, a resposta chegou noutra aba por exemplo, nada
  // vai para a lixeira: a lista relê pelo aviso e mostra o novo). Excluído, o aviso de desfazer, por UNDO_MS, como o do solve.
  async deleteDuel(d: Duel): Promise<boolean> {
    let conflict = false;
    const ok = await this.duelWrite(async () => {
      try {
        await this.repo.deleteDuel(d.id, { expectUpdatedAt: d.updatedAt });
      } catch (err) {
        if (!(err instanceof DuelConflictError)) throw err;
        conflict = true;
      }
    });
    if (!ok || conflict) return false;
    this.showToast(T.duel.deleted, T.toast.undoTouch, () => void this.duelWrite(() => this.repo.restoreDuel(d.id)), UNDO_MS);
    return true;
  }

  // Uma gravação de desafio pedida aqui: depois de uma restauração em curso (como as do DuelState e as do treino), e com o aviso se falhar.
  private async duelWrite(action: () => Promise<unknown>): Promise<boolean> {
    while (this.restoring) await this.restoring;
    return this.write(action);
  }

  // Exporta para um arquivo. Se o navegador baixa, a exportação conta (zera o lembrete). Se não baixa (iframe, ou o download falhou),
  // o texto vai para o ExportDialog, e a exportação só conta quando a pessoa copia o texto.
  async exportFile(format: ExportFormat): Promise<void> {
    const data = await this.exportData();
    const stamp = backupFileName(this.now()).replace(/^klick-|\.json$/g, ''); // AAAA-MM-DD-HHmm, o mesmo carimbo das cópias da pasta
    const klick = format === 'klick';
    const text = klick ? toKlickJson(data) : toCsTimerJson(data.sessions, data.solves);
    const name = klick ? `klick-${stamp}.json` : `klick-csTimer-${stamp}.txt`;
    const mime = klick ? 'application/json' : 'text/plain';
    // No iPhone, o download abre uma prévia que a pessoa pode fechar sem salvar: lá a exportação vai pela folha de compartilhar
    // (Salvar em Arquivos), e só conta como feita quando a pessoa conclui. Fechar a folha não conta nem abre outra coisa.
    if (this.share) {
      const outcome = await this.share(name, text, mime);
      if (outcome === 'shared') {
        await this.markExported();
        return;
      }
      if (outcome === 'cancelled') return;
    }
    if (downloadText(name, text, mime)) {
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
    return this.write(
      () =>
        this.serial(async () => {
          this.meta = await this.repo.saveMeta({ solvesSinceExport: 0, lastExportAt: this.now() });
        }),
      T.data.exportMarkFailed,
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
    if (!(await this.write(() => this.repo.saveFolderHandle(chosen), T.data.folderSaveFailed))) return false;
    await this.copyToFolder();
    await this.refreshKinds(['meta']);
    return true;
  }

  // Uma importação por vez, na fila das leituras: dois cliques no mesmo botão não gravam os mesmos solves duas vezes (os ids são
  // novos). A importação é uma transação (importAll): se falha, nada entrou e o aviso sai; devolve null nesse caso. Durante uma
  // restauração, a importação é recusada com aviso: a troca substitui tudo, e um import no meio dela se perderia.
  //
  // `adopt` é a sessão importada para onde a pessoa vai quando a sessão atual dela não tem solve nenhum (o aparelho novo): sem isso, ela
  // cairia na "Sessão 1" vazia, com os solves dela em outra sessão. A troca vem depois da fila, porque switchSession usa a fila.
  private async importJob(job: () => Promise<{ summary: ImportSummary; adopt: string | null }>): Promise<ImportSummary | null> {
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
    let result: { summary: ImportSummary; adopt: string | null } | null;
    try {
      result = await run;
    } finally {
      if (this.importing === run) this.importing = null;
    }
    await this.refresh();
    await this.checkSeason();
    const current = this.profile.currentSessionId;
    if (result?.adopt && !this.solves.some((s) => s.sessionId === current)) await this.switchSession(result.adopt);
    return result?.summary ?? null;
  }

  // Um arquivo do Klick: junta por id. Nada é apagado; o que já existe e não é mais novo fica como está. O perfil do arquivo vale
  // por cima do daqui (o repositório diz como).
  importKlick(data: KlickExport): Promise<ImportSummary | null> {
    return this.importJob(async () => {
      // Um arquivo editado à mão pode repetir um id: fica a versão mais nova (a maior updatedAt; no empate, a última do arquivo).
      const latest = new Map<string, Solve>();
      for (const s of data.solves) {
        const seen = latest.get(s.id);
        if (!seen || s.updatedAt >= seen.updatedAt) latest.set(s.id, s);
      }
      const repeated = data.solves.length - latest.size;
      const report = await this.repo.importAll(repeated > 0 ? { ...data, solves: [...latest.values()] } : data);
      // No Klick, `skipped` são os solves que já existiam (com a mesma ou mais nova edição): não há conta prévia a conferir.
      const summary: ImportSummary = {
        solves: report.solvesAdded + report.solvesUpdated,
        existing: report.skipped,
        skippedSessions: 0,
        unreadable: 0,
        missed: 0,
        settingsApplied: data.profile !== null,
        repeated,
        refused: report.refused,
      };
      return { summary, adopt: null }; // no Klick, a sessão atual vem do perfil do arquivo (o repositório decide)
    });
  }

  // Sessões de um arquivo do csTimer. `mapping` traz o evento escolhido para cada sessão sem evento (pela chave dela no arquivo);
  // as que ficam sem evento não entram. Os solves viram registros novos; os que já existem (até os da lixeira) não entram de novo.
  importCsTimer(sessions: CsTimerSession[], mapping: Record<string, EventId | undefined>): Promise<ImportSummary | null> {
    return this.importJob(async () => {
      const repo = this.repo;
      const [existingSessions, existingSolves] = await this.withReadDeadline(
        Promise.all([repo.listSessions({ includeDeleted: true }), repo.listSolves({ includeDeleted: true })]),
        repo,
      );
      const now = this.now();
      const plan = csTimerToKlick(sessions, mapping, { now, existingSessions, existingSolves });
      const report = await this.repo.importAll({
        format: 'klick',
        version: 1,
        exportedAt: now,
        sessions: plan.sessions,
        solves: plan.solves,
        profile: null,
      });
      // Os solves do plano são novos pela conta do conversor: o que o repositório deixou de fora (skipped) não pode sumir do resumo.
      return {
        summary: {
          solves: report.solvesAdded,
          existing: plan.duplicates,
          skippedSessions: plan.skippedSessions,
          unreadable: 0,
          missed: report.skipped,
          refused: report.refused,
        },
        adopt: report.solvesAdded > 0 ? busiestSession(plan.solves) : null,
      };
    });
  }

  // Dados da versão anterior (a chave do localStorage antigo). Só o que bate é importado; o que não bate é contado em unreadable.
  async importV1(): Promise<ImportSummary | null> {
    // A contagem vem antes: um arquivo sem nenhum registro legível ainda tem o que avisar. Depois de avisar, a oferta acaba (importar
    // de novo daria o mesmo resultado); os dados da v1 continuam no navegador, intocados. Se a marca não grava, a oferta segue.
    const unreadable = readV1Invalid(this.storage);
    const v1 = readV1(this.storage);
    if (!v1) {
      if (unreadable > 0) {
        try {
          this.meta = await this.repo.saveMeta({ v1ImportOffered: true });
          this.v1Available = false;
        } catch {
          // a oferta segue na tela; tentar de novo é inofensivo
        }
        return { solves: 0, existing: 0, skippedSessions: 0, unreadable, missed: 0 };
      }
      this.v1Available = false;
      this.showToast(T.dados.nothingV1);
      return null;
    }
    return this.importJob(async () => {
      const repo = this.repo;
      const [existingSessions, existingSolves] = await this.withReadDeadline(
        Promise.all([repo.listSessions({ includeDeleted: true }), repo.listSolves({ includeDeleted: true })]),
        repo,
      );
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
        summary: {
          solves: report.solvesAdded,
          existing: plan.duplicates,
          skippedSessions: plan.skippedSessions,
          unreadable,
          missed: report.skipped,
          offerNotMarked: !offerMarked,
          refused: report.refused,
        },
        adopt: report.solvesAdded > 0 ? busiestSession(plan.solves) : null,
      };
    });
  }

  // Os ajustes podem vir parciais, inclusive o grupo de sons (um só som): o repositório junta com o que está gravado.
  async updateSettings(patch: NonNullable<ProfilePatch['settings']>): Promise<void> {
    const ok = await this.write(async () => {
      this.profile = await this.repo.saveProfile({ settings: patch });
    }, T.data.settingFailed);
    if (ok) this.applyPrefs();
    await this.refreshKinds(['profile']);
  }

  // O nome que vai nos links de desafio (spec do desafio, seção 5): aparado, de uma linha, até 20 caracteres. Vazio tira o nome.
  async setDuelName(name: string): Promise<void> {
    await this.write(async () => {
      this.profile = await this.repo.saveProfile({ duelName: cleanDuelName(name) });
    }, T.data.settingFailed);
    await this.refreshKinds(['profile']);
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
    await this.refreshKinds(['profile']);
  }

  // --- Trilha e treino (spec do sub-projeto 4). Nada aqui toca em sessões, solves, recordes, temporadas, marcos ou no coach. ---

  // O aviso "Já resolve? Marque o que já sabe": enquanto nenhuma etapa está marcada e este aparelho não o dispensou.
  get trailPromptShown(): boolean {
    return this.meta !== null && !this.meta.trailPromptDismissed && this.profile.trail.every((done) => !done);
  }

  // O indicador da barra de cima leva a Ajustes, em "Conta e sync" (spec 9.3).
  openAccount(): void {
    this.tab = 'ajustes';
  }

  // Abre a aba Trilha numa vista (a aula de uma etapa, um conjunto, a rodada) ou no começo.
  openTrail(view: TrailView = { kind: 'home' }): void {
    this.trailView = view;
    this.tab = 'trilha';
  }

  // Uma escrita do perfil pela trilha, na fila. Se não grava, o aviso sai e a memória volta ao que está gravado (spec 9.4).
  // Antes, espera uma restauração em curso (o remendo não parte da memória de antes da troca nem cai no meio do replaceAll). O
  // remendo é calculado e gravado dentro da fila das leituras (serial): uma leitura em voo termina antes e deixa o perfil que leu na
  // memória, e a gravação parte dele; uma que entra depois lê o que acabou de ser gravado. Assim nenhuma leitura velha desfaz a marca.
  private trailJob(job: () => Partial<Omit<Profile, 'settings'>>): Promise<boolean> {
    const run = this.trailWrites.then(async () => {
      while (this.restoring) await this.restoring;
      const ok = await this.write(() =>
        this.serial(async () => {
          this.profile = await this.repo.saveProfile(job());
        }),
      );
      if (!ok) await this.refreshKinds(['profile']);
      return ok;
    });
    this.trailWrites = run.catch(() => undefined);
    return run;
  }

  // Marca ou desmarca etapas ("já sei", "desfazer" ou várias de uma vez). Marcar alguma que ainda não estava marcada pisca a face lateral.
  setTrail(steps: readonly TrailStep[], done: boolean): Promise<boolean> {
    let fresh = false;
    return this.trailJob(() => {
      const trail = [...this.profile.trail];
      fresh = done && steps.some((i) => !trail[i]);
      for (const i of steps) trail[i] = done;
      return { trail };
    }).then((ok) => {
      if (ok && fresh) this.trailFlashes += 1;
      return ok;
    });
  }

  // "Consegui no meu cubo" (spec 6.2): marca a etapa e zera o passo guardado da aula, numa gravação. Já marcada, só zera o passo.
  completeLesson(step: TrailStep): Promise<boolean> {
    let fresh = false;
    return this.trailJob(() => {
      const trail = [...this.profile.trail];
      fresh = !trail[step];
      trail[step] = true;
      const lessonAt = { ...this.profile.lessonAt };
      delete lessonAt[step];
      return { trail, lessonAt };
    }).then((ok) => {
      if (ok && fresh) this.trailFlashes += 1;
      return ok;
    });
  }

  // O passo em que a aula parou (sair no meio volta dali).
  setLessonAt(step: TrailStep, part: number): Promise<boolean> {
    return this.trailJob(() => ({ lessonAt: { ...this.profile.lessonAt, [step]: part } }));
  }

  // O algoritmo que a pessoa usa no caso. O padrão (0) não fica guardado.
  setAlgChoice(caseId: string, index: number): Promise<boolean> {
    return this.trailJob(() => {
      const algChoice = { ...this.profile.algChoice };
      if (index === 0) delete algChoice[caseId];
      else algChoice[caseId] = index;
      return { algChoice };
    });
  }

  // Tira o caso do sorteio do treino, ou o devolve.
  setCaseOff(caseId: string, off: boolean): Promise<boolean> {
    return this.trailJob(() => {
      const rest = this.profile.trainOff.filter((id) => id !== caseId);
      return { trainOff: off ? [...rest, caseId] : rest };
    });
  }

  dismissTrailPrompt(): Promise<void> {
    return this.updateMeta({ trailPromptDismissed: true });
  }

  // Grava uma tentativa do treino. Não é solve: não passa pela fila nem pelas contas dos solves. Se não grava, o aviso sai e a resposta
  // é null (o resultado continua na tela de quem chamou).
  async addPractice(r: Omit<Practice, 'id'>): Promise<Practice | null> {
    while (this.restoring) await this.restoring; // a tentativa cai depois do replaceAll, não no meio (como a gravação de um solve)
    try {
      const saved = await this.repo.addPractice({ id: newId(this.now()), ...r });
      await this.serial(async () => {
        this.practice = [...this.practice.filter((p) => p.id !== saved.id), saved].sort(byPracticeTime);
      });
      void this.notePracticeForBackup();
      return saved;
    } catch {
      this.showToast(T.data.changeFailed);
      return null;
    }
  }

  // A correção da última tentativa (spec 7.2): troca acerto e erro.
  async setPracticeOk(id: string, ok: boolean): Promise<boolean> {
    return this.write(async () => {
      const updated = await this.repo.updatePractice(id, { ok });
      await this.serial(async () => {
        this.practice = this.practice.map((p) => (p.id === id ? updated : p));
      });
    });
  }

  // A correção da última tentativa: apaga.
  async deletePractice(id: string): Promise<boolean> {
    return this.write(async () => {
      await this.repo.deletePractice(id);
      await this.serial(async () => {
        this.practice = this.practice.filter((p) => p.id !== id);
      });
    });
  }

  // Um dia só de treino também precisa da cópia do dia: a cópia da abertura só sai com o contador acima de zero. A primeira tentativa
  // depois de uma cópia leva o contador a 1; acima disso não mexe, para não adiantar a cópia dos 50 solves. Falha em silêncio: a próxima
  // tentativa tenta de novo.
  private async notePracticeForBackup(): Promise<void> {
    if (!this.meta || this.meta.solvesSinceBackup > 0) return;
    try {
      await this.serial(async () => {
        const meta = await this.repo.getMeta();
        if (meta.solvesSinceBackup > 0) return;
        this.meta = await this.repo.saveMeta({ solvesSinceBackup: 1 });
      });
    } catch {
      // sem aviso: a tentativa está gravada; só a marca da cópia ficou para a próxima
    }
  }

  // Tira o embaralhamento da tela e invalida os pedidos em voo: o que chegar depois não é mais deste evento.
  private clearScramble(): void {
    this.scrambleRequest++;
    this.scramble = '';
    this.scrambleError = false;
    this.scrambleEvent = null;
  }

  async nextScramble(): Promise<void> {
    const event = this.event;
    this.clearScramble();
    this.scrambleEvent = event;
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

  // Uma escrita pedida pela pessoa: se falha, o aviso aparece e a operação não é dada como feita. Nada some em silêncio. O aviso
  // de salvar (o de exportar) fica para solves; cada outra escrita diz o que falhou.
  // Uma mudança (nota, penalidade, sessão, ajuste, perfil) que não grava. O aviso de solve perdido (saveFailed) fica para o solve
  // novo, que vai pela fila de gravação, e para quem passar o texto dele de propósito.
  private async write(action: () => Promise<unknown>, failure: string = T.data.changeFailed): Promise<boolean> {
    try {
      await action();
      return true;
    } catch {
      this.showToast(failure);
      return false;
    }
  }

  private undoLabel(): string {
    return mediaMatches('(pointer: coarse)') ? T.toast.undoTouch : T.toast.undo;
  }

  // Abre a janela do "Desfazer" da última ação (o aviso, com o prazo dele, e a tecla Z). A de antes, se havia, deixa de valer.
  private offerUndo(action: UndoAction, text: string): void {
    const undoAction = () => void this.undoLast();
    this.undo = { ...action, until: this.now() + UNDO_MS };
    this.undoAction = undoAction;
    this.showToast(text, this.undoLabel(), undoAction, UNDO_MS);
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
      ...(s.phases ? { phases: [...s.phases] } : {}), // as fases do solve na fila também vão no arquivo
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

  // Outra aba abriu o banco numa versão nova e esta largou a conexão (DbNotice pede para recarregar). Daqui em diante, reabrir só daria
  // erro de versão a cada tentativa, e cada leitura repetiria o aviso: as duas coisas param.
  private superseded = false;
  private afterCountRunning: Promise<void> | null = null;
  private lastReadReopen = -Infinity; // a última reabertura pedida por uma leitura que falhou na hora // as cópias depois de um solve, enquanto rodam (talvez já fora da fila)
  supersede(): void {
    this.superseded = true;
    this.account?.stop(); // sem banco, esta aba não sincroniza: solta o lock 'klick-sync' para a aba da versão nova liderar
  }

  // O navegador derrubou a conexão (evento terminated do banco): reabre, como num erro de conexão de uma gravação.
  connectionLost(): void {
    void this.reopenRepo();
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
    if (!open || this.superseded) return Promise.resolve();
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

  // Um só ouvinte de mudanças, do repositório atual: trocar o repositório tira o ouvinte do antigo. O que esta aba grava já está na
  // memória (quem grava a atualiza); só o que outra aba gravou é relido, e só o tipo que mudou.
  private subscribe(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.repo.onChange((kind, origin, solveIds) => {
      this.account?.changed(kind, origin); // uma gravação daqui pede o sync; 'sync' relê o estado da conta
      this.duel.changed(kind); // o desafio aberto confere o registro dele: a resposta que chegou, um wipe, uma restauração
      if (kind === 'duels' || kind === 'all') this.duelChanges += 1;
      if (origin === 'local' || kind === 'sync') return;
      if (kind === 'solves' && solveIds) void this.refreshSolveIds(solveIds);
      else void this.refreshKinds(readsOf(kind));
    });
  }

  // A sessão que recebe o próximo solve. A atual, se está viva; se outra aba a excluiu, ela mesma (o repositório a revive na mesma
  // transação do solve). Escolher outra aqui levaria o solve, e o embaralhamento, para outro evento.
  private async ensureSession(): Promise<Session> {
    const current = this.currentSession;
    if (current) return current;
    if (this.parked) return this.parked;
    return this.replaceCurrent();
  }

  // Os dados deste aparelho foram apagados (spec 7.6 e 7.7): relê tudo e cria a sessão padrão, como num aparelho novo.
  private async afterWipe(): Promise<void> {
    await this.reload();
    await this.ensureSession();
    await this.nextScramble();
  }

  // Sem sessão atual viva: a primeira que sobrou assume (ou uma de 3×3, se não sobrou nenhuma), e a escolha é gravada.
  private async replaceCurrent(): Promise<Session> {
    // Sem sessão nenhuma, a padrão tem id fixo por evento (spec 5.5): dois aparelhos novos criam a mesma, e o sync as junta.
    const session = this.sessions[0] ?? (await this.repo.createSession({ event: DEFAULT_EVENT, id: defaultSessionId(DEFAULT_EVENT) }));
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

  // Pede o armazenamento persistente em silêncio (spec 6.2). Sai uma vez por sessão: o primeiro solve gravado, ou a abertura já
  // instalada. `force` pede de novo (o app acabou de ser instalado). Quem já tem a proteção não pede.
  private askPersistence(force = false): Promise<void> {
    if (this.persistAsked && !force) return Promise.resolve();
    this.persistAsked = true;
    return this.requestProtectionSilently();
  }

  private async requestProtectionSilently(): Promise<void> {
    try {
      // A marca gravada não decide sozinha: vale o que o navegador diz agora.
      if ((await readStorage(this.storageManager)).persisted === true) return;
      await requestPersistence(this.storageManager);
      await this.updateMeta({ persistRequested: true });
    } catch {
      // um pedido em silêncio: sem aviso. Seus dados mostra o estado e oferece o botão.
    }
  }

  // Ao ser instalado (App.svelte), o navegador costuma liberar a proteção: o pedido sai de novo, mesmo já tendo saído nesta sessão.
  retryPersistence(): Promise<void> {
    return this.askPersistence(true);
  }

  // As contas de um solve gravado: entra na lista e soma nos contadores (o que a reação espera). A cópia automática, a cópia na
  // pasta e o lembrete saem depois, em segundo plano na mesma fila: não seguram a reação. Não rejeita: cada falha vira aviso.
  private async afterSave(solve: Solve): Promise<void> {
    this.upsertSolve(solve);
    // Este solve pode ter dado o 9º marco: a conferência entra na fila, depois desta conta.
    if (eventInfo(solve.event).milestones) void this.checkSeason();
    // O repositório revive a sessão do solve se outra aba a mandou para a lixeira, e o aviso local não relê nada: relê as sessões
    // (na fila, depois deste trabalho) quando a sessão do solve não está na lista.
    if (!this.sessions.some((s) => s.id === solve.sessionId)) void this.refreshKinds(['sessions']);
    let counted: Meta;
    try {
      counted = countSolveSaved(this.meta ?? (await within(this.repo.getMeta(), COUNT_DEADLINE_MS)));
      this.meta = counted; // antes de gravar: se a gravação falhar, a contagem em memória continua certa
      this.meta = await within(this.repo.saveMeta(counters(counted)), COUNT_DEADLINE_MS);
    } catch {
      // O solve já está gravado; só a contagem das cópias não foi salva.
      this.showToast(T.data.countFailed);
      return;
    }
    void this.askPersistence();
    // As cópias que demoram de verdade passam do prazo e continuam fora da fila, sem aviso (uma falha delas avisa sozinha, no
    // afterCount). Enquanto uma ainda roda, o solve seguinte não começa outra por cima: a conta pede de novo no próximo.
    void this.serial(async () => {
      if (this.afterCountRunning) return;
      const run = this.afterCount(counted).finally(() => {
        if (this.afterCountRunning === run) this.afterCountRunning = null;
      });
      this.afterCountRunning = run;
      await settlesWithin(run, AFTER_COUNT_DEADLINE_MS);
    });
  }

  // O que vem depois de um solve gravado: cópia automática, cópia na pasta e lembrete. Roda na fila, depois das leituras e gravações
  // que já estavam nela; cada falha vira aviso.
  private async afterCount(counted: Meta): Promise<void> {
    try {
      const plan = planAfterSolve(counted, await this.folderConfigured());
      if (plan.backup) await this.backup(plan.backup);
      // Quem tem conta não vê mais o lembrete de exportar (spec 9.4): a nuvem guarda a cópia.
      if (plan.remindExport && !this.account?.signedIn) this.exportReminder = true;
      if (plan.folderSave) await this.copyToFolder();
    } catch {
      this.showToast(T.data.backupFailed); // o solve já está gravado: o que falhou foi a cópia
    }
  }

  // O solve gravado entra na lista na posição da ordem por tempo. Um solve que já está na lista não entra de novo (a leitura pode
  // tê-lo trazido antes). Chamado na fila: uma leitura que começou antes não o apaga depois.
  private upsertSolve(solve: Solve): void {
    if (solve.deletedAt !== null) return;
    const list = this.solves;
    const at = lowerBound(list, solve);
    if (list[at]?.id === solve.id) return;
    const next = list.slice();
    next.splice(at, 0, solve);
    this.solves = next;
  }

  // A versão editada do solve (penalidade, nota) substitui a que estava na lista. Se o solve não está na lista, nada muda.
  private replaceSolve(solve: Solve): void {
    const i = this.solves.findIndex((s) => s.id === solve.id);
    if (i < 0) return;
    const next = this.solves.slice();
    if (solve.deletedAt !== null) next.splice(i, 1);
    else next[i] = solve;
    this.solves = next;
  }

  // Os excluídos saem da lista numa passada (a ordem dos outros não muda). Se nenhum está na lista, nada muda.
  private removeSolves(ids: readonly string[]): void {
    const gone = new Set(ids);
    if (!this.solves.some((s) => gone.has(s.id))) return;
    this.solves = this.solves.filter((s) => !gone.has(s.id));
  }

  private async backup(reason: 'auto50' | 'daily'): Promise<void> {
    try {
      await createBackup(this.repo, reason, this.now());
      this.meta = await this.repo.getMeta();
    } catch {
      this.showToast(T.data.backupFailed); // a contagem não zera: a próxima tentativa insiste
    }
  }

  private async copyToFolder(): Promise<void> {
    try {
      const handle = (await this.repo.getFolderHandle()) as DirHandleLike | null;
      if (!handle) return;
      // Sem permissão a cópia continua devida, e Ajustes mostra que a permissão expirou (com o botão de pedir de novo).
      const check = ++this.folderCheck;
      const saved = await this.writeFolderCopy(handle, false);
      if (check === this.folderCheck) this.folderNeedsPermission = !saved;
    } catch {
      this.showToast(T.data.folderCopyFailed);
    }
  }

  // "Permitir de novo" (Ajustes). O clique é o gesto que o navegador pede para abrir a janela de permissão. Se a pasta volta a
  // aceitar, grava a cópia devida e tira o aviso. Devolve se gravou.
  async reauthorizeFolder(): Promise<boolean> {
    try {
      const handle = (await this.repo.getFolderHandle()) as DirHandleLike | null;
      if (!handle) return false;
      const check = ++this.folderCheck;
      const saved = await this.writeFolderCopy(handle, true);
      if (check === this.folderCheck) this.folderNeedsPermission = !saved;
      if (!saved) this.showToast(T.data.folderPermissionDenied);
      return saved;
    } catch {
      this.showToast(T.data.folderCopyFailed);
      return false;
    }
  }

  // Grava a cópia na pasta. false: sem permissão (quem chama decide o que mostrar). Uma falha de gravação rejeita.
  private async writeFolderCopy(handle: DirHandleLike, ask: boolean): Promise<boolean> {
    // A permissão vem antes da exportação: sem ela não vale ler tudo (a cada solve, enquanto a cópia está devida), e o pedido
    // precisa sair perto do clique de "Permitir de novo", dentro do gesto.
    const mode = { mode: 'readwrite' } as const;
    let permission = (await handle.queryPermission?.(mode)) ?? 'granted';
    if (permission !== 'granted' && ask && handle.requestPermission) permission = await handle.requestPermission(mode);
    if (permission !== 'granted') return false;
    const now = this.now();
    const text = toKlickJson(await this.repo.exportAll({ includeDeleted: false }));
    if (!(await saveToFolder(handle, backupFileName(now), text, { ask: false }))) return false;
    this.meta = await this.repo.saveMeta({ solvesSinceFolderSave: 0, lastFolderSaveAt: now, lastFolderSaveDay: dayKey(now) });
    return true;
  }

  // Ao abrir: uma pasta que já perdeu a permissão (o navegador a esquece entre visitas) aparece em Ajustes sem esperar a próxima
  // cópia. Não pede nada à pessoa.
  private async checkFolderPermission(): Promise<void> {
    try {
      const check = ++this.folderCheck;
      const handle = (await this.repo.getFolderHandle()) as DirHandleLike | null;
      const needs = handle !== null && !(await folderGranted(handle));
      if (check === this.folderCheck) this.folderNeedsPermission = needs;
    } catch {
      // sem como saber agora: a próxima cópia na pasta diz
    }
  }

  private async folderConfigured(): Promise<boolean> {
    return (await this.repo.getFolderHandle()) !== null;
  }
}

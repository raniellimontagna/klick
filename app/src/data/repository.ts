// Repositório: a única porta para o IndexedDB (esquema em db.ts). Nada aqui conhece a tela.
//
// Gravação: toda escrita passa por write(), uma transação 'readwrite' com durability 'strict' que só resolve depois do commit
// (tx.done). Qualquer falha aborta a transação e rejeita a promessa; a fila de gravação conta com isso para manter o solve
// pendente, então nada é engolido. Os avisos (ouvintes locais e canal entre abas) saem só depois do commit.
//
// Invariante: solve ativo => sessão ativa. Um solve ativo sob uma sessão na lixeira continuaria entrando nas contas por evento,
// mas nenhuma lista de sessões mostraria a sessão dele, e o purge a apagaria de vez. Os caminhos que gravam um solve ativo numa sessão
// que pode estar na lixeira (restoreSolve, restoreSolves, addSolve e importAll) devolvem o registro da sessão na mesma transação, e só ele:
// os outros solves excluídos da sessão continuam na lixeira. Mover e juntar só aceitam uma sessão de destino ativa. replaceAll grava a
// cópia como veio.
//
// Leitura: o que sai do IndexedDB já é cópia. Os padrões (perfil e meta) são montados novos a cada chamada, nunca compartilhados.
import type { IDBPDatabase, IDBPObjectStore, IDBPTransaction, StoreNames } from 'idb';
import { duelsFrom } from '../core/duel/validate';
import { goalsFrom, type Goal } from '../core/goals';
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
import { applyChanges, sameChange, type ApplyOptions, type ApplyResult, type RecordView } from '../core/sync/apply';
import { canonicalJson } from '../core/sync/merge';
import { defaultPrefValue, isPrefValue, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../core/sync/prefs';
import { changeToPref, fromChange, prefToChange, sessionOfChange, stampOf, toChange, type RecordStore, type StampedRecord } from '../core/sync/records';
import { restoreChanges } from '../core/sync/restore';
import { checkChange, isSyncId } from '../core/sync/shape';
import {
  isFloor,
  MAX_STAMP,
  SYNC_STORES,
  syncKey,
  type Change,
  type CopiesPaused,
  type DeviceProfile,
  type OutboxEntry,
  type PrefItem,
  type SyncState,
  type SyncStore,
} from '../core/sync/types';
import { algChoiceFrom, lessonAtFrom, practiceFrom, trainOffFrom } from '../core/trail/validate';
import { defaultSettings } from '../core/types';
import type { Duel, EventId, KlickExport, Meta, Penalty, Practice, Profile, ProfilePatch, SeasonRecord, SeasonState, Session, Solve } from '../core/types';
import { T } from '../strings';
import type { BackupRecord, KlickDB, StoredDuel, StoredPractice, StoredSession, StoredSolve } from './db';
import { defaultSessionId, newId } from './ids';

export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'practice' | 'duels' | 'sync' | 'all';
// De onde veio o aviso: 'local' é desta aba (já está na memória de quem gravou); 'remote' é de outra aba (o canal) ou do servidor (o que o
// sync acabou de juntar: a memória desta aba também precisa reler).
export type ChangeOrigin = 'local' | 'remote';
// `solveIds` vem só nos avisos de solves: quais mudaram (gravados, editados, excluídos, restaurados ou apagados de vez). Sem ele (aviso
// de uma versão antiga do app, ou mudança grande demais), quem ouve relê todos os solves.
export type ChangeListener = (kind: ChangeKind, origin: ChangeOrigin, solveIds?: string[]) => void;
// Acima disso o aviso vai sem ids: ler tantos por id já não sai mais barato que reler tudo.
const MAX_NOTIFY_IDS = 500;

// O que o repositório usa de um BroadcastChannel; testes passam um canal falso.
export interface ChannelLike {
  postMessage(data: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close?(): void;
}

export interface NewSolve {
  id?: string; // quem grava dá o id: uma nova tentativa com o mesmo id não duplica (ver addSolve)
  sessionId: string;
  event: EventId;
  ms: number;
  penalty: Penalty;
  at: number;
  scramble: string;
  phases?: number[]; // a duração de cada fase em ms, somando `ms`; só vai quando o timer marcou fases
}

// O formato do arquivo mora em core/types.ts (o Worker também o escreve); quem importava daqui continua importando.
export type { KlickExport, ProfilePatch } from '../core/types';

export interface ImportReport {
  sessionsAdded: number;
  solvesAdded: number;
  solvesUpdated: number;
  skipped: number;
  // Registros do arquivo (sessões, solves, tentativas e desafios) que o sync recusaria e ficaram de fora (spec 6.6): um id que não serve de
  // chave, um solve cuja sessão não pode existir, um registro grande demais, uma data torta. Só aparece quando há algum.
  refused?: number;
}

export interface Repository {
  listSessions(o?: { includeDeleted?: boolean }): Promise<Session[]>; // ordenadas por order
  // Nome padrão "Sessão N" por evento. `id` é o da sessão padrão (defaultSessionId): vale se ainda não existe registro com ele, e então a
  // sessão nasce com as datas em 1 (perde para qualquer ação de verdade no sync); senão, um id novo e as datas de agora.
  createSession(o: { event: EventId; name?: string; id?: string }): Promise<Session>;
  renameSession(id: string, name: string): Promise<void>; // ignora nome vazio
  deleteSession(id: string): Promise<void>; // marca a sessão e os solves dela
  restoreSession(id: string): Promise<void>; // restaura a sessão e os solves excluídos junto
  listSolves(f?: { sessionId?: string; event?: EventId; includeDeleted?: boolean }): Promise<Solve[]>; // ordem crescente de at
  addSolve(s: NewSolve): Promise<Solve>; // se a sessão está na lixeira (outra aba a excluiu), o registro dela volta na mesma transação: avisa solves e depois sessions
  updateSolve(id: string, patch: { penalty?: Penalty; note?: string }): Promise<Solve>;
  deleteSolve(id: string): Promise<void>;
  restoreSolve(id: string): Promise<void>; // devolve o solve; se a sessão dele está na lixeira, devolve também o registro dela (só ele: os outros solves excluídos da sessão continuam na lixeira)
  // O lote do histórico (plano do histórico inteiro, Task 2), cada um numa transação, com uma data só para o lote inteiro. Um id que não
  // existe, ou que já está no estado pedido, fica de fora; cada um devolve o que mudou, na ordem pedida.
  // Mover: a sessão de destino precisa existir, estar ativa e ser do evento de cada solve, senão rejeita (Error 'move-session' ou
  // 'move-event') e nada grava. O sync aceitaria um solve numa sessão de outro evento (checkChange só olha se há sessionId): quem recusa é
  // aqui. Só o solve ativo muda (o da lixeira fica onde está), e o que já está no destino também fica de fora. Muda a sessão e a data de
  // edição; a exclusão (deletionStamp) fica. Devolve de onde cada um saiu, para o "Desfazer". Com conta, anota de onde cada um saiu (o mapa
  // 'moved'): a exclusão da origem espera a confirmação deles (outboxBatch).
  moveSolves(ids: readonly string[], sessionId: string): Promise<{ id: string; from: string }[]>;
  deleteSolves(ids: readonly string[]): Promise<string[]>; // o lote de deleteSolve
  restoreSolves(ids: readonly string[]): Promise<string[]>; // o lote de restoreSolve: a sessão de um solve que volta, se está na lixeira, volta junto
  // Juntar (spec do histórico, seção 5): as duas ativas e do mesmo evento, senão rejeita (Error 'merge-session' ou 'merge-event') e nada
  // grava; juntar uma sessão com ela mesma também é 'merge-session'. Os solves ativos de `fromId` passam para `toId` e ela vai para a
  // lixeira (com os solves dela que já estavam lá). Na fila, a exclusão dela vai depois das mudanças dos solves, e ela só sobe depois que o
  // servidor confirma cada uma (o mapa 'moved', como em moveSolves). Devolve quantos passaram.
  mergeSessions(fromId: string, toId: string): Promise<number>;
  listTrash(): Promise<{ sessions: Session[]; solves: Solve[]; duels: Duel[] }>; // o excluído mais recentemente primeiro, em cada lista
  // Apaga de vez o excluído antes de now - olderThanMs (no limite exato ainda fica), menos o que espera na fila de saída ou está só neste
  // aparelho (a lista dos recusados pela cota): a marca de exclusão só some depois que o servidor a tem (spec 5.5). Uma sessão só sai depois
  // do último solve dela (fica enquanto algum sobrar, na fila, por vencer ou ativo). Devolve quantos itens (sessões, solves e desafios); as
  // marcas do treino saem junto, sem contar.
  purgeTrash(olderThanMs: number): Promise<number>;
  getProfile(): Promise<Profile>; // padrão se ausente (e não grava o padrão)
  // settings faz merge raso, sound faz merge. Com uma função, o remendo sai do perfil gravado, lido dentro da transação (ela não muda o que
  // recebe; null é "nada a gravar", e a resposta é o perfil gravado): quem muda uma parte pela chave (as metas) não grava por cima do que o
  // sync gravou depois da última leitura da memória.
  saveProfile(patch: ProfilePatch | ((base: Profile) => ProfilePatch | null)): Promise<Profile>;
  // Vira a temporada (spec 5.5) numa transação: só grava se a temporada gravada ainda for fromN. Se outra aba já virou, não grava nem
  // avisa e devolve o perfil gravado.
  advanceSeason(fromN: number, record: SeasonRecord, next: SeasonState): Promise<Profile>;
  getMeta(): Promise<Meta>; // padrão se ausente (deviceId novo), gravado na primeira leitura
  saveMeta(patch: Partial<Meta>): Promise<Meta>;
  // --- Sync (spec 5.3 e 6) ---
  // Até `limit` entradas da fila, as mais antigas primeiro, com o registro atual de cada uma: várias edições do mesmo registro sobem uma vez.
  // O que o servidor recusaria (spec 6.6: um registro de antes da v3 com a própria data torta, por exemplo) não sobe: a entrada sai da fila
  // e vai para o log local, só com store, id e motivo, contada em `refused`. A entrada de um registro que não existe mais também sai, contada
  // em `missing` e no log (store e id). Um solve cuja sessão está só neste aparelho (recusada pela cota) também não sobe, a não ser que a
  // sessão vá antes no mesmo lote: o servidor o aceitaria sem ela, e ele ficaria órfão nos outros aparelhos. Ele sai da fila e entra na lista
  // com ela (contado em `held`, avisa 'sync'), e volta com ela em requeueHeld. A exclusão de uma sessão da qual mover ou juntar tirou solves
  // que o servidor ainda não confirmou (o mapa 'moved') não sobe: com algum deles na fila, ela fica na fila, fora do lote (sem ocupar lugar
  // nele), e o próximo lote confere de novo; com eles só na lista "só neste aparelho", ela entra na lista com eles (contada em `held`) e volta
  // depois deles em requeueHeld. No servidor eles ainda estão nela, e a cascata da exclusão os apagaria.
  outboxBatch(limit: number): Promise<{ changes: Change[]; sent: OutboxEntry[]; refused: number; missing: number; held: number }>;
  // Numa transação (a fila e a lista dos recusados pela cota): tira da fila as entradas que não mudaram desde que saíram. As de `held` (as
  // que a conta recusou pela cota) que saíram da fila entram na lista "só neste aparelho". As de `refused` (recusadas por outro motivo) saem
  // da fila como qualquer recusa, e uma chave da lista continua nela: a conta não tem a versão dela, e apagar os dados continua recusando. As
  // outras (aceitas) saem da lista: a conta tem uma versão delas. Uma entrada gravada de novo durante o pedido fica na fila, e sobe no
  // próximo lote. Avisa 'sync' quando a lista muda. Um solve que saiu da fila e não ficou na lista sai também do mapa dos movidos ('moved').
  confirmSent(sent: readonly OutboxEntry[], held?: readonly OutboxEntry[], refused?: readonly OutboxEntry[]): Promise<void>;
  outboxCount(): Promise<number>;
  // A lista "só neste aparelho" (endurecimento, decisão 4): quantos registros daqui a conta recusou pela cota (de qualquer store, uma
  // exclusão também), fora da fila. Nenhum volta sozinho. Só conta as chaves que têm registro, como localOnlyCount.
  heldCount(): Promise<number>;
  // "Enviar de novo": numa transação, põe na fila o que da lista ainda existe aqui (a sessão antes dos solves dela) e esvazia a lista. Avisa
  // 'sync'. Devolve quantos voltaram para a fila; o servidor recusa de novo se a conta continuar cheia.
  requeueHeld(): Promise<number>;
  countRemoteDeletions(changes: readonly unknown[]): Promise<number>; // quantos solves ativos daqui o lote apagaria (spec 6.6)
  // Junta um lote do servidor (applyChanges, no modo do aparelho): grava o que muda, põe na fila o que a cascata mudou, sobe o relógio e
  // avisa as telas (desta aba e das outras) como uma mudança de fora. `accountId` é a conta da rodada que pediu o lote: se a conta gravada
  // já é outra (ou nenhuma: outra aba apagou os dados ou trocou de conta no meio), lança AccountChangedError, conferido dentro da mesma
  // transação, e nada muda: nem registro, nem fila, nem relógio. Sem ele (os testes do repositório), não confere. `after` é o cursor e a hora
  // do sync desta volta, gravados na mesma transação (e avisados como 'sync'): uma aba que congela entre juntar e gravar o cursor não grava
  // depois o cursor de uma conta no estado de outra. Com algo recusado no lote, grava também `refusedBuild` (a versão do app, `after.build`):
  // o cursor passa por cima do que esta versão não entende, e outra versão o baixa de novo (restartAfterUpdate). `copiesPaused` e
  // `pushAfter`, quando vêm (null inclusive), vão para o estado na mesma transação. Uma chave da lista "só neste aparelho" é juntada como
  // qualquer outra (a regra de conflito de sempre, nunca pulada nem trocada pela daqui) e sai da lista quando a conta já tem o que fica aqui:
  // o resultado é o que chegou, ou está apagado nos dois lados (a cascata do servidor apagou o recusado). Uma exclusão daqui que vence uma
  // versão ativa da conta continua na lista: a conta ainda não a tem. `floorSent`: o piso que foi no pedido e o servidor confirmou (A1); o
  // piso pendente sai do estado na mesma transação, a não ser que outra restauração tenha gravado um mais novo durante o pedido. Um piso
  // pendente torto (que nenhum pedido leva: o servidor o recusaria) também sai, em qualquer volta.
  applyRemote(
    changes: readonly unknown[],
    serverTime: number,
    accountId?: string,
    after?: Pick<SyncState, 'cursor' | 'lastSyncAt'> & { build?: string; copiesPaused?: CopiesPaused | null; pushAfter?: number | null; floorSent?: number },
  ): Promise<RemoteResult>;
  // A primeira rodada de outra versão do app depois de um lote com algo recusado (refusedBuild, de outra versão): o cursor volta a 0 e a marca
  // sai, numa transação, e o sync seguinte baixa a conta inteira de novo (juntar é idempotente), agora com o que esta versão entende. Avisa
  // 'sync'. Devolve se recomeçou; sem a marca, ou com ela desta mesma versão, não faz nada.
  restartAfterUpdate(build: string): Promise<boolean>;
  // O começo do primeiro login (spec 6.5), numa transação só: o estado do sync passa a ser o da conta (accountId, email, signedIn,
  // firstSync, cursor 0, lastSyncAt null; o relógio e o resto ficam) e todo registro daqui entra na fila, menos o que o servidor recusaria
  // (fica fora, no log local como em outboxBatch). Acontecem os dois ou nenhum: o app fechado no meio (ou a cota cheia) não deixa
  // firstSync ligado com a fila vazia, o que faria a deduplicação tomar tudo daqui como da conta, nada subiria, e wipeData passaria a
  // apagar a única cópia. Se falhar, rejeita e nada muda; o motor chama de novo. Avisa 'sync'. Devolve quantos ficaram fora da fila. Com
  // a mesma conta já gravada (o primeiro login dela já começou), não faz nada e devolve 0, sem aviso: o cursor e a fila ficam. Quando começa,
  // a lista "só neste aparelho" se esvazia (o que estava nela entra na fila com o resto, e a conta nova decide), e o orçamento e a pausa das
  // cópias da conta de antes saem do estado.
  beginFirstSync(account: { accountId: string; email: string }): Promise<number>;
  // Depois de baixar a conta inteira no primeiro login (spec 6.5): um solve daqui igual a um da conta, com outro id, e uma sessão daqui vazia
  // com o nome padrão, de um evento que já tem sessão na conta, recebem marca de exclusão e saem da fila. "Daqui" é o que está na fila; "da
  // conta" é o que não está e o servidor aceitaria (um registro daqui que ficou fora da fila por ser torto não é da conta). A nota do solve
  // daqui vai para o da conta, como edição que sobe, se couber no que o servidor aceita. A sessão padrão (`default-<evento>`) só fica quando a
  // conta também a devolveu no download (o id é o mesmo em todo aparelho, e o sync a junta); senão, sai como qualquer "Sessão 1" vazia. Se a
  // sessão atual do aparelho saiu (ou não existe), ele passa para a do mesmo evento com mais solves, e avisa 'profile'. Desliga firstSync na
  // mesma transação: quem chama não grava firstSync: false à parte (o app fechado entre as duas gravações rodaria a deduplicação de novo).
  // Sem firstSync, não faz nada.
  dedupeFirstLogin(): Promise<{ solves: number; sessions: number }>;
  // Apaga os dados deste aparelho (spec 7.6 e 7.7): solves, sessões, treino, desafios, conta, fila e cópias. Ficam os ajustes do aparelho;
  // o estado do sync volta ao padrão, com o relógio. Com mudanças esperando para subir, recusa (PendingChangesError) e não apaga nada
  // (decisão 12): apagar perderia o que ainda não está na conta. Pelo mesmo motivo recusa (LocalOnlyError) com registros que o servidor
  // recusaria, ativos ou na lixeira, ou que a conta recusou pela cota: ficaram fora da fila e só existem aqui (a revisão final, I4, e a
  // decisão 32 do 5a).
  wipeData(): Promise<void>;
  // Quantos registros daqui (solves, sessões, treino, desafios e ajustes da conta, ativos ou na lixeira) só existem neste aparelho: os que
  // o servidor recusaria e os da lista dos recusados pela cota.
  localOnlyCount(): Promise<number>;
  // A conta foi apagada no servidor (spec 7.7): numa transação, o estado do sync volta ao padrão, com o relógio (nenhuma data volta para
  // trás), e a lista "só neste aparelho" se esvazia. Os dados deste aparelho e a fila ficam, fora de qualquer conta. Avisa 'sync': as outras
  // abas também saem da conta.
  forgetAccount(): Promise<void>;
  getSyncState(): Promise<SyncState>; // o bloco sync do meta (spec 5.4); o padrão antes do primeiro login
  // Muda o estado do sync e avisa 'sync'. O relógio só sobe: um clock menor que o gravado, que não é inteiro seguro >= 0 ou que passa do teto
  // (abaixo de MAX_STAMP, ver createSyncClock) é ignorado.
  saveSyncState(patch: Partial<SyncState>): Promise<SyncState>;
  getFolderHandle(): Promise<unknown | null>;
  saveFolderHandle(h: unknown | null): Promise<void>;
  saveBackup(r: BackupRecord): Promise<void>;
  listBackups(): Promise<BackupRecord[]>; // mais recente primeiro
  getBackup(id: string): Promise<BackupRecord | undefined>;
  deleteBackup(id: string): Promise<void>;
  exportAll(o?: { includeDeleted?: boolean }): Promise<KlickExport>; // includeDeleted padrão true (solves, sessões e desafios)
  importAll(data: KlickExport): Promise<ImportReport>; // junta por id; fica o de updatedAt maior, em solves, sessões e desafios (spec 5.5). Sessão da lixeira que recebe solve ativo do arquivo volta (sem entrar no relatório; avisa sessions). O perfil do arquivo vale por cima do daqui (ver importAll). O treino junta pelo id, sem duplicar (fora do relatório, como os desafios). O que o sync recusaria fica de fora, contado em `refused`
  // Restaura a cópia como gravação (spec 5.5): cada registro dela é gravado de novo, com a data do relógio; o que existe aqui e não está nela
  // vai para a lixeira; tudo entra na fila de saída. A temporada fica a mais adiantada (a daqui ou a da cópia). O treino e os desafios trocam
  // junto, se a cópia os tiver. `floor` (a restauração pelo aparelho, A1): a transação tira do relógio o piso, acima de tudo o que o aparelho
  // já viu, grava a restauração com datas acima dele e o guarda como pendingFloor; e o que espera na fila (ou na lista "só neste aparelho") e
  // a restauração deixa como está ganha a data dela, acima do piso.
  replaceAll(data: KlickExport, o?: { floor?: boolean }): Promise<void>;
  onChange(fn: ChangeListener): () => void; // mudanças locais e de outras abas, com a origem (e, nos solves, os ids que mudaram)
  getSolves(ids: readonly string[]): Promise<(Solve | undefined)[]>; // vários solves por id numa leitura; o que não existe vem undefined
  // O treino (spec do sub-projeto 4, seção 9.1). Cada escrita avisa 'practice'. A tela só usa update e delete na correção da última.
  addPractice(p: Practice): Promise<Practice>; // pelo id de quem grava: uma nova tentativa com o mesmo id devolve a gravada, sem duplicar
  listPractice(f?: { caseId?: string }): Promise<Practice[]>; // em ordem de at; com caseId, só as daquele caso
  updatePractice(id: string, patch: { ok?: boolean }): Promise<Practice>;
  deletePractice(id: string): Promise<void>;
  // Os desafios (spec do desafio, seção 7): um registro por lado da partida, fora dos solves (nada deles entra nas estatísticas). Cada
  // escrita que muda algo avisa 'duels'.
  listDuels(o?: { includeDeleted?: boolean }): Promise<Duel[]>; // os mais novos primeiro (pela criação)
  getDuel(id: string): Promise<Duel | null>; // também o da lixeira (deletedAt diz); null se não existe
  // Cria ou substitui pelo id, que tem de ser `${linkId}-${side}` (senão lança e nada grava). As datas são as do relógio do sync: a criação
  // fica a do registro gravado, e um desafio da lixeira volta ativo, com uma marca nova. Com `expectUpdatedAt`, só grava se o registro
  // gravado tem essa data (null: só se ele não existe), conferido dentro da transação; senão lança DuelConflictError e nada grava.
  saveDuel(d: Omit<Duel, 'createdAt' | 'updatedAt' | 'deletedAt'>, o?: { expectUpdatedAt?: number | null }): Promise<Duel>;
  // Para a lixeira, como um solve; lança se não existe. `expectUpdatedAt`, como em saveDuel.
  deleteDuel(id: string, o?: { expectUpdatedAt?: number }): Promise<void>;
  restoreDuel(id: string): Promise<void>; // volta da lixeira; lança se não existe
  close(): void; // fecha a conexão do banco e o canal; depois disso o repositório não responde mais (usado ao trocar pela conexão reaberta)
}

const CHANNEL_NAME = 'klick-data';
const CHANGE_KINDS: readonly string[] = ['solves', 'sessions', 'profile', 'meta', 'practice', 'duels', 'sync', 'all'];
const TRAIL_LENGTH = 9;
const DEFAULT_SESSION_STAMP = 1; // as datas da sessão padrão (createSession com `id`): fixas, iguais em todo aparelho e antes de qualquer ação

const isChangeKind = (v: unknown): v is ChangeKind => typeof v === 'string' && CHANGE_KINDS.includes(v);

// BroadcastChannel não existe em todo ambiente, e o construtor pode lançar (iframe isolado). Sem canal, só os avisos locais saem.
function defaultChannel(): ChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME) as unknown as ChannelLike;
  } catch {
    return null;
  }
}

// onError padrão: o erro sai do repositório e reaparece numa microtask (no navegador, como erro não tratado), sem desfazer
// uma gravação que já foi confirmada. Mesmo padrão do timer.
const rethrowLater = (err: unknown): void =>
  queueMicrotask(() => {
    throw err;
  });

const META_DEFAULTS: Omit<Meta, 'deviceId'> = Object.freeze({
  schemaVersion: 1,
  lastBackupAt: null,
  solvesSinceBackup: 0,
  lastBackupDay: null,
  lastExportAt: null,
  solvesSinceExport: 0,
  lastFolderSaveAt: null,
  solvesSinceFolderSave: 0,
  lastFolderSaveDay: null,
  v1ImportOffered: false,
  persistRequested: false,
  installGuideDismissed: false,
  trailPromptDismissed: false,
});

function defaultProfile(): Profile {
  return {
    settings: defaultSettings(), // cópia mutável: o DEFAULT_SETTINGS é congelado
    trail: Array<boolean>(TRAIL_LENGTH).fill(false),
    finish: 'fosco',
    onboarded: false,
    currentSessionId: null,
    season: defaultSeason(),
    lessonAt: {},
    algChoice: {},
    trainOff: [],
    duelName: '',
    goals: {},
  };
}

// Tira as chaves com undefined: `{ finish: undefined }` não pode apagar o que está gravado.
function definedOnly<O extends object>(o: O | undefined): Partial<O> {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<O>;
}

function mergeProfile(base: Profile, patch: ProfilePatch | undefined): Profile {
  const { settings, ...rest } = patch ?? {};
  return {
    ...base,
    ...definedOnly(rest),
    settings: { ...base.settings, ...definedOnly(settings), sound: { ...base.settings.sound, ...definedOnly(settings?.sound) } },
  };
}

// As metas de um arquivo importado juntam com as daqui pela vaga (estatísticas, spec 5): entra a que só o arquivo tem; na mesma vaga fica a
// daqui. Se as duas são a mesma meta (tipo, evento e alvo iguais), ela fica com a data de alcance mais antiga das duas (o alcance não volta
// atrás); com outra definição (editada num dos lados, como em remakeGoal) é outra meta, e a data de lá não vale para a daqui. Sem o teto de
// metas vivas: como o sync, importar não tira meta nenhuma. As daqui vêm primeiro, e um arquivo com as mesmas metas devolve o mesmo objeto,
// chave por chave.
function joinGoals(mine: Profile['goals'], theirs: Profile['goals'] | undefined): Profile['goals'] {
  const out = { ...mine };
  for (const [id, goal] of Object.entries(theirs ?? {})) {
    const here: Goal | undefined = out[id];
    if (!here) {
      out[id] = goal;
      continue;
    }
    const same = here.kind === goal.kind && here.event === goal.event && here.targetMs === goal.targetMs;
    if (same && goal.reachedAt !== null && (here.reachedAt === null || goal.reachedAt < here.reachedAt)) out[id] = { ...here, reachedAt: goal.reachedAt };
  }
  return out;
}

// O perfil da tela (spec 5.2): os ajustes do aparelho (store profile) mais os itens da conta (store prefs), com os padrões por baixo.
const composeProfile = (device: DeviceProfile | undefined, items: readonly PrefItem[]): Profile => joinProfile(device, profileFromPrefs(items));

// O que a tela recebe: os registros sem as datas do sync (só o repositório e o sync as usam).
const bareSolve = ({ deletionStamp: _d, ...solve }: StoredSolve): Solve => solve;
const bareSession = ({ deletionStamp: _d, ...session }: StoredSession): Session => session;
const barePractice = ({ updatedAt: _u, deletedAt: _x, deletionStamp: _d, ...practice }: StoredPractice): Practice => practice;
const bareDuel = ({ deletionStamp: _d, ...duel }: StoredDuel): Duel => duel;

// O deletionStamp de um solve ou sessão que vem de um arquivo importado. Num registro novo, como na migração (spec 5.6):
// a marca de exclusão ou a criação. Num que já existe, o daqui quando o estado de exclusão não muda; quando muda, a data do arquivo
// (excluir e restaurar mexem em updatedAt), para a exclusão ou a volta que o arquivo traz também valer no sync. A data do arquivo passa
// por stampOf: o servidor só aceita inteiros seguros >= 0.
function importedStamp(
  local: { deletedAt: number | null; deletionStamp: number } | undefined,
  incoming: { deletedAt: number | null; createdAt: number; updatedAt: number },
): number {
  if (!local) return stampOf(incoming.deletedAt ?? incoming.createdAt);
  return local.deletedAt === incoming.deletedAt ? local.deletionStamp : stampOf(incoming.updatedAt);
}

// Uma tentativa que vem de um arquivo importado ganha as datas como na migração (spec 5.6): o instante dela.
const importedPractice = (p: Practice): StoredPractice => ({ ...p, updatedAt: stampOf(p.at), deletedAt: null, deletionStamp: stampOf(p.at) });

// Até quanto à frente do relógio do aparelho uma data importada pode estar: um relógio um pouco adiantado (no aparelho que exportou, ou no
// csTimer) passa. Além disso, a data subiria pelo sync o relógio de todos os aparelhos até ela (spec 5.4): uma do ano 3000 os adiantaria
// em mil anos, e 2^53 - 1 os travaria (o seguinte não é inteiro seguro, e toda gravação depois seria recusada).
const IMPORT_FUTURE_MS = 24 * 60 * 60 * 1000;

// As datas de um registro importado servem ao sync tal como vieram? Inteiros seguros >= 0 e no máximo `limit` (agora mais um dia). Nada é
// ajustado: uma data com fração, negativa, no futuro ou além do maior inteiro seguro deixa o registro de fora, contado em refused.
const isFileDate = (v: unknown, limit: number): boolean => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= limit;
const fileDatesOk = (r: { createdAt: unknown; updatedAt: unknown; deletedAt: unknown }, limit: number): boolean =>
  isFileDate(r.createdAt, limit) && isFileDate(r.updatedAt, limit) && (r.deletedAt === null || isFileDate(r.deletedAt, limit));

// O servidor aceitaria o registro como ele vai para a fila? Um registro do app nunca é recusado (spec 6.6): o que não passaria (um id que
// não serve de chave, um campo fora do tipo, um registro grande demais) não entra pelo import.
const syncable = (store: RecordStore, record: StampedRecord): boolean => checkChange(toChange(store, record)).ok;

// O estado do sync antes do primeiro login (spec 5.4).
export const defaultSyncState = (): SyncState => ({
  accountId: null,
  email: null,
  signedIn: false,
  firstSync: false,
  firstSyncDefaults: [],
  cursor: 0,
  lastSyncAt: null,
  clock: 0,
  passkey: false,
  refusedBuild: null,
  pushAfter: null,
  copiesPaused: null,
  pendingFloor: null,
});
const syncStateOrDefault = (stored: SyncState | undefined): SyncState => ({ ...defaultSyncState(), ...stored });

// O relógio fica abaixo do teto do sync (MAX_STAMP, o mesmo que o servidor confere): assim clock + 1, a próxima data, ainda é aceita. Um
// relógio no teto, ou perto de 2^53, faria o servidor recusar em silêncio toda gravação seguinte deste aparelho.
const isClockValue = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) < MAX_STAMP;

// O relógio de uma escrita do sync (spec 5.4), a partir do gravado. `stamp()` é a data da escrita, max(agora, clock + 1), a mesma enquanto
// o relógio não sobe; `raise(at)` sobe o relógio até `at` (a hora do servidor, as datas recebidas), e o stamp() seguinte já sai depois
// dele. O que não é inteiro seguro >= 0, ou chega a MAX_STAMP, não sobe nada. `value()` é o relógio a gravar.
export interface SyncClock {
  stamp(): number;
  raise(at: number): void;
  value(): number;
}
export function createSyncClock(start: number, now: () => number): SyncClock {
  let clock = start;
  let at: number | null = null;
  return {
    stamp: () => (at ??= clock = Math.max(now(), clock + 1)),
    raise: (to) => {
      if (!isClockValue(to) || to <= clock) return;
      clock = to;
      at = null; // uma data já dada nesta escrita ficou para trás
    },
    value: () => clock,
  };
}

// O que uma escrita acompanhada pelo sync recebe (syncWrite): a próxima data do relógio, a fila de saída e o estado do sync.
interface SyncCtx {
  stamp(): number; // a data desta escrita: max(agora, clock + 1), nunca menor que uma data já vista (spec 5.4); muda só depois de um raise
  track(store: SyncStore, id: string): Promise<void>; // põe o registro na fila de saída, se o aparelho tem conta (spec 5.3), com a data desta escrita
  raise(at: number): void; // o relógio sobe até `at` (a hora do servidor e as datas recebidas, spec 5.4); ver createSyncClock
  state(): SyncState; // o estado do sync nesta transação (o gravado, com o que setState mudou)
  // Muda o estado do sync na mesma transação (gravado no fim, com o relógio). O track seguinte já usa o novo accountId.
  setState(patch: Partial<Omit<SyncState, 'clock'>>): void;
}

// Um lote do servidor, como o motor recebe e o repositório junta (spec 6.1).
export interface RemoteResult {
  applied: number; // registros que mudaram aqui
  rejected: number; // mudanças tortas, ignoradas
}

// A conta mudou durante uma rodada do sync (saiu, apagou os dados, trocou; nesta aba ou noutra): a volta do servidor não é confirmada nem
// juntada. O repositório a lança de dentro de applyRemote; o motor, nas conferências dele.
export class AccountChangedError extends Error {
  constructor() {
    super('a conta mudou durante a rodada');
    this.name = 'AccountChangedError';
  }
}

// saveDuel ou deleteDuel com `expectUpdatedAt`, e o registro gravado não é mais o que quem chama leu: outra aba, o sync, uma restauração ou
// um wipe passaram na frente (a revisão da Task 5 do desafio). Nada foi gravado; `stored` é o que está gravado agora (null: não existe).
export class DuelConflictError extends Error {
  readonly stored: Duel | null;
  constructor(stored: Duel | null) {
    super('o desafio gravado mudou');
    this.name = 'DuelConflictError';
    this.stored = stored;
  }
}

// wipeData com mudanças esperando para subir (decisão 12): quem chama mostra o porquê.
export class PendingChangesError extends Error {
  constructor() {
    super('Há mudanças esperando para subir: apagar os dados deste aparelho as perderia');
    this.name = 'PendingChangesError';
  }
}

// wipeData com registros que o servidor recusaria (a revisão final, I4): eles só existem aqui. `count` vai para o aviso.
export class LocalOnlyError extends Error {
  readonly count: number;
  constructor(count: number) {
    super('Há registros que só existem neste aparelho: apagar os dados deste aparelho os perderia');
    this.name = 'LocalOnlyError';
    this.count = count;
  }
}

// A lista "só neste aparelho" (meta 'held'): as chaves que a conta recusou pela cota, cada uma uma vez. O que não for uma lista de textos
// vale vazia.
const heldList = (stored: unknown): string[] =>
  Array.isArray(stored) ? [...new Set(stored.filter((k): k is string => typeof k === 'string'))] : [];
const heldOf = async (tx: SyncTx): Promise<string[]> => heldList(await tx.objectStore('meta').get('held'));
// Grava a lista, sem repetir chave (um guardado que voltou à fila por uma edição pode ser guardado de novo); vazia, a chave sai do meta.
async function saveHeld(tx: WriteTx, keys: Iterable<string>): Promise<void> {
  const list = [...new Set(keys)];
  if (list.length > 0) await tx.objectStore('meta').put(list, 'held');
  else await tx.objectStore('meta').delete('held');
}
// Os solves movidos que o servidor ainda não confirmou, pela sessão de onde saíram (meta 'moved'; a revisão final do histórico, C1 e I1).
// A exclusão de uma sessão espera enquanto algum solve que saiu dela ainda está na fila ou na lista "só neste aparelho": no servidor ele
// ainda está nela, e a cascata da exclusão o apagaria (a mudança de sessão, que chega depois, perde para ela). Só existe neste aparelho e
// nunca sobe. O que não for um mapa de listas de textos vale vazio.
type MovedFrom = Map<string, string[]>;
function movedList(stored: unknown): MovedFrom {
  const moved: MovedFrom = new Map();
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return moved;
  for (const [sid, ids] of Object.entries(stored)) {
    const list = Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))] : [];
    if (list.length > 0) moved.set(sid, list);
  }
  return moved;
}
const movedOf = async (tx: SyncTx): Promise<MovedFrom> => movedList(await tx.objectStore('meta').get('moved'));
// Grava o mapa sem as listas vazias; vazio, a chave sai do meta.
async function saveMoved(tx: WriteTx, moved: MovedFrom): Promise<void> {
  const kept = [...moved].filter(([, ids]) => ids.length > 0);
  if (kept.length > 0) await tx.objectStore('meta').put(Object.fromEntries(kept), 'moved');
  else await tx.objectStore('meta').delete('moved');
}
// Tira do mapa os solves que já não esperam (confirmados pelo servidor, ou fora da fila de vez). Diz se mudou.
function forgetMoved(moved: MovedFrom, settled: ReadonlySet<string>): boolean {
  let changed = false;
  for (const [sid, ids] of moved) {
    const left = ids.filter((id) => !settled.has(id));
    if (left.length === ids.length) continue;
    changed = true;
    if (left.length > 0) moved.set(sid, left);
    else moved.delete(sid);
  }
  return changed;
}
// Mover e juntar anotam de onde saiu cada solve, na mesma transação, só com conta, como a fila (track): sem conta nada sobe, e o primeiro
// login põe tudo na fila de uma vez.
async function noteMoved(tx: WriteTx, ctx: SyncCtx, moves: readonly { id: string; from: string }[]): Promise<void> {
  if (ctx.state().accountId === null || moves.length === 0) return;
  const moved = await movedOf(tx);
  const added = new Map<string, Set<string>>();
  for (const { id, from } of moves) added.set(from, (added.get(from) ?? new Set(moved.get(from))).add(id));
  for (const [sid, ids] of added) moved.set(sid, [...ids]);
  await saveMoved(tx, moved);
}

// A store e o id de uma chave `${store}/${id}` (um id do sync não tem '/'); null se a store não é do sync.
function keyParts(key: string): { store: SyncStore; id: string } | null {
  const at = key.indexOf('/');
  const store = key.slice(0, at);
  if (at < 0 || !(SYNC_STORES as readonly string[]).includes(store)) return null;
  return { store: store as SyncStore, id: key.slice(at + 1) };
}

// Todos os registros daqui das stores do sync (os ativos e os da lixeira), como mudanças (spec 6.1).
async function syncedRecords(tx: SyncTx): Promise<Change[]> {
  const [solves, sessions, practice, duels, prefs] = await Promise.all([
    tx.objectStore('solves').getAll(),
    tx.objectStore('sessions').getAll(),
    tx.objectStore('practice').getAll(),
    tx.objectStore('duels').getAll(),
    tx.objectStore('prefs').getAll(),
  ]);
  return [
    ...solves.map((r) => toChange('solves', r)),
    ...sessions.map((r) => toChange('sessions', r)),
    ...practice.map((r) => toChange('practice', r)),
    ...duels.map((r) => toChange('duels', r)),
    ...prefs.map(prefToChange),
  ];
}

// Grava uma mudança do sync no registro daqui, na store dela (juntar um lote, restaurar uma cópia).
function putChange(tx: WriteTx, c: Change): Promise<unknown> {
  switch (c.store) {
    case 'prefs':
      return tx.objectStore('prefs').put(changeToPref(c));
    case 'solves':
      return tx.objectStore('solves').put(fromChange<StoredSolve>(c));
    case 'sessions':
      return tx.objectStore('sessions').put(fromChange<StoredSession>(c));
    case 'practice':
      return tx.objectStore('practice').put(fromChange<StoredPractice>(c));
    case 'duels':
      return tx.objectStore('duels').put(fromChange<StoredDuel>(c));
  }
}

// Os registros daqui que só existem neste aparelho, numa transação que lê as stores do sync e o meta: os que o servidor recusaria (spec 6.6)
// e os da lista dos recusados pela cota (uma chave da lista sem registro não conta).
async function countLocalOnly(tx: SyncTx): Promise<number> {
  const [changes, held] = await Promise.all([syncedRecords(tx), heldOf(tx)]);
  const only = new Set(changes.filter((c) => !checkChange(c).ok).map((c) => syncKey(c.store, c.id)));
  const present = new Set(changes.map((c) => syncKey(c.store, c.id)));
  for (const key of held) if (present.has(key)) only.add(key);
  return only.size;
}

// Uma mudança com store do sync e id de texto: dá para procurar o registro daqui (o resto, applyChanges confere).
const isKeyed = (c: unknown): c is Change =>
  typeof c === 'object' && c !== null && (SYNC_STORES as readonly unknown[]).includes((c as Change).store) && typeof (c as Change).id === 'string';
// A marca de um solve para a deduplicação do primeiro login (spec 6.5): evento, instante, tempo, penalidade e embaralhamento. Tem de ser a
// mesma do script do Supabase da v1 (`mark`, em scripts/v1-supabase-map.mjs): o mesmo solve dos dois lados precisa dar a mesma marca.
export const fingerprint = (s: Solve): string => JSON.stringify([s.event, s.at, s.ms, s.penalty, s.scramble]);
// A sessão padrão (defaultSessionId): o mesmo id em todo aparelho novo, que o sync junta. A deduplicação só a manda para a lixeira quando a
// conta não a tem (dedupeFirstLogin).
const isDefaultSession = (id: string): boolean => id.startsWith(defaultSessionId(''));
// A nota do solve da conta depois de receber a de um gêmeo daqui (spec 6.5): vazia lá, fica a daqui; vazia aqui ou igual, nada muda;
// diferentes, as duas.
const isBlank = (note: unknown): boolean => typeof note !== 'string' || note.trim() === '';
const joinedNote = (theirs: string, mine: string): string => {
  if (isBlank(mine) || mine === theirs) return theirs;
  return isBlank(theirs) ? mine : `${theirs} / ${mine}`;
};
const metaOrNew = (stored: Meta | undefined, at: number): Meta =>
  stored ? { ...META_DEFAULTS, ...stored } : { ...META_DEFAULTS, deviceId: newId(at) };

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const distinct = (ids: readonly string[]): string[] => [...new Set(ids)]; // um id repetido no lote conta uma vez
const bySessionOrder = (a: Session, b: Session): number => a.order - b.order || a.createdAt - b.createdAt || compareText(a.id, b.id);
const bySolveTime = (a: Solve, b: Solve): number => a.at - b.at || compareText(a.id, b.id);
const byPracticeTime = (a: Practice, b: Practice): number => a.at - b.at || compareText(a.id, b.id);
const byDuelCreated = (a: Duel, b: Duel): number => a.createdAt - b.createdAt || compareText(a.id, b.id);
const newestDeletedFirst = (a: { id: string; deletedAt: number | null }, b: { id: string; deletedAt: number | null }): number =>
  (b.deletedAt ?? 0) - (a.deletedAt ?? 0) || compareText(a.id, b.id);

// Faixa de um índice composto [chave, at]: todos os `at` daquela chave.
const keyRange = (key: string): IDBKeyRange => IDBKeyRange.bound([key, -Infinity], [key, Infinity]);

// Dispara os pedidos de uma vez (dentro da transação o IndexedDB os executa em ordem) e espera todos. Se um deles lançar na
// hora (DataCloneError, por exemplo), os que já saíram são dados como tratados: a transação vai abortar, eles falhariam e
// ninguém estaria ouvindo.
async function each<V>(items: readonly V[], request: (item: V) => Promise<unknown>): Promise<void> {
  const pending: Promise<unknown>[] = [];
  try {
    for (const item of items) pending.push(request(item));
  } catch (err) {
    void Promise.allSettled(pending);
    throw err;
  }
  await Promise.all(pending);
}

// O que reviveSession usa da store de sessões, dentro de uma transação de escrita.
type SessionStore = Pick<IDBPObjectStore<KlickDB, StoreNames<KlickDB>[], 'sessions', 'readwrite'>, 'get' | 'put'>;
type WriteTx = IDBPTransaction<KlickDB, StoreNames<KlickDB>[], 'readwrite'>;
type SyncTx = IDBPTransaction<KlickDB, StoreNames<KlickDB>[], 'readonly' | 'readwrite'>;

// Mantém o invariante (ver o topo do arquivo) quando a transação grava um solve ativo: se a sessão dele está na lixeira, devolve o
// registro dela, e só ele. Diz se a sessão voltou. Um sessionId que não é string nem é consultado: uma chave inválida lança
// DataError no IndexedDB e desfaria a gravação do próprio solve, que não pode se perder por isso.
async function reviveSession(sessions: SessionStore, sessionId: unknown, ctx: SyncCtx): Promise<boolean> {
  if (typeof sessionId !== 'string') return false;
  const session = await sessions.get(sessionId);
  if (!session || session.deletedAt === null) return false;
  const at = ctx.stamp();
  await sessions.put({ ...session, deletedAt: null, updatedAt: at, deletionStamp: at });
  await ctx.track('sessions', sessionId);
  return true;
}

// Grava o perfil inteiro `next` por cima de `base` (os dois montados por composeProfile): os ajustes do aparelho na store profile e,
// da conta, só as chaves que mudaram, com a data do relógio. Uma chave que some (uma aula concluída, uma escolha que volta ao padrão)
// grava o valor padrão: a mudança precisa viajar. O perfil do aparelho é gravado sempre que muda ou ainda não existe: um perfil salvo sai
// no export, como antes da divisão. Restaurar uma cópia grava todas as chaves por outro caminho (restoreChanges, em replaceAll).
async function writeProfile(tx: WriteTx, base: Profile, next: Profile, ctx: SyncCtx): Promise<void> {
  const before = splitProfile(base);
  const after = splitProfile(next);
  const profile = tx.objectStore('profile');
  if (canonicalJson(before.device) !== canonicalJson(after.device) || (await profile.count('current')) === 0) await profile.put(after.device, 'current');
  const old = prefsFromProfile(before.account, { withDefaults: true });
  const now = prefsFromProfile(after.account, { withDefaults: true });
  const prefs = tx.objectStore('prefs');
  for (const key of new Set([...old.keys(), ...now.keys()])) {
    const value = now.has(key) ? now.get(key) : defaultPrefValue(key);
    if (canonicalJson(value) === canonicalJson(old.has(key) ? old.get(key) : defaultPrefValue(key))) continue;
    await prefs.put({ key, value, updatedAt: ctx.stamp() });
    await ctx.track('prefs', key);
  }
}

// O registro daqui de uma chave do sync, como mudança (spec 6.1); undefined se não existe. Uma store fora do sync (uma entrada da fila
// torta) não tem registro: pedi-la à transação lançaria e derrubaria a rodada inteira.
async function recordOf(tx: SyncTx, store: SyncStore, id: string): Promise<Change | undefined> {
  if (store === 'prefs') {
    const item = await tx.objectStore('prefs').get(id);
    return item && prefToChange(item);
  }
  if (!(SYNC_STORES as readonly string[]).includes(store)) return undefined;
  const record = await tx.objectStore(store).get(id);
  return record && toChange(store, record);
}

// Junta um lote com os registros daqui (spec 6.3). applyChanges é síncrono, então a vista é um mapa lido antes: os registros do lote e as
// sessões deles (a do solve que chega e a do solve gravado, que pode ser outra). Os solves de uma sessão só são lidos quando applyChanges
// os pede (a cascata, numa sessão excluída), e ele roda de novo com eles: no primeiro sync de uma conta grande, nenhuma sessão ativa tem
// os solves lidos à toa. O que ele pede na segunda vez já foi lido (as sessões vêm do lote e da vista, não dos solves), então são duas
// voltas no máximo.
async function joinIn(tx: SyncTx, changes: readonly unknown[], opts: ApplyOptions): Promise<ApplyResult> {
  const records = new Map<string, Change>();
  const remember = (c: Change | undefined): void => {
    if (c) records.set(syncKey(c.store, c.id), c);
  };
  const sessions = new Set<string>();
  await Promise.all(
    changes.filter(isKeyed).map(async (c) => {
      const record = await recordOf(tx, c.store, c.id);
      remember(record);
      if (c.store === 'sessions') sessions.add(c.id);
      for (const sid of [sessionOfChange(c), record && sessionOfChange(record)]) if (sid) sessions.add(sid);
    }),
  );
  await Promise.all([...sessions].map(async (sid) => remember(await recordOf(tx, 'sessions', sid))));
  const bySession = new Map<string, Change[]>();
  const asked = new Set<string>();
  const view: RecordView = {
    get: (store, id) => records.get(syncKey(store, id)),
    solvesOf: (sid) => {
      const solves = bySession.get(sid);
      if (solves) return solves;
      asked.add(sid);
      return [];
    },
  };
  let result = applyChanges(view, changes, opts);
  while (asked.size > 0) {
    const sids = [...asked];
    asked.clear();
    await Promise.all(
      sids.map(async (sid) => {
        const solves = (await tx.objectStore('solves').index('bySession').getAll(keyRange(sid))).map((s) => toChange('solves', s));
        bySession.set(sid, solves);
        solves.forEach(remember);
      }),
    );
    result = applyChanges(view, changes, opts);
  }
  return result;
}

// Uma linha do log local para o que o servidor recusaria (spec 6.6): store, id e motivo, nunca o conteúdo (spec 8.5).
const refusalLine = (store: SyncStore, id: string, reason: string): string => `sync: fora da fila, o servidor recusaria ${syncKey(store, id)} (${reason})`;
const missingLine = (store: SyncStore, id: string): string => `sync: fora da fila, o registro não existe mais: ${syncKey(store, id)}`;

// Quem assina os avisos entre abas: um id e uma sequência que sobe de um em um. A página cria um e o passa a cada conexão que abre
// (boot.ts): uma reabertura continua a mesma sequência, e a outra aba não confunde a reabertura com um remetente novo.
export interface ChangeSender {
  id: string;
  next(): number;
}

export function createSender(now: () => number = () => Date.now()): ChangeSender {
  const id = newId(now());
  let seq = 0;
  return { id, next: () => ++seq };
}

export function createRepository(
  db: IDBPDatabase<KlickDB>,
  {
    now = () => Date.now(),
    channel = defaultChannel(),
    onError = rethrowLater,
    sender = createSender(now),
    log = (line: string) => console.warn(line),
  }: {
    now?: () => number;
    sender?: ChangeSender; // omitido: um só desta conexão
    channel?: ChannelLike | null; // omitido: BroadcastChannel('klick-data') se o ambiente tiver; null: sem canal
    onError?: (err: unknown) => void; // erro de um ouvinte ou do envio ao canal; a gravação já foi confirmada. Se ele lançar, o erro sai por relançar-depois
    log?: (line: string) => void; // o log local do sync (spec 6.6 e 8.5): store, id, contagens e motivos, nunca o conteúdo de um registro
  } = {},
): Repository {
  const listeners = new Set<{ fn: ChangeListener }>();
  let closed = false; // depois de close(), os ouvintes daqui não recebem mais nada
  let channelClosed = false; // o canal fecha depois do close(), quando as gravações em andamento terminarem e avisarem
  let inflight = 0; // gravações em andamento (de write): o canal espera por elas
  // Cada aviso leva quem enviou e um número em sequência: quem ouve percebe um aviso perdido (um número pulado) e relê tudo.
  const lastSeq = new Map<string, number>();
  function post(message: { kind: ChangeKind; solveIds?: string[] }): void {
    if (channelClosed || !channel) return;
    try {
      channel.postMessage({ ...message, from: sender.id, seq: sender.next() });
    } catch (err) {
      reportError(err);
    }
  }
  // Fecha o canal numa tarefa seguinte: o aviso de uma gravação que acabou de terminar sai antes (ele vem logo depois do commit).
  function closeChannelSoon(): void {
    setTimeout(() => {
      if (channelClosed || inflight > 0) return;
      channelClosed = true;
      if (channel) channel.onmessage = null;
      channel?.close?.();
    }, 0);
  }

  // O onError é de quem usa o repositório. Se ele mesmo lançar, o erro não pode rejeitar uma gravação já confirmada (a fila
  // gravaria de novo e duplicaria o solve): o erro que ele recebia e o que ele lançou saem juntos pelo relançar-depois.
  function reportError(err: unknown): void {
    try {
      onError(err);
    } catch (failure) {
      rethrowLater(new AggregateError([err, failure], 'onError lançou ao receber um erro'));
    }
  }

  function emit(kind: ChangeKind, origin: ChangeOrigin, solveIds?: string[]): void {
    for (const entry of [...listeners]) {
      if (!listeners.has(entry)) continue; // saiu durante este aviso
      try {
        entry.fn(kind, origin, solveIds);
      } catch (err) {
        reportError(err);
      }
    }
  }

  // Só depois do commit. Aviso que chega de outra aba vai aos ouvintes daqui e não volta ao canal.
  function announce(...kinds: ChangeKind[]): void {
    for (const kind of kinds) {
      if (!closed) emit(kind, 'local');
      post({ kind });
    }
  }

  // O aviso de solves, com os ids que mudaram (até MAX_NOTIFY_IDS; acima disso vai sem, e quem ouve relê tudo).
  function announceSolves(ids: readonly string[]): void {
    const solveIds = ids.length <= MAX_NOTIFY_IDS ? [...ids] : undefined;
    if (!closed) emit('solves', 'local', solveIds);
    post(solveIds ? { kind: 'solves', solveIds } : { kind: 'solves' });
  }

  // O aviso do que o sync gravou (um lote do servidor, a deduplicação): chega às telas desta aba como mudança de fora ('remote'), porque a
  // memória delas não sabe dele, e vai às outras abas pelo canal. Solves primeiro, com os ids, e depois sessões, treino, desafios e perfil.
  function announceSynced(writes: readonly { store: SyncStore; id: string }[]): void {
    const solveIds = writes.filter((c) => c.store === 'solves').map((c) => c.id);
    if (solveIds.length > 0) {
      const ids = solveIds.length <= MAX_NOTIFY_IDS ? solveIds : undefined;
      if (!closed) emit('solves', 'remote', ids);
      post(ids ? { kind: 'solves', solveIds: ids } : { kind: 'solves' });
    }
    const stores = new Set(writes.map((c) => c.store));
    const kinds: ChangeKind[] = [];
    if (stores.has('sessions')) kinds.push('sessions');
    if (stores.has('practice')) kinds.push('practice');
    if (stores.has('duels')) kinds.push('duels');
    if (stores.has('prefs')) kinds.push('profile');
    for (const kind of kinds) {
      if (!closed) emit(kind, 'remote');
      post({ kind });
    }
  }

  if (channel) {
    channel.onmessage = (ev) => {
      const data = ev?.data as { kind?: unknown; solveIds?: unknown; from?: unknown; seq?: unknown } | null | undefined;
      const kind = data?.kind;
      if (!isChangeKind(kind)) return;
      // O próprio remetente: a conexão velha desta mesma aba terminando uma gravação. O que ela gravou esta aba já tem na memória.
      if (data?.from === sender.id) return;
      // Um número pulado de quem enviou: algum aviso se perdeu, então tudo é relido (o 'all' cobre este aviso também).
      if (typeof data?.from === 'string' && typeof data.seq === 'number') {
        const prev = lastSeq.get(data.from);
        lastSeq.set(data.from, data.seq);
        if (prev !== undefined && data.seq !== prev + 1) {
          emit('all', 'remote');
          return;
        }
      }
      const ids = data?.solveIds;
      const solveIds = kind === 'solves' && Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? (ids as string[]) : undefined;
      emit(kind, 'remote', solveIds);
    };
  }

  async function write<S extends StoreNames<KlickDB>[], R>(
    stores: S,
    work: (tx: IDBPTransaction<KlickDB, S, 'readwrite'>) => Promise<R>,
  ): Promise<R> {
    const tx = db.transaction(stores, 'readwrite', { durability: 'strict' });
    inflight += 1;
    try {
      const result = await work(tx);
      await tx.done;
      return result;
    } catch (err) {
      try {
        tx.abort(); // erro que não veio do IndexedDB deixaria a transação confirmar o que já pediu
      } catch {
        // a transação já terminou
      }
      tx.done.catch(() => {}); // o abort faz o tx.done rejeitar; quem recebe o erro é o chamador
      throw err;
    } finally {
      inflight -= 1;
      if (closed && inflight === 0) closeChannelSoon();
    }
  }

  // O mesmo para leituras de mais de uma store que precisam vir do mesmo instante.
  async function read<S extends StoreNames<KlickDB>[], R>(
    stores: S,
    work: (tx: IDBPTransaction<KlickDB, S, 'readonly'>) => Promise<R>,
  ): Promise<R> {
    const tx = db.transaction(stores);
    try {
      const result = await work(tx);
      await tx.done;
      return result;
    } catch (err) {
      tx.done.catch(() => {});
      throw err;
    }
  }

  // Uma escrita que o sync acompanha (spec 5.3 e 5.4): a mesma transação lê e grava o relógio (meta 'sync') e a fila de saída. `stamp()`
  // é a próxima data, max(agora, clock + 1); `track(store, id)` põe o registro na fila quando o aparelho tem conta (accountId). Sem
  // conta, a fila não é preenchida, e o relógio só garante que nenhuma data volta para trás.
  async function syncWrite<R>(stores: StoreNames<KlickDB>[], work: (tx: WriteTx, ctx: SyncCtx) => Promise<R>): Promise<R> {
    return write([...stores, 'meta', 'outbox'], async (tx) => {
      const meta = tx.objectStore('meta');
      const stored = syncStateOrDefault((await meta.get('sync')) as SyncState | undefined);
      let state = stored;
      const outbox = tx.objectStore('outbox');
      const clock = createSyncClock(stored.clock, now);
      const ctx: SyncCtx = {
        stamp: clock.stamp,
        // A data da fila é a da gravação (a do relógio nesta transação), a mesma para tudo o que a transação põe nela, mesmo quando o
        // registro entra antes de qualquer outra data ser pedida (uma importação): o clock de antes, ainda zero num aparelho novo,
        // misturaria a ordem do índice byQueued.
        track: async (store, id) => {
          if (state.accountId !== null) await outbox.put({ store, id, queuedAt: clock.stamp() }, syncKey(store, id));
        },
        raise: clock.raise,
        state: () => ({ ...state, clock: clock.value() }),
        setState: (patch) => {
          state = { ...state, ...definedOnly(patch) };
        },
      };
      const result = await work(tx, ctx);
      if (state !== stored || clock.value() !== stored.clock) await meta.put({ ...state, clock: clock.value() }, 'sync');
      return result;
    });
  }

  // Lê o solve, deixa `change` montar o novo (ou null se nada muda) e grava, tudo numa transação. `at` é a data do relógio.
  async function changeSolve(id: string, change: (solve: StoredSolve, at: () => number) => StoredSolve | null): Promise<Solve> {
    const { solve, changed } = await syncWrite(['solves'], async (tx, ctx) => {
      const store = tx.objectStore('solves');
      const current = await store.get(id);
      if (!current) throw new Error(`Solve não encontrado: ${id}`);
      const next = change(current, ctx.stamp);
      if (next) {
        await store.put(next);
        await ctx.track('solves', id);
      }
      return { solve: next ?? current, changed: next !== null };
    });
    if (changed) announceSolves([id]);
    return bareSolve(solve);
  }

  // Manda um desafio para a lixeira (`toTrash`) ou o traz de volta, como um solve: as três datas são a da escrita. Já no estado pedido, nada
  // muda nem avisa; um que não existe lança. Com `expect`, um registro com outra data (ou nenhum) é conflito.
  async function trashDuel(id: string, toTrash: boolean, expect?: number): Promise<void> {
    const changed = await syncWrite(['duels'], async (tx, ctx) => {
      const store = tx.objectStore('duels');
      const duel = await store.get(id);
      if (expect !== undefined && duel?.updatedAt !== expect) throw new DuelConflictError(duel ? bareDuel(duel) : null);
      if (!duel) throw new Error(`Desafio não encontrado: ${id}`);
      if ((duel.deletedAt !== null) === toTrash) return false;
      const at = ctx.stamp();
      await store.put({ ...duel, deletedAt: toTrash ? at : null, updatedAt: at, deletionStamp: at });
      await ctx.track('duels', id);
      return true;
    });
    if (changed) announce('duels');
  }

  // O perfil gravado agora, dentro da transação (as duas stores).
  async function storedProfile(tx: WriteTx): Promise<Profile> {
    const [device, items] = await Promise.all([tx.objectStore('profile').get('current'), tx.objectStore('prefs').getAll()]);
    return composeProfile(device, items);
  }

  return {
    async listSessions({ includeDeleted = false } = {}) {
      const all = await db.getAll('sessions');
      return all.filter((s) => includeDeleted || s.deletedAt === null).map(bareSession).sort(bySessionOrder);
    },

    async createSession({ event, name, id }) {
      const session = await syncWrite(['sessions'], async (tx, ctx) => {
        const store = tx.objectStore('sessions');
        const all = await store.getAll();
        const free = id !== undefined && !all.some((s) => s.id === id);
        // A sessão padrão (o `id` livre) nasce com as datas em 1, fixas: a mesma "Sessão 1" de todo aparelho novo é idêntica nos dois lados
        // e perde para qualquer ação de verdade (renomear, reordenar, excluir) feita em qualquer aparelho, sem nunca desfazer uma. A fila a
        // leva como qualquer gravação.
        const at = free ? DEFAULT_SESSION_STAMP : ctx.stamp();
        // A numeração parte do maior "Sessão N" entre as sessões ativas do evento.
        const lastNumber = Math.max(0, ...all.filter((s) => s.event === event && s.deletedAt === null).map((s) => T.session.defaultNameNumber(s.name) ?? 0));
        const created: StoredSession = {
          id: free ? id : newId(at),
          name: name?.trim() || T.session.defaultName(lastNumber + 1),
          event,
          order: Math.max(-1, ...all.map((s) => s.order)) + 1,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
          deletionStamp: at,
        };
        await store.add(created);
        await ctx.track('sessions', created.id);
        return created;
      });
      announce('sessions');
      return bareSession(session);
    },

    async renameSession(id, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const changed = await syncWrite(['sessions'], async (tx, ctx) => {
        const store = tx.objectStore('sessions');
        const session = await store.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.name === trimmed) return false;
        await store.put({ ...session, name: trimmed, updatedAt: ctx.stamp() });
        await ctx.track('sessions', id);
        return true;
      });
      if (changed) announce('sessions');
    },

    async deleteSession(id) {
      const touched = await syncWrite(['sessions', 'solves'], async (tx, ctx) => {
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.deletedAt !== null) return null;
        const at = ctx.stamp();
        await sessions.put({ ...session, deletedAt: at, updatedAt: at, deletionStamp: at });
        // Os solves já excluídos antes ficam com a marca antiga, para restoreSession não trazê-los de volta.
        const solves = tx.objectStore('solves');
        const live = (await solves.index('bySession').getAll(keyRange(id))).filter((s) => s.deletedAt === null);
        await each(live, (s) => solves.put({ ...s, deletedAt: at, updatedAt: at, deletionStamp: at }));
        // Na fila, a exclusão dos solves vai antes, e a da sessão por último, com a data seguinte do relógio (revisão final, I4; como em
        // requeueHeld): a de uma sessão cuja cascata não cabe num dia voltaria com a cota, e os solves dela esperariam com ela "só neste
        // aparelho", com o aviso da conta cheia numa conta que não está. Assim os solves sobem pelo orçamento de cada dia, e a sessão chega
        // sem solves ativos no servidor. As datas dos registros continuam as da exclusão. A sessão que a cota já guarda vai antes, como
        // antes (a mesma data, e a chave a põe na frente): ela não está no servidor, não há cascata lá para dividir, e com os solves na frente
        // a regra (b) de outboxBatch os guardaria de novo, porque a sessão ainda não estaria no lote.
        const held = (await heldOf(tx)).includes(syncKey('sessions', id));
        await each(live, (s) => ctx.track('solves', s.id));
        if (live.length > 0 && !held) ctx.raise(ctx.stamp() + 1); // o relógio passa desta escrita: o track seguinte tem uma data depois
        await ctx.track('sessions', id);
        return live.map((s) => s.id);
      });
      if (touched === null) return;
      announce('sessions');
      if (touched.length > 0) announceSolves(touched);
    },

    async restoreSession(id) {
      const touched = await syncWrite(['sessions', 'solves'], async (tx, ctx) => {
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.deletedAt === null) return null;
        const at = ctx.stamp();
        await sessions.put({ ...session, deletedAt: null, updatedAt: at, deletionStamp: at });
        await ctx.track('sessions', id);
        // Volta só o que saiu junto com a sessão: os solves com a mesma marca de exclusão.
        const solves = tx.objectStore('solves');
        const together = (await solves.index('bySession').getAll(keyRange(id))).filter((s) => s.deletedAt === session.deletedAt);
        await each(together, (s) => solves.put({ ...s, deletedAt: null, updatedAt: at, deletionStamp: at }));
        await each(together, (s) => ctx.track('solves', s.id));
        return together.map((s) => s.id);
      });
      if (touched === null) return;
      announce('sessions');
      if (touched.length > 0) announceSolves(touched);
    },

    async listSolves({ sessionId, event, includeDeleted = false } = {}) {
      let list: StoredSolve[];
      if (sessionId !== undefined) {
        list = await db.getAllFromIndex('solves', 'bySession', keyRange(sessionId));
        if (event !== undefined) list = list.filter((s) => s.event === event);
      } else if (event !== undefined) {
        list = await db.getAllFromIndex('solves', 'byEvent', keyRange(event));
      } else {
        list = (await db.getAll('solves')).sort(bySolveTime);
      }
      return (includeDeleted ? list : list.filter((s) => s.deletedAt === null)).map(bareSolve);
    },

    async addSolve(s) {
      const id = s.id ?? newId(now());
      const { solve, sessionBack } = await syncWrite(['solves', 'sessions'], async (tx, ctx) => {
        const solves = tx.objectStore('solves');
        // Um id já gravado é o mesmo solve: a repetição não escreve nada. Uma tentativa atrasada não pode desfazer uma edição
        // feita depois (penalidade, nota). O que já está gravado vale.
        const stored = await solves.get(id);
        if (stored) {
          const back = stored.deletedAt === null && (await reviveSession(tx.objectStore('sessions'), stored.sessionId, ctx));
          return { solve: stored, sessionBack: back };
        }
        const stamp = ctx.stamp();
        const solve: StoredSolve = {
          id,
          sessionId: s.sessionId,
          event: s.event,
          ms: s.ms,
          penalty: s.penalty,
          at: s.at,
          scramble: s.scramble,
          // Só com fases: um solve sem elas continua sem o campo, como os gravados antes. Cópia: o array de quem chamou não entra no banco.
          ...(s.phases ? { phases: [...s.phases] } : {}),
          note: '',
          createdAt: stamp,
          updatedAt: stamp,
          deletedAt: null,
          deletionStamp: stamp,
        };
        await solves.put(solve);
        await ctx.track('solves', id);
        // Uma aba que ainda mostra uma sessão que outra aba excluiu: o solve não se perde nem fica escondido, e a sessão volta.
        // Só solve ativo pede a sessão ativa (o invariante do topo).
        const back = await reviveSession(tx.objectStore('sessions'), solve.sessionId, ctx);
        return { solve, sessionBack: back };
      });
      announceSolves([solve.id]);
      if (sessionBack) announce('sessions');
      return bareSolve(solve);
    },

    updateSolve(id, patch) {
      return changeSolve(id, (solve, at) => {
        if (patch.penalty === undefined && patch.note === undefined) return null;
        return {
          ...solve,
          penalty: patch.penalty === undefined ? solve.penalty : patch.penalty,
          note: patch.note ?? solve.note,
          updatedAt: at(),
        };
      });
    },

    async deleteSolve(id) {
      await changeSolve(id, (solve, at) => {
        if (solve.deletedAt !== null) return null;
        const stamp = at();
        return { ...solve, deletedAt: stamp, updatedAt: stamp, deletionStamp: stamp };
      });
    },

    async restoreSolve(id) {
      const restored = await syncWrite(['solves', 'sessions'], async (tx, ctx) => {
        const solves = tx.objectStore('solves');
        const solve = await solves.get(id);
        if (!solve) throw new Error(`Solve não encontrado: ${id}`);
        if (solve.deletedAt === null) return null;
        const at = ctx.stamp();
        await solves.put({ ...solve, deletedAt: null, updatedAt: at, deletionStamp: at });
        await ctx.track('solves', id);
        // Invariante: o solve volta ativo, então a sessão dele, se estiver na lixeira, volta junto: só o registro dela. Os outros
        // solves excluídos da sessão continuam na lixeira e voltam um a um.
        return { session: await reviveSession(tx.objectStore('sessions'), solve.sessionId, ctx) };
      });
      if (restored === null) return;
      announceSolves([id]);
      if (restored.session) announce('sessions');
    },

    async moveSolves(ids, sessionId) {
      const moves = await syncWrite(['sessions', 'solves'], async (tx, ctx) => {
        const target = await tx.objectStore('sessions').get(sessionId);
        if (!target || target.deletedAt !== null) throw new Error('move-session');
        const solves = tx.objectStore('solves');
        const found = await Promise.all(distinct(ids).map((id) => solves.get(id)));
        // Só o solve ativo de outra sessão muda: o da lixeira fica onde está, e o que já está no destino não tem o que mudar.
        const moving = found.filter((s): s is StoredSolve => s !== undefined && s.deletedAt === null && s.sessionId !== sessionId);
        // Um só de outro evento recusa o lote inteiro, antes de qualquer gravação: o sync o levaria assim mesmo.
        if (moving.some((s) => s.event !== target.event)) throw new Error('move-event');
        if (moving.length === 0) return [];
        const at = ctx.stamp();
        await each(moving, (s) => solves.put({ ...s, sessionId, updatedAt: at }));
        await each(moving, (s) => ctx.track('solves', s.id));
        const moves = moving.map((s) => ({ id: s.id, from: s.sessionId }));
        await noteMoved(tx, ctx, moves); // a exclusão de cada origem espera a confirmação deles (outboxBatch)
        return moves;
      });
      if (moves.length > 0) announceSolves(moves.map((m) => m.id));
      return moves;
    },

    async deleteSolves(ids) {
      const gone = await syncWrite(['solves'], async (tx, ctx) => {
        const solves = tx.objectStore('solves');
        const found = await Promise.all(distinct(ids).map((id) => solves.get(id)));
        const live = found.filter((s): s is StoredSolve => s !== undefined && s.deletedAt === null);
        if (live.length === 0) return [];
        const at = ctx.stamp(); // a mesma data para o lote, como a cascata de deleteSession
        await each(live, (s) => solves.put({ ...s, deletedAt: at, updatedAt: at, deletionStamp: at }));
        await each(live, (s) => ctx.track('solves', s.id));
        return live.map((s) => s.id);
      });
      if (gone.length > 0) announceSolves(gone);
      return gone;
    },

    async restoreSolves(ids) {
      const back = await syncWrite(['solves', 'sessions'], async (tx, ctx) => {
        const solves = tx.objectStore('solves');
        const found = await Promise.all(distinct(ids).map((id) => solves.get(id)));
        const trashed = found.filter((s): s is StoredSolve => s !== undefined && s.deletedAt !== null);
        if (trashed.length === 0) return null;
        const at = ctx.stamp();
        await each(trashed, (s) => solves.put({ ...s, deletedAt: null, updatedAt: at, deletionStamp: at }));
        await each(trashed, (s) => ctx.track('solves', s.id));
        // O invariante, como em restoreSolve: a sessão de cada um, se está na lixeira, volta junto (só o registro dela), com a mesma data.
        // Na fila, ela sobe antes dos solves dela (a mesma data, e a chave a põe na frente).
        const sessions = tx.objectStore('sessions');
        let revived = false;
        for (const sid of new Set(trashed.map((s) => s.sessionId))) revived = (await reviveSession(sessions, sid, ctx)) || revived;
        return { ids: trashed.map((s) => s.id), revived };
      });
      if (back === null) return [];
      announceSolves(back.ids);
      if (back.revived) announce('sessions');
      return back.ids;
    },

    async mergeSessions(fromId, toId) {
      const moved = await syncWrite(['sessions', 'solves'], async (tx, ctx) => {
        const sessions = tx.objectStore('sessions');
        const [from, to] = await Promise.all([sessions.get(fromId), sessions.get(toId)]);
        if (fromId === toId || !from || !to || from.deletedAt !== null || to.deletedAt !== null) throw new Error('merge-session');
        if (from.event !== to.event) throw new Error('merge-event');
        // Só os ativos passam: os que já estavam na lixeira ficam com ela, com a marca antiga (restaurá-la não os traz de volta).
        const solves = tx.objectStore('solves');
        const live = (await solves.index('bySession').getAll(keyRange(fromId))).filter((s) => s.deletedAt === null);
        const at = ctx.stamp();
        await each(live, (s) => solves.put({ ...s, sessionId: toId, updatedAt: at }));
        await each(live, (s) => ctx.track('solves', s.id));
        await noteMoved(
          tx,
          ctx,
          live.map((s) => ({ id: s.id, from: fromId })),
        );
        // A exclusão da sessão sobe depois das mudanças de sessão dos solves (spec do histórico, seção 5), com a data seguinte do relógio,
        // como em deleteSession: antes delas, a cascata dela (no servidor, ou num aparelho que baixa um registro por vez) apagaria um solve
        // que ainda está nela, e a mudança dele perderia (a exclusão tem o deletionStamp maior). A sessão que a cota guarda (só neste
        // aparelho) vai na frente, com a mesma data, como lá: não há cascata dela no servidor, e atrás dos solves outboxBatch os guardaria.
        // A ordem da fila não basta: um solve editado de novo antes de subir volta para trás da exclusão, e um destino guardado pela cota
        // guarda os solves com ele. Por isso outboxBatch segura a exclusão até o servidor confirmar cada solve que saiu (noteMoved).
        const held = (await heldOf(tx)).includes(syncKey('sessions', fromId));
        if (live.length > 0 && !held) ctx.raise(ctx.stamp() + 1); // o relógio passa desta escrita: a exclusão tem uma data depois
        const gone = ctx.stamp();
        await sessions.put({ ...from, deletedAt: gone, updatedAt: gone, deletionStamp: gone });
        await ctx.track('sessions', fromId);
        return live.map((s) => s.id);
      });
      announce('sessions');
      if (moved.length > 0) announceSolves(moved);
      return moved.length;
    },

    async getSolves(ids) {
      const found = await read(['solves'], (tx) => {
        const store = tx.objectStore('solves');
        return Promise.all(ids.map((id) => store.get(id)));
      });
      return found.map((s) => (s ? bareSolve(s) : undefined));
    },

    async listTrash() {
      const [sessions, solves, duels] = await read(['sessions', 'solves', 'duels'], (tx) =>
        Promise.all([tx.objectStore('sessions').getAll(), tx.objectStore('solves').getAll(), tx.objectStore('duels').getAll()]),
      );
      return {
        sessions: sessions.filter((s) => s.deletedAt !== null).map(bareSession).sort(newestDeletedFirst),
        solves: solves.filter((s) => s.deletedAt !== null).map(bareSolve).sort(newestDeletedFirst),
        duels: duels.filter((d) => d.deletedAt !== null).map(bareDuel).sort(newestDeletedFirst),
      };
    },

    async purgeTrash(olderThanMs) {
      const limit = now() - olderThanMs;
      const expired = ({ deletedAt }: { deletedAt: number | null }) => deletedAt !== null && deletedAt < limit;
      const removed = await write(['sessions', 'solves', 'practice', 'duels', 'outbox', 'meta'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const practice = tx.objectStore('practice');
        const duels = tx.objectStore('duels');
        // A exclusão que a conta recusou (o teto de bytes) também espera: ela só existe aqui, e o servidor ainda não a tem.
        const waiting = new Set<string>([...(await tx.objectStore('outbox').getAllKeys()), ...(await heldOf(tx))]);
        const gone = (store: SyncStore) => (r: { id: string; deletedAt: number | null }) =>
          expired(r) && !waiting.has(syncKey(store, r.id));
        const allSolves = await solves.getAll();
        const oldSolves = allSolves.filter(gone('solves'));
        // Uma sessão só some depois do último solve dela: um que ainda espera na fila (a sessão pode ter subido antes, num lote seguinte
        // ou numa rodada que falhou no meio), que ainda não venceu ou que está ativo ficaria sem sessão, e restaurá-lo quebraria o
        // invariante do topo (solve ativo => sessão ativa).
        const leaving = new Set(oldSolves.map((s) => s.id));
        const parents = new Set(allSolves.filter((s) => !leaving.has(s.id)).map((s) => s.sessionId));
        const oldSessions = (await sessions.getAll()).filter((s) => gone('sessions')(s) && !parents.has(s.id));
        const oldPractice = (await practice.getAll()).filter(gone('practice'));
        const oldDuels = (await duels.getAll()).filter(gone('duels'));
        await each(oldSessions, (s) => sessions.delete(s.id));
        await each(oldSolves, (s) => solves.delete(s.id));
        await each(oldPractice, (p) => practice.delete(p.id));
        await each(oldDuels, (d) => duels.delete(d.id));
        return { sessions: oldSessions.length, solves: oldSolves.map((s) => s.id), duels: oldDuels.length };
      });
      if (removed.solves.length > 0) announceSolves(removed.solves);
      if (removed.sessions > 0) announce('sessions');
      if (removed.duels > 0) announce('duels');
      return removed.sessions + removed.solves.length + removed.duels;
    },

    async getProfile() {
      const [device, items] = await read(['profile', 'prefs'], (tx) =>
        Promise.all([tx.objectStore('profile').get('current'), tx.objectStore('prefs').getAll()]),
      );
      return composeProfile(device, items);
    },

    async saveProfile(patch) {
      const { profile, saved } = await syncWrite(['profile', 'prefs'], async (tx, ctx) => {
        const base = await storedProfile(tx);
        const p = typeof patch === 'function' ? patch(base) : patch;
        if (p === null) return { profile: base, saved: false };
        const merged = mergeProfile(base, p);
        await writeProfile(tx, base, merged, ctx);
        return { profile: merged, saved: true };
      });
      if (saved) announce('profile');
      return structuredClone(profile); // a trilha do patch não fica compartilhada com quem recebe o perfil
    },

    async advanceSeason(fromN, record, next) {
      const outcome = await syncWrite(['profile', 'prefs'], async (tx, ctx) => {
        const base = await storedProfile(tx);
        if (base.season.current.n !== fromN) return { profile: base, saved: false };
        const advanced: Profile = { ...base, season: { current: next, past: [...base.season.past, record] } };
        await writeProfile(tx, base, advanced, ctx);
        return { profile: advanced, saved: true };
      });
      if (outcome.saved) announce('profile');
      return structuredClone(outcome.profile);
    },

    async getMeta() {
      const stored = (await db.get('meta', 'current')) as Meta | undefined;
      if (stored) return metaOrNew(stored, now());
      // Sem meta: cria e grava já, para o deviceId não mudar a cada leitura. Dentro da transação lê de novo, porque outra aba
      // pode ter criado entre a leitura e aqui. Criar o padrão não é mudança que outra aba precise saber: sem aviso.
      return write(['meta'], async (tx) => {
        const store = tx.objectStore('meta');
        const existing = (await store.get('current')) as Meta | undefined;
        const meta = metaOrNew(existing, now());
        if (!existing) await store.put(meta, 'current');
        return meta;
      });
    },

    async saveMeta(patch) {
      const meta = await write(['meta'], async (tx) => {
        const store = tx.objectStore('meta');
        const merged: Meta = { ...metaOrNew((await store.get('current')) as Meta | undefined, now()), ...definedOnly(patch) };
        await store.put(merged, 'current');
        return merged;
      });
      announce('meta');
      return meta;
    },

    // Uma transação de escrita: ler a fila e os registros dela vem do mesmo instante, e a entrada do que não sobe sai junto. A lista dos
    // recusados pela cota é lida e gravada na mesma transação.
    async outboxBatch(limit) {
      const lines: string[] = [];
      let refused = 0;
      let missing = 0;
      const batch = await write(['outbox', 'solves', 'sessions', 'practice', 'duels', 'prefs', 'meta'], async (tx) => {
        const outbox = tx.objectStore('outbox');
        const moved = await movedOf(tx);
        // Uma exclusão que espera (abaixo) não ocupa lugar no lote: cada sessão está uma vez na fila, então ler mais tantas entradas quantas
        // sessões o mapa tem garante `limit` entradas que andam (se a fila as tiver). Sem nada movido, o lote é o de sempre.
        const entries = await outbox.index('byQueued').getAll(undefined, limit + moved.size);
        const current = await Promise.all(entries.map((e) => recordOf(tx, e.store, e.id)));
        const held = new Set(await heldOf(tx));
        // A exclusão de uma sessão da qual saíram solves que o servidor ainda não confirmou (moved).
        const waits = (c: Change | undefined): c is Change => c?.store === 'sessions' && c.deletedAt !== null && moved.has(c.id);
        // Quais desses solves ainda estão na fila, lido antes de decidir (os deste lote também: só saem depois de confirmados).
        const watched = [...new Set(current.filter(waits).flatMap((c) => moved.get(c.id)!.map((id) => syncKey('solves', id))))];
        const queued = new Set<string>();
        await Promise.all(
          watched.map(async (key) => {
            if ((await outbox.getKey(key)) !== undefined) queued.add(key);
          }),
        );
        const changes: Change[] = [];
        const sent: OutboxEntry[] = [];
        const dropped = new Set<string>();
        const parked = new Set<string>(); // solves de uma sessão que está só neste aparelho, e exclusões que esperam por eles
        const sessions = new Set<string>(); // as sessões que já vão neste lote
        let movedChanged = false;
        let taken = 0;
        for (let i = 0; i < entries.length && taken < limit; i++) {
          const entry = entries[i];
          const change = current[i];
          const key = syncKey(entry.store, entry.id);
          const checked = change && checkChange(change);
          if (change && checked?.ok) {
            if (waits(change)) {
              // Os que saíram dela e ainda esperam: na fila (e não fora dela por este lote) ou na lista "só neste aparelho". Os outros saem do
              // mapa. Com algum na fila, a exclusão fica nela, fora do lote, e o próximo lote confere de novo. Só na lista (o destino guardado
              // pela cota, ou eles mesmos), ela vai para a lista com eles: na fila, o motor pediria de novo sem nada para mandar; e "Enviar de
              // novo" a põe de volta depois deles (requeueHeld). Sem nenhum, sobe.
              const ids = moved.get(change.id)!;
              const inQueue = (id: string): boolean => {
                const k = syncKey('solves', id);
                return queued.has(k) && !dropped.has(k) && !parked.has(k);
              };
              const pending = ids.filter((id) => inQueue(id) || held.has(syncKey('solves', id)) || parked.has(syncKey('solves', id)));
              if (pending.length !== ids.length) {
                movedChanged = true;
                if (pending.length > 0) moved.set(change.id, pending);
                else moved.delete(change.id);
              }
              if (pending.some(inQueue)) continue;
              if (pending.length > 0) {
                taken++;
                parked.add(key);
                continue;
              }
            }
            taken++;
            const sid = change.store === 'solves' ? sessionOfChange(change) : null;
            if (sid !== null && held.has(syncKey('sessions', sid)) && !sessions.has(sid)) {
              parked.add(key);
              continue;
            }
            if (change.store === 'sessions') sessions.add(change.id);
            changes.push(change);
            sent.push(entry);
            continue;
          }
          taken++;
          dropped.add(key);
          if (checked && !checked.ok) {
            refused++;
            lines.push(refusalLine(entry.store, entry.id, checked.reason));
          } else {
            missing++;
            lines.push(missingLine(entry.store, entry.id));
          }
        }
        await each([...dropped, ...parked], (key) => outbox.delete(key));
        if (parked.size > 0) await saveHeld(tx, [...held, ...parked]);
        // Um solve que saiu da fila de vez (recusado ou sem registro) não espera mais: sai do mapa.
        const gone = new Set(
          [...dropped].flatMap((k) => {
            const part = keyParts(k);
            return part?.store === 'solves' ? [part.id] : [];
          }),
        );
        if (forgetMoved(moved, gone)) movedChanged = true;
        if (movedChanged) await saveMoved(tx, moved);
        return { changes, sent, held: parked.size };
      });
      for (const line of lines) log(line);
      if (batch.held > 0) announce('sync');
      return { ...batch, refused, missing };
    },

    async confirmSent(sent, held = [], refused = []) {
      const changed = await write(['outbox', 'meta'], async (tx) => {
        const outbox = tx.objectStore('outbox');
        const before = await heldOf(tx);
        const list = new Set(before);
        const quota = new Set(held.map((e) => syncKey(e.store, e.id)));
        const other = new Set(refused.map((e) => syncKey(e.store, e.id)));
        const entries = new Map<string, OutboxEntry>();
        for (const e of [...sent, ...held, ...refused]) entries.set(syncKey(e.store, e.id), e);
        const settled = new Set<string>(); // solves que saíram da fila e não ficaram na lista: a mudança de sessão deles não espera mais
        for (const [key, e] of entries) {
          const queued = await outbox.get(key);
          // Gravado de novo durante o pedido (outra data na fila): o que subiu já é velho, e a entrada fica para o próximo lote (e não entra na
          // lista: a versão nova ainda vai subir).
          const same = queued !== undefined && queued.queuedAt === e.queuedAt;
          if (same) await outbox.delete(key);
          if (quota.has(key)) {
            if (same) list.add(key);
          } else if (!other.has(key)) list.delete(key); // aceito: a conta tem uma versão dele
          if (same && e.store === 'solves' && !list.has(key)) settled.add(e.id);
        }
        if (settled.size > 0) {
          const moved = await movedOf(tx);
          if (forgetMoved(moved, settled)) await saveMoved(tx, moved);
        }
        if (list.size === before.length && before.every((k) => list.has(k))) return false;
        await saveHeld(tx, list);
        return true;
      });
      if (changed) announce('sync');
    },

    async outboxCount() {
      return db.count('outbox');
    },

    async heldCount() {
      return read(['solves', 'sessions', 'practice', 'duels', 'prefs', 'meta'], async (tx) => {
        const parts = (await heldOf(tx)).flatMap((key) => keyParts(key) ?? []);
        const found = await Promise.all(parts.map((p) => recordOf(tx, p.store, p.id)));
        return found.filter((r) => r !== undefined).length;
      });
    },

    async requeueHeld() {
      const back = await syncWrite(['solves', 'sessions', 'practice', 'duels', 'prefs'], async (tx, ctx) => {
        const keys = await heldOf(tx);
        if (keys.length === 0) return null;
        const parts = keys.flatMap((key) => keyParts(key) ?? []);
        const found = await Promise.all(parts.map((p) => recordOf(tx, p.store, p.id)));
        const existing = parts.filter((_, i) => found[i] !== undefined);
        // A mesma data na fila para todos: o índice byQueued desempata pela chave, e cada sessão sobe antes dos solves dela. A sessão apagada
        // aqui vai depois de tudo, com a data seguinte do relógio (endurecimento, Task 12): a exclusão de uma sessão cuja cascata não cabe
        // num dia volta com a cota, então a dos solves dela sobe antes, pelo orçamento de cada dia (pushAfter a leva de um dia para o outro),
        // e a sessão chega por último, sem solves ativos no servidor. Um toque basta.
        const later = parts.filter((p, i) => p.store === 'sessions' && found[i] !== undefined && found[i].deletedAt !== null);
        await each(
          existing.filter((p) => !later.includes(p)),
          (p) => ctx.track(p.store, p.id),
        );
        if (later.length > 0) {
          ctx.raise(ctx.stamp() + 1); // o relógio passa desta escrita: o track seguinte tem uma data depois
          await each(later, (p) => ctx.track(p.store, p.id));
        }
        await saveHeld(tx, []);
        return existing.length;
      });
      if (back === null) return 0;
      announce('sync');
      return back;
    },

    async countRemoteDeletions(changes) {
      return read(['solves', 'sessions', 'practice', 'duels', 'prefs', 'outbox'], async (tx) => {
        const waiting = new Set(await tx.objectStore('outbox').getAllKeys());
        return (await joinIn(tx, changes, { mode: 'client', pending: (s, id) => waiting.has(syncKey(s, id)) })).deletedSolves;
      });
    },

    async applyRemote(changes, serverTime, accountId, after) {
      const joined = await syncWrite(['solves', 'sessions', 'practice', 'duels', 'prefs'], async (tx, ctx) => {
        // Na mesma transação que grava: um wipeData ou uma troca de conta de outra aba entre a conferência do motor e aqui não recebe o lote.
        if (accountId !== undefined && ctx.state().accountId !== accountId) throw new AccountChangedError();
        const waiting = new Set(await tx.objectStore('outbox').getAllKeys());
        const result = await joinIn(tx, changes, { mode: 'client', pending: (s, id) => waiting.has(syncKey(s, id)) });
        const valid = changes.flatMap((raw) => {
          const checked = checkChange(raw);
          return checked.ok ? [checked.change] : [];
        });
        // O relógio sobe até a hora do servidor e as datas que chegaram (spec 5.4): só as de mudanças que passam por checkChange.
        ctx.raise(serverTime);
        for (const c of valid) ctx.raise(Math.max(c.updatedAt, c.deletionStamp));
        await each(result.writes, (c) => putChange(tx, c));
        // O que a cascata mudou aqui sobe (decisão 5); o que veio do lote o servidor já tem.
        const derived = new Set(result.derived);
        await each(
          result.writes.filter((c) => derived.has(syncKey(c.store, c.id))),
          (c) => ctx.track(c.store, c.id),
        );
        // A lista "só neste aparelho" (decisão (a) do controlador): a chave que chegou foi juntada acima pela regra de sempre; ela sai da lista
        // quando a conta já tem o que ficou aqui (o que chegou venceu, ou os dois lados a têm apagada, como na cascata do servidor que apaga o
        // recusado) ou quando o registro daqui não existe. Uma exclusão daqui que venceu uma versão ativa da conta fica: a conta não a tem.
        const held = await heldOf(tx);
        let heldChanged = false;
        if (held.length > 0) {
          const list = new Set(held);
          for (const c of valid) {
            const key = syncKey(c.store, c.id);
            if (!list.has(key)) continue;
            const here = await recordOf(tx, c.store, c.id);
            if (!here || (here.deletedAt !== null && c.deletedAt !== null) || sameChange(here, c)) list.delete(key);
          }
          if (list.size !== held.length) {
            await saveHeld(tx, list);
            heldChanged = true;
          }
        }
        // No download do primeiro login, as sessões padrão que a conta tem: a deduplicação só guarda a padrão daqui que a conta também tem
        // (a revisão final, I1). Na mesma transação que junta: um download que cai no meio continua de onde parou sem perder nenhuma.
        const state = ctx.state();
        if (state.firstSync) {
          const seen = valid.flatMap((c) => (c.store === 'sessions' && isDefaultSession(c.id) ? [c.id] : []));
          const known = new Set(state.firstSyncDefaults);
          if (seen.some((id) => !known.has(id))) ctx.setState({ firstSyncDefaults: [...new Set([...known, ...seen])] });
        }
        if (after) ctx.setState({ cursor: after.cursor, lastSyncAt: after.lastSyncAt, copiesPaused: after.copiesPaused, pushAfter: after.pushAfter });
        if (after && result.rejected.length > 0) ctx.setState({ refusedBuild: after.build ?? 'dev' });
        const pendingFloor = ctx.state().pendingFloor;
        const confirmed = after?.floorSent !== undefined && isFloor(pendingFloor) && pendingFloor <= after.floorSent;
        if (pendingFloor !== null && (confirmed || !isFloor(pendingFloor))) ctx.setState({ pendingFloor: null });
        return { result, heldChanged };
      });
      announceSynced(joined.result.writes);
      if (after || joined.heldChanged) announce('sync');
      return { applied: joined.result.writes.length, rejected: joined.result.rejected.length };
    },

    async restartAfterUpdate(build) {
      const restarted = await write(['meta'], async (tx) => {
        const store = tx.objectStore('meta');
        const state = syncStateOrDefault((await store.get('sync')) as SyncState | undefined);
        if (state.refusedBuild === null || state.refusedBuild === build) return false;
        await store.put({ ...state, cursor: 0, refusedBuild: null }, 'sync');
        return true;
      });
      if (restarted) announce('sync');
      return restarted;
    },

    async beginFirstSync({ accountId, email }) {
      const refusals: string[] = [];
      const began = await syncWrite(['solves', 'sessions', 'practice', 'duels', 'prefs'], async (tx, ctx) => {
        // A mesma conta já começou (ou terminou) o primeiro login: zerar o cursor e pôr na fila o que já veio dela faria os registros da
        // conta passarem por daqui, e os gêmeos subiriam repetidos. Nada muda.
        if (ctx.state().accountId === accountId) return false;
        // O estado vem primeiro: o track seguinte já vê a conta. Ele só é gravado no fim, junto com a fila (syncWrite).
        ctx.setState({ accountId, email, signedIn: true, firstSync: true, firstSyncDefaults: [], cursor: 0, lastSyncAt: null, refusedBuild: null });
        ctx.setState({ pushAfter: null, copiesPaused: null, pendingFloor: null }); // o orçamento, a pausa das cópias e o piso eram da conta de antes
        // A lista "só neste aparelho" era da conta de antes: o que estava nela entra na fila com o resto, logo abaixo.
        await saveHeld(tx, []);
        const all = await syncedRecords(tx);
        const queued: Change[] = [];
        const left: Change[] = [];
        for (const c of all) {
          const checked = checkChange(c);
          if (checked.ok) queued.push(c);
          else {
            left.push(c);
            refusals.push(refusalLine(c.store, c.id, checked.reason));
          }
        }
        await each(queued, (c) => ctx.track(c.store, c.id));
        // Uma entrada que já estava na fila (gravada antes por outro caminho) também sai: a contagem do que vai subir fica certa.
        const outbox = tx.objectStore('outbox');
        await each(left, (c) => outbox.delete(syncKey(c.store, c.id)));
        return true;
      });
      if (!began) return 0;
      for (const line of refusals) log(line);
      announce('sync');
      return refusals.length;
    },

    async dedupeFirstLogin() {
      const outcome = await syncWrite(['solves', 'sessions', 'profile'], async (tx, ctx) => {
        // Só uma vez por primeiro login: firstSync desliga nesta mesma transação. Numa segunda rodada, o solve da conta que recebeu a nota
        // (agora na fila, "daqui") seria gêmeo de outro igual da conta e sairia, e os dois lados ficariam diferentes para sempre.
        if (!ctx.state().firstSync) return { solves: [], noted: [], sessions: [], switched: false };
        const returned = new Set(ctx.state().firstSyncDefaults);
        ctx.setState({ firstSync: false, firstSyncDefaults: [] });
        const outbox = tx.objectStore('outbox');
        const waiting = new Set(await outbox.getAllKeys());
        const mine = (store: SyncStore, id: string): boolean => waiting.has(syncKey(store, id));
        const solves = tx.objectStore('solves');
        const sessions = tx.objectStore('sessions');
        // A conta é o que não está na fila e o servidor aceitaria: acabou de chegar dele (o que vem do servidor sempre passa). Um registro
        // daqui que ficou fora da fila por ser torto não é da conta: senão o gêmeo válido dele sairia da fila e nunca subiria.
        const allSolves = await solves.getAll();
        const live = allSolves.filter((s) => s.deletedAt === null);
        const theirs = new Map<string, StoredSolve>(); // pela marca; com dois iguais na conta, o primeiro pelo id
        for (const s of live) {
          if (mine('solves', s.id) || !syncable('solves', s)) continue;
          const mark = fingerprint(s);
          if (!theirs.has(mark)) theirs.set(mark, s);
        }
        const twins = live.filter((s) => mine('solves', s.id) && theirs.has(fingerprint(s)));
        await each(twins, (s) => {
          const at = ctx.stamp();
          return solves.put({ ...s, deletedAt: at, updatedAt: at, deletionStamp: at });
        });
        await each(twins, (s) => outbox.delete(syncKey('solves', s.id))); // a marca não sobe: o solve da conta é o mesmo
        // A nota do gêmeo daqui não se perde: vai para o solve da conta, como uma edição (data do relógio, na fila). Dois gêmeos do mesmo
        // solve da conta somam as notas.
        const noted = new Map<string, StoredSolve>();
        for (const s of twins) {
          const target = theirs.get(fingerprint(s))!;
          const current = noted.get(target.id) ?? target;
          const note = joinedNote(current.note, s.note);
          // Junta, a nota pode passar do tamanho que o servidor aceita: aí ela não vai (a edição seria recusada, e as seguintes também),
          // e a do gêmeo fica com ele, na lixeira daqui.
          if (note === current.note) continue;
          const edited: StoredSolve = { ...current, note };
          if (syncable('solves', edited)) noted.set(target.id, edited);
        }
        const edits = [...noted.values()].map((s) => ({ ...s, updatedAt: ctx.stamp() }));
        await each(edits, (s) => solves.put(s));
        await each(edits, (s) => ctx.track('solves', s.id));
        // Vazia: nenhum solve dela fica ativo nem sobe (um da lixeira que está na fila subiria apontando para ela). A sessão padrão daqui só
        // fica quando a conta também a devolveu: a da conta tem o mesmo id, o sync as junta, e a marca daqui não subiria (os dois lados
        // ficariam diferentes para sempre). A que a conta não tem é uma "Sessão 1" vazia como as outras (a revisão final, I1): numa conta
        // cuja "Sessão 1" veio de antes da v3 (outro id), ela subiria uma segunda "Sessão 1".
        const gone = new Set(twins.map((s) => s.id));
        const used = new Set(allSolves.filter((s) => !gone.has(s.id) && (s.deletedAt === null || mine('solves', s.id))).map((s) => s.sessionId));
        const allSessions = await sessions.getAll();
        const liveSessions = allSessions.filter((s) => s.deletedAt === null);
        const accountEvents = new Set(liveSessions.filter((s) => !mine('sessions', s.id) && syncable('sessions', s)).map((s) => s.event));
        const empty = liveSessions.filter(
          (s) =>
            mine('sessions', s.id) &&
            !(isDefaultSession(s.id) && returned.has(s.id)) &&
            !used.has(s.id) &&
            T.session.defaultNameNumber(s.name) !== null &&
            accountEvents.has(s.event),
        );
        await each(empty, (s) => {
          const at = ctx.stamp();
          return sessions.put({ ...s, deletedAt: at, updatedAt: at, deletionStamp: at });
        });
        await each(empty, (s) => outbox.delete(syncKey('sessions', s.id)));
        // A sessão atual do aparelho (que nunca sobe) saiu agora, não existe ou já está na lixeira da conta: o aparelho passa para a sessão do
        // mesmo evento com mais solves (a mais usada da conta), senão ficaria parado na vazia, e o próximo solve a traria de volta. Sem
        // nenhuma sessão viva do evento dela, a mais usada de qualquer evento (revisão final, 5.1); sem nenhuma sessão viva, o aparelho fica
        // sem sessão atual (null), e o app cria uma nova quando precisar (AppState.replaceCurrent), sem reviver a da lixeira.
        const profile = tx.objectStore('profile');
        const device = await profile.get('current');
        const current = device?.currentSessionId ?? null;
        const emptied = new Set(empty.map((s) => s.id));
        const record = allSessions.find((s) => s.id === current);
        let switched = false;
        if (device && current !== null && (emptied.has(current) || !record || record.deletedAt !== null)) {
          const solvesOf = new Map<string, number>();
          for (const s of allSolves) if (s.deletedAt === null && !gone.has(s.id)) solvesOf.set(s.sessionId, (solvesOf.get(s.sessionId) ?? 0) + 1);
          const most = (list: StoredSession[]): StoredSession | undefined =>
            list.sort((a, b) => (solvesOf.get(b.id) ?? 0) - (solvesOf.get(a.id) ?? 0) || bySessionOrder(a, b))[0];
          const left = liveSessions.filter((s) => !emptied.has(s.id));
          const best = most(left.filter((s) => !record || s.event === record.event)) ?? most(left);
          await profile.put({ ...device, currentSessionId: best?.id ?? null }, 'current');
          switched = true;
        }
        return { solves: twins.map((s) => s.id), noted: edits.map((s) => s.id), sessions: empty.map((s) => s.id), switched };
      });
      announceSynced([
        ...[...outcome.solves, ...outcome.noted].map((id) => ({ store: 'solves' as const, id })),
        ...outcome.sessions.map((id) => ({ store: 'sessions' as const, id })),
      ]);
      if (outcome.switched) {
        if (!closed) emit('profile', 'remote');
        post({ kind: 'profile' });
      }
      return { solves: outcome.solves.length, sessions: outcome.sessions.length };
    },

    async wipeData() {
      await write(['solves', 'sessions', 'practice', 'duels', 'prefs', 'outbox', 'backups', 'profile', 'meta'], async (tx) => {
        // Na mesma transação que apaga: uma gravação entre a conferência de quem chama e aqui não se perde.
        if ((await tx.objectStore('outbox').count()) > 0) throw new PendingChangesError();
        const localOnly = await countLocalOnly(tx);
        if (localOnly > 0) throw new LocalOnlyError(localOnly);
        await Promise.all([
          tx.objectStore('solves').clear(),
          tx.objectStore('sessions').clear(),
          tx.objectStore('practice').clear(),
          tx.objectStore('duels').clear(),
          tx.objectStore('prefs').clear(),
          tx.objectStore('backups').clear(),
        ]);
        const device = await tx.objectStore('profile').get('current');
        if (device) await tx.objectStore('profile').put({ ...device, currentSessionId: null }, 'current');
        const meta = tx.objectStore('meta');
        const state = syncStateOrDefault((await meta.get('sync')) as SyncState | undefined);
        await meta.put({ ...defaultSyncState(), clock: state.clock }, 'sync');
        await meta.delete('held'); // o que sobrou nela não tem registro (countLocalOnly só conta as chaves que existem)
        await meta.delete('moved'); // a fila está vazia: nenhum solve movido espera
      });
      announce('all', 'sync');
    },

    async localOnlyCount() {
      return read(['solves', 'sessions', 'practice', 'duels', 'prefs', 'meta'], (tx) => countLocalOnly(tx));
    },

    async forgetAccount() {
      await syncWrite([], async (tx, ctx) => {
        const { clock: _clock, ...reset } = defaultSyncState();
        ctx.setState(reset);
        await saveHeld(tx, []);
      });
      announce('sync');
    },

    async getSyncState() {
      return syncStateOrDefault((await db.get('meta', 'sync')) as SyncState | undefined);
    },

    async saveSyncState(patch) {
      const state = await write(['meta'], async (tx) => {
        const store = tx.objectStore('meta');
        const stored = syncStateOrDefault((await store.get('sync')) as SyncState | undefined);
        // O relógio só sobe, e só por um inteiro seguro >= 0 abaixo de MAX_STAMP: um NaN viraria NaN para sempre, e um no teto o prenderia;
        // nos dois, o servidor recusaria toda mudança.
        const given = patch.clock;
        const clock = isClockValue(given) ? Math.max(stored.clock, given) : stored.clock;
        const merged: SyncState = { ...stored, ...definedOnly(patch), clock };
        await store.put(merged, 'sync');
        return merged;
      });
      announce('sync');
      return state;
    },

    async getFolderHandle() {
      return (await db.get('meta', 'folderHandle')) ?? null;
    },

    async saveFolderHandle(handle) {
      await write(['meta'], async (tx) => {
        const store = tx.objectStore('meta');
        if (handle == null) await store.delete('folderHandle');
        else await store.put(handle as FileSystemDirectoryHandle, 'folderHandle');
      });
      announce('meta');
    },

    async saveBackup(record) {
      await write(['backups'], async (tx) => {
        await tx.objectStore('backups').put(record);
      });
    },

    async listBackups() {
      return (await db.getAllFromIndex('backups', 'byCreated')).reverse();
    },

    async getBackup(id) {
      return db.get('backups', id);
    },

    async deleteBackup(id) {
      await write(['backups'], async (tx) => {
        await tx.objectStore('backups').delete(id);
      });
    },

    async exportAll({ includeDeleted = true } = {}) {
      // Uma transação só, para sessões, solves, perfil, treino e desafios virem do mesmo instante.
      const [sessions, solves, device, items, practice, duels] = await read(['sessions', 'solves', 'profile', 'prefs', 'practice', 'duels'], (tx) =>
        Promise.all([
          tx.objectStore('sessions').getAll(),
          tx.objectStore('solves').getAll(),
          tx.objectStore('profile').get('current'),
          tx.objectStore('prefs').getAll(),
          tx.objectStore('practice').getAll(),
          tx.objectStore('duels').getAll(),
        ]),
      );
      const kept = <V extends { deletedAt: number | null }>(list: V[]): V[] => (includeDeleted ? list : list.filter((x) => x.deletedAt === null));
      // As marcas de exclusão do treino são do sync: o arquivo leva só as tentativas que existem.
      return {
        format: 'klick',
        version: 1,
        exportedAt: now(),
        sessions: kept(sessions).map(bareSession).sort(bySessionOrder),
        solves: kept(solves).map(bareSolve).sort(bySolveTime),
        profile: device || items.length > 0 ? composeProfile(device, items) : null,
        practice: practice.filter((p) => p.deletedAt === null).map(barePractice).sort(byPracticeTime),
        // Os desafios têm lixeira, como os solves: vão com ela (ou sem), em ordem de criação.
        duels: kept(duels).map(bareDuel).sort(byDuelCreated),
      };
    },

    async importAll(data) {
      const report: ImportReport = { sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 };
      let refused = 0;
      const outcome = await syncWrite(['sessions', 'solves', 'profile', 'prefs', 'practice', 'duels'], async (tx, ctx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const practice = tx.objectStore('practice');
        const duels = tx.objectStore('duels');
        const limit = now() + IMPORT_FUTURE_MS;

        // Sessão por id, como o solve (spec 5.5): entra a nova (e conta), substitui a de updatedAt menor (renomear e excluir no outro
        // aparelho chegam), e o resto fica como está. Em todos os registros, o que tem uma data que não serve (fileDatesOk) ou que o sync
        // recusaria fica de fora, contado em refused.
        const knownSessions = new Map<string, StoredSession>();
        for (const s of await sessions.getAll()) knownSessions.set(s.id, s);
        const sessionWrites: StoredSession[] = [];
        const refusedSessions = new Set<unknown>();
        for (const s of data.sessions) {
          const have = knownSessions.get(s.id);
          const stored: StoredSession = { ...s, deletionStamp: importedStamp(have, s) };
          if (!fileDatesOk(s, limit) || !syncable('sessions', stored)) {
            refused++;
            refusedSessions.add(s.id);
            continue;
          }
          if (have !== undefined && s.updatedAt <= have.updatedAt) continue;
          if (have === undefined) report.sessionsAdded++;
          knownSessions.set(s.id, stored);
          sessionWrites.push(stored);
        }
        await each(sessionWrites, (s) => sessions.put(s));
        await each(sessionWrites, (s) => ctx.track('sessions', s.id));

        // Solve por id: entra o que não existe, substitui o de updatedAt menor, e o resto é pulado. Um solve cuja sessão não pode existir
        // (o sessionId não serve de id) fica de fora também, e o de uma sessão que este import recusou (pela data, pelo tamanho), a não ser
        // que a sessão já exista aqui: sem registro nenhum, o reviveSession não teria o que devolver, e um solve ativo sem sessão subiria
        // pelo sync (o invariante do topo).
        const orphaned = (sessionId: string): boolean => refusedSessions.has(sessionId) && !knownSessions.has(sessionId);
        const knownSolves = new Map<string, StoredSolve>();
        for (const s of await solves.getAll()) knownSolves.set(s.id, s);
        const incoming: StoredSolve[] = [];
        for (const s of data.solves) {
          const have = knownSolves.get(s.id);
          const stored: StoredSolve = { ...s, deletionStamp: importedStamp(have, s) };
          if (!fileDatesOk(s, limit) || !isSyncId(s.sessionId) || orphaned(s.sessionId) || !syncable('solves', stored)) {
            refused++;
            continue;
          }
          if (have === undefined) report.solvesAdded++;
          else if (s.updatedAt > have.updatedAt) report.solvesUpdated++;
          else {
            report.skipped++;
            continue;
          }
          knownSolves.set(s.id, stored);
          incoming.push(stored);
        }
        await each(incoming, (s) => solves.put(s));
        await each(incoming, (s) => ctx.track('solves', s.id));

        // Invariante: solve ativo que chegou do arquivo não pode ficar sob uma sessão na lixeira (a daqui, por exemplo, que foi
        // excluída): ela volta, só o registro dela. Do mesmo jeito, a exclusão de uma sessão que chegou do arquivo não pode deixar na
        // lixeira uma sessão com solve ativo daqui que o arquivo não traz (gravado aqui depois do export): ela volta, e o solve não some
        // da tela. Isso não entra no relatório.
        const revive = new Set(incoming.filter((s) => s.deletedAt === null).map((s) => s.sessionId));
        for (const s of sessionWrites) {
          if (s.deletedAt === null || revive.has(s.id)) continue;
          if ((await solves.index('bySession').getAll(keyRange(s.id))).some((x) => x.deletedAt === null)) revive.add(s.id);
        }
        let sessionBack = false;
        for (const id of revive) {
          if (await reviveSession(sessions, id, ctx)) sessionBack = true;
        }

        // O perfil do arquivo vale por cima do daqui: os ajustes e o acabamento são os do arquivo, a trilha soma as duas (nada
        // desmarca) e o tour feito num dos dois fica feito. A sessão atual passa a ser a do arquivo só quando a daqui não tem solve
        // nenhum (o aparelho novo) e a de lá existe fora da lixeira. Perfil que não muda nada não é gravado nem avisado.
        let profileSaved = false;
        if (data.profile) {
          const theirs = data.profile;
          const [stored, items] = await Promise.all([tx.objectStore('profile').get('current'), tx.objectStore('prefs').getAll()]);
          const base = composeProfile(stored, items);
          let currentSessionId = base.currentSessionId;
          if (typeof theirs.currentSessionId === 'string' && theirs.currentSessionId !== currentSessionId) {
            const target = await sessions.get(theirs.currentSessionId);
            const mineEmpty = currentSessionId === null || (await solves.index('bySession').count(keyRange(currentSessionId))) === 0;
            if (target?.deletedAt === null && mineEmpty) currentSessionId = target.id;
          }
          // A temporada nunca regride (spec 5.6): fica a mais adiantada. O acabamento do arquivo só vale se estiver liberado por ela.
          const season = moreAdvanced(base.season, seasonFrom(theirs.season));
          const finish = theirs.finish !== undefined && finishUnlocked(theirs.finish, season.past.length) ? theirs.finish : base.finish;
          // Um valor da conta que o sync não aceitaria (uma escolha além dos algoritmos do caso, um caso que esta versão não conhece, um
          // passo negativo, uma meta zero) fica de fora antes de juntar: senão writeProfile gravaria o padrão por cima do valor válido
          // daqui, e o padrão subiria para a conta.
          const accountSetting = <K extends 'inspection' | 'dailyGoal'>(key: K) =>
            isPrefValue(`settings.${key}`, theirs.settings?.[key]) ? theirs.settings?.[key] : undefined;
          const settings = theirs.settings && { ...theirs.settings, inspection: accountSetting('inspection'), dailyGoal: accountSetting('dailyGoal') };
          // O nome dos desafios do arquivo vale por cima, se o sync o aceitaria; um arquivo sem nome (ou com um torto) deixa o daqui.
          const duelName = isPrefValue('duelName', theirs.duelName) ? theirs.duelName : undefined;
          const merged = mergeProfile(base, {
            ...theirs,
            settings,
            season,
            finish,
            duelName,
            trail: theirs.trail ? base.trail.map((done, i) => done || theirs.trail?.[i] === true) : base.trail,
            onboarded: base.onboarded || theirs.onboarded === true,
            currentSessionId,
            // Treino: a escolha de algoritmo e o passo das aulas juntam caso a caso (vale o do arquivo); os casos fora do sorteio são os do
            // arquivo, quando ele os traz.
            algChoice: { ...base.algChoice, ...algChoiceFrom(theirs.algChoice) },
            lessonAt: { ...base.lessonAt, ...lessonAtFrom(theirs.lessonAt) },
            trainOff: trainOffFrom(theirs.trainOff) ?? base.trainOff,
            // As metas juntam pela vaga (joinGoals); a torta fica de fora antes, e um arquivo sem elas deixa as daqui.
            goals: joinGoals(base.goals, goalsFrom(theirs.goals)),
          });
          // Mesma ordem de chaves nos dois (mergeProfile monta ambos), então o JSON compara o conteúdo.
          if (!stored || JSON.stringify(merged) !== JSON.stringify(base)) {
            await writeProfile(tx, base, merged, ctx);
            profileSaved = true;
          }
        }

        // O treino junta pelo id (spec do sub-projeto 4, seção 9.3): entra o que não existe; o que já existe (até uma marca de exclusão)
        // fica como está.
        const knownPractice = new Set(await practice.getAllKeys());
        const newPractice: StoredPractice[] = [];
        for (const p of practiceFrom(data.practice)) {
          if (knownPractice.has(p.id)) continue;
          const stored = importedPractice(p);
          if (!isFileDate(p.at, limit) || !syncable('practice', stored)) {
            refused++;
            continue;
          }
          newPractice.push(stored);
        }
        await each(newPractice, (p) => practice.put(p));
        await each(newPractice, (p) => ctx.track('practice', p.id));

        // Os desafios juntam pelo id, como os solves (fora do relatório, como o treino): entra o que não existe, substitui o de updatedAt
        // menor, e o resto fica como está. Um com uma data que não serve, ou que o sync recusaria, fica de fora, contado em refused.
        const knownDuels = new Map<string, StoredDuel>();
        for (const d of await duels.getAll()) knownDuels.set(d.id, d);
        const duelWrites: StoredDuel[] = [];
        for (const d of duelsFrom(data.duels)) {
          const have = knownDuels.get(d.id);
          const stored: StoredDuel = { ...d, deletionStamp: importedStamp(have, d) };
          if (!fileDatesOk(d, limit) || !syncable('duels', stored)) {
            refused++;
            continue;
          }
          if (have !== undefined && d.updatedAt <= have.updatedAt) continue;
          duelWrites.push(stored);
        }
        await each(duelWrites, (d) => duels.put(d));
        await each(duelWrites, (d) => ctx.track('duels', d.id));
        return {
          profileSaved,
          sessionBack,
          practiceAdded: newPractice.length,
          sessionsWritten: sessionWrites.length,
          duelsWritten: duelWrites.length,
        };
      });
      if (refused > 0) report.refused = refused;
      const changed = outcome.sessionsWritten + report.solvesAdded + report.solvesUpdated + outcome.practiceAdded + outcome.duelsWritten > 0;
      if (outcome.profileSaved || changed) announce('all');
      if (outcome.sessionBack) announce('sessions');
      return report;
    },

    async replaceAll(data, { floor } = {}) {
      const { profile } = data;
      // Uma cópia de antes do treino (sem `practice`, ou com algo que não é lista) não mexe no treino daqui; com a lista, mesmo vazia, o
      // treino é o dela.
      const practice = Array.isArray(data.practice) ? practiceFrom(data.practice) : null;
      // Os desafios, do mesmo jeito: uma cópia de antes deles não mexe nos daqui; com a lista, mesmo vazia, valem os dela.
      const copyDuels = Array.isArray(data.duels) ? duelsFrom(data.duels) : null;
      await syncWrite(['sessions', 'solves', 'profile', 'prefs', 'practice', 'duels'], async (tx, ctx) => {
        const [sessions, solves, practices, device, items, duels] = await Promise.all([
          tx.objectStore('sessions').getAll(),
          tx.objectStore('solves').getAll(),
          tx.objectStore('practice').getAll(),
          tx.objectStore('profile').get('current'),
          tx.objectStore('prefs').getAll(),
          tx.objectStore('duels').getAll(),
        ]);
        // A restauração fica com a temporada mais adiantada (spec 5.6), mesmo que a cópia não tenha perfil, e uma cópia sem perfil também
        // não tira o acabamento que a pessoa escolheu.
        const local = composeProfile(device, items);
        // O que é do treino e a cópia não traz (uma cópia de antes do treino) fica o daqui; o nome dos desafios e as metas também (uma cópia de
        // antes deles gravaria '' por cima do nome e null por cima de cada meta, com a data da restauração, e subiria para a conta). A cópia que
        // os traz vale: `profile` vem depois (com `goals: {}`, as metas daqui voltam ao padrão).
        const kept: ProfilePatch = {
          lessonAt: local.lessonAt,
          algChoice: local.algChoice,
          trainOff: local.trainOff,
          duelName: local.duelName,
          goals: local.goals,
        };
        const restored = profile ? mergeProfile(defaultProfile(), { ...kept, ...profile }) : null;
        const season = moreAdvanced(local.season, seasonFrom(profile?.season));
        // Sem perfil na cópia e sem temporada a guardar, o perfil volta aos padrões, como sempre foi. Sem perfil na cópia e com temporada a
        // guardar, o perfil é o padrão com o acabamento daqui; com perfil, vale o acabamento da cópia. Nos dois, só se estiver liberado
        // pelas temporadas fechadas.
        const keepsProfile = restored !== null || season.past.length > 0;
        let target = defaultProfile();
        if (keepsProfile) {
          const base = restored ?? mergeProfile(defaultProfile(), { ...kept, finish: local.finish });
          target = { ...base, season, finish: finishUnlocked(base.finish, season.past.length) ? base.finish : 'fosco' };
        }
        const current: Change[] = [
          ...sessions.map((s) => toChange('sessions', s)),
          ...solves.map((s) => toChange('solves', s)),
          ...practices.map((p) => toChange('practice', p)),
          ...duels.map((d) => toChange('duels', d)),
          ...items.map(prefToChange),
        ];
        const copy = { sessions: data.sessions, solves: data.solves, practice, duels: copyDuels };
        const split = splitProfile(target);
        // O piso da restauração pelo aparelho (A1): a primeira data desta escrita, acima de tudo o que o aparelho já viu (o relógio sobe com
        // a hora do servidor e com cada data recebida); a restauração sai com a data seguinte, acima dele. Ele fica guardado com ela, para o
        // sync o mandar ao servidor, e o que vem de antes dela perde lá. Tirado aqui dentro, nada é gravado fora do portão da troca.
        const floorAt = floor ? ctx.stamp() : null;
        if (floorAt !== null) ctx.raise(floorAt + 1); // o stamp seguinte sai depois do piso
        const at = ctx.stamp();
        const changes = restoreChanges(current, copy, prefsFromProfile(split.account, { withDefaults: true }), at);
        // O que espera na fila daqui (uma edição que o orçamento do dia segurou, a fila longa de uma restauração de antes) ou na lista "só
        // neste aparelho", e esta restauração deixa como está (igual à cópia, ou fora dela e já apagado), também é dela: ganha a data dela,
        // senão perderia para o próprio piso quando subisse. O da fila volta a ela; o da lista continua na lista.
        const waiting = new Set<string>();
        const held = new Set(await heldOf(tx));
        let restamped: Change[] = [];
        if (floorAt !== null) {
          const rewritten = new Set(changes.map((c) => syncKey(c.store, c.id)));
          for (const key of await tx.objectStore('outbox').getAllKeys()) waiting.add(key);
          restamped = current
            .filter((c) => {
              const key = syncKey(c.store, c.id);
              return !rewritten.has(key) && (waiting.has(key) || held.has(key)) && checkChange(c).ok;
            })
            .map((c) => ({ ...c, updatedAt: at, deletionStamp: at }));
          const prior = ctx.state().pendingFloor;
          ctx.setState({ pendingFloor: isFloor(prior) ? Math.max(prior, floorAt) : floorAt });
        }
        await each([...changes, ...restamped], (c) => putChange(tx, c));
        // Tudo o que a restauração grava entra na fila (spec 5.5), menos o que o servidor recusaria (spec 6.6): um registro da cópia que já
        // estava torto aqui (um id que não serve de chave, um solve sem sessão, um desafio grande demais) volta à tela como antes, mas não
        // sobe. A fila vai em três grupos, cada um com uma data de fila depois da do anterior (outboxBatch manda da mais antiga para a mais
        // nova), e dentro de cada um a ordem de sempre (a chave); as datas dos registros continuam a da restauração:
        // 1. as exclusões que não são de sessão (o acabamento das cópias grandes, A2: perto da cota, o servidor recusaria o que volta da
        //    lixeira ou chega antes de elas abrirem as vagas), e as das sessões que a cota guarda, na frente dos solves delas (a chave), como
        //    em deleteSession: elas não estão no servidor, não há cascata lá, e atrás dos solves outboxBatch os guardaria de novo;
        // 2. o resto (o que volta da lixeira, o que chega, o que a cópia regrava ou move de sessão);
        // 3. as exclusões das outras sessões, por último (a revisão do acabamento, como deleteSession e requeueHeld): a de uma sessão cuja
        //    cascata não cabe num dia voltaria com a cota, e os solves dela esperariam com ela "só neste aparelho"; depois dos solves, ela chega
        //    sem solves ativos no servidor. E depois do resto: um solve que a cópia move para fora dela já está na outra sessão quando a
        //    cascata dela roda lá (antes, a cascata o apagaria com a data da restauração, e a mudança dele empataria nela: excluído vence).
        //    A cota não muda: os solves dela já saíram um a um no grupo 1, e a exclusão dela não abre vaga de solve.
        const queued = [...changes.filter((c) => checkChange(c).ok), ...restamped.filter((c) => waiting.has(syncKey(c.store, c.id)))];
        const lastDeletion = (c: Change): boolean => c.deletedAt !== null && c.store === 'sessions' && !held.has(syncKey(c.store, c.id));
        const groups = [
          queued.filter((c) => c.deletedAt !== null && !lastDeletion(c)),
          queued.filter((c) => c.deletedAt === null),
          queued.filter(lastDeletion),
        ].filter((group) => group.length > 0);
        for (const [i, group] of groups.entries()) {
          if (i > 0) ctx.raise(ctx.stamp() + 1); // o track seguinte tem uma data depois
          await each(group, (c) => ctx.track(c.store, c.id));
        }
        if (keepsProfile) await tx.objectStore('profile').put(split.device, 'current');
        else await tx.objectStore('profile').delete('current');
      });
      announce('all');
    },

    async addPractice(p) {
      const outcome = await syncWrite(['practice'], async (tx, ctx) => {
        const store = tx.objectStore('practice');
        const stored = await store.get(p.id);
        if (stored) return { practice: stored, added: false };
        const at = ctx.stamp();
        const record: StoredPractice = { ...p, updatedAt: at, deletedAt: null, deletionStamp: at };
        await store.add(record);
        await ctx.track('practice', p.id);
        return { practice: record, added: true };
      });
      if (outcome.added) announce('practice');
      return structuredClone(barePractice(outcome.practice));
    },

    async listPractice({ caseId } = {}) {
      const list = caseId === undefined ? await db.getAll('practice') : await db.getAllFromIndex('practice', 'byCase', keyRange(caseId));
      return list.filter((p) => p.deletedAt === null).map(barePractice).sort(byPracticeTime);
    },

    // Corrigir o acerto muda updatedAt (spec 5.1). Uma tentativa apagada não se corrige.
    async updatePractice(id, patch) {
      const updated = await syncWrite(['practice'], async (tx, ctx) => {
        const store = tx.objectStore('practice');
        const current = await store.get(id);
        if (!current || current.deletedAt !== null) throw new Error(`Tentativa não encontrada: ${id}`);
        const next: StoredPractice = { ...current, ...definedOnly(patch), updatedAt: ctx.stamp() };
        await store.put(next);
        await ctx.track('practice', id);
        return next;
      });
      announce('practice');
      return barePractice(updated);
    },

    // Apagar uma tentativa vira marca de exclusão (spec 5.1): a remoção de verdade ressuscitaria a tentativa no sync.
    async deletePractice(id) {
      await syncWrite(['practice'], async (tx, ctx) => {
        const store = tx.objectStore('practice');
        const current = await store.get(id);
        if (!current || current.deletedAt !== null) return;
        const at = ctx.stamp();
        await store.put({ ...current, deletedAt: at, updatedAt: at, deletionStamp: at });
        await ctx.track('practice', id);
      });
      announce('practice');
    },

    async listDuels({ includeDeleted = false } = {}) {
      const all = (await db.getAllFromIndex('duels', 'byCreated')).reverse();
      return all.filter((d) => includeDeleted || d.deletedAt === null).map(bareDuel);
    },

    async getDuel(id) {
      const duel = await db.get('duels', id);
      return duel ? bareDuel(duel) : null;
    },

    // As datas vêm do relógio do sync (spec 5.4), como nos solves. Substituir não mexe na marca de exclusão: uma edição nunca desfaz a
    // exclusão feita noutro aparelho (D5). Só a volta de um desafio da lixeira ganha marca nova, como restoreDuel.
    async saveDuel(d, { expectUpdatedAt } = {}) {
      if (d.id !== `${d.linkId}-${d.side}`) throw new Error(`Id de desafio fora do formato: ${d.id}`);
      const saved = await syncWrite(['duels'], async (tx, ctx) => {
        const store = tx.objectStore('duels');
        const current = await store.get(d.id);
        // A conferência na mesma transação que grava: nada passa entre ler o registro e gravar por cima dele.
        if (expectUpdatedAt !== undefined && (current?.updatedAt ?? null) !== expectUpdatedAt) {
          throw new DuelConflictError(current ? bareDuel(current) : null);
        }
        const at = ctx.stamp();
        const record: StoredDuel = {
          ...d,
          createdAt: current?.createdAt ?? at,
          updatedAt: at,
          deletedAt: null,
          deletionStamp: current && current.deletedAt === null ? current.deletionStamp : at,
        };
        await store.put(record);
        await ctx.track('duels', d.id);
        return record;
      });
      announce('duels');
      return structuredClone(bareDuel(saved));
    },

    deleteDuel(id, { expectUpdatedAt } = {}) {
      return trashDuel(id, true, expectUpdatedAt);
    },

    restoreDuel(id) {
      return trashDuel(id, false);
    },

    onChange(fn) {
      const entry = { fn };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },

    // A conexão fecha já (as transações em andamento ainda confirmam). O canal fecha depois que elas terminarem e avisarem a outra aba:
    // sem isso, um solve gravado no meio de uma reabertura não chegaria à outra aba.
    close() {
      closed = true;
      listeners.clear();
      db.close();
      if (inflight === 0) closeChannelSoon();
    },
  };
}

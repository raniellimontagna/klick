// O envelope do sync (spec 6.1) e os tipos que o app e o Worker dividem. Tudo aqui é puro: nada de navegador, banco ou rede, porque o
// Worker importa os mesmos arquivos (worker/tsconfig.json inclui src/core).
import type { Settings } from '../types';

export type SyncStore = 'solves' | 'sessions' | 'practice' | 'prefs';
export const SYNC_STORES: readonly SyncStore[] = Object.freeze(['solves', 'sessions', 'practice', 'prefs'] as const);

// Uma mudança: o registro inteiro, com as datas fora de `data`. Em prefs, `id` é a chave, `data` é o valor, deletedAt é sempre null e
// deletionStamp é sempre igual a updatedAt.
export interface Change {
  store: SyncStore;
  id: string;
  data: unknown;
  updatedAt: number;
  deletedAt: number | null;
  deletionStamp: number; // a data da última mudança no estado de exclusão (apagar ou restaurar); editar não mexe nela
}

// Sobe quando o formato do pedido ou da resposta muda: o servidor responde 426 a uma versão que não conhece. O 2 veio com a cota e o
// orçamento do dia (endurecimento 4.1): um app de antes leria "cota" e o resto adiado como uma recusa comum e tiraria da fila o que só
// existe nele.
export const SYNC_PROTOCOL = 2;
// Mudanças por pedido que o app manda: o que o servidor lê de uma vez (MAX_WRITES_PER_REQUEST, worker/limits.ts, Task 12). A página de
// volta é do servidor (PULL_PAGE), e `more` e o cursor cobrem qualquer tamanho dela.
export const SYNC_BATCH = 250;
// A maior data do sync: 2^32 ms (uns 50 dias) abaixo do maior inteiro seguro. O servidor recusa datas acima dela (shape.ts), e o relógio dos
// aparelhos fica abaixo dela (data/repository.ts): toda data que um aparelho grava é aceita, e um registro nunca fica com uma data que
// nenhum aparelho consegue passar (ele nunca mais seria editado nem apagado).
export const MAX_STAMP = Number.MAX_SAFE_INTEGER - 2 ** 32;
export const CAPTCHA_HEADER = 'x-turnstile-token'; // o token do Turnstile no pedido do código (spec 7.5): o app manda, o Worker confere
// A conta que o aparelho espera, nas rotas da conta que não levam corpo de sync (as cópias na nuvem, restaurar e apagar a conta). O Worker
// recusa (401) quando ela não é a da sessão: o cookie de outra conta nunca lê nem grava na conta deste aparelho (revisão final, C1).
export const ACCOUNT_HEADER = 'x-klick-account';

export interface SyncRequest {
  v: number;
  account: string; // a conta que o aparelho espera (meta.sync.accountId): o Worker recusa (401) a sessão de outra conta
  deviceId: string;
  cursor: number;
  clock: number;
  changes: Change[];
}

export interface Rejected {
  store: string;
  id: string;
  reason: string;
}

export interface SyncResponse {
  accepted: number;
  rejected: Rejected[];
  changes: Change[];
  cursor: number;
  more: boolean;
  serverTime: number;
  // As últimas N mudanças do lote não foram lidas (o orçamento de gravações do dia acabou, ou o pedido passou de MAX_WRITES_PER_REQUEST):
  // continuam na fila.
  deferred?: number;
  retryAt?: number; // quando mandar de novo o que foi adiado: a virada do dia do orçamento, ou a hora do pedido (o corte do pedido: já)
  copiesPaused?: CopiesPaused | null; // as cópias na nuvem da conta estão pausadas, e por quê
}

// Um item da conta (store prefs, spec 5.2).
export interface PrefItem {
  key: string;
  value: unknown;
  updatedAt: number;
}

// O perfil do aparelho (store profile, spec 5.2): o que nunca sobe.
export type DeviceSettings = Omit<Settings, 'inspection' | 'dailyGoal'>;
export interface DeviceProfile {
  settings: DeviceSettings;
  currentSessionId: string | null;
}

// Uma entrada da fila de saída (store outbox, spec 5.3), na chave `${store}/${id}`.
export interface OutboxEntry {
  store: SyncStore;
  id: string;
  queuedAt: number;
}

// O bloco sync do meta (spec 5.4), na chave 'sync' da store meta. `accountId` fica depois de sair (spec 7.6); `signedIn` diz se há
// sessão; `firstSync` diz que o primeiro login começou e a deduplicação (spec 6.5) ainda não terminou: se o app fechar no meio, ele
// continua daí; `firstSyncDefaults`, as sessões padrão (`default-<evento>`) que a conta devolveu nesse download (a deduplicação só guarda a
// daqui que a conta também tem); `passkey` lembra que este aparelho criou uma passkey (a tela de entrar a oferece primeiro). `refusedBuild`:
// a versão do app que recusou algo de um lote do servidor (um evento, uma chave de ajuste que só uma versão mais nova conhece) enquanto o
// cursor passava por cima; a primeira rodada de outra versão recomeça o cursor do 0, uma vez, e tira a marca. `pushAfter`: o orçamento de
// gravações do dia da conta acabou (endurecimento, decisão 6), e nada sobe antes desta hora, no relógio deste aparelho (a espera que o
// servidor pediu, retryAt − serverTime, contada da resposta e com teto: sync/engine.ts); null: sobe quando houver fila. `copiesPaused`: a
// pausa das cópias na nuvem que veio na última resposta do sync (null: elas seguem).
export interface SyncState {
  accountId: string | null;
  email: string | null;
  signedIn: boolean;
  firstSync: boolean;
  firstSyncDefaults: string[];
  cursor: number;
  lastSyncAt: number | null;
  clock: number;
  passkey: boolean;
  refusedBuild: string | null;
  pushAfter: number | null;
  copiesPaused: CopiesPaused | null;
}

export const syncKey = (store: string, id: string): string => `${store}/${id}`;

// Uma cópia na nuvem (spec 8.3): `name` é o nome do arquivo sem extensão (o dia, ou o dia e a hora da cópia de antes de uma restauração).
export interface CloudCopy {
  name: string;
  day: string; // AAAA-MM-DD, em Brasília
  kind: 'daily' | 'pre-restore';
  solves: number; // solves ativos na cópia
}

// Por que as cópias na nuvem estão pausadas (endurecimento 4.2 e decisões 1 e 2): o teto de espaço das cópias encheu ('space'), o de
// operações do R2 no mês acabou ('ops'), ou a conta passou do tamanho que o plano gratuito copia ('size': mais registros que
// SNAPSHOT_MAX_RECORDS, worker/limits.ts, Task 12; os registros nunca diminuem, então ela fica até o teto subir). Quem diz, e o que quer
// dizer:
// - `SyncResponse.copiesPaused` é o estado da cópia do dia: a última tentativa não gravou por isso, e a de amanhã tenta de novo (null: a
//   última foi gravada, ou nenhuma foi recusada).
// - `CloudCopies.paused` é esse mesmo estado; e, quando a lista vem guardada porque não houve operação para listar o R2 de novo, 'ops'
//   também quer dizer "a lista não se renovou este mês" (ela pode estar velha), mesmo que a cópia do dia ainda não tenha sido recusada.
export type CopiesPaused = 'space' | 'ops' | 'size';
export const COPIES_PAUSED: readonly CopiesPaused[] = Object.freeze(['space', 'ops', 'size'] as const);
export const isCopiesPaused = (v: unknown): v is CopiesPaused => COPIES_PAUSED.includes(v as CopiesPaused);

// A lista de cópias na nuvem, com a pausa (null quando as cópias seguem).
export interface CloudCopies {
  copies: CloudCopy[];
  paused: CopiesPaused | null;
}

// Por que uma restauração foi recusada (decisões 1, 2, 3 e 6): sem espaço para a cópia de antes de restaurar (no-room), restaurações demais
// no dia (restore-limit), sem operações do R2 no mês (r2-budget), uma conta maior que RESTORE_MAX_RECORDS ou mudanças que gravam mais linhas
// que o orçamento de um dia inteiro (too-big), ou que o que sobra dele hoje (write-budget).
export type RestoreRefusal = 'no-room' | 'restore-limit' | 'r2-budget' | 'too-big' | 'write-budget';

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

export const SYNC_PROTOCOL = 1; // sobe quando o formato do pedido muda: o servidor responde 426 a uma versão que não conhece
export const SYNC_BATCH = 500; // mudanças por pedido, nos dois sentidos

export interface SyncRequest {
  v: number;
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
// continua daí; `passkey` lembra que este aparelho criou uma passkey (a tela de entrar a oferece primeiro).
export interface SyncState {
  accountId: string | null;
  email: string | null;
  signedIn: boolean;
  firstSync: boolean;
  cursor: number;
  lastSyncAt: number | null;
  clock: number;
  passkey: boolean;
}

export const syncKey = (store: string, id: string): string => `${store}/${id}`;

// Uma cópia na nuvem (spec 8.3): `name` é o nome do arquivo sem extensão (o dia, ou o dia e a hora da cópia de antes de uma restauração).
export interface CloudCopy {
  name: string;
  day: string; // AAAA-MM-DD, em Brasília
  kind: 'daily' | 'pre-restore';
  solves: number; // solves ativos na cópia
}

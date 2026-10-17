// A cota por conta (endurecimento 4.1 e decisão 5): quantos registros ativos uma conta guarda no servidor, por store. O servidor recusa,
// com QUOTA_REASON, o registro que passaria a ativo além do teto (um novo, ou um que volta da lixeira); editar e apagar passam sempre. O
// app e o Worker dividem estes valores (src/core/sync é dos dois): o aparelho mostra o mesmo teto que o servidor aplica.
import type { SyncStore } from './types';

export type CountedStore = 'solves' | 'sessions' | 'practice';
export type ActiveCounts = Record<CountedStore, number>;

// Folgados para uso real (100 mil solves são anos de treino diário; uma sessão por dia leva uns 27 anos até as 10 mil, bem depois dos 100
// mil solves) e apertados para lixo. Os ajustes (prefs) não têm teto: isPrefValue só aceita as chaves do catálogo (trilha, lições, casos),
// então o número deles já é limitado.
export const ACCOUNT_LIMITS: Readonly<ActiveCounts> = Object.freeze({ solves: 100_000, sessions: 10_000, practice: 100_000 });

// O motivo, em `rejected`, de um registro recusado pela cota: o aparelho o guarda fora da fila ("só neste aparelho"), em vez de tratá-lo
// como uma recusa comum.
export const QUOTA_REASON = 'cota';

const COUNTED: readonly SyncStore[] = Object.freeze(['solves', 'sessions', 'practice'] as const);
export const isCounted = (store: SyncStore): store is CountedStore => COUNTED.includes(store);
export const zeroCounts = (): ActiveCounts => ({ solves: 0, sessions: 0, practice: 0 });

// A marca compactada (endurecimento, decisão 5): de um solve apagado há mais que isto, o servidor guarda só a marca de exclusão (o id e as
// datas, com `data: {}`; records.ts), e o objeto da conta não cresce sem fim com criar e apagar. É o mesmo prazo da lixeira do aparelho
// (TRASH_MS, data/safety.ts): até ele, um aparelho ainda restaura o solve com o conteúdo de qualquer lado.
export const TOMBSTONE_KEEP_MS = 30 * 86_400_000;

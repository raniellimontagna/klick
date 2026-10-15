// A forma de uma mudança (spec 6.1, passo 1): store conhecida, id, datas, tamanho e os campos que o Klick usa de cada registro. Campos
// a mais em `data` passam intactos. O servidor recusa o que não bate, com o motivo; o app ignora o que vier torto do servidor.
import { EVENT_IDS } from '../events';
import { canonicalJson } from './merge';
import { isPrefValue } from './prefs';
import { SYNC_STORES, type Change, type SyncStore } from './types';

export const MAX_DATA_CHARS = 16_384;
export const MAX_SEASON_CHARS = 65_536;
const ID = /^[\w.-]{1,96}$/;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStamp = (v: unknown): v is number => isNum(v) && v >= 0;
const isEvent = (v: unknown): boolean => typeof v === 'string' && (EVENT_IDS as readonly string[]).includes(v);
const isPenalty = (v: unknown): boolean => v === null || v === '+2' || v === 'DNF';

function dataProblem(store: SyncStore, id: string, d: unknown, change: Record<string, unknown>): string | null {
  if (store === 'prefs') {
    if (change.deletedAt !== null || change.deletionStamp !== change.updatedAt) return 'prefs sem exclusão';
    return isPrefValue(id, d) ? null : 'valor inválido para a chave';
  }
  if (!isRec(d)) return 'data não é objeto';
  switch (store) {
    case 'solves':
      return typeof d.sessionId === 'string' && d.sessionId !== '' && isEvent(d.event) && isNum(d.ms) && d.ms >= 0 && isPenalty(d.penalty) &&
        isNum(d.at) && typeof d.scramble === 'string' && typeof d.note === 'string' && isNum(d.createdAt)
        ? null
        : 'solve inválido';
    case 'sessions':
      return typeof d.name === 'string' && isEvent(d.event) && isNum(d.order) && isNum(d.createdAt) ? null : 'sessão inválida';
    case 'practice':
      return typeof d.caseId === 'string' && d.caseId !== '' && isNum(d.ms) && d.ms >= 0 && typeof d.ok === 'boolean' &&
        typeof d.helped === 'boolean' && isNum(d.at)
        ? null
        : 'tentativa inválida';
  }
}

export type Checked = { ok: true; change: Change } | { ok: false; reason: string };

export function checkChange(raw: unknown): Checked {
  if (!isRec(raw)) return { ok: false, reason: 'mudança não é objeto' };
  const { store, id, data, updatedAt, deletedAt, deletionStamp } = raw;
  if (typeof store !== 'string' || !(SYNC_STORES as readonly string[]).includes(store)) return { ok: false, reason: 'store desconhecida' };
  if (typeof id !== 'string' || !ID.test(id)) return { ok: false, reason: 'id inválido' };
  if (!isStamp(updatedAt) || !isStamp(deletionStamp) || !(deletedAt === null || isStamp(deletedAt))) return { ok: false, reason: 'datas inválidas' };
  const limit = store === 'prefs' && id === 'season' ? MAX_SEASON_CHARS : MAX_DATA_CHARS;
  // canonicalJson recursa: um data aninhado a milhares de níveis estoura a pilha em vez de passar do limite. Conta como grande demais.
  let size = Infinity;
  try {
    size = canonicalJson(data).length;
  } catch {
    /* fundo demais */
  }
  if (size > limit) return { ok: false, reason: 'grande demais' };
  const problem = dataProblem(store as SyncStore, id, data, raw);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, change: { store: store as SyncStore, id, data, updatedAt, deletedAt, deletionStamp } };
}

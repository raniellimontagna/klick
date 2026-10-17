// A forma de uma mudança (spec 6.1, passo 1): store conhecida, id, datas, tamanho e os campos que o Klick usa de cada registro. Campos
// a mais em `data` passam intactos. O servidor recusa o que não bate, com o motivo; o app ignora o que vier torto do servidor.
import { EVENT_IDS } from '../events';
import { canonicalJson } from './merge';
import { isPrefValue } from './prefs';
import { isCompacted } from './records';
import { MAX_STAMP, SYNC_STORES, type Change, type SyncStore } from './types';

export const MAX_DATA_CHARS = 16_384;
export const MAX_SEASON_CHARS = 65_536;
export const MAX_DEPTH = 32; // o Klick usa até uns 4 níveis de objeto/lista (a temporada: ela, current, marks, cada marca)
const ID = /^[\w.-]{1,96}$/;
// Um texto que serve de id no sync. O import usa também para o `sessionId` de um solve: uma sessão com outro id não pode existir.
export const isSyncId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
// Datas são inteiros seguros até MAX_STAMP: viram o relógio do app (max(Date.now(), clock + 1)), e de 2^53 em diante o `+ 1` não muda nada,
// o relógio para e toda gravação seguinte empata. Como o servidor guarda o maior, uma data assim nunca mais sairia da conta; e uma acima do
// teto do relógio nunca mais seria passada por gravação nenhuma.
const isStamp = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MAX_STAMP;
const isEvent = (v: unknown): boolean => typeof v === 'string' && (EVENT_IDS as readonly string[]).includes(v);
const isPenalty = (v: unknown): boolean => v === null || v === '+2' || v === 'DNF';

// Mais de MAX_DEPTH objetos/listas encadeados (contando o próprio data)? Percorre sem recursão: o corte é o mesmo no app e no servidor, e
// não depende da pilha. Sem ele, um data fundo estouraria a pilha no canonicalJson de quem o lê depois (o merge).
function tooDeep(data: unknown): boolean {
  const pending: [unknown, number][] = [[data, 1]];
  while (pending.length > 0) {
    const [v, depth] = pending.pop()!;
    if (typeof v !== 'object' || v === null) continue;
    if (depth > MAX_DEPTH) return true;
    for (const child of Array.isArray(v) ? v : Object.values(v)) pending.push([child, depth + 1]);
  }
  return false;
}

function dataProblem(store: SyncStore, id: string, d: unknown, change: Record<string, unknown>): string | null {
  if (store === 'prefs') {
    if (change.deletedAt !== null || change.deletionStamp !== change.updatedAt) return 'prefs sem exclusão';
    return isPrefValue(id, d) ? null : 'valor inválido para a chave';
  }
  if (!isRec(d)) return 'data não é objeto';
  switch (store) {
    case 'solves':
      // A marca compactada (records.ts): um solve apagado só com as datas. As datas já passaram por isStamp.
      if (isCompacted({ store, data: d, deletedAt: change.deletedAt as number | null })) return null;
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
  if (!isSyncId(id)) return { ok: false, reason: 'id inválido' };
  if (!isStamp(updatedAt) || !isStamp(deletionStamp) || !(deletedAt === null || isStamp(deletedAt))) return { ok: false, reason: 'datas inválidas' };
  const limit = store === 'prefs' && id === 'season' ? MAX_SEASON_CHARS : MAX_DATA_CHARS;
  if (tooDeep(data) || canonicalJson(data).length > limit) return { ok: false, reason: 'grande demais' };
  const problem = dataProblem(store as SyncStore, id, data, raw);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, change: { store: store as SyncStore, id, data, updatedAt, deletedAt, deletionStamp } };
}

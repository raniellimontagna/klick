// O que vem de fora (arquivo do Klick, cópia de segurança) sobre os desafios (spec do desafio, seção 7). Nada aqui recusa o arquivo: o
// desafio que não bate fica de fora e o resto entra, porque os solves valem mais que uma partida estranha.
import { EVENT_IDS } from '../events';
import type { Duel, DuelStatus, EventId } from '../types';
import { DUEL_LINK_ID, isDuelName, isDuelScramble, isDuelTime } from './link';
import { DUEL_SCRAMBLES } from './score';

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const STATUSES: readonly DuelStatus[] = ['playing', 'waiting', 'done'];
// Os tempos de um lado: até sete, cada um no formato do link.
const isTimes = (v: unknown): boolean => Array.isArray(v) && v.length <= DUEL_SCRAMBLES && v.every(isDuelTime);

// Um desafio com todos os campos, como o link os aceita, e o id `${linkId}-${side}`.
export function isDuel(v: unknown): v is Duel {
  return (
    isRec(v) && typeof v.linkId === 'string' && DUEL_LINK_ID.test(v.linkId) && (v.side === 'a' || v.side === 'b') &&
    v.id === `${v.linkId}-${v.side}` && typeof v.event === 'string' && EVENT_IDS.includes(v.event as EventId) &&
    Array.isArray(v.scrambles) && v.scrambles.length === DUEL_SCRAMBLES && v.scrambles.every(isDuelScramble) &&
    isTimes(v.mine) && (v.theirs === null || isTimes(v.theirs)) && isDuelName(v.myName) && isDuelName(v.theirName) &&
    STATUSES.includes(v.status as DuelStatus) && isNum(v.createdAt) && isNum(v.updatedAt) && (v.deletedAt === null || isNum(v.deletedAt))
  );
}

// Os desafios válidos da lista, sem repetir id (fica o primeiro). Campos que o Klick ainda não conhece passam intactos, como nos solves.
export function duelsFrom(v: unknown): Duel[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Duel[] = [];
  for (const x of v) {
    if (!isDuel(x) || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

// O formato da cópia em partes (spec das cópias grandes, seção 4): uma conta grande demais para um gzip só (o Worker lê a conta e comprime
// na memória de um objeto) é copiada em partes. O manifesto fica na chave de sempre (snap/<conta>/<nome>.json.gz) e as partes, numa pasta
// com o nome da cópia (snap/<conta>/<nome>/001.json.gz, ...). Tudo aqui é puro: o Worker grava e restaura, e o app baixa as partes.
import type { Duel, KlickExport, Practice, ProfilePatch, Session, Solve } from '../types';

// A chave de um registro, como o SQLite ordena a tabela: [store, id].
export type CopyKey = readonly [store: string, id: string];

export interface CopyManifest {
  format: 'klick-parts';
  version: 1;
  exportedAt: number;
  day: string; // AAAA-MM-DD, em Brasília
  profile: ProfilePatch | null;
  solves: number; // os solves ativos da cópia
  // `last` é a maior chave da parte i + 1 (partes de 1 a N, na ordem das chaves); `records` quantos registros ela leva.
  parts: { last: CopyKey; records: number }[];
}

export interface CopyPart {
  sessions: Session[];
  solves: Solve[];
  practice: Practice[];
  duels: Duel[];
}

// O número de partes de uma cópia: o nome da parte tem 3 dígitos.
export const MAX_PARTS = 999;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isKey = (v: unknown): v is CopyKey => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string';

export function isManifest(v: unknown): v is CopyManifest {
  if (!isObject(v) || v.format !== 'klick-parts' || v.version !== 1) return false;
  if (typeof v.exportedAt !== 'number' || !Number.isFinite(v.exportedAt) || typeof v.day !== 'string') return false;
  if (v.profile !== null && !isObject(v.profile)) return false;
  if (!isCount(v.solves)) return false;
  const parts = v.parts;
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_PARTS) return false;
  return parts.every((p) => isObject(p) && isKey(p.last) && isCount(p.records));
}

// Só a forma: cada lista é uma lista de objetos com `id` de texto. O conteúdo de cada registro quem confere é quem grava (o servidor, na
// restauração, e o app, ao importar), como no arquivo de uma cópia inteira.
const isRecords = (v: unknown): boolean => Array.isArray(v) && v.every((r) => isObject(r) && typeof r.id === 'string');

export function isCopyPart(v: unknown): v is CopyPart {
  return isObject(v) && isRecords(v.sessions) && isRecords(v.solves) && isRecords(v.practice) && isRecords(v.duels);
}

// A faixa de chaves da parte `i` (de 0): acima de `lo`, até `hi`. A primeira não tem `lo`; a última não tem `hi`, para a faixa cobrir
// também as chaves que chegaram depois da cópia.
export function sliceOf(m: CopyManifest, i: number): { lo: CopyKey | null; hi: CopyKey | null } {
  if (!Number.isInteger(i) || i < 0 || i >= m.parts.length) throw new RangeError(`parte ${i} fora de 0..${m.parts.length - 1}`);
  return { lo: i === 0 ? null : m.parts[i - 1].last, hi: i === m.parts.length - 1 ? null : m.parts[i].last };
}

// As partes de volta num export só, com o perfil e a data do manifesto.
export function assembleCopy(m: CopyManifest, parts: readonly CopyPart[]): KlickExport {
  return {
    format: 'klick',
    version: 1,
    exportedAt: m.exportedAt,
    sessions: parts.flatMap((p) => p.sessions),
    solves: parts.flatMap((p) => p.solves),
    profile: m.profile,
    practice: parts.flatMap((p) => p.practice),
    duels: parts.flatMap((p) => p.duels),
  };
}

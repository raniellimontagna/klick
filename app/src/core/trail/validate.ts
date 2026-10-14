// O que vem de fora (arquivo do Klick, cópia de segurança) sobre a trilha e o treino (spec 9.3). Nada aqui recusa o arquivo: o que não
// bate fica de fora e o resto entra, porque os solves valem mais que uma tentativa de treino estranha.
import type { Practice } from '../types';
import { caseById } from './cases';
import type { TrailStep } from './types';

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

// Uma tentativa com todos os campos, de um caso que o Klick conhece e com um tempo válido.
export function isPractice(v: unknown): v is Practice {
  return (
    isRec(v) && typeof v.id === 'string' && v.id !== '' && typeof v.caseId === 'string' && caseById(v.caseId) !== undefined &&
    isNum(v.ms) && v.ms >= 0 && typeof v.ok === 'boolean' && typeof v.helped === 'boolean' && isNum(v.at)
  );
}

// As tentativas válidas da lista, sem repetir id (fica a primeira). Campos que o Klick ainda não conhece passam intactos, como nos solves.
export function practiceFrom(v: unknown): Practice[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Practice[] = [];
  for (const x of v) {
    if (!isPractice(x) || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

// A escolha de algoritmo por caso: só os casos conhecidos e os índices que existem neles. O resto sai, e sem a chave vale o padrão (0).
export function algChoiceFrom(v: unknown): Record<string, number> | undefined {
  if (!isRec(v)) return undefined;
  return Object.fromEntries(
    Object.entries(v).filter(([id, i]) => {
      const c = caseById(id);
      return c !== undefined && isIndex(i) && i < c.algs.length;
    }),
  ) as Record<string, number>;
}

// Os casos fora do sorteio: só ids conhecidos, sem repetir.
export function trainOffFrom(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return [...new Set(v.filter((id): id is string => typeof id === 'string' && caseById(id) !== undefined))];
}

// O passo em que cada aula parou: etapas de 0 a 8 e passos inteiros a partir de 0 (quem abre a aula limita ao último passo dela).
export function lessonAtFrom(v: unknown): Partial<Record<TrailStep, number>> | undefined {
  if (!isRec(v)) return undefined;
  return Object.fromEntries(Object.entries(v).filter(([step, i]) => /^[0-8]$/.test(step) && isIndex(i))) as Partial<Record<TrailStep, number>>;
}

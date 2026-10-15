// Apoio dos testes do sync: um sorteio com semente fixa (mulberry32), para as simulações e as propriedades se repetirem igual.
// Não é um arquivo de teste.
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pickWith =
  (rnd: () => number) =>
  <T>(list: readonly T[]): T | undefined =>
    list.length === 0 ? undefined : list[Math.floor(rnd() * list.length)];

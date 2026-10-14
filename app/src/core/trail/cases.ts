// Os casos do treino (spec 5.4): OLL em 2 passos (10), PLL em 2 passos (6) e F2L com algoritmos (41). A ordem é a das aulas: é nela que
// os casos novos aparecem no treino. O primeiro algoritmo de cada caso é o padrão, e o inverso dele monta o caso. Todos foram conferidos
// com o cubing.js (tests/unit/trail-cases.test.ts).
//
// F2L: a numeração é a do app, por grupos (o par é sempre o da frente-direita): 1 a 24 com canto e aresta em cima, 25 a 30 com o canto em
// cima e a aresta no lugar, 31 a 36 com o canto no lugar e a aresta em cima, 37 a 41 com os dois no lugar.
import type { CaseSet, TrainCase } from './types';

export const CASE_SETS: readonly CaseSet[] = Object.freeze(['oll2', 'pll2', 'f2l']);

export const CASES: readonly TrainCase[] = Object.freeze([
  { id: 'oll2-linha', set: 'oll2', name: 'Linha', recog: 'Duas arestas amarelas em linha, de um lado ao outro.', algs: ["F R U R' U' F'"] },
  { id: 'oll2-l', set: 'oll2', name: 'L', recog: 'Duas arestas amarelas vizinhas, formando um L.', algs: ["f R U R' U' f'"] },
  { id: 'oll2-ponto', set: 'oll2', name: 'Ponto', recog: 'Nenhuma aresta amarela em cima: só o centro.', algs: ["F R U R' U' F' f R U R' U' f'"] },
  { id: 'oll2-sune', set: 'oll2', name: 'Sune', recog: 'Um canto amarelo para cima; os outros três giram no mesmo sentido.', algs: ["R U R' U R U2 R'"] },
  { id: 'oll2-antisune', set: 'oll2', name: 'Anti-Sune', recog: 'Um canto amarelo para cima; os outros três giram no sentido contrário ao do Sune.', algs: ["R U2 R' U' R U' R'"] },
  { id: 'oll2-h', set: 'oll2', name: 'H', recog: 'Nenhum canto para cima; os amarelos dos cantos olham aos pares para a frente e para trás.', algs: ["R U R' U R U' R' U R U2 R'", "F R U R' U' R U R' U' R U R' U' F'"] },
  { id: 'oll2-pi', set: 'oll2', name: 'Pi', recog: 'Nenhum canto para cima; dois amarelos olham para o mesmo lado e os outros dois para lados opostos.', algs: ["R U2 R2 U' R2 U' R2 U2 R"] },
  { id: 'oll2-farois', set: 'oll2', name: 'Faróis', recog: 'Dois cantos para cima, vizinhos; os outros dois olham para o mesmo lado, como faróis.', algs: ["R2 D R' U2 R D' R' U2 R'"] },
  { id: 'oll2-t', set: 'oll2', name: 'T', recog: 'Dois cantos para cima, vizinhos; os outros dois olham para lados opostos.', algs: ["r U R' U' r' F R F'"] },
  { id: 'oll2-gravata', set: 'oll2', name: 'Gravata', recog: 'Dois cantos para cima, em diagonal.', algs: ["F' r U R' U' r' F R"] },
  { id: 'pll2-t', set: 'pll2', name: 'T-perm', recog: 'Faróis de um lado só: os dois cantos do lado oposto trocam.', algs: ["R U R' U' R' F R2 U' R' U' R U R' F'"] },
  { id: 'pll2-y', set: 'pll2', name: 'Y-perm', recog: 'Nenhum farol: dois cantos trocam na diagonal.', algs: ["F R U' R' U' R U R' F' R U R' U' R' F R F'"] },
  { id: 'pll2-ua', set: 'pll2', name: 'Ua', recog: 'Cantos prontos e uma lateral inteira pronta; as outras três arestas giram. É o espelho da Ub.', algs: ["R U' R U R U R U' R' U' R2"] },
  { id: 'pll2-ub', set: 'pll2', name: 'Ub', recog: 'Cantos prontos e uma lateral inteira pronta; as outras três arestas giram. É o espelho da Ua.', algs: ["R2 U R U R' U' R' U' R' U R'"] },
  { id: 'pll2-h', set: 'pll2', name: 'H-perm', recog: 'Cantos prontos; as arestas opostas trocam, em cruz.', algs: ['M2 U M2 U2 M2 U M2'] },
  { id: 'pll2-z', set: 'pll2', name: 'Z-perm', recog: 'Cantos prontos; as arestas vizinhas trocam aos pares.', algs: ["M' U M2 U M2 U M' U2 M2"] },
  { id: 'f2l-01', set: 'f2l', name: 'F2L 1', recog: 'Canto em cima, branco para o lado; aresta em cima, atrás.', algs: ["R U R'"] },
  { id: 'f2l-02', set: 'f2l', name: 'F2L 2', recog: 'Canto em cima, branco para o lado; aresta em cima, à esquerda.', algs: ["F' U' F"] },
  { id: 'f2l-03', set: 'f2l', name: 'F2L 3', recog: 'Canto em cima, branco para o lado; aresta em cima, na frente.', algs: ["U' F' U F", "F R' F' R", "U2 F' U2 F"] },
  { id: 'f2l-04', set: 'f2l', name: 'F2L 4', recog: 'Canto em cima, branco para o lado; aresta em cima, à direita.', algs: ["U R U' R'", "U2 R U2 R'", "R' F R F'"] },
  { id: 'f2l-05', set: 'f2l', name: 'F2L 5', recog: 'Canto em cima, branco para cima; aresta em cima, na frente.', algs: ["F' U2 F U F' U' F", "U2 F2 U2 R' F' R U2 F2"] },
  { id: 'f2l-06', set: 'f2l', name: 'F2L 6', recog: 'Canto em cima, branco para cima; aresta em cima, à direita.', algs: ["R U2 R' U' R U R'", "U2 R2 U2 F R F' U2 R2"] },
  { id: 'f2l-07', set: 'f2l', name: 'F2L 7', recog: 'Canto em cima, branco para cima; aresta em cima, atrás.', algs: ["U R U2 R' U R U' R'", "U R U2 R' U2 R U2 R'", "U R U2 R2 F R F'"] },
  { id: 'f2l-08', set: 'f2l', name: 'F2L 8', recog: 'Canto em cima, branco para cima; aresta em cima, atrás.', algs: ["F' U F U2 F' U' F", "U2 R U R' F' U' F", "U2 F' U' F2 R' F' R"] },
  { id: 'f2l-09', set: 'f2l', name: 'F2L 9', recog: 'Canto em cima, branco para cima; aresta em cima, à esquerda.', algs: ["R U' R' U2 R U R'", "U2 R U R' U R U' R'", "U2 R U R' U2 R U2 R'"] },
  { id: 'f2l-10', set: 'f2l', name: 'F2L 10', recog: 'Canto em cima, branco para cima; aresta em cima, à esquerda.', algs: ["U' F' U2 F U' F' U F", "U' F' U2 F2 R' F' R", "U' F' U2 F U2 F' U2 F"] },
  { id: 'f2l-11', set: 'f2l', name: 'F2L 11', recog: 'Canto em cima, branco para o lado; aresta em cima, na frente.', algs: ["U F' U2 F U' R U R'", "R' U2 R2 U R2 U R"] },
  { id: 'f2l-12', set: 'f2l', name: 'F2L 12', recog: 'Canto em cima, branco para o lado; aresta em cima, à direita.', algs: ["R U' R' U2 F' U' F"] },
  { id: 'f2l-13', set: 'f2l', name: 'F2L 13', recog: 'Canto em cima, branco para o lado; aresta em cima, atrás.', algs: ["U F' U2 F U F' U2 F", "R2 U2 F R2 F' U2 R2", "U F' U2 F U2 F' U F"] },
  { id: 'f2l-14', set: 'f2l', name: 'F2L 14', recog: 'Canto em cima, branco para o lado; aresta em cima, na frente.', algs: ["F' U F U2 R U R'"] },
  { id: 'f2l-15', set: 'f2l', name: 'F2L 15', recog: 'Canto em cima, branco para o lado; aresta em cima, à direita.', algs: ["U' R U2 R' U F' U' F", "F U2 F2 U' F2 U' F'"] },
  { id: 'f2l-16', set: 'f2l', name: 'F2L 16', recog: 'Canto em cima, branco para o lado; aresta em cima, à esquerda.', algs: ["U' R U2 R' U' R U2 R'", "U' R U2 R' U2 R U' R'", "F2 U2 R' F2 R U2 F2"] },
  { id: 'f2l-17', set: 'f2l', name: 'F2L 17', recog: 'Canto em cima, branco para cima; aresta em cima, na frente.', algs: ["U2 R2 U2 R' U' R U' R2", "R' U' R U' R' U2 R2 U2 R'", "R2 U R' U R U2 R' U' R'"] },
  { id: 'f2l-18', set: 'f2l', name: 'F2L 18', recog: 'Canto em cima, branco para cima; aresta em cima, à direita.', algs: ["U2 F2 U2 F U F' U F2", "F U R U' R' F' R U' R'", "F' R' F U' F' U R U F"] },
  { id: 'f2l-19', set: 'f2l', name: 'F2L 19', recog: 'Canto em cima, branco para o lado; aresta em cima, à direita.', algs: ["U' R U' R' U R U R'", "U2 R2 U R' U R U2 R2", "R U F R' U R U' F' R'"] },
  { id: 'f2l-20', set: 'f2l', name: 'F2L 20', recog: 'Canto em cima, branco para o lado; aresta em cima, à esquerda.', algs: ["U' R U R' U R U R'", "U2 R U' R' U' R U R'", "U F' U F U' R U R'"] },
  { id: 'f2l-21', set: 'f2l', name: 'F2L 21', recog: 'Canto em cima, branco para o lado; aresta em cima, à esquerda.', algs: ["R' U' R F R' F' U R", "R' U' R F R2 F' R U R", "U2 F R' F' R U2 R U R'"] },
  { id: 'f2l-22', set: 'f2l', name: 'F2L 22', recog: 'Canto em cima, branco para o lado; aresta em cima, na frente.', algs: ["R U R2 F R F2 U' F", "R' U' F R F2 R' U R F", "U F U R U' R' F2 U' F"] },
  { id: 'f2l-23', set: 'f2l', name: 'F2L 23', recog: 'Canto em cima, branco para o lado; aresta em cima, atrás.', algs: ["U' R U R' U' R U2 R'", "U' R U R' U2 R U' R'", "U R2 U2 F R' F' U2 R2"] },
  { id: 'f2l-24', set: 'f2l', name: 'F2L 24', recog: 'Canto em cima, branco para o lado; aresta em cima, atrás.', algs: ["U' R U' R' U F' U' F", "U R U R' U2 F' U' F", "F R U R' U' F' R U' R'"] },
  { id: 'f2l-25', set: 'f2l', name: 'F2L 25', recog: 'Canto em cima, branco para cima; aresta no lugar, invertida.', algs: ["F' U F U' R U' R'", "F' U F R U2 R'", "R U' R' F' U2 F"] },
  { id: 'f2l-26', set: 'f2l', name: 'F2L 26', recog: 'Canto em cima, branco para cima; aresta no lugar, certa.', algs: ["R2 U R2 U R2 U2 R2", "U2 R2 U2 R2 U' R2 U' R2", "F2 U' F2 U' F2 U2 F2"] },
  { id: 'f2l-27', set: 'f2l', name: 'F2L 27', recog: 'Canto em cima, branco para o lado; aresta no lugar, certa.', algs: ["U R U R' U2 R U R'", "U' R U2 R' U R U R'", "F R' F2 R U R U' R' F"] },
  { id: 'f2l-28', set: 'f2l', name: 'F2L 28', recog: 'Canto em cima, branco para o lado; aresta no lugar, invertida.', algs: ["U F' U' F U' R U R'", "U2 F' U F U R U R'", "U2 F' U' F U R U' R'"] },
  { id: 'f2l-29', set: 'f2l', name: 'F2L 29', recog: 'Canto em cima, branco para o lado; aresta no lugar, certa.', algs: ["U' R U' R' U' R U2 R'", "U' R U' R' U2 R U' R'", "R U' R U2 R' U' R U' R2"] },
  { id: 'f2l-30', set: 'f2l', name: 'F2L 30', recog: 'Canto em cima, branco para o lado; aresta no lugar, invertida.', algs: ["U' R U R' U F' U' F", "U2 R U R' F R' F' R", "U2 R U R' U' F' U F"] },
  { id: 'f2l-31', set: 'f2l', name: 'F2L 31', recog: 'Canto no lugar, girado; aresta em cima.', algs: ["R U R' U F' U2 F", "R U2 R' F' U2 F", "R U R' U2 F' U F"] },
  { id: 'f2l-32', set: 'f2l', name: 'F2L 32', recog: 'Canto no lugar, branco embaixo; aresta em cima.', algs: ["U2 F' U F U R U' R'", "F' U2 F U2 R U R'", "U2 F' U F U2 R U2 R'"] },
  { id: 'f2l-33', set: 'f2l', name: 'F2L 33', recog: 'Canto no lugar, girado; aresta em cima.', algs: ["U' R U' R' U R U' R'", "U' R U' R' U2 R U2 R'", "U' F' U2 F R U2 R'"] },
  { id: 'f2l-34', set: 'f2l', name: 'F2L 34', recog: 'Canto no lugar, girado; aresta em cima.', algs: ["U2 R U' R' F' U' F", "R' F R F' U R U' R'", "R' F R F' U2 R U2 R'"] },
  { id: 'f2l-35', set: 'f2l', name: 'F2L 35', recog: 'Canto no lugar, girado; aresta em cima.', algs: ["U' R U R' U' R U R'", "U2 R U2 R' U2 R U R'", "U F' U F R U R'"] },
  { id: 'f2l-36', set: 'f2l', name: 'F2L 36', recog: 'Canto no lugar, branco embaixo; aresta em cima.', algs: ["U R U R' U' F' U' F", "R' U' R F' R' U R F", "U R U' R' F R' F' R"] },
  { id: 'f2l-37', set: 'f2l', name: 'F2L 37', recog: 'Canto no lugar, branco embaixo; aresta no lugar, invertida.', algs: ["R2 U2 F R2 F' U2 R' U R'", "R U' R U2 F R2 F' U2 R2", "R F R' F' U2 R U R U' R2"] },
  { id: 'f2l-38', set: 'f2l', name: 'F2L 38', recog: 'Canto no lugar, girado; aresta no lugar, certa.', algs: ["R2 U2 R' U' R U' R' U2 R'", "R U2 R U2 F R F' U2 R2", "F R' F' R2 U2 R' U' R U R'"] },
  { id: 'f2l-39', set: 'f2l', name: 'F2L 39', recog: 'Canto no lugar, girado; aresta no lugar, invertida.', algs: ["R F U R U' R' F' U' R'", "F' U F R U' R' U2 R U R'", "R2 U R' U R U2 R2 F' U2 F"] },
  { id: 'f2l-40', set: 'f2l', name: 'F2L 40', recog: 'Canto no lugar, girado; aresta no lugar, certa.', algs: ["R U2 R U R' U R U2 R2", "R2 U2 F R' F' U2 R' U2 R'", "R U' R' U R U2 R2 F R F'"] },
  { id: 'f2l-41', set: 'f2l', name: 'F2L 41', recog: 'Canto no lugar, girado; aresta no lugar, invertida.', algs: ["R U F R U R' U' F' R'", "F' U2 F R2 U2 R' U' R U' R2", "R U' R' U2 R U R' F' U' F"] },
]);

const BY_ID: ReadonlyMap<string, TrainCase> = new Map(CASES.map((c) => [c.id, c]));

export const casesOf = (set: CaseSet): TrainCase[] => CASES.filter((c) => c.set === set);
export const caseById = (id: string): TrainCase | undefined => BY_ID.get(id);

// O índice do algoritmo escolhido (profile.algChoice), ou 0 (o padrão) quando a escolha não vale para este caso.
export function choiceOf(c: TrainCase, algChoice: Readonly<Record<string, number>>): number {
  const i = algChoice[c.id];
  return Number.isInteger(i) && i >= 0 && i < c.algs.length ? i : 0;
}

export const chosenAlg = (c: TrainCase, algChoice: Readonly<Record<string, number>>): string => c.algs[choiceOf(c, algChoice)];

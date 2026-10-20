// As linhas da lista da Evolução (o histórico inteiro, spec §3; a maquete aprovada, 1a a 1c): o que cada linha mostra, montado só para as
// linhas que a lista desenha. As médias e os recordes vêm prontos (calculados uma vez por filtro); aqui é só formatar.
import { effectiveMs, formatMs, formatSolve } from '../../core/stats';
import type { Solve } from '../../core/types';
import { T } from '../../strings';
import { dateLabel, fullDate, shortDate, timeOfDay, truncate } from '../format';

// A seleção marca até este tanto de uma vez (spec §9.5): mover e excluir em lote passam por uma transação só.
export const MAX_SELECTION = 1_000;

// As séries do filtro, uma posição por solve do pool: a média de 5 e a de 12 que terminam nele, e se ele bateu o recorde da época.
export interface Series {
  ao5: readonly (number | null)[];
  ao12: readonly (number | null)[];
  pb: readonly boolean[];
}

export interface Row {
  id: string;
  number: number; // a posição no filtro: o mais antigo é o 1
  time: string; // "0:13.48", "0:15.24+" (+2) ou "DNF"
  plus2: boolean;
  dnf: boolean;
  ao5: string; // "—" antes de haver 5
  ao12: string;
  when: string;
  note: string;
  pb: boolean;
  scramble: string; // cortado como na tabela de antes (28 letras, com reticências)
  label: string; // o nome da linha para o leitor de tela, com tudo o que ela mostra
}

const sameYear = (a: number, b: number): boolean => new Date(a).getFullYear() === new Date(b).getFullYear();

// A data curta da linha: no ano de agora, dia, mês e hora ("20/10 14:33"); de outro ano, a data com o ano e sem a hora ("12/03/2024"),
// para caber na coluna.
export function whenLabel(at: number, now: number): string {
  return sameYear(at, now) ? `${shortDate(at)} ${timeOfDay(at)}` : fullDate(at);
}

// A data por extenso, para o nome da linha: "ter, 20 out, 14:33"; de outro ano, com o ano ("ter, 12 mar 2024, 14:33").
function spokenWhen(at: number, now: number): string {
  return `${dateLabel(at)}${sameYear(at, now) ? '' : ` ${new Date(at).getFullYear()}`}, ${timeOfDay(at)}`;
}

// A linha do solve na posição `i` do pool (a ordem de `at`).
export function rowAt(pool: readonly Solve[], i: number, series: Series, now: number): Row {
  const x = pool[i]!;
  const plus2 = x.penalty === '+2';
  const dnf = x.penalty === 'DNF';
  const a5 = series.ao5[i] ?? null;
  const a12 = series.ao12[i] ?? null;
  const pb = series.pb[i] ?? false;
  const number = i + 1;
  const label = T.historico.row({
    number: number.toLocaleString('pt-BR'),
    time: plus2 ? T.historico.plus2Spoken(formatMs(effectiveMs(x))) : formatSolve(x),
    ao5: a5 === null ? null : formatMs(a5),
    ao12: a12 === null ? null : formatMs(a12),
    when: spokenWhen(x.at, now),
    pb,
    note: x.note,
  });
  return {
    id: x.id,
    number,
    time: formatSolve(x),
    plus2,
    dnf,
    ao5: formatMs(a5),
    ao12: formatMs(a12),
    when: whenLabel(x.at, now),
    note: x.note,
    pb,
    scramble: truncate(x.scramble, 28),
    label,
  };
}

// O texto que o "Copiar" do detalhe leva: o tempo com a penalidade, o embaralhamento inteiro e a data com a hora ("0:15.24+ · U' F2 … · 19/10/2026 21:30").
export const copyTextOf = (x: Solve): string => T.historico.copyText(formatSolve(x), x.scramble, `${fullDate(x.at)} ${timeOfDay(x.at)}`);

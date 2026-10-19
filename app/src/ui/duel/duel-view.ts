// As contas da tela do desafio (a maquete aprovada, docs/design/2026-10-19-desafio-maquete.html): o placar em peças, o progresso de quem
// desafia, a revelação do ponto, o resultado, a partida ponto a ponto e a lista dos Desafios em Evolução. Puro: os componentes só desenham.
// Tudo do lado deste aparelho: "Você" é sempre quem vê, e o outro lado é o nome que ele mandou (ou "Oponente").
//
// Os nomes nos textos que aparecem vêm isolados (isolate): a tela troca cada um por um <bdi> (Bidi.svelte). Os rótulos para o leitor de
// tela (o placar por extenso, o nome do botão da lista, o anúncio da revelação) vêm sem as marcas.
import { DUEL_SCRAMBLES, type DuelScore, effectiveMs } from '../../core/duel/score';
import { eventInfo } from '../../core/events';
import { formatMs } from '../../core/stats';
import type { Duel, DuelSide, DuelTime } from '../../core/types';
import { T } from '../../strings';
import type { CentroResult } from '../centro';
import { daysAgoLabel, timeOfDay } from '../format';

// Uma peça do placar: levou o ponto (acesa), não levou (apagada), ninguém pontua (apagada com o traço), ainda não jogado (o contorno) e não
// jogado porque a partida acabou antes (o contorno tracejado). As do progresso de A: feita, a da vez e a que falta.
export type Piece = 'won' | 'lost' | 'tie' | 'open' | 'skip';
export type Step = 'done' | 'now' | 'open';

const other = (side: DuelSide): DuelSide => (side === 'a' ? 'b' : 'a');
// Centésimos, como a comparação do placar (core/duel/score.ts): 10,004 s e 10,009 s empatam.
const centis = (t: DuelTime): number => Math.floor(effectiveMs(t) / 10);

// O tempo do desafio como o Timer mostra um solve: DNF, ou o tempo com o +2 somado e o "+".
export function duelTime(t: DuelTime): string {
  if (t.penalty === 'DNF') return T.timer.dnf;
  return formatMs(effectiveMs(t)) + (t.penalty === '+2' ? T.timer.plus2Suffix : '');
}

// '0:15.51+' em duas partes, como o tempo grande (TimeDisplay.paintTime): os centésimos (e o "+") ficam menores. Sem ponto (DNF), inteiro.
export function splitTime(text: string): { int: string; dec: string } {
  const cut = text.indexOf('.');
  return cut < 0 ? { int: text, dec: '' } : { int: text.slice(0, cut), dec: text.slice(cut) };
}

// Um nome no texto da tela (a revisão final), entre as marcas de isolamento do Unicode (FSI e PDI), que um nome não pode ter (\p{Cf},
// link.ts): um nome da direita para a esquerda, ou com números colados, não reordena o texto em volta. Sem nome, nada: o texto de reserva
// ("Alguém", "Oponente") é do app.
const FSI = '\u2068';
const PDI = '\u2069';
export const isolate = (name: string): string => (name ? `${FSI}${name}${PDI}` : '');
// O texto sem as marcas: o que vai num rótulo para o leitor de tela (um atributo, um anúncio).
export const plain = (text: string): string => text.replace(/[\u2068\u2069]/g, '');

// O texto em trechos, para a tela desenhar cada nome num <bdi>: `name` diz se o trecho é um nome isolado.
export function bidiParts(text: string): { text: string; name: boolean }[] {
  return text
    .split(/(\u2068[^\u2069]*\u2069)/)
    .filter((piece) => piece !== '')
    .map((piece) => (piece.startsWith(FSI) ? { text: piece.slice(1, -1), name: true } : { text: piece, name: false }));
}

// O nome do outro lado na linha do placar, no selo e na tabela: o que ele escolheu mandar (isolado), ou "Oponente".
export const rowName = (name: string): string => isolate(name) || T.duel.opponent;

// O melhor dos primeiros `n` tempos (o +2 somado, sem os DNF); só DNF, "DNF".
export function bestOf(times: readonly DuelTime[], n: number = times.length): string {
  const best = Math.min(...times.slice(0, n).map(effectiveMs));
  return formatMs(best);
}

// O progresso de quem desafia: as feitas na tinta, a da vez com o contorno (só enquanto joga), as que faltam.
export function stepsOf(done: number, playing: boolean): Step[] {
  return Array.from({ length: DUEL_SCRAMBLES }, (_, i) => (i < done ? 'done' : i === done && playing ? 'now' : 'open'));
}

export interface Board {
  me: Piece[]; // a linha de cima, "Você"
  them: Piece[];
  mine: number; // os pontos
  theirs: number;
  now: number | null; // a coluna da vez (0 a 6), ou nenhuma
  label: string; // o placar por extenso, para o leitor de tela
}

// O placar do que já foi revelado. Uma coluna por embaralhamento: o ponto acende a peça de quem levou; ninguém, as duas apagadas com o
// traço; o que falta, só o contorno, tracejado quando a partida acabou antes. Quem é quem vem da linha e do nome, nunca só da cor.
export function boardOf(d: Duel, score: DuelScore, now: number | null): Board {
  const mySide = d.side;
  const me: Piece[] = [];
  const them: Piece[] = [];
  const cells: string[] = [];
  for (let i = 0; i < DUEL_SCRAMBLES; i++) {
    if (i < score.perPoint.length) {
      const point = score.perPoint[i];
      const piece: Piece = point === null ? 'tie' : point === mySide ? 'won' : 'lost';
      me.push(piece);
      them.push(piece === 'won' ? 'lost' : piece === 'lost' ? 'won' : 'tie');
      cells.push(point === null ? T.duel.cellNone : point === mySide ? T.duel.cellMine : T.duel.cellTheirs(d.theirName));
      continue;
    }
    const piece: Piece = score.over ? 'skip' : 'open';
    me.push(piece);
    them.push(piece);
    cells.push(score.over ? T.duel.cellSkip : T.duel.cellOpen);
  }
  const mine = score.points[mySide];
  const theirs = score.points[other(mySide)];
  return { me, them, mine, theirs, now, label: T.duel.board(plain(rowName(d.theirName)), mine, theirs, cells) };
}

export interface Reveal {
  verdict: string; // o selo: "Ponto seu", "Ponto de Ranielli", "Ninguém pontua · empate no centésimo"
  mine: boolean; // o selo na tinta (o ponto é seu); os outros, claros
  them: string; // o nome do outro lado
  time: string; // o tempo dele, como o Timer mostra
  sub: string; // "0:13.51 com +2 · você foi 0.63 s mais rápido" ('' sem o que dizer)
  aria: string; // o anúncio: "Ranielli: 0:15.51 com +2. Ponto seu. Você 2, Ranielli 1."
  centro: CentroResult; // ponto seu, 6 verdes; do oponente, 3 em âmbar; ninguém, o "="
}

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// A revelação do embaralhamento `i` (o de B, depois de "Ver o ponto"): o tempo do outro lado, o selo, a diferença e o anúncio.
export function revealOf(d: Duel, score: DuelScore, i: number): Reveal | null {
  const mine = d.mine[i];
  const theirs = d.theirs?.[i];
  if (!mine || !theirs || i >= score.perPoint.length) return null;
  const point = score.perPoint[i];
  const mySide = d.side;
  const verdict =
    point === null
      ? T.duel.pointNone(mine.penalty === 'DNF' && theirs.penalty === 'DNF')
      : point === mySide
        ? T.duel.pointMine
        : T.duel.pointTheirs(isolate(d.theirName));
  const parts: string[] = [];
  if (theirs.penalty === '+2') parts.push(T.duel.withPlus2(formatMs(theirs.ms)));
  if (point !== null && mine.penalty !== 'DNF' && theirs.penalty !== 'DNF') {
    const diff = (Math.abs(centis(mine) - centis(theirs)) / 100).toFixed(2);
    parts.push(point === mySide ? T.duel.youFaster(diff) : T.duel.theyFaster(isolate(d.theirName), diff));
  }
  const spoken = theirs.penalty === '+2' ? T.duel.withPlus2(formatMs(effectiveMs(theirs))) : duelTime(theirs);
  const name = rowName(d.theirName);
  return {
    verdict,
    mine: point === mySide,
    them: name,
    time: duelTime(theirs),
    sub: capitalized(parts.join(' · ')),
    aria: T.duel.revealAria(plain(name), spoken, plain(verdict), score.points[mySide], score.points[other(mySide)]),
    centro: point === null ? 'tie' : point === mySide ? 'good' : 'slow',
  };
}

export interface Outcome {
  title: string; // "Você venceu 3 × 1", "Bia venceu 3 × 1", "Empate em 2 × 2"
  closed: string; // "Bia fechou no embaralhamento 5." (8)
  centro: CentroResult | null; // venceu: a face resolvida (e o salto); perdeu: 3 em âmbar, calmo; empate: o "="; sem fim, o parado
  won: boolean;
  played: number; // os embaralhamentos jogados
}

// O resultado do lado deste aparelho. O empate em pontos decidido pelo melhor single diz isso; uma partida que não acabou (só para ver)
// mostra o placar.
export function outcomeOf(d: Duel, score: DuelScore): Outcome {
  const mySide = d.side;
  const mine = score.points[mySide];
  const theirs = score.points[other(mySide)];
  const played = score.perPoint.length;
  const bySingle = mine === theirs;
  const closed = (who: string): string => T.duel.closedBy(who, played);
  if (!score.over) return { title: T.duel.standing(rowName(d.theirName), mine, theirs), closed: '', centro: null, won: false, played };
  if (score.winner === mySide) return { title: T.duel.youWon(mine, theirs, bySingle), closed: closed(T.duel.me), centro: 'pb', won: true, played };
  if (score.winner === other(mySide)) {
    const them = isolate(d.theirName);
    return { title: T.duel.theyWon(them, theirs, mine, bySingle), closed: closed(them || T.duel.yourOpponent), centro: 'slow', won: false, played };
  }
  return { title: T.duel.draw(mine, theirs), closed: T.duel.closedAt(played), centro: 'tie', won: false, played };
}

export interface MatchRow {
  n: number;
  mine: string;
  theirs: string;
  point: string; // "seu", "ninguém" ou o nome do outro lado
  winner: 'me' | 'them' | null; // o tempo de quem levou fica em negrito
}

// A partida ponto a ponto: uma linha por embaralhamento jogado, e uma só para os que ficaram de fora ("6–7 · não jogados"); do lado de A,
// com os tempos dele que ninguém enfrentou.
export function matchOf(d: Duel, score: DuelScore): { rows: MatchRow[]; rest: { label: string; text: string } | null } {
  const mySide = d.side;
  const theirs = d.theirs ?? [];
  const played = score.perPoint.length;
  const rows: MatchRow[] = score.perPoint.map((point, i) => ({
    n: i + 1,
    mine: d.mine[i] ? duelTime(d.mine[i]!) : T.timer.none,
    theirs: theirs[i] ? duelTime(theirs[i]!) : T.timer.none,
    point: point === null ? T.duel.pointCellNone : point === mySide ? T.duel.pointCellMine : rowName(d.theirName),
    winner: point === null ? null : point === mySide ? 'me' : 'them',
  }));
  const left = DUEL_SCRAMBLES - played;
  if (left <= 0) return { rows, rest: null };
  const label = left === 1 ? String(DUEL_SCRAMBLES) : `${played + 1}–${DUEL_SCRAMBLES}`;
  const unplayed = mySide === 'a' ? d.mine.slice(played).map(duelTime) : [];
  const text = unplayed.length > 0 ? `${T.duel.notPlayed(left)} · ${T.duel.yoursUnplayed(unplayed)}` : T.duel.notPlayed(left);
  return { rows, rest: { label, text } };
}

// ----- Evolução › Desafios (a maquete aprovada, 9a a 9c): o cartão, a lista e a partida aberta, dos desafios guardados -----

// O mini placar: o placar em peças, sem a coluna da vez. Antes da resposta (A sem o outro lado), todas por jogar.
export function miniBoardOf(d: Duel, score: DuelScore | null): Board {
  if (score) return boardOf(d, score, null);
  const open: Piece[] = Array.from({ length: DUEL_SCRAMBLES }, () => 'open');
  return { me: open, them: open, mine: 0, theirs: 0, now: null, label: T.duel.board(rowName(d.theirName), 0, 0, open.map(() => T.duel.cellOpen)) };
}

// Quem está do outro lado, na lista: o nome que ele mandou. Sem nome: o desafio de A antes da resposta ("Seu desafio", antes de mandar;
// "Desafio mandado", esperando), ou "Seu oponente".
export function duelTitle(d: Duel): string {
  if (d.theirName) return isolate(d.theirName);
  if (d.side === 'a' && d.theirs === null) return d.status === 'playing' ? T.duel.ownTitle : T.duel.sentTitle;
  return T.duel.yourOpponent;
}

export type DuelTag = 'live' | 'wait' | 'done';

export interface DuelItem {
  title: string; // "Bia", "Desafio mandado"
  event: string; // "3×3"
  tag: DuelTag; // jogando, esperando resposta, terminado
  tagText: string;
  detail: string; // "Bia venceu 3 × 1 · hoje", "Você 1 × 1 · 3 de 7 · ontem", "ontem"
  label: string; // o nome do botão, para o leitor de tela: "Bia · 3×3, terminado, Bia venceu 3 × 1 · hoje" (o placar fica de descrição)
}

// Uma linha da lista (9b). A data é a da criação, a mesma da ordem da lista. Um desafio que joga diz o embaralhamento da vez: o seguinte ao
// último revelado (B) ou ao último feito (A); de B, também o placar até ali.
export function duelItemOf(d: Duel, score: DuelScore | null, now: number): DuelItem {
  const day = daysAgoLabel(d.createdAt, now);
  const parts: string[] = [];
  let tag: DuelTag;
  let tagText: string;
  if (d.status === 'done') {
    tag = 'done';
    tagText = T.duel.tagDone;
    if (score) parts.push(outcomeOf(d, score).title);
  } else if (d.status === 'waiting') {
    tag = 'wait';
    tagText = T.duel.tagWaiting;
  } else {
    tag = 'live';
    tagText = T.duel.tagPlaying;
    if (score) parts.push(T.duel.rowScore(score.points[d.side], score.points[other(d.side)]));
    const done = score ? score.perPoint.length : d.mine.length;
    parts.push(T.progress.of(Math.min(done + 1, DUEL_SCRAMBLES), DUEL_SCRAMBLES));
  }
  parts.push(day);
  const title = duelTitle(d);
  const event = eventInfo(d.event).short;
  const detail = parts.join(' · ');
  return { title, event, tag, tagText, detail, label: plain(`${title} · ${event}, ${tagText}, ${detail}`) };
}

// O texto do cartão (9a): "1 jogando · 1 esperando resposta · 3 terminados".
export function duelsSummary(duels: readonly Duel[]): string {
  const count = (status: Duel['status']): number => duels.filter((d) => d.status === status).length;
  return T.duel.summary(count('playing'), count('waiting'), count('done'));
}

// O rótulo da partida aberta (9c): "Você desafiou · 3×3 · hoje, 14:32" (ou "Ranielli te desafiou", do lado de quem recebeu).
export function matchLabelOf(d: Duel, now: number): string {
  const who = d.side === 'a' ? T.duel.youChallenged : T.duel.invited(isolate(d.theirName));
  return T.duel.matchLabel(who, eventInfo(d.event).short, `${daysAgoLabel(d.createdAt, now)}, ${timeOfDay(d.createdAt)}`);
}

// Partes "lentas" da tela do Timer (mudam a cada solve, não a cada quadro).
import { formatMs, averageOf, bestSingleSolve, effectiveMs, solveDeltas, monthHeat, currentStreak, solvesOnDay } from '../stats.js';
import { T } from '../strings.js';
import { daysAgoLabel, monthLabel, escapeHtml } from './format.js';

// '0:58.42' → 0:58 + <span class="dec">.42</span>. Textos sem ponto (inspeção, DNF) vão inteiros.
export function paintTime(el, text) {
  const cut = text.indexOf('.');
  el.innerHTML = cut < 0 ? escapeHtml(text) : `${escapeHtml(text.slice(0, cut))}<span class="dec">${escapeHtml(text.slice(cut))}</span>`;
}

// ctx: { root, state, session, last, history, number, kind, showResult, scramble, now }
export function renderTimer(ctx) {
  const { root, state, session, last, history, number, kind, showResult, scramble, now } = ctx;
  root.querySelector('[data-scramble]').textContent = scramble;
  root.querySelector('[data-pbtag]').hidden = !(showResult && kind === 'pb');

  const chips = root.querySelector('[data-chips]');
  if (last) {
    const d = solveDeltas(history, last);
    const parts = [];
    if (d.vsAo5 !== null) parts.push(`<span class="chip">${T.chips.vsAo5(d.vsAo5)}</span>`);
    if (d.isPb) parts.push(`<span class="chip pb">${T.chips.newPb(-d.vsPb)}</span>`);
    else if (d.vsPb !== null) parts.push(`<span class="chip">${T.chips.vsPb(d.vsPb)}</span>`);
    parts.push(`<span class="chip">${T.chips.solveN(number)}</span>`);
    chips.innerHTML = parts.join('');
  } else {
    chips.innerHTML = '';
  }

  const actions = root.querySelector('[data-actions]');
  actions.hidden = !(showResult && last);
  if (last) {
    actions.querySelector('[data-act="plus2"]').setAttribute('aria-pressed', String(last.penalty === '+2'));
    actions.querySelector('[data-act="dnf"]').setAttribute('aria-pressed', String(last.penalty === 'DNF'));
  }

  const best = bestSingleSolve(state.solves);
  const today = solvesOnDay(state.solves, now).length;
  root.querySelector('[data-tiles]').innerHTML = [
    ['Média de 5', formatMs(averageOf(session, 5)), ''],
    ['Média de 12', formatMs(averageOf(session, 12)), ''],
    ['Recorde', best ? formatMs(effectiveMs(best)) : '—', best ? daysAgoLabel(best.at, now) : ''],
    ['Hoje', String(today), `solves · meta ${state.settings.dailyGoal}`],
  ].map(([label, value, sub]) => `<div class="tile"><small>${label}</small><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</div>`).join('');

  const heat = monthHeat(state.solves, now);
  root.querySelector('[data-heatlabel]').textContent = `Constância · ${monthLabel(now)}`;
  const streak = currentStreak(state.solves, now);
  root.querySelector('[data-streak]').textContent = streak === 1 ? '1 dia seguido' : `${streak} dias seguidos`;
  const cells = heat.map((h) => {
    const text = `Dia ${h.day}: ${h.count} ${h.count === 1 ? 'solve' : 'solves'}${h.pb ? ' · recorde' : ''}${h.today ? ' · hoje' : ''}`;
    return `<i role="img" class="${h.pb ? 'pb' : h.level ? `l${h.level}` : ''}${h.today ? ' today' : ''}" title="${text}" aria-label="${text}"></i>`;
  });
  while (cells.length < 32) cells.push('<i style="visibility:hidden"></i>');
  const heatEl = root.querySelector('[data-heat]');
  heatEl.setAttribute('role', 'group');
  heatEl.setAttribute('aria-label', `Constância · ${monthLabel(now)}`);
  heatEl.innerHTML = cells.join('');
}

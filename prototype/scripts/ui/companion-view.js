// Tela do Centro: corpo com a jornada, acabamentos, marcos, trilha e modo silencioso.
import { renderCentro, paletteFor } from '../centro.js';
import { MILESTONE_INFO, TRAIL, FINISH_INFO, T } from '../strings.js';

const SWATCH = {
  fosco: (p) => p.body,
  brilho: (p) => `linear-gradient(135deg, #8a8a90, ${p.body} 60%)`,
  gelo: () => '#bfd9e6',
  carbono: () => 'repeating-linear-gradient(45deg, #222 0 3px, #151515 3px 6px)',
};

// ctx: { root, milestones, trail, finish, preview, silent, theme }
export function renderCompanion({ root, milestones, trail, finish, preview, silent, theme }) {
  const done = milestones.filter((m) => m.achieved).length;
  const trailDone = trail.filter(Boolean).length;
  const shown = preview || finish;
  const unlocked = (f) => f === 'fosco' || (f === 'brilho' && done === 9);
  const p = paletteFor(theme, 'fosco');
  const nextMilestone = milestones.findIndex((m) => !m.achieved);
  const nextStep = trail.findIndex((x) => !x);

  const finishes = Object.keys(FINISH_INFO).map((f) => {
    const locked = !unlocked(f);
    const sub = locked ? ` · ${FINISH_INFO[f].unlock}` : '';
    return `<button class="finish${locked ? ' locked' : ''}" data-finish="${f}" aria-pressed="${f === shown}"><i style="background:${SWATCH[f](p)}"></i>${FINISH_INFO[f].label}${sub}</button>`;
  }).join('');

  const mlist = milestones.map((m, i) => {
    const cls = m.achieved ? 'done' : i === nextMilestone ? 'next' : '';
    const right = m.achieved ? '<em>✓</em>' : m.progress ? `<em>${m.progress}</em>` : '';
    return `<li class="${cls}"><i></i>${MILESTONE_INFO[m.id].label}${right}</li>`;
  }).join('');

  const tlist = TRAIL.map((name, i) => {
    const cls = trail[i] ? 'done' : i === nextStep ? 'next' : '';
    return `<li class="${cls}"><i></i>${name}<button class="link" data-trail="${i}" aria-label="${name}: ${trail[i] ? 'desfazer' : 'já sei'}">${trail[i] ? 'desfazer' : 'já sei'}</button></li>`;
  }).join('');

  root.innerHTML = `
    <div class="comp">
      <div class="stage">
        <div class="big">${renderCentro({ theme, eyes: 'open', topLit: done, sideLit: trailDone, finish: shown, label: `Centro: ${done} de 9 marcos, ${trailDone} de 9 etapas` })}</div>
        <h2>Centro</h2>
        <p>${T.season(done, (FINISH_INFO[finish] || FINISH_INFO.fosco).label)}${preview ? ` · prévia: ${FINISH_INFO[preview].label}` : ''}</p>
        <div class="finishes" role="group" aria-label="Acabamentos">${finishes}</div>
      </div>
      <div class="comp-cols">
        <div class="card"><div class="label">Face de cima · marcos</div><ul class="mlist">${mlist}</ul></div>
        <div class="card"><div class="label">Face lateral · trilha</div><ul class="mlist trail">${tlist}</ul></div>
        <div class="card silent-row">
          <input type="checkbox" class="switch" id="silent" data-silent ${silent ? 'checked' : ''} />
          <label for="silent"><span class="label">Coach</span><span class="silent-hint">Modo silencioso — o Centro continua reagindo, mas sem texto.</span></label>
        </div>
      </div>
    </div>`;
}

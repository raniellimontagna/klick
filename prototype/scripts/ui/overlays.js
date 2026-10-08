// Aviso com desfazer, anúncios para leitor de tela e os diálogos (atalhos, sessões, primeira vez).
import { renderCentro, ringFor, eyesFor, updateCentro } from '../centro.js';
import { escapeHtml } from './format.js';

const $ = (s) => document.querySelector(s);
let toastTimer = 0;

export function showToast(text, { action, onAction, ms = 6000 } = {}) {
  const el = $('[data-toast]');
  const btn = el.querySelector('[data-toast-action]');
  el.querySelector('[data-toast-text]').textContent = text;
  btn.hidden = !action;
  btn.textContent = action || '';
  btn.onclick = action
    ? () => {
        hideToast();
        onAction();
      }
    : null;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}

export function hideToast() {
  clearTimeout(toastTimer);
  const el = $('[data-toast]');
  if (el) el.hidden = true;
}

export function announce(text) {
  const el = $('[data-live]');
  el.textContent = '';
  setTimeout(() => {
    el.textContent = text;
  }, 50);
}

function bindClose(d) {
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
}

const SHORTCUTS = [
  ['espaço', 'Armar (segure) e largar (solte)'],
  ['qualquer tecla', 'Parar'],
  ['P', '+2 no último solve'],
  ['D', 'DNF no último solve'],
  ['M', 'Nota'],
  ['⌫', 'Excluir o último'],
  ['Z', 'Desfazer a exclusão'],
  ['N', 'Novo embaralhamento'],
  ['?', 'Mostrar atalhos'],
  ['1–4', 'Trocar de aba'],
];

export function openShortcuts() {
  const d = $('[data-dialog="shortcuts"]');
  d.innerHTML = `<h2>Atalhos</h2><table><tbody>${SHORTCUTS.map(([k, v]) => `<tr><td><span class="key">${k}</span></td><td>${v}</td></tr>`).join('')}</tbody></table>
    <div class="row"><button type="button" class="btn" data-close>Fechar</button></div>`;
  if (!d.dataset.bound) {
    bindClose(d);
    d.dataset.bound = '1';
  }
  d.showModal();
}

// ctx: { sessions, current, counts, onPick(id), onCreate(name), onRename(name) }
export function openSessions({ sessions, current, counts, onPick, onCreate, onRename }) {
  const d = $('[data-dialog="sessions"]');
  const name = (sessions.find((s) => s.id === current) || {}).name || '';
  d.innerHTML = `<h2>Sessões</h2>
    ${sessions.map((s) => `<button type="button" class="list-btn" data-pick="${escapeHtml(s.id)}" aria-current="${s.id === current}"><span>${escapeHtml(s.name)}</span><span class="muted num">${counts[s.id] || 0} solves</span></button>`).join('')}
    <div class="row"><input type="text" data-newname placeholder="Nome da nova sessão" aria-label="Nome da nova sessão" /><button type="button" class="btn primary" data-create>Criar</button></div>
    <div class="row"><input type="text" data-rename value="${escapeHtml(name)}" aria-label="Renomear a sessão atual" /><button type="button" class="btn" data-dorename>Renomear</button></div>
    <div class="row"><button type="button" class="btn" data-close>Fechar</button></div>`;
  d.onclick = (e) => {
    if (e.target === d || e.target.closest('[data-close]')) return d.close();
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      d.close();
      onPick(pick.dataset.pick);
    } else if (e.target.closest('[data-create]')) {
      const value = d.querySelector('[data-newname]').value;
      d.close();
      onCreate(value);
    } else if (e.target.closest('[data-dorename]')) {
      const value = d.querySelector('[data-rename]').value;
      d.close();
      onRename(value);
    }
  };
  d.showModal();
}

// mode: 'first' (escolhe dados de exemplo ou começar do zero) | 'review' (só fechar).
export function openOnboarding({ theme, holdMs, mode, onExample, onFresh }) {
  const d = $('[data-dialog="onboarding"]');
  let step = 1;
  let chosen = false;
  let pressAt = 0;
  let ready = false;
  let practiced = false;
  let raf = 0;

  const steps = {
    1: {
      title: 'Esse é o Centro',
      text: 'Ele acompanha seus solves e guarda a sua jornada no próprio corpo: os marcos na face de cima, a trilha na face do lado.',
      centro: { ring: [null, null, 'idle', null, null, null, null, null], eyes: 'open' },
    },
    2: {
      title: 'Segure até ficar verde',
      text: 'Segure espaço (ou o botão abaixo). O anel enche de vermelho; quando ficar verde, solte.',
      centro: { ring: Array(8).fill(null), eyes: 'open' },
    },
    3: {
      title: 'Seu primeiro marco',
      text: 'Pare com qualquer tecla. O primeiro solve já acende um adesivo dourado em cima do Centro.',
      centro: { ring: ['U', 'R', 'F', 'D', 'L', 'B', 'R', 'F'], eyes: 'happy', topLit: 1 },
    },
  };

  function render() {
    const s = steps[step];
    const actions =
      step === 1
        ? '<button type="button" class="btn primary" data-next>Continuar</button>'
        : step === 2
          ? `<button type="button" class="btn" data-back>Voltar</button><button type="button" class="btn primary" data-next ${practiced ? '' : 'disabled'}>Continuar</button>`
          : mode === 'first'
            ? '<button type="button" class="btn" data-fresh>Começar do zero</button><button type="button" class="btn primary" data-example>Explorar com dados de exemplo</button>'
            : '<button type="button" class="btn primary" data-close>Fechar</button>';
    d.innerHTML = `<div class="label">${step} de 3</div>
      <div class="centro-box" data-onb-centro>${renderCentro({ theme, ring: s.centro.ring, eyes: s.centro.eyes, topLit: s.centro.topLit || 0 })}</div>
      <h2>${s.title}</h2><p>${s.text}</p>
      ${step === 2 ? `<button type="button" class="hold${practiced ? ' ready' : ''}" data-hold>${practiced ? 'É assim que larga.' : 'Segure aqui'}</button>` : ''}
      <div class="actions">${actions}</div>`;
  }

  function paint(st, progress) {
    updateCentro(d.querySelector('[data-onb-centro] svg'), { theme, ring: ringFor({ state: st, armProgress: progress }), eyes: eyesFor({ state: st }) });
    const hold = d.querySelector('[data-hold]');
    if (hold) hold.className = `hold ${st === 'reaction' ? 'ready' : st}`;
  }

  function frame() {
    const progress = holdMs <= 0 ? 1 : Math.min(1, (performance.now() - pressAt) / holdMs);
    if (progress >= 1) {
      ready = true;
      paint('ready', 1);
      d.querySelector('[data-hold]').textContent = 'Agora solte';
      return;
    }
    paint('arming', progress);
    raf = requestAnimationFrame(frame);
  }

  function down() {
    if (step !== 2 || pressAt) return;
    pressAt = performance.now();
    ready = false;
    raf = requestAnimationFrame(frame);
  }

  function up() {
    if (step !== 2 || !pressAt) return;
    cancelAnimationFrame(raf);
    pressAt = 0;
    if (ready) {
      practiced = true;
      render();
      updateCentro(d.querySelector('[data-onb-centro] svg'), { theme, ring: ringFor({ state: 'reaction', result: 'good' }), eyes: 'open' });
    } else {
      paint('idle', 0);
      d.querySelector('[data-hold]').textContent = 'Segure aqui';
    }
  }

  d.onclick = (e) => {
    if (e.target.closest('[data-next]')) {
      step += 1;
      render();
    } else if (e.target.closest('[data-back]')) {
      step -= 1;
      render();
    } else if (e.target.closest('[data-example]')) {
      chosen = true;
      d.close();
      onExample();
    } else if (e.target.closest('[data-fresh]')) {
      chosen = true;
      d.close();
      onFresh();
    } else if (e.target.closest('[data-close]')) {
      d.close();
    }
  };
  d.onpointerdown = (e) => {
    if (e.target.closest('[data-hold]')) {
      e.preventDefault();
      down();
    }
  };
  d.onpointerup = () => up();
  d.onkeydown = (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (!e.repeat) down();
  };
  d.onkeyup = (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    up();
  };
  d.onclose = () => {
    cancelAnimationFrame(raf);
    if (mode === 'first' && !chosen) onExample();
  };
  render();
  d.showModal();
}

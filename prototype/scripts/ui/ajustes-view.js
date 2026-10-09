// Tela Ajustes. Os controles só emitem data-attributes; o app.js aplica as mudanças.
const seg = (key, current, options, label) =>
  `<div class="seg" role="group" aria-label="${label}">${options.map(([v, l]) => `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${String(v) === String(current)}">${l}</button>`).join('')}</div>`;

const toggle = (key, checked, label, hint = '') =>
  `<label class="setting"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" class="switch" data-toggle="${key}" ${checked ? 'checked' : ''} /></label>`;

const row = (label, hint, control) => `<div class="setting"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>${control}</div>`;

// confirm: id do botão de dados que está pedindo confirmação (segundo clique), ou null.
export function renderAjustes({ root, settings, confirm }) {
  const danger = (id, label, confirmLabel) =>
    `<button type="button" class="btn${confirm === id ? ' danger' : ''}" data-data="${id}">${confirm === id ? confirmLabel : label}</button>`;
  root.innerHTML = `
    <div class="page-h"><h1>Ajustes</h1></div>
    <div class="settings">
      <fieldset>
        <legend>Timer</legend>
        ${toggle('inspection', settings.inspection, 'Inspeção de 15 s', 'Avisos aos 8 e 12 s; +2 depois de 15 s; DNF depois de 17 s.')}
        ${row('Tempo para armar', 'Quanto tempo segurar até ficar verde.', seg('holdMs', settings.holdMs, [[0, '0'], [300, '0,3 s'], [550, '0,55 s'], [1000, '1 s']], 'Tempo para armar'))}
        ${row('Armar no celular', 'Dois polegares evita disparo sem querer.', seg('mobileArm', settings.mobileArm, [['two', 'Dois polegares'], ['one', 'Um toque']], 'Armar no celular'))}
      </fieldset>
      <fieldset>
        <legend>Aparência e som</legend>
        ${row('Tema', '', seg('theme', settings.theme, [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Noite']], 'Tema'))}
        ${toggle('sound.klick', settings.sound.klick, 'Som "klick"', 'Ao ficar pronto e ao parar.')}
        ${toggle('sound.insp', settings.sound.insp, 'Tique da inspeção', 'Aos 8 e 12 s.')}
        ${toggle('sound.pb', settings.sound.pb, 'Acorde do recorde')}
      </fieldset>
      <fieldset>
        <legend>Coach e acessibilidade</legend>
        ${toggle('silent', settings.silent, 'Modo silencioso', 'O Centro reage, mas o coach não escreve.')}
        ${row('Reduzir movimento', '', seg('reducedMotion', settings.reducedMotion, [['system', 'Seguir o sistema'], ['always', 'Sempre']], 'Reduzir movimento'))}
        ${row('Idioma', 'Inglês fica para depois.', '<span class="muted">Português (Brasil)</span>')}
      </fieldset>
      <fieldset>
        <legend>Dados</legend>
        ${row('Exportar', 'Seus solves no formato do csTimer.', '<button type="button" class="btn" data-data="export">Exportar</button>')}
        ${row('Rever a apresentação', '', '<button type="button" class="btn" data-data="onboarding">Abrir</button>')}
        ${row('Dados de exemplo', 'Troca tudo pelos 212 solves fictícios.', danger('seed', 'Restaurar', 'Tem certeza? Clique de novo'))}
        ${row('Começar do zero', 'Apaga todos os solves deste navegador.', danger('wipe', 'Apagar tudo', 'Tem certeza? Clique de novo'))}
      </fieldset>
    </div>`;
}

import { expect, test, type Page } from '@playwright/test';
import { T } from '../../src/strings';
import { fresh, noInspection, setTimerSetting } from './helpers';

// O timer completo de ponta a ponta (a maquete aprovada de 20/10): digitar, as fases por toque e o tempo "Escondido", ligados pelas linhas
// de verdade do Ajustes. Os toques de fase precisam de mais de 300 ms entre si (PHASE_MIN_GAP_MS): aqui a espera é real, de uns 350 ms, como
// nos outros specs que correm o cronômetro de verdade.

const GAP = 350;
const [, TYPING] = T.ajustes.entryOptions[1];
const FOUR = T.ajustes.phasesOptions[3][1];
const HIDDEN = T.ajustes.liveTimeOptions[2][1];

// Larga o cronômetro: segura o espaço o bastante para armar e solta.
async function start(page: Page): Promise<void> {
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('Space');
}

test('digita 12.34+ e o solve entra com +2, e o próximo embaralhamento aparece', async ({ page }) => {
  await fresh(page);
  await setTimerSetting(page, T.ajustes.entry, TYPING);
  const scramble = page.locator('[data-scramble]');
  const before = await scramble.textContent();
  const field = page.getByLabel(T.timer.typedLabel);
  await field.fill('12.34+');
  await expect(page.locator('.tc-msg')).toContainText('mais 2 s de penalidade');
  await field.press('Enter');
  await expect(page.locator('.tc-last')).toContainText('0:14.34');
  await expect(page.locator('[data-act="plus2"]')).toHaveAttribute('aria-pressed', 'true');
  // O próximo embaralhamento: o texto troca (depois de "gerando", se for o caso) e o campo está pronto de novo.
  await expect(scramble).not.toHaveText(before ?? '');
  await expect(scramble).not.toHaveText(T.timer.generating, { timeout: 20_000 });
  await expect(field).toHaveValue('');
  // O solve foi para o banco com o +2: a Evolução o mostra.
  await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
  await expect(page.locator('.hx-row')).toHaveCount(1);
  await expect(page.locator('.hx-row').first()).toContainText('0:14.34');
});

test('com 4 fases, quatro espaços marcam e o resultado mostra cruz, F2L, OLL e PLL', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado só no desktop');
  await fresh(page);
  await noInspection(page);
  await setTimerSetting(page, T.ajustes.phases, FOUR);
  await start(page);
  const marks = page.locator('.tc-marks i');
  await expect(marks).toHaveCount(4);
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(GAP); // mais que PHASE_MIN_GAP_MS: o toque conta
    await page.keyboard.press('Space');
    await expect(marks.nth(i)).toHaveAttribute('data-p', 'done');
  }
  await page.waitForTimeout(GAP);
  await page.keyboard.press('Space'); // o quarto toque para o cronômetro
  await expect(page.locator('[data-actions]')).toBeVisible();
  const bar = page.getByRole('list', { name: T.fases.bar });
  await expect(bar.getByRole('listitem')).toHaveCount(4);
  for (const [i, name] of T.fases.cfop.entries()) await expect(bar.getByRole('listitem').nth(i)).toContainText(name);
  // O detalhe do solve traz as mesmas quatro fases.
  await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
  await page.locator('.hx-row').first().click();
  const sheet = page.getByRole('dialog', { name: /^Solve #/ });
  await expect(sheet.getByRole('list', { name: T.fases.bar }).getByRole('listitem')).toHaveCount(4);
});

test('com Escondido, o tempo não aparece correndo e aparece inteiro no fim', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado só no desktop');
  await fresh(page);
  await noInspection(page);
  await setTimerSetting(page, T.ajustes.liveTime, HIDDEN);
  await start(page);
  const time = page.locator('[data-time]');
  await expect(time).toHaveText(T.timer.solving);
  await page.waitForTimeout(1_200);
  await expect(time).toHaveText(T.timer.solving);
  await expect(time).not.toContainText(/\d/);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-actions]')).toBeVisible();
  await expect(time).toHaveText(/^\d:\d\d\.\d\d$/);
  // O tempo que aparece é o que correu: passou de 1,2 s (a espera de cima), não um zero.
  const [m, sec, cs] = (await time.textContent())!.split(/[:.]/).map(Number);
  expect(m! * 60_000 + sec! * 1000 + cs! * 10).toBeGreaterThanOrEqual(1_200);
});

// I2 da revisão final: com o campo solto, digitar no computador põe os números no campo (não troca de aba) e o Enter grava.
test('no computador, com o campo solto, 1 2 3 4 e Enter gravam 0:12.34 e ficam no Timer', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado só no desktop');
  await fresh(page);
  await setTimerSetting(page, T.ajustes.entry, TYPING);
  const field = page.getByLabel(T.timer.typedLabel);
  await field.press('Escape'); // solto: nada em foco
  await expect(field).not.toBeFocused();
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  for (const k of ['1', '2', '3', '4']) await page.keyboard.press(k);
  await expect(field).toHaveValue('1234');
  await expect(page.getByRole('button', { name: T.timer.typedSave })).toBeVisible(); // continua no Timer
  await page.keyboard.press('Enter');
  await expect(page.locator('.tc-last')).toContainText('0:12.34');
  await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
  await expect(page.locator('.hx-row')).toHaveCount(1);
  await expect(page.locator('.hx-row').first()).toContainText('0:12.34');
});

test('o desafio continua com o cronômetro com os ajustes novos ligados', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado só no desktop');
  await fresh(page);
  await noInspection(page);
  await setTimerSetting(page, T.ajustes.entry, TYPING);
  await setTimerSetting(page, T.ajustes.phases, FOUR);
  await setTimerSetting(page, T.ajustes.liveTime, HIDDEN);
  await page.getByRole('button', { name: T.duel.challenge, exact: true }).click();
  await page.getByRole('dialog', { name: T.duel.sheetTitle }).getByRole('button', { name: T.duel.start }).click();
  const timer = page.locator('[data-screen="timer"]');
  await expect(timer).toHaveAttribute('data-duel', 'solving', { timeout: 30_000 });
  // Cronometrado: o tempo grande, sem campo de digitar.
  await expect(page.locator('[data-time]')).toBeVisible();
  await expect(page.getByLabel(T.timer.typedLabel)).toHaveCount(0);
  await start(page);
  // Sem fases e sem "Escondido": o tempo corre inteiro, sem marcas, e o primeiro espaço para.
  await page.waitForTimeout(GAP);
  await expect(page.locator('[data-time]')).toContainText(/^\d:\d\d\.\d\d$/);
  await expect(page.locator('.tc-marks')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(timer.locator('[data-chips] .chip')).toHaveCount(1);
  await expect(page.getByRole('list', { name: T.fases.bar })).toHaveCount(0);
  await expect(page.getByLabel(T.timer.typedLabel)).toHaveCount(0);
});

test('no celular (390 px), o campo de digitar e o resultado com fases cabem sem rolar de lado', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'só no celular');
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  const overflow = (): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // O campo de digitar, vazio e com o tempo já salvo (o último solve embaixo).
  await setTimerSetting(page, T.ajustes.entry, TYPING);
  const field = page.getByLabel(T.timer.typedLabel);
  await expect(field).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await field.fill('1:02.34+');
  await page.getByRole('button', { name: T.timer.typedSave, exact: true }).click();
  await expect(page.locator('.tc-last')).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  // O resultado com quatro fases: um solve de verdade, marcado pelos toques nas zonas.
  await setTimerSetting(page, T.ajustes.entry, T.ajustes.entryOptions[0][1]);
  await noInspection(page);
  await setTimerSetting(page, T.ajustes.phases, FOUR);
  const zones = page.locator('[data-zone]');
  const touch = (name: 'pointerdown' | 'pointerup', id: number) => zones.nth(0).dispatchEvent(name, { pointerId: id, pointerType: 'touch', isPrimary: true });
  await touch('pointerdown', 21);
  await zones.nth(1).dispatchEvent('pointerdown', { pointerId: 22, pointerType: 'touch', isPrimary: false });
  await page.waitForTimeout(400);
  await touch('pointerup', 21);
  await expect(page.locator('body')).toHaveClass(/solving/);
  await zones.nth(1).dispatchEvent('pointerup', { pointerId: 22, pointerType: 'touch', isPrimary: false });
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(GAP);
    await touch('pointerdown', 30 + i);
    await touch('pointerup', 30 + i);
  }
  await expect(page.locator('[data-actions]')).toBeVisible();
  await expect(page.getByRole('list', { name: T.fases.bar }).getByRole('listitem')).toHaveCount(4);
  expect(await overflow()).toBeLessThanOrEqual(0);
});

// O que está embaixo do tempo (aqui se mede o topo dos chips; as ações e as zonas de toque vão junto) não pula quando a barra das fases do solve anterior dá lugar às marcas,
// na largada, nem quando a barra volta, no fim (a linha das marcas tem a altura da barra). Vale no celular e no desktop.
test('a barra das fases e as marcas ocupam a mesma altura: os chips de baixo ficam no mesmo lugar na largada e no fim', async ({ page }) => {
  await fresh(page);
  await noInspection(page);
  await setTimerSetting(page, T.ajustes.phases, FOUR);
  const chipsTop = (): Promise<number> => page.locator('[data-chips]').evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const solve = async (): Promise<number> => {
    await start(page);
    await expect(page.locator('.tc-marks i')).toHaveCount(4);
    const running = await chipsTop();
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(GAP);
      await page.keyboard.press('Space');
    }
    await expect(page.getByRole('list', { name: T.fases.bar })).toBeVisible();
    return running;
  };
  await solve();
  await page.waitForTimeout(900); // o resultado assenta (o esmaecido do solve volta)
  const result = await chipsTop();
  expect(await solve()).toBe(result); // largada: as marcas no lugar da barra
  await page.waitForTimeout(900);
  expect(await chipsTop()).toBe(result); // fim: a barra de volta
});

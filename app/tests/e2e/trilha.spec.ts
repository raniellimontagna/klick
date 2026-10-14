import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { fresh } from './helpers';

// Axe nas telas da Trilha: só as violações sérias e críticas reprovam (como em a11y.spec.ts).
async function axe(page: Page, where: string): Promise<void> {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${where}: ${v.id}`)).toEqual([]);
}

// Parar o timer devolve a tela do foco no solve (opacity 0.08) em 200 ms de transição. O axe lê a cor misturada no meio da volta
// (o texto cinza fica abaixo de 4,5:1 por instantes), então espera a tela voltar inteira antes de analisar.
async function settled(page: Page): Promise<void> {
  await expect(page.locator('body')).not.toHaveClass(/solving/);
  for (const faded of ['.topbar', '.round-top', '.case']) await expect(page.locator(faded).first()).toHaveCSS('opacity', '1');
}

async function openTrilha(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Trilha', exact: true }).first().click();
  await expect(page.locator('[data-screen="trilha"]')).toBeVisible();
}

// Uma execução pelo teclado: segura o espaço além do tempo de armar, solta (corre) e para com outra tecla.
async function run(page: Page): Promise<void> {
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('a');
}

test('quem chega novo: o tour, "Ainda não", a aula 1 até o fim e a face lateral acesa', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pular apresentação' }).click();
  await page.getByRole('button', { name: 'Ainda não' }).click();
  const lesson = page.locator('[data-lesson="0"]');
  await expect(lesson.getByRole('heading', { name: 'Segure assim' })).toBeVisible();
  for (let i = 0; i < 7; i++) await lesson.getByRole('button', { name: 'Próximo', exact: true }).click();
  await expect(lesson.getByRole('heading', { name: 'Sua vez' })).toBeVisible();
  await lesson.getByRole('button', { name: 'Consegui no meu cubo' }).click();
  await expect(lesson.getByRole('button', { name: 'Próxima etapa' })).toBeVisible();
  await page.getByRole('button', { name: 'Centro', exact: true }).first().click();
  const centro = page.locator('[data-screen="companion"]');
  await expect(centro.locator('svg.centro g.side rect.lit')).toHaveCount(1);
  await expect(centro.getByRole('button', { name: 'Trilha: 1 de 9 · próxima: Cantos brancos' })).toBeVisible();
});

test('uma rodada de treino pelo teclado: mede, Enter marca acerto, e nada entra nos solves', async ({ page }) => {
  await fresh(page);
  await openTrilha(page);
  await page.locator('[data-train-set="oll2"]').click();
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  await expect(page.locator('[data-train-scramble]')).not.toBeEmpty();
  await run(page);
  await expect(page.getByRole('button', { name: 'Acertei' })).toBeVisible();
  await page.keyboard.press('Enter');
  const last = page.locator('[data-last-attempt]');
  await expect(last).toContainText('Linha');
  await expect(last).toContainText('acerto');
  await page.getByRole('button', { name: 'Encerrar' }).click();
  await expect(page.locator('[data-case="oll2-linha"]')).toContainText('1 tentativa');
  await page.getByRole('button', { name: 'Centro', exact: true }).first().click();
  await expect(page.locator('[data-screen="companion"]').getByText(/Temporada 1 · 0 de 9 marcos/)).toBeVisible();
});

test('depois da primeira visita, a aula e o treino abrem sem rede', async ({ page, context }) => {
  await fresh(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await openTrilha(page);
  await page.getByRole('button', { name: 'Começar a aula' }).click();
  await expect(page.getByRole('heading', { name: 'Segure assim' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar à trilha' }).first().click();
  await page.locator('[data-train-set="pll2"]').click();
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  await expect(page.locator('[data-train-scramble]')).not.toBeEmpty();
});

// Nada da Trilha passa da largura da tela: o começo, uma aula e a rodada de cada conjunto. Na tela estreita (a barra de abas embaixo),
// a rodada também tem as duas zonas de polegar inteiras na largura e o tempo acima da barra de abas, sem rolar.
async function fitsWidth(page: Page, where: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${where}: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth);
}

async function roundFits(page: Page, set: string): Promise<void> {
  await fitsWidth(page, `rodada ${set}`);
  const tabbar = page.locator('nav.tabbar');
  if (!(await tabbar.isVisible())) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  for (const side of ['left', 'right']) {
    const box = (await page.locator(`[data-round] [data-zone="${side}"]`).boundingBox())!;
    expect(box.x, `rodada ${set}: zona ${side}`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `rodada ${set}: zona ${side}`).toBeLessThanOrEqual(width);
  }
  const time = (await page.locator('[data-round] [data-time]').boundingBox())!;
  const bar = (await tabbar.boundingBox())!;
  expect(time.y + time.height, `rodada ${set}: o tempo acima da barra de abas`).toBeLessThanOrEqual(bar.y);
}

async function layout(page: Page): Promise<void> {
  await fresh(page);
  await openTrilha(page);
  await fitsWidth(page, 'começo');
  await page.getByRole('button', { name: 'Começar a aula' }).click();
  await expect(page.getByRole('heading', { name: 'Segure assim' })).toBeVisible();
  await fitsWidth(page, 'aula');
  await page.getByRole('button', { name: 'Voltar à trilha' }).first().click();
  for (const set of ['oll2', 'pll2', 'f2l']) {
    await page.locator(`[data-train-set="${set}"]`).click();
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    await expect(page.locator('[data-train-scramble]')).not.toBeEmpty();
    await roundFits(page, set);
    await page.getByRole('button', { name: 'Encerrar' }).click();
    await page.getByRole('button', { name: 'Voltar à trilha' }).first().click();
  }
}

test('a Trilha cabe na largura da tela: começo, aula e a rodada de cada conjunto', async ({ page }) => {
  await layout(page);
});

test.describe('num iPhone 13 (390 × 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('a Trilha cabe na largura da tela: começo, aula e a rodada de cada conjunto', async ({ page }) => {
    await layout(page);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`Trilha sem violações sérias de acessibilidade no tema ${scheme}: começo, aula, conjunto e rodada`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await openTrilha(page);
    await axe(page, 'começo');
    await page.getByRole('button', { name: 'Marcar etapas' }).click();
    await axe(page, 'marcar etapas');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('button', { name: 'Começar a aula' }).click();
    await page.getByRole('button', { name: 'Próximo', exact: true }).click(); // um passo com algoritmo e controles
    await expect(page.getByRole('group', { name: 'Controles do cubo' })).toBeVisible();
    // O cubo toca sozinho uma vez; "Recomeçar" o pausa no começo, com o primeiro movimento como o atual (o destaque da aula).
    await page.getByRole('button', { name: 'Recomeçar' }).click();
    await expect(page.locator('[data-alg] .now')).toHaveCount(1);
    await axe(page, 'aula');
    await page.getByRole('button', { name: 'Voltar à trilha' }).first().click();
    await page.locator('[data-train-set="oll2"]').click();
    await page.getByRole('button', { name: 'Linha', exact: true }).click();
    await axe(page, 'conjunto');
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    await expect(page.locator('[data-train-scramble]')).not.toBeEmpty();
    await axe(page, 'rodada');
    // Com o timer parado: as marcas na tela. Depois de marcar, a última tentativa; e o conjunto com a tentativa gravada.
    await run(page);
    await expect(page.locator('[data-marks]').getByRole('button', { name: 'Acertei' })).toBeVisible();
    await settled(page);
    await axe(page, 'rodada com as marcas');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-last-attempt]')).toContainText('acerto');
    await settled(page);
    await axe(page, 'rodada com a última tentativa');
    await page.getByRole('button', { name: 'Encerrar' }).click();
    await expect(page.locator('[data-case="oll2-linha"]')).toContainText('1 tentativa');
    await axe(page, 'conjunto com tentativa');
  });
}

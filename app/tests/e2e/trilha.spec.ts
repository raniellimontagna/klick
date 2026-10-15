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

// Fechar o tour grava que a primeira vez passou (profile.onboarded) logo depois do clique. Recarregar antes de a gravação terminar abre o
// tour de novo, por cima da casca: os testes que recarregam esperam o perfil gravado.
async function onboardedSaved(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open('klick');
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('profile').objectStore('profile').get('current');
          get.onsuccess = () => {
            resolve(get.result?.onboarded === true);
            db.close();
          };
          get.onerror = () => {
            resolve(false);
            db.close();
          };
        };
      }),
  );
}

test('depois da primeira visita, a aula e o treino abrem sem rede', async ({ page, context }) => {
  await fresh(page);
  await onboardedSaved(page);
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

// Nada da Trilha passa da largura da tela: o começo, uma aula e a rodada de cada conjunto. Na tela estreita, com a página no topo, a
// rodada também tem o tempo acima da barra de abas e as duas zonas de polegar inteiras na largura e acima da barra (que é fixa: um
// polegar na parte escondida cairia numa aba). Com "Ver o algoritmo" aberto, basta 3/4 de cada zona à vista, com o rótulo dela.
async function fitsWidth(page: Page, where: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${where}: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth);
}

async function roundFits(page: Page, where: string, minVisible = 1): Promise<void> {
  await fitsWidth(page, `rodada ${where}`);
  const tabbar = page.locator('nav.tabbar');
  if (!(await tabbar.isVisible())) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  const m = await page.evaluate(() => {
    const bar = document.querySelector('nav.tabbar')!.getBoundingClientRect().top;
    const time = document.querySelector('[data-round] [data-time]')!.getBoundingClientRect();
    const zones = [...document.querySelectorAll<HTMLElement>('[data-round] [data-zone]')].map((zone) => {
      const box = zone.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(zone);
      return { side: zone.dataset.zone, left: box.left, right: box.right, top: box.top, bottom: box.bottom, label: text.getBoundingClientRect().bottom };
    });
    return { bar, width: document.documentElement.clientWidth, time: time.bottom, zones };
  });
  expect(m.time, `rodada ${where}: o tempo acima da barra de abas`).toBeLessThanOrEqual(m.bar);
  expect(m.zones).toHaveLength(2);
  for (const z of m.zones) {
    const what = `rodada ${where}: zona ${z.side}`;
    expect(z.left, what).toBeGreaterThanOrEqual(0);
    expect(z.right, what).toBeLessThanOrEqual(m.width);
    const visible = (Math.min(z.bottom, m.bar) - z.top) / (z.bottom - z.top);
    expect(visible, `${what}: parte à vista acima da barra de abas`).toBeGreaterThanOrEqual(minVisible);
    expect(z.label, `${what}: o rótulo acima da barra de abas`).toBeLessThanOrEqual(m.bar);
  }
}

// No celular, a última tentativa é uma linha entre o tempo e as zonas, com os botões de corrigir à vista acima da barra de abas (sem rolar).
// O visual dos botões é baixo, mas a área de toque tem 44 px de altura: o ponto 21,5 px acima e abaixo do centro ainda cai no botão.
async function lastFits(page: Page, where: string): Promise<void> {
  const tabbar = page.locator('nav.tabbar');
  if (!(await tabbar.isVisible())) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  const m = await page.evaluate(() => {
    const bar = document.querySelector('nav.tabbar')!.getBoundingClientRect().top;
    const line = document.querySelector('[data-round] [data-last-attempt]')!.getBoundingClientRect();
    const time = document.querySelector('[data-round] [data-time]')!.getBoundingClientRect();
    const zones = Math.min(...[...document.querySelectorAll('[data-round] [data-zone]')].map((z) => z.getBoundingClientRect().top));
    const buttons = [...document.querySelectorAll<HTMLElement>('[data-round] [data-last-attempt] button')].map((b) => {
      const box = b.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hits = (dy: number): boolean => b.contains(document.elementFromPoint(x, y + dy));
      return { name: b.textContent, touch: hits(-21.5) && hits(21.5), bottom: y + 22 };
    });
    return { bar, top: line.top, bottom: line.bottom, time: time.bottom, zones, buttons };
  });
  expect(m.top, `rodada ${where}: a última tentativa depois do tempo`).toBeGreaterThanOrEqual(m.time);
  expect(m.bottom, `rodada ${where}: a última tentativa antes das zonas`).toBeLessThanOrEqual(m.zones);
  expect(m.buttons.map((b) => b.name)).toEqual(['Era erro', 'Apagar']);
  for (const b of m.buttons) {
    expect(b.touch, `rodada ${where}: ${b.name} com 44 px de toque`).toBe(true);
    expect(b.bottom, `rodada ${where}: ${b.name} acima da barra de abas`).toBeLessThanOrEqual(m.bar);
  }
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
    // "Ver o algoritmo" põe a figura de como segurar o caso ao lado do algoritmo.
    await page.getByRole('button', { name: 'Ver o algoritmo' }).click();
    await expect(page.locator('[data-round] [data-case-figure]')).toHaveCount(2);
    await roundFits(page, `${set} com o algoritmo`, 0.75);
    // O caso seguinte, com a última tentativa: no celular, a linha compacta entre o tempo e as zonas, que continuam inteiras acima da
    // barra de abas, também com a ajuda do caso novo aberta.
    await run(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-last-attempt]')).toBeVisible();
    await expect(page.locator('[data-round] [data-zone="left"]')).toBeAttached(); // o caso seguinte, na montagem (no desktop largo, sem zonas à vista)
    await roundFits(page, `${set} com a última tentativa`);
    await lastFits(page, `${set} com a última tentativa`);
    await page.getByRole('button', { name: 'Ver o algoritmo' }).click();
    await expect(page.locator('[data-round] [data-case-figure]')).toHaveCount(2);
    await roundFits(page, `${set} com a última tentativa e o algoritmo`);
    await lastFits(page, `${set} com a última tentativa e o algoritmo`);
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

// No desktop largo, a Trilha usa duas colunas, como o Timer: o treino à direita das etapas, o texto da aula à direita do cubo (quadrado) e,
// na rodada, a dica de teclado à direita do tempo. No celular, uma coluna só (os testes de cima conferem que cabe).
test.describe('num desktop de 1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('a Trilha em duas colunas: começo, aula e rodada', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'as duas colunas são do desktop');
    const box = async (selector: string) => {
      const b = await page.locator(selector).boundingBox();
      if (!b) throw new Error(`${selector}: sem caixa`);
      return { left: b.x, right: b.x + b.width, width: b.width, height: b.height };
    };
    await fresh(page);
    await openTrilha(page);
    const steps = await box('.card:has([data-steps])');
    const training = await box('[data-training]');
    expect(training.left, 'o treino à direita das etapas').toBeGreaterThan(steps.right);
    await page.getByRole('button', { name: 'Começar a aula' }).click();
    await expect(page.getByRole('heading', { name: 'Segure assim' })).toBeVisible();
    const cube = await box('[data-lesson] [data-cube]');
    const text = await box('[data-lesson] .text');
    expect(text.left, 'o texto da aula à direita do cubo').toBeGreaterThan(cube.right);
    expect(Math.abs(cube.width - cube.height), 'o cubo quadrado').toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Voltar à trilha' }).first().click();
    await page.locator('[data-train-set="oll2"]').click();
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    await expect(page.locator('[data-train-scramble]')).not.toBeEmpty();
    const time = await box('[data-round] [data-time]');
    const hint = await box('[data-round] .kbd-hint');
    expect(hint.left, 'a dica de teclado à direita do tempo').toBeGreaterThan(time.right);
    await fitsWidth(page, 'rodada a 1440');
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

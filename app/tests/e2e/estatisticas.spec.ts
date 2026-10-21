import { expect, test } from '@playwright/test';
import { T } from '../../src/strings';
import { fresh, importHistory, setTimerSetting } from './helpers';

// As estatísticas que ensinam, de ponta a ponta (a maquete aprovada de 21/10): Semanas e o ano na Evolução, a meta criada pela folha e
// alcançada no Digitar, e a meta do dia do Ajustes no tile do Timer. Tudo pelas telas de verdade, sem gravar o perfil no banco.

test('a Evolução mostra Semanas com Esta semana e o ano com o dia de hoje', async ({ page }) => {
  await fresh(page);
  await importHistory(page);
  await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
  const screen = page.locator('[data-screen="evolucao"]');
  // Semanas: o cabeçalho e a primeira linha, a da semana corrente (os solves do arquivo são das últimas horas).
  const weeks = screen.getByRole('region', { name: T.semanas.title });
  await expect(weeks).toBeVisible();
  await expect(weeks.getByRole('rowheader').first()).toHaveText(T.semanas.now);
  await expect(weeks.locator('.es-wk[data-now]')).toHaveCount(1);
  // O ano: o calendário é desenho (aria-hidden) com um texto para o leitor, e a célula de hoje tem a marca.
  const year = screen.getByRole('region', { name: T.constancia.title });
  await expect(year).toBeVisible();
  await expect(year.locator('.today')).toHaveCount(1);
  await expect(year.getByText(/^Calendário de /)).toBeAttached();
  // A ordem da tela: Semanas e Metas lado a lado (a mesma .es-grid, nessa ordem), o ano depois, o gráfico no fim.
  const order = await screen.evaluate((root) => {
    const at = (sel: string) => {
      const el = root.querySelector(sel);
      return el ? el.getBoundingClientRect().top + window.scrollY : Number.NaN;
    };
    const weeksEl = root.querySelector('.es-weeks');
    const grid = weeksEl?.parentElement;
    const sameGrid = !!grid?.classList.contains('es-grid') && grid.querySelector(':scope > .es-metas') === weeksEl?.nextElementSibling;
    return { weeks: at('.es-weeks'), metas: at('.es-metas'), year: at('.es-year'), chart: at('.bars'), sameGrid };
  });
  expect(order.sameGrid).toBe(true);
  expect(order.year).toBeGreaterThan(order.weeks);
  expect(order.year).toBeGreaterThan(order.metas);
  expect(order.chart).toBeGreaterThan(order.year);
});

test('criar uma meta pela folha, alcançar no Digitar com 9.50 e ver a mensagem no Centro e "✓ alcançada em" no quadro', async ({ page }) => {
  await fresh(page);
  // O Digitar: o solve entra pelo campo, sem cronômetro nem inspeção.
  await setTimerSetting(page, T.ajustes.entry, T.ajustes.entryOptions[1][1]);
  // A meta: sem nenhuma, o quadro convida; a folha abre em Single, no evento do filtro.
  await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
  const board = page.locator('[data-screen="evolucao"]').getByRole('region', { name: T.metas.title });
  await board.getByRole('button', { name: T.metas.create }).click();
  const sheet = page.getByRole('dialog', { name: T.metas.newTitle });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: T.metas.kind.single, exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Tempo torto: o erro aparece só ao salvar, e a folha fica aberta.
  await sheet.getByLabel(T.metas.targetLabel).fill('12.3.4');
  await sheet.getByRole('button', { name: T.metas.save }).click();
  await expect(sheet.getByText(T.metas.bad)).toBeVisible();
  await sheet.getByLabel(T.metas.targetLabel).fill('10');
  await sheet.getByRole('button', { name: T.metas.save }).click();
  await expect(sheet).toBeHidden();
  // A meta em andamento: sem solves, "ainda sem tempo".
  const goal = board.getByRole('button', { name: /^Single abaixo de 10 s, / });
  await expect(goal).toContainText(T.metas.none.single);
  // O solve de 9.50, digitado, fecha a meta: a mensagem toma o lugar da do recorde (é o primeiro solve, e seria recorde).
  await page.getByRole('button', { name: 'Timer', exact: true }).first().click();
  const field = page.getByLabel(T.timer.typedLabel);
  await field.fill('9.50');
  await field.press('Enter');
  await expect(page.locator('.tc-last')).toHaveText('0:09.50');
  await expect(page.locator('.coach')).toHaveText('Meta alcançada: single abaixo de 10 s. Essa você escolheu e cumpriu.');
  // O quadro guarda a data e o melhor.
  await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
  const reached = board.getByRole('button', { name: /^Single abaixo de 10 s, / });
  await expect(reached).toContainText(/✓ alcançada em \d\d\/\d\d\/\d{4} · melhor 0:09\.50/);
  await expect(reached).toHaveAttribute('data-done', '');
});

test('a meta do dia em Ajustes muda o tile do Timer para meta 50', async ({ page }) => {
  await fresh(page);
  await expect(page.getByText(T.tiles.todaySub(20), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click();
  const group = page.getByRole('group', { name: T.ajustes.dailyGoal, exact: true });
  const fifty = group.getByRole('button', { name: '50', exact: true });
  await fifty.click();
  await expect(fifty).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Timer', exact: true }).first().click();
  await expect(page.getByText(T.tiles.todaySub(50), { exact: true })).toBeVisible();
});

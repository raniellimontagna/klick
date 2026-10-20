import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fresh, importHistory } from './helpers';

const TABS = [
  { tab: 'Timer', screen: 'timer' },
  { tab: 'Evolução', screen: 'evolucao' },
  { tab: 'Trilha', screen: 'trilha' },
  { tab: 'Centro', screen: 'companion' },
  { tab: 'Ajustes', screen: 'ajustes' },
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test(`sem violações sérias de acessibilidade no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    for (const { tab, screen } of TABS) {
      const button = page.getByRole('button', { name: tab, exact: true }).first();
      await button.click();
      // A análise só vale com a tela da aba montada e visível (o Evolução, a Trilha, o Centro e o Ajustes montam ao abrir).
      await expect(button).toHaveAttribute('aria-current', 'page');
      await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
      const r = await new AxeBuilder({ page }).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${tab}: ${v.id}`)).toEqual([]);
    }
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`a lista da Evolução, o detalhe, a seleção e a folha de mover, sem violações sérias no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await importHistory(page);
    await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
    const screen = page.locator('[data-screen="evolucao"]');
    await expect(screen.getByRole('heading', { name: 'Solves do período · 40' })).toBeVisible();
    const serious = async (where: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`);
    };
    expect(await serious('lista')).toEqual([]);
    // O detalhe de um solve: a linha abre a folha; com um +2, o seletor marcado e o tempo cru.
    await screen.locator('.hx-row').first().click();
    const detail = page.getByRole('dialog', { name: /Solve #40/ });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: '+2', exact: true }).click();
    await expect(detail.getByRole('button', { name: '+2', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.locator('.hx-raw')).toBeVisible();
    expect(await serious('detalhe')).toEqual([]);
    await detail.getByRole('button', { name: 'Fechar' }).click();
    await expect(detail).toBeHidden();
    // A seleção: três linhas marcadas e a barra do lote.
    await screen.getByRole('button', { name: 'Selecionar' }).click();
    const rows = screen.locator('.hx-row');
    for (const i of [0, 2, 3]) await rows.nth(i).click();
    await expect(page.getByRole('region', { name: 'Seleção' })).toContainText('3 selecionados');
    expect(await serious('seleção')).toEqual([]);
    // A folha de mover.
    await page.getByRole('button', { name: 'Mover para…' }).click();
    await expect(page.getByRole('dialog', { name: 'Mover 3 solves' })).toBeVisible();
    expect(await serious('mover')).toEqual([]);
  });
}

// O quadro de recordes e a folha do recorde (a maquete aprovada do histórico, 1a e 5), nos dois temas: o quadro com as linhas-botão, a folha
// aberta pelo quadro (ao12: os tempos com o melhor e o pior entre parênteses) e pelo selo do detalhe, e o "Ver na lista".
for (const scheme of ['light', 'dark'] as const) {
  test(`o quadro de recordes e a folha do recorde, sem violações sérias no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await importHistory(page);
    await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
    const screen = page.locator('[data-screen="evolucao"]');
    const board = screen.getByRole('region', { name: 'Recordes do evento' });
    await expect(board).toBeVisible();
    const serious = async (where: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`);
    };
    // Single, ao5 e ao12 têm solves nos 40 do arquivo; ao50 em diante, não.
    await expect(board.getByRole('button')).toHaveCount(3);
    await expect(board.getByRole('button', { name: /^Média de 12: melhor \d:\d\d\.\d\d, atual .*\. Ver os solves do recorde$/ })).toBeVisible();
    expect(await serious('quadro')).toEqual([]);
    // A folha do recorde de ao12: o título com o valor, os 12 tempos com dois entre parênteses e a regra.
    await board.getByRole('button', { name: /^Média de 12:/ }).click();
    const sheet = page.getByRole('dialog', { name: /^Melhor média de 12 · / });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading')).toContainText('Melhor média de 12');
    await expect(sheet.locator('ol.dz-times li')).toHaveCount(12);
    await expect(sheet.locator('li.hx-out')).toHaveCount(2);
    expect(await serious('folha do recorde')).toEqual([]);
    // "Ver na lista" fecha a folha e leva o foco a uma linha da lista, com as 12 da janela marcadas.
    await sheet.getByRole('button', { name: 'Ver na lista' }).click();
    await expect(sheet).toBeHidden();
    await expect(screen.locator('.hx-row[data-flash]')).toHaveCount(12);
    await expect(screen.locator('.hx-row:focus')).toHaveCount(1);
    expect(await serious('lista marcada')).toEqual([]);
    // O single: a folha do melhor tempo, aberta pelo quadro.
    await board.getByRole('button', { name: /^Single:/ }).click();
    await expect(page.getByRole('dialog', { name: /^Recorde de single · / })).toBeVisible();
    expect(await serious('folha do single')).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  });
}

// Juntar sessões (a maquete aprovada do histórico, 6a e 6b), nos dois temas: o passo na própria linha da sessão, sem violações sérias, e
// confirmar leva os solves para a sessão de destino, com o aviso.
for (const scheme of ['light', 'dark'] as const) {
  test(`juntar sessões no diálogo de Sessões, sem violações sérias no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await importHistory(page);
    await page.getByRole('button', { name: /Sessão 1/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sessões' });
    await expect(dialog).toBeVisible();
    const serious = async (where: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`);
    };
    expect(await serious('sessões')).toEqual([]);
    await dialog.getByRole('button', { name: 'Juntar Treino de cruz com outra sessão' }).click();
    const choice = dialog.getByRole('combobox', { name: /^Juntar “Treino de cruz” \(10 solves\) com$/ });
    await expect(choice).toBeFocused();
    await expect(dialog.getByText('Os 10 solves passam para “Sessão 1”, e “Treino de cruz” vai para a lixeira.')).toBeVisible();
    await choice.selectOption({ label: 'Principal · 30 solves' });
    await expect(dialog.getByText('Os 10 solves passam para “Principal”, e “Treino de cruz” vai para a lixeira.')).toBeVisible();
    expect(await serious('juntar')).toEqual([]);
    await dialog.getByRole('button', { name: /^Juntar “Treino de cruz”/ }).click();
    await expect(dialog.getByRole('button', { name: /^Treino de cruz/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^Principal/ })).toContainText('40 solves');
    await expect(dialog.getByRole('button', { name: /^Principal/ })).toBeFocused();
    await expect(page.locator('.toast')).toContainText('Sessões juntadas: 10 solves passaram para Principal');
  });
}

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { fresh } from './helpers';

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

// A lista inteira da Evolução (o histórico): 40 solves de 3×3 em duas sessões, com +2, DNF, nota e recorde, para o axe ver as linhas, a
// seleção com a barra do lote, a folha de mover e o detalhe de um solve, nos dois temas.
function historyFile(): Buffer {
  const end = Date.now() - 60_000;
  const sessions = ['ha', 'hb'].map((id, i) => ({ id, name: i === 0 ? 'Principal' : 'Treino de cruz', event: '333', order: 5 + i, createdAt: end - 86_400_000, updatedAt: end - 86_400_000, deletedAt: null }));
  const solves = Array.from({ length: 40 }, (_, i) => {
    const at = end - (40 - i) * 300_000;
    const penalty = i % 9 === 4 ? '+2' : i % 13 === 7 ? 'DNF' : null;
    const note = i % 6 === 1 ? 'embaralhei errado' : '';
    return { id: `h${i}`, sessionId: i < 30 ? 'ha' : 'hb', event: '333', ms: 12_000 + ((i * 731) % 4000), penalty, at, scramble: "R U2 F L R' D2 R D R' L D2 B", note, createdAt: at, updatedAt: at, deletedAt: null };
  });
  return Buffer.from(JSON.stringify({ format: 'klick', version: 1, exportedAt: Date.now(), sessions, solves, profile: null }));
}

async function importHistory(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('group', { name: 'Seus dados' }).getByLabel('Importar arquivo').setInputFiles({ name: 'klick.json', mimeType: 'application/json', buffer: historyFile() });
  const summary = page.getByRole('dialog', { name: 'Importar solves' });
  await expect(summary.getByText(/40 solves importados/)).toBeVisible();
  await summary.getByRole('button', { name: 'Fechar' }).click();
  await expect(summary).toBeHidden();
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

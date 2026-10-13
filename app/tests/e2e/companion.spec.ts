import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { fresh, noInspection, quickSolve } from './helpers';

const DAY = 86400000;

// Um arquivo do Klick com 1.000 solves de 3×3 de 50 s, 100 por dia nos 10 dias antes de hoje: fecham os 9 marcos da T1.
function t1File(season?: unknown): Buffer {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const end = noon.getTime();
  const session = { id: 'imp', name: 'Importada', event: '333', order: 5, createdAt: end - 11 * DAY, updatedAt: end - 11 * DAY, deletedAt: null };
  const solves = Array.from({ length: 1000 }, (_, i) => {
    const at = end - (10 - Math.floor(i / 100)) * DAY + (i % 100) * 60000;
    return { id: `imp${i}`, sessionId: 'imp', event: '333', ms: 50000, penalty: null, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null };
  });
  const data = { format: 'klick', version: 1, exportedAt: Date.now(), sessions: [session], solves, profile: season ? { season } : null };
  return Buffer.from(JSON.stringify(data));
}

async function importFile(page: Page, buffer: Buffer): Promise<void> {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('group', { name: 'Seus dados' }).getByLabel('Importar arquivo').setInputFiles({ name: 'klick.json', mimeType: 'application/json', buffer });
  const summary = page.getByRole('dialog', { name: 'Importar solves' });
  await expect(summary.getByText(/1000 solves importados/)).toBeVisible();
  // O resumo abre num diálogo modal que cobre as abas: fecha antes de seguir.
  await summary.getByRole('button', { name: 'Fechar' }).click();
  await expect(summary).toBeHidden();
}

test('importar 1.000 solves fecha a T1, libera o Brilho e abre a T2 com metas da escada', async ({ page }) => {
  await fresh(page);
  await importFile(page, t1File());
  await page.getByRole('button', { name: 'Centro', exact: true }).first().click();
  const screen = page.locator('[data-screen="companion"]');
  await expect(screen.getByText(/Temporada 2 · 0 de 9 marcos/)).toBeVisible();
  await expect(screen.getByText('Média de 5 abaixo de 48 s')).toBeVisible();
  await expect(screen.getByText(/^T1 · /)).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Brilho', exact: true })).toBeVisible();
  // A mesma tela nos dois temas (spec 9): o Centro segue o do sistema, e o SVG dele diz qual está valendo.
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(screen.locator('.big svg.centro')).toHaveAttribute('data-theme', scheme);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${scheme}: ${v.id}`)).toEqual([]);
  }
});

test('um solve que fecha a temporada mostra o fim de temporada e libera o Gelo', async ({ page }) => {
  await fresh(page);
  await noInspection(page);
  // Uma T2 já começada em que qualquer solve novo fecha os 9 marcos.
  const season = {
    current: { n: 2, startedAt: Date.now() - 1000, marks: Array.from({ length: 9 }, () => ({ kind: 'count', target: 1 })), basis: { single: 50000, ao5: 50000, ao12: 50000 } },
    past: [{ n: 1, startedAt: Date.now() - 20 * DAY, endedAt: Date.now() - 2 * DAY, solves: 1000, startAo12: null, endAo12: 50000 }],
  };
  await importFile(page, t1File(season));
  await page.getByRole('button', { name: 'Timer', exact: true }).click();
  await quickSolve(page);
  await expect(page.getByText('Temporada 2 completa: 1 solve. Gelo liberado.')).toBeVisible();
  await page.getByRole('button', { name: 'Centro', exact: true }).first().click();
  const screen = page.locator('[data-screen="companion"]');
  await expect(screen.getByText(/Temporada 3 · 0 de 9 marcos/)).toBeVisible();
  await expect(screen.getByText(/^T2 · /)).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Gelo', exact: true })).toBeVisible();
});

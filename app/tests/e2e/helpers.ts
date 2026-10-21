import { expect, type Page } from '@playwright/test';
import { T } from '../../src/strings';

// O embaralhamento está pronto quando o texto não é o de "gerando" nem o da falha. Um texto vazio nunca aparece: o bloco mostra um
// dos três.
export async function waitForScramble(page: Page) {
  const scramble = page.locator('[data-scramble]');
  await expect(scramble).not.toHaveText(T.timer.generating, { timeout: 20_000 });
  await expect(scramble).not.toHaveText(T.timer.scrambleFailed);
}

export async function fresh(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pular apresentação' }).click();
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await waitForScramble(page);
}

export async function quickSolve(page: Page) {
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('a');
}

export async function noInspection(page: Page) {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.locator('[data-toggle="inspection"]').uncheck();
  await page.getByRole('button', { name: 'Timer', exact: true }).click();
}

// O histórico de teste: 40 solves de 3×3 em duas sessões ("Principal", com 30, e "Treino de cruz", com 10), com +2, DNF e nota. O primeiro
// (o mais antigo, #1) é o melhor single (0:12.00); sem ele, o melhor é o #12 (0:12.04). Entra pela importação do Klick, o caminho de
// quem traz os dados: criar 40 solves pelo Timer levaria minutos.
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

export async function importHistory(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('group', { name: 'Seus dados' }).getByLabel('Importar arquivo').setInputFiles({ name: 'klick.json', mimeType: 'application/json', buffer: historyFile() });
  const summary = page.getByRole('dialog', { name: 'Importar solves' });
  await expect(summary.getByText(/40 solves importados/)).toBeVisible();
  await summary.getByRole('button', { name: 'Fechar' }).click();
  await expect(summary).toBeHidden();
}

// Troca um ajuste do Timer pela linha de verdade do Ajustes (o seletor `.seg` do grupo: "Como você marca o tempo", "Fases", "Tempo durante o
// solve") e volta para o Timer. É o caminho de quem usa: nada de gravar o perfil no banco.
export async function setTimerSetting(page: Page, group: string, option: string): Promise<void> {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click();
  const button = page.getByRole('group', { name: group, exact: true }).getByRole('button', { name: option, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Timer', exact: true }).first().click();
}

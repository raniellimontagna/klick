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

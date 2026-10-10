import { expect, type Page } from '@playwright/test';

export async function fresh(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pular apresentação' }).click();
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await expect(page.locator('[data-scramble]')).not.toHaveText('', { timeout: 20_000 });
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

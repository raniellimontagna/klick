import { expect, test } from '@playwright/test';
import { fresh, noInspection, quickSolve } from './helpers';

test('depois da primeira visita, funciona offline e grava o solve', async ({ page, context }) => {
  await fresh(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-scramble]')).not.toHaveText('', { timeout: 20_000 });
  await noInspection(page);
  await quickSolve(page);
  await page.getByRole('button', { name: 'Evolução' }).click();
  await expect(page.locator('.hist tbody tr')).toHaveCount(1);
});

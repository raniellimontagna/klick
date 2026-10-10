import { expect, test } from '@playwright/test';
import { fresh, noInspection, quickSolve, waitForScramble } from './helpers';

test('depois da primeira visita, funciona offline e grava o solve', async ({ page, context }) => {
  await fresh(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.reload();
  await waitForScramble(page);
  // A imagem 2D só aparece se o cubing.js e o worker de embaralhamento saíram do precache: é a prova de que o offline os tem.
  await expect(page.locator('.scr-img svg')).toHaveCount(1, { timeout: 20_000 });
  await noInspection(page);
  await quickSolve(page);
  await page.getByRole('button', { name: 'Evolução' }).click();
  await expect(page.locator('.hist tbody tr')).toHaveCount(1);
});

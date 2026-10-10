import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { fresh, noInspection, quickSolve } from './helpers';

test('duas abas: o solve de uma aparece na outra sem recarregar', async ({ context }) => {
  const a = await context.newPage();
  await fresh(a);
  await noInspection(a);
  const b = await context.newPage();
  await b.goto('/');
  await b.getByRole('button', { name: 'Evolução' }).click();
  await quickSolve(a);
  await expect(b.locator('.hist tbody tr')).toHaveCount(1);
});

test('exportar no formato Klick baixa o arquivo com o solve', async ({ page }) => {
  await fresh(page);
  await noInspection(page);
  await quickSolve(page);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar (Klick)' }).click()]);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(JSON.parse(text).solves).toHaveLength(1);
});

test('importar do csTimer pede o evento da sessão desconhecida', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('group', { name: 'Seus dados' }).getByLabel('Importar arquivo').setInputFiles(fileURLToPath(new URL('../fixtures/cstimer-export.txt', import.meta.url)));
  await page.getByLabel('Evento de ZBLL').selectOption('333');
  await page.getByRole('button', { name: 'Importar solves' }).click();
  await expect(page.getByText(/5 solves importados/)).toBeVisible();
});

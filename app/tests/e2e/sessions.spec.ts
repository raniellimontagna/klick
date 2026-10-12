import { expect, test, type Locator } from '@playwright/test';
import { fresh } from './helpers';

// Numa tela estreita, o diálogo de Sessões não pode rolar para o lado: no iPhone, o campo do nome e o botão Criar ficavam fora da
// tela (teste no simulador, 12/10).
async function insideDialog(dialog: Locator, el: Locator) {
  const d = (await dialog.boundingBox())!;
  const b = (await el.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(d.x);
  expect(b.x + b.width).toBeLessThanOrEqual(d.x + d.width + 0.5);
}

test('numa tela de 375 px, o diálogo de Sessões cabe na largura, com Criar à vista', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await fresh(page);
  await page.getByRole('button', { name: /Sessão 1/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Sessões' });
  await expect(dialog).toBeVisible();

  const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await insideDialog(dialog, dialog.getByRole('combobox', { name: 'Evento da nova sessão' }));
  await insideDialog(dialog, dialog.getByRole('textbox', { name: 'Nome da nova sessão' }));
  await insideDialog(dialog, dialog.getByRole('button', { name: 'Criar' }));
  await insideDialog(dialog, dialog.getByRole('button', { name: /Renomear/ }).first());
  await insideDialog(dialog, dialog.getByRole('button', { name: /Excluir/ }).first());

  // E criar funciona dali: a sessão nova vira a atual.
  await dialog.getByRole('combobox', { name: 'Evento da nova sessão' }).selectOption('444');
  await dialog.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByRole('button', { name: /4×4 · Sessão 1/ })).toBeVisible();
});

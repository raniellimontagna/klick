import { expect, test } from '@playwright/test';
import { fresh } from './helpers';

// No Safari do iPhone, tocar num botão pisca um retângulo cinza do navegador. O app tira esse realce e dá o retorno do toque ele
// mesmo: o botão apertado fica mais claro.
test('o toque não pisca o realce do navegador e o botão apertado responde', async ({ page }) => {
  await fresh(page);
  const button = page.getByRole('button', { name: 'Ajustes' });
  await expect(button).toHaveCSS('-webkit-tap-highlight-color', 'rgba(0, 0, 0, 0)');
  await expect(button).toHaveCSS('opacity', '1');
  await button.hover();
  await page.mouse.down();
  await expect(button).toHaveCSS('opacity', '0.7');
  await page.mouse.up();
  await expect(button).toHaveCSS('opacity', '1');
});

// No iPhone, segurar um botão selecionava o texto dele e abria o menu "Copiar".
test('segurar um botão não seleciona o texto dele', async ({ page }) => {
  await fresh(page);
  await expect(page.getByRole('button', { name: 'Ajustes' })).toHaveCSS('user-select', 'none');
});

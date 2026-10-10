import { expect, test, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Pular apresentação' }).click();
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await expect(page.locator('[data-scramble]')).not.toHaveText('');
  // O relógio falso anda sozinho enquanto a página roda: o tempo real entre dois comandos (mais longo com a máquina cheia) entraria
  // no solve. Congelado aqui, só o runFor avança o tempo. Com ele congelado, a tela só repinta no runFor (o laço de quadros espera
  // o relógio), por isso os testes avançam um pouco depois de parar o timer.
  await page.clock.pauseAt(Date.now() + 1_000);
}

test('solve no teclado é gravado antes da reação e sobrevive a recarregar', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado só no desktop');
  await start(page);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.locator('[data-toggle="inspection"]').uncheck();
  await page.getByRole('button', { name: 'Timer', exact: true }).click();
  await page.keyboard.down('Space');
  await page.clock.runFor(400);
  await page.keyboard.up('Space');
  await page.clock.runFor(12_345);
  await page.keyboard.press('a');
  await page.clock.runFor(100); // a tela repinta o resultado no próximo quadro
  await expect(page.locator('[data-time]')).toContainText('0:12.');
  await page.reload();
  await page.getByRole('button', { name: 'Evolução' }).click();
  await expect(page.locator('.hist tbody tr')).toHaveCount(1);
});

test('inspeção: largar depois de 15 s dá +2', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado só no desktop');
  await start(page);
  await page.keyboard.press('Space');
  await page.clock.runFor(15_500);
  await page.keyboard.down('Space');
  await page.clock.runFor(400);
  await page.keyboard.up('Space');
  await page.clock.runFor(5_000);
  await page.keyboard.press('a');
  await page.clock.runFor(100); // a tela repinta o resultado no próximo quadro
  await expect(page.locator('[data-time]')).toContainText('+');
});

test('celular: dois polegares armam e o primeiro que sai larga', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'só no celular');
  await start(page);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.locator('[data-toggle="inspection"]').uncheck();
  await page.getByRole('button', { name: 'Timer', exact: true }).click();
  const zones = page.locator('[data-zone]');
  await zones.nth(0).dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true });
  await zones.nth(1).dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch', isPrimary: false });
  await page.clock.runFor(400);
  await zones.nth(0).dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch', isPrimary: true });
  await expect(page.locator('body')).toHaveClass(/solving/);
});

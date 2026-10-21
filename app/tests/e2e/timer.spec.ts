import { expect, test, type Page } from '@playwright/test';
import { T } from '../../src/strings';
import { fresh, setTimerSetting, waitForScramble } from './helpers';

async function start(page: Page) {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Pular apresentação' }).click();
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await waitForScramble(page);
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
  // As ações do solve só aparecem depois que ele está gravado: só então a página pode ser recarregada.
  await expect(page.locator('[data-actions]')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Evolução' }).click();
  await expect(page.locator('.hx-row')).toHaveCount(1);
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
  await expect(page.locator('[data-actions]')).toBeVisible();
  // 5,000 s de corrida mais 2 s de penalidade: a tela mostra 0:07.00 com o sinal de +2.
  await expect(page.locator('[data-time]')).toContainText('0:07.00+');
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

// Digitar o tempo (desktop e celular): grava, mostra o último solve com as ações e sobrevive a recarregar; no celular, Salvar fecha o teclado.
test('digitar: Salvar grava o tempo, o campo fica pronto e o solve sobrevive a recarregar', async ({ page, isMobile }) => {
  await fresh(page);
  await setTimerSetting(page, T.ajustes.entry, T.ajustes.entryOptions[1][1]);
  await expect(page.getByLabel(T.timer.typedLabel)).toBeVisible();
  const field = page.getByLabel('Seu tempo');
  await field.fill('1234');
  await expect(page.getByText('Fica 0:12.34.')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('.tc-last')).toHaveText('0:12.34');
  await expect(page.locator('[data-actions]')).toBeVisible();
  await expect(field).toHaveValue('');
  if (isMobile) await expect(field).not.toBeFocused(); // o teclado fecha
  else await expect(field).toBeFocused(); // no desktop, o foco fica para o próximo
  await page.reload();
  await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
  await expect(page.locator('.hx-row')).toHaveCount(1);
});

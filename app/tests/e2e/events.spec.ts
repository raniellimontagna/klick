import { expect, test } from '@playwright/test';
import { fresh } from './helpers';

const EVENTS = ['333', '222', '444', '555', '666', '777', '333oh', '333bf', 'minx', 'pyram', 'skewb', 'sq1', 'clock'];

// Usa o relógio real, porque o cubing.js roda num worker.
test('os 13 eventos geram embaralhamento oficial e imagem 2D', async ({ page }) => {
  test.setTimeout(180_000);
  await fresh(page);
  const sessions = page.getByRole('dialog', { name: 'Sessões' });
  for (const ev of EVENTS) {
    await page.locator('[data-session-pill]').click();
    await page.getByLabel('Evento da nova sessão').selectOption(ev);
    await page.getByRole('button', { name: 'Criar' }).click();
    await expect(page.locator('[data-scramble]')).not.toHaveText('', { timeout: 20_000 });
    await expect(page.locator('.scr-img svg')).toHaveCount(1, { timeout: 20_000 });
    // A lista de sessões fica aberta depois de criar: fecha para o próximo evento.
    await sessions.getByRole('button', { name: 'Fechar' }).click();
  }
});

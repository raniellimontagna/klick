import { expect, test } from '@playwright/test';
import { eventInfo } from '../../src/core/events';
import type { EventId } from '../../src/core/types';
import { fresh, waitForScramble } from './helpers';

const EVENTS: EventId[] = ['333', '222', '444', '555', '666', '777', '333oh', '333bf', 'minx', 'pyram', 'skewb', 'sq1', 'clock'];

// Usa o relógio real, porque o cubing.js roda num worker.
test('os 13 eventos geram embaralhamento oficial e imagem 2D', async ({ page }) => {
  test.setTimeout(180_000);
  await fresh(page);
  const pill = page.locator('[data-session-pill]');
  const sessions = page.getByRole('dialog', { name: 'Sessões' });
  for (const ev of EVENTS) {
    await pill.click();
    const before = (await pill.textContent()) ?? '';
    await page.getByLabel('Evento da nova sessão').selectOption(ev);
    await page.getByRole('button', { name: 'Criar' }).click();
    // A pílula troca depois que a sessão nova é gravada: só então o embaralhamento do evento novo é esperado.
    await expect(pill).not.toHaveText(before);
    await expect(pill).toHaveText(new RegExp(`^${eventInfo(ev).short} · `));
    await waitForScramble(page);
    await expect(page.locator('.scr-img svg')).toHaveCount(1, { timeout: 20_000 });
    // A lista de sessões fica aberta depois de criar: fecha para o próximo evento.
    await sessions.getByRole('button', { name: 'Fechar' }).click();
  }
});

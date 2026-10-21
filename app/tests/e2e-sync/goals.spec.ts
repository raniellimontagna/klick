import { expect, test } from '@playwright/test';
import { T } from '../../src/strings';
import { CONFIRM_DELAY_MS } from '../../src/ui/confirm';
import { device, signIn, syncNow } from './helpers';

// As metas viajam como ajustes da conta (`goal.<id>`, spec 11): criada num aparelho, aparece no outro; excluída no outro, some do primeiro.
// Um e-mail novo por teste, como nos outros do sync.
const email = (name: string) => `${name}-${Date.now()}@exemplo.com`;

test('meta criada no aparelho A aparece no B; excluída no B some do A', async ({ browser }) => {
  const who = email('metas');
  const a = await device(await browser.newContext());
  const b = await device(await browser.newContext());
  await signIn(a, who);
  await signIn(b, who);
  const board = (page: typeof a) => page.locator('[data-screen="evolucao"]').getByRole('region', { name: T.metas.title });
  const open = async (page: typeof a) => {
    await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
    await expect(board(page)).toBeVisible();
  };
  // A cria "Single abaixo de 15" pela folha e sincroniza.
  await open(a);
  await board(a).getByRole('button', { name: T.metas.create }).click();
  const sheet = a.getByRole('dialog', { name: T.metas.newTitle });
  await sheet.getByLabel(T.metas.targetLabel).fill('15');
  await sheet.getByRole('button', { name: T.metas.save }).click();
  await expect(sheet).toBeHidden();
  await expect(board(a).getByRole('button', { name: /^Single abaixo de 15 s, / })).toBeVisible();
  await syncNow(a);
  // B sincroniza e vê a meta em Metas.
  await syncNow(b);
  await open(b);
  const goalB = board(b).getByRole('button', { name: /^Single abaixo de 15 s, / });
  await expect(goalB).toBeVisible();
  // B exclui em dois toques (o segundo só vale depois de uma pausa) e sincroniza.
  await goalB.click();
  const edit = b.getByRole('dialog', { name: T.metas.editTitle });
  await edit.getByRole('button', { name: T.metas.remove }).click();
  const again = edit.getByRole('button', { name: T.metas.confirmAgain });
  await expect(again).toBeVisible();
  await b.waitForTimeout(CONFIRM_DELAY_MS + 100);
  await again.click();
  await expect(edit).toBeHidden();
  await expect(board(b).getByRole('button', { name: T.metas.create })).toBeVisible();
  await syncNow(b);
  // A sincroniza e a meta sumiu: o quadro volta ao convite.
  await syncNow(a);
  await open(a);
  await expect(board(a).getByRole('button', { name: T.metas.create })).toBeVisible();
  await expect(board(a).getByRole('button', { name: /^Single abaixo de 15 s, / })).toHaveCount(0);
});

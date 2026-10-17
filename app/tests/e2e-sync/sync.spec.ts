import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { quickSolve } from '../e2e/helpers';
import { device, historyCount, signIn, syncNow } from './helpers';

// Um e-mail novo por teste: cada conta começa vazia, e os limites por e-mail (5 códigos por hora) não se somam entre os testes.
const email = (name: string) => `${name}-${Date.now()}@exemplo.com`;

test('dois navegadores na mesma conta: um resolve e o outro vê (spec 11)', async ({ browser }) => {
  const who = email('dois');
  const phone = await device(await browser.newContext());
  const desktop = await device(await browser.newContext());
  await signIn(phone, who);
  await signIn(desktop, who);
  await phone.getByRole('button', { name: 'Timer', exact: true }).click();
  await quickSolve(phone);
  await syncNow(phone);
  await syncNow(desktop);
  await expect.poll(() => historyCount(desktop)).toBe(1);
});

test('um apaga offline enquanto o outro edita: a exclusão vence (D5)', async ({ browser }) => {
  const who = email('d5');
  const aContext = await browser.newContext();
  const a = await device(aContext);
  const b = await device(await browser.newContext());
  await signIn(a, who);
  await signIn(b, who);
  // B faz o solve; os dois o têm, na mesma "Sessão 1" (o id padrão).
  await b.getByRole('button', { name: 'Timer', exact: true }).click();
  await quickSolve(b);
  await syncNow(b);
  await syncNow(a);
  await expect.poll(() => historyCount(a)).toBe(1);
  // A, sem rede, apaga a sessão (o solve sai junto).
  await aContext.setOffline(true);
  await a.locator('[data-session-pill]').click();
  await a.getByRole('button', { name: 'Excluir Sessão 1' }).click();
  await a.keyboard.press('Escape');
  // Depois, B escreve uma nota no mesmo solve (o resultado dele ainda está na tela) e sincroniza.
  await b.getByRole('button', { name: 'Timer', exact: true }).click();
  await b.locator('[data-act="note"]').click();
  await b.getByRole('textbox', { name: 'Nota sobre este solve' }).fill('editada no outro aparelho');
  await b.getByRole('button', { name: 'Salvar' }).click();
  await syncNow(b);
  await aContext.setOffline(false);
  await syncNow(a);
  await syncNow(b);
  await expect.poll(() => historyCount(b)).toBe(0);
  await expect.poll(() => historyCount(a)).toBe(0);
});

test('o primeiro login com dados junta sem duplicar: o mesmo csTimer importado nos dois (spec 6.5)', async ({ browser }) => {
  const who = email('csv');
  const file = fileURLToPath(new URL('../fixtures/cstimer-export.txt', import.meta.url));
  const importIn = async (page: Awaited<ReturnType<typeof device>>) => {
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('group', { name: 'Seus dados' }).getByLabel('Importar arquivo').setInputFiles(file);
    await page.getByLabel('Evento de ZBLL').selectOption('333');
    await page.getByRole('button', { name: 'Importar solves' }).click();
    await expect(page.getByText(/5 solves importados/)).toBeVisible();
    await page.getByRole('button', { name: 'Fechar' }).click();
  };
  const a = await device(await browser.newContext());
  const b = await device(await browser.newContext());
  await importIn(a);
  await importIn(b);
  await signIn(a, who);
  await signIn(b, who);
  await syncNow(a);
  // O histórico do 3×3: as 3 da sessão Main e a da ZBLL, importada como 3×3 (a de 2×2 fica no histórico dela). Duplicado, seriam 8.
  await expect.poll(() => historyCount(a)).toBe(4);
  await expect.poll(() => historyCount(b)).toBe(4);
});

test('a política de privacidade e o diálogo de entrar, sem violações sérias de acessibilidade', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await device(context);
  await page.goto('/privacidade');
  await expect(page.getByRole('heading', { name: 'Política de privacidade' })).toBeVisible();
  const serious = async (where: string) => {
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`)).toEqual([]);
  };
  await serious('privacidade');
  await page.goto('/');
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Entrar ou criar conta' }).click();
  await serious('entrar');
  await page.keyboard.press('Tab'); // pelo teclado: o foco anda dentro da folha
  await expect(page.locator('dialog.signin :focus')).toHaveCount(1);
});

test('sair e apagar a conta deixam o foco na seção "Conta e sync", não no <body> (spec 9.6)', async ({ browser }) => {
  const who = email('foco');
  const page = await device(await browser.newContext());
  const section = page.locator('[data-slot="conta"]');
  const focusInSection = async () => {
    await expect(section.getByRole('button', { name: 'Entrar ou criar conta' })).toBeVisible();
    await expect(section.locator(':focus')).toHaveCount(1);
  };
  await signIn(page, who);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await section.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.getByRole('dialog', { name: 'Sair da conta' }).getByRole('button', { name: 'Sair', exact: true }).click();
  await focusInSection();

  await signIn(page, who); // o mesmo aparelho volta à conta
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await section.getByRole('button', { name: 'Apagar minha conta' }).click();
  const confirm = page.getByRole('dialog', { name: 'Apagar minha conta' });
  await confirm.getByRole('textbox').fill(who);
  await confirm.getByRole('button', { name: 'Apagar para sempre' }).click();
  await focusInSection();
});

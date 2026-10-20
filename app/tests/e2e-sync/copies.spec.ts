import { expect, test } from '@playwright/test';
import { quickSolve } from '../e2e/helpers';
import { T } from '../../src/strings';
import { device, historyCount, signIn, syncNow } from './helpers';

// O e-mail é novo por teste: cada conta começa vazia (como em sync.spec.ts).
const email = (name: string) => `${name}-${Date.now()}@exemplo.com`;

// A restauração que não cabe no servidor chega pelo aparelho (spec das cópias grandes). O Worker local roda com RESTORE_MAX_RECORDS:10 (ver
// playwright.sync.config.ts): apagar a sessão com 15 solves dá mais de 10 mudanças na volta, e o servidor responde "restaure no aparelho".
// A cópia vem por uma rota só do ponta a ponta (a de verdade sai no alarme do dia).
test('uma restauração que não cabe chega pelo aparelho, e o outro recebe pelo sync', async ({ browser }) => {
  const who = email('copias');
  const a = await device(await browser.newContext());
  const b = await device(await browser.newContext());
  await signIn(a, who);
  await signIn(b, who);

  // A faz 15 solves e sobe.
  await a.getByRole('button', { name: 'Timer', exact: true }).click();
  for (let i = 0; i < 15; i++) await quickSolve(a);
  await syncNow(a);
  await expect.poll(() => historyCount(a)).toBe(15);

  // A cópia de hoje, tirada na hora.
  const taken = await a.request.post('/api/__e2e/snapshot', { headers: { 'Content-Type': 'application/json' }, data: {} });
  expect(await taken.json()).toEqual({ ok: true });

  // A apaga a sessão (os 15 solves saem junto) e sobe; B entra no ponto e vê 0.
  await a.locator('[data-session-pill]').click();
  await a.getByRole('button', { name: 'Excluir Sessão 1' }).click();
  await a.keyboard.press('Escape');
  await syncNow(a);
  await syncNow(b);
  await expect.poll(() => historyCount(b)).toBe(0);

  // A restaura a cópia de hoje (dois cliques, com a espera do clique duplo no meio): chega pelo aparelho.
  await a.getByRole('button', { name: 'Ajustes' }).click();
  await a.getByRole('button', { name: T.conta.cloudView }).click();
  const dialog = a.getByRole('dialog', { name: T.conta.cloudTitle });
  const row = dialog.getByRole('listitem').first(); // só a de hoje existe; a de antes de restaurar nasce com a restauração
  await row.getByRole('button', { name: /^Restaurar a cópia de / }).click(); // o nome acessível do botão é o aria-label, com o dia
  await a.waitForTimeout(500); // CONFIRM_DELAY_MS: o segundo clique logo depois do primeiro é o clique duplo e não vale
  await row.getByRole('button', { name: T.conta.confirmAgain }).click();
  // O aviso aparece no toast (a região aria-live, sr-only, repete o texto: o toast é o que se vê).
  await expect(a.locator('.toast')).toContainText(T.conta.cloudRestoredHere, { timeout: 30_000 });
  await expect(a.locator('.toast')).toBeVisible();
  await expect.poll(() => historyCount(a)).toBe(15);

  // A sobe a restauração; B recebe pelo sync.
  await syncNow(a);
  await syncNow(b);
  await expect.poll(() => historyCount(b)).toBe(15);
});

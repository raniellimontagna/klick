import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, devices, expect, type Page, test } from '@playwright/test';
import { encodeDuelLink } from '../../src/core/duel/link';
import { T } from '../../src/strings';
import { fresh, noInspection, quickSolve } from './helpers';

// O desafio por link de ponta a ponta (spec do desafio; a maquete aprovada): A desafia, B responde noutro navegador, sem conta e sem
// instalar, e A vê o resultado. Os dois navegadores são dois contextos do Playwright, cada um com o seu banco.
//
// No teste não há a folha de compartilhar do sistema: o link sai pela cópia, como num navegador sem ela. A área de transferência é trocada,
// só no navegador do teste, por uma que guarda o que foi copiado (window.__copied): o teste lê o link dali, sem mexer na área de
// transferência de quem roda os testes.
async function withoutShare(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const copied: string[] = [];
    Object.defineProperty(window, '__copied', { value: copied });
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'clipboard', {
      configurable: true,
      get: () => ({ writeText: async (text: string) => void copied.push(text) }),
    });
  });
}

const lastCopied = (page: Page): Promise<string | undefined> => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1));

// As violações sérias de acessibilidade da tela, como em a11y.spec.ts.
async function serious(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

// Um solve pelo teclado que corre `ms` (o quickSolve corre uns 0,3 s).
async function solveFor(page: Page, ms: number): Promise<void> {
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('Space');
  await page.waitForTimeout(ms);
  await page.keyboard.press('a');
}

test('A desafia, B responde noutro navegador sem conta, A vê o resultado', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'teclado só no desktop');
  test.setTimeout(120_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    await withoutShare(contextA);
    await withoutShare(contextB);
    const a = await contextA.newPage();
    const b = await contextB.newPage();

    // A: "Desafiar", o evento da sessão (3×3) e os sete, sem inspeção. Cada um corre 1,5 s.
    await fresh(a);
    await noInspection(a);
    await a.getByRole('button', { name: T.duel.challenge, exact: true }).click();
    await a.getByRole('dialog', { name: T.duel.sheetTitle }).getByRole('button', { name: T.duel.start }).click();
    const timerA = a.locator('[data-screen="timer"]');
    await expect(timerA).toHaveAttribute('data-duel', 'solving', { timeout: 30_000 });
    for (let i = 1; i <= 7; i++) {
      await solveFor(a, 1_500);
      if (i < 7) await expect(timerA.locator('[data-chips] .chip')).toHaveCount(i);
    }
    // 4: os sete tempos, o nome e "Mandar o desafio" (sem a folha do sistema, o link é copiado).
    await a.getByRole('textbox', { name: T.duel.nameLabel }).fill('Ana');
    const send = a.getByRole('button', { name: T.duel.send });
    await expect(send).toBeEnabled();
    await send.click();
    await expect(a.locator('.toast')).toContainText(T.duel.copied);
    const challenge = await lastCopied(a);
    expect(challenge).toMatch(/\/#desafio=/);

    // B abre o link pela primeira vez no Klick: o convite vem antes da apresentação, e o fragmento sai da barra.
    await b.goto(challenge!);
    const invite = b.getByRole('dialog', { name: 'Ana te desafiou' });
    await expect(invite).toBeVisible();
    await expect.poll(() => b.evaluate(() => location.hash)).toBe('');
    await expect(b.getByRole('dialog', { name: T.onboarding.title })).toBeHidden();
    await invite.getByRole('button', { name: T.duel.accept }).click();
    const timerB = b.locator('[data-screen="timer"]');
    await expect(timerB).toHaveAttribute('data-duel', 'solving');
    await noInspection(b);

    // B joga ponto a ponto, uns 0,3 s cada. No primeiro, +2 antes de ver o ponto: 2,3 s contra 1,5 s, ponto de Ana. Os três seguintes são
    // de B: 3 × 1, no quarto.
    for (let i = 1; i <= 7; i++) {
      await quickSolve(b);
      const see = b.getByRole('button', { name: T.duel.seePoint });
      await expect(see).toBeVisible();
      if (i === 1) {
        const plus2 = timerB.locator('[data-act="plus2"]');
        await plus2.click();
        await expect(plus2).toHaveAttribute('aria-pressed', 'true');
      }
      await see.click();
      await b.getByRole('button', { name: T.duel.next }).click();
      // O próximo embaralhamento, ou o fim da partida.
      const end = b.getByRole('button', { name: T.duel.sendReply });
      await expect(b.locator('[data-screen="timer"][data-duel="solving"]').or(end)).toBeVisible();
      if (await end.isVisible()) break;
    }
    // 7: o resultado, o placar e "Mandar a resposta".
    await expect(b.getByRole('heading', { name: 'Você venceu 3 × 1' })).toBeVisible();
    await expect(b.getByRole('img', { name: /^Placar: Você 3, Ana 1\./ })).toBeVisible();
    await b.getByRole('textbox', { name: T.duel.nameLabel }).fill('Bia');
    const reply = b.getByRole('button', { name: T.duel.sendReply });
    await expect(reply).toBeEnabled();
    await reply.click();
    await expect(b.locator('.toast')).toContainText(T.duel.copied);
    const answer = await lastCopied(b);
    expect(answer).toMatch(/\/#desafio=/);
    expect(answer).not.toBe(challenge);

    // A abre a resposta com o Klick já aberto (o hashchange): a partida inteira, do lado de A.
    await a.goto(answer!);
    await expect(a.getByText(T.duel.replyLabel)).toBeVisible();
    await expect(a.getByRole('heading', { name: 'Bia venceu 3 × 1' })).toBeVisible();
    await expect(a.getByRole('img', { name: /^Placar: Você 1, Bia 3\./ })).toBeVisible();
    await expect.poll(() => a.evaluate(() => location.hash)).toBe('');

    // Em Evolução › Desafios, terminado. Os tempos do desafio ficam fora dos solves.
    await a.getByRole('button', { name: T.duel.seeAll }).click();
    await expect(a.getByRole('heading', { name: T.duel.listTitle })).toBeVisible();
    const item = a.getByRole('button', { name: /^Bia · 3×3, terminado, Bia venceu 3 × 1 · hoje$/ });
    await expect(item).toBeVisible();
    await expect(item).toContainText(T.duel.tagDone);
    expect(await serious(a)).toEqual([]);
    // A partida aberta, ponto a ponto, do lado de A.
    await item.click();
    await expect(a.getByRole('heading', { name: 'Bia venceu 3 × 1' })).toBeVisible();
    await expect(a.getByText(/^Você desafiou · 3×3 · hoje, \d{2}:\d{2}$/)).toBeVisible();
    await expect(a.getByRole('button', { name: T.duel.delete })).toBeVisible();
    expect(await serious(a)).toEqual([]);
    await a.getByRole('button', { name: T.duel.backTo(T.duel.listTitle) }).click();
    await a.getByRole('button', { name: T.duel.backTo(T.tabs.evolucao) }).click();
    await expect(a.getByRole('button', { name: `${T.duel.entryLabel}, 1 terminado` })).toBeVisible();
    await expect(a.getByText(T.evolucao.empty)).toBeVisible();
    expect(await serious(a)).toEqual([]);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

// A revisão final: um embaralhamento montado à mão sem espaços (os de verdade sempre têm) quebra a linha em qualquer ponto, e a tela do
// celular não rola para o lado.
test('um embaralhamento sem espaços, num link montado à mão, cabe na largura do celular', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  try {
    const page = await context.newPage();
    const long = 'R'.repeat(1_000);
    const times = Array.from({ length: 7 }, () => ({ ms: 10_000, penalty: null }));
    const link = await encodeDuelLink({ v: 1, id: 'abcdefgh12345678', event: '333', scrambles: Array.from({ length: 7 }, () => long), a: { name: 'Ana', times } });
    await page.goto(`/#desafio=${link}`);
    const invite = page.getByRole('dialog', { name: 'Ana te desafiou' });
    await invite.getByRole('button', { name: T.duel.accept }).click();
    await expect(page.locator('[data-screen="timer"]')).toHaveAttribute('data-duel', 'solving');
    await expect(page.locator('[data-screen="timer"] [data-scramble]')).toHaveText(long);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  } finally {
    await context.close();
  }
});

import { expect, type BrowserContext, type Page } from '@playwright/test';
import { fresh, noInspection } from '../e2e/helpers';

// O Turnstile falso: o script da Cloudflare não sai da máquina; o widget devolve o token de teste que o Worker local aceita. Por isso o
// widget de verdade (o script de challenges.cloudflare.com, o remove() dentro do callback, o error-callback de uma falha passageira) não é
// testado aqui: ele fica para a conferência no beta, com a site key de verdade.
export async function fakeTurnstile(context: BrowserContext): Promise<void> {
  await context.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "window.turnstile = { render(el, o) { this.o = o; return 'w'; }, execute() { setTimeout(() => this.o.callback('XXXX.DUMMY.TOKEN.XXXX'), 0); }, remove() {} };",
    }),
  );
}

// Um "aparelho": um contexto novo do navegador (outro IndexedDB, outro cookie), já sem o tour e sem inspeção.
export async function device(context: BrowserContext): Promise<Page> {
  await fakeTurnstile(context);
  const page = await context.newPage();
  await fresh(page);
  await noInspection(page);
  return page;
}

// O Worker local tem os limites de verdade (abuse.ts): a rajada de 5 pedidos de código por minuto (OTP_BURST, em janelas de 60 s do
// relógio) e 20 por hora por IP, e todos os aparelhos daqui saem do mesmo IP. Cada rodada gasta poucos pedidos (um por entrada), mas os
// testes seguidos podem juntar mais de 5 num minuto: antes de pedir, o helper espera até haver menos de 5 nos últimos 61 s.
const BURST = 5;
const WINDOW = 61_000;
const sent: number[] = [];
async function paceCodeRequest(page: Page): Promise<void> {
  for (;;) {
    const recent = sent.filter((t) => Date.now() - t < WINDOW);
    if (recent.length < BURST) break;
    await page.waitForTimeout(WINDOW - (Date.now() - recent[0]) + 50);
  }
  sent.push(Date.now());
}

// Entra pela tela de Ajustes, com o código lido da caixa local do Worker. Pula a passkey se ela for oferecida.
export async function signIn(page: Page, email: string): Promise<void> {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Entrar ou criar conta' }).click();
  const dialog = page.locator('dialog.signin');
  await dialog.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await paceCodeRequest(page);
  await dialog.getByRole('button', { name: 'Enviar código' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Código' })).toBeVisible();
  const { code } = (await (await page.request.get(`/api/__e2e/otp?email=${encodeURIComponent(email)}`)).json()) as { code: string };
  await dialog.getByRole('textbox', { name: 'Código' }).fill(code);
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
  const skip = dialog.getByRole('button', { name: 'Agora não' });
  const done = dialog.getByText('Pronto. Seus solves estão na conta.');
  await expect(skip.or(done)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await expect(done.or(dialog.getByText(/Bem-vindo de volta/))).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Fechar' }).click();
}

// Espera a rodada que o clique pede: a rodada lê o IndexedDB antes de passar a "Sincronizando…", e logo depois do clique a linha ainda diz o
// "Sincronizado" da rodada anterior. Por isso, primeiro a resposta do POST /api/sync, depois o texto.
export async function syncNow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ajustes' }).click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).toBeEnabled({ timeout: 30_000 }); // uma rodada em andamento termina antes
  await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/sync' && r.request().method() === 'POST', { timeout: 30_000 }),
    button.click(),
  ]);
  await expect(page.locator('[data-sync-line]')).toHaveText(/Sincronizado/, { timeout: 30_000 });
}

// As linhas de solve do histórico (a tabela vazia tem uma linha só com o aviso, sem a coluna do número).
export async function historyCount(page: Page): Promise<number> {
  await page.getByRole('button', { name: 'Evolução' }).click();
  return page.locator('.hist tbody tr:has(td.num)').count();
}

import { expect, type Locator, type Page, test } from '@playwright/test';
import { CONFIRM_DELAY_MS } from '../../src/ui/confirm';
import { fresh, importHistory } from './helpers';

// O histórico inteiro, de ponta a ponta (a maquete aprovada de 20/10): a lista da Evolução, o detalhe de um solve, a seleção em lote, mover
// e juntar sessões. Os 40 solves de 3×3 entram pela importação (helpers.importHistory): o #1, o mais antigo, é o melhor single (0:12.00); sem
// ele, o melhor é o #12 (0:12.04). As esperas são por texto ou papel visível; a única espera de tempo é a do segundo toque do "Excluir".

async function openEvolucao(page: Page): Promise<Locator> {
  await fresh(page);
  await importHistory(page);
  await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
  const screen = page.locator('[data-screen="evolucao"]');
  await expect(screen.getByRole('heading', { name: 'Solves do período · 40' })).toBeVisible();
  return screen;
}

// O segundo toque de "Excluir" só vale passado o CONFIRM_DELAY_MS do primeiro (o toque duplo não passa pelo "Tem certeza?").
async function confirmDelete(page: Page, button: Locator): Promise<void> {
  await button.click();
  await expect(button).toHaveText('Tem certeza? Clique de novo');
  await page.waitForTimeout(CONFIRM_DELAY_MS + 100);
  await button.click();
}

const undo = (page: Page): Locator => page.locator('.toast').getByRole('button', { name: /^Desfazer/ });

test('abre um solve antigo, dá +2 e põe nota; a lista e os recordes mudam', async ({ page }) => {
  const screen = await openEvolucao(page);
  const board = screen.getByRole('region', { name: 'Recordes do evento' });
  await expect(board.getByRole('button', { name: /^Single: melhor 0:12\.00,/ })).toBeVisible();
  await expect(board.getByRole('button', { name: /^Média de 5: melhor 0:13\.46,/ })).toBeVisible();

  // A linha mais antiga fica no fim da lista: o teclado leva até ela (End) e o Enter abre o detalhe.
  await screen.locator('.hx-row').first().focus();
  await page.keyboard.press('End');
  const oldest = screen.getByRole('row', { name: /^Solve 1: / });
  await expect(oldest).toBeFocused();
  await page.keyboard.press('Enter');
  const detail = page.getByRole('dialog', { name: /Solve #1/ });
  await expect(detail).toBeVisible();
  // O selo é um só, o do maior recorde em que o solve está: o #1 faz parte da melhor média de 5.
  await expect(detail.getByRole('button', { name: /^◆ Faz parte do recorde de média de 5/ })).toBeVisible();

  // +2: o tempo cru aparece.
  await detail.getByRole('button', { name: '+2', exact: true }).click();
  await expect(detail.getByRole('button', { name: '+2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(detail.locator('.hx-raw')).toHaveText('0:12.00 mais 2 s de penalidade');

  // A nota: Enter grava, e o campo guarda o texto.
  const note = detail.getByRole('textbox', { name: 'Nota' });
  await note.fill('primeiro de todos');
  await note.press('Enter');
  await expect(oldest.locator('.hx-dot')).toHaveCount(1); // a linha, atrás da folha, já mostra a nota gravada
  await detail.getByRole('button', { name: 'Fechar' }).click();
  await expect(detail).toBeHidden();

  // A lista: a linha ganhou o +2 e a nota; o quadro: o melhor single passou para o #12, e a melhor média de 5 já não é a da janela dele.
  await expect(oldest.locator('.hx-p2')).toHaveText('+2');
  await expect(oldest.locator('.hx-t')).toContainText('0:14.00');
  await expect(oldest).toHaveAttribute('aria-label', /nota: primeiro de todos/);
  await expect(board.getByRole('button', { name: /^Single: melhor 0:12\.04,/ })).toBeVisible();
  await expect(board.getByRole('button', { name: /^Média de 5: melhor 0:13\.46,/ })).toHaveCount(0);
  await expect(board.getByRole('button', { name: /^Média de 5: melhor / })).toBeVisible();

  // E tudo isso sobrevive a recarregar: foi para o banco.
  await page.reload();
  await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
  await expect(screen.getByRole('region', { name: 'Recordes do evento' }).getByRole('button', { name: /^Single: melhor 0:12\.04,/ })).toBeVisible();
  await screen.locator('.hx-row').first().focus();
  await page.keyboard.press('End');
  await expect(screen.getByRole('row', { name: /^Solve 1: .*nota: primeiro de todos/ })).toBeVisible();
});

test('seleciona três, exclui e desfaz', async ({ page }) => {
  const screen = await openEvolucao(page);
  await screen.getByRole('button', { name: 'Selecionar' }).click();
  const rows = screen.locator('.hx-row');
  for (const i of [0, 1, 2]) await rows.nth(i).click();
  const bar = page.getByRole('region', { name: 'Seleção' });
  await expect(bar).toContainText('3 selecionados');

  await confirmDelete(page, bar.getByRole('button', { name: /^(Excluir|Tem certeza)/ }));
  await expect(screen.getByRole('heading', { name: 'Solves do período · 37' })).toBeVisible();
  await expect(page.locator('.toast')).toContainText('3 solves excluídos');
  // A seleção terminou com o lote: sem barra, e o botão do topo volta a dizer Selecionar.
  await expect(bar).toHaveCount(0);
  await expect(screen.getByRole('button', { name: 'Selecionar' })).toBeVisible();

  await undo(page).click();
  await expect(screen.getByRole('heading', { name: 'Solves do período · 40' })).toBeVisible();
  await expect(page.locator('.toast')).toBeHidden();
});

test('move um solve para outra sessão e desfaz', async ({ page }) => {
  const screen = await openEvolucao(page);
  const session = screen.getByRole('combobox', { name: 'Sessão' });
  await session.selectOption({ label: 'Treino de cruz' });
  await expect(screen.getByRole('heading', { name: 'Solves do período · 10' })).toBeVisible();

  // O solve mais novo (o #10 desta sessão) vai para a "Principal" pelo detalhe.
  await screen.locator('.hx-row').first().click();
  await page.getByRole('dialog', { name: /Solve #10/ }).getByRole('button', { name: 'Mover para outra sessão' }).click();
  const sheet = page.getByRole('dialog', { name: 'Mover o solve #10' });
  await expect(sheet).toBeVisible();
  // Só as sessões de 3×3, com a contagem; a de onde ele vem fica marcada e parada.
  await expect(sheet.getByRole('button', { name: /^Treino de cruz.*está aqui/ })).toBeDisabled();
  await sheet.getByRole('button', { name: /^Principal.*30 solves/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('.toast')).toContainText('Solve movido para Principal');
  await expect(screen.getByRole('heading', { name: 'Solves do período · 9' })).toBeVisible();

  await undo(page).click();
  await expect(screen.getByRole('heading', { name: 'Solves do período · 10' })).toBeVisible();
  await session.selectOption({ label: 'Principal' });
  await expect(screen.getByRole('heading', { name: 'Solves do período · 30' })).toBeVisible();
});

test('junta duas sessões', async ({ page }) => {
  const screen = await openEvolucao(page);
  await page.getByRole('button', { name: /Sessão 1/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Sessões' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Juntar Treino de cruz com outra sessão' }).click();
  const choice = dialog.getByRole('combobox', { name: /^Juntar “Treino de cruz” \(10 solves\) com$/ });
  await choice.selectOption({ label: 'Principal · 30 solves' });
  await expect(dialog.getByText('Os 10 solves passam para “Principal”, e “Treino de cruz” vai para a lixeira.')).toBeVisible();
  await dialog.getByRole('button', { name: /^Juntar “Treino de cruz”/ }).click();
  await expect(page.locator('.toast')).toContainText('Sessões juntadas: 10 solves passaram para Principal');
  await expect(dialog.getByRole('button', { name: /^Principal/ })).toContainText('40 solves');
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialog).toBeHidden();

  // Na Evolução: a sessão de origem saiu do filtro, e a "Principal" ficou com os 40.
  const session = screen.getByRole('combobox', { name: 'Sessão' });
  await expect(session.getByRole('option', { name: 'Treino de cruz' })).toHaveCount(0);
  await session.selectOption({ label: 'Principal' });
  await expect(screen.getByRole('heading', { name: 'Solves do período · 40' })).toBeVisible();

  // A sessão de origem foi para a lixeira (Ajustes → Ver lixeira), de onde dá para restaurá-la.
  const openTrash = async () => {
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: /^Ver lixeira/ }).click();
    const trash = page.getByRole('dialog', { name: 'Lixeira' });
    await expect(trash).toBeVisible();
    await expect(trash.getByRole('button', { name: 'Restaurar sessão Treino de cruz' })).toBeVisible();
    await trash.getByRole('button', { name: 'Fechar' }).click();
    await expect(trash).toBeHidden();
  };
  await openTrash();

  // E a junção sobrevive a recarregar: a origem continua na lixeira, fora do filtro, e a Principal segue com os 40.
  await page.reload();
  await openTrash();
  await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
  const again = screen.getByRole('combobox', { name: 'Sessão' });
  await expect(again.getByRole('option', { name: 'Treino de cruz' })).toHaveCount(0);
  await again.selectOption({ label: 'Principal' });
  await expect(screen.getByRole('heading', { name: 'Solves do período · 40' })).toBeVisible();
});

test('no celular (390 px) a lista e as folhas cabem sem rolar de lado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const screen = await openEvolucao(page);
  const fits = async (where: string) => {
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll, `${where}: scrollWidth ${scroll} > innerWidth ${inner}`).toBeLessThanOrEqual(inner);
  };
  // As folhas e o quadro também não passam da largura da tela.
  const inside = async (sheet: Locator) => {
    const box = (await sheet.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390.5);
    expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  };

  await fits('lista');
  // O quadro de recordes também: rola até ele antes de medir.
  await screen.getByRole('region', { name: 'Recordes do evento' }).scrollIntoViewIfNeeded();
  await fits('quadro de recordes');
  await page.evaluate(() => window.scrollTo(0, 0));

  // O detalhe de um solve com +2 e nota (as linhas mais largas da folha).
  await screen.locator('.hx-row').first().click();
  const detail = page.getByRole('dialog', { name: /Solve #40/ });
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: '+2', exact: true }).click();
  await expect(detail.locator('.hx-raw')).toBeVisible();
  // A nota mais longa que o campo aceita (80 caracteres, sem espaços para quebrar): o pior caso de largura.
  const note = detail.getByRole('textbox', { name: 'Nota' });
  await note.fill('N'.repeat(80));
  await note.press('Enter');
  await expect(screen.getByRole('row', { name: /^Solve 40: .*nota: N{80}/ })).toHaveCount(1);
  await fits('detalhe');
  await inside(detail);

  // A folha de mover, aberta pelo detalhe.
  await detail.getByRole('button', { name: 'Mover para outra sessão' }).click();
  const move = page.getByRole('dialog', { name: 'Mover o solve #40' });
  await expect(move).toBeVisible();
  await fits('mover');
  await inside(move);
  await move.getByRole('button', { name: 'Cancelar' }).click();
  await expect(move).toBeHidden();

  // A seleção com a barra do lote.
  await screen.getByRole('button', { name: 'Selecionar' }).click();
  await screen.locator('.hx-row').nth(1).click();
  await expect(page.getByRole('region', { name: 'Seleção' })).toContainText('1 selecionado');
  await fits('seleção');
});

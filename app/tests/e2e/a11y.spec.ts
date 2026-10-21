import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { T } from '../../src/strings';
import { fresh, importHistory, noInspection, setTimerSetting } from './helpers';

const TABS = [
  { tab: 'Timer', screen: 'timer' },
  { tab: 'Evolução', screen: 'evolucao' },
  { tab: 'Trilha', screen: 'trilha' },
  { tab: 'Centro', screen: 'companion' },
  { tab: 'Ajustes', screen: 'ajustes' },
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test(`sem violações sérias de acessibilidade no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    for (const { tab, screen } of TABS) {
      const button = page.getByRole('button', { name: tab, exact: true }).first();
      await button.click();
      // A análise só vale com a tela da aba montada e visível (o Evolução, a Trilha, o Centro e o Ajustes montam ao abrir).
      await expect(button).toHaveAttribute('aria-current', 'page');
      await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
      const r = await new AxeBuilder({ page }).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${tab}: ${v.id}`)).toEqual([]);
    }
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`a lista da Evolução, o detalhe, a seleção e a folha de mover, sem violações sérias no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await importHistory(page);
    await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
    const screen = page.locator('[data-screen="evolucao"]');
    await expect(screen.getByRole('heading', { name: 'Solves do período · 40' })).toBeVisible();
    const serious = async (where: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`);
    };
    expect(await serious('lista')).toEqual([]);
    // O detalhe de um solve: a linha abre a folha; com um +2, o seletor marcado e o tempo cru.
    await screen.locator('.hx-row').first().click();
    const detail = page.getByRole('dialog', { name: /Solve #40/ });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: '+2', exact: true }).click();
    await expect(detail.getByRole('button', { name: '+2', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.locator('.hx-raw')).toBeVisible();
    expect(await serious('detalhe')).toEqual([]);
    await detail.getByRole('button', { name: 'Fechar' }).click();
    await expect(detail).toBeHidden();
    // A seleção: três linhas marcadas e a barra do lote.
    await screen.getByRole('button', { name: 'Selecionar' }).click();
    const rows = screen.locator('.hx-row');
    for (const i of [0, 2, 3]) await rows.nth(i).click();
    await expect(page.getByRole('region', { name: 'Seleção' })).toContainText('3 selecionados');
    expect(await serious('seleção')).toEqual([]);
    // A folha de mover.
    await page.getByRole('button', { name: 'Mover para…' }).click();
    await expect(page.getByRole('dialog', { name: 'Mover 3 solves' })).toBeVisible();
    expect(await serious('mover')).toEqual([]);
  });
}

// O quadro de recordes e a folha do recorde (a maquete aprovada do histórico, 1a e 5), nos dois temas: o quadro com as linhas-botão, a folha
// aberta pelo quadro (ao12: os tempos com o melhor e o pior entre parênteses) e pelo selo do detalhe, e o "Ver na lista".
for (const scheme of ['light', 'dark'] as const) {
  test(`o quadro de recordes e a folha do recorde, sem violações sérias no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await importHistory(page);
    await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
    const screen = page.locator('[data-screen="evolucao"]');
    const board = screen.getByRole('region', { name: 'Recordes do evento' });
    await expect(board).toBeVisible();
    const serious = async (where: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`);
    };
    // Single, ao5 e ao12 têm solves nos 40 do arquivo; ao50 em diante, não.
    await expect(board.getByRole('button')).toHaveCount(3);
    await expect(board.getByRole('button', { name: /^Média de 12: melhor \d:\d\d\.\d\d, atual .*\. Ver os solves do recorde$/ })).toBeVisible();
    expect(await serious('quadro')).toEqual([]);
    // A folha do recorde de ao12: o título com o valor, os 12 tempos com dois entre parênteses e a regra.
    await board.getByRole('button', { name: /^Média de 12:/ }).click();
    const sheet = page.getByRole('dialog', { name: /^Melhor média de 12 · / });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading')).toContainText('Melhor média de 12');
    await expect(sheet.locator('ol.dz-times li')).toHaveCount(12);
    await expect(sheet.locator('li.hx-out')).toHaveCount(2);
    expect(await serious('folha do recorde')).toEqual([]);
    // "Ver na lista" fecha a folha e leva o foco a uma linha da lista, com as 12 da janela marcadas.
    await sheet.getByRole('button', { name: 'Ver na lista' }).click();
    await expect(sheet).toBeHidden();
    await expect(screen.locator('.hx-row[data-flash]')).toHaveCount(12);
    await expect(screen.locator('.hx-row:focus')).toHaveCount(1);
    expect(await serious('lista marcada')).toEqual([]);
    // O single: a folha do melhor tempo, aberta pelo quadro.
    await board.getByRole('button', { name: /^Single:/ }).click();
    await expect(page.getByRole('dialog', { name: /^Recorde de single · / })).toBeVisible();
    expect(await serious('folha do single')).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  });
}

// Juntar sessões (a maquete aprovada do histórico, 6a e 6b), nos dois temas: o passo na própria linha da sessão, sem violações sérias, e
// confirmar leva os solves para a sessão de destino, com o aviso.
for (const scheme of ['light', 'dark'] as const) {
  test(`juntar sessões no diálogo de Sessões, sem violações sérias no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await importHistory(page);
    await page.getByRole('button', { name: /Sessão 1/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sessões' });
    await expect(dialog).toBeVisible();
    const serious = async (where: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`);
    };
    expect(await serious('sessões')).toEqual([]);
    await dialog.getByRole('button', { name: 'Juntar Treino de cruz com outra sessão' }).click();
    const choice = dialog.getByRole('combobox', { name: /^Juntar “Treino de cruz” \(10 solves\) com$/ });
    await expect(choice).toBeFocused();
    await expect(dialog.getByText('Os 10 solves passam para “Sessão 1”, e “Treino de cruz” vai para a lixeira.')).toBeVisible();
    await choice.selectOption({ label: 'Principal · 30 solves' });
    await expect(dialog.getByText('Os 10 solves passam para “Principal”, e “Treino de cruz” vai para a lixeira.')).toBeVisible();
    expect(await serious('juntar')).toEqual([]);
    await dialog.getByRole('button', { name: /^Juntar “Treino de cruz”/ }).click();
    await expect(dialog.getByRole('button', { name: /^Treino de cruz/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^Principal/ })).toContainText('40 solves');
    await expect(dialog.getByRole('button', { name: /^Principal/ })).toBeFocused();
    await expect(page.locator('.toast')).toContainText('Sessões juntadas: 10 solves passaram para Principal');
  });
}

// O modo Digitar (a maquete aprovada, estados 2a–2f, 3a, 3b e 8): o campo com rótulo, o erro, o DNF digitado com o motivo e o detalhe dele.
for (const scheme of ['light', 'dark'] as const) {
  test(`digitar o tempo, sem violações sérias no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await setTimerSetting(page, T.ajustes.entry, T.ajustes.entryOptions[1][1]);
    await expect(page.getByLabel(T.timer.typedLabel)).toBeVisible();
    const serious = async (where: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`);
    };
    const field = page.getByLabel(T.timer.typedLabel);
    await expect(field).toHaveAttribute('inputmode', 'decimal');
    expect(await serious('vazio')).toEqual([]);
    await field.fill('12.3.4');
    await field.press('Enter');
    await expect(page.getByText(T.timer.typedError)).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(await serious('erro')).toEqual([]);
    await field.fill('1:02:03.45');
    await field.press('Enter');
    await expect(page.getByText(T.timer.typedTooLong)).toBeVisible();
    await field.fill('1234');
    await field.press('Enter');
    await expect(page.locator('[data-actions]')).toBeVisible();
    await expect(page.locator('.tc-last')).toHaveText('0:12.34');
    expect(await serious('salvo')).toEqual([]);
    await field.fill('dnf');
    await field.press('Enter');
    await expect(page.locator('.tc-last')).toHaveText('DNF');
    const why = page.getByText(T.timer.typedDnfLocked);
    await expect(why).toBeVisible();
    await expect(page.locator('[data-act="plus2"]')).toHaveAttribute('aria-disabled', 'true');
    expect(await serious('DNF digitado')).toEqual([]);
    // O detalhe do DNF digitado, na Evolução.
    await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
    await page.locator('.hx-row', { hasText: 'DNF' }).first().click();
    const sheet = page.getByRole('dialog', { name: /^Solve #/ });
    await expect(sheet.getByText(T.timer.typedDnfLocked)).toBeVisible();
    await expect(sheet.getByRole('button', { name: T.historico.penaltyOk })).toHaveAttribute('aria-disabled', 'true');
    expect(await serious('detalhe do DNF digitado')).toEqual([]);
  });
}

// As fases (a maquete aprovada, estados 6, 7a–7b e 8d): a seção do detalhe do solve e o quadro da Evolução, nos dois temas. Os solves com fases
// são gravados direto no banco (o timer com fases é coberto na unit e nas capturas).
for (const scheme of ['light', 'dark'] as const) {
  test(`a seção Fases do detalhe e o quadro Fases da Evolução, sem violações sérias no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('klick');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(['solves', 'profile'], 'readwrite');
            const get = tx.objectStore('profile').get('current');
            get.onsuccess = () => {
              const end = Date.now() - 300_000;
              for (let i = 0; i < 12; i++) {
                const phases = [1_800 + i * 10, 6_100, 2_200, 3_200];
                const at = end - (12 - i) * 300_000;
                tx.objectStore('solves').put({ id: `ph${i}`, sessionId: get.result.currentSessionId, event: '333', ms: phases.reduce((a, b) => a + b, 0), penalty: null, at, scramble: "R U2 F L R' D2", note: '', createdAt: at, updatedAt: at, deletedAt: null, phases });
              }
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
    const screen = page.locator('[data-screen="evolucao"]');
    const serious = async (where: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`);
    };
    const board = screen.getByRole('region', { name: T.fases.boardTitle });
    await expect(board).toBeVisible();
    await expect(board.getByRole('list', { name: T.fases.boardBar }).getByRole('listitem')).toHaveCount(4);
    await expect(board.getByRole('listitem').nth(1)).toContainText('F2L, 6.10 s');
    expect(await serious('quadro Fases')).toEqual([]);
    await page.locator('.hx-row').first().click();
    const sheet = page.getByRole('dialog', { name: /^Solve #/ });
    await expect(sheet.getByRole('list', { name: T.fases.bar }).getByRole('listitem')).toHaveCount(4);
    expect(await serious('detalhe com fases')).toEqual([]);
  });
}

// O Timer com os ajustes novos (a maquete aprovada, estados 1a–1b, 4c e 5a): as linhas novas do Ajustes (a dica de 4 fases e o "Som do aviso"),
// o solve correndo com as marcas das fases e o "Resolvendo", e o resultado com a barra das fases. Os toques de fase pedem mais de 300 ms
// entre si: a espera é real.
for (const scheme of ['light', 'dark'] as const) {
  test(`as linhas novas do Ajustes, o solve com marcas e o resultado com fases, sem violações sérias no tema ${scheme}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'teclado só no desktop');
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    const serious = async (where: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`);
    };
    await noInspection(page);
    await setTimerSetting(page, T.ajustes.phases, T.ajustes.phasesOptions[3][1]);
    await setTimerSetting(page, T.ajustes.liveTime, T.ajustes.liveTimeOptions[2][1]);
    await page.getByRole('button', { name: 'Ajustes', exact: true }).first().click();
    await page.getByRole('group', { name: T.ajustes.inspSound, exact: true }).getByRole('button', { name: T.ajustes.inspSoundOptions[1][1], exact: true }).click();
    expect(await serious('Ajustes com as linhas novas')).toEqual([]);
    await page.getByRole('button', { name: 'Timer', exact: true }).first().click();
    await page.keyboard.down('Space');
    await page.waitForTimeout(400);
    await page.keyboard.up('Space');
    await expect(page.locator('[data-time]')).toHaveText(T.timer.solving);
    await expect(page.locator('.tc-marks i')).toHaveCount(4);
    // Correndo, o resto da tela esmaece de propósito (o contraste baixo é do desenho, como no solve de sempre): só o "Resolvendo" e as marcas,
    // que ficam à vista, entram na análise.
    const running = await new AxeBuilder({ page }).include('[data-time]').include('.tc-marks').analyze();
    expect(running.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `solve com marcas: ${v.id}`)).toEqual([]);
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(350);
      await page.keyboard.press('Space');
    }
    await expect(page.locator('[data-actions]')).toBeVisible();
    await expect(page.getByRole('list', { name: T.fases.bar }).getByRole('listitem')).toHaveCount(4);
    await page.waitForTimeout(900); // a tela volta do esmaecido do solve: o axe só mede as cores depois da transição
    expect(await serious('resultado com fases')).toEqual([]);
  });
}

// As estatísticas que ensinam (a maquete aprovada de 21/10), nos dois temas: a Evolução com Semanas, Metas (uma em andamento e uma já
// alcançada) e o ano; e a folha da meta, nova e com o tempo torto. As metas nascem pela folha, como para quem usa.
for (const scheme of ['light', 'dark'] as const) {
  test(`a Evolução com Semanas, Metas e o ano, e a folha da meta nova e com o tempo torto, sem violações sérias no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    await importHistory(page);
    await page.getByRole('button', { name: 'Evolução', exact: true }).first().click();
    const screen = page.locator('[data-screen="evolucao"]');
    const board = screen.getByRole('region', { name: T.metas.title });
    const serious = async (where: string) => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where}: ${v.id}`);
    };
    // Duas metas: "abaixo de 10" (o melhor do arquivo é 0:12.00: em andamento) e "abaixo de 13" (já nasce alcançada).
    for (const [i, target] of ['10', '13'].entries()) {
      await board.getByRole('button', { name: i === 0 ? T.metas.create : T.metas.new }).click();
      const sheet = page.getByRole('dialog', { name: T.metas.newTitle });
      await sheet.getByLabel(T.metas.targetLabel).fill(target);
      await sheet.getByRole('button', { name: T.metas.save }).click();
      await expect(sheet).toBeHidden();
    }
    await expect(board.getByRole('button', { name: /^Single abaixo de 10 s, / })).toContainText('faltam 2.00 s');
    await expect(board.getByRole('button', { name: /^Single abaixo de 13 s, / })).toContainText('✓ alcançada em');
    await expect(screen.getByRole('region', { name: T.semanas.title })).toBeVisible();
    await expect(screen.getByRole('region', { name: T.constancia.title })).toBeVisible();
    expect(await serious('Evolução com Semanas, Metas e o ano')).toEqual([]);
    // A folha nova, depois com o tempo torto (o erro só aparece ao salvar).
    await board.getByRole('button', { name: T.metas.new }).click();
    const sheet = page.getByRole('dialog', { name: T.metas.newTitle });
    await expect(sheet).toBeVisible();
    expect(await serious('folha nova')).toEqual([]);
    await sheet.getByLabel(T.metas.targetLabel).fill('12.3.4');
    await sheet.getByRole('button', { name: T.metas.save }).click();
    await expect(sheet.getByText(T.metas.bad)).toBeVisible();
    await expect(sheet.getByLabel(T.metas.targetLabel)).toHaveAttribute('aria-invalid', 'true');
    expect(await serious('folha com o tempo torto')).toEqual([]);
    await sheet.getByRole('button', { name: T.metas.cancel }).click();
    await expect(sheet).toBeHidden();
    // Editar uma meta e armar o "Excluir" (a folha de editar, com o aviso de confirmação).
    await board.getByRole('button', { name: /^Single abaixo de 10 s, / }).click();
    const edit = page.getByRole('dialog', { name: T.metas.editTitle });
    await edit.getByRole('button', { name: T.metas.remove }).click();
    await expect(edit.getByRole('button', { name: T.metas.confirmAgain })).toBeVisible();
    expect(await serious('folha de editar armada')).toEqual([]);
  });
}

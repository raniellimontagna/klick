import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fresh } from './helpers';

const TABS = [
  { tab: 'Timer', screen: 'timer' },
  { tab: 'Evolução', screen: 'evolucao' },
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
      // A análise só vale com a tela da aba montada e visível (o Evolução, o Centro e o Ajustes montam ao abrir).
      await expect(button).toHaveAttribute('aria-current', 'page');
      await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
      const r = await new AxeBuilder({ page }).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${tab}: ${v.id}`)).toEqual([]);
    }
  });
}

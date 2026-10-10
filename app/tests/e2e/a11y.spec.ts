import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fresh } from './helpers';

for (const scheme of ['light', 'dark'] as const) {
  test(`sem violações sérias de acessibilidade no tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    for (const tab of ['Timer', 'Evolução', 'Centro', 'Ajustes']) {
      await page.getByRole('button', { name: tab, exact: true }).first().click();
      const r = await new AxeBuilder({ page }).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${tab}: ${v.id}`)).toEqual([]);
    }
  });
}

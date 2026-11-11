import { expect, test } from '@playwright/test';
import { mockBridge, openSeeded } from './helpers';

// A sweaty double tap on ✓ must never undo the set it just logged.
for (const gap of [120, 250]) {
  test(`double tap on ✓ ${gap} ms apart keeps the set done and the rest running`, async ({ page }) => {
    await mockBridge(page);
    await openSeeded(page);
    await page.getByRole('button', { name: 'Start workout' }).click();
    const card = page.locator('article[aria-label="Converging chest press"]');
    const chk = card.getByTestId('set-row').first().locator('button.chk');
    await chk.tap();
    await page.waitForTimeout(gap);
    await chk.tap();
    await page.waitForTimeout(600);
    await expect(page.getByTestId('meter-label')).toContainText('1 of 16 sets');
    await expect(page.getByText(/Set 1 deleted/)).toHaveCount(0);
    await expect(page.getByTestId('rest-dock')).toHaveClass(/open/);
    await expect(chk).toHaveAttribute('aria-pressed', 'true');
  });
}

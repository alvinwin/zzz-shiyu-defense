import { expect, test } from '@playwright/test';

test('renders the current cycle in encounter-first order', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cycle-status')).toContainText('cycle data for 08/07 - 08/21 // verified 08/14');
  await expect(page.locator('.frontier')).toHaveCount(5);
  await expect(page.locator('.buff')).toHaveCount(3);
  await expect(page.locator('main section').first()).toHaveClass(/cycle-strip/);
  const [frontiers, buffs] = await Promise.all([
    page.locator('.frontier-list').boundingBox(),
    page.locator('.buff-section').boundingBox(),
  ]);
  expect(buffs.y).toBeGreaterThan(frontiers.y + frontiers.height);
  await expect(page.locator('.feedback')).toHaveCSS('position', 'fixed');
});

test('shows complete compounds and calculated HP without overflow', async ({ page }) => {
  await page.goto('/');
  await page.locator('.frontier').last().locator('summary').click();
  await expect(page.getByText('Lightfoot Rover MK II')).toBeVisible();
  await expect(page.getByText(/4.56M calculated HP/)).toBeVisible();
  await expect(page.locator('.term', { hasText: 'CRIT DMG' })).toHaveText('CRIT DMG');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('uses safe text rendering for all source content', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#fatal-error')).toBeHidden();
  await expect(page.locator('script:not([src])')).toHaveCount(0);
  await expect(page.locator('[onclick], [onerror], [onload]')).toHaveCount(0);
});

test('provides an accessible Deadly Assault mode switch on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const modeSwitch = page.getByRole('link', { name: 'View Deadly Assault brief', exact: true });

  await expect(modeSwitch).toBeVisible();
  await expect(modeSwitch).toHaveAttribute('href', 'https://alvinwin.github.io/zzz-deadly-assault/');
  expect(await modeSwitch.getAttribute('target')).toBeNull();

  await page.keyboard.press('Tab');
  await expect(modeSwitch).toBeFocused();
  const focusStyle = await modeSwitch.evaluate((element) => getComputedStyle(element));
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

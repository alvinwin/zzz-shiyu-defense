import { expect, test } from '@playwright/test';

test('renders the current cycle in encounter-first order', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cycle-status')).toContainText('cycle data for 08/07 - 08/21 // verified 08/14');
  await expect(page.locator('.frontier')).toHaveCount(5);
  await expect(page.locator('.buff')).toHaveCount(3);
  await expect(page.locator('.resource-ticker')).toContainText('Current cycle');
  const tickerFollowsHero = await page.evaluate(() => Boolean(
    document.querySelector('.hero').compareDocumentPosition(document.querySelector('.resource-ticker'))
      & Node.DOCUMENT_POSITION_FOLLOWING,
  ));
  expect(tickerFollowsHero).toBe(true);
  const [frontiers, buffs] = await Promise.all([
    page.locator('.frontier-list').boundingBox(),
    page.locator('.buff-section').boundingBox(),
  ]);
  expect(buffs.y).toBeGreaterThan(frontiers.y + frontiers.height);
  await expect(page.locator('.feedback')).toHaveCSS('position', 'static');
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
  const modeSwitch = page.getByRole('link', { name: 'View Deadly Assault', exact: true });

  await expect(modeSwitch).toBeVisible();
  await expect(modeSwitch).toHaveAttribute('href', 'https://da.sixthstreet.wiki/');
  expect(await modeSwitch.getAttribute('target')).toBeNull();

  await modeSwitch.focus();
  await expect(modeSwitch).toBeFocused();
  const focusStyle = await modeSwitch.evaluate((element) => getComputedStyle(element));
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('links the shared brand back to the homepage', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'sixthstreet.wiki home' })).toHaveAttribute('href', 'https://sixthstreet.wiki/');
  await expect(page.getByRole('link', { name: 'Source and license' })).toHaveAttribute('href', 'https://github.com/alvinwin/zzz-shiyu-defense');
});

test('uses direct player-facing labels without editorial slogans', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Current frontiers', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current buffs', exact: true })).toBeVisible();
  await expect(page.getByText('Take the useful note with you.')).toHaveCount(0);
});

test('connects supported combat terms to their field notes', async ({ page }) => {
  await page.goto('/');
  const anomaly = page.getByRole('link', { name: 'Attribute Anomaly DMG: read the Attribute Anomaly field note' });

  await expect(anomaly).toHaveCount(1);
  await expect(anomaly).toHaveAttribute('href', 'https://sixthstreet.wiki/terms/attribute-anomaly/');
});

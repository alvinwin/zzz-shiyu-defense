import { expect, test } from '@playwright/test';

test('renders the current cycle in encounter-first order', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cycle-status .cycle-dates')).toHaveText('08/07–08/21');
  await expect(page.locator('#cycle-status .verified')).toHaveText('Verified Aug 14');
  await expect(page.locator('#cycle-status .remaining')).toHaveText(/remaining|Refresh pending/);
  await expect(page.locator('#cycle-status-title')).toBeHidden();
  await expect(page.locator('#cycle-refresh-note')).toBeHidden();
  await expect(page.locator('.frontier')).toHaveCount(5);
  await expect(page.locator('.buff')).toHaveCount(3);
  await expect(page.locator('.frontier').nth(4).locator('.room-buff')).toHaveCount(3);
  await expect(page.locator('.frontier').nth(4).locator('.room-buff-label')).toHaveText([
    'Frontier EffectTurbulent Resonance',
    'Frontier EffectFinal Concerto',
    'Frontier EffectRime and Thunder Breach',
  ]);
  await expect(page.locator('.frontier').nth(4).locator('.room-buff-label strong')).toHaveText([
    'Turbulent Resonance',
    'Final Concerto',
    'Rime and Thunder Breach',
  ]);
  await expect(page.locator('.frontier').nth(4).locator('.room-buff').first()).toHaveAttribute(
    'aria-label',
    'Frontier Effect for Room 1: Turbulent Resonance',
  );
  await expect(page.locator('.frontier').nth(3).locator('.room-buff')).toHaveCount(0);
  await expect(page.locator('#cycle-status-title')).toHaveText('Current cycle');
  await expect(page.locator('.ticker-caption')).toHaveCount(0);
  await expect(page.locator('.hero .eyebrow')).toHaveText('Shiyu Defense');
  await expect(page.getByRole('heading', { level: 1, name: 'Operations briefing' })).toBeVisible();
  await expect(page.locator('.brand-mark')).toHaveCSS('background-color', 'rgb(169, 55, 45)');
  await expect(page.locator('.resource-ticker')).toHaveCSS('background-color', 'rgb(226, 238, 232)');
  const compact = page.viewportSize().width <= 760;
  await expect(page.locator('.masthead')).toHaveCSS('min-height', compact ? '107px' : '70px');
  await expect(page.locator('.hero')).toHaveCSS('min-height', compact ? '420px' : '430px');
  await expect(page.locator('.hero-copy')).toHaveCSS('min-height', compact ? '48.64px' : '54.72px');
  const tickerHeight = await page.locator('.ticker-inner').evaluate((element) => element.getBoundingClientRect().height);
  expect(tickerHeight).toBeGreaterThanOrEqual(54);
  expect(tickerHeight).toBeLessThanOrEqual(56);
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
  await expect(page.locator('.tag .element-icon')).toHaveCount(30);
  expect(await page.locator('.tag').evaluateAll((tags) => tags.every((tag) => {
    const icon = tag.querySelector('.element-icon');
    return !icon || (icon.getAttribute('aria-hidden') === 'true' && icon.getAttribute('alt') === '');
  }))).toBe(true);
  await expect(page.locator('.disclaimer')).toContainText('Attribute icon artwork © HoYoverse.');
});

test('shows existing active-state copy only while the cycle is active', async ({ page }) => {
  await page.route('**/data/current.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.version.endsAt = new Date(Date.now() + 3_600_000).toISOString();
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
  await expect(page.locator('#cycle-status-title')).toBeVisible();
  await expect(page.locator('#cycle-status-title')).toHaveText('Current cycle');
  await expect(page.locator('#cycle-refresh-note')).toBeVisible();
  await expect(page.locator('#cycle-refresh-note')).toHaveText('When this cycle ends, the page checks for the next verified cycle.');
});

test('renders room buffs by explicit identity when the buff list is reordered', async ({ page }) => {
  await page.route('**/data/current.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.buffs.reverse();
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
  await expect(page.locator('.frontier').nth(4).locator('.room-buff-label strong')).toHaveText([
    'Turbulent Resonance',
    'Final Concerto',
    'Rime and Thunder Breach',
  ]);
});

test('shows complete compounds and calculated HP without overflow', async ({ page }) => {
  await page.goto('/');
  await page.locator('.frontier').last().locator('summary').click();
  await expect(page.getByText('Lightfoot Rover MK II')).toBeVisible();
  await expect(page.getByText(/4.56M calculated HP/)).toBeVisible();
  await expect(page.locator('.room-buff .term', { hasText: 'CRIT DMG' })).toHaveText('CRIT DMG');
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
  await expect(page.locator('.masthead')).toHaveCSS('min-height', '107px');
  await expect(page.locator('.hero')).toHaveCSS('min-height', '420px');
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

  await expect(page.locator('.hero-copy')).toHaveText('Frontiers, room affinities, enemy waves, and buffs for this cycle.');
  await expect(page.getByRole('heading', { name: 'Frontier reports', exact: true })).toBeVisible();
  await expect(page.locator('.section-note')).toHaveText('Start with the frontier, then scan the room affinities and waves.');
  await expect(page.getByRole('heading', { name: 'Current buffs', exact: true })).toBeVisible();
  await expect(page.getByText('Take the useful note with you.')).toHaveCount(0);
});

test('connects supported combat terms to their field notes', async ({ page }) => {
  await page.goto('/');
  const anomaly = page.getByRole('link', { name: 'Attribute Anomaly DMG: read the Attribute Anomaly field note' });

  await expect(anomaly).toHaveCount(1);
  await expect(anomaly).toHaveAttribute('href', 'https://sixthstreet.wiki/terms/attribute-anomaly/');
});

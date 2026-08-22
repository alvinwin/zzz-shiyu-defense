import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const current = JSON.parse(fs.readFileSync(new URL('../../data/current.json', import.meta.url), 'utf8'));
const buffsById = new Map(current.buffs.map((buff) => [buff.id, buff]));
const fifthFrontierBuffNames = current.nodes[4].sides.map((side) => buffsById.get(side.roomBuffId).name);
const affinityIconCount = current.nodes.reduce((total, frontier) => total + frontier.sides.reduce(
  (sideTotal, side) => sideTotal + side.weaknesses.length + side.resistances.length,
  0,
), 0);

function displayDate(iso) {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

function verifiedDate(iso) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

async function routeCurrentData(page, mutate) {
  await page.route('**/data/current.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    mutate(data);
    await route.fulfill({ response, json: data });
  });
}

test('renders the current cycle in encounter-first order', async ({ page }) => {
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await routeCurrentData(page, (data) => { data.version.endsAt = '2000-01-01T00:00:00.000Z'; });
  await page.goto('/');
  await expect(page.locator('#cycle-status .cycle-dates')).toHaveText(`${displayDate(current.version.startDate)}–${displayDate(current.version.endDate)}`);
  await expect(page.locator('#cycle-status .verified')).toHaveText(`Verified ${verifiedDate(current.provenance.fetchedDate)}`);
  await expect(page.locator('#cycle-status .remaining')).toHaveText(/remaining|Refresh pending/);
  await expect(page.locator('#cycle-status-title')).toBeHidden();
  await expect(page.locator('#cycle-refresh-note')).toBeHidden();
  await expect(page.locator('.frontier')).toHaveCount(5);
  await expect(page.locator('.buff')).toHaveCount(3);
  await expect(page.locator('.frontier').nth(4).locator('.room-buff')).toHaveCount(3);
  await expect(page.locator('.frontier').nth(4).locator('.room-buff-label')).toHaveText(fifthFrontierBuffNames.map((name) => `Frontier Effect${name}`));
  await expect(page.locator('.frontier').nth(4).locator('.room-buff-label strong')).toHaveText(fifthFrontierBuffNames);
  await expect(page.locator('.frontier').nth(4).locator('.room-buff').first()).toHaveAttribute(
    'aria-label',
    `Frontier Effect for Room 1: ${fifthFrontierBuffNames[0]}`,
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
  await expect(page.locator('.tag .element-icon')).toHaveCount(affinityIconCount);
  expect(await page.locator('.tag').evaluateAll((tags) => tags.every((tag) => {
    const icon = tag.querySelector('.element-icon');
    return !icon || (icon.getAttribute('aria-hidden') === 'true' && icon.getAttribute('alt') === '');
  }))).toBe(true);
  await expect(page.locator('.disclaimer')).toContainText('Attribute icon artwork © HoYoverse.');
  expect(runtimeErrors).toEqual([]);
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
    ...fifthFrontierBuffNames,
  ]);
});

test('shows complete compounds and calculated HP without overflow', async ({ page }) => {
  await routeCurrentData(page, (data) => {
    const enemy = data.nodes[4].sides[2].waves[0].enemies[0];
    Object.assign(enemy, { name: 'Compound: Test Target', count: 1, hpEach: 4_556_701, hpGroup: 4_556_701 });
    const roomBuff = data.buffs.find((buff) => buff.id === data.nodes[4].sides[2].roomBuffId);
    roomBuff.description = 'CRIT DMG increases.';
    roomBuff.emphasis = [{ text: 'CRIT DMG', emphasis: 'bold' }, { text: ' increases.', emphasis: 'plain' }];
  });
  await page.goto('/');
  await page.locator('.frontier').last().locator('summary').click();
  await expect(page.getByText('Compound: Test Target')).toBeVisible();
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
  await routeCurrentData(page, (data) => {
    data.buffs[0].description = 'Attribute Anomaly DMG increases.';
    data.buffs[0].emphasis = [{ text: 'Attribute Anomaly DMG', emphasis: 'plain' }, { text: ' increases.', emphasis: 'plain' }];
  });
  await page.goto('/');
  const anomaly = page.getByRole('link', { name: 'Attribute Anomaly DMG: read the Attribute Anomaly field note' });

  await expect(anomaly).toHaveCount(1);
  await expect(anomaly).toHaveAttribute('href', 'https://sixthstreet.wiki/terms/attribute-anomaly/');
});

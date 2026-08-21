import { formatRemaining } from './scripts/lib/remaining-time.mjs';

const byId = (id) => document.getElementById(id);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const formatDate = (iso) => {
  const [, month, day] = iso.split('-');
  return `${month}/${day}`;
};

const formatCheckedDate = (iso) => {
  const [, month, day] = iso.split('-').map(Number);
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1];
  return `${monthName} ${day}`;
};

const formatHP = (value) => new Intl.NumberFormat('en-US', {
  notation: value >= 1_000_000 ? 'compact' : 'standard',
  maximumFractionDigits: value >= 1_000_000 ? 2 : 0,
}).format(value);

const titleCase = (value) => value[0].toUpperCase() + value.slice(1);
const elementNames = { ice: 'Ice', fire: 'Fire', electric: 'Electric', ether: 'Ether', physical: 'Physical', wind: 'Wind' };
const elementIcons = Object.fromEntries(Object.keys(elementNames).map((name) => [name, `https://cdn.prydwen.gg/images/zenless-zone-zero/icons/ele_${name}.webp`]));

function affinityTag(element, state) {
  const label = state === 'weak' ? 'weak' : 'resists';
  const tag = node('span', `tag ${state} ${element}`);
  if (elementIcons[element]) {
    const icon = node('img', 'element-icon');
    icon.src = elementIcons[element];
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    icon.width = 17;
    icon.height = 17;
    tag.append(icon);
  }
  tag.append(node('span', '', `${elementNames[element] || titleCase(element)} ${label}`));
  return tag;
}

function renderEnemy(enemy) {
  const item = node('li', 'enemy');
  const identity = node('span');
  identity.append(node('span', 'enemy-name', enemy.name));
  if (enemy.count > 1) identity.append(' ', node('span', 'enemy-count', `×${enemy.count}`));
  const hpText = enemy.count > 1
    ? `${formatHP(enemy.hpEach)} each · ${formatHP(enemy.hpGroup)} total calculated HP`
    : `${formatHP(enemy.hpEach)} calculated HP`;
  item.append(identity, node('span', 'enemy-hp', hpText));
  return item;
}

function renderRoom(side, index, roomBuff) {
  const room = node('article', 'room');
  const head = node('div', 'room-head');
  head.append(node('h3', '', `Room ${index + 1}`));
  const affinities = node('div', 'affinities');
  side.weaknesses.forEach((element) => affinities.append(affinityTag(element, 'weak')));
  side.resistances.forEach((element) => affinities.append(affinityTag(element, 'resist')));
  if (!affinities.childElementCount) affinities.append(node('span', 'tag', 'No affinity shift'));
  head.append(affinities);

  const waves = node('div', 'waves');
  side.waves.forEach((wave) => {
    const waveBlock = node('section', 'wave');
    waveBlock.append(node('p', 'wave-label', `Wave ${wave.ordinal}`));
    const enemies = node('ul', 'enemy-list');
    wave.enemies.forEach((enemy) => enemies.append(renderEnemy(enemy)));
    waveBlock.append(enemies);
    waves.append(waveBlock);
  });
  room.append(head);
  if (roomBuff) {
    const buff = node('section', 'room-buff');
    buff.setAttribute('aria-label', `Frontier Effect for Room ${index + 1}: ${roomBuff.name}`);
    const label = node('p', 'room-buff-label', 'Frontier Effect');
    label.append(node('strong', '', roomBuff.name));
    buff.append(label, renderBuffCopy(roomBuff));
    room.append(buff);
  }
  room.append(waves);
  return room;
}

function renderFrontier(frontier, buffsById) {
  const details = node('details', 'frontier');
  const summary = node('summary');
  const heading = node('div');
  heading.append(node('h3', '', `Frontier ${frontier.ordinal}`));
  const bosses = frontier.sides.map((side) => side.waves.at(-1).enemies.map((enemy) => enemy.name).join(' + '));
  heading.append(node('span', 'frontier-kicker', bosses.join(' / ')));
  summary.append(heading);
  const rooms = node('div', 'rooms');
  frontier.sides.forEach((side, index) => {
    const roomBuff = side.roomBuffId ? buffsById.get(side.roomBuffId) : null;
    if (side.roomBuffId && !roomBuff) throw new Error(`unknown room buff ${side.roomBuffId} for Frontier ${frontier.ordinal} Room ${index + 1}`);
    rooms.append(renderRoom(side, index, roomBuff));
  });
  details.append(summary, rooms);
  return details;
}

function termClass(text) {
  const lower = text.toLowerCase();
  if (lower === 'anomaly' || lower === 'anomaly specialty') return 'term specialty anomaly';
  if (lower === 'attack' || lower === 'attack specialty') return 'term specialty attack';
  if (/dmg|damage/.test(lower)) return 'term damage';
  if (/%|decibel|speed|multiplier/.test(lower)) return 'term stat';
  if (/anomaly|stun|daze|attack|ultimate/.test(lower)) return 'term effect';
  return 'term';
}

const keyTerms = [
  'Attribute Anomaly DMG', 'Stun DMG Multiplier', 'Daze Recovery Speed',
  'EX Special Attack', 'Electric DMG', 'Chain Attack', 'CRIT DMG', 'Ice DMG',
  'Attack specialty', 'Anomaly specialty', 'Ultimate', 'Decibels',
];
const keyTermPattern = new RegExp(`(${keyTerms.join('|')})`, 'g');
const termRoutes = new Map([
  ['Attribute Anomaly DMG', 'https://sixthstreet.wiki/terms/attribute-anomaly/'],
]);

function semanticTerm(text) {
  const route = termRoutes.get(text);
  if (!route) return node('strong', termClass(text), text);

  const link = node('a', `${termClass(text)} term-link`, text);
  link.href = route;
  link.setAttribute('aria-label', `${text}: read the Attribute Anomaly field note`);
  return link;
}

function appendSemanticText(parent, text) {
  for (const part of text.split(keyTermPattern)) {
    if (!part) continue;
    if (keyTerms.includes(part)) parent.append(semanticTerm(part));
    else parent.append(document.createTextNode(part));
  }
}

function renderBuffCopy(buff) {
  const copy = node('p');
  for (const segment of buff.emphasis) {
    if (segment.emphasis === 'plain') appendSemanticText(copy, segment.text);
    else copy.append(semanticTerm(segment.text));
  }
  return copy;
}

function renderBuff(buff) {
  const article = node('article', 'buff');
  article.append(node('h3', '', buff.name));
  article.append(renderBuffCopy(buff));
  return article;
}

async function start() {
  const response = await fetch('data/current.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`data request failed: ${response.status}`);
  const data = await response.json();

  byId('cycle-status').replaceChildren(
    node('span', 'cycle-dates', `${formatDate(data.version.startDate)}–${formatDate(data.version.endDate)}`),
    node('span', 'verified', `Verified ${formatCheckedDate(data.provenance.fetchedDate)}`),
    node('span', 'remaining', formatRemaining(data?.version?.endsAt, Date.now())),
  );
  byId('cycle-status').querySelector('.remaining').setAttribute('aria-live', 'off');
  window.setInterval(() => {
    byId('cycle-status').querySelector('.remaining').textContent = formatRemaining(data?.version?.endsAt, Date.now());
  }, 60_000);
  const buffsById = new Map(data.buffs.map((buff) => [buff.id, buff]));
  if (buffsById.size !== data.buffs.length) throw new Error('room buff IDs must be unique');
  const frontierList = byId('frontiers');
  data.nodes.forEach((frontier) => frontierList.append(renderFrontier(frontier, buffsById)));
  const buffList = byId('buffs');
  data.buffs.forEach((buff) => buffList.append(renderBuff(buff)));

  const sourceLink = byId('source-link');
  sourceLink.href = `${data.provenance.repository}/tree/${data.provenance.sha}`;
  sourceLink.textContent = `View community source at ${data.provenance.sha.slice(0, 7)}`;
}

start().catch((error) => {
  console.error(error);
  byId('fatal-error').hidden = false;
  byId('cycle-status').textContent = 'cycle data unavailable';
});

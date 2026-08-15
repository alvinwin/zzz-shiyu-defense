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

const formatHP = (value) => new Intl.NumberFormat('en-US', {
  notation: value >= 1_000_000 ? 'compact' : 'standard',
  maximumFractionDigits: value >= 1_000_000 ? 2 : 0,
}).format(value);

const titleCase = (value) => value[0].toUpperCase() + value.slice(1);

function affinityTag(element, state) {
  const label = state === 'weak' ? 'weak' : 'resists';
  return node('span', `tag ${state} ${element}`, `${titleCase(element)} ${label}`);
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

function renderRoom(side, index) {
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
  room.append(head, waves);
  return room;
}

function renderFrontier(frontier) {
  const details = node('details', 'frontier');
  const summary = node('summary');
  const heading = node('div');
  heading.append(node('h3', '', `Frontier ${frontier.ordinal}`));
  const bosses = frontier.sides.map((side) => side.waves.at(-1).enemies.map((enemy) => enemy.name).join(' + '));
  heading.append(node('span', 'frontier-kicker', bosses.join(' / ')));
  summary.append(heading);
  const rooms = node('div', 'rooms');
  frontier.sides.forEach((side, index) => rooms.append(renderRoom(side, index)));
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

function appendSemanticText(parent, text) {
  for (const part of text.split(keyTermPattern)) {
    if (!part) continue;
    if (keyTerms.includes(part)) parent.append(node('strong', termClass(part), part));
    else parent.append(document.createTextNode(part));
  }
}

function renderBuff(buff) {
  const article = node('article', 'buff');
  article.append(node('h3', '', buff.name));
  const copy = node('p');
  for (const segment of buff.emphasis) {
    if (segment.emphasis === 'plain') appendSemanticText(copy, segment.text);
    else copy.append(node('strong', termClass(segment.text), segment.text));
  }
  article.append(copy);
  return article;
}

async function start() {
  const response = await fetch('data/current.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`data request failed: ${response.status}`);
  const data = await response.json();

  byId('cycle-status').textContent = `cycle data for ${formatDate(data.version.startDate)} - ${formatDate(data.version.endDate)} // verified ${formatDate(data.provenance.fetchedDate)}`;
  const frontierList = byId('frontiers');
  data.nodes.forEach((frontier) => frontierList.append(renderFrontier(frontier)));
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

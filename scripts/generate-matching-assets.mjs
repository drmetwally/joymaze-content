#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT, 'output', 'challenge', 'generated-activity');

const CANVAS_W = 1700;
const CANVAS_H = 2200;
const BG_COLOR = '#FFFDF8';
const PANEL_COLOR = '#FFFFFF';
const PANEL_STROKE = '#E8DFC9';
const TEXT_COLOR = '#202020';
const MUTED_COLOR = '#6B645B';
const MATCH_ZONE_FILL = '#FFF3E9';
const MATCH_ZONE_STROKE = '#F0D5C1';
const LINE_COLORS = ['#FF8A5B', '#4FA3FF', '#57B65F', '#B978FF', '#F4C542', '#FF5C8A'];

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (flag, fallback = null) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] ?? fallback : fallback;
};

const DRY_RUN = hasFlag('--dry-run');
const TITLE = getArg('--title', 'Match the Pairs');
const THEME = getArg('--theme', 'Animals and Homes');
const DIFFICULTY = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const COUNTDOWN_SEC = Number(getArg('--countdown', '45'));
const SEED_ARG = getArg('--seed');
const SLUG_ARG = getArg('--slug');
const OUT_DIR_ARG = getArg('--out-dir');

const difficultyDefaults = {
  easy: { pairs: 4, minCrossings: 1, maxCrossings: 1 },
  medium: { pairs: 5, minCrossings: 1, maxCrossings: 2 },
  hard: { pairs: 6, minCrossings: 2, maxCrossings: 4 },
  difficult: { pairs: 6, minCrossings: 3, maxCrossings: 5 },
  extreme: { pairs: 7, minCrossings: 4, maxCrossings: 7 },
};

const BANKS = {
  animals: [
    ['BIRD', 'NEST'],
    ['BEE', 'HIVE'],
    ['FOX', 'DEN'],
    ['SPIDER', 'WEB'],
    ['RABBIT', 'BURROW'],
    ['FROG', 'POND'],
    ['DUCK', 'LAKE'],
  ],
  colors: [
    ['APPLE', 'RED'],
    ['LEAF', 'GREEN'],
    ['SUN', 'YELLOW'],
    ['OCEAN', 'BLUE'],
    ['GRAPE', 'PURPLE'],
    ['SNOW', 'WHITE'],
    ['NIGHT', 'BLACK'],
  ],
  shapes: [
    ['WHEEL', 'CIRCLE'],
    ['WINDOW', 'SQUARE'],
    ['SLICE', 'TRIANGLE'],
    ['DOOR', 'RECTANGLE'],
    ['SIGN', 'OVAL'],
    ['KITE', 'DIAMOND'],
  ],
  default: [
    ['BIRD', 'NEST'],
    ['BEE', 'HIVE'],
    ['FOX', 'DEN'],
    ['FROG', 'POND'],
    ['DUCK', 'LAKE'],
    ['SPIDER', 'WEB'],
    ['RABBIT', 'BURROW'],
  ],
};

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function hashStringToSeed(input) {
  let h = 2166136261 >>> 0;
  const str = String(input);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, max) {
  return Math.floor(rng() * max);
}

function shuffle(items, rng) {
  const clone = [...items];
  for (let i = clone.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function chooseBank(theme) {
  const lower = String(theme || '').toLowerCase();
  if (lower.includes('color')) return BANKS.colors;
  if (lower.includes('shape')) return BANKS.shapes;
  if (lower.includes('animal') || lower.includes('home')) return BANKS.animals;
  return BANKS.default;
}

function pickPairs(theme, count, rng) {
  return shuffle(chooseBank(theme), rng).slice(0, count);
}

function buildLayout(pairCount) {
  const topY = 430;
  const rowGap = 210;
  const cardW = 440;
  const cardH = 130;
  const leftX = 170;
  const rightX = CANVAS_W - leftX - cardW;
  const lineStartX = leftX + cardW;
  const lineEndX = rightX;
  return { topY, rowGap, cardW, cardH, leftX, rightX, lineStartX, lineEndX, pairCount };
}

function crossingCount(leftItems, rightItems) {
  const rightIndexByText = new Map(rightItems.map((item, index) => [item.text, index]));
  let count = 0;
  for (let i = 0; i < leftItems.length; i++) {
    for (let j = i + 1; j < leftItems.length; j++) {
      const ri = rightIndexByText.get(leftItems[i].match);
      const rj = rightIndexByText.get(leftItems[j].match);
      if (ri > rj) count++;
    }
  }
  return count;
}

function buildPuzzle(pairs, rng, difficultyConfig) {
  const leftItems = pairs.map(([left, right], index) => ({ id: `L${index + 1}`, text: left, match: right }));
  const baseRightItems = pairs.map(([left, right], index) => ({ id: `R${index + 1}`, text: right, match: left }));
  let best = shuffle(baseRightItems, rng);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 160; attempt++) {
    const candidate = shuffle(baseRightItems, rng);
    const crossings = crossingCount(leftItems, candidate);
    if (crossings >= difficultyConfig.minCrossings && crossings <= difficultyConfig.maxCrossings) {
      best = candidate;
      bestScore = crossings;
      break;
    }
    const distance = Math.min(
      Math.abs(crossings - difficultyConfig.minCrossings),
      Math.abs(crossings - difficultyConfig.maxCrossings),
    );
    if (distance < bestScore) {
      best = candidate;
      bestScore = distance;
    }
  }

  return { leftItems, rightItems: best, crossingCount: crossingCount(leftItems, best) };
}

function connectorData(leftItems, rightItems, layout) {
  return leftItems.map((left, index) => {
    const rightIndex = rightItems.findIndex((right) => right.text === left.match);
    const y1 = layout.topY + index * layout.rowGap + layout.cardH / 2;
    const y2 = layout.topY + rightIndex * layout.rowGap + layout.cardH / 2;
    return {
      leftId: left.id,
      rightId: rightItems[rightIndex].id,
      color: LINE_COLORS[index % LINE_COLORS.length],
      x1: layout.lineStartX,
      y1,
      x2: layout.lineEndX,
      y2,
    };
  });
}

function escapeXml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cardSvg(x, y, w, h, text, side) {
  const labelX = x + w / 2;
  const accent = side === 'left' ? '#FFD9C7' : '#D8E9FF';
  return `
    <g>
      <rect x="${x + 4}" y="${y + 8}" width="${w}" height="${h}" rx="28" ry="28" fill="#EDE4D6" opacity="0.55"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" ry="28" fill="${PANEL_COLOR}" stroke="${PANEL_STROKE}" stroke-width="4"/>
      <circle cx="${side === 'left' ? x + 38 : x + w - 38}" cy="${y + h / 2}" r="14" fill="${accent}" />
      <text x="${labelX}" y="${y + h / 2 + 15}" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="${TEXT_COLOR}">${escapeXml(text)}</text>
    </g>`;
}

function buildSvg({ title, subtitle, leftItems, rightItems, connectors, layout, solved = false, crossingCount = 0 }) {
  const leftCards = leftItems.map((item, index) => cardSvg(layout.leftX, layout.topY + index * layout.rowGap, layout.cardW, layout.cardH, item.text, 'left')).join('\n');
  const rightCards = rightItems.map((item, index) => cardSvg(layout.rightX, layout.topY + index * layout.rowGap, layout.cardW, layout.cardH, item.text, 'right')).join('\n');
  const lines = solved ? connectors.map((line) => `
    <path d="M ${line.x1} ${line.y1} C ${line.x1 + 105} ${line.y1}, ${line.x2 - 105} ${line.y2}, ${line.x2} ${line.y2}" fill="none" stroke="${line.color}" stroke-width="16" stroke-linecap="round" opacity="0.92"/>`).join('\n') : '';

  return `
<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${BG_COLOR}"/>
  <text x="${CANVAS_W / 2}" y="145" text-anchor="middle" font-family="Arial, sans-serif" font-size="68" font-weight="700" fill="${TEXT_COLOR}">${escapeXml(title)}</text>
  <text x="${CANVAS_W / 2}" y="210" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="${MUTED_COLOR}">${escapeXml(subtitle)}</text>
  <rect x="648" y="368" width="404" height="1128" rx="64" ry="64" fill="${MATCH_ZONE_FILL}" stroke="${MATCH_ZONE_STROKE}" stroke-width="3" opacity="0.88"/>
  <text x="${layout.leftX + layout.cardW / 2}" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="${MUTED_COLOR}">Match from here</text>
  <text x="${layout.rightX + layout.cardW / 2}" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="${MUTED_COLOR}">To the correct pair</text>
  <text x="850" y="1528" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="${MUTED_COLOR}">${solved ? `Solved with ${crossingCount} crossing${crossingCount === 1 ? '' : 's'}` : 'Draw each line through the center lane'}</text>
  ${lines}
  ${leftCards}
  ${rightCards}
</svg>`.trim();
}

async function writeSvgPng(svg, outSvgPath, outPngPath) {
  await fs.writeFile(outSvgPath, svg, 'utf8');
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(outPngPath, pngBuffer);
}

async function main() {
  const seed = SEED_ARG ? Number(SEED_ARG) : hashStringToSeed(`${TITLE}|${THEME}|${DIFFICULTY}|matching`);
  const rng = mulberry32(seed);
  const defaults = difficultyDefaults[DIFFICULTY] || difficultyDefaults.medium;
  const pairs = pickPairs(THEME, defaults.pairs, rng);
  const layout = buildLayout(pairs.length);
  const { leftItems, rightItems, crossingCount } = buildPuzzle(pairs, rng, defaults);
  const connectors = connectorData(leftItems, rightItems, layout);

  const slug = SLUG_ARG || `${new Date().toISOString().slice(0, 10)}-${slugify(TITLE || THEME || 'matching')}-${slugify(DIFFICULTY)}`;
  const outDir = OUT_DIR_ARG ? path.resolve(ROOT, OUT_DIR_ARG) : path.join(OUTPUT_ROOT, slug);
  const folderRel = path.relative(ROOT, outDir).replace(/\\/g, '/');

  const blankSvg = buildSvg({ title: TITLE, subtitle: 'Draw a line to match each pair', leftItems, rightItems, connectors, layout, solved: false, crossingCount });
  const solvedSvg = buildSvg({ title: TITLE, subtitle: 'Here are the correct matches', leftItems, rightItems, connectors, layout, solved: true, crossingCount });

  const activityJson = {
    type: 'challenge',
    puzzleType: 'matching',
    difficulty: DIFFICULTY,
    theme: THEME,
    titleText: TITLE,
    hookText: `Can your kid match all ${pairs.length} pairs in ${COUNTDOWN_SEC} seconds?`,
    ctaText: 'Tag a kid who can match them all',
    activityLabel: 'MATCHING',
    countdownSec: COUNTDOWN_SEC,
    hookDurationSec: 2.5,
    holdAfterSec: 2.5,
    imagePath: 'puzzle.png',
    blankImage: 'blank.png',
    solvedImage: 'solved.png',
    showJoyo: true,
    showBrandWatermark: true,
    sourceFolder: folderRel,
  };

  const matchingJson = {
    width: CANVAS_W,
    height: CANVAS_H,
    leftItems,
    rightItems,
    pairs: pairs.map(([left, right]) => ({ left, right })),
    connectors,
    crossingCount,
  };

  console.log(`[matching-factory] title      : ${TITLE}`);
  console.log(`[matching-factory] theme      : ${THEME}`);
  console.log(`[matching-factory] outDir     : ${outDir}`);
  console.log(`[matching-factory] seed       : ${seed}`);
  console.log(`[matching-factory] difficulty : ${DIFFICULTY}`);
  console.log(`[matching-factory] pairs      : ${pairs.map(([a, b]) => `${a}-${b}`).join(', ')}`);
  console.log(`[matching-factory] crossings  : ${crossingCount}`);

  if (DRY_RUN) {
    console.log('[matching-factory] dry-run only, no files written.');
    return;
  }

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outDir, 'activity.json'), JSON.stringify(activityJson, null, 2)),
    fs.writeFile(path.join(outDir, 'matching.json'), JSON.stringify(matchingJson, null, 2)),
  ]);
  await writeSvgPng(blankSvg, path.join(outDir, 'blank.svg'), path.join(outDir, 'blank.png'));
  await writeSvgPng(solvedSvg, path.join(outDir, 'solved.svg'), path.join(outDir, 'solved.png'));
  await fs.copyFile(path.join(outDir, 'blank.png'), path.join(outDir, 'puzzle.png'));

  console.log('[matching-factory] wrote files:');
  for (const file of ['activity.json', 'matching.json', 'blank.svg', 'blank.png', 'puzzle.png', 'solved.svg', 'solved.png']) {
    console.log(`  - ${path.join(outDir, file)}`);
  }
}

main().catch((error) => {
  console.error('[matching-factory] failed:', error);
  process.exit(1);
});

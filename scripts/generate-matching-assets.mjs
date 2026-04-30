#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { buildChallengeHook } from './lib/challenge-hooks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT, 'output', 'challenge', 'generated-activity');

const CANVAS_W = 1700;
const CANVAS_H = 2200;
const BG_COLOR = '#FFFFFF';
const CARD_COLOR = '#F0EFE8';
const CARD_BORDER = '#2A2A3A';
const MATCH_COLOR = '#FF6B35';
const MATCH_STROKE = 8;

const PAIR_COLORS = [
  '#FFD6D6', '#D6EAFF', '#D6FFE4', '#FFF4D6',
  '#EDD6FF', '#D6FFF9', '#FFE8D6', '#F0FFD6',
  '#FFD6F4', '#D6D6FF', '#FFFFD6', '#D6F4FF',
];

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (flag, fallback = null) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] ?? fallback : fallback;
};

const DRY_RUN = hasFlag('--dry-run');
const TITLE = getArg('--title', 'Animal Match');
const THEME = getArg('--theme', TITLE);
const DIFFICULTY = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const PAIRS_ARG = Number(getArg('--pairs', '0')) || null;
const SEED_ARG = getArg('--seed');
const SLUG_ARG = getArg('--slug');
const OUT_DIR_ARG = getArg('--out-dir');

const PUZZLE_TYPE = 'matching';
const COUNTDOWN_SEC = Number(getArg('--countdown', '15'));
const SOLVE_DURATION_SEC = 12;
const DEFAULT_CHALLENGE_AUDIO_VOLUME = 0.11;
const DEFAULT_TICK_AUDIO_VOLUME = 0.3;
const DEFAULT_TRANSITION_CUE_VOLUME = 0.24;
const DEFAULT_SOLVE_AUDIO_VOLUME = 0.52;

const difficultyDefaults = {
  easy:     { pairs: 4,  cols: 4, rows: 3 },
  medium:   { pairs: 6,  cols: 4, rows: 3 },
  hard:     { pairs: 8,  cols: 4, rows: 4 },
  difficult:{ pairs: 10, cols: 5, rows: 4 },
  extreme:  { pairs: 12, cols: 6, rows: 4 },
};

const explicitPairs = PAIRS_ARG;
const dims = difficultyDefaults[DIFFICULTY] || difficultyDefaults.medium;
const PAIRS = explicitPairs ?? dims.pairs;
const COLS = Number(getArg('--cols', '0')) || dims.cols;
const ROWS = Number(getArg('--rows', '0')) || dims.rows;

// ── Seed helpers ─────────────────────────────────────────────────────────────────

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
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

function randomInt(rng, max) {
  return Math.floor(rng() * max);
}

function shuffleInPlace(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// ── Themed item pool ───────────────────────────────────────────────────────────

async function loadWordPack(themeStr, maxLen = 20) {
  try {
    const packs = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'wordsearch-word-packs.json'), 'utf-8'));
    const t = themeStr.toLowerCase();
    const key = Object.keys(packs).find(k => t.includes(k)) ?? 'default';
    return packs[key] ?? packs.default ?? [];
  } catch {
    return ['BIRD', 'FISH', 'BEAR', 'FROG', 'LION', 'DUCK', 'DEER', 'FOX'];
  }
}

function resolveThemeFamily(themeStr) {
  const t = themeStr.toLowerCase();
  if (t.includes('ocean') || t.includes('sea') || t.includes('fish')) return 'ocean';
  if (t.includes('space') || t.includes('rocket') || t.includes('planet')) return 'space';
  if (t.includes('dino') || t.includes('jurassic')) return 'dinosaurs';
  if (t.includes('jungle') || t.includes('safari') || t.includes('zoo')) return 'jungle';
  if (t.includes('dog') || t.includes('cat') || t.includes('puppy') || t.includes('kitten') || t.includes('pet') || t.includes('animal')) return 'animals';
  if (t.includes('fairy') || t.includes('princess') || t.includes('magic')) return 'fairy';
  if (t.includes('vehicle') || t.includes('car') || t.includes('truck')) return 'vehicles';
  if (t.includes('food') || t.includes('kitchen') || t.includes('fruit')) return 'food';
  if (t.includes('workshop') || t.includes('tool')) return 'workshop';
  return 'default';
}

// ── Matching logic ──────────────────────────────────────────────────────────────

function buildGrid(cells, cols) {
  const rows = Math.ceil(cells.length / cols);
  return cells.map((item, i) => ({
    index: i,
    row: Math.floor(i / cols),
    col: i % cols,
    item,
  }));
}

function buildMatchingPairs(pairs, grid) {
  return pairs.map((label, i) => {
    const a = grid[i * 2];
    const b = grid[i * 2 + 1];
    return {
      id: i,
      label,
      positions: [a.index, b.index],
      centerA: { x: a.col, y: a.row },
      centerB: { x: b.col, y: b.row },
    };
  });
}

// ── Layout ─────────────────────────────────────────────────────────────────────

function buildLayout(cols, rows) {
  const MARGIN = 80;
  const gap = 18;
  const cardSize = Math.floor((CANVAS_W - MARGIN - (cols - 1) * gap) / cols);
  const totalW = cols * cardSize + (cols - 1) * gap;
  const totalH = rows * cardSize + (rows - 1) * gap;
  const offsetX = Math.round((CANVAS_W - totalW) / 2);
  const offsetY = Math.round((CANVAS_H - totalH) / 2);
  return { cardSize, gap, totalW, totalH, offsetX, offsetY, cols, rows };
}

function cardPixelCenter(layout, col, row) {
  return {
    x: layout.offsetX + col * (layout.cardSize + layout.gap) + layout.cardSize / 2,
    y: layout.offsetY + row * (layout.cardSize + layout.gap) + layout.cardSize / 2,
  };
}

// ── SVG generation ──────────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function cardBackPattern() {
  const id = 'cardback';
  return `
  <defs>
    <pattern id="${id}" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <rect width="20" height="20" fill="#E8E4D4"/>
      <circle cx="10" cy="10" r="3" fill="#C8C4B0"/>
      <circle cx="0" cy="0" r="3" fill="#C8C4B0"/>
      <circle cx="20" cy="0" r="3" fill="#C8C4B0"/>
      <circle cx="0" cy="20" r="3" fill="#C8C4B0"/>
      <circle cx="20" cy="20" r="3" fill="#C8C4B0"/>
    </pattern>
  </defs>`;
}

function buildBlankSvg(layout, grid) {
  const { cardSize, offsetX, offsetY, gap, cols, rows } = layout;
  const patterns = cardBackPattern();

  const cards = grid.map(cell => {
    const x = offsetX + cell.col * (cardSize + gap);
    const y = offsetY + cell.row * (cardSize + gap);
    return `  <rect x="${x}" y="${y}" width="${cardSize}" height="${cardSize}" rx="14" fill="url(#cardback)" stroke="#C8C4B0" stroke-width="2.5"/>`;
  }).join('\n');

  return `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
${patterns}
  <rect width="100%" height="100%" fill="${BG_COLOR}"/>
${cards}
</svg>`;
}

function buildSolvedSvg(layout, pairs, grid) {
  const { cardSize, offsetX, offsetY, gap } = layout;
  const patterns = cardBackPattern();

  // Map each grid position to its pair's color
  const positionToColor = {};
  pairs.forEach((pair, i) => {
    const color = PAIR_COLORS[i % PAIR_COLORS.length];
    pair.positions.forEach(pos => { positionToColor[pos] = color; });
  });

  const cards = grid.map((cell) => {
    const x = offsetX + cell.col * (cardSize + gap);
    const y = offsetY + cell.row * (cardSize + gap);
    const fill = positionToColor[cell.index] ?? CARD_COLOR;
    return `  <rect x="${x}" y="${y}" width="${cardSize}" height="${cardSize}" rx="14" fill="${fill}" stroke="${CARD_BORDER}" stroke-width="3"/>`;
  }).join('\n');

  // Connection lines between matched pairs
  const lines = pairs.map(pair => {
    const a = grid.find(c => c.index === pair.positions[0]);
    const b = grid.find(c => c.index === pair.positions[1]);
    const ca = cardPixelCenter(layout, a.col, a.row);
    const cb = cardPixelCenter(layout, b.col, b.row);
    return `  <line x1="${ca.x}" y1="${ca.y}" x2="${cb.x}" y2="${cb.y}" stroke="${MATCH_COLOR}" stroke-width="${MATCH_STROKE}" stroke-linecap="round" opacity="0.85"/>`;
  }).join('\n');

  // Labels on cards
  const labels = pairs.flatMap(pair => {
    return pair.positions.map(pos => {
      const cell = grid.find(c => c.index === pos);
      const cx = offsetX + cell.col * (cardSize + gap) + cardSize / 2;
      const cy = offsetY + cell.row * (cardSize + gap) + cardSize / 2;
      const shortLabel = pair.label.length > 8 ? pair.label.slice(0, 7) + '…' : pair.label;
      return `  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#1A1A2A">${escapeXml(shortLabel)}</text>`;
    });
  }).join('\n');

  return `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
${patterns}
  <rect width="100%" height="100%" fill="${BG_COLOR}"/>
${lines}
${cards}
${labels}
</svg>`;
}

// ── Output helpers ─────────────────────────────────────────────────────────────

async function writeSvgPng(svg, outSvgPath, outPngPath) {
  await fs.writeFile(outSvgPath, svg, 'utf8');
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(outPngPath, pngBuffer);
}

function buildMatchingJson({ title, theme, difficulty, pairs, grid, layout, folderRel }) {
  return {
    version: 1,
    puzzleType: PUZZLE_TYPE,
    title,
    theme,
    difficulty,
    pairs: pairs.map(p => ({
      id: p.id,
      label: p.label,
      positions: p.positions,
    })),
    grid: {
      cols: layout.cols,
      rows: layout.rows,
      cardSize: layout.cardSize,
      gap: layout.gap,
      offsetX: layout.offsetX,
      offsetY: layout.offsetY,
      canvasW: CANVAS_W,
      canvasH: CANVAS_H,
    },
    connections: pairs.map(p => {
      const a = grid.find(c => c.index === p.positions[0]);
      const b = grid.find(c => c.index === p.positions[1]);
      const ca = cardPixelCenter(layout, a.col, a.row);
      const cb = cardPixelCenter(layout, b.col, b.row);
      return {
        from: p.positions[0],
        to: p.positions[1],
        label: p.label,
        x1: ca.x, y1: ca.y,
        x2: cb.x, y2: cb.y,
      };
    }),
  };
}

function buildActivityJson({ title, theme, difficulty, hookTitle, folderRel }) {
  return {
    type: 'challenge',
    puzzleType: PUZZLE_TYPE,
    difficulty,
    theme,
    titleText: hookTitle,
    hookText: hookTitle,
    ctaText: 'Tag a kid who found all the pairs!',
    activityLabel: 'MATCHING',
    countdownSec: COUNTDOWN_SEC,
    hookDurationSec: 2.5,
    holdAfterSec: SOLVE_DURATION_SEC,
    imagePath: 'puzzle.png',
    blankImage: 'blank.png',
    solvedImage: 'solved.png',
    challengeAudioVolume: DEFAULT_CHALLENGE_AUDIO_VOLUME,
    tickAudioVolume: DEFAULT_TICK_AUDIO_VOLUME,
    transitionCueVolume: DEFAULT_TRANSITION_CUE_VOLUME,
    solveAudioVolume: DEFAULT_SOLVE_AUDIO_VOLUME,
    showJoyo: true,
    showBrandWatermark: false,
    sourceFolder: folderRel,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  const seed = SEED_ARG ? Number(SEED_ARG) : hashStringToSeed(`${TITLE}|${THEME}|${DIFFICULTY}|${PAIRS}pairs|${COLS}x${ROWS}`);
  const rng = mulberry32(seed);
  const slug = SLUG_ARG || `${new Date().toISOString().slice(0, 10)}-${TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)}-matching-${DIFFICULTY}`;
  const outDir = OUT_DIR_ARG ? path.resolve(ROOT, OUT_DIR_ARG) : path.join(OUTPUT_ROOT, slug);
  const folderRel = path.relative(ROOT, outDir).replace(/\\/g, '/');

  // Load themed word pool and sample pairs
  const family = resolveThemeFamily(THEME);
  const pool = await loadWordPack(family, PAIRS * 3);
  const shuffled = shuffleInPlace([...pool], rng);
  const selectedPairs = shuffled.slice(0, PAIRS);

  // Build grid: total cards = PAIRS * 2, fill row by row
  const totalCards = PAIRS * 2;
  const gridRows = Math.ceil(totalCards / COLS);
  const actualCols = COLS;
  const actualRows = gridRows;

  // Create card items: two copies of each pair label, shuffled into grid positions
  const cardLabels = [...selectedPairs, ...selectedPairs];
  shuffleInPlace(cardLabels, rng);
  const grid = buildGrid(cardLabels, actualCols);

  // Shuffle position indices so pairs are placed non-adjacently across the grid
  const positionIndices = Array.from({ length: totalCards }, (_, i) => i);
  shuffleInPlace(positionIndices, rng);

  const pairs = selectedPairs.map((label, i) => {
    const posA = positionIndices[i];
    const posB = positionIndices[PAIRS + i];
    const cellA = grid[posA];
    const cellB = grid[posB];
    return {
      id: i,
      label,
      positions: [cellA.index, cellB.index],
      centerA: { x: cellA.col, y: cellA.row },
      centerB: { x: cellB.col, y: cellB.row },
    };
  });
  const layout = buildLayout(actualCols, actualRows);

  const hookTitle = await buildChallengeHook({
    theme: THEME,
    puzzleType: PUZZLE_TYPE,
    difficulty: DIFFICULTY,
    seedHint: `${TITLE}|${THEME}|${DIFFICULTY}`,
  });

  const matchingJson = buildMatchingJson({ title: TITLE, theme: THEME, difficulty: DIFFICULTY, pairs, grid, layout, folderRel });
  const activityJson = buildActivityJson({ title: TITLE, theme: THEME, difficulty: DIFFICULTY, hookTitle, folderRel });

  console.log(`[matching-factory] title      : ${TITLE}`);
  console.log(`[matching-factory] theme      : ${THEME}`);
  console.log(`[matching-factory] family    : ${family}`);
  console.log(`[matching-factory] outDir    : ${outDir}`);
  console.log(`[matching-factory] seed      : ${seed}`);
  console.log(`[matching-factory] difficulty: ${DIFFICULTY}`);
  console.log(`[matching-factory] pairs     : ${PAIRS} (${actualCols}×${actualRows} grid)`);
  console.log(`[matching-factory] words     : ${selectedPairs.join(', ')}`);

  if (DRY_RUN) {
    console.log('[matching-factory] dry-run only, no files written.');
    return;
  }

  await fs.mkdir(outDir, { recursive: true });

  const blankSvg = buildBlankSvg(layout, grid);
  const solvedSvg = buildSolvedSvg(layout, pairs, grid);

  await Promise.all([
    fs.writeFile(path.join(outDir, 'matching.json'), JSON.stringify(matchingJson, null, 2)),
    fs.writeFile(path.join(outDir, 'activity.json'), JSON.stringify(activityJson, null, 2)),
  ]);
  await writeSvgPng(blankSvg, path.join(outDir, 'blank.svg'), path.join(outDir, 'blank.png'));
  await writeSvgPng(solvedSvg, path.join(outDir, 'solved.svg'), path.join(outDir, 'solved.png'));
  await fs.copyFile(path.join(outDir, 'blank.png'), path.join(outDir, 'puzzle.png'));

  console.log('[matching-factory] wrote files:');
  for (const file of ['activity.json', 'matching.json', 'blank.svg', 'blank.png', 'solved.svg', 'solved.png', 'puzzle.png']) {
    console.log(`  - ${path.join(outDir, file)}`);
  }
}

main().catch((error) => {
  console.error('[matching-factory] failed:', error);
  process.exit(1);
});

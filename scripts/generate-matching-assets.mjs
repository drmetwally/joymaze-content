#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { buildChallengeHook } from './lib/challenge-hooks.mjs';
import { pickAsset } from './lib/asset-library.mjs';

// ── Asset library convention ──────────────────────────────────────────────────
// Scene images for matching puzzle backgrounds live at:
//   assets/generated/matching-scenes/<theme>/main/*.png
//
// Drop Imagen-generated scene PNGs (1700×2200, portrait) into the appropriate
// theme folder under main/ to have them automatically picked up.
// Run `node scripts/generate-asset-library.mjs --type matching-scenes` to
// promote from staging/ → main/ after review.
//
// If no scene images exist for a theme, the generator falls back to the
// programmatic SVG card-back layout (white background + pattern fill).
// ─────────────────────────────────────────────────────────────────────────────

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

function resolveStickerTheme(themeFamily) {
  const map = {
    animals: 'animals',
    ocean: 'ocean',
    space: 'space',
    dinosaurs: 'dinosaurs',
    farm: 'farm',
    vehicles: 'vehicles',
    fairy: 'animals',
    jungle: 'animals',
    default: 'animals',
  };
  return map[themeFamily] || 'animals';
}

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
  const labelIdxs = {};
  grid.forEach(cell => {
    if (!labelIdxs[cell.item]) labelIdxs[cell.item] = [];
    labelIdxs[cell.item].push(cell.index);
  });
  return pairs.map((label, i) => {
    const idxs = labelIdxs[label] || [];
    const ca = grid.find(cell => cell.index === idxs[0]);
    const cb = grid.find(cell => cell.index === idxs[1]);
    return {
      id: i,
      label,
      positions: idxs.slice(0, 2),
      centerA: ca ? { x: ca.col, y: ca.row } : { x: 0, y: 0 },
      centerB: cb ? { x: cb.col, y: cb.row } : { x: 0, y: 1 },
    };
  });
}
// ── Layout ─────────────────────────────────────────────────────────────────────

function buildLayout(cols, rows) {
  const MARGIN = 80;
  const gap = 18;
  // Reduce cardSize until the full grid fits within CANVAS_W with MARGIN padding on each side.
  // 4 columns at 391px = 1564px + 3×18 = 1618px > 1540px available → clip right edge.
  // Shrink until grid + margins fits cleanly so no cards clip at render time.
  const availableW = CANVAS_W - MARGIN * 2;
  let cardSize = Math.floor(availableW / cols);
  while (cols * cardSize + (cols - 1) * gap > availableW && cardSize > 60) {
    cardSize -= 2;
  }
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

async function loadStickerIndex() {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, 'assets', 'stickers', 'matching', 'index.json'), 'utf-8'));
  } catch {
    return null;
  }
}

async function resolveStickerAssignments(selectedPairs, grid, stickerTheme, rng) {
  const index = await loadStickerIndex();
  if (!index?.themes?.[stickerTheme]) return null;

  const names = index.themes[stickerTheme];
  if (names.length < selectedPairs.length) return null;

  const shuffled = shuffleInPlace([...names], rng);
  const selected = shuffled.slice(0, selectedPairs.length);

  // Build label→sticker mapping: each pair label gets exactly one matching sticker.
  // Ocean uses explicit verified mapping; other themes use exact name match.
  const pairStickerMap = {};
  if (stickerTheme === 'ocean') {
    const oceanLabelToSticker = {
      DOLPHIN:  'dolphin',
      FISH:     'fish',
      CRAB:     'crab',
      OCTOPUS:  'octopus',
      TURTLE:   'turtle',
      SEAHORSE: 'seahorse',
    };
    for (const label of selectedPairs) {
      if (oceanLabelToSticker[label]) pairStickerMap[label] = oceanLabelToSticker[label];
    }
  } else {
    const usedStickers = new Set();
    for (const label of selectedPairs) {
      const l = label.toLowerCase();
      if (names.some(n => n.toLowerCase() === l) && !usedStickers.has(l)) {
        pairStickerMap[label] = l;
        usedStickers.add(l);
      }
    }
  }

  const assignments = {};
  for (let i = 0; i < grid.length; i++) {
    const label = grid[i].item;
    const stickerName = pairStickerMap[label];
    if (!stickerName) continue;
    const stickerPath = path.join(ROOT, 'assets', 'stickers', 'matching', stickerTheme, `${stickerName}.png`);
    try {
      const buf = await fs.readFile(stickerPath);
      assignments[i] = `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      // missing PNG — card renders with pattern background
    }
  }
  return assignments;
}

function buildBlankSvg(layout, grid, stickerAssignments, sceneBgDataUrl = null) {
  const { cardSize, offsetX, offsetY, gap, cols, rows } = layout;
  const patterns = cardBackPattern();

  // Scene background: visible through card gaps and behind card backs.
  // Used as the shared background in P2 and P3.
  const bgLayer = sceneBgDataUrl
    ? `  <image href="${sceneBgDataUrl}" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" preserveAspectRatio="xMidYMid slice"/>`
    : `  <rect width="100%" height="100%" fill="#F5F1E8"/>`;

  const cards = grid.map((cell) => {
    const x = offsetX + cell.col * (cardSize + gap);
    const y = offsetY + cell.row * (cardSize + gap);
    return `  <rect x="${x}" y="${y}" width="${cardSize}" height="${cardSize}" rx="14" fill="url(#cardback)" stroke="#C8C4B0" stroke-width="2.5"/>`;
  }).join('\n');

  return `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
${patterns}
${bgLayer}
${cards}
</svg>`;
}

function buildSolvedSvg(layout, pairs, grid, sceneBgDataUrl = null) {
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
      const shortLabel = pair.label.length > 10 ? pair.label.slice(0, 10) + '…' : pair.label;
      return `  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#1A1A2A">${escapeXml(shortLabel)}</text>`;
    });
  }).join('\n');

  const bgLayer = sceneBgDataUrl
    ? `  <image href="${sceneBgDataUrl}" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" preserveAspectRatio="xMidYMid slice"/>`
    : `  <rect width="100%" height="100%" fill="#F5F1E8"/>`;

  return `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
${patterns}
${bgLayer}
${cards}
${lines}
${labels}
</svg>`;
}

// ── Output helpers ─────────────────────────────────────────────────────────────

function computeMatchRects(grid, layout) {
  // Returns normalized card rects: each rect is { xFraction, yFraction, wFraction, hFraction }
  // relative to CANVAS_W / CANVAS_H (matching.json uses pixel coords, we normalize)
  return grid.map((cell) => {
    const x = layout.offsetX + cell.col * (layout.cardSize + layout.gap);
    const y = layout.offsetY + cell.row * (layout.cardSize + layout.gap);
    return {
      gridIndex: cell.index,
      xNorm: x / CANVAS_W,
      yNorm: y / CANVAS_H,
      wNorm: layout.cardSize / CANVAS_W,
      hNorm: layout.cardSize / CANVAS_H,
    };
  });
}

function buildMatchingJson({ title, theme, difficulty, pairs, grid, layout, pairOrder, folderRel }) {
  const matchRects = computeMatchRects(grid, layout);
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
      centerA: p.centerA,
      centerB: p.centerB,
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
    matchRects,
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
        centerA: p.centerA,
        centerB: p.centerB,
      };
    }),
    pairOrder,
  };
}

function buildActivityJson({ title, theme, difficulty, hookTitle, folderRel, matchRects, sceneImagePath }) {
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
    sceneImagePath: sceneImagePath ?? null,
    challengeAudioVolume: DEFAULT_CHALLENGE_AUDIO_VOLUME,
    tickAudioVolume: DEFAULT_TICK_AUDIO_VOLUME,
    transitionCueVolume: DEFAULT_TRANSITION_CUE_VOLUME,
    solveAudioVolume: DEFAULT_SOLVE_AUDIO_VOLUME,
    showJoyo: true,
    showBrandWatermark: false,
    sourceFolder: folderRel,
    matchRects,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  const seed = SEED_ARG ? Number(SEED_ARG) : hashStringToSeed(`${new Date().toISOString().slice(0,10)}|${TITLE}|${THEME}|${DIFFICULTY}|${PAIRS}pairs|${COLS}x${ROWS}`);
  const rng = mulberry32(seed);
  const slug = SLUG_ARG || `${new Date().toISOString().slice(0, 10)}-${TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)}-matching-${DIFFICULTY}`;
  const outDir = OUT_DIR_ARG ? path.resolve(ROOT, OUT_DIR_ARG) : path.join(OUTPUT_ROOT, slug);
  const folderRel = path.relative(ROOT, outDir).replace(/\\/g, '/');

  // Load themed word pool and sample pairs
  const family = resolveThemeFamily(THEME);
  const pool = await loadWordPack(family, PAIRS * 3);

  // For ocean: only keep labels whose name exactly matches a sticker PNG file.
  // DOLPHIN→dolphin, FISH→fish, CRAB→crab, OCTOPUS→octopus,
  // TURTLE→turtle, SEAHORSE→seahorse are verified. Labels like PEARL,
  // ANCHOR, TRIDENT have no sticker PNGs and are excluded.
  const oceanLabelToSticker = {
    DOLPHIN:  'dolphin',
    FISH:     'fish',
    CRAB:     'crab',
    OCTOPUS:  'octopus',
    TURTLE:   'turtle',
    SEAHORSE: 'seahorse',
  };
  const filteredPool = family === 'ocean'
    ? pool.filter(l => oceanLabelToSticker[l] != null)
    : pool;

  const shuffled = shuffleInPlace([...filteredPool], rng);
  const selectedPairs = shuffled.slice(0, PAIRS);

  // 8-card layout: 4 cols × 2 rows (max 8 cards).
  // 2x6 layout: 6 cols x 2 rows (12 cards, 6 pairs).
  // Each pair occupies one column: row 0 card + row 1 card in the same column.
  // Ocean theme: 6 valid pairs (FISH, DOLPHIN, CRAB, OCTOPUS, TURTLE, SEAHORSE).
  const actualCols = 6;
  const actualRows = 2;
  const gridPairs = family === 'ocean' ? Math.min(PAIRS, 6) : PAIRS;

  // cardLabels: two copies of each of the gridPairs labels, shuffled.
  const pairSlice = selectedPairs.slice(0, gridPairs);
  const row0Labels = [...pairSlice];
  const row1Labels = [...pairSlice].reverse();
  const cardLabels = [...row0Labels, ...row1Labels];

  // row0: grid indices for row 0 (0-5), row1: grid indices for row 1 (6-11)
  const row0 = [0, 1, 2, 3, 4, 5];
  const row1 = [6, 7, 8, 9, 10, 11];

  // gridRow0[i] = column i in row 0,  gridRow1[i] = column i in row 1
  const gridRow0 = cardLabels.slice(0, actualCols).map((item, i) => ({ index: row0[i], row: 0, col: i, item }));
  const gridRow1 = cardLabels.slice(actualCols, actualCols * 2).map((item, i) => ({ index: row1[i], row: 1, col: i, item }));
  const grid = [...gridRow0, ...gridRow1];

  // Build pairs by looking up actual grid cell positions via buildMatchingPairs
  const pairs = buildMatchingPairs(pairSlice, grid);

  // pairOrder: sort by yMidpoint so left-to-right pairs reveal left-to-right in P3
  const _po = pairs.map((p, i) => ({ i, yMid: (p.centerA.y + p.centerB.y) / 2 }));
  _po.sort((a, b) => a.yMid - b.yMid || a.i - b.i);
  const pairOrder = _po.map(v => v.i);

  const layout = buildLayout(actualCols, actualRows);

  const hookTitle = await buildChallengeHook({
    theme: THEME,
    puzzleType: PUZZLE_TYPE,
    difficulty: DIFFICULTY,
    seedHint: `${TITLE}|${THEME}|${DIFFICULTY}`,
  });

  const stickerTheme = resolveStickerTheme(family);
  const stickerAssignments = await resolveStickerAssignments(selectedPairs, grid, stickerTheme, rng);
  if (stickerAssignments) {
    const stickerCount = Object.keys(stickerAssignments).length;
    console.log(`[matching-factory] stickerTheme: ${stickerTheme} (${stickerCount} cards wired)`);
  } else {
    console.log(`[matching-factory] stickerTheme: ${stickerTheme} (no PNGs found — using card backs)`);
  }

  // ── Asset library: check for a pre-made scene background ─────────────────────
  // pickAsset returns an absolute path to a PNG in assets/generated/matching-scenes/<theme>/main/
  // or null if no images exist for this theme. Fallback = white SVG background.
  // Ocean scene PNG as background for Remotion's sceneBackgroundPath prop.
  // Copies the known ocean scene PNG to the output folder so Remotion can reference it.
  // Falls back gracefully if the copy fails (background.png won't be written).
  const oceanScenePath = path.join(ROOT, 'assets', 'generated', 'coloring-pages', 'ocean', 'ocean-animals-1.png');
  let sceneBgDataUrl = null;
  let sceneImagePathRel = null;
  try {
    const buf = await fs.readFile(oceanScenePath);
    sceneBgDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    await fs.copyFile(oceanScenePath, path.join(outDir, 'background.png'));
    sceneImagePathRel = `${folderRel}/background.png`;
    console.log(`[matching-factory] scene bg    : ${path.relative(ROOT, oceanScenePath)}`);
  } catch (err) {
    console.log(`[matching-factory] scene bg    : none (ocean PNG unavailable: ${err.code})`);
  }

  const matchingJson = buildMatchingJson({ title: TITLE, theme: THEME, difficulty: DIFFICULTY, pairs, grid, layout, pairOrder, folderRel });
  const activityJson = buildActivityJson({ title: TITLE, theme: THEME, difficulty: DIFFICULTY, hookTitle, folderRel, matchRects: matchingJson.matchRects, sceneImagePath: sceneImagePathRel });

  console.log(`[matching-factory] title      : ${TITLE}`);
  console.log(`[matching-factory] theme      : ${THEME}`);
  console.log(`[matching-factory] family    : ${family}`);
  console.log(`[matching-factory] stickerTheme: ${stickerTheme}`);
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

  // Write JSON sidecars
  await Promise.all([
    fs.writeFile(path.join(outDir, 'matching.json'), JSON.stringify(matchingJson, null, 2)),
    fs.writeFile(path.join(outDir, 'activity.json'), JSON.stringify(activityJson, null, 2)),
  ]);

  // Build blank.png — scene background (if available) + card stickers as overlays in Remotion
  const blankSvg = buildBlankSvg(layout, grid, null, sceneBgDataUrl);
  await fs.writeFile(path.join(outDir, 'blank.svg'), blankSvg, 'utf8');
  const blankPng = await sharp(Buffer.from(blankSvg)).png().toBuffer();
  await fs.writeFile(path.join(outDir, 'blank.png'), blankPng);
  await fs.copyFile(path.join(outDir, 'blank.png'), path.join(outDir, 'puzzle.png'));

  // solved.png — same scene background + colored cards + connection labels
  const solvedSvg = buildSolvedSvg(layout, pairs, grid, sceneBgDataUrl);
  await fs.writeFile(path.join(outDir, 'solved.svg'), solvedSvg, 'utf8');
  const solvedPng = await sharp(Buffer.from(solvedSvg)).png().toBuffer();
  await fs.writeFile(path.join(outDir, 'solved.png'), solvedPng);

  console.log('[matching-factory] wrote files:');
  for (const file of ['activity.json', 'matching.json', 'blank.svg', 'blank.png', 'solved.svg', 'solved.png', 'puzzle.png']) {
    console.log(`  - ${path.join(outDir, file)}`);
  }
}

main().catch((error) => {
  console.error('[matching-factory] failed:', error);
  process.exit(1);
});

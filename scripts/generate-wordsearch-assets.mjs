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
const BG_COLOR = '#FFFFFF';
const GRID_COLOR = '#222222';
const LETTER_COLOR = '#111111';
const HIGHLIGHT_COLOR = '#FF9A3D';
const HEADER_COLOR = '#222222';
const SUBTEXT_COLOR = '#666666';

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (flag, fallback = null) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] ?? fallback : fallback;
};

const DRY_RUN = hasFlag('--dry-run');
const TITLE = getArg('--title', 'Garden Word Search');
const THEME = getArg('--theme', TITLE);
const DIFFICULTY = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const COUNTDOWN_SEC = Number(getArg('--countdown', '17'));
const SOLVE_DURATION_SEC = 15;
const DEFAULT_CHALLENGE_AUDIO_VOLUME = 0.1;
const DEFAULT_TICK_AUDIO_VOLUME = 0.3;
const DEFAULT_TRANSITION_CUE_VOLUME = 0.24;
const DEFAULT_SOLVE_AUDIO_VOLUME = 0.48;
const SEED_ARG = getArg('--seed');
const SLUG_ARG = getArg('--slug');
const OUT_DIR_ARG = getArg('--out-dir');
const WORDS_ARG = getArg('--words');

const difficultyDefaults = {
  easy: { size: 10, words: 6, directions: ['right', 'down'] },
  medium: { size: 12, words: 8, directions: ['right', 'down'] },
  hard: { size: 14, words: 10, directions: ['right', 'down', 'diag-down-right', 'diag-up-right'] },
  difficult: { size: 15, words: 11, directions: ['right', 'left', 'down', 'up', 'diag-down-right', 'diag-up-right'] },
  extreme: { size: 16, words: 12, directions: ['right', 'left', 'down', 'up', 'diag-down-right', 'diag-up-right', 'diag-down-left', 'diag-up-left'] },
};

const WORD_BANK = {
  garden: ['FLOWER', 'BUTTERFLY', 'LEAF', 'BEE', 'ROSE', 'TULIP', 'SEED', 'GRASS', 'STEM', 'LADYBUG', 'ROOT', 'SOIL'],
  ocean: ['WHALE', 'CORAL', 'SHELL', 'WAVE', 'REEF', 'STARFISH', 'OCTOPUS', 'TIDE', 'CRAB', 'SEAHORSE'],
  animal: ['TIGER', 'ZEBRA', 'PANDA', 'MONKEY', 'LION', 'KOALA', 'OTTER', 'EAGLE', 'FOX', 'RABBIT'],
  default: ['APPLE', 'SUN', 'CLOUD', 'BIRD', 'TREE', 'MOON', 'STAR', 'RIVER', 'GRASS', 'STONE', 'HOUSE', 'SMILE'],
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

function pickWords(theme, count, rng) {
  const lower = String(theme || '').toLowerCase();
  const bankKey = Object.keys(WORD_BANK).find((key) => key !== 'default' && lower.includes(key)) || 'default';
  const bank = WORD_BANK[bankKey];
  return shuffle(bank, rng).slice(0, Math.min(count, bank.length));
}

function parseWords(wordsArg, fallbackTheme, count, rng) {
  if (!wordsArg) return pickWords(fallbackTheme, count, rng);
  return wordsArg
    .split(',')
    .map((w) => w.trim().toUpperCase().replace(/[^A-Z]/g, ''))
    .filter(Boolean)
    .slice(0, count);
}

function buildGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(''));
}

function canPlaceWord(grid, word, row, col, dr, dc) {
  const size = grid.length;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (r < 0 || r >= size || c < 0 || c >= size) return false;
    const existing = grid[r][c];
    if (existing && existing !== word[i]) return false;
  }
  return true;
}

function placeWord(grid, word, row, col, dr, dc) {
  const cells = [];
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    grid[r][c] = word[i];
    cells.push({ r, c });
  }
  return cells;
}

function generateWordSearch(size, words, rng, allowedDirectionKeys) {
  const grid = buildGrid(size);
  const placements = [];
  const allDirections = [
    { key: 'right', dr: 0, dc: 1 },
    { key: 'down', dr: 1, dc: 0 },
    { key: 'diag-down-right', dr: 1, dc: 1 },
    { key: 'diag-up-right', dr: -1, dc: 1 },
    { key: 'left', dr: 0, dc: -1 },
    { key: 'up', dr: -1, dc: 0 },
    { key: 'diag-up-left', dr: -1, dc: -1 },
    { key: 'diag-down-left', dr: 1, dc: -1 },
  ];
  const directions = allDirections.filter((dir) => allowedDirectionKeys.includes(dir.key));

  for (const word of words.sort((a, b) => b.length - a.length)) {
    let placed = false;
    const attempts = 600;
    for (let attempt = 0; attempt < attempts && !placed; attempt++) {
      const dir = directions[randomInt(rng, directions.length)];
      const inset = attempt < 350 ? 1 : 0;
      const row = inset + randomInt(rng, Math.max(1, size - inset * 2));
      const col = inset + randomInt(rng, Math.max(1, size - inset * 2));
      if (!canPlaceWord(grid, word, row, col, dir.dr, dir.dc)) continue;
      const cells = word.split('').map((_, i) => ({ r: row + dir.dr * i, c: col + dir.dc * i }));
      const touchesEdge = cells.some((cell) => cell.r === 0 || cell.c === 0 || cell.r === size - 1 || cell.c === size - 1);
      if (touchesEdge && attempt < 350) continue;
      placeWord(grid, word, row, col, dir.dr, dir.dc);
      placements.push({ word, row, col, dr: dir.dr, dc: dir.dc, direction: dir.key, cells });
      placed = true;
    }
    if (!placed) throw new Error(`Could not place word: ${word}`);
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c]) grid[r][c] = alphabet[randomInt(rng, alphabet.length)];
    }
  }

  placements.sort((a, b) => a.word.localeCompare(b.word));
  return { grid, placements };
}

function buildLayout(size, wordCount) {
  const sideMargin = 210;
  const topMargin = 330;
  const gridArea = CANVAS_W - sideMargin * 2;
  const cell = Math.floor(gridArea / size);
  const gridSizePx = cell * size;
  const gridX = Math.round((CANVAS_W - gridSizePx) / 2);
  const gridY = topMargin;
  const wordsTop = gridY + gridSizePx + 110;
  const wordCols = wordCount > 8 ? 3 : 2;
  return { cell, gridSizePx, gridX, gridY, wordsTop, wordCols };
}

function placementRect(placement, layout) {
  const rows = placement.cells.map((cell) => cell.r);
  const cols = placement.cells.map((cell) => cell.c);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const pad = layout.cell * 0.1;
  const x1 = layout.gridX + minCol * layout.cell - pad;
  const y1 = layout.gridY + minRow * layout.cell - pad;
  const x2 = layout.gridX + (maxCol + 1) * layout.cell + pad;
  const y2 = layout.gridY + (maxRow + 1) * layout.cell + pad;
  return { x1, y1, x2, y2 };
}

function normalizedRect(rect) {
  return {
    x1: Number((rect.x1 / CANVAS_W).toFixed(6)),
    y1: Number((rect.y1 / CANVAS_H).toFixed(6)),
    x2: Number((rect.x2 / CANVAS_W).toFixed(6)),
    y2: Number((rect.y2 / CANVAS_H).toFixed(6)),
  };
}

function escapeXml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wordsListSvg(words, layout) {
  const colWidth = 400;
  return words.map((word, index) => {
    const col = index % layout.wordCols;
    const row = Math.floor(index / layout.wordCols);
    const x = 260 + col * colWidth;
    const y = layout.wordsTop + row * 64;
    return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="${HEADER_COLOR}">${escapeXml(word)}</text>`;
  }).join('\n    ');
}

function gridSvg(grid, layout) {
  const size = grid.length;
  const lines = [];
  for (let i = 0; i <= size; i++) {
    const offset = i * layout.cell;
    const x = layout.gridX + offset;
    const y = layout.gridY + offset;
    lines.push(`<line x1="${layout.gridX}" y1="${y}" x2="${layout.gridX + layout.gridSizePx}" y2="${y}" />`);
    lines.push(`<line x1="${x}" y1="${layout.gridY}" x2="${x}" y2="${layout.gridY + layout.gridSizePx}" />`);
  }

  const letters = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const x = layout.gridX + c * layout.cell + layout.cell / 2;
      const y = layout.gridY + r * layout.cell + layout.cell * 0.69;
      letters.push(`<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="${LETTER_COLOR}">${grid[r][c]}</text>`);
    }
  }

  return { lines, letters };
}

function buildHookTitle(wordsCount) {
  return `ONLY SHARP EYES FIND ALL ${wordsCount} WORDS`;
}

function buildSvg({ title, theme, grid, layout, rects = [] }) {
  const { lines, letters } = gridSvg(grid, layout);
  const highlights = rects.map((rect) => `<rect x="${(rect.x1 + 5).toFixed(1)}" y="${(rect.y1 + 5).toFixed(1)}" width="${Math.max(0, rect.x2 - rect.x1 - 10).toFixed(1)}" height="${Math.max(0, rect.y2 - rect.y1 - 10).toFixed(1)}" rx="16" ry="16" fill="none" stroke="${HIGHLIGHT_COLOR}" stroke-width="8" stroke-linejoin="round" />`).join('\n    ');

  return `
<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${BG_COLOR}"/>
  <g>${highlights}</g>
  <g stroke="${GRID_COLOR}" stroke-width="3">
    ${lines.join('\n    ')}
  </g>
  <g>
    ${letters.join('\n    ')}
  </g>
  <g>
    ${wordsListSvg(theme.words, layout)}
  </g>
</svg>`.trim();
}

async function writeSvgPng(svg, outSvgPath, outPngPath) {
  await fs.writeFile(outSvgPath, svg, 'utf8');
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(outPngPath, pngBuffer);
}

async function main() {
  const seed = SEED_ARG ? Number(SEED_ARG) : hashStringToSeed(`${TITLE}|${THEME}|${DIFFICULTY}|wordsearch`);
  const rng = mulberry32(seed);
  const defaults = difficultyDefaults[DIFFICULTY] || difficultyDefaults.medium;
  const words = parseWords(WORDS_ARG, THEME, defaults.words, rng);
  const { grid, placements } = generateWordSearch(defaults.size, words, rng, defaults.directions);
  const layout = buildLayout(defaults.size, words.length);
  const rects = placements.map((placement) => placementRect(placement, layout));
  const normalizedRects = rects.map(normalizedRect);

  const slug = SLUG_ARG || `${new Date().toISOString().slice(0, 10)}-${slugify(TITLE || THEME || 'word-search')}-${slugify(DIFFICULTY)}`;
  const outDir = OUT_DIR_ARG ? path.resolve(ROOT, OUT_DIR_ARG) : path.join(OUTPUT_ROOT, slug);
  const folderRel = path.relative(ROOT, outDir).replace(/\\/g, '/');

  const hookTitle = buildHookTitle(words.length);
  const blankSvg = buildSvg({ title: TITLE, theme: { words }, grid, layout, rects: [] });
  const solvedSvg = buildSvg({ title: TITLE, theme: { words }, grid, layout, rects });

  const activityJson = {
    type: 'challenge',
    puzzleType: 'word-search',
    difficulty: DIFFICULTY,
    theme: THEME,
    titleText: hookTitle,
    hookText: hookTitle,
    ctaText: 'Tag a kid who can find them all',
    activityLabel: 'WORD SEARCH',
    countdownSec: COUNTDOWN_SEC,
    hookDurationSec: 2.5,
    holdAfterSec: SOLVE_DURATION_SEC,
    imagePath: 'puzzle.png',
    blankImage: 'blank.png',
    solvedImage: 'solved.png',
    highlightColor: HIGHLIGHT_COLOR,
    challengeAudioVolume: DEFAULT_CHALLENGE_AUDIO_VOLUME,
    tickAudioVolume: DEFAULT_TICK_AUDIO_VOLUME,
    transitionCueVolume: DEFAULT_TRANSITION_CUE_VOLUME,
    solveAudioVolume: DEFAULT_SOLVE_AUDIO_VOLUME,
    showJoyo: true,
    showBrandWatermark: false,
    sourceFolder: folderRel,
  };

  const wordsearchJson = {
    width: CANVAS_W,
    height: CANVAS_H,
    highlightColor: HIGHLIGHT_COLOR,
    rects: normalizedRects,
    words,
    placements,
    grid,
  };

  const puzzleJson = {
    version: 1,
    puzzleType: 'word-search',
    title: TITLE,
    theme: THEME,
    difficulty: DIFFICULTY,
    seed,
    gridSize: defaults.size,
    words,
    placements,
    grid,
  };

  console.log(`[wordsearch-factory] title      : ${TITLE}`);
  console.log(`[wordsearch-factory] theme      : ${THEME}`);
  console.log(`[wordsearch-factory] outDir     : ${outDir}`);
  console.log(`[wordsearch-factory] seed       : ${seed}`);
  console.log(`[wordsearch-factory] difficulty : ${DIFFICULTY}`);
  console.log(`[wordsearch-factory] grid       : ${defaults.size}x${defaults.size}`);
  console.log(`[wordsearch-factory] words      : ${words.join(', ')}`);
  console.log(`[wordsearch-factory] directions : ${defaults.directions.join(', ')}`);

  if (DRY_RUN) {
    console.log('[wordsearch-factory] dry-run only, no files written.');
    return;
  }

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outDir, 'activity.json'), JSON.stringify(activityJson, null, 2)),
    fs.writeFile(path.join(outDir, 'wordsearch.json'), JSON.stringify(wordsearchJson, null, 2)),
    fs.writeFile(path.join(outDir, 'puzzle.json'), JSON.stringify(puzzleJson, null, 2)),
  ]);
  await writeSvgPng(blankSvg, path.join(outDir, 'blank.svg'), path.join(outDir, 'blank.png'));
  await writeSvgPng(solvedSvg, path.join(outDir, 'solved.svg'), path.join(outDir, 'solved.png'));
  await fs.copyFile(path.join(outDir, 'blank.png'), path.join(outDir, 'puzzle.png'));

  console.log('[wordsearch-factory] wrote files:');
  for (const file of ['activity.json', 'wordsearch.json', 'puzzle.json', 'blank.svg', 'blank.png', 'puzzle.png', 'solved.svg', 'solved.png']) {
    console.log(`  - ${path.join(outDir, file)}`);
  }
}

main().catch((error) => {
  console.error('[wordsearch-factory] failed:', error);
  process.exit(1);
});

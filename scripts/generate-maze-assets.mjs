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
const DEFAULT_PATH_COLOR = '#22BB44';
const WALL_COLOR = '#121827';
const BG_COLOR = '#FFFFFF';
const SOLUTION_STROKE = 24;
const WALL_STROKE = 7;

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (flag, fallback = null) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] ?? fallback : fallback;
};

const DRY_RUN = hasFlag('--dry-run');
const TITLE = getArg('--title', 'Garden Maze');
const THEME = getArg('--theme', TITLE);
const SHAPE = getArg('--shape', 'rectangle');
const DIFFICULTY = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const PUZZLE_TYPE = 'maze';
const COUNTDOWN_SEC = Number(getArg('--countdown', '15'));
const SOLVE_DURATION_SEC = 12;
const DEFAULT_CHALLENGE_AUDIO_VOLUME = 0.11;
const DEFAULT_TICK_AUDIO_VOLUME = 0.3;
const DEFAULT_TRANSITION_CUE_VOLUME = 0.24;
const DEFAULT_SOLVE_AUDIO_VOLUME = 0.52;
const CELL_SIZE = Number(getArg('--cell-size', '0')) || null;
const PATH_COLOR = getArg('--path-color', DEFAULT_PATH_COLOR);
const SEED_ARG = getArg('--seed');
const SLUG_ARG = getArg('--slug');
const OUT_DIR_ARG = getArg('--out-dir');

const difficultyDefaults = {
  easy: { rows: 8, cols: 8 },
  medium: { rows: 12, cols: 9 },
  hard: { rows: 15, cols: 11 },
  difficult: { rows: 18, cols: 13 },
  extreme: { rows: 22, cols: 16 },
};

const explicitRows = Number(getArg('--rows', '0')) || null;
const explicitCols = Number(getArg('--cols', '0')) || null;
const dims = difficultyDefaults[DIFFICULTY] || difficultyDefaults.medium;
const ROWS = explicitRows ?? dims.rows;
const COLS = explicitCols ?? dims.cols;

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
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

function buildMaze(rows, cols, rng) {
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({
    top: true,
    right: true,
    bottom: true,
    left: true,
    visited: false,
  })));

  const stack = [{ r: 0, c: 0 }];
  cells[0][0].visited = true;

  const directions = [
    { dr: -1, dc: 0, wall: 'top', opposite: 'bottom' },
    { dr: 0, dc: 1, wall: 'right', opposite: 'left' },
    { dr: 1, dc: 0, wall: 'bottom', opposite: 'top' },
    { dr: 0, dc: -1, wall: 'left', opposite: 'right' },
  ];

  while (stack.length) {
    const current = stack[stack.length - 1];
    const neighbors = shuffleInPlace(
      directions
        .map((d) => ({ ...d, nr: current.r + d.dr, nc: current.c + d.dc }))
        .filter((d) => d.nr >= 0 && d.nr < rows && d.nc >= 0 && d.nc < cols && !cells[d.nr][d.nc].visited),
      rng,
    );

    if (!neighbors.length) {
      stack.pop();
      continue;
    }

    const next = neighbors[0];
    cells[current.r][current.c][next.wall] = false;
    cells[next.nr][next.nc][next.opposite] = false;
    cells[next.nr][next.nc].visited = true;
    stack.push({ r: next.nr, c: next.nc });
  }

  for (const row of cells) for (const cell of row) delete cell.visited;
  cells[0][0].top = false;
  cells[rows - 1][cols - 1].bottom = false;
  return cells;
}

function solveMaze(cells) {
  const rows = cells.length;
  const cols = cells[0].length;
  const queue = [{ r: 0, c: 0 }];
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const parent = Array.from({ length: rows }, () => Array(cols).fill(null));
  visited[0][0] = true;

  const moves = [
    { dr: -1, dc: 0, wall: 'top' },
    { dr: 0, dc: 1, wall: 'right' },
    { dr: 1, dc: 0, wall: 'bottom' },
    { dr: 0, dc: -1, wall: 'left' },
  ];

  while (queue.length) {
    const current = queue.shift();
    if (current.r === rows - 1 && current.c === cols - 1) break;

    for (const move of moves) {
      if (cells[current.r][current.c][move.wall]) continue;
      const nr = current.r + move.dr;
      const nc = current.c + move.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || visited[nr][nc]) continue;
      visited[nr][nc] = true;
      parent[nr][nc] = current;
      queue.push({ r: nr, c: nc });
    }
  }

  const path = [];
  let cur = { r: rows - 1, c: cols - 1 };
  while (cur) {
    path.push(cur);
    cur = parent[cur.r][cur.c];
  }
  path.reverse();
  return path;
}

function countDeadEnds(cells) {
  let count = 0;
  for (const row of cells) {
    for (const cell of row) {
      const openings = Number(!cell.top) + Number(!cell.right) + Number(!cell.bottom) + Number(!cell.left);
      if (openings === 1) count++;
    }
  }
  return count;
}

function buildLayout(rows, cols, shape, requestedCellSize = null) {
  const topMargin = 320;
  const bottomMargin = 360;
  const sideMargin = 300;
  const availableW = CANVAS_W - sideMargin * 2;
  const availableH = CANVAS_H - topMargin - bottomMargin;
  const baseCell = requestedCellSize ?? Math.floor(Math.min(availableW / cols, availableH / rows));
  const mazeW = baseCell * cols;
  const mazeH = baseCell * rows;
  const offsetX = Math.round((CANVAS_W - mazeW) / 2);
  const offsetY = Math.round(topMargin + (availableH - mazeH) / 2);
  return { shape, cell: baseCell, mazeW, mazeH, offsetX, offsetY, canvasW: CANVAS_W, canvasH: CANVAS_H };
}

function cellCenter(layout, r, c) {
  return {
    x: layout.offsetX + c * layout.cell + layout.cell / 2,
    y: layout.offsetY + r * layout.cell + layout.cell / 2,
  };
}

function buildSolutionPolyline(pathCells, layout) {
  const points = [];
  const start = cellCenter(layout, pathCells[0].r, pathCells[0].c);
  points.push({ x: start.x, y: layout.offsetY - layout.cell * 0.35 });
  for (const cell of pathCells) points.push(cellCenter(layout, cell.r, cell.c));
  const last = cellCenter(layout, pathCells[pathCells.length - 1].r, pathCells[pathCells.length - 1].c);
  points.push({ x: last.x, y: layout.offsetY + layout.mazeH + layout.cell * 0.35 });
  return points;
}

function normalizedWaypoints(polyline, layout) {
  return polyline.map((p) => ({
    x: Number((p.x / layout.canvasW).toFixed(6)),
    y: Number((p.y / layout.canvasH).toFixed(6)),
  }));
}

function buildWallSegments(cells, layout) {
  const segments = [];
  const rows = cells.length;
  const cols = cells[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      const x = layout.offsetX + c * layout.cell;
      const y = layout.offsetY + r * layout.cell;
      const x2 = x + layout.cell;
      const y2 = y + layout.cell;
      if (cell.top) segments.push([x, y, x2, y]);
      if (cell.left) segments.push([x, y, x, y2]);
      if (r === rows - 1 && cell.bottom) segments.push([x, y2, x2, y2]);
      if (c === cols - 1 && cell.right) segments.push([x2, y, x2, y2]);
    }
  }
  return mergeWallSegments(segments);
}

function mergeWallSegments(segments) {
  const horizontal = new Map();
  const vertical = new Map();

  for (const [x1, y1, x2, y2] of segments) {
    if (y1 === y2) {
      const key = y1.toFixed(3);
      const list = horizontal.get(key) || [];
      list.push([Math.min(x1, x2), Math.max(x1, x2)]);
      horizontal.set(key, list);
    } else if (x1 === x2) {
      const key = x1.toFixed(3);
      const list = vertical.get(key) || [];
      list.push([Math.min(y1, y2), Math.max(y1, y2)]);
      vertical.set(key, list);
    }
  }

  const merged = [];
  for (const [yKey, list] of horizontal.entries()) {
    list.sort((a, b) => a[0] - b[0]);
    let [start, end] = list[0];
    for (let i = 1; i < list.length; i++) {
      const [nextStart, nextEnd] = list[i];
      if (nextStart <= end + 0.001) end = Math.max(end, nextEnd);
      else {
        merged.push([start, Number(yKey), end, Number(yKey)]);
        [start, end] = [nextStart, nextEnd];
      }
    }
    merged.push([start, Number(yKey), end, Number(yKey)]);
  }

  for (const [xKey, list] of vertical.entries()) {
    list.sort((a, b) => a[0] - b[0]);
    let [start, end] = list[0];
    for (let i = 1; i < list.length; i++) {
      const [nextStart, nextEnd] = list[i];
      if (nextStart <= end + 0.001) end = Math.max(end, nextEnd);
      else {
        merged.push([Number(xKey), start, Number(xKey), end]);
        [start, end] = [nextStart, nextEnd];
      }
    }
    merged.push([Number(xKey), start, Number(xKey), end]);
  }

  return merged;
}

function polylinePoints(points) {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function buildSvg({ cells, layout, solutionPoints = null, pathColor = DEFAULT_PATH_COLOR }) {
  const wallSegments = buildWallSegments(cells, layout);
  const startX = layout.offsetX + layout.cell / 2;
  const startY = layout.offsetY - 56;
  const endX = layout.offsetX + layout.mazeW - layout.cell / 2;
  const endY = layout.offsetY + layout.mazeH + 96;
  const solutionPolyline = solutionPoints ? `
    <polyline points="${polylinePoints(solutionPoints)}" fill="none" stroke="${pathColor}" stroke-width="${SOLUTION_STROKE}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92" />` : '';

  return `
<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${BG_COLOR}"/>
  <text x="${startX}" y="${startY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#222222">Start</text>
  <text x="${endX}" y="${endY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#222222">End</text>
  <g stroke="${WALL_COLOR}" stroke-width="${WALL_STROKE}" stroke-linecap="round" stroke-linejoin="round">
    ${wallSegments.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`).join('\n    ')}
  </g>${solutionPolyline}
</svg>`.trim();
}

async function writeSvgPng(svg, outSvgPath, outPngPath) {
  await fs.writeFile(outSvgPath, svg, 'utf8');
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(outPngPath, pngBuffer);
}

function buildHookTitle({ puzzleType, difficulty }) {
  if (puzzleType === 'maze') {
    if (difficulty === 'hard' || difficulty === 'difficult' || difficulty === 'extreme') return 'ONLY SHARP KIDS BEAT THIS MAZE';
    return 'ONLY SHARP KIDS SOLVE THIS MAZE';
  }
  return 'ONLY SHARP KIDS SOLVE THIS';
}

function buildMetadata({ seed, title, theme, shape, difficulty, rows, cols, cells, solutionCells, solutionPoints, layout, folderRel }) {
  const mazeJson = {
    version: 1,
    puzzleType: PUZZLE_TYPE,
    title,
    theme,
    seed,
    shape,
    difficulty,
    rows,
    cols,
    entrance: { side: 'top', row: 0, col: 0 },
    exit: { side: 'bottom', row: rows - 1, col: cols - 1 },
    walls: cells,
    solutionCells,
    metrics: {
      deadEnds: countDeadEnds(cells),
      solutionSteps: solutionCells.length,
      canvasWidth: layout.canvasW,
      canvasHeight: layout.canvasH,
      mazeWidth: layout.mazeW,
      mazeHeight: layout.mazeH,
      cellSize: layout.cell,
    },
  };

  const pathJson = {
    width: layout.canvasW,
    height: layout.canvasH,
    pathColor: PATH_COLOR,
    waypoints: normalizedWaypoints(solutionPoints, layout),
  };

  const hookTitle = buildHookTitle({ puzzleType: PUZZLE_TYPE, difficulty });

  const activityJson = {
    type: 'challenge',
    puzzleType: PUZZLE_TYPE,
    shape,
    difficulty,
    theme,
    titleText: hookTitle,
    hookText: hookTitle,
    ctaText: 'Tag a kid who can beat the timer',
    activityLabel: 'MAZE',
    countdownSec: COUNTDOWN_SEC,
    hookDurationSec: 2.5,
    holdAfterSec: SOLVE_DURATION_SEC,
    imagePath: 'puzzle.png',
    blankImage: 'blank.png',
    solvedImage: 'solved.png',
    pathColor: PATH_COLOR,
    challengeAudioVolume: DEFAULT_CHALLENGE_AUDIO_VOLUME,
    tickAudioVolume: DEFAULT_TICK_AUDIO_VOLUME,
    transitionCueVolume: DEFAULT_TRANSITION_CUE_VOLUME,
    solveAudioVolume: DEFAULT_SOLVE_AUDIO_VOLUME,
    showJoyo: true,
    showBrandWatermark: false,
    sourceFolder: folderRel,
  };

  return { mazeJson, pathJson, activityJson };
}

function summarizeReferenceComparison(shape, difficulty, rows, cols) {
  return {
    notes: [
      'Phase 1 renderer targets clean social-video readability over print-density complexity.',
      'Reference maze corpus should be used later to calibrate difficulty tiers, margins, and branch density.',
      `Current generator supports shape=${shape} contract, with Phase 1 rendering optimized for rectangular grids.`,
      `Difficulty preset ${difficulty} resolved to ${rows}x${cols} after the benchmark-fit tuning pass.`,
    ],
  };
}

async function main() {
  const seed = SEED_ARG ? Number(SEED_ARG) : hashStringToSeed(`${TITLE}|${THEME}|${DIFFICULTY}|${SHAPE}|${ROWS}x${COLS}`);
  const rng = mulberry32(seed);
  const slug = SLUG_ARG || `${new Date().toISOString().slice(0, 10)}-${slugify(TITLE || THEME || 'maze')}-${slugify(DIFFICULTY)}-${slugify(SHAPE)}`;
  const outDir = OUT_DIR_ARG ? path.resolve(ROOT, OUT_DIR_ARG) : path.join(OUTPUT_ROOT, slug);
  const folderRel = path.relative(ROOT, outDir).replace(/\\/g, '/');

  if (!['square', 'rectangle'].includes(SHAPE)) {
    console.warn(`[maze-factory] shape=${SHAPE} not implemented yet, falling back to rectangular Phase 1 renderer while preserving shape in metadata.`);
  }

  const cells = buildMaze(ROWS, COLS, rng);
  const solutionCells = solveMaze(cells);
  const layout = buildLayout(ROWS, COLS, SHAPE, CELL_SIZE);
  const solutionPoints = buildSolutionPolyline(solutionCells, layout);
  const blankSvg = buildSvg({ cells, layout });
  const solvedSvg = buildSvg({ cells, layout, solutionPoints, pathColor: PATH_COLOR });
  const { mazeJson, pathJson, activityJson } = buildMetadata({
    seed,
    title: TITLE,
    theme: THEME,
    shape: SHAPE,
    difficulty: DIFFICULTY,
    rows: ROWS,
    cols: COLS,
    cells,
    solutionCells,
    solutionPoints,
    layout,
    folderRel,
  });
  const benchmarkJson = summarizeReferenceComparison(SHAPE, DIFFICULTY, ROWS, COLS);

  console.log(`[maze-factory] title       : ${TITLE}`);
  console.log(`[maze-factory] theme       : ${THEME}`);
  console.log(`[maze-factory] outDir      : ${outDir}`);
  console.log(`[maze-factory] seed        : ${seed}`);
  console.log(`[maze-factory] shape       : ${SHAPE}`);
  console.log(`[maze-factory] difficulty  : ${DIFFICULTY}`);
  console.log(`[maze-factory] grid        : ${ROWS}x${COLS}`);
  console.log(`[maze-factory] solution    : ${solutionCells.length} cells, ${mazeJson.metrics.deadEnds} dead ends`);

  if (DRY_RUN) {
    console.log('[maze-factory] dry-run only, no files written.');
    return;
  }

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outDir, 'maze.json'), JSON.stringify(mazeJson, null, 2)),
    fs.writeFile(path.join(outDir, 'path.json'), JSON.stringify(pathJson, null, 2)),
    fs.writeFile(path.join(outDir, 'activity.json'), JSON.stringify(activityJson, null, 2)),
    fs.writeFile(path.join(outDir, '_benchmark-notes.json'), JSON.stringify(benchmarkJson, null, 2)),
  ]);
  await writeSvgPng(blankSvg, path.join(outDir, 'blank.svg'), path.join(outDir, 'blank.png'));
  await writeSvgPng(solvedSvg, path.join(outDir, 'solved.svg'), path.join(outDir, 'solved.png'));
  await fs.copyFile(path.join(outDir, 'blank.png'), path.join(outDir, 'puzzle.png'));

  console.log('[maze-factory] wrote files:');
  for (const file of ['activity.json', 'maze.json', 'path.json', 'blank.svg', 'blank.png', 'puzzle.png', 'solved.svg', 'solved.png', '_benchmark-notes.json']) {
    console.log(`  - ${path.join(outDir, file)}`);
  }
}

function capitalize(value) {
  const str = String(value || '');
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}

main().catch((error) => {
  console.error('[maze-factory] failed:', error);
  process.exit(1);
});

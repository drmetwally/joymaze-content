#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { buildChallengeHook } from './lib/challenge-hooks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT, 'output', 'challenge', 'generated-activity');

const CANVAS_W = 1080;
const CANVAS_H = 1500;
const BG_COLOR = '#FAFAFA';

// Drawing area (normalized coords map into this zone)
const DA_X = 90, DA_Y = 150, DA_W = 900, DA_H = 1200;

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getArg = (f, def = null) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] ?? def : def;
};

const DRY_RUN     = hasFlag('--dry-run');
const TITLE       = getArg('--title', 'Connect the Dots');
const THEME       = getArg('--theme', TITLE);
const DIFFICULTY  = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const SEED_ARG    = getArg('--seed');
const SLUG_ARG    = getArg('--slug');
const OUT_DIR_ARG = getArg('--out-dir');

const PUZZLE_TYPE = 'dot-to-dot';
const DEFAULT_CHALLENGE_AUDIO_VOLUME = 0.11;
const DEFAULT_TICK_AUDIO_VOLUME = 0.3;
const DEFAULT_TRANSITION_CUE_VOLUME = 0.24;
const DEFAULT_SOLVE_AUDIO_VOLUME = 0.52;

const difficultyDefaults = {
  easy:   { minDots: 8,  maxDots: 12, complexity: 'simple' },
  medium: { minDots: 14, maxDots: 22, complexity: 'medium' },
  hard:   { minDots: 24, maxDots: 35, complexity: 'complex' },
};

// ── Seed helpers ─────────────────────────────────────────────────────────────

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randInt(rng, max) { return Math.floor(rng() * max); }
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Theme family ─────────────────────────────────────────────────────────────

function resolveThemeFamily(t) {
  const s = t.toLowerCase();
  if (s.includes('ocean') || s.includes('sea') || s.includes('fish')) return 'ocean';
  if (s.includes('space') || s.includes('rocket') || s.includes('planet')) return 'space';
  if (s.includes('jungle') || s.includes('safari') || s.includes('zoo')) return 'animals';
  return 'animals';
}

// ── Shape library ────────────────────────────────────────────────────────────

// Each shape: { name, dots: [[x,y],...], closed: bool }
// dots are in normalized 0-1 space relative to DA_W×DA_H

const SHAPES = {
  ocean: [
    {
      name: 'fish',
      dots: [
        [0.85, 0.50], [0.82, 0.35], [0.72, 0.22], [0.55, 0.18], [0.38, 0.20],
        [0.22, 0.25], [0.08, 0.12], [0.18, 0.42], [0.10, 0.50], [0.18, 0.58],
        [0.08, 0.88], [0.22, 0.75], [0.38, 0.80], [0.55, 0.82], [0.72, 0.78],
        [0.82, 0.65],
      ],
      closed: true,
    },
    {
      name: 'starfish',
      dots: (() => {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const angle = (i * 36 - 90) * Math.PI / 180;
          const r = i % 2 === 0 ? 0.44 : 0.18;
          pts.push([0.50 + Math.cos(angle) * r, 0.50 + Math.sin(angle) * r]);
        }
        return pts;
      })(),
      closed: true,
    },
    {
      name: 'crab',
      dots: [
        [0.50, 0.30], [0.65, 0.28], [0.80, 0.20], [0.92, 0.10], [0.90, 0.25],
        [0.82, 0.32], [0.88, 0.48], [0.82, 0.65], [0.70, 0.72], [0.55, 0.75],
        [0.50, 0.78], [0.45, 0.75], [0.30, 0.72], [0.18, 0.65], [0.12, 0.48],
        [0.18, 0.32], [0.10, 0.25], [0.08, 0.10], [0.20, 0.20], [0.35, 0.28],
      ],
      closed: true,
    },
    {
      name: 'whale',
      dots: [
        [0.15, 0.42], [0.10, 0.35], [0.20, 0.22], [0.42, 0.15], [0.65, 0.18],
        [0.78, 0.22], [0.82, 0.12], [0.86, 0.22], [0.90, 0.30], [0.98, 0.20],
        [0.92, 0.42], [0.98, 0.62], [0.90, 0.58], [0.75, 0.68], [0.45, 0.72],
        [0.15, 0.58],
      ],
      closed: true,
    },
    {
      name: 'seahorse',
      dots: [
        [0.50, 0.08], [0.58, 0.12], [0.65, 0.20], [0.68, 0.30], [0.62, 0.36],
        [0.55, 0.38], [0.62, 0.48], [0.65, 0.60], [0.62, 0.72], [0.58, 0.82],
        [0.65, 0.88], [0.70, 0.92], [0.60, 0.95], [0.50, 0.90],
        [0.42, 0.82], [0.38, 0.70], [0.35, 0.58], [0.38, 0.46],
        [0.44, 0.36], [0.38, 0.26], [0.42, 0.14],
      ],
      closed: true,
    },
    {
      name: 'dolphin',
      dots: [
        [0.85, 0.50], [0.80, 0.38], [0.65, 0.22], [0.45, 0.18], [0.28, 0.20],
        [0.12, 0.28], [0.05, 0.22], [0.08, 0.42], [0.05, 0.58], [0.12, 0.72],
        [0.28, 0.80], [0.45, 0.82], [0.65, 0.78], [0.80, 0.62],
      ],
      closed: true,
    },
  ],

  animals: [
    {
      name: 'dog_face',
      dots: [
        [0.50, 0.22], [0.68, 0.18], [0.82, 0.26], [0.88, 0.42],
        [0.82, 0.58], [0.68, 0.70], [0.50, 0.74], [0.32, 0.70],
        [0.18, 0.58], [0.12, 0.42], [0.18, 0.26], [0.32, 0.18],
        // ears
        [0.12, 0.22], [0.08, 0.10], [0.22, 0.12],
        [0.88, 0.22], [0.92, 0.10], [0.78, 0.12],
      ],
      closed: true,
    },
    {
      name: 'cat_face',
      dots: [
        [0.50, 0.24], [0.66, 0.20], [0.80, 0.30], [0.85, 0.46],
        [0.78, 0.62], [0.64, 0.72], [0.50, 0.76], [0.36, 0.72],
        [0.22, 0.62], [0.15, 0.46], [0.20, 0.30], [0.34, 0.20],
        // left ear
        [0.20, 0.16], [0.12, 0.05], [0.30, 0.10],
        // right ear
        [0.80, 0.16], [0.88, 0.05], [0.70, 0.10],
      ],
      closed: true,
    },
    {
      name: 'rabbit',
      dots: [
        [0.50, 0.36], [0.62, 0.32], [0.72, 0.38], [0.76, 0.50],
        [0.70, 0.62], [0.58, 0.70], [0.50, 0.72], [0.42, 0.70],
        [0.30, 0.62], [0.24, 0.50], [0.28, 0.38], [0.38, 0.32],
        // left ear
        [0.32, 0.26], [0.28, 0.08], [0.38, 0.14],
        // right ear
        [0.68, 0.26], [0.72, 0.08], [0.62, 0.14],
      ],
      closed: true,
    },
    {
      name: 'paw',
      dots: [
        [0.50, 0.60], // main pad center
        [0.30, 0.48], [0.22, 0.36], [0.26, 0.22], [0.38, 0.18], // left toes
        [0.50, 0.28], // center toe
        [0.62, 0.18], [0.74, 0.22], [0.78, 0.36], [0.70, 0.48], // right toes
      ],
      closed: true,
    },
    {
      name: 'bird',
      dots: [
        [0.58, 0.30], [0.70, 0.24], [0.80, 0.30], [0.86, 0.38], // head
        [0.88, 0.48], [0.80, 0.52], [0.70, 0.50], // beak top
        [0.70, 0.56], [0.82, 0.60], [0.78, 0.70], // beak bottom
        [0.65, 0.65], [0.55, 0.72], [0.40, 0.68], // body bottom
        [0.28, 0.58], [0.20, 0.46], // wing/tail
        [0.35, 0.40], [0.48, 0.35], // wing top back
      ],
      closed: false,
    },
  ],

  space: [
    {
      name: 'rocket',
      dots: [
        [0.50, 0.10], // 1  nose tip
        [0.58, 0.22], [0.62, 0.35], [0.62, 0.52], // 2-4 right body upper
        [0.65, 0.68], [0.72, 0.82], // 5-6 right fin
        [0.60, 0.82], [0.55, 0.75], // 7 right lower
        [0.55, 0.88], // 8 bottom center
        [0.45, 0.75], // 9 left lower
        [0.40, 0.82], [0.28, 0.82], // 10-11 left fin
        [0.38, 0.68], [0.38, 0.52], [0.38, 0.35], [0.42, 0.22], // 12-15 left body
        [0.50, 0.10], // closes to 1
      ],
      closed: true,
    },
    {
      name: 'moon',
      dots: (() => {
        const pts = [];
        // Outer arc (12 points)
        for (let i = 0; i <= 12; i++) {
          const angle = (i * 30 - 90) * Math.PI / 180;
          pts.push([0.50 + Math.cos(angle) * 0.38, 0.50 + Math.sin(angle) * 0.38]);
        }
        // Inner arc (6 points) — cutout
        for (let i = 1; i < 6; i++) {
          const angle = (i * 60 + 30) * Math.PI / 180;
          pts.push([0.50 + Math.cos(angle) * 0.22, 0.50 + Math.sin(angle) * 0.22]);
        }
        return pts;
      })(),
      closed: true,
    },
    {
      name: 'ufo',
      dots: [
        [0.50, 0.35], // dome top
        [0.60, 0.38], [0.70, 0.44], [0.78, 0.52], // dome right slope
        [0.82, 0.60], [0.88, 0.68], // right rim
        [0.82, 0.75], [0.72, 0.80], [0.58, 0.82], // right bottom
        [0.42, 0.82], [0.28, 0.80], [0.18, 0.75], // bottom
        [0.12, 0.68], [0.18, 0.60], [0.22, 0.52], // left bottom
        [0.30, 0.44], [0.40, 0.38], // left slope
      ],
      closed: true,
    },
    {
      name: 'planet',
      dots: (() => {
        const pts = [];
        for (let i = 0; i <= 20; i++) {
          const angle = (i * 18 - 90) * Math.PI / 180;
          pts.push([0.50 + Math.cos(angle) * 0.30, 0.50 + Math.sin(angle) * 0.30]);
        }
        return pts;
      })(),
      closed: true,
    },
    {
      name: 'star4',
      dots: [
        [0.50, 0.12], [0.58, 0.44], [0.92, 0.50], [0.58, 0.56],
        [0.50, 0.88], [0.42, 0.56], [0.08, 0.50], [0.42, 0.44],
      ],
      closed: true,
    },
  ],
};

// Difficulty filter
const COMPLEXITY_MAP = {
  simple: s => s.dots.length <= 14,
  medium: s => s.dots.length > 8 && s.dots.length <= 24,
  complex: s => s.dots.length >= 16,
};

// ── SVG helpers ─────────────────────────────────────────────────────────────

function dotPixelX(nx) { return DA_X + nx * DA_W; }
function dotPixelY(ny) { return DA_Y + ny * DA_H; }

// Scale every shape's raw coordinates to fill 84% of the drawing area,
// centered. Shapes whose raw coords span only part of 0–1 (e.g. y: 0.35–0.65)
// would otherwise leave large blank margins. This normalizes all of them.
function normalizeShape(shape) {
  const xs = shape.dots.map(d => d[0]);
  const ys = shape.dots.map(d => d[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const PAD = 0.08; // 8% padding on each side inside DA
  return {
    ...shape,
    dots: shape.dots.map(d => [
      PAD + (d[0] - minX) / rangeX * (1 - 2 * PAD),
      PAD + (d[1] - minY) / rangeY * (1 - 2 * PAD),
    ]),
  };
}

function buildSvgLine(shape, solved) {
  const s = normalizeShape(shape);
  const pts = s.dots.map(d => `${dotPixelX(d[0])},${dotPixelY(d[1])}`).join(' ');
  if (shape.closed) {
    return `    <polygon points="${pts}" fill="none" stroke="#FF6B35" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  } else {
    return `    <polyline points="${pts}" fill="none" stroke="#FF6B35" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
}

function buildSvgDots(shape, numbered) {
  const s = normalizeShape(shape);
  return s.dots.map((d, i) => {
    const px = dotPixelX(d[0]);
    const py = dotPixelY(d[1]);
    const n = i + 1;
    return `    <circle cx="${px}" cy="${py}" r="15" fill="#1A1A1A"/>
    <text x="${px}" y="${py}" text-anchor="middle" dominant-baseline="central" font-family="Arial Black, Arial, sans-serif" font-size="19" font-weight="900" fill="#FFFFFF">${n}</text>`;
  }).join('\n');
}

function buildBlankSvg(shape) {
  const titleLabel = `  <text x="${CANVAS_W / 2}" y="70" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="34" font-weight="900" fill="#FF6B35" letter-spacing="1">Connect the Dots!</text>`;
  const borderRect = `  <rect x="${DA_X - 8}" y="${DA_Y - 8}" width="${DA_W + 16}" height="${DA_H + 16}" fill="none" stroke="#CCCCCC" stroke-width="2" rx="8"/>`;
  const dotsLayer = buildSvgDots(shape, true);

  return `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="${BG_COLOR}"/>
  ${titleLabel}
  ${borderRect}
${dotsLayer}
</svg>`;
}

function buildSolvedSvg(shape) {
  const titleLabel = `  <text x="${CANVAS_W / 2}" y="70" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="34" font-weight="900" fill="#FF6B35" letter-spacing="1">Connect the Dots!</text>`;
  const borderRect = `  <rect x="${DA_X - 8}" y="${DA_Y - 8}" width="${DA_W + 16}" height="${DA_H + 16}" fill="none" stroke="#CCCCCC" stroke-width="2" rx="8"/>`;
  // Lines drawn BEFORE dots so dots render on top (z-order)
  const linesLayer = buildSvgLine(shape, true);
  const dotsLayer = buildSvgDots(shape, true);

  return `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="${BG_COLOR}"/>
  ${titleLabel}
  ${borderRect}
${linesLayer}
${dotsLayer}
</svg>`;
}

// ── Output helpers ───────────────────────────────────────────────────────────

async function writeSvgPng(svg, outSvgPath, outPngPath) {
  await fs.writeFile(outSvgPath, svg, 'utf8');
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(outPngPath, pngBuffer);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const seed = SEED_ARG ? Number(SEED_ARG) : hashStringToSeed(`${TITLE}|${THEME}|${DIFFICULTY}`);
  const rng = mulberry32(seed);
  const slug = SLUG_ARG || `dottodot-${THEME.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${DIFFICULTY}`;
  const outDir = OUT_DIR_ARG ? path.resolve(ROOT, OUT_DIR_ARG) : path.join(OUTPUT_ROOT, slug);
  const folderRel = path.relative(ROOT, outDir).replace(/\\/g, '/');

  const family = resolveThemeFamily(THEME);
  const familyShapes = SHAPES[family] ?? SHAPES.animals;
  const { minDots, maxDots, complexity } = difficultyDefaults[DIFFICULTY] ?? difficultyDefaults.medium;
  const complexityFilter = COMPLEXITY_MAP[complexity] ?? (() => true);

  // Filter shapes by complexity
  let candidates = familyShapes.filter(s => s.dots.length >= minDots && s.dots.length <= maxDots + 8);
  if (candidates.length === 0) candidates = familyShapes;
  // Pick one shape
  const shape = candidates[rng() * candidates.length | 0];

  const hookTitle = await buildChallengeHook({
    theme: THEME,
    puzzleType: PUZZLE_TYPE,
    difficulty: DIFFICULTY,
    seedHint: `${TITLE}|${THEME}|${DIFFICULTY}`,
  });

  // dots.json — waypoints for reel animation (normalized 0-1)
  const dotsJson = {
    version: 1,
    puzzleType: PUZZLE_TYPE,
    theme: THEME,
    shapeName: shape.name,
    dotCount: shape.dots.length,
    width: CANVAS_W,
    height: CANVAS_H,
    dotColor: '#FF6B35',
    dots: shape.dots.map(d => ({ x: d[0], y: d[1] })),
  };

  // countdownSec: 20 for hard, 17 for medium/easy (within 35s band)
  const countdownSec = DIFFICULTY === 'hard' ? 20 : 17;
  const activityJson = {
    type: 'challenge',
    puzzleType: PUZZLE_TYPE,
    difficulty: DIFFICULTY,
    theme: THEME,
    titleText: hookTitle,
    hookText: `Connect the dots${family === 'ocean' ? ' to reveal an ocean animal!' : family === 'space' ? ' to reveal a space shape!' : ' to reveal an animal!'}`,
    ctaText: 'What did you draw? Tell us below!',
    activityLabel: 'DOT TO DOT',
    countdownSec,
    hookDurationSec: 2.5,
    holdAfterSec: 12,
    blankImage: 'blank.png',
    solvedImage: 'solved.png',
    imagePath: 'puzzle.png',
    challengeAudioVolume: DEFAULT_CHALLENGE_AUDIO_VOLUME,
    tickAudioVolume: DEFAULT_TICK_AUDIO_VOLUME,
    transitionCueVolume: DEFAULT_TRANSITION_CUE_VOLUME,
    solveAudioVolume: DEFAULT_SOLVE_AUDIO_VOLUME,
    showJoyo: true,
    showBrandWatermark: false,
    sourceFolder: folderRel,
  };

  console.log(`[dottodot-factory] title     : ${TITLE}`);
  console.log(`[dottodot-factory] theme     : ${THEME}`);
  console.log(`[dottodot-factory] family    : ${family}`);
  console.log(`[dottodot-factory] outDir    : ${outDir}`);
  console.log(`[dottodot-factory] seed      : ${seed}`);
  console.log(`[dottodot-factory] difficulty: ${DIFFICULTY}`);
  console.log(`[dottodot-factory] shape     : ${shape.name} (${shape.dots.length} dots)`);
  console.log(`[dottodot-factory] countdown: ${countdownSec}s`);

  if (DRY_RUN) {
    console.log('[dottodot-factory] dry-run only, no files written.');
    return;
  }

  await fs.mkdir(outDir, { recursive: true });

  const blankSvg = buildBlankSvg(shape);
  const solvedSvg = buildSolvedSvg(shape);

  await Promise.all([
    writeSvgPng(blankSvg, path.join(outDir, 'blank.svg'), path.join(outDir, 'blank.png')),
    writeSvgPng(solvedSvg, path.join(outDir, 'solved.svg'), path.join(outDir, 'solved.png')),
    fs.writeFile(path.join(outDir, 'dots.json'), JSON.stringify(dotsJson, null, 2)),
    fs.writeFile(path.join(outDir, 'activity.json'), JSON.stringify(activityJson, null, 2)),
  ]);
  await fs.copyFile(path.join(outDir, 'blank.png'), path.join(outDir, 'puzzle.png'));

  console.log('[dottodot-factory] wrote files:');
  for (const f of ['activity.json', 'dots.json', 'blank.svg', 'blank.png', 'solved.svg', 'solved.png', 'puzzle.png']) {
    console.log(`  - ${path.join(outDir, f)}`);
  }
}

main().catch((error) => {
  console.error('[dottodot-factory] failed:', error);
  process.exit(1);
});
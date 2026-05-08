#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import 'dotenv/config';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT, 'output', 'challenge', 'generated-activity');

// ── Constants ────────────────────────────────────────────────────────────────

const CANVAS_W = 1080;
const CANVAS_H = 1500;
const DOT_RADIUS = 14;
const DOT_FILL = '#1A1A1A';
const DOT_TEXT_FILL = '#FFFFFF';
const DOT_FONT_SIZE = 16;
const LINE_COLOR = '#FF6B35';
const LINE_WIDTH = 3;

const DOT_COUNTS = { easy: 10, medium: 18, hard: 28 };

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getArg = (f, def = null) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] ?? def : def;
};

const DRY_RUN     = hasFlag('--dry-run');
const SOURCE_IMAGE = getArg('--source-image');
const THEME       = getArg('--theme', 'Connect the Dots');
const DIFFICULTY  = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const TITLE       = getArg('--title', `${THEME} Dot to Dot`);
const SEED_ARG    = getArg('--seed');
const SLUG_ARG    = getArg('--slug');
const OUT_DIR_ARG = getArg('--out-dir');
const FORCE       = hasFlag('--force');

// ── Algorithm helpers ────────────────────────────────────────────────────────

function dilate(grid, W, H, radius = 3) {
  const out = new Uint8Array(grid);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y * W + x] === 1) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) out[ny * W + nx] = 1;
          }
        }
      }
    }
  }
  return out;
}

// Fast separable erosion using prefix sums (square structuring element, O(W*H))
function erode(grid, W, H, radius) {
  // Horizontal pass
  const rowOut = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const rowSum = new Int32Array(W + 1);
    for (let x = 0; x < W; x++) rowSum[x + 1] = rowSum[x] + grid[y * W + x];
    for (let x = 0; x < W; x++) {
      const lo = Math.max(0, x - radius), hi = Math.min(W - 1, x + radius);
      if (rowSum[hi + 1] - rowSum[lo] === hi - lo + 1) rowOut[y * W + x] = 1;
    }
  }
  // Vertical pass on rowOut
  const out = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    const colSum = new Int32Array(H + 1);
    for (let y = 0; y < H; y++) colSum[y + 1] = colSum[y] + rowOut[y * W + x];
    for (let y = 0; y < H; y++) {
      const lo = Math.max(0, y - radius), hi = Math.min(H - 1, y + radius);
      if (colSum[hi + 1] - colSum[lo] === hi - lo + 1) out[y * W + x] = 1;
    }
  }
  return out;
}

// Morphological closing: dilate then erode — fills gaps without inflating outline
function morphClose(grid, W, H, radius) {
  return erode(dilate(grid, W, H, radius), W, H, radius);
}

function traceContour(grid, W, H) {
  // Find first black pixel (top-left scan)
  let startX = -1, startY = -1;
  outer: for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y * W + x] === 1) { startX = x; startY = y; break outer; }
    }
  }
  if (startX === -1) return [];

  // 8-connectivity Moore neighbor directions: starting from right, clockwise
  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];

  const contour = [];
  let cx = startX, cy = startY;
  let prevDir = 6; // start looking left (entry direction)

  for (let iter = 0; iter < W * H; iter++) {
    // Only check closed-loop after we've traced a meaningful distance (>200 pts)
    if (contour.length > 200 && cx === startX && cy === startY) break;
    contour.push([cx, cy]);

    // Try directions clockwise starting from (prevDir + 6) % 8
    let found = false;
    for (let di = 0; di < 8; di++) {
      const d = (prevDir + 6 + di) % 8;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny * W + nx] === 1) {
        cx = nx; cy = ny;
        prevDir = d;
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return contour;
}

function rdp(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDist = 0, maxIdx = 0;
  const [p1, p2] = [points[0], points[points.length - 1]];
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const dist = Math.abs(dy*points[i][0] - dx*points[i][1] + p2[0]*p1[1] - p2[1]*p1[0]) / len;
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left  = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

function arcLengthResample(points, N) {
  // Compute cumulative arc length
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i-1][0];
    const dy = points[i][1] - points[i-1][1];
    lengths.push(lengths[i-1] + Math.sqrt(dx*dx + dy*dy));
  }
  const total = lengths[lengths.length - 1];
  const step = total / N;

  const result = [];
  let pi = 0;
  for (let n = 0; n < N; n++) {
    const target = n * step;
    while (pi < lengths.length - 2 && lengths[pi + 1] < target) pi++;
    const t = (target - lengths[pi]) / (lengths[pi+1] - lengths[pi] || 1);
    result.push([
      Math.round(points[pi][0] + t * (points[pi+1][0] - points[pi][0])),
      Math.round(points[pi][1] + t * (points[pi+1][1] - points[pi][1])),
    ]);
  }
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!SOURCE_IMAGE && !DRY_RUN) {
    console.error('[dottodot-extractor] ERROR: --source-image is required');
    process.exit(1);
  }

  const slug = SLUG_ARG || `dottodot-${THEME.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${DIFFICULTY}`;
  const outDir = OUT_DIR_ARG ? path.resolve(ROOT, OUT_DIR_ARG) : path.join(OUTPUT_ROOT, slug);
  const folderRel = path.relative(ROOT, outDir).replace(/\\/g, '/');

  // Idempotency: skip if output already exists unless --force
  if (!FORCE) {
    try {
      await fs.access(path.join(outDir, 'puzzle.png'));
      console.log(`[dottodot-extractor] skip — output already exists: ${outDir}`);
      console.log('[dottodot-extractor] use --force to regenerate');
      return;
    } catch { /* proceed */ }
  }

  if (DRY_RUN) {
    console.log('[dottodot-extractor] dry-run — exiting cleanly');
    return;
  }

  console.log(`[dottodot-extractor] processing image: ${SOURCE_IMAGE}`);

  // Step 1: Load + binarize image
  const { data: pixels, info } = await sharp(SOURCE_IMAGE)
    .resize(CANVAS_W, CANVAS_H, { fit: 'contain', background: '#FFFFFF' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;

  const grid = new Uint8Array(W * H);
  for (let i = 0; i < pixels.length; i++) {
    grid[i] = pixels[i] < 100 ? 1 : 0;
  }

  // Step 2: Morphological closing — dilate(20) then erode(20).
  // Fills whisker gaps and disconnected stroke sections without inflating the final outline.
  const closed = morphClose(grid, W, H, 20);

  // Step 3: Extract boundary ring — pixels in the closed silhouette that have at
  // least one white 4-neighbor. Gives a thin ring the Moore tracer follows cleanly.
  const boundary = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!closed[y * W + x]) continue;
      const hasBg = (x > 0 && !closed[y * W + x - 1]) ||
                    (x < W-1 && !closed[y * W + x + 1]) ||
                    (y > 0 && !closed[(y-1) * W + x]) ||
                    (y < H-1 && !closed[(y+1) * W + x]);
      if (hasBg) boundary[y * W + x] = 1;
    }
  }

  let contour = traceContour(boundary, W, H);
  if (contour.length < 8) {
    console.error('[dottodot-extractor] ERROR: contour too small — image may not be a clean outline. Try --source-image with a higher-contrast coloring page.');
    process.exit(1);
  }

  // Step 4 (was 3): Douglas-Peucker simplification
  const simplified = rdp(contour, 8);

  // Step 5: Arc-length resample to N dots
  const N = DOT_COUNTS[DIFFICULTY] || 18;
  const dots = arcLengthResample(simplified, N);

  // Step 5: Generate SVG outputs
  const dotElements = dots.map((p, i) => `
  <circle cx="${p[0]}" cy="${p[1]}" r="${DOT_RADIUS}" fill="${DOT_FILL}"/>
  <text x="${p[0]}" y="${p[1]}" text-anchor="middle" dominant-baseline="central" font-family="Arial Black, Arial, sans-serif" font-size="${DOT_FONT_SIZE}" font-weight="900" fill="${DOT_TEXT_FILL}">${i + 1}</text>
  `).join('');

  const blankSvg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#FAFAFA"/>
  <text x="${CANVAS_W / 2}" y="70" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="34" font-weight="900" fill="#FF6B35" letter-spacing="1">Connect the Dots!</text>
  ${dotElements}
</svg>`;

  const srcBase64 = (await fs.readFile(SOURCE_IMAGE)).toString('base64');
  const polyPoints = dots.map(p => `${p[0]},${p[1]}`).join(' ');

  const solvedSvg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#FAFAFA"/>
  <image href="data:image/png;base64,${srcBase64}" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}"/>
  <polyline points="${polyPoints} ${dots[0][0]},${dots[0][1]}" fill="none" stroke="${LINE_COLOR}" stroke-width="${LINE_WIDTH}" stroke-linejoin="round"/>
  ${dotElements}
</svg>`;

  // Step 6: Write output files
  await fs.mkdir(outDir, { recursive: true });

  const dotsJson = {
    version: 1,
    puzzleType: 'dot-to-dot',
    theme: THEME,
    shapeName: 'imagen-extracted',
    dotCount: N,
    width: CANVAS_W,
    height: CANVAS_H,
    dotColor: LINE_COLOR,
    sourceImage: 'blank.png',
    dots: dots.map(p => ({ x: p[0] / CANVAS_W, y: p[1] / CANVAS_H })),
  };

  const activityJson = {
    type: 'challenge',
    puzzleType: 'dot-to-dot',
    difficulty: DIFFICULTY,
    theme: THEME,
    titleText: TITLE,
    hookText: 'Connect the dots to reveal the picture!',
    ctaText: 'What did you draw? Tell us below!',
    activityLabel: 'DOT TO DOT',
    countdownSec: DIFFICULTY === 'hard' ? 20 : 17,
    hookDurationSec: 2.5,
    holdAfterSec: 12,
    blankImage: 'blank.png',
    solvedImage: 'solved.png',
    imagePath: 'puzzle.png',
    challengeAudioVolume: 0.11,
    tickAudioVolume: 0.3,
    transitionCueVolume: 0.24,
    solveAudioVolume: 0.52,
    showJoyo: true,
    showBrandWatermark: false,
    sourceFolder: folderRel,
    generatedBy: 'imagen-extracted',
    generatedAt: new Date().toISOString(),
  };

  await Promise.all([
    fs.writeFile(path.join(outDir, 'blank.svg'), blankSvg),
    fs.writeFile(path.join(outDir, 'solved.svg'), solvedSvg),
    fs.writeFile(path.join(outDir, 'dots.json'), JSON.stringify(dotsJson, null, 2)),
    fs.writeFile(path.join(outDir, 'activity.json'), JSON.stringify(activityJson, null, 2)),
    sharp(Buffer.from(blankSvg)).png().toFile(path.join(outDir, 'blank.png')),
    sharp(Buffer.from(solvedSvg)).png().toFile(path.join(outDir, 'solved.png')),
  ]);

  await fs.copyFile(path.join(outDir, 'blank.png'), path.join(outDir, 'puzzle.png'));

  console.log(`[dottodot-extractor] done → ${outDir}`);
}

main().catch(err => {
  console.error('[dottodot-extractor] failed:', err);
  process.exit(1);
});
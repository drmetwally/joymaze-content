#!/usr/bin/env node
/**
 * extract-dotdot-path.mjs
 *
 * Detects dot positions from a blank dot-to-dot image and determines their
 * drawing order by projecting each dot onto the solved image's outline skeleton.
 *
 * Algorithm:
 *   1. Blank image (60% scale) → threshold → find connected components
 *   2. Filter to dot-sized, compact blobs → centroids (ignores number labels + outline)
 *   3. Solved image (20% scale) → threshold → Zhang-Suen skeleton → ordered path walk
 *   4. Project each dot centroid onto the nearest skeleton point → sort by path index
 *   5. Remove teleport jumps (dots too far from their predecessor in draw order)
 *   6. Output: dots.json  →  { dots: [{x,y}], width, height, dotColor }
 *
 * No OCR needed — ordering is inferred from the solved image's outline path.
 *
 * Usage:
 *   node scripts/extract-dotdot-path.mjs output/asmr/dotdot-slug/activity.json
 *   node scripts/extract-dotdot-path.mjs --asmr output/asmr/dotdot-slug/
 */

import sharp from 'sharp';
import fs    from 'fs/promises';
import path  from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Tuning constants ──────────────────────────────────────────────────────────
const SCALE_DETECT  = 0.60;  // scale for dot detection — keeps small dots visible
const SCALE_SKEL    = 0.20;  // scale for skeleton extraction (same as maze)
const DARK_THRESH   = 110;   // luminance below this = ink (dots + outline strokes)
const MIN_DOT_AREA  = 10;    // min connected component pixels (at SCALE_DETECT)
const MAX_DOT_AREA  = 500;   // max pixels — rejects outline strokes and text blobs
const MAX_BBOX_DIM  = 42;    // max bounding box width OR height (rejects elongated text)
const MIN_FILL_RATIO = 0.28; // area / (bbox_w × bbox_h) — dots are compact, digits aren't
const SMOOTH_WIN    = 3;     // moving-average window for skeleton smoothing

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

// ── Luminance from RGB ────────────────────────────────────────────────────────
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// ── Connected components (BFS, 8-connected) ───────────────────────────────────
function findComponents(mask, W, H) {
  const visited = new Uint8Array(W * H);
  const components = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || visited[i]) continue;
    const queue = [i], pixels = [i];
    visited[i] = 1;
    while (queue.length) {
      const cur = queue.pop();
      const cx = cur % W, cy = Math.floor(cur / W);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dy && !dx) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; queue.push(ni); pixels.push(ni); }
        }
      }
    }
    components.push(pixels);
  }
  return components;
}

// ── Zhang-Suen thinning (1-pixel skeleton) ────────────────────────────────────
function thinZhangSuen(mask, W, H) {
  const idx = (x, y) => y * W + x;
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const toRemove = [];
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          if (!mask[idx(x, y)]) continue;
          const p = [
            mask[idx(x,   y-1)] ? 1 : 0,
            mask[idx(x+1, y-1)] ? 1 : 0,
            mask[idx(x+1, y  )] ? 1 : 0,
            mask[idx(x+1, y+1)] ? 1 : 0,
            mask[idx(x,   y+1)] ? 1 : 0,
            mask[idx(x-1, y+1)] ? 1 : 0,
            mask[idx(x-1, y  )] ? 1 : 0,
            mask[idx(x-1, y-1)] ? 1 : 0,
          ];
          const B = p.reduce((s, v) => s + v, 0);
          if (B < 2 || B > 6) continue;
          let A = 0;
          for (let i = 0; i < 8; i++) if (p[i] === 0 && p[(i + 1) % 8] === 1) A++;
          if (A !== 1) continue;
          if (pass === 0) {
            if (p[0] * p[2] * p[4] !== 0) continue;
            if (p[2] * p[4] * p[6] !== 0) continue;
          } else {
            if (p[0] * p[2] * p[6] !== 0) continue;
            if (p[0] * p[4] * p[6] !== 0) continue;
          }
          toRemove.push(idx(x, y));
        }
      }
      if (toRemove.length) { changed = true; for (const i of toRemove) mask[i] = 0; }
    }
  }
}

// ── Keep largest connected component ─────────────────────────────────────────
function keepLargestComponent(mask, W, H) {
  const visited = new Uint8Array(W * H);
  let bestStart = -1, bestSize = 0;
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || visited[i]) continue;
    const queue = [i]; visited[i] = 1; let size = 0;
    while (queue.length) {
      const cur = queue.pop(); size++;
      const cx = cur % W, cy = Math.floor(cur / W);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dy && !dx) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; queue.push(ni); }
        }
      }
    }
    if (size > bestSize) { bestSize = size; bestStart = i; }
  }
  const clean = new Uint8Array(W * H);
  if (bestStart < 0) return clean;
  const queue = [bestStart]; clean[bestStart] = 1;
  while (queue.length) {
    const cur = queue.pop();
    const cx = cur % W, cy = Math.floor(cur / W);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dy && !dx) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const ni = ny * W + nx;
        if (mask[ni] && !clean[ni]) { clean[ni] = 1; queue.push(ni); }
      }
    }
  }
  return clean;
}

// ── Walk skeleton → ordered path ──────────────────────────────────────────────
function walkSkeleton(mask, W, H) {
  const idx = (x, y) => y * W + x;
  const nb8 = (x, y) => {
    const pts = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dy || dx) && x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H)
          pts.push({ x: x + dx, y: y + dy });
    return pts;
  };
  // Find endpoints (1 neighbor)
  const endpoints = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (mask[idx(x, y)] && nb8(x, y).filter(p => mask[idx(p.x, p.y)]).length === 1)
        endpoints.push({ x, y });
  if (!endpoints.length)
    for (let i = 0; i < W * H; i++)
      if (mask[i]) { endpoints.push({ x: i % W, y: Math.floor(i / W) }); break; }

  // Start from topmost endpoint (dot-to-dot figures often start at top)
  const start = endpoints.reduce((a, b) => a.y < b.y ? a : b);
  const visited = new Uint8Array(W * H);
  const walkPath = [];
  let cur = start;
  visited[idx(cur.x, cur.y)] = 1;
  walkPath.push({ x: cur.x, y: cur.y });

  while (true) {
    const nbrs = nb8(cur.x, cur.y).filter(p => mask[idx(p.x, p.y)] && !visited[idx(p.x, p.y)]);
    if (!nbrs.length) {
      let nearest = null, nearestDist = Infinity;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (!mask[y * W + x] || visited[y * W + x]) continue;
          const d = (x - cur.x) ** 2 + (y - cur.y) ** 2;
          if (d < nearestDist) { nearestDist = d; nearest = { x, y }; }
        }
      if (!nearest || nearestDist > 30 ** 2) break;
      cur = nearest; visited[idx(cur.x, cur.y)] = 1; walkPath.push(cur);
      continue;
    }
    let next = nbrs[0];
    if (walkPath.length >= 2 && nbrs.length > 1) {
      const prev = walkPath[walkPath.length - 2];
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      let bestDot = -Infinity;
      for (const n of nbrs) {
        const dot = (n.x - cur.x) * dx + (n.y - cur.y) * dy;
        if (dot > bestDot) { bestDot = dot; next = n; }
      }
    }
    cur = next; visited[idx(cur.x, cur.y)] = 1; walkPath.push(cur);
  }
  return walkPath;
}

// ── Smooth path ───────────────────────────────────────────────────────────────
function smoothPath(pts, win = SMOOTH_WIN) {
  if (pts.length < 2 * win + 1) return pts;
  return pts.map((_, i) => {
    const lo = Math.max(0, i - win), hi = Math.min(pts.length - 1, i + win);
    let sx = 0, sy = 0, c = 0;
    for (let j = lo; j <= hi; j++) { sx += pts[j].x; sy += pts[j].y; c++; }
    return { x: sx / c, y: sy / c };
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  let inputArg = getArg('--asmr') ?? process.argv[2];
  if (!inputArg) {
    console.error('Usage: node scripts/extract-dotdot-path.mjs <activity.json|asmr-folder>');
    process.exit(1);
  }

  const resolved = path.resolve(ROOT, inputArg);
  const stat     = await fs.stat(resolved).catch(() => null);
  const jsonFile = stat?.isDirectory() ? path.join(resolved, 'activity.json') : resolved;
  const folder   = path.dirname(jsonFile);

  const activity   = JSON.parse(await fs.readFile(jsonFile, 'utf-8'));
  const blankPath  = path.resolve(folder, activity.blankImage  ?? 'blank.png');
  const solvedPath = path.resolve(folder, activity.solvedImage ?? 'solved.png');

  console.log(`Blank : ${blankPath}`);
  console.log(`Solved: ${solvedPath}`);

  const blankBuf  = await fs.readFile(blankPath);
  const solvedBuf = await fs.readFile(solvedPath);

  const meta   = await sharp(blankBuf).metadata();
  const W_full = meta.width, H_full = meta.height;

  // ── STEP 1: Detect dots in blank image ────────────────────────────────────
  const Wd = Math.round(W_full * SCALE_DETECT);
  const Hd = Math.round(H_full * SCALE_DETECT);
  console.log(`\nDot detection: ${W_full}×${H_full} → ${Wd}×${Hd} (${(SCALE_DETECT * 100).toFixed(0)}%)`);

  const rawDetect = await sharp(blankBuf)
    .resize(Wd, Hd)
    .toColourspace('srgb').removeAlpha().raw().toBuffer();

  // Threshold → binary mask (dark ink pixels)
  const detectMask = new Uint8Array(Wd * Hd);
  for (let i = 0; i < Wd * Hd; i++) {
    const o = i * 3;
    if (luma(rawDetect[o], rawDetect[o + 1], rawDetect[o + 2]) < DARK_THRESH)
      detectMask[i] = 1;
  }

  // Find all connected components
  const allComps = findComponents(detectMask, Wd, Hd);
  console.log(`  Total dark components: ${allComps.length}`);

  // Filter to dot-sized, compact blobs
  const dotCentroids = [];
  for (const pixels of allComps) {
    if (pixels.length < MIN_DOT_AREA || pixels.length > MAX_DOT_AREA) continue;

    // Bounding box
    let minX = Wd, maxX = 0, minY = Hd, maxY = 0;
    for (const pi of pixels) {
      const px = pi % Wd, py = Math.floor(pi / Wd);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const bboxW = maxX - minX + 1, bboxH = maxY - minY + 1;

    // Reject elongated blobs (number text) and oversized blobs (outline fragments)
    if (bboxW > MAX_BBOX_DIM || bboxH > MAX_BBOX_DIM) continue;
    if (bboxW / bboxH > 3.5 || bboxH / bboxW > 3.5) continue;
    const fillRatio = pixels.length / (bboxW * bboxH);
    if (fillRatio < MIN_FILL_RATIO) continue;

    // Centroid (normalized)
    const cx = (minX + maxX) / 2 / Wd;
    const cy = (minY + maxY) / 2 / Hd;
    dotCentroids.push({ x: cx, y: cy, area: pixels.length });
  }
  console.log(`  Detected dots: ${dotCentroids.length}`);

  if (dotCentroids.length < 3) {
    console.error(`ERROR: only ${dotCentroids.length} dots detected — check DARK_THRESH / size filters`);
    process.exit(1);
  }

  // ── STEP 2: Extract skeleton from solved image ────────────────────────────
  const Ws = Math.round(W_full * SCALE_SKEL);
  const Hs = Math.round(H_full * SCALE_SKEL);
  console.log(`\nSkeleton extraction: ${W_full}×${H_full} → ${Ws}×${Hs} (${(SCALE_SKEL * 100).toFixed(0)}%)`);

  const rawSkel = await sharp(solvedBuf)
    .resize(Ws, Hs)
    .toColourspace('srgb').removeAlpha().raw().toBuffer();

  const skelMask = new Uint8Array(Ws * Hs);
  for (let i = 0; i < Ws * Hs; i++) {
    const o = i * 3;
    if (luma(rawSkel[o], rawSkel[o + 1], rawSkel[o + 2]) < DARK_THRESH)
      skelMask[i] = 1;
  }

  const cleanSkel = keepLargestComponent(skelMask, Ws, Hs);
  console.log(`  Skeleton pixels (pre-thin): ${cleanSkel.reduce((s, v) => s + v, 0)}`);

  thinZhangSuen(cleanSkel, Ws, Hs);
  console.log(`  Skeleton pixels (post-thin): ${cleanSkel.reduce((s, v) => s + v, 0)}`);

  const rawWalk = walkSkeleton(cleanSkel, Ws, Hs);
  const skelPath = smoothPath(rawWalk, SMOOTH_WIN);
  console.log(`  Skeleton path length: ${skelPath.length} points`);

  if (skelPath.length < 10) {
    console.error('ERROR: skeleton too short — check solved image and DARK_THRESH');
    process.exit(1);
  }

  // ── STEP 3: Project dots onto skeleton → sort by path index ───────────────
  console.log('\nProjecting dots onto skeleton path...');

  // Skeleton points are in [0..Ws] × [0..Hs] space, normalize to [0..1]
  const skelNorm = skelPath.map(p => ({ x: p.x / Ws, y: p.y / Hs }));

  const ordered = dotCentroids.map(dot => {
    let nearest = 0, nearestDist = Infinity;
    for (let i = 0; i < skelNorm.length; i++) {
      const dx = dot.x - skelNorm[i].x, dy = dot.y - skelNorm[i].y;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) { nearestDist = d; nearest = i; }
    }
    return { x: dot.x, y: dot.y, skelIdx: nearest };
  });

  // Sort by skeleton index
  ordered.sort((a, b) => a.skelIdx - b.skelIdx);

  // ── STEP 4: Remove large teleport jumps ───────────────────────────────────
  // If two consecutive dots are far apart (>25% of image diagonal), it means the
  // skeleton walk jumped across the figure. These are filtered as likely misorders.
  const diagSq = 1 + (H_full / W_full) ** 2; // normalized diagonal² ≈ 1 + AR²
  const maxJumpSq = (0.25 ** 2) * diagSq;
  const cleaned = [ordered[0]];
  let skipped = 0;
  for (let i = 1; i < ordered.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const dx = ordered[i].x - prev.x, dy = ordered[i].y - prev.y;
    if (dx * dx + dy * dy > maxJumpSq) { skipped++; continue; }
    cleaned.push(ordered[i]);
  }
  if (skipped > 0) console.log(`  Removed ${skipped} teleport-jump dots`);

  const dots = cleaned.map(({ x, y }) => ({ x, y }));

  // ── STEP 5: Sample dot color from solved image ────────────────────────────
  // Use the ink color from the solved image's outline for the connecting lines.
  console.log('\nSampling line color from solved...');
  const { data: solvedFull, info: fInfo } = await sharp(solvedBuf)
    .toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const FW = fInfo.width, FH = fInfo.height;

  // Sample darkest pixels in the center 20-80% of the image
  const colorSamples = [];
  const sampleStep = Math.max(1, Math.floor(FW / 40));
  for (let x = Math.floor(FW * 0.20); x < Math.floor(FW * 0.80); x += sampleStep) {
    let bestLuma = 255, bestO = -1;
    for (let y = Math.floor(FH * 0.10); y < Math.floor(FH * 0.90); y++) {
      const o = (y * FW + x) * 3;
      const l = luma(solvedFull[o], solvedFull[o + 1], solvedFull[o + 2]);
      if (l < bestLuma) { bestLuma = l; bestO = o; }
    }
    if (bestO >= 0 && bestLuma < 80)
      colorSamples.push([solvedFull[bestO], solvedFull[bestO + 1], solvedFull[bestO + 2]]);
  }
  // Default: brand orange (visible on white, distinct from black outlines)
  let dotColor = '#FF6B35';
  if (colorSamples.length > 0) {
    // If lines are colored (not black), use that color; otherwise keep brand orange
    const r = Math.round(colorSamples.reduce((s, c) => s + c[0], 0) / colorSamples.length);
    const g = Math.round(colorSamples.reduce((s, c) => s + c[1], 0) / colorSamples.length);
    const b = Math.round(colorSamples.reduce((s, c) => s + c[2], 0) / colorSamples.length);
    // Only use sampled color if it's clearly non-black (i.e., a colored line was drawn)
    if (r > 80 || g > 80 || b > 80)
      dotColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // ── Write dots.json ───────────────────────────────────────────────────────
  const outFile = path.join(folder, 'dots.json');
  await fs.writeFile(outFile, JSON.stringify({ dots, width: W_full, height: H_full, dotColor }, null, 2));

  console.log(`\n✓ ${dots.length} dots → ${outFile}`);
  console.log(`  Line color : ${dotColor}`);
  const xs = dots.map(d => d.x * W_full), ys = dots.map(d => d.y * H_full);
  console.log(`  X range    : ${Math.min(...xs).toFixed(0)}–${Math.max(...xs).toFixed(0)} px`);
  console.log(`  Y range    : ${Math.min(...ys).toFixed(0)}–${Math.max(...ys).toFixed(0)} px`);
  console.log('\n  Next: npm run animate:asmr -- --asmr <folder>');
}

main().catch(err => { console.error(err); process.exit(1); });

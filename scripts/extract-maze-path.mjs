#!/usr/bin/env node
/**
 * extract-maze-path.mjs
 *
 * Extracts the maze solution path from blank + solved images as an ordered
 * sequence of waypoints, saved to path.json alongside activity.json.
 *
 * Algorithm:
 *   1. Scale images to ~20% — reduces 5-10px solution line to ~1-2px
 *   2. Compute diff mask (pixels that differ between blank and solved)
 *   3. Keep only the largest connected component (noise removal)
 *   4. Zhang-Suen thinning → 1-pixel-wide skeleton
 *   5. Find skeleton endpoints (pixels with exactly 1 neighbor)
 *   6. Walk skeleton from one endpoint to the other → ordered path
 *   7. Normalize waypoints 0-1, subsample to SAMPLE points
 *   8. Sample path color from highest-diff pixels in original-size images
 *
 * Usage:
 *   node scripts/extract-maze-path.mjs output/asmr/maze-slug/activity.json
 *   node scripts/extract-maze-path.mjs --asmr output/asmr/maze-slug/
 */

import sharp  from 'sharp';
import fs     from 'fs/promises';
import path   from 'path';
import { fileURLToPath } from 'url';

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = 400;       // final waypoint count (more = smoother animation)
const SCALE  = 0.20;     // downscale factor — path ~1-2px wide at this scale
const DIFF_THRESHOLD = 40; // diff sum per pixel (R+G+B) to flag as path
const SMOOTH_WIN = 4;     // moving-average window for path coordinate smoothing

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

// ─── Zhang-Suen thinning ──────────────────────────────────────────────────────
// Reduces binary mask to 1-pixel-wide skeleton. Modifies mask in-place.
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
          // 8-neighbors clockwise from top
          const p = [
            mask[idx(x,   y-1)] ? 1 : 0, // p2
            mask[idx(x+1, y-1)] ? 1 : 0, // p3
            mask[idx(x+1, y  )] ? 1 : 0, // p4
            mask[idx(x+1, y+1)] ? 1 : 0, // p5
            mask[idx(x,   y+1)] ? 1 : 0, // p6
            mask[idx(x-1, y+1)] ? 1 : 0, // p7
            mask[idx(x-1, y  )] ? 1 : 0, // p8
            mask[idx(x-1, y-1)] ? 1 : 0, // p9
          ];
          const B = p.reduce((s, v) => s + v, 0);
          if (B < 2 || B > 6) continue;
          // Count 0→1 transitions in ring
          let A = 0;
          for (let i = 0; i < 8; i++) if (p[i] === 0 && p[(i+1) % 8] === 1) A++;
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

// ─── Largest connected component (flood fill) ─────────────────────────────────
function keepLargestComponent(mask, W, H) {
  const visited = new Uint8Array(W * H);
  let bestStart = -1, bestSize = 0;
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || visited[i]) continue;
    // BFS
    const queue = [i]; visited[i] = 1; let size = 0;
    while (queue.length) {
      const cur = queue.pop(); size++;
      const cx = cur % W, cy = Math.floor(cur / W);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dy && !dx) continue;
          const nx = cx+dx, ny = cy+dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny*W+nx;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; queue.push(ni); }
        }
      }
    }
    if (size > bestSize) { bestSize = size; bestStart = i; }
  }
  // Re-flood from bestStart into a new clean mask
  const clean = new Uint8Array(W * H);
  if (bestStart < 0) return clean;
  const queue = [bestStart]; clean[bestStart] = 1;
  while (queue.length) {
    const cur = queue.pop();
    const cx = cur % W, cy = Math.floor(cur / W);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dy && !dx) continue;
        const nx = cx+dx, ny = cy+dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const ni = ny*W+nx;
        if (mask[ni] && !clean[ni]) { clean[ni] = 1; queue.push(ni); }
      }
    }
  }
  return clean;
}

// ─── Walk skeleton from one end to the other ─────────────────────────────────
// At junctions, prefers the direction that continues the current heading.
// When stuck at a dead end, teleports to the nearest unvisited pixel (handles
// small skeleton branches that the greedy walk might have skipped).
function walkSkeleton(mask, W, H) {
  const idx = (x, y) => y * W + x;
  const neighbors8 = (x, y) => {
    const pts = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dy||dx) && x+dx>=0 && x+dx<W && y+dy>=0 && y+dy<H)
          pts.push({ x: x+dx, y: y+dy });
    return pts;
  };

  // Find endpoints: pixels with exactly 1 skeleton neighbor
  const endpoints = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[idx(x, y)]) continue;
      const n = neighbors8(x, y).filter(p => mask[idx(p.x, p.y)]).length;
      if (n === 1) endpoints.push({ x, y });
    }
  }
  if (endpoints.length === 0) {
    for (let i = 0; i < W * H; i++) {
      if (mask[i]) { endpoints.push({ x: i % W, y: Math.floor(i / W) }); break; }
    }
  }
  // Start from left-most endpoint (maze entrance usually on left or top)
  const start = endpoints.reduce((a, b) => a.x < b.x ? a : b);

  const visited = new Uint8Array(W * H);
  const path = [];
  let cur = start;
  visited[idx(cur.x, cur.y)] = 1;
  path.push({ x: cur.x, y: cur.y });

  while (true) {
    const nbrs = neighbors8(cur.x, cur.y).filter(p => mask[idx(p.x, p.y)] && !visited[idx(p.x, p.y)]);

    if (!nbrs.length) {
      // Stuck — scan for nearest unvisited skeleton pixel (handles junctions / branches)
      let nearest = null, nearestDist = Infinity;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!mask[y * W + x] || visited[y * W + x]) continue;
          const d = (x - cur.x) ** 2 + (y - cur.y) ** 2;
          if (d < nearestDist) { nearestDist = d; nearest = { x, y }; }
        }
      }
      if (!nearest || nearestDist > 30 ** 2) break; // >30px gap → truly done
      cur = nearest;
      visited[idx(cur.x, cur.y)] = 1;
      path.push(cur);
      continue;
    }

    // At a junction: prefer the neighbor that continues the current heading (dot product)
    let next = nbrs[0];
    if (path.length >= 2 && nbrs.length > 1) {
      const prev = path[path.length - 2];
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      let bestDot = -Infinity;
      for (const n of nbrs) {
        const dot = (n.x - cur.x) * dx + (n.y - cur.y) * dy;
        if (dot > bestDot) { bestDot = dot; next = n; }
      }
    }
    cur = next;
    visited[idx(cur.x, cur.y)] = 1;
    path.push(cur);
  }

  return path;
}

// ─── Smooth path coordinates (moving average) ────────────────────────────────
// Reduces staircase artifacts from 8-connected pixel walk on downscaled image.
function smoothPath(pts, win = SMOOTH_WIN) {
  if (pts.length < 2 * win + 1) return pts;
  return pts.map((_, i) => {
    const lo = Math.max(0, i - win), hi = Math.min(pts.length - 1, i + win);
    let sx = 0, sy = 0, c = 0;
    for (let j = lo; j <= hi; j++) { sx += pts[j].x; sy += pts[j].y; c++; }
    return { x: sx / c, y: sy / c };
  });
}

// ─── Subsample path by arc-length (uniform speed) ────────────────────────────
// Index-based subsampling creates uneven motion because pixel steps vary in
// Euclidean distance. Arc-length subsampling gives uniform draw speed.
function subsampleArcLength(pts, n) {
  if (pts.length <= n) return pts;
  const dists = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    dists.push(dists[i-1] + Math.sqrt(dx*dx + dy*dy));
  }
  const total = dists[dists.length - 1];
  const result = [];
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    let lo = 0, hi = dists.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (dists[mid] <= target) lo = mid; else hi = mid; }
    const span = dists[hi] - dists[lo];
    const t = span > 0 ? (target - dists[lo]) / span : 0;
    result.push({ x: pts[lo].x + t * (pts[hi].x - pts[lo].x), y: pts[lo].y + t * (pts[hi].y - pts[lo].y) });
  }
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  let inputArg = getArg('--asmr') ?? process.argv[2];
  if (!inputArg) {
    console.error('Usage: node scripts/extract-maze-path.mjs <activity.json|asmr-folder>');
    process.exit(1);
  }

  const resolved = path.resolve(ROOT, inputArg);
  const stat     = await fs.stat(resolved).catch(() => null);
  const jsonFile = stat?.isDirectory() ? path.join(resolved, 'activity.json') : resolved;
  const folder   = path.dirname(jsonFile);

  const activity  = JSON.parse(await fs.readFile(jsonFile, 'utf-8'));
  const blankRel  = activity.blankImage  ?? 'blank.png';
  const solvedRel = activity.solvedImage ?? 'solved.png';
  const blankPath  = path.resolve(folder, blankRel);
  const solvedPath = path.resolve(folder, solvedRel);

  console.log(`Blank : ${blankPath}`);
  console.log(`Solved: ${solvedPath}`);

  const blankBuf  = await fs.readFile(blankPath);
  const solvedBuf = await fs.readFile(solvedPath);

  // ── Get full-size dimensions ──────────────────────────────────────────────
  const meta = await sharp(blankBuf).metadata();
  const W_full = meta.width, H_full = meta.height;
  const W = Math.round(W_full * SCALE);
  const H = Math.round(H_full * SCALE);
  console.log(`Image : ${W_full}×${H_full} → analysing at ${W}×${H} (${(SCALE*100).toFixed(0)}%)`);

  // ── Scale both images ─────────────────────────────────────────────────────
  const ch = 3;
  const blankSmall  = await sharp(blankBuf).resize(W, H).toColourspace('srgb').removeAlpha().raw().toBuffer();
  const solvedSmall = await sharp(solvedBuf).resize(W, H).toColourspace('srgb').removeAlpha().raw().toBuffer();

  // ── Diff mask ─────────────────────────────────────────────────────────────
  console.log('Computing diff mask...');
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * ch;
    const d = Math.abs(blankSmall[o]   - solvedSmall[o])
            + Math.abs(blankSmall[o+1] - solvedSmall[o+1])
            + Math.abs(blankSmall[o+2] - solvedSmall[o+2]);
    if (d > DIFF_THRESHOLD) mask[i] = 1;
  }

  // ── Keep largest connected component ──────────────────────────────────────
  console.log('Isolating path component...');
  const cleanMask = keepLargestComponent(mask, W, H);
  const pixelCount = cleanMask.reduce((s, v) => s + v, 0);
  console.log(`  Path pixels: ${pixelCount}`);

  // ── Zhang-Suen thinning → 1-pixel skeleton ───────────────────────────────
  console.log('Thinning to skeleton...');
  thinZhangSuen(cleanMask, W, H);
  const skelCount = cleanMask.reduce((s, v) => s + v, 0);
  console.log(`  Skeleton pixels: ${skelCount}`);

  // ── Walk skeleton → ordered path ──────────────────────────────────────────
  console.log('Tracing path...');
  const rawPath = walkSkeleton(cleanMask, W, H);
  console.log(`  Raw path length: ${rawPath.length} pixels`);

  if (rawPath.length < 10) {
    console.error('ERROR: path trace too short — check images and DIFF_THRESHOLD');
    process.exit(1);
  }

  // ── Smooth + arc-length subsample ─────────────────────────────────────────
  const smoothed  = smoothPath(rawPath, SMOOTH_WIN);
  const sampled   = subsampleArcLength(smoothed, SAMPLE);
  const waypoints = sampled.map(p => ({
    x: p.x / W,  // normalised in small-image space (same AR as full image)
    y: p.y / H,
  }));

  // ── Sample path color from full-size solved image ─────────────────────────
  // Use highest-diff pixel per X column in the mid 30-70% range of the image.
  console.log('Sampling path color...');
  const { data: blankFull, info: fullInfo } = await sharp(blankBuf)
    .toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const solvedFull = await sharp(solvedBuf)
    .toColourspace('srgb').removeAlpha()
    .resize(fullInfo.width, fullInfo.height, { fit: 'fill' })
    .raw().toBuffer();
  const FW = fullInfo.width, FH = fullInfo.height;

  const midX0 = Math.floor(FW * 0.30);
  const midX1 = Math.floor(FW * 0.70);
  const step   = Math.max(1, Math.floor((midX1 - midX0) / 60));
  const colorSamples = [];
  for (let x = midX0; x <= midX1; x += step) {
    let bestDiff = 0, bestY = -1;
    for (let y = 0; y < FH; y++) {
      const o = (y * FW + x) * ch;
      const d = Math.abs(blankFull[o]   - solvedFull[o])
              + Math.abs(blankFull[o+1] - solvedFull[o+1])
              + Math.abs(blankFull[o+2] - solvedFull[o+2]);
      if (d > bestDiff) { bestDiff = d; bestY = y; }
    }
    if (bestY >= 0 && bestDiff > DIFF_THRESHOLD * 2) {
      const o = (bestY * FW + x) * ch;
      colorSamples.push([solvedFull[o], solvedFull[o+1], solvedFull[o+2]]);
    }
  }
  let pathColor = '#22BB44';
  if (colorSamples.length > 0) {
    const r = Math.round(colorSamples.reduce((s, c) => s + c[0], 0) / colorSamples.length);
    const g = Math.round(colorSamples.reduce((s, c) => s + c[1], 0) / colorSamples.length);
    const b = Math.round(colorSamples.reduce((s, c) => s + c[2], 0) / colorSamples.length);
    pathColor = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

  // ── Write path.json ───────────────────────────────────────────────────────
  const outFile = path.join(folder, 'path.json');
  await fs.writeFile(outFile, JSON.stringify({ waypoints, width: W_full, height: H_full, pathColor }, null, 2));

  console.log(`\n✓ ${waypoints.length} waypoints → ${outFile}`);
  console.log(`  Path color  : ${pathColor} (${colorSamples.length} samples)`);
  const ys = waypoints.map(p => p.y * H_full);
  const xs = waypoints.map(p => p.x * W_full);
  console.log(`  X range     : ${Math.min(...xs).toFixed(0)}–${Math.max(...xs).toFixed(0)} px`);
  console.log(`  Y range     : ${Math.min(...ys).toFixed(0)}–${Math.max(...ys).toFixed(0)} px`);
}

main().catch(err => { console.error(err); process.exit(1); });

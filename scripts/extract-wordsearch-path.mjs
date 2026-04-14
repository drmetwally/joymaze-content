#!/usr/bin/env node
/**
 * extract-wordsearch-path.mjs
 *
 * Extracts word highlight bounding boxes from blank + solved word search images,
 * saved to wordsearch.json alongside activity.json.
 *
 * Algorithm:
 *   1. Scale images to 40% — reduces highlight regions to manageable size
 *   2. Compute diff mask (pixels that changed between blank and solved)
 *   3. Dilate diff mask slightly to merge nearby pixels in the same word
 *   4. Find connected components — each component = one highlighted word
 *   5. Filter noise (too small) + outliers (too large = background change)
 *   6. For each component, compute bounding box
 *   7. Normalize to 0-1 range
 *   8. Sort top-to-bottom (natural reading order)
 *   9. Sample highlight color from highest-diff solved pixels
 *
 * Output: wordsearch.json  →  { rects: [{x1,y1,x2,y2}], width, height, highlightColor }
 *
 * Usage:
 *   node scripts/extract-wordsearch-path.mjs output/asmr/wordsearch-slug/activity.json
 *   node scripts/extract-wordsearch-path.mjs --asmr output/asmr/wordsearch-slug/
 */

import sharp from 'sharp';
import fs    from 'fs/promises';
import path  from 'path';
import { fileURLToPath } from 'url';

const ROOT  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCALE = 0.40;          // larger scale — word highlights are bigger than maze paths
const DIFF_THRESHOLD = 35;   // per-channel sum to count as "changed"
const MIN_PIXELS     = 25;   // minimum component size (noise filter)
const MAX_PIXELS_PCT = 0.08; // max component as % of total pixels (catches background shifts)
const DILATE_RADIUS  = 3;    // dilation radius to merge nearby diff pixels

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

// ── Morphological dilation ────────────────────────────────────────────────────
// Expands foreground pixels by radius so nearby word pixels merge into one region.
function dilate(mask, W, H, radius) {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H)
            out[ny * W + nx] = 1;
        }
      }
    }
  }
  return out;
}

// ── Connected components (BFS) ────────────────────────────────────────────────
// Returns array of pixel lists, one per component.
function findComponents(mask, W, H) {
  const visited = new Uint8Array(W * H);
  const components = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || visited[i]) continue;
    // BFS
    const queue  = [i];
    const pixels = [i];
    visited[i] = 1;
    while (queue.length) {
      const cur = queue.shift();
      const cx = cur % W, cy = Math.floor(cur / W);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dy && !dx) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          if (mask[ni] && !visited[ni]) {
            visited[ni] = 1;
            queue.push(ni);
            pixels.push(ni);
          }
        }
      }
    }
    components.push(pixels);
  }
  return components;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  let inputArg = getArg('--asmr') ?? process.argv[2];
  if (!inputArg) {
    console.error('Usage: node scripts/extract-wordsearch-path.mjs <activity.json|asmr-folder>');
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

  const meta   = await sharp(blankBuf).metadata();
  const W_full = meta.width, H_full = meta.height;
  const W = Math.round(W_full * SCALE);
  const H = Math.round(H_full * SCALE);
  console.log(`Image : ${W_full}×${H_full} → analysing at ${W}×${H} (${(SCALE * 100).toFixed(0)}%)`);

  const ch = 3;
  const blankSmall  = await sharp(blankBuf).resize(W, H).toColourspace('srgb').removeAlpha().raw().toBuffer();
  const solvedSmall = await sharp(solvedBuf).resize(W, H).toColourspace('srgb').removeAlpha().raw().toBuffer();

  // ── Diff mask ─────────────────────────────────────────────────────────────
  console.log('Computing diff mask...');
  const rawMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * ch;
    const d = Math.abs(blankSmall[o]   - solvedSmall[o])
            + Math.abs(blankSmall[o+1] - solvedSmall[o+1])
            + Math.abs(blankSmall[o+2] - solvedSmall[o+2]);
    if (d > DIFF_THRESHOLD) rawMask[i] = 1;
  }
  const rawCount = rawMask.reduce((s, v) => s + v, 0);
  console.log(`  Diff pixels: ${rawCount}`);

  // ── Dilate to merge word pixels ───────────────────────────────────────────
  console.log(`Dilating (radius ${DILATE_RADIUS})...`);
  const dilatedMask = dilate(rawMask, W, H, DILATE_RADIUS);

  // ── Connected components ──────────────────────────────────────────────────
  console.log('Finding word components...');
  const allComps = findComponents(dilatedMask, W, H);
  console.log(`  Total components: ${allComps.length}`);

  // ── Filter noise + background ─────────────────────────────────────────────
  const totalPixels = W * H;
  const filtered = allComps.filter(c => {
    if (c.length < MIN_PIXELS) return false;
    if (c.length > totalPixels * MAX_PIXELS_PCT) return false;
    return true;
  });
  console.log(`  After filtering: ${filtered.length} word regions`);

  if (filtered.length === 0) {
    console.error('ERROR: no word regions found — check images and DIFF_THRESHOLD');
    process.exit(1);
  }

  // ── Bounding boxes ────────────────────────────────────────────────────────
  const rects = filtered.map(pixels => {
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (const pi of pixels) {
      const px = pi % W, py = Math.floor(pi / W);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    // Expand boxes slightly — feels better than tight clipping
    const pad = 2;
    return {
      x1: Math.max(0, minX - pad) / W,
      y1: Math.max(0, minY - pad) / H,
      x2: Math.min(W - 1, maxX + pad) / W,
      y2: Math.min(H - 1, maxY + pad) / H,
    };
  });

  // Sort top-to-bottom (Y centroid), then left-to-right within same row
  rects.sort((a, b) => {
    const ay = (a.y1 + a.y2) / 2, by = (b.y1 + b.y2) / 2;
    const threshold = 0.04; // ~4% of height — same row tolerance
    if (Math.abs(ay - by) < threshold) return (a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2;
    return ay - by;
  });

  // ── Sample highlight color from solved image ──────────────────────────────
  console.log('Sampling highlight color...');
  const { data: blankFull, info: fullInfo } = await sharp(blankBuf)
    .toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const solvedFull = await sharp(solvedBuf)
    .resize(fullInfo.width, fullInfo.height, { fit: 'fill' })
    .toColourspace('srgb').removeAlpha().raw().toBuffer();
  const FW = fullInfo.width, FH = fullInfo.height;

  // Sample from the center area of the first detected word region
  const sampleRect = rects[0];
  const sx0 = Math.floor(sampleRect.x1 * FW), sx1 = Math.ceil(sampleRect.x2 * FW);
  const sy0 = Math.floor(sampleRect.y1 * FH), sy1 = Math.ceil(sampleRect.y2 * FH);
  const colorSamples = [];
  for (let y = sy0; y <= sy1; y += 3) {
    for (let x = sx0; x <= sx1; x += 3) {
      if (x >= FW || y >= FH) continue;
      const o = (y * FW + x) * ch;
      const d = Math.abs(blankFull[o]   - solvedFull[o])
              + Math.abs(blankFull[o+1] - solvedFull[o+1])
              + Math.abs(blankFull[o+2] - solvedFull[o+2]);
      if (d > DIFF_THRESHOLD * 2)
        colorSamples.push([solvedFull[o], solvedFull[o+1], solvedFull[o+2]]);
    }
  }

  let highlightColor = '#FFD700'; // default: yellow marker
  if (colorSamples.length > 0) {
    const r = Math.round(colorSamples.reduce((s, c) => s + c[0], 0) / colorSamples.length);
    const g = Math.round(colorSamples.reduce((s, c) => s + c[1], 0) / colorSamples.length);
    const b = Math.round(colorSamples.reduce((s, c) => s + c[2], 0) / colorSamples.length);
    highlightColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // ── Write wordsearch.json ─────────────────────────────────────────────────
  const outFile = path.join(folder, 'wordsearch.json');
  await fs.writeFile(outFile, JSON.stringify({ rects, width: W_full, height: H_full, highlightColor }, null, 2));

  console.log(`\n✓ ${rects.length} word rects → ${outFile}`);
  console.log(`  Highlight color : ${highlightColor} (${colorSamples.length} samples)`);
  rects.forEach((r, i) => {
    const wx = Math.round((r.x2 - r.x1) * W_full);
    const wy = Math.round((r.y2 - r.y1) * H_full);
    console.log(`  Word ${i + 1}: ${wx}×${wy}px @ (${(r.x1 * W_full).toFixed(0)}, ${(r.y1 * H_full).toFixed(0)})`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });

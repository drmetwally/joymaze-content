#!/usr/bin/env node
import sharp from 'sharp';
import { readFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

const ROOT = 'D:\\Joymaze-Content';
const activityDir = path.join(ROOT, 'output/challenge/generated-activity/qc-matching-stickers');
const matching = JSON.parse(readFileSync(path.join(activityDir, 'matching.json'), 'utf8'));
const stickers = ['fish', 'crab', 'seahorse', 'octopus', 'turtle', 'dolphin'];
const CANVAS_W=1700, CANVAS_H=2200, VW=1080, VH=1920;
const imgAR=CANVAS_W/CANVAS_H;
const renderW=VW, renderH=Math.round(VW/imgAR);
const offsetY=Math.round((VH-renderH)/2);

// High-contrast test: create image with bright green bg so ANY sticker content shows clearly
const bg = await sharp({ create: { width: VW, height: VH, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } }).png().toBuffer();

const stickerLayers = [];
for (let i=0; i<6; i++) {
  const r = matching.matchRects[i];
  const x = Math.round(offsetY + r.xNorm * renderW);
  const y = Math.round(offsetY + r.yNorm * renderH);
  const w = Math.round(r.wNorm * renderW);
  const h = Math.round(r.hNorm * renderH);
  const name = stickers[i];
  const buf = await sharp(path.join(ROOT, 'public/assets/stickers/matching/ocean', name + '.png'))
    .resize(w, h, { fit: 'contain', background: { r: 255, g: 0, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
  stickerLayers.push({ input: Buffer.from(buf), left: x, top: y });
}

const result = await sharp(Buffer.from(bg)).composite(stickerLayers).png().toBuffer();
await fs.writeFile(path.join(ROOT, 'output/videos/debug-stickers-green.png'), result);

// Now sample which stickers show non-green pixels
const raw = await sharp(Buffer.from(result)).raw().toBuffer();
console.log('Sticker visibility test (green bg, stickers overlaid):');
for (let i=0; i<6; i++) {
  const r = matching.matchRects[i];
  const x = Math.round(offsetY + r.xNorm * renderW);
  const y = Math.round(offsetY + r.yNorm * renderH);
  const w = Math.round(r.wNorm * renderW);
  const h = Math.round(r.hNorm * renderH);
  const cx = Math.round(x + w/2), cy = Math.round(y + h/2);
  // Sample 4 points within the sticker
  const points = [
    [Math.round(x + w*0.25), Math.round(y + h*0.25)],
    [cx, cy],
    [Math.round(x + w*0.75), Math.round(y + h*0.75)],
    [Math.round(x + w*0.5), Math.round(y + h*0.15)]
  ];
  let hasContent = false;
  for (const [px, py] of points) {
    const idx = py * VW + px;
    const [r, g, b] = [raw[idx*3], raw[idx*3+1], raw[idx*3+2]];
    if (!(r === 0 && g === 255 && b === 0)) { hasContent = true; break; }
  }
  console.log('  ' + stickers[i] + ' (idx ' + i + '): ' + (hasContent ? 'VISIBLE ✓' : 'NO CONTENT ✗'));
}
console.log('Green bg version at output/videos/debug-stickers-green.png');
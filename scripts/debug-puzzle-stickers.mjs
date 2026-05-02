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

const bg = await sharp({ create: { width: VW, height: VH, channels: 4, background: { r: 245, g: 241, b: 232, alpha: 1 } } }).png().toBuffer();

const stickerLayers = [];
for (let i=0; i<6; i++) {
  const r = matching.matchRects[i];
  const x = Math.round(offsetY + r.xNorm * renderW);
  const y = Math.round(offsetY + r.yNorm * renderH);
  const w = Math.round(r.wNorm * renderW);
  const h = Math.round(r.hNorm * renderH);
  const name = stickers[i];
  const buf = await sharp(path.join(ROOT, 'public/assets/stickers/matching/ocean', name + '.png'))
    .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  stickerLayers.push({ input: Buffer.from(buf), left: x, top: y });
}

// Composite stickers onto puzzle image (letterboxed)
const puzzleBuf = await sharp(path.join(activityDir, 'blank.png')).resize(VW, VH).png().toBuffer();
const stickerOnPuzzle = await sharp(Buffer.from(puzzleBuf)).composite(stickerLayers).png().toBuffer();

// Now sample pixel at each sticker center
const rawPixels = await sharp(Buffer.from(stickerOnPuzzle)).raw().toBuffer();

console.log('Pixel sampling at sticker centers on composite image:');
const results = [];
for (let i=0; i<6; i++) {
  const r = matching.matchRects[i];
  const x = Math.round(offsetY + r.xNorm * renderW);
  const y = Math.round(offsetY + r.yNorm * renderH);
  const w = Math.round(r.wNorm * renderW);
  const h = Math.round(r.hNorm * renderH);
  const cx = Math.round(x + w/2);
  const cy = Math.round(y + h/2);
  const idx = cy * VW + cx;
  const pix = [rawPixels[idx*3], rawPixels[idx*3+1], rawPixels[idx*3+2]];
  results.push({ sticker: stickers[i], gridIndex: i, cx, cy, rgb: pix });
  console.log('  ' + stickers[i] + ' gridIndex=' + i + ' at (' + cx + ',' + cy + '): RGB(' + pix.join(',') + ')');
}

await fs.writeFile(path.join(ROOT, 'output/videos/debug-stickers-on-puzzle.png'), stickerOnPuzzle);
console.log('\nSaved output/videos/debug-stickers-on-puzzle.png');
console.log('Now checking which stickers show image data vs. blank/transparent...');
const coloredCount = results.filter(p => {
  const [r,g,b] = p.rgb;
  return !(r < 5 && g < 5 && b < 5) && !(r > 240 && g > 230 && b > 240);
}).length;
console.log('Stickers with colored pixel data at center:', coloredCount, '/ 6');
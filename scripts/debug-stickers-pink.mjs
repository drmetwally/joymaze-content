#!/usr/bin/env node
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ROOT = 'D:\\Joymaze-Content';
const activityDir = path.join(ROOT, 'output/challenge/generated-activity/qc-matching-stickers');
const matching = JSON.parse(fs.readFileSync(path.join(activityDir, 'matching.json'), 'utf8'));
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
  // Use PINK background to make any missing stickers super obvious
  const buf = await sharp(path.join(ROOT, 'public/assets/stickers/matching/ocean', name + '.png'))
    .resize(w, h, { fit: 'contain', background: { r: 255, g: 0, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
  stickerLayers.push({ input: Buffer.from(buf), left: x, top: y });
  console.log('Sticker', i, name, '→ at (' + x + ',' + y + ') ' + w + 'x' + h + ', file exists: ' + fs.existsSync(path.join(ROOT, 'public/assets/stickers/matching/ocean', name + '.png')));
}

const result = await sharp(Buffer.from(bg)).composite(stickerLayers).png().toBuffer();
await fs.promises.writeFile(path.join(ROOT, 'output/videos/debug-stickers-pink.png'), result);

// Also verify pixel values at each sticker center
const verification = await sharp(Buffer.from(result)).raw().toBuffer();
const verifySticker = (i, rx, ry, rw, rh) => {
  const cx = Math.round(rx + rw/2), cy = Math.round(ry + rh/2);
  const idx = (cy * VW + cx) * 3;
  const r = verification[idx], g = verification[idx+1], b = verification[idx+2];
  const label = (r > 200 && g < 50 && b > 200) ? 'PINK(bad)' : (r > 50 || g > 50 || b > 50) ? 'HAS IMAGE DATA' : 'EMPTY/BLANK';
  console.log('  Center pixel at (' + cx + ',' + cy + '): RGB(' + r + ',' + g + ',' + b + ') → ' + label);
};

console.log('\nVerification at sticker centers:');
for (let i=0; i<6; i++) {
  const r = matching.matchRects[i];
  const x = Math.round(offsetY + r.xNorm * renderW);
  const y = Math.round(offsetY + r.yNorm * renderH);
  const w = Math.round(r.wNorm * renderW);
  const h = Math.round(r.hNorm * renderH);
  verifySticker(i, x, y, w, h);
}

console.log('\nSaved output/videos/debug-stickers-pink.png');
console.log('Pink = sticker area without visible image data');
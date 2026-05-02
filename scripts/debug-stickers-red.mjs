#!/usr/bin/env node
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = 'D:\\Joymaze-Content';

const activityDir = path.join(ROOT, 'output/challenge/generated-activity/qc-matching-stickers');
const matching = JSON.parse(fs.readFileSync(path.join(activityDir, 'matching.json'), 'utf8'));
const stickers = ['fish', 'crab', 'seahorse', 'octopus', 'turtle', 'dolphin'];
const CANVAS_W=1700, CANVAS_H=2200, VW=1080, VH=1920;
const imgAR=CANVAS_W/CANVAS_H;
const renderW=VW, renderH=Math.round(VW/imgAR);
const offsetY=Math.round((VH-renderH)/2);

console.log('renderW:', renderW, 'renderH:', renderH, 'offsetY:', offsetY);

const bg = await sharp(path.join(activityDir, 'blank.png')).resize(VW, VH).png().toBuffer();

const stickerLayers = [];
for (let i=0; i<6; i++) {
  const r = matching.matchRects[i];
  const x = Math.round(offsetY + r.xNorm * renderW);
  const y = Math.round(offsetY + r.yNorm * renderH);
  const w = Math.round(r.wNorm * renderW);
  const h = Math.round(r.hNorm * renderH);
  const name = stickers[i];
  console.log('Sticker', i, name, 'at (' + x + ',' + y + ') size', w + 'x' + h);
  // Red-tinted background to make visibility obvious
  const buf = await sharp(path.join(ROOT, 'public/assets/stickers/matching/ocean', name + '.png'))
    .resize(w, h, { fit: 'contain', background: { r: 255, g: 0, b: 0, alpha: 1 } })
    .png()
    .toBuffer();
  stickerLayers.push({ input: Buffer.from(buf), left: x, top: y });
}

const result = await sharp(Buffer.from(bg)).composite(stickerLayers).png().toBuffer();
await fs.promises.writeFile(path.join(ROOT, 'output/videos/debug-stickers-red.png'), result);
console.log('Saved output/videos/debug-stickers-red.png - red background = sticker placement');
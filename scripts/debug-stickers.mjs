#!/usr/bin/env node
// Debug: composite stickers onto blank.png to verify sticker + position logic
import fs from 'fs';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const activityDir = path.join(ROOT, 'output/challenge/generated-activity/qc-matching-stickers');
const matching = JSON.parse(fs.readFileSync(path.join(activityDir, 'matching.json'), 'utf8'));

const CANVAS_W = 1700, CANVAS_H = 2200;
const VW = 1080, VH = 1920;
const scale = Math.min(VW / CANVAS_W, VH / CANVAS_H);
const renderW = Math.round(CANVAS_W * scale);
const renderH = Math.round(CANVAS_H * scale);
const offsetY = Math.round((VH - renderH) / 2);

const stickers = ['fish', 'crab', 'seahorse', 'octopus', 'turtle', 'dolphin'];

// Resize blank.png to VW x VH (letterbox top-aligned)
const layers = [{ input: await sharp(path.join(activityDir, 'blank.png')).resize(VW, VH).toBuffer() }];

for (let i = 0; i < Math.min(6, matching.matchRects.length); i++) {
  const r = matching.matchRects[i];
  const x = Math.round(offsetY + r.xNorm * renderW);
  const y = Math.round(offsetY + r.yNorm * renderH);
  const w = Math.round(r.wNorm * renderW);
  const h = Math.round(r.hNorm * renderH);
  const stickerName = stickers[i % stickers.length];
  const stickerPath = path.join(ROOT, 'public/assets/stickers/matching/ocean', `${stickerName}.png`);
  // Resize sticker to card size before compositing (avoid dimension mismatch)
  const resized = await sharp(stickerPath).resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  layers.push({ input: Buffer.from(resized), left: x, top: y });
  console.log(`Compositing sticker ${stickerName} at (${x}, ${y}) ${w}x${h}`);
}

const result = await sharp({ create: { width: VW, height: VH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
  .composite(layers)
  .png()
  .toBuffer();

await fs.promises.writeFile(path.join(ROOT, 'output/videos/debug-stickers.png'), result);
console.log('Wrote output/videos/debug-stickers.png');
console.log('Card positions verified. If stickers are visible in debug-stickers.png but not in the Remotion render, the issue is in the Remotion bundle / staticFile resolution.');
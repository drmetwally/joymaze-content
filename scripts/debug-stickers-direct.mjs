#!/usr/bin/env node
// Create a test output where stickers are overlaid using sharp (no Remotion)
// This bypasses staticFile() path resolution entirely
import fs from 'fs/promises';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CANVAS_W = 1700, CANVAS_H = 2200;
const VW = 1080, VH = 1920;
const scale = Math.min(VW / CANVAS_W, VH / CANVAS_H);
const renderW = Math.round(CANVAS_W * scale);
const renderH = Math.round(CANVAS_H * scale);
const offsetY = Math.round((VH - renderH) / 2);

const matching = JSON.parse(await fs.readFile(path.join(ROOT, 'output/challenge/generated-activity/qc-matching-stickers/matching.json'), 'utf8'));
const stickers = ['fish', 'crab', 'seahorse', 'octopus', 'turtle', 'dolphin'];

// Create white 1080x1920 background
const bg = await sharp({
  create: { width: VW, height: VH, channels: 4, background: { r: 245, g: 241, b: 232, alpha: 1 } }
}).png().toBuffer();

// Resize the puzzle image to fit (letterboxed)
const puzzleBuf = await sharp(path.join(ROOT, 'output/challenge/generated-activity/qc-matching-stickers/blank.png'))
  .resize(renderW, renderH)
  .png()
  .toBuffer();

// Composite puzzle into white background
const withPuzzle = await sharp(Buffer.from(bg))
  .composite([{ input: Buffer.from(puzzleBuf), left: 0, top: offsetY }])
  .png()
  .toBuffer();

// Now composite stickers
const withStickers = await sharp(Buffer.from(withPuzzle))
  .composite(
    await Promise.all(
      stickers.slice(0, 6).map(async (name, i) => {
        const r = matching.matchRects[i];
        const x = Math.round(offsetY + r.xNorm * renderW);
        const y = Math.round(offsetY + r.yNorm * renderH);
        const w = Math.round(r.wNorm * renderW);
        const h = Math.round(r.hNorm * renderH);
        const stickerBuf = await sharp(path.join(ROOT, 'public/assets/stickers/matching/ocean', `${name}.png`))
          .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        return { input: Buffer.from(stickerBuf), left: x, top: y };
      })
    )
  )
  .png()
  .toBuffer();

await fs.writeFile(path.join(ROOT, 'output/videos/debug-stickers-direct.png'), withStickers);
console.log('Written: output/videos/debug-stickers-direct.png');
console.log('If this shows stickers at (287,576) etc. then position math is correct.');
console.log('Size:', withStickers.length, 'bytes');
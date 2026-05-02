#!/usr/bin/env node
// Try to extract specific frames using sharp + video-decoded approach
// Or use a different method to check what's in the video
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Composite stickers onto the blank.png at the exact positions render-video.mjs uses
// This simulates what MatchingStickerOverlay does
const activityDir = path.join(ROOT, 'output/challenge/generated-activity/qc-matching-stickers');
const matching = JSON.parse(fs.readFileSync(path.join(activityDir, 'matching.json'), 'utf8'));

const CANVAS_W = 1700, CANVAS_H = 2200;
const VW = 1080, VH = 1920;
const imgAR = CANVAS_W / CANVAS_H;
const renderW = VW, renderH = Math.round(VW / imgAR);
const offsetY = Math.round((VH - renderH) / 2);

const stickers = ['fish', 'crab', 'seahorse', 'octopus', 'turtle', 'dolphin'];

// Create the expected composite: white bg + letterboxed puzzle + stickers at computed positions
const bgBuf = await sharp({
  create: { width: VW, height: VH, channels: 4, background: { r: 245, g: 241, b: 232, alpha: 1 } }
}).png().toBuffer();

// Resize puzzle to letterboxed dimensions
const puzzleBuf = await sharp(path.join(activityDir, 'blank.png')).resize(renderW, renderH).png().toBuffer();

// Build composite layers: white bg + puzzle + 6 stickers
const stickerLayers = [];
for (let i = 0; i < 6; i++) {
  const r = matching.matchRects[i];
  const x = Math.round(offsetY + r.xNorm * renderW);
  const y = Math.round(offsetY + r.yNorm * renderH);
  const w = Math.round(r.wNorm * renderW);
  const h = Math.round(r.hNorm * renderH);
  const name = stickers[i];
  const stickerBuf = await sharp(path.join(ROOT, 'public/assets/stickers/matching/ocean', `${name}.png`))
    .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  stickerLayers.push({ input: Buffer.from(stickerBuf), left: x, top: y });
}

const composite = await sharp(Buffer.from(bgBuf))
  .composite([
    { input: Buffer.from(puzzleBuf), left: 0, top: offsetY },
    ...stickerLayers
  ])
  .png()
  .toBuffer();

await fs.promises.writeFile(path.join(ROOT, 'output/videos/debug-stickers-final.png'), composite);
console.log('Saved output/videos/debug-stickers-final.png');
console.log('This is what MatchingStickerOverlay should produce — check if stickers are visible at:');
console.log('  Card 0 (fish) at (287, 576) 248x248');
console.log('  Card 1 (crab) at (547, 576) 248x248');
console.log('  Card 2 (seahorse) at (807, 576) 248x248');
console.log('  Card 3 (octopus) at (1067, 576) 248x248');
console.log('  Card 4 (turtle) at (287, 836) 248x248');
console.log('  Card 5 (dolphin) at (547, 836) 248x248');
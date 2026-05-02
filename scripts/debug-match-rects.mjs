#!/usr/bin/env node
// Debug: add console logging to MatchingStickerOverlay by rendering a test frame
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Simulate what render-video.mjs does → compute matchRects
const CANVAS_W = 1700, CANVAS_H = 2200;
const VW = 1080, VH = 1920;
const imgAR = CANVAS_W / CANVAS_H;
const renderW = VW;
const renderH = VW / imgAR;
const offsetY = (VH - renderH) / 2;

const matching = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/challenge/generated-activity/qc-matching-stickers/matching.json'), 'utf8'));
const activity = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/challenge/generated-activity/qc-matching-stickers/activity.json'), 'utf8'));

console.log('=== Config ===');
console.log('renderW:', renderW, 'renderH:', renderH.toFixed(2), 'offsetY:', offsetY.toFixed(2));
console.log('activity.theme:', activity.theme);
console.log('activity.puzzleType:', activity.puzzleType);
console.log('');

const matchRects = (matching.matchRects || []).map(r => ({
  gridIndex: r.gridIndex,
  x: offsetY + r.xNorm * renderW,
  y: offsetY + r.yNorm * renderH,
  w: r.wNorm * renderW,
  h: r.hNorm * renderH,
}));

console.log('=== Computed matchRects (video pixel coords) ===');
console.log('count:', matchRects.length);
console.log('First 3:', JSON.stringify(matchRects.slice(0, 3), null, 2));
console.log('');

console.log('=== Expected sticker paths ===');
const themeKey = 'ocean';
const THEME_STICKERS = {
  animals: ['cat','dog','rabbit','elephant','lion','penguin'],
  ocean: ['fish','crab','seahorse','octopus','turtle','dolphin'],
  space: ['rocket','planet','astronaut','star','ufo','moon'],
  dinosaurs: ['trex','triceratops','stegosaurus','pterodactyl','brachiosaurus','raptor'],
  farm: ['cow','pig','chicken','horse','sheep','duck'],
  vehicles: ['car','bus','train','airplane','boat','bicycle'],
};
const stickerList = THEME_STICKERS[themeKey] || THEME_STICKERS.animals;
for (let i = 0; i < Math.min(6, matchRects.length); i++) {
  const name = stickerList[i % stickerList.length];
  const staticFilePath = `assets/stickers/matching/${themeKey}/${name}.png`;
  const absPath = path.join(ROOT, 'public', staticFilePath);
  console.log(` gridIndex ${i} (${matchRects[i].x.toFixed(0)}, ${matchRects[i].y.toFixed(0)}): ${staticFilePath} → exists: ${fs.existsSync(absPath)}`);
}
console.log('');
console.log('=== Frame timing ===');
const fps = 30;
const hookDurationSec = activity.hookDurationSec || 2.5;
const countdownSec = activity.countdownSec || 15;
const holdAfterSec = activity.holdAfterSec || 12;
const challengeFrames = Math.round(countdownSec * fps);
const transitionFrames = Math.round(hookDurationSec * fps);
const solveStart = challengeFrames + transitionFrames;
const solveFrames = Math.round(holdAfterSec * fps);
const celebrateStart = solveStart + solveFrames - Math.round(fps * 1.8);
console.log('hookDurationSec:', hookDurationSec, '→ frames:', transitionFrames);
console.log('countdownSec:', countdownSec, '→ frames:', challengeFrames);
console.log('solveStart frame:', solveStart);
console.log('solveFrames:', solveFrames, 'celebrateStart:', celebrateStart);
console.log('');
console.log('At frame 90:');
console.log('  isSolving:', (90 >= solveStart));
console.log('  thinkOpacity: 1 (always)');
console.log('  celebOpacity: 0 (not celebrating)');
console.log('  stickers should be visible at (x, y) positions above');
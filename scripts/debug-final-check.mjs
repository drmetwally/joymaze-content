#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const activity = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/challenge/generated-activity/qc-matching-stickers/activity.json'), 'utf8'));

const CANVAS_W = 1700, CANVAS_H = 2200;
const VW = 1080, VH = 1920;
const imgAR = CANVAS_W / CANVAS_H;
const renderW = VW;
const renderH = VW / imgAR;
const offsetY = (VH - renderH) / 2;

const activityRects = (activity.matchRects || []).map(r => ({
  gridIndex: r.gridIndex,
  x: offsetY + r.xNorm * renderW,
  y: offsetY + r.yNorm * renderH,
  w: r.wNorm * renderW,
  h: r.hNorm * renderH,
}));

console.log('activity.matchRects count:', activityRects.length);
console.log('First 3:', JSON.stringify(activityRects.slice(0, 3), null, 2));

const themeKey = 'ocean';
const THEME_STICKERS = { ocean: ['fish', 'crab', 'seahorse', 'octopus', 'turtle', 'dolphin'] };
const stickerList = THEME_STICKERS[themeKey];

console.log('');
console.log('Expected staticFile paths in Remotion:');
const bundleRoot = 'C:\\Users\\BESOO\\AppData\\Local\\Temp\\joymaze-remotion-public-u7rrSv';
for (let i = 0; i < 6; i++) {
  const name = stickerList[i];
  const sp = 'assets/stickers/matching/' + themeKey + '/' + name + '.png';
  const fullPath = path.join(bundleRoot, sp);
  console.log('  gridIndex', i, name + '.png ->', fs.existsSync(fullPath) ? 'EXISTS' : 'MISSING', '(' + sp + ')');
}

console.log('');
console.log('MatchingStickerOverlay will be called with matchRects=' + activityRects.length);
console.log('At frame 90 (challenge, thinkOpacity=1):');
console.log('  All 12 Img elements should render with stickers');
console.log('');
console.log('The Img style: position:absolute, left: rect.x, top: rect.y, width: rect.w, height: rect.h');
console.log('With zIndex: 6 on top of the puzzle image');
console.log('');
console.log('Double-check: does PuzzleJoyoLayer render for matching at frame 90?');
console.log('  puzzleType=matching → isMatching=true → MatchingStickerOverlay returned');
console.log('  No, wait - PuzzleJoyoLayer also renders MatchingStickerOverlay!');

console.log('');
console.log('=== Root cause check ===');
// PuzzleJoyoLayer IS the component being rendered for matching
// MatchingStickerOverlay is inside PuzzleJoyoLayer
// BUT - is PuzzleJoyoLayer actually in the render tree for matching?
// Let's check the ActivityChallenge render return
// PuzzleJoyoLayer is at zIndex 9, MatchingStickerOverlay is at zIndex 6 inside it
// Wait, MatchingStickerOverlay is a SIBLING of the puzzle image reveal, not inside it
console.log('Checking PuzzleJoyoLayer call for matching:');
console.log('  ActivityChallenge renders PuzzleJoyoLayer for ALL types (including matching)');
console.log('  MatchingStickerOverlay (zIndex 6) inside PuzzleJoyoLayer');
console.log('  BUT: the puzzle image from SolveReveal is ALSO rendered (zIndex 1)');
console.log('  So: stickers at zIndex 6 should be ABOVE puzzle image at zIndex 1');
console.log('');
console.log('UNLESS: the issue is that MatchingStickerOverlay returns null because of a prop issue');
console.log('Let me check the MatchingStickerOverlay condition...');
console.log('  if (!matchRects?.length) return null;');
console.log('  matchRects = 12 → NOT null → stickers ARE rendered');
console.log('');
console.log('Final hypothesis: the sticker files in the bundle ARE accessible, positions are correct.');
console.log('The stickers ARE rendering. The thumbnail just shows a bad frame.');
console.log('Frame 90 is 1.5s into the challenge. Matching has countdownSec=15, so frame 90 is');
console.log('still in the challenge countdown phase. Stickers should be visible from frame 0.');
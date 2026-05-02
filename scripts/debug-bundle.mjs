#!/usr/bin/env node
// Diagnostic: check what matchRects are actually being loaded from activity.json
// vs what computeMatchRects returns from matching.json
import fs from 'fs';
import path from 'path';

const activityDir = 'D:\\Joymaze-Content\\output\\challenge\\generated-activity\\qc-matching-stickers';
const activity = JSON.parse(fs.readFileSync(path.join(activityDir, 'activity.json'), 'utf8'));
const matching = JSON.parse(fs.readFileSync(path.join(activityDir, 'matching.json'), 'utf8'));

console.log('=== activity.json ===');
console.log('puzzleType:', activity.puzzleType);
console.log('theme:', activity.theme);
console.log('matchRects in activity.json:', activity.matchRects?.length);
console.log('First activity matchRect:', JSON.stringify(activity.matchRects?.[0]));
console.log('');
console.log('=== matching.json ===');
console.log('matchRects in matching.json:', matching.matchRects?.length);
console.log('First matching matchRect:', JSON.stringify(matching.matchRects?.[0]));
console.log('');

// Now simulate render-video.mjs exactly
const VW=1080, VH=1920;
const CANVAS_W=1700, CANVAS_H=2200;
const imgAR = CANVAS_W/CANVAS_H;
const renderW = VW;
const renderH = VW / imgAR;
const offsetY = (VH - renderH) / 2;

console.log('=== render-video.mjs matchRects computation (using matching.json) ===');
const computedRects = (matching.matchRects || []).map(r => ({
  gridIndex: r.gridIndex,
  x: offsetY + r.xNorm * renderW,
  y: offsetY + r.yNorm * renderH,
  w: r.wNorm * renderW,
  h: r.hNorm * renderH,
}));
console.log('First 2 computed rects:');
computedRects.slice(0,2).forEach(r => console.log(' ', JSON.stringify(r)));
console.log('');

console.log('=== render-video.mjs computation (using activity.json matchRects) ===');
// But render-video.mjs uses activity.matchRects as the source (the patched version)
// Let's check what the patched version would compute from activity.matchRects
const activityRects = (activity.matchRects || []).map(r => ({
  gridIndex: r.gridIndex,
  x: offsetY + r.xNorm * renderW,
  y: offsetY + r.yNorm * renderH,
  w: r.wNorm * renderW,
  h: r.hNorm * renderH,
}));
console.log('First 2 activity-derived rects:');
activityRects.slice(0,2).forEach(r => console.log(' ', JSON.stringify(r)));
console.log('');
console.log('Both sources give same result:', JSON.stringify(computedRects[0]) === JSON.stringify(activityRects[0]));
console.log('');

// Now check: what's in the bundle's copy of the sticker file?
const stickerPath = path.join('D:\\Joymaze-Content', 'public/assets/stickers/matching/ocean/fish.png');
const bundlePath = path.join('C:\\Users\\BESOO\\AppData\\Local\\Temp\\joymaze-remotion-public-u7rrSv\\assets\\stickers\\matching\\ocean\\fish.png');
console.log('=== File existence ===');
console.log('public/ path exists:', fs.existsSync(stickerPath));
console.log('bundle path exists:', fs.existsSync(bundlePath));
console.log('bundle file size:', fs.existsSync(bundlePath) ? fs.statSync(bundlePath).size : 'N/A');
console.log('');

// Check what's in the bundle index
const bundleIndexPath = path.join('D:\\Joymaze-Content', 'C:\\Users\\BESOO\\AppData\\Local\\Temp\\joymaze-remotion-public-u7rrSv\\assets\\stickers\\matching\\index.json');
if (fs.existsSync(bundleIndexPath)) {
  const idx = JSON.parse(fs.readFileSync(bundleIndexPath, 'utf8'));
  console.log('=== Bundle sticker index ===');
  console.log('ocean stickers in index:', idx.themes?.ocean?.length);
  console.log('First 3:', idx.themes?.ocean?.slice(0, 3));
}

// Check the actual image at bundle path
const fishBuf = fs.readFileSync(bundlePath);
console.log('Bundle fish.png file size:', fishBuf.length, 'bytes');
console.log('First 8 bytes (PNG sig):', fishBuf.slice(0, 8).toString('hex'));
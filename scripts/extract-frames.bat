#!/usr/bin/env node
// Extract frame 840 (celebrating) from the MP4 to check sticker visibility at solve
import { execSync } = require('child_process');
import fs from 'fs';
import path from 'path';

// Frame 840 is in the celebrating phase (celebrateStart=831)
// But ffmpeg extracts by frame number, not timestamp
// 840 frames at 30fps = 28 seconds
const outputPath = path.join('D:\\Joymaze-Content', 'output/videos/frame-840.png');
try {
  // Try frame number first (ffmpeg selects frame closest to timestamp)
  execSync(`ffmpeg -y -i "D:\\Joymaze-Content\\output\\videos\\qc-matching-stickers.mp4" -vf "select=eq(n\\,840)" -vframes 1 "${outputPath}"`, { stdio: 'ignore' });
} catch(e) {}

// Also try timestamp approach
try {
  execSync(`ffmpeg -y -i "D:\\Joymaze-Content\\output\\videos\\qc-matching-stickers.mp4" -ss 28 -vframes 1 "${outputPath.replace('frame-840','frame-28s')}"`, { stdio: 'ignore' });
} catch(e) {}

console.log('Extract frames using:');
console.log('  ffmpeg -y -i qc-matching-stickers.mp4 -ss 28 -vframes 1 frame-28s.png');
console.log('  ffmpeg -y -i qc-matching-stickers.mp4 -ss 10 -vframes 1 frame-10s.png');
console.log('  ffmpeg -y -i qc-matching-stickers.mp4 -ss 3 -vframes 1 frame-3s.png');
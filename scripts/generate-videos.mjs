#!/usr/bin/env node

/**
 * JoyMaze Content — Video Generation Pipeline
 *
 * Assembles short-form slideshow videos from generated images using FFmpeg.
 * Creates 9:16 vertical videos for TikTok, Instagram Reels, YouTube Shorts.
 *
 * Usage:
 *   node scripts/generate-videos.mjs                  # Generate from queue images
 *   node scripts/generate-videos.mjs --dry-run         # Prepare frames only (no FFmpeg)
 *   node scripts/generate-videos.mjs --count 1         # Generate 1 video (default)
 *   node scripts/generate-videos.mjs --duration 30     # Target duration in seconds
 *
 * Requires: FFmpeg installed and in PATH
 *   Windows: winget install Gyan.FFmpeg
 *   Or download from https://ffmpeg.org/download.html
 */

import 'dotenv/config';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const IMAGES_DIR = path.join(ROOT, 'output', 'images');
const VIDEOS_DIR = path.join(ROOT, 'output', 'videos');
const ASSETS_DIR = path.join(ROOT, 'assets');
const TEMP_DIR = path.join(ROOT, 'output', '.video-temp');

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const countIdx = args.indexOf('--count');
const VIDEO_COUNT = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 1;
const durIdx = args.indexOf('--duration');
const TARGET_DURATION = durIdx !== -1 ? parseInt(args[durIdx + 1], 10) : 30;

// Hypnotic micro-phrases for slide overlays — keyed by content category
const SLIDE_OVERLAYS = {
  'coloring-preview': ['Let them get lost in color.', 'The page is waiting.', 'Their hands. Their rules.'],
  'parent-tips': ['Worth knowing.', 'The science is in the fun.', 'This one surprised us.'],
  'app-feature': ['Watch them focus.', 'One tap. Real learning.', 'Something shifts.'],
  'book-preview': ['A gift they come back to.', 'Activities that outlast any toy.'],
  'fun-facts': ['The science behind the fun.', 'Play is research.', 'Did you know?'],
  'joyo-mascot': ['He loves what they love.', 'Meet Joyo.'],
  'motivation': ['Screen time can be sacred time.', 'Every child is an artist.'],
  'engagement': ['Which calls to them?', 'Let them decide.'],
  'seasonal': ['Made for right now.', 'New season. Same joy.'],
  'before-after': ['Watch it come alive.', 'Color changes everything.'],
};

function pickSlideOverlay(category, fallback) {
  const pool = SLIDE_OVERLAYS[category];
  if (pool?.length) return pool[Math.floor(Math.random() * pool.length)];
  return fallback || '';
}

// Video specs
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const FPS = 30;
const SECONDS_PER_SLIDE = 4;
const TRANSITION_FRAMES = 15; // 0.5s at 30fps

// Try to find FFmpeg - check PATH first, then known install locations
const FFMPEG_PATHS = ['ffmpeg', 'D:/Dev/ffmpeg/ffmpeg.exe', 'C:/ffmpeg/bin/ffmpeg.exe'];
let FFMPEG_BIN = 'ffmpeg';

/**
 * Check if FFmpeg is available and set the binary path
 */
function checkFfmpeg() {
  for (const bin of FFMPEG_PATHS) {
    try {
      execSync(`"${bin}" -version`, { stdio: 'pipe' });
      FFMPEG_BIN = bin;
      return true;
    } catch { /* try next */ }
  }
  return false;
}

/**
 * Create a branded intro frame
 */
async function createIntroFrame() {
  const svg = `
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#FF6B35" />
          <stop offset="100%" style="stop-color:#4ECDC4" />
        </linearGradient>
      </defs>
      <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="url(#bg)" />
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 - 60}" text-anchor="middle" font-family="Arial, sans-serif" font-size="80" fill="white" font-weight="bold">JoyMaze</text>
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 + 20}" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="rgba(255,255,255,0.9)">Screen time that feels like a gift.</text>
    </svg>`;

  let frame = sharp(Buffer.from(svg)).png();

  // Overlay logo if available
  try {
    const logoPath = path.join(ASSETS_DIR, 'logos', 'icon.png');
    await fs.access(logoPath);
    const logo = await sharp(logoPath).resize(200, 200).png().toBuffer();
    frame = sharp(await frame.toBuffer()).composite([
      { input: logo, top: VIDEO_HEIGHT / 2 - 250, left: VIDEO_WIDTH / 2 - 100 },
    ]);
  } catch { /* logo not available */ }

  return frame.png().toBuffer();
}

/**
 * Create a branded outro frame with CTA
 */
async function createOutroFrame() {
  const svg = `
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#4ECDC4" />
          <stop offset="100%" style="stop-color:#FF6B35" />
        </linearGradient>
      </defs>
      <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="url(#bg)" />
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 - 120}" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" fill="white" font-weight="bold">When you&#39;re ready,</text>
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 - 40}" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" fill="white" font-weight="bold">JoyMaze is waiting.</text>
      <rect x="${VIDEO_WIDTH / 2 - 220}" y="${VIDEO_HEIGHT / 2 + 20}" width="440" height="60" rx="30" fill="white" />
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 + 60}" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#FF6B35" font-weight="bold">Free on iOS &amp; Android</text>
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 + 150}" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="rgba(255,255,255,0.9)">joymaze.com</text>
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Prepare a content image as a video frame (resize to 1080x1920)
 */
async function prepareSlideFrame(imagePath, overlayText) {
  let image = sharp(imagePath).resize(VIDEO_WIDTH, VIDEO_HEIGHT, {
    fit: 'contain',
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  });

  if (overlayText) {
    const textSvg = `
      <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="40" y="${VIDEO_HEIGHT - 200}" width="${VIDEO_WIDTH - 80}" height="80" rx="16" fill="rgba(0,0,0,0.6)" />
        <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT - 150}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="white" font-weight="bold">${escapeXml(overlayText.slice(0, 60))}</text>
      </svg>`;
    image = sharp(await image.toBuffer()).composite([
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ]);
  }

  return image.png().toBuffer();
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Write frames to temp directory for FFmpeg
 */
async function writeFrames(frames, tempDir) {
  await fs.mkdir(tempDir, { recursive: true });
  let frameIndex = 0;

  for (const { buffer, durationFrames } of frames) {
    for (let i = 0; i < durationFrames; i++) {
      const filename = `frame_${String(frameIndex).padStart(5, '0')}.png`;
      await fs.writeFile(path.join(tempDir, filename), buffer);
      frameIndex++;
    }
  }

  return frameIndex;
}

/**
 * Assemble video from frames using FFmpeg
 */
function assembleVideo(tempDir, outputPath, totalFrames) {
  return new Promise((resolve, reject) => {
    const cmd = [
      `"${FFMPEG_BIN}"`, '-y',
      '-framerate', String(FPS),
      '-i', `"${path.join(tempDir, 'frame_%05d.png')}"`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '23',
      '-movflags', '+faststart',
      `"${outputPath}"`,
    ].join(' ');

    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(new Error(`FFmpeg failed: ${err.message}`));
      else resolve(outputPath);
    });
  });
}

/**
 * Clean up temp directory
 */
async function cleanup(tempDir) {
  try {
    const files = await fs.readdir(tempDir);
    for (const file of files) {
      await fs.unlink(path.join(tempDir, file));
    }
    await fs.rmdir(tempDir);
  } catch { /* ignore cleanup errors */ }
}

/**
 * Generate a slideshow video from queued content
 */
async function generateSlideshowVideo(queueItems, videoIndex) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const videoId = `${dateStr}-slideshow-${String(videoIndex).padStart(2, '0')}`;
  const tempDir = path.join(TEMP_DIR, videoId);

  console.log(`\n  Generating: ${videoId}`);

  // Calculate how many slides we need
  const slidesNeeded = Math.max(3, Math.floor(TARGET_DURATION / SECONDS_PER_SLIDE));
  const selectedItems = queueItems.slice(0, slidesNeeded);

  console.log(`    Slides: ${selectedItems.length} content pieces, ~${selectedItems.length * SECONDS_PER_SLIDE + 3}s total`);

  // Build frame sequence
  const frames = [];

  // Intro (1 second)
  console.log('    Creating intro frame...');
  const introBuffer = await createIntroFrame();
  frames.push({ buffer: introBuffer, durationFrames: FPS * 1 });

  // Content slides
  for (const item of selectedItems) {
    // Use instagram portrait image (closest to 9:16)
    const imageFile = item.outputs?.instagram_portrait || item.outputs?.instagram_square || item.outputs?.pinterest;
    if (!imageFile) continue;

    const imagePath = path.join(IMAGES_DIR, imageFile);
    try {
      await fs.access(imagePath);
    } catch {
      console.log(`    Skipping ${item.id}: image not found`);
      continue;
    }

    console.log(`    Slide: ${item.id} (${item.categoryName})`);
    const slideText = pickSlideOverlay(item.category, item.textOverlay || item.categoryName);
    const slideBuffer = await prepareSlideFrame(imagePath, slideText);
    frames.push({ buffer: slideBuffer, durationFrames: FPS * SECONDS_PER_SLIDE });
  }

  // Outro (2 seconds)
  console.log('    Creating outro frame...');
  const outroBuffer = await createOutroFrame();
  frames.push({ buffer: outroBuffer, durationFrames: FPS * 2 });

  // Write frames to disk
  console.log('    Writing frames...');
  const totalFrames = await writeFrames(frames, tempDir);
  const totalDuration = (totalFrames / FPS).toFixed(1);
  console.log(`    Total: ${totalFrames} frames (${totalDuration}s at ${FPS}fps)`);

  if (DRY_RUN) {
    console.log(`    [DRY RUN] Frames prepared in ${tempDir}`);
    console.log(`    [DRY RUN] Skipping FFmpeg assembly`);
    await cleanup(tempDir);
    return { id: videoId, status: 'dry-run', duration: totalDuration, slides: selectedItems.length };
  }

  // Assemble with FFmpeg
  const outputPath = path.join(VIDEOS_DIR, `${videoId}.mp4`);
  console.log(`    Assembling video with FFmpeg...`);

  try {
    await assembleVideo(tempDir, outputPath, totalFrames);
    console.log(`    Output: ${videoId}.mp4 (${totalDuration}s)`);
    await cleanup(tempDir);

    // Create queue metadata for the video
    const metadata = {
      id: videoId,
      type: 'video',
      format: 'slideshow',
      duration: parseFloat(totalDuration),
      slides: selectedItems.map(i => i.id),
      resolution: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
      outputFile: `${videoId}.mp4`,
      generatedAt: new Date().toISOString(),
      platforms: {
        tiktok: { status: 'pending' },
        youtube: { status: 'pending' },
        instagram: { status: 'pending', type: 'reel' },
      },
      captions: null,
    };

    await fs.writeFile(
      path.join(QUEUE_DIR, `${videoId}.json`),
      JSON.stringify(metadata, null, 2)
    );

    return { id: videoId, status: 'generated', duration: totalDuration, slides: selectedItems.length };
  } catch (err) {
    console.error(`    FFmpeg error: ${err.message}`);
    await cleanup(tempDir);
    return { id: videoId, status: 'failed', error: err.message };
  }
}

/**
 * Main pipeline
 */
async function main() {
  console.log('=== JoyMaze Video Generation Pipeline ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no FFmpeg)' : 'LIVE'}`);
  console.log(`Videos: ${VIDEO_COUNT} | Target duration: ${TARGET_DURATION}s`);

  const hasFfmpeg = checkFfmpeg();
  if (!hasFfmpeg && !DRY_RUN) {
    console.error('\nFFmpeg is not installed or not in PATH.');
    console.error('Install FFmpeg:');
    console.error('  Windows: winget install Gyan.FFmpeg');
    console.error('  Or download: https://ffmpeg.org/download.html');
    console.error('\nOr use --dry-run to prepare frames without assembling.');
    process.exit(1);
  }

  await fs.mkdir(VIDEOS_DIR, { recursive: true });
  await fs.mkdir(TEMP_DIR, { recursive: true });

  // Read queue for source images
  let queueFiles;
  try {
    queueFiles = await fs.readdir(QUEUE_DIR);
  } catch {
    console.log('\nNo queue directory. Run generate-images.mjs first.');
    process.exit(0);
  }

  const jsonFiles = queueFiles.filter(f => f.endsWith('.json'));
  const queueItems = [];

  for (const file of jsonFiles) {
    const data = JSON.parse(await fs.readFile(path.join(QUEUE_DIR, file), 'utf-8'));
    if (data.type !== 'video' && data.outputs) {
      queueItems.push(data);
    }
  }

  if (queueItems.length === 0) {
    console.log('\nNo image content in queue. Run generate-images.mjs first.');
    process.exit(0);
  }

  console.log(`\nSource images: ${queueItems.length} content pieces available`);

  // Generate videos
  const results = [];
  for (let i = 0; i < VIDEO_COUNT; i++) {
    // Shuffle items for variety between videos
    const shuffled = [...queueItems].sort(() => Math.random() - 0.5);
    const result = await generateSlideshowVideo(shuffled, i);
    results.push(result);
  }

  // Summary
  console.log('\n=== Video Generation Complete ===');
  for (const r of results) {
    console.log(`  ${r.id}: ${r.status} (${r.duration}s, ${r.slides} slides)`);
  }

  if (!hasFfmpeg) {
    console.log('\nNote: Install FFmpeg to assemble videos from frames.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * JoyMaze Content — Slideshow Video Pump
 *
 * Assembles short-form slideshow videos from queue images with Ken Burns,
 * crossfade transitions, narration overlays, and optional background music.
 * Creates 9:16 vertical videos for TikTok, Instagram Reels, YouTube Shorts.
 *
 * Usage:
 *   node scripts/generate-videos.mjs                     # Generate from queue images
 *   node scripts/generate-videos.mjs --dry-run            # Prepare frames only (no FFmpeg)
 *   node scripts/generate-videos.mjs --count 2            # Generate 2 videos
 *   node scripts/generate-videos.mjs --duration 30        # Target duration in seconds
 *   node scripts/generate-videos.mjs --music bg-chill.mp3 # Use specific music file
 *   node scripts/generate-videos.mjs --no-music           # Skip music even if available
 *   node scripts/generate-videos.mjs --category activity   # Only use activity items
 *   node scripts/generate-videos.mjs --slides id1,id2,id3  # Use specific queue items by ID
 *
 * Requires: FFmpeg installed and in PATH
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
const AUDIO_DIR = path.join(ASSETS_DIR, 'audio');
const TEMP_DIR = path.join(ROOT, 'output', '.video-temp');

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_MUSIC = args.includes('--no-music');
const countIdx = args.indexOf('--count');
const VIDEO_COUNT = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 1;
const durIdx = args.indexOf('--duration');
const TARGET_DURATION = durIdx !== -1 ? parseInt(args[durIdx + 1], 10) : 30;
const musicIdx = args.indexOf('--music');
const MUSIC_FILE = musicIdx !== -1 ? args[musicIdx + 1] : null;
const catIdx = args.indexOf('--category');
const FILTER_CATEGORY = catIdx !== -1 ? args[catIdx + 1] : null;
const slidesIdx = args.indexOf('--slides');
const MANUAL_SLIDES = slidesIdx !== -1 ? args[slidesIdx + 1].split(',') : null;

// Video specs
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const FPS = 30;
const SECONDS_PER_SLIDE = 4;
const TRANSITION_FRAMES = 15;    // 0.5s crossfade
const KEN_BURNS_SCALE = 1.10;   // 10% overscan for zoom/pan
const INTRO_SECONDS = 1.5;
const OUTRO_SECONDS = 2.5;

// Brand colors
const PRIMARY = '#FF6B35';
const SECONDARY = '#4ECDC4';

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
  // Activity categories
  'activity-maze': ['Can they find the way?', 'One path. Many turns.', 'Follow the trail.'],
  'activity-word-search': ['Words are hiding.', 'How many can you spot?', 'Sharp eyes win.'],
  'activity-matching': ['Two are the same.', 'Look closer.', 'Spot the match.'],
  'activity-tracing': ['Steady hands win.', 'Follow the dots.', 'Trace the path.'],
  'activity-quiz': ['How many can you count?', 'Which one is different?', 'Think fast.'],
};

function pickSlideOverlay(category) {
  const pool = SLIDE_OVERLAYS[category];
  if (pool?.length) return pool[Math.floor(Math.random() * pool.length)];
  return '';
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Ken Burns directions
const KB_DIRECTIONS = ['zoom-in', 'pan-right', 'pan-left', 'pan-down'];

// FFmpeg detection
const FFMPEG_PATHS = ['ffmpeg', 'D:/Dev/ffmpeg/ffmpeg.exe', 'C:/ffmpeg/bin/ffmpeg.exe'];
let FFMPEG_BIN = 'ffmpeg';

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

// ========== FRAME GENERATORS ==========

/**
 * Create branded intro frames with fade-in from black
 */
async function createIntroFrames() {
  const svg = `
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${PRIMARY}" />
          <stop offset="100%" style="stop-color:${SECONDARY}" />
        </linearGradient>
      </defs>
      <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="url(#bg)" />
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 - 60}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="80" fill="white" font-weight="bold">JoyMaze</text>
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 + 20}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="36" fill="rgba(255,255,255,0.9)">
        Screen time that feels like a gift.
      </text>
    </svg>`;

  let baseFrame = sharp(Buffer.from(svg));

  // Overlay logo if available
  try {
    const logoPath = path.join(ASSETS_DIR, 'logos', 'icon.png');
    await fs.access(logoPath);
    const logo = await sharp(logoPath).resize(200, 200).png().toBuffer();
    baseFrame = sharp(await baseFrame.png().toBuffer()).composite([
      { input: logo, top: VIDEO_HEIGHT / 2 - 250, left: VIDEO_WIDTH / 2 - 100 },
    ]);
  } catch { /* logo not available */ }

  const baseBuffer = await baseFrame.png().toBuffer();

  const totalFrames = Math.round(INTRO_SECONDS * FPS);
  const fadeInFrames = 15; // 0.5s
  const frames = [];

  const blackFrame = await sharp({
    create: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } },
  }).png().toBuffer();

  for (let i = 0; i < totalFrames; i++) {
    if (i < fadeInFrames) {
      const opacity = i / fadeInFrames;
      const blended = await sharp(blackFrame)
        .composite([{ input: baseBuffer, blend: 'over', opacity }])
        .png().toBuffer();
      frames.push(blended);
    } else {
      frames.push(baseBuffer);
    }
  }

  return frames;
}

/**
 * Create a content slide with Ken Burns effect + text overlay
 */
async function createSlideFrames(imagePath, overlayText) {
  const totalFrames = SECONDS_PER_SLIDE * FPS;
  const frames = [];

  // Ken Burns: overscan then crop with moving window
  const scaledW = Math.round(VIDEO_WIDTH * KEN_BURNS_SCALE);
  const scaledH = Math.round(VIDEO_HEIGHT * KEN_BURNS_SCALE);
  const oversizedBuffer = await sharp(imagePath)
    .resize(scaledW, scaledH, { fit: 'cover' })
    .png().toBuffer();

  const maxOffsetX = scaledW - VIDEO_WIDTH;
  const maxOffsetY = scaledH - VIDEO_HEIGHT;

  // Pick a random direction for this slide
  const direction = KB_DIRECTIONS[Math.floor(Math.random() * KB_DIRECTIONS.length)];

  // Pre-render text overlay SVG (if any)
  let textOverlaySvg = null;
  if (overlayText) {
    textOverlaySvg = `
      <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="40" y="${VIDEO_HEIGHT - 200}" width="${VIDEO_WIDTH - 80}" height="80" rx="16" fill="rgba(0,0,0,0.6)" />
        <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT - 150}" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="30" fill="white" font-weight="bold">
          ${escapeXml(overlayText.slice(0, 60))}
        </text>
      </svg>`;
  }

  const textFadeStart = 8;
  const textFadeFrames = 12;

  for (let i = 0; i < totalFrames; i++) {
    const progress = i / (totalFrames - 1);

    // Calculate crop position based on Ken Burns direction
    let left = 0, top = 0;
    switch (direction) {
      case 'zoom-in':
        left = Math.round((maxOffsetX / 2) * progress);
        top = Math.round((maxOffsetY / 2) * progress);
        break;
      case 'pan-right':
        left = Math.round(maxOffsetX * progress);
        top = Math.round(maxOffsetY / 2);
        break;
      case 'pan-left':
        left = Math.round(maxOffsetX * (1 - progress));
        top = Math.round(maxOffsetY / 2);
        break;
      case 'pan-down':
        left = Math.round(maxOffsetX / 2);
        top = Math.round(maxOffsetY * progress);
        break;
    }

    let frame = sharp(oversizedBuffer)
      .extract({ left, top, width: VIDEO_WIDTH, height: VIDEO_HEIGHT });

    // Add text overlay with fade-in
    if (textOverlaySvg && i >= textFadeStart) {
      const textOpacity = Math.min(1, (i - textFadeStart) / textFadeFrames);
      const svgWithOpacity = textOverlaySvg.replace('<svg ', `<svg opacity="${textOpacity}" `);
      frame = sharp(await frame.png().toBuffer())
        .composite([{ input: Buffer.from(svgWithOpacity), top: 0, left: 0 }]);
    }

    frames.push(await frame.png().toBuffer());
  }

  return frames;
}

/**
 * Create crossfade transition frames between two buffers
 */
async function createCrossfadeFrames(fromBuffer, toBuffer) {
  const frames = [];
  for (let i = 0; i < TRANSITION_FRAMES; i++) {
    const opacity = (i + 1) / TRANSITION_FRAMES;
    const blended = await sharp(fromBuffer)
      .composite([{ input: toBuffer, blend: 'over', opacity }])
      .png().toBuffer();
    frames.push(blended);
  }
  return frames;
}

/**
 * Create branded outro frames with fade-out to black
 */
async function createOutroFrames() {
  const svg = `
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${SECONDARY}" />
          <stop offset="100%" style="stop-color:${PRIMARY}" />
        </linearGradient>
      </defs>
      <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="url(#bg)" />
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 - 120}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="52" fill="white" font-weight="bold">
        When you&apos;re ready,
      </text>
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 - 40}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="52" fill="white" font-weight="bold">
        JoyMaze is waiting.
      </text>
      <rect x="${VIDEO_WIDTH / 2 - 220}" y="${VIDEO_HEIGHT / 2 + 20}" width="440" height="60" rx="30" fill="white" />
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 + 60}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="26" fill="${PRIMARY}" font-weight="bold">
        Free on iOS &amp; Android
      </text>
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 + 150}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="32" fill="rgba(255,255,255,0.9)">joymaze.com</text>
    </svg>`;

  const baseBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  const totalFrames = Math.round(OUTRO_SECONDS * FPS);
  const fadeOutStart = totalFrames - 15;
  const frames = [];

  const blackFrame = await sharp({
    create: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } },
  }).png().toBuffer();

  for (let i = 0; i < totalFrames; i++) {
    if (i >= fadeOutStart) {
      const opacity = 1 - ((i - fadeOutStart) / (totalFrames - fadeOutStart));
      const blended = await sharp(blackFrame)
        .composite([{ input: baseBuffer, blend: 'over', opacity }])
        .png().toBuffer();
      frames.push(blended);
    } else {
      frames.push(baseBuffer);
    }
  }

  return frames;
}

// ========== FRAME I/O ==========

async function writeAllFrames(allFrames, tempDir) {
  await fs.mkdir(tempDir, { recursive: true });
  let idx = 0;
  for (const buffer of allFrames) {
    const filename = `frame_${String(idx).padStart(6, '0')}.png`;
    await fs.writeFile(path.join(tempDir, filename), buffer);
    idx++;
    if (idx % 100 === 0) process.stdout.write(`    ${idx} frames written...\r`);
  }
  console.log(`    ${idx} frames written.          `);
  return idx;
}

async function cleanupDir(dir) {
  try {
    const files = await fs.readdir(dir);
    for (const file of files) await fs.unlink(path.join(dir, file));
    await fs.rmdir(dir);
  } catch { /* ignore */ }
}

// ========== FFMPEG ASSEMBLY ==========

function assembleVideo(tempDir, outputPath, musicPath, totalDuration) {
  return new Promise((resolve, reject) => {
    const parts = [
      `"${FFMPEG_BIN}"`, '-y',
      '-framerate', String(FPS),
      '-i', `"${path.join(tempDir, 'frame_%06d.png')}"`,
    ];

    if (musicPath) {
      parts.push('-i', `"${musicPath}"`);
      const fadeOutStart = Math.max(0, totalDuration - 2);
      parts.push(
        '-filter_complex',
        `"[1:a]afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=2,volume=0.3[a]"`,
        '-map', '0:v', '-map', '[a]',
        '-c:a', 'aac', '-b:a', '128k',
        '-shortest',
      );
    }

    parts.push(
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '23',
      '-movflags', '+faststart',
      `"${outputPath}"`,
    );

    const cmd = parts.join(' ');
    exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`FFmpeg failed: ${err.message}\n${stderr}`));
      else resolve(outputPath);
    });
  });
}

// ========== MUSIC DISCOVERY ==========

async function findMusic() {
  if (NO_MUSIC) return null;

  // Explicit --music flag
  if (MUSIC_FILE) {
    const direct = path.resolve(MUSIC_FILE);
    try { await fs.access(direct); return direct; } catch {}
    const inAudio = path.join(AUDIO_DIR, MUSIC_FILE);
    try { await fs.access(inAudio); return inAudio; } catch {}
    console.log(`    Warning: music file "${MUSIC_FILE}" not found, proceeding without music.`);
    return null;
  }

  // Auto-discover from assets/audio/
  try {
    const files = await fs.readdir(AUDIO_DIR);
    const audioFiles = files.filter(f => /\.(mp3|m4a|wav|ogg|aac)$/i.test(f));
    if (audioFiles.length > 0) {
      const pick = audioFiles[Math.floor(Math.random() * audioFiles.length)];
      return path.join(AUDIO_DIR, pick);
    }
  } catch { /* no audio dir */ }

  return null;
}

// ========== SLIDE SELECTION ==========

/**
 * Select thematically coherent slides instead of random shuffle.
 * Groups by category, picks the largest coherent group, sorts by subject.
 * Falls back to all items if no group is large enough.
 */
function selectCoherentSlides(queueItems, count) {
  // Manual override: --slides item1,item2,item3
  if (MANUAL_SLIDES) {
    const manual = MANUAL_SLIDES.map(id => queueItems.find(q => q.id === id)).filter(Boolean);
    if (manual.length > 0) {
      console.log(`    [Manual] ${manual.length} slides selected by ID`);
      return manual.slice(0, count);
    }
    console.log('    [Manual] No matching IDs found, falling back to auto-select');
  }

  // Group by theme
  const groups = {};
  for (const item of queueItems) {
    const cat = item.category || 'other';
    const key = cat.startsWith('activity-') ? cat :
                ['coloring-preview', 'before-after'].includes(cat) ? 'coloring' :
                ['parent-tips', 'motivation', 'engagement', 'fun-facts', 'story', 'pattern-interrupt'].includes(cat) ? 'story' :
                ['app-feature', 'book-preview', 'joyo-mascot', 'story-marketing'].includes(cat) ? 'app' :
                cat;
    (groups[key] ||= []).push(item);
  }

  // Sort groups by size descending
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  // Pick largest group; merge with second if not enough
  let selected = [...sorted[0][1]];
  const groupName = sorted[0][0];
  if (selected.length < count && sorted.length > 1) {
    selected.push(...sorted[1][1]);
  }

  // Sort by subject for visual coherence
  selected.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));

  console.log(`    [Auto] Theme: "${groupName}" (${Math.min(selected.length, count)} slides)`);
  return selected.slice(0, count);
}

// ========== MAIN VIDEO GENERATOR ==========

async function generateSlideshowVideo(queueItems, videoIndex) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const videoId = `${dateStr}-slideshow-${String(videoIndex).padStart(2, '0')}`;
  const tempDir = path.join(TEMP_DIR, videoId);

  console.log(`\n  Generating: ${videoId}`);

  // Slides are pre-selected by selectCoherentSlides()
  const selectedItems = queueItems;

  const estDuration = INTRO_SECONDS + selectedItems.length * SECONDS_PER_SLIDE + OUTRO_SECONDS;
  console.log(`    Slides: ${selectedItems.length} content pieces, ~${Math.round(estDuration)}s estimated`);

  // Find music
  const musicPath = await findMusic();
  console.log(`    Music: ${musicPath ? path.basename(musicPath) : 'none'}`);

  // ---- Generate all frames ----
  console.log('    Generating frames...');
  const allFrames = [];

  // 1. Intro with fade-in
  const introFrames = await createIntroFrames();
  allFrames.push(...introFrames);
  console.log(`    [Intro] ${introFrames.length} frames`);

  // 2. Content slides with Ken Burns + crossfades
  for (let i = 0; i < selectedItems.length; i++) {
    const item = selectedItems[i];
    const imageFile = item.outputs?.instagram_portrait || item.outputs?.instagram_square || item.outputs?.pinterest;
    if (!imageFile) continue;

    const imagePath = path.join(IMAGES_DIR, imageFile);
    try { await fs.access(imagePath); } catch {
      console.log(`    Skipping ${item.id}: image not found`);
      continue;
    }

    const overlayText = pickSlideOverlay(item.category);
    console.log(`    [Slide ${i + 1}/${selectedItems.length}] ${item.id} (${item.categoryName})`);

    const slideFrames = await createSlideFrames(imagePath, overlayText);

    // Crossfade from previous content
    if (allFrames.length > 0 && slideFrames.length > TRANSITION_FRAMES) {
      const lastFrame = allFrames[allFrames.length - 1];
      const firstFrame = slideFrames[0];
      const crossfade = await createCrossfadeFrames(lastFrame, firstFrame);
      allFrames.splice(allFrames.length - TRANSITION_FRAMES, TRANSITION_FRAMES);
      slideFrames.splice(0, TRANSITION_FRAMES);
      allFrames.push(...crossfade);
    }

    allFrames.push(...slideFrames);
  }

  // 3. Outro with fade-out
  const outroFrames = await createOutroFrames();

  // Crossfade into outro
  if (allFrames.length > 0 && outroFrames.length > TRANSITION_FRAMES) {
    const lastFrame = allFrames[allFrames.length - 1];
    const firstFrame = outroFrames[0];
    const crossfade = await createCrossfadeFrames(lastFrame, firstFrame);
    allFrames.splice(allFrames.length - TRANSITION_FRAMES, TRANSITION_FRAMES);
    outroFrames.splice(0, TRANSITION_FRAMES);
    allFrames.push(...crossfade);
  }
  allFrames.push(...outroFrames);

  const finalDuration = (allFrames.length / FPS).toFixed(1);
  console.log(`    [Outro] ${outroFrames.length} frames`);
  console.log(`    Total: ${allFrames.length} frames (${finalDuration}s at ${FPS}fps)`);

  // ---- Write frames ----
  console.log('    Writing frames to disk...');
  const frameCount = await writeAllFrames(allFrames, tempDir);

  if (DRY_RUN) {
    console.log(`    [DRY RUN] ${frameCount} frames prepared`);
    console.log('    [DRY RUN] Skipping FFmpeg assembly.');
    await cleanupDir(tempDir);
    return { id: videoId, status: 'dry-run', duration: finalDuration, slides: selectedItems.length };
  }

  // ---- Assemble with FFmpeg ----
  await fs.mkdir(VIDEOS_DIR, { recursive: true });
  const outputPath = path.join(VIDEOS_DIR, `${videoId}.mp4`);

  console.log('    Assembling video with FFmpeg...');
  try {
    await assembleVideo(tempDir, outputPath, musicPath, parseFloat(finalDuration));
    console.log(`    Output: ${videoId}.mp4 (${finalDuration}s)`);
    await cleanupDir(tempDir);

    // Create queue metadata
    const metadata = {
      id: videoId,
      type: 'video',
      format: 'slideshow',
      category: selectedItems[0]?.category || 'mixed',
      categoryName: 'Slideshow',
      duration: parseFloat(finalDuration),
      slideCount: selectedItems.length,
      hasMusic: !!musicPath,
      slides: selectedItems.map(i => i.id),
      resolution: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
      outputFile: `${videoId}.mp4`,
      generatedAt: new Date().toISOString(),
      platforms: {
        tiktok: { video: `${videoId}.mp4`, status: 'pending' },
        youtube: { video: `${videoId}.mp4`, status: 'pending' },
        instagram: { video: `${videoId}.mp4`, status: 'pending', type: 'reel' },
      },
      captions: null,
    };

    await fs.writeFile(
      path.join(QUEUE_DIR, `${videoId}.json`),
      JSON.stringify(metadata, null, 2),
    );
    console.log(`    Queue metadata: ${videoId}.json`);

    return { id: videoId, status: 'generated', duration: finalDuration, slides: selectedItems.length };
  } catch (err) {
    console.error(`    FFmpeg error: ${err.message}`);
    console.error('    Frames preserved in:', tempDir);
    return { id: videoId, status: 'failed', error: err.message };
  }
}

// ========== MAIN ==========

async function main() {
  console.log('=== JoyMaze Slideshow Video Pump ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no FFmpeg)' : 'LIVE'}`);
  console.log(`Videos: ${VIDEO_COUNT} | Target: ${TARGET_DURATION}s | Slide: ${SECONDS_PER_SLIDE}s`);
  if (FILTER_CATEGORY) console.log(`Category filter: ${FILTER_CATEGORY}`);

  const hasFfmpeg = checkFfmpeg();
  if (!hasFfmpeg && !DRY_RUN) {
    console.error('\nFFmpeg is not installed or not in PATH.');
    console.error('Install: winget install Gyan.FFmpeg');
    console.error('Or use --dry-run to prepare frames without assembling.');
    process.exit(1);
  }
  if (hasFfmpeg) console.log(`FFmpeg: ${FFMPEG_BIN}`);

  await fs.mkdir(VIDEOS_DIR, { recursive: true });

  // Read queue for source images
  let queueFiles;
  try {
    queueFiles = await fs.readdir(QUEUE_DIR);
  } catch {
    console.log('\nNo queue directory. Run import:raw first.');
    process.exit(0);
  }

  const jsonFiles = queueFiles.filter(f => f.endsWith('.json'));
  const queueItems = [];

  for (const file of jsonFiles) {
    const data = JSON.parse(await fs.readFile(path.join(QUEUE_DIR, file), 'utf-8'));
    if (data.type === 'video') continue;  // skip existing videos
    if (!data.outputs) continue;           // skip items without images

    // Category filter
    if (FILTER_CATEGORY) {
      if (FILTER_CATEGORY === 'activity' && !data.category?.startsWith('activity-')) continue;
      if (FILTER_CATEGORY === 'story' && data.category?.startsWith('activity-')) continue;
      if (FILTER_CATEGORY !== 'activity' && FILTER_CATEGORY !== 'story' && data.category !== FILTER_CATEGORY) continue;
    }

    queueItems.push(data);
  }

  if (queueItems.length === 0) {
    console.log('\nNo matching image content in queue.');
    process.exit(0);
  }

  console.log(`\nSource images: ${queueItems.length} content pieces`);

  // Generate videos
  const results = [];
  for (let i = 0; i < VIDEO_COUNT; i++) {
    const slidesNeeded = Math.max(3, Math.floor(TARGET_DURATION / SECONDS_PER_SLIDE));
    const selected = selectCoherentSlides(queueItems, slidesNeeded);
    const result = await generateSlideshowVideo(selected, i);
    results.push(result);
  }

  // Summary
  console.log('\n=== Video Generation Complete ===');
  for (const r of results) {
    if (r.status === 'generated' || r.status === 'dry-run') {
      console.log(`  ${r.id}: ${r.status} (${r.duration}s, ${r.slides} slides)`);
    } else {
      console.log(`  ${r.id}: FAILED — ${r.error}`);
    }
  }
  console.log('\nRun `npm run generate:captions` to add captions for video posts.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

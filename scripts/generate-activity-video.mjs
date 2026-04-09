#!/usr/bin/env node

/**
 * JoyMaze Content — Activity Puzzle Video Generator
 *
 * Converts activity image posts (maze, matching, quiz, spot-the-difference,
 * dot-to-dot) into 15-second YouTube Shorts. The puzzle image fills the frame,
 * a hook text overlay stays on screen for the full video, background music loops.
 *
 * No CTA. No outro. Clean cut — platform algorithm friendly.
 *
 * Usage:
 *   node scripts/generate-activity-video.mjs             # batch: all eligible queue items
 *   node scripts/generate-activity-video.mjs --id 2026-04-08-activity-maze-02
 *   node scripts/generate-activity-video.mjs --id 2026-04-08-activity-maze-02 --hook "Can you beat this?"
 *   node scripts/generate-activity-video.mjs --dry-run
 *   node scripts/generate-activity-video.mjs --no-music
 *
 * Eligible activity types (puzzle element required):
 *   maze, matching, quiz, dot-to-dot, spot-the-difference
 *
 * Output: output/videos/<id>-activity-short.mp4 + new queue JSON for YouTube
 */

import 'dotenv/config';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToCloud } from './upload-cloud.mjs';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const QUEUE_DIR  = path.join(ROOT, 'output', 'queue');
const IMAGES_DIR = path.join(ROOT, 'output', 'images');
const VIDEOS_DIR = path.join(ROOT, 'output', 'videos');
const AUDIO_DIR  = path.join(ROOT, 'assets', 'audio');
const TEMP_DIR   = path.join(ROOT, 'output', '.activity-video-temp');

// CLI args
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const NO_MUSIC = args.includes('--no-music');
const idIdx    = args.indexOf('--id');
const FILTER_ID = idIdx !== -1 ? args[idIdx + 1] : null;
const hookIdx  = args.indexOf('--hook');
const HOOK_OVERRIDE = hookIdx !== -1 ? args[hookIdx + 1] : null;

// Video specs
const VIDEO_WIDTH  = 1080;
const VIDEO_HEIGHT = 1920;
const FPS          = 30;
const DURATION_S   = 15;
const MUSIC_VOLUME = 0.25;

// Activity types that have a puzzle element and work as short-form challenge videos
const PUZZLE_TYPES = ['maze', 'matching', 'quiz', 'dot-to-dot', 'spot-the-difference', 'tracing'];

// Default hook text per activity type (fallback if hookText not in queue JSON)
const DEFAULT_HOOKS = {
  maze:                  'Can you solve this maze?',
  matching:              'Can you match all pairs?',
  quiz:                  'Can you answer this?',
  'dot-to-dot':          "What's hiding in the dots?",
  'spot-the-difference': 'Spot all the differences!',
  tracing:               'Can you trace the path?',
};

// FFmpeg binary detection
const FFMPEG_PATHS = ['ffmpeg', 'D:/Dev/ffmpeg/ffmpeg.exe', 'C:/ffmpeg/bin/ffmpeg.exe'];
let FFMPEG_BIN = null;

function findFfmpeg() {
  for (const bin of FFMPEG_PATHS) {
    try {
      execSync(`"${bin}" -version`, { stdio: 'pipe' });
      FFMPEG_BIN = bin;
      return true;
    } catch { /* try next */ }
  }
  return false;
}

function log(msg) { console.log(`[activity-video] ${msg}`); }

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Text overlay (stays full duration) ─────────────────────────────────────

/**
 * Build SVG hook text that sits at the top of the frame.
 * White bold text + heavy drop shadow — readable on any background.
 * Auto-wraps at 20 chars to a second line.
 */
function buildHookOverlaySvg(text) {
  let lines = [text];
  if (text.length > 22) {
    const mid = text.lastIndexOf(' ', Math.floor(text.length / 2));
    if (mid > 0) lines = [text.slice(0, mid), text.slice(mid + 1)];
  }

  const lineH   = 80;
  const startY  = Math.round(VIDEO_HEIGHT * 0.10); // top 10% of frame
  const textEls = lines.map((line, i) =>
    `<text
      x="${VIDEO_WIDTH / 2}"
      y="${startY + i * lineH}"
      text-anchor="middle"
      dominant-baseline="middle"
      font-family="Arial Black, Arial, sans-serif"
      font-size="68"
      font-weight="900"
      fill="white"
      filter="url(#sh)"
    >${escapeXml(line)}</text>`
  ).join('\n');

  return `<svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="black" flood-opacity="1"/>
      </filter>
    </defs>
    ${textEls}
  </svg>`;
}

// ── Image prep ──────────────────────────────────────────────────────────────

/**
 * Resize any image to exactly 1080x1920.
 * - TikTok variant is already the right size → pass through.
 * - Portrait/square → white letterbox padding.
 * - Landscape → blurred background fill.
 */
async function prepareFrame(imagePath) {
  const { width, height } = await sharp(imagePath).metadata();

  if (width === VIDEO_WIDTH && height === VIDEO_HEIGHT) {
    return sharp(imagePath).png().toBuffer();
  }

  const isLandscape = width > height;

  if (isLandscape) {
    const blurred = await sharp(imagePath)
      .resize(VIDEO_WIDTH, VIDEO_HEIGHT, { fit: 'cover' })
      .blur(20)
      .toBuffer();
    const scaledH = Math.round((VIDEO_WIDTH * height) / width);
    const fg = await sharp(imagePath)
      .resize(VIDEO_WIDTH, scaledH, { fit: 'fill' })
      .toBuffer();
    const topOffset = Math.round((VIDEO_HEIGHT - scaledH) / 2);
    return sharp(blurred)
      .composite([{ input: fg, top: topOffset, left: 0 }])
      .png()
      .toBuffer();
  }

  return sharp(imagePath)
    .resize(VIDEO_WIDTH, VIDEO_HEIGHT, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    })
    .png()
    .toBuffer();
}

// ── Audio selection ─────────────────────────────────────────────────────────

async function pickAudio() {
  try {
    const files = await fs.readdir(AUDIO_DIR);
    const audioFiles = files.filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));
    if (audioFiles.length === 0) return null;
    // Prefer crayon.mp3 for playful activity posts; fall back to first available
    const preferred = audioFiles.find(f => f.includes('crayon'));
    return path.join(AUDIO_DIR, preferred || audioFiles[0]);
  } catch {
    return null;
  }
}

// ── FFmpeg video assembly ───────────────────────────────────────────────────

/**
 * Assemble the final MP4:
 *   - Loop static frame PNG for DURATION_S seconds
 *   - Mix in background audio (looped + volume-lowered) if available
 *   - Encode: H.264 + AAC, yuv420p (platform compatible)
 */
async function assembleVideo(framePngPath, audioPath, outputPath) {
  const inputs = [`-loop 1 -framerate ${FPS} -i "${framePngPath}"`];

  let audioFilter = '';
  if (audioPath && !NO_MUSIC) {
    inputs.push(`-stream_loop -1 -i "${audioPath}"`);
    audioFilter = `-filter_complex "[1:a]volume=${MUSIC_VOLUME}[a]" -map 0:v -map "[a]" -c:a aac -b:a 128k`;
  } else {
    audioFilter = '-an'; // no audio
  }

  const cmd = [
    `"${FFMPEG_BIN}"`,
    '-y',
    ...inputs,
    `-t ${DURATION_S}`,
    '-c:v libx264',
    '-tune stillimage',
    '-preset fast',
    '-crf 22',
    '-pix_fmt yuv420p',
    audioFilter,
    `"${outputPath}"`,
  ].join(' ');

  if (DRY_RUN) {
    log(`  [dry-run] FFmpeg: ${cmd.slice(0, 120)}...`);
    return;
  }

  execSync(cmd, { stdio: 'pipe' });
}

// ── Queue JSON ──────────────────────────────────────────────────────────────

/**
 * Write a new queue JSON for the activity Short.
 * Type = "video", platform = youtube only (activity images already cover other platforms).
 */
async function writeQueueJson(sourceId, sourceMeta, videoFilename, hookText) {
  const videoId = `${sourceId}-yt-short`;
  const queuePath = path.join(QUEUE_DIR, `${videoId}.json`);

  const entry = {
    id: videoId,
    type: 'video',
    category: sourceMeta.category,
    categoryName: sourceMeta.categoryName,
    subject: sourceMeta.subject,
    source: 'activity-video',
    sourceId,
    hookText,
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    outputs: {
      youtube: videoFilename,
    },
    platforms: {
      youtube: {
        video: videoFilename,
        status: 'pending',
      },
    },
  };

  if (!DRY_RUN) {
    await fs.writeFile(queuePath, JSON.stringify(entry, null, 2));
    // Upload to Cloudinary for GitHub Actions posting
    try {
      const videoPath = path.join(ROOT, 'output', 'videos', videoFilename);
      entry.cloudUrl = await uploadToCloud(videoPath, 'joymaze/videos');
      await fs.writeFile(queuePath, JSON.stringify(entry, null, 2));
      console.log(`  Cloudinary: ${entry.cloudUrl}`);
    } catch (err) {
      console.warn(`  Cloudinary upload failed (local posting still works): ${err.message}`);
    }
  }
  return entry;
}

// ── Main processing ─────────────────────────────────────────────────────────

async function processItem(meta, sourceId) {
  // Determine activity type from category (e.g. "activity-maze" → "maze")
  const activityType = meta.category?.replace('activity-', '') || '';

  if (!PUZZLE_TYPES.includes(activityType)) {
    log(`  Skipping ${sourceId} — type "${activityType}" is not a puzzle type`);
    return false;
  }

  // Check if video already generated for this item
  const videoId       = `${sourceId}-yt-short`;
  const videoFilename = `${videoId}.mp4`;
  const videoPath     = path.join(VIDEOS_DIR, videoFilename);
  const queuePath     = path.join(QUEUE_DIR, `${videoId}.json`);

  try {
    await fs.access(queuePath);
    log(`  Skipping ${sourceId} — video already generated`);
    return false;
  } catch { /* not yet generated — proceed */ }

  // Resolve source image: prefer TikTok variant (already 1080x1920)
  const ttFilename = meta.outputs?.tiktok || meta.outputs?.instagram_portrait;
  if (!ttFilename) {
    log(`  Skipping ${sourceId} — no suitable source image found`);
    return false;
  }

  const imagePath = path.join(IMAGES_DIR, ttFilename);
  try {
    await fs.access(imagePath);
  } catch {
    log(`  Skipping ${sourceId} — image file not found: ${ttFilename}`);
    return false;
  }

  // Resolve hook text: CLI override > queue JSON > type default > generic
  const hookText = HOOK_OVERRIDE
    || meta.hookText
    || DEFAULT_HOOKS[activityType]
    || 'Can you solve this?';

  log(`Processing: ${sourceId}`);
  log(`  Type: ${activityType} | Hook: "${hookText}"`);
  log(`  Source image: ${ttFilename}`);

  if (DRY_RUN) {
    log(`  [dry-run] Would write: ${videoFilename}`);
    return true;
  }

  // Ensure temp and output dirs exist
  await fs.mkdir(TEMP_DIR,  { recursive: true });
  await fs.mkdir(VIDEOS_DIR, { recursive: true });

  // 1. Prepare the frame (resize to 1080x1920 if needed)
  log('  Preparing frame...');
  const frameBuffer = await prepareFrame(imagePath);

  // 2. Composite hook text overlay
  log('  Compositing hook text overlay...');
  const svgOverlay   = buildHookOverlaySvg(hookText);
  const framedBuffer = await sharp(frameBuffer)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .png()
    .toBuffer();

  // 3. Write composited frame to temp file
  const tempFramePath = path.join(TEMP_DIR, `${sourceId}-frame.png`);
  await fs.writeFile(tempFramePath, framedBuffer);

  // 4. Pick audio
  const audioPath = await pickAudio();
  if (audioPath) log(`  Audio: ${path.basename(audioPath)}`);
  else           log('  Audio: none found — generating silent video');

  // 5. Assemble video
  log('  Running FFmpeg...');
  await assembleVideo(tempFramePath, audioPath, videoPath);

  // 6. Cleanup temp frame
  await fs.unlink(tempFramePath).catch(() => {});

  // 7. Write queue JSON
  const queueEntry = await writeQueueJson(sourceId, meta, videoFilename, hookText);

  log(`  Done: ${videoFilename}`);
  log(`  Queue: ${queueEntry.id}`);
  return true;
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${NO_MUSIC ? ' | no music' : ''}`);

  if (!findFfmpeg()) {
    console.error('[activity-video] ERROR: FFmpeg not found. Install it or add to PATH.');
    process.exit(1);
  }
  log(`FFmpeg: ${FFMPEG_BIN}`);

  // Load queue items
  let queueFiles;
  try {
    queueFiles = await fs.readdir(QUEUE_DIR);
  } catch {
    console.error('[activity-video] ERROR: output/queue/ not found. Run generate-images first.');
    process.exit(1);
  }

  // Filter to activity posts only (not existing video queue entries)
  const candidates = queueFiles.filter(f =>
    f.endsWith('.json') &&
    f.includes('-activity-') &&
    !f.includes('-yt-short')
  );

  if (candidates.length === 0) {
    log('No activity queue items found.');
    return;
  }

  // Apply --id filter
  const toProcess = FILTER_ID
    ? candidates.filter(f => f.startsWith(FILTER_ID))
    : candidates;

  if (toProcess.length === 0) {
    log(`No queue item matching --id "${FILTER_ID}".`);
    return;
  }

  log(`Found ${toProcess.length} candidate(s)${FILTER_ID ? ` (filtered to: ${FILTER_ID})` : ''}`);

  let generated = 0;
  let skipped   = 0;

  for (const filename of toProcess) {
    const sourceId = filename.replace('.json', '');
    let meta;
    try {
      const raw = await fs.readFile(path.join(QUEUE_DIR, filename), 'utf-8');
      meta = JSON.parse(raw);
    } catch (err) {
      log(`  Error reading ${filename}: ${err.message}`);
      skipped++;
      continue;
    }

    const ok = await processItem(meta, sourceId);
    if (ok) generated++;
    else    skipped++;
  }

  log(`\nComplete: ${generated} video(s) generated, ${skipped} skipped.`);
  if (generated > 0 && !DRY_RUN) {
    log(`Videos: output/videos/`);
    log(`Queue:  output/queue/*-yt-short.json`);
    log(`Post:   node scripts/post-content.mjs --platform youtube`);
  }
}

main().catch(err => {
  console.error(`[activity-video] FATAL: ${err.message}`);
  process.exit(1);
});

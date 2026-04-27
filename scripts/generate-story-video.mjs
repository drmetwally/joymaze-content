#!/usr/bin/env node

/**
 * JoyMaze Content — Story Video Generator (Archetype 8: Joyo's Story Corner)
 *
 * Assembles short-form story videos from manually generated images + narration text.
 * Creates 9:16 vertical videos (45-60s) for TikTok, Instagram Reels, YouTube Shorts.
 *
 * Usage:
 *   node scripts/generate-story-video.mjs --story ep01-fox-and-frozen-river
 *   node scripts/generate-story-video.mjs --story ep01-fox-and-frozen-river --dry-run
 *   node scripts/generate-story-video.mjs --story ep01-fox-and-frozen-river --no-music
 *   node scripts/generate-story-video.mjs --story ep01-fox-and-frozen-river --tts openai
 *   node scripts/generate-story-video.mjs --story ep01-fox-and-frozen-river --tts kokoro
 *   node scripts/generate-story-video.mjs --story ep01-fox-and-frozen-river --tts edge
 *   node scripts/generate-story-video.mjs --init "The Fox and the Frozen River" --episode 1
 *
 * TTS Providers:
 *   --tts openai   OpenAI tts-1, voice: nova (~$0.01/story, warm natural quality)
 *   --tts kokoro   Kokoro-82M, voice: af_bella (free local fallback)
 *   --tts edge     Microsoft Edge TTS, voice: JennyNeural (last-resort free fallback)
 *   (no flag)      Text overlay only (current default)
 *
 * Story folder structure:
 *   output/stories/ep01-fox-and-frozen-river/
 *     story.json        # Title, episode, narration per slide, durations
 *     01.png ... 08.png # 5-8 AI-generated story images
 *     music.mp3         # (optional) royalty-free background music
 *     tts/              # Generated TTS audio clips (auto-created)
 */

import 'dotenv/config';
import sharp from 'sharp';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToCloud } from './upload-cloud.mjs';
import { execSync, exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORIES_DIR = path.join(ROOT, 'output', 'stories');
const VIDEOS_DIR = path.join(ROOT, 'output', 'videos');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const ASSETS_DIR = path.join(ROOT, 'assets');
const AUDIO_DIR = path.join(ASSETS_DIR, 'audio');
const TEMP_DIR = path.join(ROOT, 'output', '.story-temp');

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_MUSIC = args.includes('--no-music');
const INIT_MODE = args.includes('--init');
const storyIdx = args.indexOf('--story');
const STORY_FOLDER = storyIdx !== -1 ? args[storyIdx + 1] : null;
const initTitleIdx = args.indexOf('--init');
const INIT_TITLE = INIT_MODE ? args[initTitleIdx + 1] : null;
const epIdx = args.indexOf('--episode');
const EPISODE_NUM = epIdx !== -1 ? parseInt(args[epIdx + 1], 10) : 1;
const ttsIdx = args.indexOf('--tts');
const TTS_PROVIDER = ttsIdx !== -1 ? args[ttsIdx + 1] : null; // 'openai' | 'kokoro' | 'edge' | null
const speedIdx = args.indexOf('--speed');
const TTS_SPEED = speedIdx !== -1 ? parseFloat(args[speedIdx + 1]) : 0.75; // 0.25–4.0; 0.75 = slowest natural story pacing
const WORD_SYNC = args.includes('--word-sync'); // karaoke-style word-by-word text reveal
const voiceIdx = args.indexOf('--voice');
const TTS_VOICE_OVERRIDE = voiceIdx !== -1 ? args[voiceIdx + 1] : null; // explicit override; otherwise cycles
const USE_REMOTION = args.includes('--remotion'); // use Remotion renderer instead of FFmpeg frame pipeline
// OpenAI voices — cycled per episode so each story has a distinct narrator
const OPENAI_VOICE_POOL = ['nova', 'shimmer', 'fable', 'alloy', 'echo', 'onyx'];
// nova=warm female, shimmer=bright female, fable=British expressive, alloy=neutral, echo=male smooth, onyx=male deep

// Video specs
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const FPS = 30;
const HOOK_DURATION = 2.5;      // seconds — first image + bold hook text (scroll-stopper)
const TITLE_DURATION = 2;       // seconds — episode + title card
const INTRO_DURATION = HOOK_DURATION + TITLE_DURATION; // total intro
const OUTRO_DURATION = 0;       // no outro — video ends on last story frame for clean loop
const MAX_SCENE_DURATION = 4.5; // seconds — hard cap for non-TTS slide duration; warn if TTS exceeds
const TRANSITION_FRAMES = 15;   // 0.5s crossfade
const KEN_BURNS_SCALE = 1.10;   // 10% overscan for zoom/pan

// Brand colors
const PRIMARY = '#FF6B35';
const SECONDARY = '#4ECDC4';

// ========== VIDEO HOOK + CTA TEMPLATES ==========
// Halbert-style: short, punchy, open a loop. Max ~10 words.

const VIDEO_STORY_HOOKS = [
  'This story changes how they see the world.',
  'Watch. Something beautiful happens.',
  'A tiny creature. A big problem. One chance.',
  'Nobody expected what happened next.',
  'This is the bedtime story they\'ll ask for again.',
  'One small act of courage changes everything.',
  'The ending will surprise you.',
  'A story about finding what was always there.',
  'What happens when the smallest one tries?',
  'Sometimes the quiet ones change everything.',
  'This moment stays with you.',
  'Every parent needs to hear this story.',
];

// Emotional echo lines for outro (feeling, not thought)
const OUTRO_ECHO_LINES = [
  'Every child deserves a story like this.',
  'The good kind of screen time.',
  'This is what they\'ll remember.',
  'Stories that stay. Long after the screen goes dark.',
  'The quiet moments matter most.',
  'Something real. Something theirs.',
  'This feeling. You know it.',
  'Screen time, rewritten.',
];

/**
 * Pick a video hook based on episode number (deterministic rotation)
 */
function pickVideoHook(storyMeta) {
  // Use story.hook if explicitly set in story.json
  if (storyMeta.hook) return storyMeta.hook;
  const idx = (storyMeta.episode || 1) - 1;
  return VIDEO_STORY_HOOKS[idx % VIDEO_STORY_HOOKS.length];
}

function pickOutroEcho(storyMeta) {
  if (storyMeta.outroEcho) return storyMeta.outroEcho;
  const idx = (storyMeta.episode || 1) - 1;
  return OUTRO_ECHO_LINES[idx % OUTRO_ECHO_LINES.length];
}

// FFmpeg detection (reuse pattern from generate-videos.mjs)
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

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ========== SMART RESIZE ==========

/**
 * Resize any input image to a target canvas without harsh cropping.
 * Landscape → portrait/square: blur background letterbox (industry standard).
 * Compatible aspects: cover crop (no wasted canvas space).
 */
async function smartResize(inputBuffer, targetWidth, targetHeight) {
  const meta = await sharp(inputBuffer).metadata();
  const inputAspect = meta.width / meta.height;
  const targetAspect = targetWidth / targetHeight;

  // Close enough or both landscape → cover crop is fine
  if (Math.abs(inputAspect - targetAspect) < 0.15 || (inputAspect > 1 && targetAspect > 1)) {
    return sharp(inputBuffer).resize(targetWidth, targetHeight, { fit: 'cover' }).png().toBuffer();
  }

  // Blur background: fill canvas with blurred version of the image
  const bgBuffer = await sharp(inputBuffer)
    .resize(targetWidth, targetHeight, { fit: 'cover' })
    .blur(28)
    .png()
    .toBuffer();

  // Foreground: fit the full image within the canvas
  const fgBuffer = await sharp(inputBuffer)
    .resize(targetWidth, targetHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(bgBuffer)
    .composite([{ input: fgBuffer, blend: 'over' }])
    .png()
    .toBuffer();
}

// ========== INIT MODE ==========

async function initStory(title, episode) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const folderName = `ep${String(episode).padStart(2, '0')}-${slug}`;
  const storyDir = path.join(STORIES_DIR, folderName);

  await fs.mkdir(storyDir, { recursive: true });

  const storyJson = {
    title,
    episode,
    theme: 'Describe the story theme here',
    slides: [
      { image: '01.png', act: 1, narration: 'Short opener. One idea only.', duration: 3 },
      { image: '02.png', act: 1, narration: 'Something shifted.', duration: 3 },
      { image: '03.png', act: 1, narration: 'He had to find out why.', duration: 3 },
      { image: '04.png', act: 2, narration: 'The adventure began here.', duration: 4 },
      { image: '05.png', act: 2, narration: 'Harder than expected.', duration: 3 },
      { image: '06.png', act: 2, narration: 'One small clue changed everything.', duration: 4 },
      { image: '07.png', act: 2, narration: 'Almost there.', duration: 3 },
      { image: '08.png', act: 3, narration: 'He did it.', duration: 3 },
      { image: '09.png', act: 3, narration: 'And now he knew.', duration: 4 },
    ],
    music: null,
  };

  await fs.writeFile(
    path.join(storyDir, 'story.json'),
    JSON.stringify(storyJson, null, 2),
  );

  console.log(`\nStory folder created: output/stories/${folderName}/`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Edit story.json — each slide narration: 1 sentence, max 15 words, target 3-4s');
  console.log('  2. Generate 8-10 story images in Gemini/ChatGPT (one per slide)');
  console.log('  3. Save images as 01.png, 02.png, ... in the story folder');
  console.log('  4. (Optional) Add a royalty-free music.mp3 to the folder or assets/audio/');
  console.log(`  5. Run: npm run generate:story -- --story ${folderName}`);
  console.log('');
  return folderName;
}

// ========== FRAME GENERATION ==========

/**
 * Create the story intro frame sequence — 2-phase:
 *   Phase 1: First story image + bold hook text (scroll-stopper, HOOK_DURATION)
 *   Phase 2: Cinematic title card — episode number + title (TITLE_DURATION)
 *
 * Duration is driven by TTS when available (scales both phases proportionally).
 */
async function createIntroFrames(storyMeta, duration = INTRO_DURATION, firstImageBuffer = null) {
  const frames = [];
  const scale = duration / INTRO_DURATION; // TTS may adjust total intro length
  const hookFrames = Math.round(HOOK_DURATION * scale * FPS);
  const titleFrames = Math.round(TITLE_DURATION * scale * FPS);
  const fadeInFrames = 15;
  const crossfadeFrames = 12; // transition between hook → title

  // ---- Phase 1: Hook on first image ----
  const hookText = pickVideoHook(storyMeta);

  // Word-wrap hook text (~30 chars per line)
  const hookWords = hookText.split(' ');
  const hookLines = [];
  let hLine = '';
  for (const w of hookWords) {
    if ((hLine + ' ' + w).trim().length > 30) { hookLines.push(hLine.trim()); hLine = w; }
    else hLine += ' ' + w;
  }
  if (hLine.trim()) hookLines.push(hLine.trim());

  const hookLineHeight = 62;
  const hookBarPadding = 28;
  const hookBarHeight = hookLines.length * hookLineHeight + hookBarPadding * 2;
  const hookBarY = VIDEO_HEIGHT / 2 - hookBarHeight / 2 + 100; // slightly below center

  const hookTextElements = hookLines.map((l, i) =>
    `<text x="${VIDEO_WIDTH / 2}" y="${hookBarY + hookBarPadding + (i + 1) * hookLineHeight - 12}"
       text-anchor="middle" font-family="Arial, sans-serif" font-size="52"
       fill="white" font-weight="bold">${escapeXml(l)}</text>`
  ).join('\n');

  const hookOverlaySvg = `
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="50" y="${hookBarY}" width="${VIDEO_WIDTH - 100}" height="${hookBarHeight}"
        rx="20" fill="rgba(0,0,0,0.55)" />
      ${hookTextElements}
    </svg>`;

  // Build the hook frame: first story image (or black) + hook text
  let hookBaseBuffer;
  if (firstImageBuffer) {
    const imgResized = await smartResize(firstImageBuffer, VIDEO_WIDTH, VIDEO_HEIGHT);
    // Darken image slightly so text pops
    const darkenSvg = `
      <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="rgba(0,0,0,0.25)" />
      </svg>`;
    hookBaseBuffer = await sharp(imgResized)
      .composite([
        { input: Buffer.from(darkenSvg), top: 0, left: 0 },
        { input: Buffer.from(hookOverlaySvg), top: 0, left: 0 },
      ])
      .png().toBuffer();
  } else {
    // Fallback: hook text on black
    hookBaseBuffer = await sharp(Buffer.from(hookOverlaySvg.replace('rgba(0,0,0,0.55)', 'black')))
      .png().toBuffer();
  }

  const blackFrame = await sharp({
    create: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } },
  }).png().toBuffer();

  // Fade in hook
  for (let i = 0; i < hookFrames; i++) {
    if (i < fadeInFrames) {
      const opacity = i / fadeInFrames;
      frames.push(await sharp(blackFrame).composite([{ input: hookBaseBuffer, blend: 'over', opacity }]).png().toBuffer());
    } else {
      frames.push(hookBaseBuffer);
    }
  }

  // ---- Phase 2: Title card ----
  const titleWords = storyMeta.title.split(' ');
  const titleLines = [];
  let tLine = '';
  for (const w of titleWords) {
    if ((tLine + ' ' + w).trim().length > 22) { titleLines.push(tLine.trim()); tLine = w; }
    else tLine += ' ' + w;
  }
  if (tLine.trim()) titleLines.push(tLine.trim());

  const titleY = VIDEO_HEIGHT / 2 + 20;
  const titleLineHeight = 52;
  const titleElements = titleLines.map((l, i) =>
    `<text x="${VIDEO_WIDTH / 2}" y="${titleY + i * titleLineHeight}"
       text-anchor="middle" font-family="Arial, sans-serif" font-size="46"
       fill="rgba(255,255,255,0.88)">${escapeXml(l)}</text>`
  ).join('\n');

  const titleSvg = `
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="black" />
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 - 60}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="36" fill="rgba(255,255,255,0.55)"
        letter-spacing="6">EPISODE ${storyMeta.episode}</text>
      ${titleElements}
    </svg>`;
  const titleBaseBuffer = await sharp(Buffer.from(titleSvg)).png().toBuffer();

  // Crossfade from hook to title
  for (let i = 0; i < crossfadeFrames; i++) {
    const opacity = (i + 1) / crossfadeFrames;
    frames.push(await sharp(hookBaseBuffer).composite([{ input: titleBaseBuffer, blend: 'over', opacity }]).png().toBuffer());
  }

  // Hold title
  const holdTitleFrames = titleFrames - crossfadeFrames;
  for (let i = 0; i < holdTitleFrames; i++) {
    frames.push(titleBaseBuffer);
  }

  return frames;
}

/**
 * Create frames for a single story slide with Ken Burns effect + narration text
 */
async function createSlideFrames(storyDir, slide, durationOverride = null, wordTimestamps = null) {
  const frames = [];
  const imagePath = path.join(storyDir, slide.image);
  const rawDuration = durationOverride ?? Math.min(slide.duration, MAX_SCENE_DURATION);
  const totalFrames = Math.round(rawDuration * FPS);

  // Read and prepare the oversized image for Ken Burns
  // smartResize handles landscape inputs: blur letterbox instead of harsh crop
  const scaledW = Math.round(VIDEO_WIDTH * KEN_BURNS_SCALE);
  const scaledH = Math.round(VIDEO_HEIGHT * KEN_BURNS_SCALE);
  const rawBuffer = await fs.readFile(imagePath);
  const oversizedBuffer = await smartResize(rawBuffer, scaledW, scaledH);

  // Ken Burns direction (random per slide)
  const directions = ['zoom-in', 'pan-right', 'pan-left', 'pan-down'];
  const direction = directions[Math.floor(Math.random() * directions.length)];

  // Max offset for panning (the extra pixels from overscan)
  const maxOffsetX = scaledW - VIDEO_WIDTH;
  const maxOffsetY = scaledH - VIDEO_HEIGHT;

  // Narration overlay — static version pre-built for non-word-sync mode
  const staticNarrationSvg = wordTimestamps ? null : createNarrationOverlay(slide.narration);

  // Text fade-in: overlay appears after first 10 frames (0.33s)
  const textFadeStart = 10;
  const textFadeFrames = 15;

  for (let i = 0; i < totalFrames; i++) {
    const progress = totalFrames > 1 ? i / (totalFrames - 1) : 0; // 0 to 1

    // Calculate Ken Burns crop position
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

    // Text overlay — word-sync or static
    if (i >= textFadeStart) {
      const overallOpacity = Math.min(1, (i - textFadeStart) / textFadeFrames);
      let overlayStr;

      if (wordTimestamps) {
        // Word-sync: reveal words as they are spoken
        const frameTime = i / FPS;
        overlayStr = createWordSyncOverlay(wordTimestamps, slide.narration, frameTime, overallOpacity);
      } else {
        // Static: full narration text, fades in
        overlayStr = staticNarrationSvg.replace('OPACITY_VALUE', String(overallOpacity));
      }

      if (overlayStr) {
        frame = sharp(await frame.png().toBuffer())
          .composite([{ input: Buffer.from(overlayStr), top: 0, left: 0 }]);
      }
    }

    frames.push(await frame.png().toBuffer());
  }

  return frames;
}

/**
 * Create SVG narration overlay (bottom bar with text)
 */
function createNarrationOverlay(text) {
  // Word wrap: split into lines of ~35 chars max
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > 35) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += ' ' + word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  const lineHeight = 48;
  const padding = 30;
  const barHeight = lines.length * lineHeight + padding * 2;
  const barY = VIDEO_HEIGHT - barHeight - 60;

  const textElements = lines.map((line, idx) =>
    `<text x="${VIDEO_WIDTH / 2}" y="${barY + padding + (idx + 1) * lineHeight - 10}"
       text-anchor="middle" font-family="Arial, sans-serif" font-size="36"
       fill="white" font-weight="bold">${escapeXml(line)}</text>`
  ).join('\n');

  return `
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg"
         opacity="OPACITY_VALUE">
      <rect x="40" y="${barY}" width="${VIDEO_WIDTH - 80}" height="${barHeight}"
        rx="20" fill="rgba(0,0,0,0.65)" />
      ${textElements}
    </svg>`;
}

/**
 * Word-sync overlay: karaoke-style word-by-word reveal.
 *
 * Strategy: use the SAME word-wrap and centered <text> rendering as the static overlay,
 * but split each line into TWO rendered copies stacked on the same position:
 *   1. Ghost layer: full line text at 0.18 opacity (shows upcoming words)
 *   2. Revealed layer: only words spoken so far at full white opacity
 *
 * This avoids all per-word SVG positioning issues (font metrics, kerning, proportional width).
 * SVG handles text-anchor="middle" for perfect centering on both layers.
 *
 * wordTimestamps: [{word, start, end}, ...]  — from Whisper
 * narrationText: original slide narration (used for stable word-wrap)
 * frameTime: seconds since slide start
 * overallOpacity: outer fade-in value (0→1 over first 0.33s of slide)
 */
function createWordSyncOverlay(wordTimestamps, narrationText, frameTime, overallOpacity = 1) {
  if (!wordTimestamps || wordTimestamps.length === 0) return null;

  // Word-wrap using the original narration text (stable lines, no Whisper quirks)
  const plainWords = narrationText.split(/\s+/).filter(w => w.length > 0);
  const lines = [];
  let currentLine = '';
  for (const word of plainWords) {
    if ((currentLine + ' ' + word).trim().length > 35) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += ' ' + word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  // Map Whisper word indices to line indices.
  // Build a flat list matching plainWords → Whisper timestamps (by position).
  // Whisper may return slightly different word count; align by index.
  const wordStartTimes = plainWords.map((_, idx) => {
    const ts = wordTimestamps[idx];
    return ts ? ts.start : Infinity;
  });

  // Find how many words have been revealed (start <= frameTime)
  let revealedCount = 0;
  for (let i = 0; i < wordStartTimes.length; i++) {
    if (wordStartTimes[i] <= frameTime) revealedCount = i + 1;
    else break;
  }

  // Build revealed text per line
  const lineHeight = 48;
  const padding = 30;
  const barHeight = lines.length * lineHeight + padding * 2;
  const barY = VIDEO_HEIGHT - barHeight - 60;

  let wordIdx = 0;
  const textElements = [];
  for (let li = 0; li < lines.length; li++) {
    const lineWords = lines[li].split(/\s+/);
    const lineY = barY + padding + (li + 1) * lineHeight - 10;
    const cx = VIDEO_WIDTH / 2;

    // Ghost layer: full line at low opacity
    textElements.push(
      `<text x="${cx}" y="${lineY}" text-anchor="middle"
         font-family="Arial, sans-serif" font-size="36"
         fill="rgba(255,255,255,0.18)" font-weight="bold">${escapeXml(lines[li])}</text>`
    );

    // Revealed layer: only words spoken so far, at full white
    const revealedInLine = [];
    for (const w of lineWords) {
      if (wordIdx < revealedCount) {
        revealedInLine.push(w);
      }
      wordIdx++;
    }

    if (revealedInLine.length > 0) {
      // Build the revealed portion, left-padded with invisible chars to maintain centering.
      // Approach: render the full line but only the revealed words are white, rest transparent.
      // Since we can't do per-word color in a single centered text, use two-pass:
      // Pass 1 (ghost) already done above.
      // Pass 2: render revealed text left-aligned at the same position as the full line's start.
      // Simpler: just render the revealed words as a separate centered text that matches
      // the left portion of the full line. Pad the right side with spaces to maintain width.

      const revealedText = revealedInLine.join(' ');
      const remainingCount = lineWords.length - revealedInLine.length;
      // Pad right with non-breaking spaces to keep centering aligned with ghost layer
      const padding_str = remainingCount > 0
        ? '\u00A0'.repeat(lines[li].length - revealedText.length)
        : '';

      textElements.push(
        `<text x="${cx}" y="${lineY}" text-anchor="middle"
           font-family="Arial, sans-serif" font-size="36"
           fill="white" font-weight="bold">${escapeXml(revealedText)}${padding_str}</text>`
      );
    }
  }

  return `
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg"
         opacity="${overallOpacity}">
      <rect x="40" y="${barY}" width="${VIDEO_WIDTH - 80}" height="${barHeight}"
        rx="20" fill="rgba(0,0,0,0.65)" />
      ${textElements.join('\n      ')}
    </svg>`;
}

/**
 * Transcribe a TTS audio clip via OpenAI Whisper to get word-level timestamps.
 * Returns [{word, start, end}, ...] or null on failure.
 * Cost: ~$0.006/min → ~$0.0005 per 5s slide clip.
 */
async function getWordTimestamps(audioPath) {
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { createReadStream } = await import('fs');
    const response = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file: createReadStream(audioPath),
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });
    return (response.words || []).map(w => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));
  } catch (err) {
    console.warn(`  [word-sync] Whisper failed for ${path.basename(audioPath)}: ${err.message}`);
    return null;
  }
}

/**
 * Create crossfade transition frames between two slides
 */
async function createCrossfadeFrames(fromBuffer, toBuffer) {
  const frames = [];
  for (let i = 0; i < TRANSITION_FRAMES; i++) {
    const opacity = (i + 1) / TRANSITION_FRAMES;
    const blended = await sharp(fromBuffer)
      .composite([{ input: toBuffer, blend: 'over', opacity }])
      .png()
      .toBuffer();
    frames.push(blended);
  }
  return frames;
}

/**
 * Create the outro frame sequence — brief fade-to-black on the last story image.
 * No text overlay, no CTA. The story ends with its own resolution scene.
 */
async function createOutroFrames(storyMeta, lastImageBuffer = null) {
  const frames = [];
  const totalFrames = Math.round(OUTRO_DURATION * FPS); // 1.5s = 45 frames at 30fps
  const fadeStartFrame = Math.round(totalFrames * 0.3);  // hold 0.3, then fade

  const blackFrame = await sharp({
    create: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } },
  }).png().toBuffer();

  let holdBuffer;
  if (lastImageBuffer) {
    holdBuffer = await smartResize(lastImageBuffer, VIDEO_WIDTH, VIDEO_HEIGHT);
  } else {
    holdBuffer = blackFrame;
  }

  for (let i = 0; i < totalFrames; i++) {
    if (i < fadeStartFrame) {
      frames.push(holdBuffer);
    } else {
      // Fade last image to black
      const progress = (i - fadeStartFrame) / (totalFrames - fadeStartFrame);
      const opacity = Math.max(0, 1 - progress);
      const frame = await sharp(blackFrame)
        .composite([{ input: holdBuffer, blend: 'over', opacity }])
        .png().toBuffer();
      frames.push(frame);
    }
  }

  return frames;
}

// ========== TTS VOICEOVER ==========

/**
 * Generate speech audio via OpenAI TTS (tts-1, voice: nova)
 * Cost: ~$0.015 per 1000 characters (~$0.003 per 7-slide story)
 */
async function generateOpenAITTS(text, outputPath, speed = 0.75, voice = 'nova') {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.audio.speech.create({
    model: 'tts-1',
    voice,   // resolved by caller — cycles per episode unless --voice override
    input: text,
    response_format: 'wav',  // lossless — avoids MP3 artifacts from re-encoding
    speed,                   // 0.75 = slowest natural story pacing
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

/**
 * Generate speech audio via Microsoft Edge TTS (free, no API key)
 * Voice: en-US-JennyNeural (warm, natural female voice)
 */
async function generateKokoroTTS(text, outputPath, speed = 1.0) {
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'cpu',
  });
  const voice = 'af_bella';
  const audio = await tts.generate(text, { voice, speed });
  await audio.save(outputPath);
}

async function generateEdgeTTS(text, outputPath, speed = 0.9) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS();
  await tts.setMetadata('en-US-JennyNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(text);

  // Generate to temp file first, then apply speed via FFmpeg atempo
  const tempPath = outputPath + '.tmp.mp3';
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(tempPath);
    audioStream.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
    audioStream.on('error', reject);
  });

  // atempo=0.9 → 90% speed (slightly slower, story-like delivery)
  // Output as WAV (lossless) to avoid MP3 re-encoding artifacts
  await runFfmpeg(`"${FFMPEG_BIN}" -y -i "${tempPath}" -af "atempo=${speed}" -c:a pcm_s16le "${outputPath}"`);
  await fs.unlink(tempPath).catch(() => {});
}

/**
 * Run an FFmpeg command as a promise
 */
function runFfmpeg(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`FFmpeg failed: ${err.message}\n${stderr}`));
      else resolve();
    });
  });
}

/**
 * Measure actual duration of an audio file using FFmpeg.
 * FFmpeg prints duration to stderr even when the command "fails" (no output sink).
 * Returns seconds as a float, or null if unreadable.
 */
function getAudioDuration(audioPath) {
  return new Promise((resolve) => {
    exec(`"${FFMPEG_BIN}" -i "${audioPath}" -f null - 2>&1`, { timeout: 10000 }, (err, stdout, stderr) => {
      const output = stdout + stderr;
      const match = output.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (match) {
        resolve(+match[1] * 3600 + +match[2] * 60 + parseFloat(match[3]));
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Build a full narration audio track from per-slide TTS clips.
 *
 * Each clip's actual spoken duration is measured, then the slide frame count
 * is extended to cover the full narration (+ 0.5s grace). If narration is
 * shorter than the original slide duration, the original duration wins.
 *
 * Returns { narrationPath, adjustedDurations[] } — adjustedDurations is
 * aligned with storyMeta.slides and should replace slide.duration for frame gen.
 */
async function buildNarrationTrack(storyMeta, storyDir, provider) {
  const ttsDir = path.join(storyDir, 'tts');
  await fs.mkdir(ttsDir, { recursive: true });

  const activeVoice = TTS_VOICE_OVERRIDE
    || OPENAI_VOICE_POOL[(storyMeta.episode - 1) % OPENAI_VOICE_POOL.length];
  const generateFn = provider === 'openai'
    ? (t, p) => generateOpenAITTS(t, p, TTS_SPEED, activeVoice)
    : provider === 'kokoro'
    ? (t, p) => generateKokoroTTS(t, p, TTS_SPEED)
    : (t, p) => generateEdgeTTS(t, p, TTS_SPEED);
  const providerLabel = provider === 'openai'
    ? `OpenAI TTS (${activeVoice}, speed ${TTS_SPEED})`
    : provider === 'kokoro'
    ? `Kokoro TTS (af_bella, speed ${TTS_SPEED})`
    : `Edge TTS (JennyNeural, speed ${TTS_SPEED})`;
  console.log(`\nGenerating TTS narration with ${providerLabel}...\n`);

  // ---- Step 0: Intro VO — "Episode N. Title." ----
  const introText = `Episode ${storyMeta.episode}. ${storyMeta.title}.`;
  const introClipPath = path.join(ttsDir, 'raw_intro.wav');
  process.stdout.write(`  [Intro VO]: "${introText}"... `);
  await generateFn(introText, introClipPath);
  const introSpoken = await getAudioDuration(introClipPath);
  const introDuration = introSpoken
    ? Math.max(INTRO_DURATION, Math.ceil((introSpoken + 0.8) * 10) / 10)
    : INTRO_DURATION;
  console.log(`done (${introSpoken ? introSpoken.toFixed(1) : '?'}s spoken → ${introDuration}s intro)`);

  // ---- Step 1: Generate one audio clip per slide + measure real duration ----
  const rawClips = [];
  for (let i = 0; i < storyMeta.slides.length; i++) {
    const slide = storyMeta.slides[i];
    const clipPath = path.join(ttsDir, `raw_${String(i + 1).padStart(2, '0')}.wav`);
    process.stdout.write(`  Slide ${i + 1}/${storyMeta.slides.length}: "${slide.narration.slice(0, 50)}"... `);
    await generateFn(slide.narration, clipPath);

    // Audio drives timing — scene shows for as long as narration needs (+ 0.5s grace)
    // min 3s so very short lines still have a breath
    // warn if > MAX_SCENE_DURATION — narration is too long for the scene, split it in story.json
    const spokenDuration = await getAudioDuration(clipPath);
    const adjustedDuration = spokenDuration
      ? Math.max(3.0, Math.ceil((spokenDuration + 0.5) * 10) / 10)
      : Math.min(slide.duration, MAX_SCENE_DURATION);
    if (adjustedDuration > MAX_SCENE_DURATION) {
      console.warn(`  ⚠ Slide ${i + 1} narration is ${adjustedDuration}s — exceeds ${MAX_SCENE_DURATION}s target. Split into 2 slides in story.json for better retention.`);
    }

    // Word-sync: transcribe the raw clip to get word-level timestamps (for text reveal only)
    let wordTimestamps = null;
    if (WORD_SYNC) {
      process.stdout.write('  transcribing...');
      wordTimestamps = await getWordTimestamps(clipPath);
      if (wordTimestamps && wordTimestamps.length > 0) {
        process.stdout.write(` ${wordTimestamps.length} words`);
      } else {
        process.stdout.write(' no words (fallback to static text)');
        wordTimestamps = null;
      }
    }

    console.log(` done (${spokenDuration ? spokenDuration.toFixed(1) : '?'}s spoken → ${adjustedDuration}s slide)`);
    rawClips.push({ path: clipPath, adjustedDuration, spokenDuration, wordTimestamps });
  }

  // ---- Step 2: Pad intro clip to introDuration ----
  const introPaddedPath = path.join(ttsDir, 'pad_intro.wav');
  await runFfmpeg(
    `"${FFMPEG_BIN}" -y -i "${introClipPath}" -af "apad=whole_dur=${introDuration}" -c:a pcm_s16le "${introPaddedPath}"`
  );

  // ---- Step 3: Pad each slide clip ----
  // Each slide's audio is shortened by TRANSITION_FRAMES/FPS (0.5s) so the NEXT slide's VO
  // starts exactly when the crossfade to that slide begins — this cancels the cumulative
  // drift that crossfade frame-removal causes. Without this, visuals run ~0.5s ahead per
  // transition (3s ahead by slide 7 with 6 transitions).
  const TRANSITION_DUR = TRANSITION_FRAMES / FPS;
  const adjustedDurations = rawClips.map(c => c.adjustedDuration);
  const paddedClips = [];
  for (let i = 0; i < rawClips.length; i++) {
    const { path: rawPath, adjustedDuration, spokenDuration } = rawClips[i];
    const paddedPath = path.join(ttsDir, `pad_${String(i + 1).padStart(2, '0')}.wav`);
    // Shorten pad duration by one crossfade length so next VO starts as transition begins.
    // Never shorter than spoken audio + 0.05s buffer (prevents VO truncation).
    const minDur = (spokenDuration || adjustedDuration) + 0.05;
    const padDuration = Math.max(minDur, adjustedDuration - TRANSITION_DUR);
    await runFfmpeg(
      `"${FFMPEG_BIN}" -y -i "${rawPath}" -af "apad=whole_dur=${padDuration}" -c:a pcm_s16le "${paddedPath}"`
    );
    paddedClips.push(paddedPath);
  }

  // ---- Step 4: Concatenate via concat FILTER (not demuxer) ----
  // The concat demuxer joins MP3 files at the byte level, producing encoder-delay artifacts
  // (clicks/pops) at every segment boundary — audible as "shaky" VO.
  // The concat filter decodes all inputs to PCM first and joins at the sample level: zero artifacts.
  const narrationPath = path.join(storyDir, `narration-${provider}.wav`);
  const allSegments = [introPaddedPath, ...paddedClips];
  const inputFlags = allSegments.map(p => `-i "${p}"`).join(' ');
  const filterInputs = allSegments.map((_, idx) => `[${idx}:a]`).join('');
  const filterStr = `${filterInputs}concat=n=${allSegments.length}:v=0:a=1[a]`;
  await runFfmpeg(
    `"${FFMPEG_BIN}" -y ${inputFlags} -filter_complex "${filterStr}" -map "[a]" -c:a pcm_s16le "${narrationPath}"`
  );

  const adjustedPadTotal = rawClips.reduce((s, c) => {
    const minDur = (c.spokenDuration || c.adjustedDuration) + 0.05;
    return s + Math.max(minDur, c.adjustedDuration - TRANSITION_DUR);
  }, 0);
  const totalNarration = (introDuration + adjustedPadTotal).toFixed(1);
  const wordSyncLabel = WORD_SYNC ? ', word-sync' : '';
  console.log(`\nNarration track: narration-${provider}.wav (${totalNarration}s total, sync-adjusted, lossless${wordSyncLabel})\n`);
  const wordTimestampsPerSlide = rawClips.map(c => c.wordTimestamps || null);
  return { narrationPath, adjustedDurations, introDuration, wordTimestampsPerSlide };
}

// ========== FFMPEG ASSEMBLY ==========

function assembleVideo(tempDir, outputPath, musicPath, narrationPath, totalDuration) {
  return new Promise((resolve, reject) => {
    const parts = [
      `"${FFMPEG_BIN}"`, '-y',
      '-framerate', String(FPS),
      '-i', `"${path.join(tempDir, 'frame_%06d.png')}"`,
    ];

    const fadeOutStart = Math.max(0, totalDuration - 2);

    if (narrationPath && musicPath) {
      // 3 inputs: frames (0:v), narration (1:a), music (2:a)
      // Narration at full volume, music ducked to 12%
      parts.push('-i', `"${narrationPath}"`);
      parts.push('-i', `"${musicPath}"`);
      parts.push(
        '-filter_complex',
        `"[1:a]volume=1.0[nar];[2:a]afade=t=in:st=0:d=2,afade=t=out:st=${fadeOutStart}:d=2,volume=0.12[mus];[nar][mus]amix=inputs=2:duration=first[a]"`,
        '-map', '0:v', '-map', '[a]',
        '-c:a', 'aac', '-b:a', '128k',
        '-shortest',
      );
    } else if (narrationPath) {
      // Narration only — no background music
      parts.push('-i', `"${narrationPath}"`);
      parts.push('-map', '0:v', '-map', '1:a');
      parts.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
    } else if (musicPath) {
      // Music only (original behaviour)
      parts.push('-i', `"${musicPath}"`);
      parts.push(
        '-filter_complex',
        `"[1:a]afade=t=in:st=0:d=2,afade=t=out:st=${fadeOutStart}:d=2,volume=0.3[a]"`,
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

// ========== FRAME WRITING ==========

async function writeAllFrames(allFrames, tempDir) {
  await fs.mkdir(tempDir, { recursive: true });
  let idx = 0;
  for (const buffer of allFrames) {
    const filename = `frame_${String(idx).padStart(6, '0')}.png`;
    await fs.writeFile(path.join(tempDir, filename), buffer);
    idx++;
    // Progress indicator every 100 frames
    if (idx % 100 === 0) process.stdout.write(`    ${idx} frames written...\r`);
  }
  console.log(`    ${idx} frames written.          `);
  return idx;
}

async function cleanupDir(dir) {
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      await fs.unlink(path.join(dir, file));
    }
    await fs.rmdir(dir);
  } catch { /* ignore */ }
}

// ========== REMOTION RENDERER PATH ==========

/**
 * Render a story via Remotion (StoryEpisode composition) instead of the
 * frame-by-frame FFmpeg pipeline. The story.json is already on disk — we
 * just spawn render-video.mjs with the --story flag.
 *
 * Usage: add --remotion to any generate:story command.
 * e.g.  node scripts/generate-story-video.mjs --story ep01-fox --remotion
 */
async function renderWithRemotion(storyMeta, storyJsonPath) {
  const dateStr  = new Date().toISOString().slice(0, 10);
  const videoId  = `${dateStr}-story-ep${String(storyMeta.episode).padStart(2, '0')}-remotion`;
  const outputPath = path.join(VIDEOS_DIR, `${videoId}.mp4`);

  const relStory  = path.relative(ROOT, storyJsonPath).replace(/\\/g, '/');
  const renderScript = path.join(ROOT, 'scripts', 'render-video.mjs');

  console.log('\nRenderer: Remotion (StoryEpisode)');
  console.log(`  Story : ${relStory}`);
  console.log(`  Output: ${outputPath}`);

  if (DRY_RUN) {
    console.log('[DRY RUN] Remotion render skipped.');
    return;
  }

  await fs.mkdir(VIDEOS_DIR, { recursive: true });

  const cmd = `node "${renderScript}" --comp StoryEpisode --story "${relStory}" --out "${outputPath}"`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT });
  } catch (err) {
    console.error(`\nRemotion render failed: ${err.message}`);
    process.exit(1);
  }

  // Queue metadata (same shape as FFmpeg path)
  const metadata = {
    id:           videoId,
    type:         'video',
    format:       'story',
    category:     'kids-story-video',
    categoryName: "Joyo's Story Corner",
    archetype:    8,
    title:        storyMeta.title,
    episode:      storyMeta.episode,
    theme:        storyMeta.theme,
    slideCount:   storyMeta.slides.length,
    renderer:     'remotion',
    resolution:   `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
    outputFile:   `${videoId}.mp4`,
    generatedAt:  new Date().toISOString(),
    platforms: {
      tiktok:    { video: `${videoId}.mp4`, status: 'pending' },
      youtube:   { video: `${videoId}.mp4`, status: 'pending' },
      instagram: { video: `${videoId}.mp4`, status: 'pending', type: 'reel' },
    },
    captions: null,
  };

  await fs.mkdir(QUEUE_DIR, { recursive: true });
  const queuePath = path.join(QUEUE_DIR, `${videoId}.json`);
  await fs.writeFile(queuePath, JSON.stringify(metadata, null, 2));
  console.log(`Queue metadata: ${videoId}.json`);

  try {
    metadata.cloudUrl = await uploadToCloud(outputPath, 'joymaze/videos');
    await fs.writeFile(queuePath, JSON.stringify(metadata, null, 2));
    console.log(`Cloudinary: ${metadata.cloudUrl}`);
  } catch (err) {
    console.warn(`Cloudinary upload skipped: ${err.message}`);
  }

  console.log('\nDone! Run `npm run generate:captions` to add captions.\n');
}

// ========== MAIN ==========

async function main() {
  console.log('\n=== Joyo\'s Story Corner — Video Generator ===\n');

  // --init mode: scaffold a new story folder
  if (INIT_MODE) {
    if (!INIT_TITLE) {
      console.error('Usage: --init "Story Title" --episode N');
      process.exit(1);
    }
    await fs.mkdir(STORIES_DIR, { recursive: true });
    await initStory(INIT_TITLE, EPISODE_NUM);
    return;
  }

  // --story mode: generate video from a story folder
  if (!STORY_FOLDER) {
    console.error('Usage: --story <folder-name>  or  --init "Title" --episode N');
    console.error('');
    // List available stories
    try {
      const dirs = await fs.readdir(STORIES_DIR);
      if (dirs.length > 0) {
        console.log('Available stories:');
        for (const d of dirs) {
          try {
            const storyPath = path.join(STORIES_DIR, d, 'story.json');
            const meta = JSON.parse(await fs.readFile(storyPath, 'utf-8'));
            console.log(`  ${d} — Episode ${meta.episode}: ${meta.title}`);
          } catch {
            console.log(`  ${d} (no story.json)`);
          }
        }
      }
    } catch { /* no stories dir */ }
    process.exit(1);
  }

  const storyDir = path.join(STORIES_DIR, STORY_FOLDER);
  const storyJsonPath = path.join(storyDir, 'story.json');

  // Load and validate story
  let storyMeta;
  try {
    storyMeta = JSON.parse(await fs.readFile(storyJsonPath, 'utf-8'));
  } catch (err) {
    console.error(`Cannot read story.json: ${err.message}`);
    console.error(`Expected at: ${storyJsonPath}`);
    process.exit(1);
  }

  console.log(`Story: Episode ${storyMeta.episode} — ${storyMeta.title}`);
  console.log(`Theme: ${storyMeta.theme}`);
  console.log(`Slides: ${storyMeta.slides.length}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`TTS: ${TTS_PROVIDER || 'none (text overlay only)'}`);

  // Validate slide images exist
  const totalSlideDuration = storyMeta.slides.reduce((sum, s) => sum + s.duration, 0);
  const totalDuration = INTRO_DURATION + totalSlideDuration + OUTRO_DURATION;
  console.log(`Duration: ${INTRO_DURATION}s intro + ${totalSlideDuration}s story + ${OUTRO_DURATION}s outro = ${totalDuration}s total`);

  if (storyMeta.slides.length < 6 || storyMeta.slides.length > 15) {
    console.error(`Slide count should be 6-15 (got ${storyMeta.slides.length}) — aim for 8-10 short scenes`);
    process.exit(1);
  }

  for (const slide of storyMeta.slides) {
    const imgPath = path.join(storyDir, slide.image);
    try {
      await fs.access(imgPath);
    } catch {
      console.error(`Missing image: ${slide.image}`);
      console.error(`Expected at: ${imgPath}`);
      process.exit(1);
    }
  }

  // ── Remotion fast path ──────────────────────────────────────────────────────
  if (USE_REMOTION) {
    await renderWithRemotion(storyMeta, storyJsonPath);
    return;
  }

  // Find music file
  let musicPath = null;
  if (!NO_MUSIC) {
    // Check story folder first, then assets/audio/
    if (storyMeta.music) {
      const localMusic = path.join(storyDir, storyMeta.music);
      const globalMusic = path.join(AUDIO_DIR, storyMeta.music);
      try { await fs.access(localMusic); musicPath = localMusic; } catch {
        try { await fs.access(globalMusic); musicPath = globalMusic; } catch { /* no music */ }
      }
    }
    if (!musicPath) {
      // Check for any music.mp3 in story folder
      try {
        await fs.access(path.join(storyDir, 'music.mp3'));
        musicPath = path.join(storyDir, 'music.mp3');
      } catch { /* no default music */ }
    }
  }
  console.log(`Music: ${musicPath ? path.basename(musicPath) : 'none'}`);

  // Check FFmpeg
  const hasFfmpeg = checkFfmpeg();
  if (!hasFfmpeg && !DRY_RUN) {
    console.error('\nFFmpeg is not available. Install it or use --dry-run.');
    console.error('Known paths checked: ' + FFMPEG_PATHS.join(', '));
    process.exit(1);
  }
  if (hasFfmpeg) console.log(`FFmpeg: ${FFMPEG_BIN}`);

  // Validate TTS provider flag
  if (TTS_PROVIDER && !['openai', 'kokoro', 'edge'].includes(TTS_PROVIDER)) {
    console.error(`Unknown TTS provider: "${TTS_PROVIDER}". Use "openai", "kokoro", or "edge".`);
    process.exit(1);
  }
  if (TTS_PROVIDER === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key.startsWith('sk-your') || key === 'your-key-here') {
      console.error('OPENAI_API_KEY is not configured in .env (found placeholder value).');
      console.error('Set a real OpenAI key, or use --tts kokoro or --tts edge (free fallbacks).');
      process.exit(1);
    }
  }

  // ---- TTS Narration (optional) ----
  let narrationPath = null;
  let adjustedDurations = null;
  let introDuration = INTRO_DURATION; // may be overridden by TTS intro VO length
  let wordTimestampsPerSlide = null;
  if (TTS_PROVIDER && !DRY_RUN) {
    try {
      ({ narrationPath, adjustedDurations, introDuration, wordTimestampsPerSlide } = await buildNarrationTrack(storyMeta, storyDir, TTS_PROVIDER));
    } catch (err) {
      console.error(`\nTTS generation failed: ${err.message}`);
      console.error('Video will be generated WITHOUT voiceover.');
      if (TTS_PROVIDER === 'openai') console.error('Tip: Use --tts kokoro or --tts edge for free voiceover (no API key needed).');
      console.error('');
    }
  } else if (TTS_PROVIDER && DRY_RUN) {
    console.log(`[DRY RUN] TTS would be generated with provider: ${TTS_PROVIDER}`);
  }

  // ---- Generate all frames ----
  console.log('\nGenerating frames...\n');
  const allFrames = [];

  // Pre-read first and last slide images for hook intro + emotional echo outro
  const firstSlideImage = await fs.readFile(path.join(storyDir, storyMeta.slides[0].image));
  const lastSlideImage = await fs.readFile(path.join(storyDir, storyMeta.slides[storyMeta.slides.length - 1].image));

  // 1. Intro — hook on first image + title card
  const hookText = pickVideoHook(storyMeta);
  console.log(`  [Intro] Hook: "${hookText}" (${HOOK_DURATION}s) + title card (${TITLE_DURATION}s)...`);
  const introFrames = await createIntroFrames(storyMeta, introDuration, firstSlideImage);
  allFrames.push(...introFrames);
  console.log(`  [Intro] ${introFrames.length} frames (${introDuration}s)`);

  // 2. Story slides with Ken Burns + narration + crossfades
  for (let i = 0; i < storyMeta.slides.length; i++) {
    const slide = storyMeta.slides[i];
    const slideDuration = adjustedDurations ? adjustedDurations[i] : slide.duration;
    const actLabel = `ACT ${slide.act}`;
    console.log(`  [Slide ${i + 1}/${storyMeta.slides.length}] ${actLabel} — "${slide.narration.slice(0, 50)}..." (${slideDuration}s)`);

    const slideWordTs = wordTimestampsPerSlide ? wordTimestampsPerSlide[i] : null;
    const slideFrames = await createSlideFrames(storyDir, slide, adjustedDurations ? adjustedDurations[i] : null, slideWordTs);

    // Add crossfade between this slide and the previous content.
    // Crossfade targets slideFrames[TRANSITION_FRAMES] (the first frame actually shown
    // after the splice) so the new slide enters already in motion — no frozen static frame.
    if (allFrames.length > 0 && slideFrames.length > TRANSITION_FRAMES) {
      const lastFrame = allFrames[allFrames.length - 1];
      const entryFrame = slideFrames[TRANSITION_FRAMES]; // frame shown immediately after crossfade
      const crossfade = await createCrossfadeFrames(lastFrame, entryFrame);
      allFrames.splice(allFrames.length - TRANSITION_FRAMES, TRANSITION_FRAMES);
      slideFrames.splice(0, TRANSITION_FRAMES);
      allFrames.push(...crossfade);
    }

    allFrames.push(...slideFrames);
  }

  // 3. No outro — video ends on last story frame for clean platform loop
  console.log(`  [Outro] None — clean cut on last frame (loop-friendly)`);

  const finalDuration = (allFrames.length / FPS).toFixed(1);
  console.log(`\nTotal: ${allFrames.length} frames (${finalDuration}s at ${FPS}fps)`);

  // ---- Write frames + assemble ----
  const dateStr = new Date().toISOString().slice(0, 10);
  const ttsLabel = TTS_PROVIDER ? `-${TTS_PROVIDER}` : '';
  const videoId = `${dateStr}-story-ep${String(storyMeta.episode).padStart(2, '0')}${ttsLabel}`;
  const tempDir = path.join(TEMP_DIR, videoId);

  console.log('\nWriting frames to disk...');
  const frameCount = await writeAllFrames(allFrames, tempDir);

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] ${frameCount} frames prepared in ${tempDir}`);
    console.log('[DRY RUN] Skipping FFmpeg assembly.');
    await cleanupDir(tempDir);
    return;
  }

  // Assemble with FFmpeg
  await fs.mkdir(VIDEOS_DIR, { recursive: true });
  const outputPath = path.join(VIDEOS_DIR, `${videoId}.mp4`);

  console.log('\nAssembling video with FFmpeg...');
  try {
    await assembleVideo(tempDir, outputPath, musicPath, narrationPath, parseFloat(finalDuration));
    console.log(`\nOutput: ${outputPath}`);
    console.log(`Duration: ${finalDuration}s`);

    // Create queue metadata
    const metadata = {
      id: videoId,
      type: 'video',
      format: 'story',
      category: 'kids-story-video',
      categoryName: "Joyo's Story Corner",
      archetype: 8,
      title: storyMeta.title,
      episode: storyMeta.episode,
      theme: storyMeta.theme,
      duration: parseFloat(finalDuration),
      slideCount: storyMeta.slides.length,
      hasMusic: !!musicPath,
      ttsProvider: TTS_PROVIDER || null,
      hasVoiceover: !!narrationPath,
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

    const queuePath = path.join(QUEUE_DIR, `${videoId}.json`);
    await fs.writeFile(queuePath, JSON.stringify(metadata, null, 2));
    console.log(`Queue metadata: ${videoId}.json`);

    // Upload to Cloudinary for GitHub Actions posting
    try {
      metadata.cloudUrl = await uploadToCloud(outputPath, 'joymaze/videos');
      await fs.writeFile(queuePath, JSON.stringify(metadata, null, 2));
      console.log(`Cloudinary: ${metadata.cloudUrl}`);
    } catch (err) {
      console.warn(`Cloudinary upload failed (local posting still works): ${err.message}`);
    }

    // Cleanup temp frames
    await cleanupDir(tempDir);
    console.log('\nDone! Run `npm run generate:captions` to add captions.\n');
  } catch (err) {
    console.error(`\nFFmpeg error: ${err.message}`);
    console.error('Frames are preserved in:', tempDir);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * JoyMaze Content — ASMR Activity Video Generator (Archetype 9)
 *
 * Assembles calming process videos from AI-generated progression images.
 * No voiceover, no text overlays on slides, optional ambient music at low volume.
 * Creates 9:16 vertical videos for TikTok, Instagram Reels, YouTube Shorts.
 *
 * Usage:
 *   node scripts/generate-asmr-video.mjs --asmr coloring-ocean-scene
 *   node scripts/generate-asmr-video.mjs --asmr coloring-ocean-scene --dry-run
 *   node scripts/generate-asmr-video.mjs --asmr coloring-ocean-scene --no-music
 *   node scripts/generate-asmr-video.mjs --init "Ocean Coloring" --type coloring
 *
 * ASMR folder structure:
 *   output/asmr/coloring-ocean-scene/
 *     activity.json        # Title, type, slides with durations
 *     01.png ... 05.png    # Progression images (empty -> 25% -> 50% -> 75% -> done)
 *     music.mp3            # (optional) ambient/calm background audio
 *
 * Requires: FFmpeg installed (checked at D:/Dev/ffmpeg/ or system PATH)
 */

import 'dotenv/config';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToCloud } from './upload-cloud.mjs';
import { execSync, exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASMR_DIR = path.join(ROOT, 'output', 'asmr');
const VIDEOS_DIR = path.join(ROOT, 'output', 'videos');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const ASSETS_DIR = path.join(ROOT, 'assets');
const AUDIO_DIR = path.join(ASSETS_DIR, 'audio');
const TEMP_DIR = path.join(ROOT, 'output', '.asmr-temp');

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_MUSIC = args.includes('--no-music');
const INIT_MODE = args.includes('--init');
const asmrIdx = args.indexOf('--asmr');
const ASMR_FOLDER = asmrIdx !== -1 ? args[asmrIdx + 1] : null;
const initTitleIdx = args.indexOf('--init');
const INIT_TITLE = INIT_MODE ? args[initTitleIdx + 1] : null;
const typeIdx = args.indexOf('--type');
const ACTIVITY_TYPE = typeIdx !== -1 ? args[typeIdx + 1] : 'coloring';

// ASMR video specs — deliberately slower and calmer than slideshow/story
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const FPS = 30;
const SECONDS_PER_SLIDE = 6;       // slower than slideshow (4s) and story (7s)
const TRANSITION_FRAMES = 30;      // 1.0s crossfade (slideshow: 0.5s)
const KEN_BURNS_SCALE = 1.06;      // gentle 6% overscan (slideshow: 10%)
const INTRO_SECONDS = 2.0;         // minimal branding
const OUTRO_SECONDS = 2.5;         // soft close
const MUSIC_VOLUME = 0.15;         // very quiet (slideshow: 0.3)

// Brand colors
const PRIMARY = '#FF6B35';
const SECONDARY = '#4ECDC4';

// Ken Burns directions
const KB_DIRECTIONS = ['zoom-in', 'pan-right', 'pan-left', 'pan-down'];

// Progressive reveal settings (coloring + maze types)
const REVEAL_SECONDS = 30;          // duration of the reveal animation
const HOOK_SECONDS = 3;             // hook sequence replaces intro (destination→blank)
const HOLD_SECONDS = 1.5;          // brief hold on completed image — no outro

// Default hook text per reveal type (no emoji — SVG/libvips renders them poorly)
const DEFAULT_HOOKS = {
  coloring: ['Watch it color itself', 'Can you stay calm?', 'Most satisfying coloring'],
  maze:     ['Watch it solve itself', 'Can you solve this?', 'Path reveals itself'],
};

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

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ========== AI HOOK GENERATION ==========

/**
 * Generate ASMR video hook text using Groq + writing style guide.
 * Same pipeline as generate-captions.mjs and generate-prompts.mjs.
 * Returns { hookText, alternatives } — best option + 2 alternates for activity.json.
 */
async function generateHookText(title, revealType) {
  let styleGuide = '';
  let archetypes = '';
  try {
    styleGuide = await fs.readFile(path.join(ROOT, 'config', 'writing-style.md'), 'utf-8');
  } catch { /* optional */ }
  try {
    archetypes = await fs.readFile(path.join(ROOT, 'docs', 'CONTENT_ARCHETYPES.md'), 'utf-8');
  } catch { /* optional */ }

  const typeDesc = revealType === 'coloring'
    ? 'ASMR coloring reveal — a blank coloring page gradually fills with color over 30 seconds'
    : 'ASMR maze reveal — a blank maze shows its solution path drawing itself over 30 seconds';

  const taskPrompt = `You are writing a 3-second video hook text overlay for JoyMaze, a kids activity app (audience: parents of children ages 4-8).

Video type: ${typeDesc}
Activity title: "${title}"

Write exactly 3 video hook text options. Rules:
- 3-6 words MAXIMUM (renders as bold white text on screen — must be readable in under 1 second)
- NO emoji (renderer limitation)
- Each option must use a different hook angle:
    Option 1: CURIOSITY GAP — make them need to know what happens
    Option 2: DIRECT COMMAND — tell them what to do / watch
    Option 3: BOLD PROMISE — state the payoff directly
- Apply Gary Halbert hypnotic writing principles: powerful verbs, present tense, specificity
- NO filler words like "just", "really", "very", "amazing"

Return ONLY the 3 options, one per line. No numbers, no quotes, no explanation.`;

  const fullPrompt = styleGuide
    ? `${styleGuide}\n\n${archetypes ? archetypes + '\n\n' : ''}---\n\n${taskPrompt}`
    : taskPrompt;

  try {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: fullPrompt }],
      max_tokens: 80,
    });
    const lines = response.choices[0].message.content
      .trim().split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3);

    if (lines.length > 0) {
      console.log('  AI hook options (via Groq):');
      lines.forEach((l, i) => console.log(`    ${i === 0 ? '→' : ' '} ${l}`));
      if (lines.length > 1) console.log('  (Edit hookText in activity.json to use an alternative)');
      return { hookText: lines[0], alternatives: lines.slice(1) };
    }
  } catch (err) {
    console.log(`  [Hook gen] Groq unavailable: ${err.message.slice(0, 70)}`);
    console.log('  Using default hook — edit hookText in activity.json after init.');
  }

  // Fallback to defaults
  const defaults = DEFAULT_HOOKS[revealType] || DEFAULT_HOOKS.coloring;
  return { hookText: defaults[0], alternatives: defaults.slice(1) };
}

// ========== HOOK ROTATION + PERFORMANCE ==========

/**
 * Select the next hook text using a two-phase strategy:
 *   Phase 1 (< 50 total impressions): round-robin — pick least-used hook.
 *   Phase 2 (≥ 50 impressions): softmax weighted random.
 *     score = save_rate + 2 * click_rate  (clicks → installs, worth double)
 *     Untested hooks get the average score so they stay in rotation.
 *     Temperature 5 = moderately exploitative (good hooks dominate, weak hooks still run).
 */
async function selectHook(asmrDir, activityMeta) {
  const allHooks = [
    activityMeta.hookText,
    ...(activityMeta.hookAlternatives || []),
  ].filter(Boolean);

  if (allHooks.length <= 1) return allHooks[0] || 'Watch the magic';

  const perfPath = path.join(asmrDir, 'hook-performance.json');
  let perf = { hooks: [] };
  try { perf = JSON.parse(await fs.readFile(perfPath, 'utf-8')); } catch { /* first run */ }

  // Ensure every current hook has a tracking entry
  for (const text of allHooks) {
    if (!perf.hooks.find(h => h.text === text)) {
      perf.hooks.push({ text, uses: 0, impressions: 0, saves: 0, clicks: 0 });
    }
  }
  const tracked = perf.hooks.filter(h => allHooks.includes(h.text));

  // Phase 1: sparse data — round-robin by least uses
  const totalImpressions = tracked.reduce((sum, h) => sum + h.impressions, 0);
  if (totalImpressions < 50) {
    const minUses = Math.min(...tracked.map(h => h.uses));
    return tracked.find(h => h.uses === minUses).text;
  }

  // Phase 2: enough data — softmax weighted selection
  const hooksWithData = tracked.filter(h => h.impressions > 0);
  const avgScore = hooksWithData.length > 0
    ? hooksWithData.reduce((sum, h) => sum + (h.saves / h.impressions) + 2 * (h.clicks / h.impressions), 0) / hooksWithData.length
    : 0.01;

  const scored = tracked.map(h => ({
    text: h.text,
    score: h.impressions > 0
      ? (h.saves / h.impressions) + 2 * (h.clicks / h.impressions)
      : avgScore, // exploration bonus for untested hooks
  }));

  const maxScore = Math.max(...scored.map(s => s.score));
  const weights = scored.map(s => Math.exp((s.score - maxScore) * 5));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let rand = Math.random() * totalWeight;
  for (let i = 0; i < scored.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return scored[i].text;
  }
  return scored[scored.length - 1].text;
}

/**
 * Record that a hook was used. Increments `uses` count in hook-performance.json.
 * Called immediately after selectHook() so rotation state is always persisted.
 */
async function recordHookUse(asmrDir, hookText, allHooks) {
  const perfPath = path.join(asmrDir, 'hook-performance.json');
  let perf = { hooks: [], lastUpdated: null };
  try { perf = JSON.parse(await fs.readFile(perfPath, 'utf-8')); } catch {}

  for (const text of allHooks) {
    if (!perf.hooks.find(h => h.text === text)) {
      perf.hooks.push({ text, uses: 0, impressions: 0, saves: 0, clicks: 0 });
    }
  }

  const entry = perf.hooks.find(h => h.text === hookText);
  if (entry) {
    entry.uses++;
    entry.lastUsed = new Date().toISOString().slice(0, 10);
  }
  perf.lastUpdated = new Date().toISOString().slice(0, 10);
  await fs.writeFile(perfPath, JSON.stringify(perf, null, 2));
}

// ========== PROGRESSIVE REVEAL HELPERS ==========

/**
 * Resize any source image to 1080x1920 for the video frame canvas.
 * Portrait/square → white letterbox. Landscape → blur background letterbox.
 */
async function resizeActivityImage(imagePath) {
  const { width, height } = await sharp(imagePath).metadata();
  const isLandscape = width > height;

  if (isLandscape) {
    const blurred = await sharp(imagePath)
      .resize(VIDEO_WIDTH, VIDEO_HEIGHT, { fit: 'cover' })
      .blur(20)
      .toBuffer();
    const scaledH = Math.round(VIDEO_WIDTH * height / width);
    const foreground = await sharp(imagePath)
      .resize(VIDEO_WIDTH, scaledH, { fit: 'fill' })
      .toBuffer();
    const topOffset = Math.round((VIDEO_HEIGHT - scaledH) / 2);
    return sharp(blurred)
      .composite([{ input: foreground, top: topOffset, left: 0 }])
      .png().toBuffer();
  }

  return sharp(imagePath)
    .resize(VIDEO_WIDTH, VIDEO_HEIGHT, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 255 } })
    .png().toBuffer();
}

/**
 * Build the SVG text overlay for the hook (white bold text + heavy drop shadow).
 * No emoji — libvips/SVG emoji rendering is unreliable.
 */
function buildHookTextSvg(text) {
  // Split into two lines if text is long
  let lines = [text];
  if (text.length > 20) {
    const mid = text.lastIndexOf(' ', Math.floor(text.length / 2));
    if (mid > 0) lines = [text.slice(0, mid), text.slice(mid + 1)];
  }

  const lineH = 82;
  const startY = Math.round(VIDEO_HEIGHT * 0.13);
  const textEls = lines.map((line, i) =>
    `<text x="${VIDEO_WIDTH / 2}" y="${startY + i * lineH}"
      text-anchor="middle" dominant-baseline="middle"
      font-family="Arial Black, Arial, sans-serif"
      font-size="70" font-weight="900"
      fill="white" filter="url(#sh)">${escapeXml(line)}</text>`
  ).join('\n');

  return `<svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="sh" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="black" flood-opacity="1"/>
      </filter>
    </defs>
    ${textEls}
  </svg>`;
}

/**
 * Pre-analyse the solution image to find the Y centroid of the solution path at each X column.
 * Returns an array of length VIDEO_WIDTH where pathY[x] = the average Y of path pixels at column x.
 * Used to position the pencil tip on the moving reveal edge.
 */
async function analyzePathY(srcBuffer, dstBuffer) {
  const { data: srcData, info } = await sharp(srcBuffer).raw().toBuffer({ resolveWithObject: true });
  const { data: dstData } = await sharp(dstBuffer).raw().toBuffer({ resolveWithObject: true });

  const ch = info.channels; // 3 (RGB) or 4 (RGBA)
  const W = info.width;
  const H = info.height;
  const pathY = new Array(W).fill(null);

  for (let x = 0; x < W; x++) {
    let ySum = 0, count = 0;
    for (let y = 0; y < H; y++) {
      const idx = (y * W + x) * ch;
      const diff = Math.abs(srcData[idx] - dstData[idx])
                 + Math.abs(srcData[idx + 1] - dstData[idx + 1])
                 + Math.abs(srcData[idx + 2] - dstData[idx + 2]);
      if (diff > 25) { ySum += y; count++; }
    }
    pathY[x] = count > 0 ? Math.round(ySum / count) : null;
  }

  // Fill null columns (white margin / no path) with nearest valid neighbour
  let last = Math.round(H / 2);
  for (let x = 0; x < W; x++) {
    if (pathY[x] !== null) last = pathY[x];
    else pathY[x] = last;
  }
  // Also propagate right-to-left for left-margin columns
  last = pathY[W - 1];
  for (let x = W - 1; x >= 0; x--) {
    if (pathY[x] !== null && pathY[x] !== Math.round(H / 2)) last = pathY[x];
    else if (pathY[x] === Math.round(H / 2)) pathY[x] = last;
  }

  // Smooth with a moving average (window=40) to prevent jitter
  const smoothed = [...pathY];
  const win = 40;
  for (let x = win; x < W - win; x++) {
    let sum = 0;
    for (let k = -win; k <= win; k++) sum += pathY[x + k];
    smoothed[x] = Math.round(sum / (2 * win + 1));
  }

  return smoothed;
}

/**
 * Pre-compute organic motion jitter for the full reveal sequence.
 * Returns { yOffsets, angleOffsets } arrays — one value per frame.
 * Built from overlapping sine waves at prime-ish frequencies to avoid
 * obvious periodicity. Phases are randomized each run so no two videos
 * look the same.
 */
function makeOrganicJitter(totalFrames) {
  const yOffsets     = new Array(totalFrames);
  const angleOffsets = new Array(totalFrames);

  const seedY = Math.random() * Math.PI * 2;
  const seedA = Math.random() * Math.PI * 2;

  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    // Y wobble: three overlapping sines → primary drift + wobble + fine hand tremor
    yOffsets[i] = Math.sin(t * Math.PI * 2 * 1.7 + seedY)        * 18
                + Math.sin(t * Math.PI * 2 * 4.3 + seedY * 1.3)  *  8
                + Math.sin(t * Math.PI * 2 * 9.1 + seedY * 2.2)  *  3;
    // Angle wobble: two sines → slight lean variation (feels like grip pressure changes)
    angleOffsets[i] = Math.sin(t * Math.PI * 2 * 1.1 + seedA)      * 4.5
                    + Math.sin(t * Math.PI * 2 * 3.1 + seedA * 1.6) * 2.0;
  }
  return { yOffsets, angleOffsets };
}

/**
 * Build an SVG hand-holding-pencil overlay positioned with the pencil tip at (tipX, tipY).
 * Pencil leans forward in the direction of travel (right). A simplified hand — palm,
 * three fingers, thumb — overlaps the pencil body to sell the "someone is drawing this" feel.
 * angleOffset is applied on top of the base 42° lean for organic wobble.
 */
function buildHandPencilSvg(tipX, tipY, angleOffset = 0) {
  const ANGLE_DEG   = 42 + angleOffset;
  const rad         = ANGLE_DEG * Math.PI / 180;
  const GRAPHITE_LEN = 14;
  const WOOD_LEN     = 38;
  const BODY_LEN     = 230;
  const BODY_W       = 28;

  // Helpers: point along pencil axis at distance d from tip
  const px = (d) => tipX + d * Math.sin(rad);
  const py = (d) => tipY - d * Math.cos(rad);

  const graphEndX = px(GRAPHITE_LEN), graphEndY = py(GRAPHITE_LEN);
  const woodEndX  = px(WOOD_LEN),     woodEndY  = py(WOOD_LEN);
  const bodyEndX  = px(BODY_LEN),     bodyEndY  = py(BODY_LEN);
  const eraserX   = px(BODY_LEN + 22), eraserY  = py(BODY_LEN + 22);

  // Perpendicular unit vectors (screen-space, y increases downward)
  // perpF = "finger side" (upper-left of tilted pencil)
  // perpT = "thumb side"  (lower-right)
  const perpFX = -Math.cos(rad), perpFY = -Math.sin(rad);
  const perpTX =  Math.cos(rad), perpTY =  Math.sin(rad);

  // Grip center: ~52% up the body
  const gripDist = WOOD_LEN + (BODY_LEN - WOOD_LEN) * 0.52;
  const gripX = px(gripDist), gripY = py(gripDist);

  // Skin colours
  const SKIN       = '#F5C5A3';
  const SKIN_DARK  = '#D89B6E';
  const KNUCKLE    = '#C08050';

  // Three fingers on the upper-left (finger) side
  const fDists = [
    WOOD_LEN + (BODY_LEN - WOOD_LEN) * 0.31,
    WOOD_LEN + (BODY_LEN - WOOD_LEN) * 0.52,
    WOOD_LEN + (BODY_LEN - WOOD_LEN) * 0.71,
  ];
  const FINGER_REACH = 32;
  const FINGER_W = [20, 19, 16];  // index, middle, ring

  const fingers = fDists.map((d, i) => ({
    x1: px(d) + perpFX * 2,        y1: py(d) + perpFY * 2,
    x2: px(d) + perpFX * FINGER_REACH, y2: py(d) + perpFY * FINGER_REACH,
    w: FINGER_W[i],
  }));

  // Thumb on the lower-right (thumb) side
  const thumbDist = WOOD_LEN + (BODY_LEN - WOOD_LEN) * 0.45;
  const THUMB_REACH = 26;
  const thumb = {
    x1: px(thumbDist) + perpTX * 2,            y1: py(thumbDist) + perpTY * 2,
    x2: px(thumbDist) + perpTX * THUMB_REACH,  y2: py(thumbDist) + perpTY * THUMB_REACH,
  };

  // Palm ellipse — major axis along the pencil, minor across
  const PALM_RX = 50, PALM_RY = 32;
  const rotDeg  = ANGLE_DEG - 90;

  // Gradient goes from finger side (light) to thumb side (shadow)
  const gradX1 = (gripX + perpFX * 30).toFixed(0);
  const gradY1 = (gripY + perpFY * 30).toFixed(0);
  const gradX2 = (gripX + perpTX * 20).toFixed(0);
  const gradY2 = (gripY + perpTY * 20).toFixed(0);

  // Knuckle accent lines (perpendicular to each finger)
  const knuckles = fingers.map(f => {
    const t  = 0.55;
    const kx = f.x1 + (f.x2 - f.x1) * t;
    const ky = f.y1 + (f.y2 - f.y1) * t;
    const dx = f.x2 - f.x1, dy = f.y2 - f.y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len * 5, ny = dx / len * 5;
    return `<line x1="${(kx - nx).toFixed(1)}" y1="${(ky - ny).toFixed(1)}"
                  x2="${(kx + nx).toFixed(1)}" y2="${(ky + ny).toFixed(1)}"
                  stroke="${KNUCKLE}" stroke-width="2.5" stroke-linecap="round"/>`;
  }).join('\n      ');

  return `<svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="ps" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="3" dy="4" stdDeviation="6" flood-color="black" flood-opacity="0.45"/>
      </filter>
      <filter id="hs" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="2" dy="4" stdDeviation="9" flood-color="black" flood-opacity="0.28"/>
      </filter>
      <linearGradient id="sg" gradientUnits="userSpaceOnUse"
        x1="${gradX1}" y1="${gradY1}" x2="${gradX2}" y2="${gradY2}">
        <stop offset="0%"   stop-color="${SKIN}"/>
        <stop offset="100%" stop-color="${SKIN_DARK}"/>
      </linearGradient>
    </defs>

    <!-- Pencil (drawn first; hand overlaps upper body) -->
    <g filter="url(#ps)">
      <line x1="${tipX.toFixed(1)}" y1="${tipY.toFixed(1)}"
            x2="${graphEndX.toFixed(1)}" y2="${graphEndY.toFixed(1)}"
            stroke="#555" stroke-width="9" stroke-linecap="round"/>
      <line x1="${graphEndX.toFixed(1)}" y1="${graphEndY.toFixed(1)}"
            x2="${woodEndX.toFixed(1)}" y2="${woodEndY.toFixed(1)}"
            stroke="#D4A574" stroke-width="18" stroke-linecap="round"/>
      <line x1="${woodEndX.toFixed(1)}" y1="${woodEndY.toFixed(1)}"
            x2="${bodyEndX.toFixed(1)}" y2="${bodyEndY.toFixed(1)}"
            stroke="#F5C518" stroke-width="${BODY_W}" stroke-linecap="round"/>
      <line x1="${bodyEndX.toFixed(1)}" y1="${bodyEndY.toFixed(1)}"
            x2="${eraserX.toFixed(1)}" y2="${eraserY.toFixed(1)}"
            stroke="#FF9999" stroke-width="${BODY_W + 4}" stroke-linecap="round"/>
    </g>

    <!-- Hand overlapping the pencil body -->
    <g filter="url(#hs)">
      <!-- Palm -->
      <ellipse cx="${gripX.toFixed(1)}" cy="${gripY.toFixed(1)}"
               rx="${PALM_RX}" ry="${PALM_RY}"
               transform="rotate(${rotDeg.toFixed(1)}, ${gripX.toFixed(1)}, ${gripY.toFixed(1)})"
               fill="url(#sg)"/>
      <!-- Fingers -->
      ${fingers.map(f =>
        `<line x1="${f.x1.toFixed(1)}" y1="${f.y1.toFixed(1)}"
               x2="${f.x2.toFixed(1)}" y2="${f.y2.toFixed(1)}"
               stroke="url(#sg)" stroke-width="${f.w}" stroke-linecap="round"/>`
      ).join('\n      ')}
      <!-- Thumb -->
      <line x1="${thumb.x1.toFixed(1)}" y1="${thumb.y1.toFixed(1)}"
            x2="${thumb.x2.toFixed(1)}" y2="${thumb.y2.toFixed(1)}"
            stroke="url(#sg)" stroke-width="24" stroke-linecap="round"/>
      <!-- Knuckle accent lines -->
      ${knuckles}
    </g>
  </svg>`;
}

/**
 * Unified reveal + hook overlay.
 *
 * - Maze/coloring starts from blank at frame 0 — no solved-image flash, no pause
 * - Hook text overlaid for the ENTIRE reveal duration
 * - First 15 frames (0.5s): fade in from black (maze + text together)
 * - Frames 15 → end: full-opacity reveal sweeps left-to-right (maze) or top-to-bottom (coloring)
 * - Reveal is guaranteed to reach 100% by the last frame
 */
async function createRevealWithHookFrames(srcBuffer, dstBuffer, hookText, revealType, pathY = null) {
  const frames = [];
  const totalFrames = Math.round(REVEAL_SECONDS * FPS);
  const FADE_IN_FRAMES = 15; // 0.5s fade in from black

  const blackFrame = await sharp({
    create: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } },
  }).png().toBuffer();

  const textBuffer = await sharp(Buffer.from(buildHookTextSvg(hookText))).png().toBuffer();

  // Pre-compute organic hand motion for the full reveal (varies each run)
  const jitter = pathY ? makeOrganicJitter(totalFrames) : null;

  for (let i = 0; i < totalFrames; i++) {
    // LINEAR progress — no easing. Movement starts at frame 0, uniform speed throughout.
    // easeInOut caused a ~7s invisible slow-start; linear eliminates that entirely.
    const progress = i / (totalFrames - 1);

    // Build the partially-revealed base frame
    let revealFrame;
    // revealPx hoisted so pencil positioning can reference it after the if/else
    let revealPx;

    if (revealType === 'coloring') {
      // Coloring: top-to-bottom wipe. Makes visual sense (painting from top).
      revealPx = Math.max(1, Math.round(progress * VIDEO_HEIGHT));
      if (revealPx >= VIDEO_HEIGHT) {
        revealFrame = dstBuffer;
      } else {
        const portion = await sharp(dstBuffer)
          .extract({ left: 0, top: 0, width: VIDEO_WIDTH, height: revealPx })
          .toBuffer();
        revealFrame = await sharp(srcBuffer)
          .composite([{ input: portion, top: 0, left: 0 }])
          .png().toBuffer();
      }
    } else {
      // Maze: left-to-right wipe. Linear motion — starts immediately, constant speed.
      revealPx = Math.max(1, Math.round(progress * VIDEO_WIDTH));
      if (revealPx >= VIDEO_WIDTH) {
        revealFrame = dstBuffer;
      } else {
        const portion = await sharp(dstBuffer)
          .extract({ left: 0, top: 0, width: revealPx, height: VIDEO_HEIGHT })
          .toBuffer();
        revealFrame = await sharp(srcBuffer)
          .composite([{ input: portion, top: 0, left: 0 }])
          .png().toBuffer();
      }
    }

    // Fade in from black for first FADE_IN_FRAMES; full opacity after
    const fadeOpacity = i < FADE_IN_FRAMES ? i / FADE_IN_FRAMES : 1.0;

    // Hand+pencil: tracks the reveal edge, positioned on the solution path Y.
    // Organic jitter adds natural Y drift and lean-angle variation each frame.
    // Hidden during fade-in and after reveal completes.
    const showPencil = pathY && fadeOpacity >= 1.0 && progress < 0.99;
    const pencilTipX = Math.min(revealPx + 4, VIDEO_WIDTH - 10);
    const baseY      = pathY ? pathY[Math.min(pencilTipX, VIDEO_WIDTH - 1)] : VIDEO_HEIGHT / 2;
    const pencilTipY = jitter ? baseY + jitter.yOffsets[i] : baseY;
    const angleOff   = jitter ? jitter.angleOffsets[i] : 0;
    const pencilBuffer = showPencil
      ? await sharp(Buffer.from(buildHandPencilSvg(pencilTipX, pencilTipY, angleOff))).png().toBuffer()
      : null;

    let frame;
    if (fadeOpacity < 1.0) {
      frame = await sharp(blackFrame)
        .composite([
          { input: revealFrame, blend: 'over', opacity: fadeOpacity },
          { input: textBuffer, blend: 'over', opacity: fadeOpacity },
        ])
        .png().toBuffer();
    } else {
      const layers = [{ input: textBuffer, blend: 'over', opacity: 1.0 }];
      if (pencilBuffer) layers.push({ input: pencilBuffer, blend: 'over', opacity: 1.0 });
      frame = await sharp(revealFrame)
        .composite(layers)
        .png().toBuffer();
    }

    frames.push(frame);
    if ((i + 1) % 60 === 0) process.stdout.write(`    ${i + 1}/${totalFrames} frames\r`);
  }

  return frames; // REVEAL_SECONDS * FPS — reveal always reaches 100%
}

/**
 * Phase 2 (coloring): top-to-bottom sweep reveals colored image over blank.
 * Eased — looks like painting down the page.
 */
async function createColoringRevealFrames(blankBuffer, coloredBuffer) {
  const frames = [];
  const totalFrames = Math.round(REVEAL_SECONDS * FPS);
  const { height } = await sharp(blankBuffer).metadata();

  for (let i = 0; i < totalFrames; i++) {
    const progress = easeInOut(i / (totalFrames - 1));
    const revealHeight = Math.max(1, Math.round(progress * height));

    if (revealHeight >= height) {
      frames.push(coloredBuffer);
    } else {
      const revealedPortion = await sharp(coloredBuffer)
        .extract({ left: 0, top: 0, width: VIDEO_WIDTH, height: revealHeight })
        .toBuffer();
      const frame = await sharp(blankBuffer)
        .composite([{ input: revealedPortion, top: 0, left: 0 }])
        .png().toBuffer();
      frames.push(frame);
    }
    if ((i + 1) % 60 === 0) process.stdout.write(`    ${i + 1}/${totalFrames} frames\r`);
  }
  return frames;
}

/**
 * Phase 2 (maze): left-to-right sweep reveals solved path over blank maze.
 * Eased — looks like drawing the solution path.
 */
async function createMazeRevealFrames(mazeBuffer, solvedBuffer) {
  const frames = [];
  const totalFrames = Math.round(REVEAL_SECONDS * FPS);
  const { width } = await sharp(mazeBuffer).metadata();

  for (let i = 0; i < totalFrames; i++) {
    const progress = easeInOut(i / (totalFrames - 1));
    const revealWidth = Math.max(1, Math.round(progress * width));

    if (revealWidth >= width) {
      frames.push(solvedBuffer);
    } else {
      const revealedPortion = await sharp(solvedBuffer)
        .extract({ left: 0, top: 0, width: revealWidth, height: VIDEO_HEIGHT })
        .toBuffer();
      const frame = await sharp(mazeBuffer)
        .composite([{ input: revealedPortion, top: 0, left: 0 }])
        .png().toBuffer();
      frames.push(frame);
    }
    if ((i + 1) % 60 === 0) process.stdout.write(`    ${i + 1}/${totalFrames} frames\r`);
  }
  return frames;
}

/**
 * Phase 3: hold the completed image for HOLD_SECONDS before outro.
 */
function createRevealHoldFrames(finalBuffer) {
  const totalFrames = Math.round(HOLD_SECONDS * FPS);
  return Array(totalFrames).fill(finalBuffer);
}

// ========== INIT MODE ==========

async function initAsmr(title, type) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const folderName = `${type}-${slug}`;
  const asmrDir = path.join(ASMR_DIR, folderName);

  await fs.mkdir(asmrDir, { recursive: true });

  const isRevealType = type === 'coloring' || type === 'maze';

  // AI-generate hook text from style guide + archetypes (same pipeline as captions/prompts)
  let hookText = (DEFAULT_HOOKS[type] || DEFAULT_HOOKS.coloring)[0];
  let hookAlternatives = (DEFAULT_HOOKS[type] || DEFAULT_HOOKS.coloring).slice(1);
  if (isRevealType) {
    console.log('\nGenerating hook text via Groq + style guide...');
    const hookResult = await generateHookText(title, type);
    hookText = hookResult.hookText;
    hookAlternatives = hookResult.alternatives;
  }

  const activityJson = isRevealType ? {
    title,
    type,
    revealType: type,
    hookText,
    hookAlternatives,
    theme: type === 'coloring'
      ? 'Watch the colors fill in, stroke by stroke'
      : 'Watch the maze path reveal itself',
    music: null,
  } : {
    title,
    type,
    theme: `Watch a ${type} activity come alive, step by step`,
    slides: [
      { image: '01.png', label: 'blank', duration: 5 },
      { image: '02.png', label: '25% done', duration: 6 },
      { image: '03.png', label: '50% done', duration: 7 },
      { image: '04.png', label: '75% done', duration: 6 },
      { image: '05.png', label: 'complete', duration: 8 },
    ],
    music: null,
  };

  await fs.writeFile(
    path.join(asmrDir, 'activity.json'),
    JSON.stringify(activityJson, null, 2),
  );

  console.log(`\nASMR folder created: output/asmr/${folderName}/`);
  console.log('');
  console.log('Next steps:');

  if (type === 'coloring') {
    console.log('  1. Generate 2 images in ChatGPT/Gemini:');
    console.log('       blank.png   — empty coloring page (line art, white background)');
    console.log('       colored.png — the same page fully colored in');
    console.log('       Dimensions: 9:16 portrait (1080×1920 px) — fills the video frame natively');
    console.log('       Tell Gemini: "portrait orientation, 9:16 aspect ratio (1080×1920 pixels)"');
    console.log(`  2. Drop both into: output/asmr/${folderName}/`);
    console.log('  3. (Optional) Swap hookText in activity.json — use one of the hookAlternatives');
    console.log('     Keep it 3-6 words, no emoji');
    console.log('  4. (Optional) Download crayon ASMR audio → assets/audio/asmr/crayon.mp3');
    console.log(`  5. Run: npm run generate:asmr -- --asmr ${folderName}`);
  } else if (type === 'maze') {
    console.log('  1. Generate 2 images in ChatGPT/Gemini:');
    console.log('       maze.png   — blank maze (no solution shown)');
    console.log('       solved.png — same maze with solution path drawn in');
    console.log('       Dimensions: 9:16 portrait (1080×1920 px) — fills the video frame natively');
    console.log('       Tell Gemini: "portrait orientation, 9:16 aspect ratio (1080×1920 pixels)"');
    console.log(`  2. Drop both into: output/asmr/${folderName}/`);
    console.log('  3. (Optional) Swap hookText in activity.json — use one of the hookAlternatives');
    console.log('     Keep it 3-6 words, no emoji');
    console.log('  4. (Optional) Download pencil ASMR audio → assets/audio/asmr/pencil.mp3');
    console.log(`  5. Run: npm run generate:asmr -- --asmr ${folderName}`);
  } else {
    console.log('  1. Edit activity.json — adjust slide count and durations');
    console.log('  2. Generate progression images in Gemini/ChatGPT:');
    console.log(`     - 01.png: blank ${type} page/activity`);
    console.log(`     - 02.png: 25% completed`);
    console.log(`     - 03.png: 50% completed`);
    console.log(`     - 04.png: 75% completed`);
    console.log(`     - 05.png: finished piece`);
    console.log('  3. (Optional) Add ambient music.mp3 to the folder');
    console.log(`  4. Run: npm run generate:asmr -- --asmr ${folderName}`);
  }

  console.log('');
  return folderName;
}

// ========== FRAME GENERATION ==========

/**
 * Sine easing for smoother Ken Burns motion
 */
function easeInOut(t) {
  return (1 - Math.cos(t * Math.PI)) / 2;
}

/**
 * Create minimal ASMR intro frames — soft branding, no CTA
 */
async function createIntroFrames(activityMeta) {
  const frames = [];

  const svg = `
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${PRIMARY};stop-opacity:0.85" />
          <stop offset="100%" style="stop-color:${SECONDARY};stop-opacity:0.85" />
        </linearGradient>
      </defs>
      <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="url(#bg)" />
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 - 30}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="48" fill="white" font-weight="bold"
        opacity="0.9">JoyMaze</text>
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 + 30}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.7)">
        ${escapeXml(activityMeta.title)}
      </text>
    </svg>`;

  const baseBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  const totalFrames = Math.round(INTRO_SECONDS * FPS);
  const fadeInFrames = 15; // 0.5s fade

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
 * Create slide frames with gentle Ken Burns — NO text overlays
 */
async function createSlideFrames(asmrDir, slide) {
  const frames = [];
  const imagePath = path.join(asmrDir, slide.image);
  const totalFrames = slide.duration * FPS;

  // Ken Burns: overscan then crop with moving window
  const scaledW = Math.round(VIDEO_WIDTH * KEN_BURNS_SCALE);
  const scaledH = Math.round(VIDEO_HEIGHT * KEN_BURNS_SCALE);
  const oversizedBuffer = await sharp(imagePath)
    .resize(scaledW, scaledH, { fit: 'cover' })
    .png().toBuffer();

  const maxOffsetX = scaledW - VIDEO_WIDTH;
  const maxOffsetY = scaledH - VIDEO_HEIGHT;

  // Pick a direction for this slide
  const direction = KB_DIRECTIONS[Math.floor(Math.random() * KB_DIRECTIONS.length)];

  for (let i = 0; i < totalFrames; i++) {
    const rawProgress = i / (totalFrames - 1);
    const progress = easeInOut(rawProgress); // sine easing for smooth motion

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

    // Pure image — no text overlay (ASMR = visual only)
    const frame = await sharp(oversizedBuffer)
      .extract({ left, top, width: VIDEO_WIDTH, height: VIDEO_HEIGHT })
      .png().toBuffer();

    frames.push(frame);
  }

  return frames;
}

/**
 * Create crossfade transition frames (1.0s for ASMR — slower than slideshow)
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
 * Create minimal outro frames — soft branding only, no CTA
 */
async function createOutroFrames() {
  const svg = `
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${SECONDARY};stop-opacity:0.85" />
          <stop offset="100%" style="stop-color:${PRIMARY};stop-opacity:0.85" />
        </linearGradient>
      </defs>
      <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="url(#bg)" />
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 - 20}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="48" fill="white" font-weight="bold"
        opacity="0.9">JoyMaze</text>
      <text x="${VIDEO_WIDTH / 2}" y="${VIDEO_HEIGHT / 2 + 30}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.6)">
        joymaze.com
      </text>
    </svg>`;

  const baseBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  const totalFrames = Math.round(OUTRO_SECONDS * FPS);
  const fadeOutStart = totalFrames - 20; // ~0.67s fade out

  const blackFrame = await sharp({
    create: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } },
  }).png().toBuffer();

  const frames = [];
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
      const fadeOutStart = Math.max(0, totalDuration - 2.5);
      // aloop=-1 loops audio indefinitely so short tracks don't cut the video early.
      // -t clamps the final output to exactly totalDuration regardless of audio length.
      parts.push(
        '-filter_complex',
        `"[1:a]aloop=loop=-1:size=2e+09,afade=t=in:st=0:d=2,afade=t=out:st=${fadeOutStart}:d=2,volume=${MUSIC_VOLUME}[a]"`,
        '-map', '0:v', '-map', '[a]',
        '-c:a', 'aac', '-b:a', '128k',
        '-t', String(totalDuration),
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

async function findMusic(asmrDir, activityType) {
  if (NO_MUSIC) return null;

  // Check ASMR folder first for local music
  try {
    const localMusic = path.join(asmrDir, 'music.mp3');
    await fs.access(localMusic);
    return localMusic;
  } catch { /* no local music */ }

  // Type-specific ASMR audio from assets/audio/asmr/
  const asmrAudioDir = path.join(AUDIO_DIR, 'asmr');
  const typeAudioMap = {
    coloring: ['crayon.mp3', 'colored-pencil.mp3'],
    maze: ['pencil.mp3', 'pencil-scratch.mp3'],
    tracing: ['pencil.mp3'],
    drawing: ['crayon.mp3'],
  };

  if (activityType && typeAudioMap[activityType]) {
    for (const filename of typeAudioMap[activityType]) {
      try {
        const p = path.join(asmrAudioDir, filename);
        await fs.access(p);
        return p;
      } catch { /* try next */ }
    }
  }

  // Any ASMR audio file available
  try {
    const files = await fs.readdir(asmrAudioDir);
    const audioFiles = files.filter(f => /\.(mp3|m4a|wav|ogg|aac)$/i.test(f));
    if (audioFiles.length > 0) return path.join(asmrAudioDir, audioFiles[0]);
  } catch { /* no asmr dir yet */ }

  // Fall back to general ambient audio
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

// ========== MAIN ==========

async function main() {
  console.log('\n=== JoyMaze ASMR Activity Video Generator ===\n');

  // --init mode: scaffold a new ASMR activity folder
  if (INIT_MODE) {
    if (!INIT_TITLE) {
      console.error('Usage: --init "Activity Title" --type coloring|maze|tracing|drawing');
      process.exit(1);
    }
    await fs.mkdir(ASMR_DIR, { recursive: true });
    await initAsmr(INIT_TITLE, ACTIVITY_TYPE);
    return;
  }

  // --asmr mode: generate video from an ASMR folder
  if (!ASMR_FOLDER) {
    console.error('Usage: --asmr <folder-name>  or  --init "Title" --type coloring');
    console.error('');
    // List available ASMR activities
    try {
      const dirs = await fs.readdir(ASMR_DIR);
      if (dirs.length > 0) {
        console.log('Available ASMR activities:');
        for (const d of dirs) {
          try {
            const activityPath = path.join(ASMR_DIR, d, 'activity.json');
            const meta = JSON.parse(await fs.readFile(activityPath, 'utf-8'));
            console.log(`  ${d} — ${meta.title} (${meta.type})`);
          } catch {
            console.log(`  ${d} (no activity.json)`);
          }
        }
      }
    } catch { /* no asmr dir */ }
    process.exit(1);
  }

  const asmrDir = path.join(ASMR_DIR, ASMR_FOLDER);
  const activityJsonPath = path.join(asmrDir, 'activity.json');

  // Load and validate activity
  let activityMeta;
  try {
    activityMeta = JSON.parse(await fs.readFile(activityJsonPath, 'utf-8'));
  } catch (err) {
    console.error(`Cannot read activity.json: ${err.message}`);
    console.error(`Expected at: ${activityJsonPath}`);
    process.exit(1);
  }

  console.log(`Activity: ${activityMeta.title}`);
  console.log(`Type: ${activityMeta.type}${activityMeta.revealType ? ` (${activityMeta.revealType} reveal)` : ''}`);
  if (activityMeta.slides) console.log(`Slides: ${activityMeta.slides.length}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // ---- Validate inputs & calculate duration ----
  const revealType = activityMeta.revealType; // 'coloring', 'maze', or undefined (slideshow)
  let totalDuration;

  if (revealType === 'coloring' || revealType === 'maze') {
    const [srcFile, dstFile] = revealType === 'coloring'
      ? ['blank.png', 'colored.png']
      : ['maze.png', 'solved.png'];

    for (const f of [srcFile, dstFile]) {
      try { await fs.access(path.join(asmrDir, f)); }
      catch {
        console.error(`Missing: ${f} — drop it in output/asmr/${ASMR_FOLDER}/`);
        process.exit(1);
      }
    }
    totalDuration = REVEAL_SECONDS + HOLD_SECONDS;
    console.log(`Mode: Progressive ${revealType} reveal`);
    console.log(`Duration: ${REVEAL_SECONDS}s reveal + ${HOLD_SECONDS}s hold = ${totalDuration}s`);
  } else {
    const totalSlideDuration = activityMeta.slides.reduce((sum, s) => sum + s.duration, 0);
    totalDuration = INTRO_SECONDS + totalSlideDuration + OUTRO_SECONDS;
    console.log(`Duration: ${INTRO_SECONDS}s intro + ${totalSlideDuration}s activity + ${OUTRO_SECONDS}s outro = ${totalDuration}s total`);

    if (activityMeta.slides.length < 2 || activityMeta.slides.length > 12) {
      console.error(`Slide count should be 2-12 (got ${activityMeta.slides.length})`);
      process.exit(1);
    }

    for (const slide of activityMeta.slides) {
      const imgPath = path.join(asmrDir, slide.image);
      try { await fs.access(imgPath); }
      catch {
        console.error(`Missing image: ${slide.image}\nExpected at: ${imgPath}`);
        process.exit(1);
      }
    }
  }

  // Find ambient music
  const musicPath = await findMusic(asmrDir, activityMeta.type);
  console.log(`Music: ${musicPath ? path.basename(musicPath) : 'none (silent ASMR)'}`);

  // Check FFmpeg
  const hasFfmpeg = checkFfmpeg();
  if (!hasFfmpeg && !DRY_RUN) {
    console.error('\nFFmpeg is not available. Install it or use --dry-run.');
    console.error('Known paths checked: ' + FFMPEG_PATHS.join(', '));
    process.exit(1);
  }
  if (hasFfmpeg) console.log(`FFmpeg: ${FFMPEG_BIN}`);

  // ---- Generate all frames ----
  console.log('\nGenerating frames...\n');
  const allFrames = [];
  let hookText = null; // hoisted so it's accessible for queue metadata after the if block

  if (revealType === 'coloring' || revealType === 'maze') {
    // ---- Progressive reveal flow ----
    const [srcFile, dstFile] = revealType === 'coloring'
      ? ['blank.png', 'colored.png']
      : ['maze.png', 'solved.png'];

    console.log(`  [Load] Resizing images to ${VIDEO_WIDTH}x${VIDEO_HEIGHT}...`);
    const srcBuffer = await resizeActivityImage(path.join(asmrDir, srcFile));
    const dstBuffer = await resizeActivityImage(path.join(asmrDir, dstFile));

    // Select hook text via rotation + analytics weighting
    const allHooks = [activityMeta.hookText, ...(activityMeta.hookAlternatives || [])].filter(Boolean);
    hookText = await selectHook(asmrDir, activityMeta);
    await recordHookUse(asmrDir, hookText, allHooks);
    const hookIdx = allHooks.indexOf(hookText) + 1;
    console.log(`  [Hook] "${hookText}" (option ${hookIdx}/${allHooks.length})`);

    // Pre-analyse solution path Y positions for pencil tracking (maze only)
    let pathY = null;
    if (revealType === 'maze') {
      console.log('  [Analyse] Detecting solution path Y positions for pencil...');
      pathY = await analyzePathY(srcBuffer, dstBuffer);
      console.log('    Done.');
    }

    // Unified reveal + hook overlay: blank → sweep to solved, hook text + pencil on screen
    const revealLabel = revealType === 'coloring' ? 'Color fill sweep' : 'Path draw sweep';
    console.log(`  [Reveal] ${revealLabel} with hook overlay + pencil (${REVEAL_SECONDS}s)...`);
    const revealFrames = await createRevealWithHookFrames(srcBuffer, dstBuffer, hookText, revealType, pathY);
    allFrames.push(...revealFrames);
    console.log(`    ${revealFrames.length} frames`);

    // Phase 2: hold completed image, then end (no outro — cleaner for short-form video)
    console.log(`  [Hold] Complete (${HOLD_SECONDS}s)...`);
    const holdFrames = createRevealHoldFrames(dstBuffer);
    allFrames.push(...holdFrames);
    console.log(`    ${holdFrames.length} frames`);

  } else {
    // ---- Ken Burns slideshow flow ----
    // 1. Minimal intro
    console.log('  [Intro] Soft branding...');
    const introFrames = await createIntroFrames(activityMeta);
    allFrames.push(...introFrames);
    console.log(`  [Intro] ${introFrames.length} frames (${INTRO_SECONDS}s)`);

    // 2. Activity slides with gentle Ken Burns + long crossfades
    for (let i = 0; i < activityMeta.slides.length; i++) {
      const slide = activityMeta.slides[i];
      console.log(`  [Slide ${i + 1}/${activityMeta.slides.length}] ${slide.label || slide.image} (${slide.duration}s)`);

      const slideFrames = await createSlideFrames(asmrDir, slide);

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

    // 3. Minimal outro
    console.log('  [Outro] Soft close...');
    const outroFrames = await createOutroFrames();

    if (allFrames.length > 0 && outroFrames.length > TRANSITION_FRAMES) {
      const lastFrame = allFrames[allFrames.length - 1];
      const firstFrame = outroFrames[0];
      const crossfade = await createCrossfadeFrames(lastFrame, firstFrame);
      allFrames.splice(allFrames.length - TRANSITION_FRAMES, TRANSITION_FRAMES);
      outroFrames.splice(0, TRANSITION_FRAMES);
      allFrames.push(...crossfade);
    }
    allFrames.push(...outroFrames);
    console.log(`  [Outro] ${outroFrames.length} frames (${OUTRO_SECONDS}s)`);
  }

  const finalDuration = (allFrames.length / FPS).toFixed(1);
  console.log(`\nTotal: ${allFrames.length} frames (${finalDuration}s at ${FPS}fps)`);

  // ---- Write frames + assemble ----
  const dateStr = new Date().toISOString().slice(0, 10);
  const videoId = `${dateStr}-asmr-${ASMR_FOLDER}`;
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
    await assembleVideo(tempDir, outputPath, musicPath, parseFloat(finalDuration));
    console.log(`\nOutput: ${outputPath}`);
    console.log(`Duration: ${finalDuration}s`);

    // Create queue metadata
    const metadata = {
      id: videoId,
      type: 'video',
      format: 'asmr',
      category: `asmr-${activityMeta.type}`,
      categoryName: 'ASMR Activity',
      archetype: 9,
      title: activityMeta.title,
      activityType: activityMeta.type,
      theme: activityMeta.theme,
      hookText,
      asmrFolder: ASMR_FOLDER,
      duration: parseFloat(finalDuration),
      slideCount: activityMeta.slides ? activityMeta.slides.length : null,
      hasMusic: !!musicPath,
      resolution: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
      outputFile: `${videoId}.mp4`,
      generatedAt: new Date().toISOString(),
      platforms: {
        tiktok:    { video: `${videoId}.mp4`, status: 'pending' },
        youtube:   { video: `${videoId}.mp4`, status: 'pending' },
        instagram: { video: `${videoId}.mp4`, status: 'pending', type: 'reel' },
        pinterest: { video: `${videoId}.mp4`, status: 'pending', type: 'video' },
        x:         { video: `${videoId}.mp4`, status: 'pending', type: 'video' },
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

/**
 * render-video.mjs — Remotion rendering entry point
 *
 * Usage:
 *   node scripts/render-video.mjs --comp StoryEpisode --story output/stories/my-story/story.json
 *   node scripts/render-video.mjs --comp AsmrReveal   --asmr  output/asmr/maze-slug/activity.json
 *   node scripts/render-video.mjs --comp HookIntro    --props '{"headline":"Can your kid solve this?","subline":"Screen-free fun for ages 4-8"}'
 *   node scripts/render-video.mjs --comp StoryEpisode --props '{"slides":[...]}'  --out output/videos/ep01.mp4
 *   node scripts/render-video.mjs --comp StoryEpisode --dry-run --verbose
 *
 * Compositions:
 *   StoryEpisode  — multi-slide story video (slides, hookText, music)
 *   AsmrReveal    — progressive wipe reveal  (blankImagePath, solvedImagePath, revealType)
 *   HookIntro     — short 3-5s hook clip     (headline, subline, backgroundPath)
 */

import { bundle }                                      from '@remotion/bundler';
import { renderMedia, selectComposition, renderStill } from '@remotion/renderer';
import path   from 'path';
import fs     from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] ?? null : null; };
const hasFlag = (f) => args.includes(f);

// Auto-select composition from context flags if --comp not given explicitly
const _compArg = getArg('--comp');
const compositionId = _compArg
  ?? (args.includes('--challenge') ? 'ActivityChallenge'
    : args.includes('--asmr')      ? 'AsmrReveal'
    : args.includes('--story')     ? 'StoryEpisode'
    : 'StoryEpisode');
const storyFile     = getArg('--story');
const challengeFile = getArg('--challenge');

// --asmr can be used as a flag (value comes from positional slug) or as a key-value pair.
// Positional slug: first non-flag arg that isn't already consumed as a --comp value.
const _asmrArgVal  = getArg('--asmr');
const _positional  = args.find((a, i) =>
  !a.startsWith('-') && args[i - 1] !== '--comp' && args[i - 1] !== '--story' &&
  args[i - 1] !== '--asmr' && args[i - 1] !== '--challenge' &&
  args[i - 1] !== '--props' && args[i - 1] !== '--out'
);
const asmrFile = _asmrArgVal
  ?? (hasFlag('--asmr') && _positional
      ? `output/asmr/${_positional}/activity.json`
      : null);
const propsArg      = getArg('--props');
const propsFileArg  = getArg('--props-file');
const outArg        = getArg('--out');
const dryRun        = hasFlag('--dry-run');
const verbose       = hasFlag('--verbose');
const previewMode   = hasFlag('--preview');  // render first 3s at half resolution

const PREVIEW_FRAMES = 90;  // 3s @ 30fps
const PREVIEW_SCALE  = 0.5; // half resolution → 540×960

// ─── Audio auto-selection ─────────────────────────────────────────────────────
// Maps activity/composition type → audio file in assets/audio/.
// Only applied when the caller has NOT already set an explicit audioPath/musicPath.
// Falls back gracefully if the file doesn't exist (logs a warning, uses '').

const SOFT_MUSIC = 'assets/audio/Twinkle - The Grey Room _ Density & Time.mp3';

const AUDIO_MAP = {
  coloring:   SOFT_MUSIC,   // screen wipe — soft background music
  maze:       SOFT_MUSIC,   // path drawing — soft background music
  wordsearch: SOFT_MUSIC,
  dotdot:     SOFT_MUSIC,
  story:      SOFT_MUSIC,
  default:    SOFT_MUSIC,
};

const CHALLENGE_SFX_MAP = {
  maze: {
    challengeAudioPath: 'assets/audio/masters/maze_music_loop_01.wav',
    tickAudioPath: 'assets/sfx/countdown/countdown_tick_soft_01.wav',
    transitionCueAudioPath: 'assets/sfx/maze/maze_success_chime_01.wav',
    solveAudioPath: SOFT_MUSIC,
  },
  'word-search': {
    challengeAudioPath: 'assets/audio/masters/wordsearch_music_loop_01.wav',
    tickAudioPath: 'assets/sfx/countdown/countdown_tick_soft_01.wav',
    transitionCueAudioPath: 'assets/sfx/wordsearch/search_shimmer_01.wav',
    solveAudioPath: SOFT_MUSIC,
  },
  'dot-to-dot': {
    challengeAudioPath: SOFT_MUSIC,
    tickAudioPath: 'assets/sfx/countdown/countdown_tick_soft_01.wav',
    transitionCueAudioPath: 'assets/sfx/brand/cta_hit_01.wav',
    solveAudioPath: SOFT_MUSIC,
  },
  default: {
    challengeAudioPath: SOFT_MUSIC,
    tickAudioPath: 'assets/sfx/countdown/countdown_tick_soft_01.wav',
    transitionCueAudioPath: 'assets/sfx/brand/cta_hit_01.wav',
    solveAudioPath: SOFT_MUSIC,
  },
};

async function resolveAudio(type) {
  const rel = AUDIO_MAP[type] ?? AUDIO_MAP.default;
  const abs  = path.join(ROOT, rel);
  try { await fs.access(abs); return rel; } catch {
    console.warn(`    [audio] ${rel} not found — skipping music`);
    return '';
  }
}

// ─── Props loaders ────────────────────────────────────────────────────────────

// story.json → StoryEpisode props
async function storyJsonToProps(story, storyDir) {
  const fps = 30;
  const slides = (story.slides ?? []).map((slide) => {
    // story.json uses `image`; render-video.mjs native format uses `imagePath` — accept both
    const rawImageRef = slide.imagePath ?? slide.image ?? '';
    const imagePath = rawImageRef
      ? path.relative(ROOT, path.resolve(storyDir, rawImageRef)).replace(/\\/g, '/')
      : '';
    const durationSec = slide.durationSec ?? slide.duration ?? 4;
    return {
      imagePath,
      captionText:    slide.narration ?? slide.caption ?? '',
      durationFrames: Math.round(durationSec * fps),
    };
  });
  // Auto-select music if story.json doesn't specify one
  const musicPath = story.musicPath !== undefined
    ? story.musicPath
    : await resolveAudio('story');

  // Peak slide: where FloatingParticles fires (emotional high point).
  // story.json can set `peakSlide: N` explicitly; defaults to the 2nd-to-last slide
  // (typically the resolution beat). -1 disables particles.
  const peakSlideIndex = story.peakSlide !== undefined
    ? story.peakSlide
    : slides.length >= 3 ? slides.length - 2 : -1;

  return {
    slides,
    hookText:          story.hook ?? story.hookText ?? '',
    musicPath,
    musicVolume:       story.musicVolume ?? 0.28,
    showJoyo:          story.showJoyo ?? true,
    typewriterCaptions: story.typewriterCaptions ?? true,  // default on for Remotion renders
    peakSlideIndex,
  };
}

// activity.json → AsmrReveal props
async function activityJsonToProps(activity, activityDir) {
  const fps = 30;
  const toRelative = (filename) =>
    path.relative(ROOT, path.resolve(activityDir, filename)).replace(/\\/g, '/');

  // Expect blank.png / solved.png in same folder (or custom names from activity.json)
  const blankImagePath  = toRelative(activity.blankImage  ?? 'blank.png');
  const solvedImagePath = toRelative(activity.solvedImage ?? 'solved.png');

  const hookSec    = activity.hookDurationSec    ?? 3;
  const revealSec  = activity.revealDurationSec  ?? 26;  // 3+26+1+2 = 32s total
  const holdSec    = activity.holdDurationSec    ?? 1;
  const loopSec    = activity.loopDurationSec    ?? 2.0; // loop fade-back to blank

  // Load precomputed path waypoints if path.json exists alongside activity.json
  let pathWaypoints = null;
  let pathColor     = '#22BB44'; // fallback — overwritten if path.json has a sampled color
  const pathJsonFile = path.resolve(activityDir, 'path.json');
  try {
    const pathData = JSON.parse(await fs.readFile(pathJsonFile, 'utf-8'));
    // AR-corrected mapping: account for objectFit:contain letterboxing so the SVG overlay
    // aligns with the actual image position in the 1080×1920 video frame.
    const VW = 1080, VH = 1920;
    const imgW = pathData.width ?? VW;
    const imgH = pathData.height ?? VH;
    const imgAR   = imgW / imgH;
    const videoAR = VW / VH;
    let renderW, renderH, offsetX, offsetY;
    if (imgAR > videoAR) {
      // image is relatively wider than video → width-constrained
      renderW = VW; renderH = VW / imgAR;
      offsetX = 0;  offsetY = (VH - renderH) / 2;
    } else {
      // image is relatively taller than video → height-constrained
      renderH = VH; renderW = VH * imgAR;
      offsetX = (VW - renderW) / 2; offsetY = 0;
    }
    pathWaypoints = pathData.waypoints.map(p => ({
      x: offsetX + p.x * renderW,
      y: offsetY + p.y * renderH,
    }));
    if (pathData.pathColor) pathColor = pathData.pathColor;
  } catch {
    // path.json not present — solver disabled; run `npm run extract:path` to generate it
  }

  // Load word search rects if wordsearch.json exists (for wordsearch ASMR type)
  let wordRects       = null;
  let highlightColor  = '#FFD700';
  const wsJsonFile = path.resolve(activityDir, 'wordsearch.json');
  try {
    const wsData   = JSON.parse(await fs.readFile(wsJsonFile, 'utf-8'));
    const imgW     = wsData.width  ?? 1080;
    const imgH     = wsData.height ?? 1920;
    const imgAR    = imgW / imgH;
    const videoAR  = VW / VH;
    let renderW, renderH, offsetX, offsetY;
    if (imgAR > videoAR) {
      renderW = VW; renderH = VW / imgAR;
      offsetX = 0;  offsetY = (VH - renderH) / 2;
    } else {
      renderH = VH; renderW = VH * imgAR;
      offsetX = (VW - renderW) / 2; offsetY = 0;
    }
    // Map normalized rects to video pixel space
    wordRects = wsData.rects.map(r => ({
      x1: offsetX + r.x1 * renderW,
      y1: offsetY + r.y1 * renderH,
      x2: offsetX + r.x2 * renderW,
      y2: offsetY + r.y2 * renderH,
    }));
    if (wsData.highlightColor) highlightColor = wsData.highlightColor;
  } catch {
    // wordsearch.json not present — word search solver disabled; run `npm run extract:wordsearch` to generate it
  }

  // Load dot positions if dots.json exists (for dotdot ASMR type)
  let dotWaypoints = null;
  let dotColor     = '#FF6B35'; // brand orange — visible on white, distinct from black outlines
  const dotsJsonFile = path.resolve(activityDir, 'dots.json');
  try {
    const dotsData = JSON.parse(await fs.readFile(dotsJsonFile, 'utf-8'));
    const imgW  = dotsData.width  ?? VW;
    const imgH  = dotsData.height ?? VH;
    const imgAR = imgW / imgH;
    const videoAR = VW / VH;
    let renderW, renderH, offsetX, offsetY;
    if (imgAR > videoAR) {
      renderW = VW; renderH = VW / imgAR;
      offsetX = 0;  offsetY = (VH - renderH) / 2;
    } else {
      renderH = VH; renderW = VH * imgAR;
      offsetX = (VW - renderW) / 2; offsetY = 0;
    }
    dotWaypoints = dotsData.dots.map(d => ({
      x: offsetX + d.x * renderW,
      y: offsetY + d.y * renderH,
    }));
    if (dotsData.dotColor) dotColor = dotsData.dotColor;
  } catch {
    // dots.json not present — run `npm run extract:dotdot` to generate it
  }

  return {
    blankImagePath,
    solvedImagePath,
    revealType:       activity.revealType ?? 'ltr',
    hookText:         activity.hookText   ?? '',
    hookDurationSec:  hookSec,
    revealDurationSec: revealSec,
    holdDurationSec:  holdSec,
    loopDurationSec:  loopSec,
    audioPath:        activity.audioPath !== undefined
                        ? activity.audioPath
                        : await resolveAudio(activity.type ?? 'coloring'),
    audioVolume:      activity.audioVolume ?? 0.85,
    showJoyo:         activity.showJoyo ?? true,
    showParticles:    activity.showParticles ?? true,
    particleEmoji:    activity.particleEmoji ?? '✨',
    pathWaypoints,
    pathColor:        activity.pathColor ?? pathColor,
    wordRects,
    highlightColor:   activity.highlightColor ?? highlightColor,
    dotWaypoints,
    dotColor:         activity.dotColor ?? dotColor,
    // computed total for duration override
    _totalSec: hookSec + revealSec + holdSec + loopSec,
  };
}

// challenge/activity.json → ActivityChallenge props
async function challengeJsonToProps(activity, activityDir) {
  const VW = 1080, VH = 1920;
  const toRelative = (filename) =>
    path.relative(ROOT, path.resolve(activityDir, filename)).replace(/\\/g, '/');

  async function resolveSfx(rel) {
    if (!rel) return '';
    const exists = await fs.access(path.join(ROOT, rel)).then(() => true).catch(() => false);
    if (!exists) console.warn(`    [sfx] not found — skipping: ${rel}`);
    return exists ? rel : '';
  }

  async function resolveImage(filename) {
    const abs = path.resolve(activityDir, filename);
    const exists = await fs.access(abs).then(() => true).catch(() => false);
    return exists ? toRelative(filename) : '';
  }

  const sfx = CHALLENGE_SFX_MAP[activity.puzzleType] ?? CHALLENGE_SFX_MAP.default;

  const [challengeAudioPath, tickAudioPath, transitionCueAudioPath, solveAudioPath] =
    await Promise.all([
      resolveSfx(activity.challengeAudioPath ?? sfx.challengeAudioPath),
      resolveSfx(activity.tickAudioPath ?? sfx.tickAudioPath),
      resolveSfx(activity.transitionCueAudioPath ?? sfx.transitionCueAudioPath),
      resolveSfx(activity.solveAudioPath ?? sfx.solveAudioPath),
    ]);

  // Load path.json for maze solve reveal
  let pathWaypoints = null, pathColor = '#22BB44';
  try {
    const pathData = JSON.parse(await fs.readFile(path.resolve(activityDir, 'path.json'), 'utf-8'));
    const imgAR = (pathData.width ?? VW) / (pathData.height ?? VH);
    const videoAR = VW / VH;
    let renderW, renderH, offsetX, offsetY;
    if (imgAR > videoAR) { renderW = VW; renderH = VW / imgAR; offsetX = 0; offsetY = (VH - renderH) / 2; }
    else { renderH = VH; renderW = VH * imgAR; offsetX = (VW - renderW) / 2; offsetY = 0; }
    pathWaypoints = pathData.waypoints.map(p => ({ x: offsetX + p.x * renderW, y: offsetY + p.y * renderH }));
    if (pathData.pathColor) pathColor = pathData.pathColor;
  } catch { /* no path.json — solve falls back to static */ }

  // Load wordsearch.json
  let wordRects = null, highlightColor = '#FFD700';
  try {
    const wsData = JSON.parse(await fs.readFile(path.resolve(activityDir, 'wordsearch.json'), 'utf-8'));
    const imgAR = (wsData.width ?? VW) / (wsData.height ?? VH);
    const videoAR = VW / VH;
    let renderW, renderH, offsetX, offsetY;
    if (imgAR > videoAR) { renderW = VW; renderH = VW / imgAR; offsetX = 0; offsetY = (VH - renderH) / 2; }
    else { renderH = VH; renderW = VH * imgAR; offsetX = (VW - renderW) / 2; offsetY = 0; }
    wordRects = wsData.rects.map(r => ({
      x1: offsetX + r.x1 * renderW,
      y1: offsetY + r.y1 * renderH,
      x2: offsetX + r.x2 * renderW,
      y2: offsetY + r.y2 * renderH,
    }));
    if (wsData.highlightColor) highlightColor = wsData.highlightColor;
  } catch { /* no wordsearch.json */ }

  // Load dots.json
  let dotWaypoints = null, dotColor = '#FF6B35';
  try {
    const dotsData = JSON.parse(await fs.readFile(path.resolve(activityDir, 'dots.json'), 'utf-8'));
    const imgAR = (dotsData.width ?? VW) / (dotsData.height ?? VH);
    const videoAR = VW / VH;
    let renderW, renderH, offsetX, offsetY;
    if (imgAR > videoAR) { renderW = VW; renderH = VW / imgAR; offsetX = 0; offsetY = (VH - renderH) / 2; }
    else { renderH = VH; renderW = VH * imgAR; offsetX = (VW - renderW) / 2; offsetY = 0; }
    dotWaypoints = dotsData.dots.map(d => ({ x: offsetX + d.x * renderW, y: offsetY + d.y * renderH }));
    if (dotsData.dotColor) dotColor = dotsData.dotColor;
  } catch { /* no dots.json */ }

  return {
    imagePath: toRelative(activity.imagePath ?? 'puzzle.png'),
    blankImagePath: await resolveImage(activity.blankImage ?? 'blank.png'),
    solvedImagePath: await resolveImage(activity.solvedImage ?? 'solved.png'),
    puzzleType: activity.puzzleType ?? 'maze',
    hookText: activity.hookText ?? 'Can your kid solve this?',
    titleText: activity.titleText ?? '',
    activityLabel: activity.activityLabel ?? 'PUZZLE',
    countdownSec: activity.countdownSec ?? 10,
    hookDurationSec: activity.hookDurationSec ?? 0.6,
    holdAfterSec: activity.holdAfterSec ?? 12,
    challengeAudioPath,
    tickAudioPath,
    transitionCueAudioPath,
    solveAudioPath,
    challengeAudioVolume: activity.challengeAudioVolume ?? 0.22,
    tickAudioVolume: activity.tickAudioVolume ?? 0.16,
    transitionCueVolume: activity.transitionCueVolume ?? 0.2,
    solveAudioVolume: activity.solveAudioVolume ?? 0.85,
    showJoyo: activity.showJoyo ?? true,
    showBrandWatermark: activity.showBrandWatermark ?? true,
    pathWaypoints,
    pathColor: activity.pathColor ?? pathColor,
    wordRects,
    highlightColor: activity.highlightColor ?? highlightColor,
    dotWaypoints,
    dotColor: activity.dotColor ?? dotColor,
  };
}

async function loadInputProps() {
  if (storyFile) {
    const story = JSON.parse(await fs.readFile(path.resolve(ROOT, storyFile), 'utf-8'));
    return storyJsonToProps(story, path.dirname(path.resolve(ROOT, storyFile)));
  }
  if (asmrFile) {
    const activity = JSON.parse(await fs.readFile(path.resolve(ROOT, asmrFile), 'utf-8'));
    return activityJsonToProps(activity, path.dirname(path.resolve(ROOT, asmrFile)));
  }
  if (challengeFile) {
    // Accept either a folder path (loads activity.json) or a direct .json path
    let jsonPath = path.resolve(ROOT, challengeFile);
    const stat = await fs.stat(jsonPath).catch(() => null);
    if (stat?.isDirectory()) jsonPath = path.join(jsonPath, 'activity.json');
    const activity = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
    return challengeJsonToProps(activity, path.dirname(jsonPath));
  }
  if (propsFileArg) {
    return JSON.parse(await fs.readFile(path.resolve(ROOT, propsFileArg), 'utf-8'));
  }
  if (propsArg) return JSON.parse(propsArg);
  return {};
}

// ─── Duration calculator ──────────────────────────────────────────────────────
function computeDuration(inputProps, compId) {
  const fps = 30;
  if (compId === 'StoryEpisode') {
    if (!inputProps.slides?.length) return fps * 30;
    return inputProps.slides.reduce((s, sl) => s + (sl.durationFrames ?? fps * 4), 0);
  }
  if (compId === 'AsmrReveal') {
    const totalSec = inputProps._totalSec
      ?? ((inputProps.hookDurationSec ?? 3) + (inputProps.revealDurationSec ?? 30) + (inputProps.holdDurationSec ?? 1.5) + (inputProps.loopDurationSec ?? 2.0));
    return Math.round(totalSec * fps);
  }
  if (compId === 'HookIntro') {
    return Math.round((inputProps.durationSec ?? 4) * fps);
  }
  if (compId === 'AnimatedFactCard') {
    const cardSec = inputProps.cardDurationSec ?? 3.5;
    const count   = inputProps.facts?.length ?? 3;
    return Math.round((2 + cardSec * count) * fps); // 2s title intro + cards
  }
  if (compId === 'ActivityChallenge') {
    const hookSec  = inputProps.hookDurationSec ?? 2.5;
    const timerSec = inputProps.countdownSec    ?? 60;
    const holdSec  = inputProps.holdAfterSec    ?? 2.5;
    return Math.round((hookSec + timerSec + holdSec) * fps);
  }
  return fps * 30;
}

// ─── Bundle cache (module-level singleton) ────────────────────────────────────
// Bundling takes ~50s on cold start. If this script is imported as a module or
// called multiple times in one process, we reuse the same bundle URL.
let _cachedServeUrl = null;
async function getBundle() {
  if (_cachedServeUrl) return _cachedServeUrl;
  console.log('\n    Bundling compositions...');
  const t = Date.now();
  // Build a lean publicDir with only the folders staticFile() paths reference.
  // Remotion copies publicDir into a temp webpack bundle — including node_modules or
  // output/archive would exhaust disk space on Windows. Pre-copy only what's needed.
  const publicDir = path.join(ROOT, '.remotion-public');
  await fs.mkdir(publicDir, { recursive: true });
  // Subdirs to mirror: assets/ + output/asmr/ + output/stories/
  // cp -r equivalent using Node.js fs (no symlinks — avoids Windows EPERM)
  const toCopy = [
    [path.join(ROOT, 'assets'),                path.join(publicDir, 'assets')],
    [path.join(ROOT, 'output', 'asmr'),        path.join(publicDir, 'output', 'asmr')],
    [path.join(ROOT, 'output', 'stories'),     path.join(publicDir, 'output', 'stories')],
    [path.join(ROOT, 'output', 'challenge'),   path.join(publicDir, 'output', 'challenge')],
  ];
  async function copyDir(src, dst) {
    await fs.mkdir(dst, { recursive: true });
    for (const entry of await fs.readdir(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name), d = path.join(dst, entry.name);
      if (entry.isDirectory()) await copyDir(s, d);
      else await fs.copyFile(s, d);
    }
  }
  for (const [src, dst] of toCopy) {
    const exists = await fs.access(src).then(() => true).catch(() => false);
    if (exists) await copyDir(src, dst);
  }
  _cachedServeUrl = await bundle({
    entryPoint:      path.join(ROOT, 'remotion', 'index.jsx'),
    publicDir,
    webpackOverride: (config) => config,
  });
  console.log(`    Bundled in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  return _cachedServeUrl;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const inputProps  = await loadInputProps();
  const totalFrames = computeDuration(inputProps, compositionId);

  // Clean _totalSec before passing to composition (internal helper field)
  const { _totalSec, ...cleanProps } = inputProps;

  // Preview mode: cap duration + half resolution
  const renderFrames = previewMode ? Math.min(totalFrames, PREVIEW_FRAMES) : totalFrames;

  const outputPath = outArg
    ?? path.join(ROOT, 'output', 'videos', `${compositionId}-${Date.now()}${previewMode ? '-preview' : ''}.mp4`);

  console.log('\n🎬  Remotion Render');
  console.log(`    Composition : ${compositionId}`);
  console.log(`    Duration    : ${renderFrames} frames (${(renderFrames / 30).toFixed(1)}s @ 30fps)${previewMode ? '  [PREVIEW]' : ''}`);
  if (previewMode)                console.log(`    Scale       : ${PREVIEW_SCALE}× (${Math.round(1080 * PREVIEW_SCALE)}×${Math.round(1920 * PREVIEW_SCALE)})`);
  if (cleanProps.slides?.length)  console.log(`    Slides      : ${cleanProps.slides.length}`);
  if (cleanProps.blankImagePath)  console.log(`    Blank       : ${cleanProps.blankImagePath}`);
  if (cleanProps.solvedImagePath) console.log(`    Solved      : ${cleanProps.solvedImagePath}`);
  if (cleanProps.hookText)        console.log(`    Hook        : "${cleanProps.hookText}"`);
  if (cleanProps.musicPath)       console.log(`    Music       : ${cleanProps.musicPath}`);
  if (cleanProps.audioPath)       console.log(`    Audio       : ${cleanProps.audioPath}`);
  if (cleanProps.pathWaypoints)   console.log(`    Path pts    : ${cleanProps.pathWaypoints.length} waypoints (solver active)`);
  if (cleanProps.pathColor)       console.log(`    Path color  : ${cleanProps.pathColor}`);
  console.log(`    Output      : ${outputPath}`);

  if (dryRun) {
    console.log('\n    [dry-run] — bundle + render skipped.');
    if (verbose) console.log('\n    Props:', JSON.stringify(cleanProps, null, 2));
    return;
  }

  const serveUrl    = await getBundle();
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps: cleanProps });
  composition.durationInFrames = renderFrames;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  console.log(`\n    Rendering...`);
  const t = Date.now();
  let lastPct = -1;

  await renderMedia({
    composition,
    serveUrl,
    codec:          'h264',
    outputLocation: outputPath,
    inputProps:     cleanProps,
    scale:          previewMode ? PREVIEW_SCALE : 1,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct !== lastPct) {
        process.stdout.write(`\r    Progress: ${pct}%   `);
        lastPct = pct;
      }
    },
  });

  const elapsed = ((Date.now() - t) / 1000).toFixed(1);
  console.log(`\n\n    ✓ Done in ${elapsed}s → ${outputPath}`);

  // ── Auto-thumbnail: extract frame at 3s as JPEG ───────────────────────────
  if (!previewMode) {
    const thumbFrame = Math.min(Math.round(3 * 30), renderFrames - 1);
    const thumbPath  = outputPath.replace(/\.mp4$/, '-thumb.jpg');
    try {
      console.log(`\n    Extracting thumbnail (frame ${thumbFrame})...`);
      await renderStill({
        composition,
        serveUrl,
        output:     thumbPath,
        inputProps: cleanProps,
        frame:      thumbFrame,
        imageFormat: 'jpeg',
        jpegQuality: 85,
      });
      console.log(`    ✓ Thumbnail → ${thumbPath}`);
    } catch (err) {
      console.warn(`    [thumb] skipped: ${err.message}`);
    }
  }

  // ── Purge stale Remotion temp bundles ────────────────────────────────────────
  // Remotion writes each bundle to a fresh tmp dir and never cleans up.
  // After a successful render we delete all bundles EXCEPT the one we just used,
  // so disk space doesn't accumulate across sessions.
  try {
    const os   = await import('os');
    const tmpDir = os.tmpdir();
    const entries = await fs.readdir(tmpDir);
    const bundles = entries.filter(e => e.startsWith('remotion-webpack-bundle-'));
    const currentBundle = serveUrl.startsWith('file:///')
      ? serveUrl.replace('file:///', '').split('/')[0]
      : null;
    for (const b of bundles) {
      if (b === currentBundle) continue; // keep the one we just used
      await fs.rm(path.join(tmpDir, b), { recursive: true, force: true }).catch(() => {});
    }
    if (bundles.length > 1) console.log(`    [cleanup] removed ${bundles.length - 1} stale bundle(s) from ${tmpDir}`);
  } catch { /* non-fatal */ }

  console.log();
}

main().catch((err) => {
  console.error('\n❌  Render failed:', err.message ?? err);
  if (verbose) console.error(err);
  process.exit(1);
});

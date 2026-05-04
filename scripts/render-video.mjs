/**
 * render-video.mjs — Remotion rendering entry point
 *
 * Usage:
 *   node scripts/render-video.mjs --comp StoryEpisode --story output/stories/my-story/story.json
 *   node scripts/render-video.mjs --comp StoryReelV2 --story output/stories/my-story/story.json
 *   node scripts/render-video.mjs --comp AnimalFactsSongShort --animal-episode output/longform/animal/ep03-hedgehog
 *   node scripts/render-video.mjs --comp AsmrReveal   --asmr  output/asmr/maze-slug/activity.json
 *   node scripts/render-video.mjs --comp AsmrReveal   --challenge output/challenge/generated-activity/maze-slug
 *   node scripts/render-video.mjs --comp HookIntro    --props '{"headline":"Can your kid solve this?","subline":"Screen-free fun for ages 4-8"}'
 *   node scripts/render-video.mjs --comp StoryEpisode --props '{"slides":[...]}'  --out output/videos/ep01.mp4
 *   node scripts/render-video.mjs --comp StoryEpisode --dry-run --verbose
 *
 * Compositions:
 *   StoryEpisode          — legacy multi-slide story video (slides, hookText, music)
 *   StoryReelV2           — flash-forward hook + longform-style short story reel
 *   AnimalFactsSongShort  — mystery hook + reveal + sung recap animal reel
 *   AsmrReveal            — progressive wipe reveal  (blankImagePath, solvedImagePath, revealType)
 *   HookIntro             — short 3-5s hook clip     (headline, subline, backgroundPath)
 */

import { bundle }                                      from '@remotion/bundler';
import { renderMedia, selectComposition, renderStill } from '@remotion/renderer';
import path   from 'path';
import fs     from 'fs/promises';
import os     from 'os';
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
    : args.includes('--animal-episode') ? 'AnimalFactsSongShort'
    : args.includes('--asmr')      ? 'AsmrReveal'
    : args.includes('--story')     ? 'StoryEpisode'
    : 'StoryEpisode');
const storyFile     = getArg('--story');
const challengeFile = getArg('--challenge');
const animalEpisodeArg = getArg('--animal-episode');

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
  coloring:   'assets/audio/crayon.mp3',  // crayon scratch ASMR — no background music
  maze:       'assets/audio/crayon.mp3',  // pencil/scribble path ASMR — no background music
  challenge: 'assets/audio/crayon.mp3',  // maze challenge folders used for ASMR renders
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

function buildDefaultReelSlideOrder(slides = []) {
  const count = Array.isArray(slides) ? slides.length : 0;
  if (count <= 5) return Array.from({ length: count }, (_, i) => i + 1);
  const picks = [
    1,
    2,
    Math.max(3, Math.ceil(count / 2)),
    Math.max(Math.ceil(count / 2) + 1, count - 1),
    count,
  ];
  return [...new Set(picks)].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
}

async function storyJsonToReelV2Props(story, storyDir) {
  const fps = 30;
  const rawSlides = story.slides ?? [];
  if (rawSlides.length < 5) {
    throw new Error(`StoryReelV2 requires at least 5 slides, got ${rawSlides.length}.`);
  }

  const candidateOrder = Array.isArray(story.reelSlideOrder)
    ? story.reelSlideOrder.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= rawSlides.length)
    : [];
  const reelSlideOrder = candidateOrder.length >= 5
    ? [...new Set(candidateOrder)].slice(0, 5)
    : buildDefaultReelSlideOrder(rawSlides);
  const selectedSlides = reelSlideOrder.map((n) => rawSlides[n - 1]).filter(Boolean);

  const slides = selectedSlides.map((slide, index) => {
    const rawImageRef = slide.imagePath ?? slide.image ?? '';
    const imagePath = rawImageRef
      ? path.relative(ROOT, path.resolve(storyDir, rawImageRef)).replace(/\\/g, '/')
      : '';
    const captionText = slide.narration ?? slide.caption ?? '';
    const wordCount = captionText.split(/\s+/).filter(Boolean).length;
    const durationFrames = Math.max(75, Math.min(Math.round((2.4 + wordCount * 0.11) * fps), 126));
    const act = slide.act ?? (index < 2 ? 1 : index < selectedSlides.length - 2 ? 2 : 3);
    return {
      sceneIndex: index + 1,
      imageRef: rawImageRef,
      imagePath,
      captionText,
      durationFrames,
      psychologyTrigger: act === 1 ? 'CURIOSITY_GAP' : act === 2 ? 'IDENTITY_MIRROR' : 'COMPLETION_SATISFACTION',
      isClimaxScene: index === selectedSlides.length - 2,
    };
  });

  const flashForwardSlide = selectedSlides[selectedSlides.length - 1] ?? rawSlides[rawSlides.length - 1] ?? rawSlides[rawSlides.length - 2] ?? rawSlides[0] ?? null;
  const flashForwardRef = flashForwardSlide?.imagePath ?? flashForwardSlide?.image ?? '';
  const flashForwardImagePath = flashForwardRef
    ? path.relative(ROOT, path.resolve(storyDir, flashForwardRef)).replace(/\\/g, '/')
    : '';
  const requiredImages = [...new Set([
    flashForwardRef,
    ...slides.map((slide) => slide.imageRef),
  ].filter(Boolean))];
  const missingImages = [];
  for (const relativeFile of requiredImages) {
    const abs = path.resolve(storyDir, relativeFile);
    const exists = await fs.access(abs).then(() => true).catch(() => false);
    if (!exists) missingImages.push(relativeFile);
  }
  if (missingImages.length) {
    throw new Error(`StoryReelV2 missing required image assets: ${missingImages.join(', ')}`);
  }

  const flashForwardCaption = flashForwardSlide?.narration ?? flashForwardSlide?.caption ?? '';
  const hookQuestion = story.hookQuestion ?? story.hook ?? flashForwardCaption ?? 'What happens next?';
  const hookWordCount = hookQuestion.split(/\s+/).filter(Boolean).length;
  const outroTeaser = story.outroEcho ?? story.outroTeaser ?? story.title ?? 'Watch for the ending.';
  const outroWordCount = outroTeaser.split(/\s+/).filter(Boolean).length;
  const musicPath = story.musicPath !== undefined
    ? story.musicPath
    : await resolveAudio('story');

  return {
    slides: slides.map(({ imageRef, ...rest }) => rest),
    hookQuestion,
    flashForwardImagePath,
    backgroundMusicPath: musicPath,
    outroTeaser,
    hookDurationFrames: story.hookDurationFrames ?? Math.max(75, Math.min(Math.round((1.9 + hookWordCount * 0.09) * fps), 105)),
    outroDurationFrames: story.outroDurationFrames ?? Math.max(60, Math.min(Math.round((1.6 + outroWordCount * 0.07) * fps), 90)),
  };
}

async function animalEpisodeToSongShortProps(episode, episodeDir) {
  const requiredImages = ['namereveal.png', 'fact1.png', 'fact2.png', 'fact3.png', 'fact4.png', 'fact5.png'];
  const missingImages = [];
  for (const filename of requiredImages) {
    const abs = path.join(episodeDir, filename);
    const exists = await fs.access(abs).then(() => true).catch(() => false);
    if (!exists) missingImages.push(filename);
  }
  if (missingImages.length) {
    throw new Error(`AnimalFactsSongShort missing required image assets: ${missingImages.join(', ')}`);
  }

  return {
    episodeFolder: path.relative(ROOT, episodeDir).replace(/\\/g, '/'),
    episode,
  };
}

// activity.json → AsmrReveal props
async function activityJsonToProps(activity, activityDir) {
  const fps = 30;
  const VW = 1080, VH = 1920;
  const toRelative = (filename) =>
    path.relative(ROOT, path.resolve(activityDir, filename)).replace(/\\/g, '/');
  const fileExists = async (filename) => fs.access(path.resolve(activityDir, filename)).then(() => true).catch(() => false);

  const revealType = activity.revealType ?? activity.puzzleType ?? activity.type ?? 'ltr';
  const blankFilename = revealType === 'maze'
    ? (await fileExists(activity.blankImage ?? 'blank.png') ? (activity.blankImage ?? 'blank.png') : 'maze.png')
    : (activity.blankImage ?? 'blank.png');

  // Expect blank.png / solved.png in same folder (or custom names from activity.json)
  const blankImagePath  = toRelative(blankFilename);
  const solvedImagePath = toRelative(activity.solvedImage ?? (revealType === 'coloring' ? 'colored.png' : 'solved.png'));

  const hookSec    = activity.hookDurationSec    ?? 3;
  const revealSec  = activity.revealDurationSec  ?? activity.countdownSec ?? 26;  // challenge folders reuse countdown duration
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
    revealType,
    hookText:         activity.hookText   ?? '',
    hookDurationSec:  hookSec,
    revealDurationSec: revealSec,
    holdDurationSec:  holdSec,
    loopDurationSec:  loopSec,
    audioPath:        activity.audioPath !== undefined
                        ? activity.audioPath
                        : await resolveAudio(activity.type ?? activity.puzzleType ?? 'coloring'),
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
  const fitContainBounds = (imageWidth = VW, imageHeight = VH) => {
    const imgAR = imageWidth / imageHeight;
    const videoAR = VW / VH;
    if (imgAR > videoAR) {
      const renderW = VW;
      const renderH = VW / imgAR;
      return { width: renderW, height: renderH, offsetX: 0, offsetY: (VH - renderH) / 2 };
    }
    const renderH = VH;
    const renderW = VH * imgAR;
    return { width: renderW, height: renderH, offsetX: (VW - renderW) / 2, offsetY: 0 };
  };

  async function resolveSfx(rel) {
    if (!rel) return '';
    const exists = await fs.access(path.join(ROOT, rel)).then(() => true).catch(() => false);
    if (!exists) console.warn(`    [sfx] not found - skipping: ${rel}`);
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

  let sourceImageWidth = VW, sourceImageHeight = VH;

  // Load path.json for maze solve reveal
  let pathWaypoints = null, pathColor = '#22BB44';
  try {
    const pathData = JSON.parse(await fs.readFile(path.resolve(activityDir, 'path.json'), 'utf-8'));
    sourceImageWidth = pathData.width ?? VW;
    sourceImageHeight = pathData.height ?? VH;
    const { width: renderW, height: renderH, offsetX, offsetY } = fitContainBounds(sourceImageWidth, sourceImageHeight);
    pathWaypoints = pathData.waypoints.map(p => ({ x: offsetX + p.x * renderW, y: offsetY + p.y * renderH }));
    if (pathData.pathColor) pathColor = pathData.pathColor;
  } catch { /* no path.json - solve falls back to static */ }

  // Load wordsearch.json
  let wordRects = null, highlightColor = '#FFD700';
  try {
    const wsData = JSON.parse(await fs.readFile(path.resolve(activityDir, 'wordsearch.json'), 'utf-8'));
    sourceImageWidth = wsData.width ?? VW;
    sourceImageHeight = wsData.height ?? VH;
    const { width: renderW, height: renderH, offsetX, offsetY } = fitContainBounds(sourceImageWidth, sourceImageHeight);
    wordRects = wsData.rects.map(r => ({
      x1: offsetX + r.x1 * renderW,
      y1: offsetY + r.y1 * renderH,
      x2: offsetX + r.x2 * renderW,
      y2: offsetY + r.y2 * renderH,
    }));
    if (wsData.highlightColor) highlightColor = wsData.highlightColor;
  } catch { /* no wordsearch.json */ }

  const CANVAS_W = 1700, CANVAS_H = 2200;

  // Load matchRects from matching.json
  let matchRects = null, matchPairs = null, matchConnections = null, pairOrder = null;
  try {
    const matchingData = JSON.parse(await fs.readFile(path.resolve(activityDir, 'matching.json'), 'utf-8'));
    sourceImageWidth = CANVAS_W;
    sourceImageHeight = CANVAS_H;
    const { width: renderW, height: renderH, offsetX, offsetY } = fitContainBounds(CANVAS_W, CANVAS_H);
    matchRects = (matchingData.matchRects || []).map(r => ({
      gridIndex: r.gridIndex,
      x: offsetX + r.xNorm * renderW,
      y: offsetY + r.yNorm * renderH,
      w: r.wNorm * renderW,
      h: r.hNorm * renderH,
    }));
    matchPairs = matchingData.pairs || [];
    pairOrder = matchingData.pairOrder || [];
    matchConnections = (matchingData.connections || []).map(c => ({
      x1: offsetX + c.x1 / CANVAS_W * renderW,
      y1: offsetY + c.y1 / CANVAS_H * renderH,
      x2: offsetX + c.x2 / CANVAS_W * renderW,
      y2: offsetY + c.y2 / CANVAS_H * renderH,
      label: c.label,
    }));
  } catch { /* no matching.json */ }

  // Load maze sticker fractions
  let mazeStartFraction = null, mazeFinishFraction = null;
  try {
    const mazeData = JSON.parse(await fs.readFile(path.resolve(activityDir, 'maze.json'), 'utf-8'));
    sourceImageWidth = mazeData.layout?.canvasW ?? sourceImageWidth;
    sourceImageHeight = mazeData.layout?.canvasH ?? sourceImageHeight;
    const layout = mazeData.layout || {};
    const cols = mazeData.cols || 1;
    const rows = mazeData.rows || 1;
    const cellW = layout.mazeW / cols;
    const cellH = layout.mazeH / rows;
    const entry = mazeData.entry || mazeData.entrance;
    const exit = mazeData.exit;
    // Normalize to full canvas (same reference as path.json waypoints).
    // Snap to outer maze wall for edge cells so icon sits at the opening.
    const snapX = (col) => col === 0 ? layout.offsetX
      : col === cols - 1 ? layout.offsetX + layout.mazeW
      : layout.offsetX + col * cellW + cellW / 2;
    const snapY = (row) => row === 0 ? layout.offsetY
      : row === rows - 1 ? layout.offsetY + layout.mazeH
      : layout.offsetY + row * cellH + cellH / 2;
    if (entry) {
      const onHoriz = entry.col === 0 || entry.col === cols - 1;
      const onVert = entry.row === 0 || entry.row === rows - 1;
      mazeStartFraction = {
        x: (onHoriz ? snapX(entry.col) : layout.offsetX + entry.col * cellW + cellW / 2) / sourceImageWidth,
        y: (onVert ? snapY(entry.row) : layout.offsetY + entry.row * cellH + cellH / 2) / sourceImageHeight,
      };
    }
    if (exit) {
      const onHoriz = exit.col === 0 || exit.col === cols - 1;
      const onVert = exit.row === 0 || exit.row === rows - 1;
      mazeFinishFraction = {
        x: (onHoriz ? snapX(exit.col) : layout.offsetX + exit.col * cellW + cellW / 2) / sourceImageWidth,
        y: (onVert ? snapY(exit.row) : layout.offsetY + exit.row * cellH + cellH / 2) / sourceImageHeight,
      };
    }
  } catch { /* no maze.json */ }

  // Load dots.json
  let dotWaypoints = null, dotColor = '#FF6B35';
  try {
    const dotsData = JSON.parse(await fs.readFile(path.resolve(activityDir, 'dots.json'), 'utf-8'));
    sourceImageWidth = dotsData.width ?? sourceImageWidth;
    sourceImageHeight = dotsData.height ?? sourceImageHeight;
    const { width: renderW, height: renderH, offsetX, offsetY } = fitContainBounds(sourceImageWidth, sourceImageHeight);
    dotWaypoints = dotsData.dots.map(d => ({ x: offsetX + d.x * renderW, y: offsetY + d.y * renderH }));
    if (dotsData.dotColor) dotColor = dotsData.dotColor;
  } catch { /* no dots.json */ }

  return {
    imagePath: toRelative(activity.imagePath ?? 'puzzle.png'),
    blankImagePath: await resolveImage(activity.blankImage ?? 'blank.png'),
    solvedImagePath: await resolveImage(activity.solvedImage ?? 'solved.png'),
    sceneImagePath: activity.sceneImagePath ? toRelative(activity.sceneImagePath) : null,
    puzzleType: activity.puzzleType ?? 'maze',
    theme: activity.theme ?? '',
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
    matchRects,
    matchPairs,
    matchConnections,
    pairOrder,
    highlightColor: activity.highlightColor ?? highlightColor,
    dotWaypoints,
    dotColor: activity.dotColor ?? dotColor,
    sourceImageWidth,
    sourceImageHeight,
    mazeStartFraction,
    mazeFinishFraction,
    mazeHeroAsset: activity.mazeHeroAsset ?? '',
    mazeRewardAsset: activity.mazeRewardAsset ?? '',
  };
}

async function loadInputProps() {
  if (storyFile) {
    let jsonPath = path.resolve(ROOT, storyFile);
    const stat = await fs.stat(jsonPath).catch(() => null);
    if (stat?.isDirectory()) jsonPath = path.join(jsonPath, 'story.json');
    const story = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
    if (compositionId === 'StoryReelV2') {
      return storyJsonToReelV2Props(story, path.dirname(jsonPath));
    }
    return storyJsonToProps(story, path.dirname(jsonPath));
  }
  if (animalEpisodeArg) {
    let episodePath = path.resolve(ROOT, animalEpisodeArg);
    const stat = await fs.stat(episodePath).catch(() => null);
    if (stat?.isDirectory()) episodePath = path.join(episodePath, 'episode.json');
    const episode = JSON.parse(await fs.readFile(episodePath, 'utf-8'));
    return animalEpisodeToSongShortProps(episode, path.dirname(episodePath));
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
    if (compositionId === 'AsmrReveal') {
      return activityJsonToProps(activity, path.dirname(jsonPath));
    }
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
  if (compId === 'StoryReelV2') {
    const hookFrames = inputProps.hookDurationFrames ?? fps * 5;
    const outroFrames = inputProps.outroDurationFrames ?? fps * 4;
    const slideFrames = inputProps.slides?.reduce((s, sl) => s + (sl.durationFrames ?? fps * 4), 0) ?? fps * 16;
    return hookFrames + slideFrames + outroFrames;
  }
  if (compId === 'AnimalFactsSongShort') {
    const hookFrames = Math.round(Math.min(Math.max(inputProps.episode?.hookNarrationDurationSec || 4, 3), 5) * fps);
    const revealFrames = Math.round(2.5 * fps);
    const sungRecapSec = Number(inputProps.episode?.sungRecapShortDurationSec);
    const songFrames = Math.round((Number.isFinite(sungRecapSec) && sungRecapSec > 0 ? sungRecapSec : 17) * fps);
    const outroFrames = Math.round(Math.min(Math.max(inputProps.episode?.outroCtaShortDurationSec || 4, 3), 4) * fps);
    return hookFrames + revealFrames + songFrames + outroFrames;
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
let _cachedPublicDir = null;
async function getBundle() {
  if (_cachedServeUrl) return _cachedServeUrl;
  console.log('\n    Bundling compositions...');
  const t = Date.now();
  // Build a lean process-unique publicDir with only the folders staticFile() paths reference.
  // A shared `.remotion-public` can collide on Windows when multiple renders run at once.
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'joymaze-remotion-public-'));
  _cachedPublicDir = publicDir;
  // Subdirs to mirror: assets/ + output/asmr/ + output/stories/
  // cp -r equivalent using Node.js fs (no symlinks — avoids Windows EPERM)
  const toCopy = [
    [path.join(ROOT, 'assets'),                path.join(publicDir, 'assets')],
    [path.join(ROOT, 'output', 'asmr'),        path.join(publicDir, 'output', 'asmr')],
    [path.join(ROOT, 'output', 'stories'),     path.join(publicDir, 'output', 'stories')],
    [path.join(ROOT, 'output', 'challenge'),   path.join(publicDir, 'output', 'challenge')],
    [path.join(ROOT, 'output', 'longform', 'animal'), path.join(publicDir, 'output', 'longform', 'animal')],
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

  // Keep Remotion webpack bundles in place here.
  // Cross-process cleanup is unsafe on Windows because concurrent renders can still
  // be serving those bundles during thumbnail extraction or late render steps.
  if (_cachedPublicDir) {
    await fs.rm(_cachedPublicDir, { recursive: true, force: true }).catch(() => {});
    _cachedPublicDir = null;
  }

  console.log();
}

main().catch((err) => {
  console.error('\n❌  Render failed:', err.message ?? err);
  if (verbose) console.error(err);
  process.exit(1);
});

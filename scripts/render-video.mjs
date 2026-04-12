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

import { bundle }                          from '@remotion/bundler';
import { renderMedia, selectComposition }  from '@remotion/renderer';
import path   from 'path';
import fs     from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] ?? null : null; };
const hasFlag = (f) => args.includes(f);

const compositionId = getArg('--comp') ?? 'StoryEpisode';
const storyFile     = getArg('--story');
const asmrFile      = getArg('--asmr');
const propsArg      = getArg('--props');
const outArg        = getArg('--out');
const dryRun        = hasFlag('--dry-run');
const verbose       = hasFlag('--verbose');

// ─── Props loaders ────────────────────────────────────────────────────────────

// story.json → StoryEpisode props
function storyJsonToProps(story, storyDir) {
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
  return {
    slides,
    hookText:    story.hook ?? story.hookText ?? '',
    musicPath:   story.musicPath ?? '',
    musicVolume: story.musicVolume ?? 0.28,
    showJoyo:    story.showJoyo ?? true,
  };
}

// activity.json → AsmrReveal props
function activityJsonToProps(activity, activityDir) {
  const fps = 30;
  const toRelative = (filename) =>
    path.relative(ROOT, path.resolve(activityDir, filename)).replace(/\\/g, '/');

  // Expect blank.png / solved.png in same folder (or custom names from activity.json)
  const blankImagePath  = toRelative(activity.blankImage  ?? 'blank.png');
  const solvedImagePath = toRelative(activity.solvedImage ?? 'solved.png');

  const hookSec    = activity.hookDurationSec    ?? 3;
  const revealSec  = activity.revealDurationSec  ?? 30;
  const holdSec    = activity.holdDurationSec    ?? 1.5;

  return {
    blankImagePath,
    solvedImagePath,
    revealType:       activity.revealType ?? 'ltr',
    hookText:         activity.hookText   ?? '',
    hookDurationSec:  hookSec,
    revealDurationSec: revealSec,
    holdDurationSec:  holdSec,
    audioPath:        activity.audioPath ?? 'assets/audio/crayon.mp3',
    audioVolume:      activity.audioVolume ?? 0.85,
    showJoyo:         activity.showJoyo ?? true,
    showParticles:    activity.showParticles ?? true,
    particleEmoji:    activity.particleEmoji ?? '✨',
    // computed total for duration override
    _totalSec: hookSec + revealSec + holdSec,
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
      ?? ((inputProps.hookDurationSec ?? 3) + (inputProps.revealDurationSec ?? 30) + (inputProps.holdDurationSec ?? 1.5));
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
  _cachedServeUrl = await bundle({
    entryPoint:      path.join(ROOT, 'remotion', 'index.jsx'),
    publicDir:       ROOT,
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

  const outputPath = outArg
    ?? path.join(ROOT, 'output', 'videos', `${compositionId}-${Date.now()}.mp4`);

  console.log('\n🎬  Remotion Render');
  console.log(`    Composition : ${compositionId}`);
  console.log(`    Duration    : ${totalFrames} frames (${(totalFrames / 30).toFixed(1)}s @ 30fps)`);
  if (cleanProps.slides?.length)  console.log(`    Slides      : ${cleanProps.slides.length}`);
  if (cleanProps.blankImagePath)  console.log(`    Blank       : ${cleanProps.blankImagePath}`);
  if (cleanProps.solvedImagePath) console.log(`    Solved      : ${cleanProps.solvedImagePath}`);
  if (cleanProps.hookText)        console.log(`    Hook        : "${cleanProps.hookText}"`);
  console.log(`    Output      : ${outputPath}`);

  if (dryRun) {
    console.log('\n    [dry-run] — bundle + render skipped.');
    if (verbose) console.log('\n    Props:', JSON.stringify(cleanProps, null, 2));
    return;
  }

  const serveUrl    = await getBundle();
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps: cleanProps });
  composition.durationInFrames = totalFrames;

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
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct !== lastPct) {
        process.stdout.write(`\r    Progress: ${pct}%   `);
        lastPct = pct;
      }
    },
  });

  const elapsed = ((Date.now() - t) / 1000).toFixed(1);
  console.log(`\n\n    ✓ Done in ${elapsed}s → ${outputPath}\n`);
}

main().catch((err) => {
  console.error('\n❌  Render failed:', err.message ?? err);
  if (verbose) console.error(err);
  process.exit(1);
});

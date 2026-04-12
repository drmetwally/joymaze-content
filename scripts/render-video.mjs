/**
 * render-video.mjs — Remotion rendering entry point
 *
 * Usage:
 *   node scripts/render-video.mjs --comp StoryEpisode --props '{"slides":[...],"hookText":"..."}' --out output/videos/ep01.mp4
 *   node scripts/render-video.mjs --comp StoryEpisode --story output/stories/my-story/story.json
 *   node scripts/render-video.mjs --comp StoryEpisode --story output/stories/my-story/story.json --dry-run
 *
 * Compositions available:
 *   StoryEpisode  — multi-slide story video (slides + hookText + music)
 */

import { bundle }                       from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path   from 'path';
import fs     from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const getArg   = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] ?? null : null; };
const hasFlag  = (flag) => args.includes(flag);

const compositionId = getArg('--comp') ?? 'StoryEpisode';
const storyFile     = getArg('--story');       // shortcut: load props from story.json
const propsArg      = getArg('--props');
const outArg        = getArg('--out');
const dryRun        = hasFlag('--dry-run');
const verbose       = hasFlag('--verbose');

// ─── Load input props ─────────────────────────────────────────────────────────
async function loadInputProps() {
  // --story path/to/story.json  →  auto-build StoryEpisode props from story.json
  if (storyFile) {
    const story = JSON.parse(await fs.readFile(storyFile, 'utf-8'));
    return storyJsonToProps(story, path.dirname(storyFile));
  }
  // --props '{"..."}'
  if (propsArg) return JSON.parse(propsArg);
  return {};
}

// Convert a generate-story-ideas.mjs story.json to StoryEpisode props
function storyJsonToProps(story, storyDir) {
  const fps = 30;

  const slides = (story.slides ?? []).map((slide) => {
    // Try to find the slide image in the story folder
    const imagePath = slide.imagePath
      ? path.relative(ROOT, path.resolve(storyDir, slide.imagePath))
      : null;

    const durationSec = slide.durationSec ?? slide.duration ?? 4;
    return {
      imagePath:     imagePath ?? '',
      captionText:   slide.narration ?? slide.caption ?? '',
      durationFrames: Math.round(durationSec * fps),
    };
  });

  return {
    slides,
    hookText:    story.hook ?? story.hookText ?? '',
    musicPath:   story.musicPath ?? '',
    musicVolume: story.musicVolume ?? 0.28,
    showJoyo:    story.showJoyo   ?? true,
  };
}

// ─── Compute total duration from slides ───────────────────────────────────────
function computeDuration(inputProps) {
  const fps = 30;
  if (!inputProps.slides?.length) return fps * 30; // 30s default
  return inputProps.slides.reduce((sum, s) => sum + (s.durationFrames ?? fps * 4), 0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const inputProps = await loadInputProps();
  const totalFrames = computeDuration(inputProps);

  const outputPath = outArg
    ?? path.join(ROOT, 'output', 'videos', `${compositionId}-${Date.now()}.mp4`);

  console.log('\n🎬  Remotion Render');
  console.log(`    Composition : ${compositionId}`);
  console.log(`    Duration    : ${totalFrames} frames (${(totalFrames / 30).toFixed(1)}s @ 30fps)`);
  console.log(`    Slides      : ${inputProps.slides?.length ?? 0}`);
  console.log(`    Output      : ${outputPath}`);

  if (dryRun) {
    console.log('\n    [dry-run] — bundle + render skipped.');
    if (verbose) console.log('\n    Props:', JSON.stringify(inputProps, null, 2));
    return;
  }

  // 1. Bundle the Remotion entry point
  //    publicDir = ROOT so all project files (assets/, output/) are served
  console.log('\n    Bundling compositions...');
  const bundleStart = Date.now();
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, 'remotion', 'index.jsx'),
    publicDir:  ROOT,
    webpackOverride: (config) => config,
  });
  console.log(`    Bundled in ${((Date.now() - bundleStart) / 1000).toFixed(1)}s`);

  // 2. Select composition and override duration
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
  });
  composition.durationInFrames = totalFrames;

  // 3. Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // 4. Render
  console.log(`\n    Rendering...`);
  const renderStart = Date.now();
  let lastPct = -1;

  await renderMedia({
    composition,
    serveUrl,
    codec:          'h264',
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct !== lastPct) {
        process.stdout.write(`\r    Progress: ${pct}%   `);
        lastPct = pct;
      }
    },
  });

  const elapsed = ((Date.now() - renderStart) / 1000).toFixed(1);
  console.log(`\n\n    ✓ Done in ${elapsed}s`);
  console.log(`    Output: ${outputPath}\n`);
}

main().catch((err) => {
  console.error('\n❌ Render failed:', err.message ?? err);
  if (verbose) console.error(err);
  process.exit(1);
});

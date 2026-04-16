#!/usr/bin/env node

/**
 * render-longform.mjs — Renders a LongFormEpisode video from episode.json
 *
 * Usage:
 *   node scripts/render-longform.mjs --episode ep01-joymaze-adventure
 *   node scripts/render-longform.mjs --episode output/longform/ep01-joymaze-adventure/
 *   node scripts/render-longform.mjs --episode ep01-joymaze-adventure --dry-run
 *   npm run render:longform -- --episode ep01-joymaze-adventure
 *
 * Steps:
 *   1. Load episode.json from output/longform/{episode}/
 *   2. Validate all referenced image files exist
 *   3. Calculate total frames from segment timings
 *   4. Run: npx remotion render LongFormEpisode --props=... --output=...
 *
 * Output: output/videos/longform-{date}-ep{N}.mp4
 */

import 'dotenv/config';
import fs          from 'fs/promises';
import path        from 'path';
import { spawn }   from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const epArg = (() => {
  const i = args.indexOf('--episode');
  return i !== -1 ? args[i + 1] : null;
})();

if (!epArg) {
  console.error('Usage: node scripts/render-longform.mjs --episode <ep-folder-name>');
  console.error('Example: node scripts/render-longform.mjs --episode ep01-joymaze-adventure');
  process.exit(1);
}

/** Resolve episode directory path */
function resolveEpisodeDir(arg) {
  // Absolute or relative with output/longform/ prefix
  if (arg.startsWith('output/') || arg.startsWith('/') || arg.includes(':\\')) {
    return path.resolve(ROOT, arg);
  }
  return path.join(ROOT, 'output', 'longform', arg);
}

/** Calculate total frames from episode config */
function calculateTotalFrames(episode, fps = 30) {
  const {
    storySlides      = [],
    activities       = [],
    format           = 'adventure-activities',
    introSec         = 20,
    storySlideSec    = 15,
    transitionSec    = 5,
    labelSec         = 6,
    revealSec        = 55,
    celebrateSec     = 9,
    outroSec         = 30,
  } = episode;

  const showStory = format === 'adventure-activities' && storySlides.length > 0;

  let totalSec = introSec;
  if (showStory) {
    totalSec += storySlides.length * storySlideSec;
    totalSec += transitionSec;
  }
  totalSec += activities.length * (labelSec + revealSec + celebrateSec);
  totalSec += outroSec;

  return Math.round(totalSec * fps);
}

/** Validate that all image paths in episode.json exist */
async function validateImages(episode) {
  const missing = [];

  // Story slides
  for (const slide of (episode.storySlides || [])) {
    if (!slide.imagePath) continue;
    const p = path.resolve(ROOT, slide.imagePath);
    try { await fs.access(p); } catch { missing.push(slide.imagePath); }
  }

  // Activity images
  for (const act of (episode.activities || [])) {
    if (!act.folder) continue;
    const normalizedFolder = act.folder.replace(/\\/g, '/').replace(/\/$/, '');
    for (const file of ['blank.png', 'solved.png']) {
      const rel = `${normalizedFolder}/${file}`;
      const p = path.resolve(ROOT, rel);
      try { await fs.access(p); } catch { missing.push(rel); }
    }
  }

  return missing;
}

/** Run remotion render via child process */
function runRender(props, outputPath, totalFrames) {
  return new Promise((resolve, reject) => {
    const propsJson = JSON.stringify(props);
    const cmd = 'npx';
    const cmdArgs = [
      'remotion', 'render',
      'LongFormEpisode',
      '--props', propsJson,
      '--output', outputPath,
      '--frames', `0-${totalFrames - 1}`,
      '--concurrency', '1',
    ];

    console.log(`\n  Rendering: ${path.basename(outputPath)}`);
    console.log(`  Total frames: ${totalFrames} (${(totalFrames / 30 / 60).toFixed(1)} min @ 30fps)`);
    console.log(`  Command: npx remotion render LongFormEpisode --output ${path.basename(outputPath)}\n`);

    const proc = spawn(cmd, cmdArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Remotion render exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function main() {
  const episodeDir = resolveEpisodeDir(epArg);
  const episodePath = path.join(episodeDir, 'episode.json');

  // Load episode.json
  let episode;
  try {
    episode = JSON.parse(await fs.readFile(episodePath, 'utf-8'));
  } catch {
    console.error(`Error: episode.json not found at ${episodePath}`);
    console.error('Run: node scripts/generate-longform-brief.mjs first');
    process.exit(1);
  }

  console.log(`\n  Long-Form Render`);
  console.log(`  Episode: ${episode.title} (ep${episode.episodeNumber})`);
  console.log(`  Format: ${episode.format}`);
  console.log(`  Story slides: ${episode.storySlides?.length || 0}`);
  console.log(`  Activities: ${(episode.activities || []).map(a => a.type).join(' → ')}`);

  // Validate images
  const missing = await validateImages(episode);
  if (missing.length > 0) {
    console.warn(`\n  ⚠ ${missing.length} image(s) not found (will render as blank frames):`);
    for (const m of missing) console.warn(`    ✗ ${m}`);
    if (!DRY_RUN) {
      console.warn('\n  Generate missing images then re-run. Or use --dry-run to check props only.');
      // Continue anyway — Remotion will show blank for missing images
    }
  } else {
    console.log(`\n  All ${episode.storySlides?.length || 0} story + ${(episode.activities || []).length * 2} activity images found ✓`);
  }

  const totalFrames = calculateTotalFrames(episode);
  const totalMin = (totalFrames / 30 / 60).toFixed(1);
  console.log(`  Total duration: ~${totalMin} min (${totalFrames} frames)`);

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Props that would be passed to Remotion:');
    console.log(JSON.stringify({ episode }, null, 2).slice(0, 800) + '\n  ...');
    return;
  }

  // Output path
  const today = new Date().toISOString().slice(0, 10);
  const epSlug = path.basename(episodeDir);
  const outputFile = `longform-${today}-${epSlug}.mp4`;
  const outputPath = path.join(ROOT, 'output', 'videos', outputFile);

  await fs.mkdir(path.join(ROOT, 'output', 'videos'), { recursive: true });

  await runRender({ episode }, outputPath, totalFrames);

  console.log(`\n  Done. Output: output/videos/${outputFile}`);
  console.log('  Upload to YouTube (standard) and TikTok (series).\n');
}

main().catch(err => { console.error(err.message); process.exit(1); });

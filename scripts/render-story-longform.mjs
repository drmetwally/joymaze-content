#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { fileURLToPath } from 'url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FPS = 30;
const HOOK_FRAMES = 210;   // 7s — matches StoryLongFormEpisode
const BRIDGE_FRAMES = 450;
const ACTIVITY_FRAMES = 2700;
const OUTRO_FRAMES = 240;  // 8s — matches StoryLongFormEpisode
const CTA_FRAMES = 600;    // 20s — optional YouTube CTA (episode.includeCta)
const DEFAULT_SCENE_FRAMES = 180; // 6s minimum

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const CROP_VERTICAL = args.includes('--crop-vertical');

const format = (() => {
  const index = args.indexOf('--format');
  return index !== -1 ? args[index + 1] : 'story';
})();

// horizontal = 1920×1080 (YouTube long-form, default)
// vertical   = 1080×1920 (TikTok Series)
const orientation = (() => {
  const index = args.indexOf('--orientation');
  return index !== -1 ? args[index + 1] : 'horizontal';
})();

const episodeArg = (() => {
  const index = args.indexOf('--episode');
  return index !== -1 ? args[index + 1] : null;
})();

if (!['story', 'animal', 'puzzle-compilation'].includes(format)) {
  console.error('Usage: --format story|animal|puzzle-compilation');
  process.exit(1);
}

if (!['horizontal', 'vertical'].includes(orientation)) {
  console.error('Usage: --orientation horizontal|vertical');
  process.exit(1);
}

if (!episodeArg) {
  console.error('Usage: node scripts/render-story-longform.mjs --episode output/longform/<format>/ep01-slug [--format story|animal] [--orientation horizontal|vertical] [--crop-vertical]');
  process.exit(1);
}

function resolveEpisodeDir(arg) {
  if (path.isAbsolute(arg) || arg.startsWith('output/') || arg.startsWith('output\\') || arg.includes(':\\')) {
    return path.resolve(ROOT, arg);
  }
  const subDir = format === 'animal' ? 'animal' : 'story';
  return path.join(ROOT, 'output', 'longform', subDir, arg);
}

function resolveEpisodeAsset(episodeDir, assetPath) {
  if (!assetPath) return '';
  if (path.isAbsolute(assetPath) || assetPath.includes(':\\')) return assetPath;
  return path.join(episodeDir, assetPath);
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function loadEpisode(episodeDir) {
  const episodePath = path.join(episodeDir, 'episode.json');
  const raw = await fs.readFile(episodePath, 'utf-8');
  return JSON.parse(raw);
}

async function writeEpisode(episodeDir, episode) {
  const episodePath = path.join(episodeDir, 'episode.json');
  await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`);
}

function getSceneRefs(episode) {
  return (episode.acts || [])
    .flatMap((act) => (act.scenes || []).map((scene) => ({ act, scene })))
    .sort((a, b) => (a.scene.sceneIndex ?? 0) - (b.scene.sceneIndex ?? 0));
}

// Auto-detect scene images by convention when imagePath is empty.
// Tries: 01.png, 02.png ... (primary) and scene-01.png, scene-02.png ... (legacy)
async function autoFillImagePaths(episodeDir, episode) {
  let filled = 0;
  for (const { scene } of getSceneRefs(episode)) {
    if (scene.imagePath) continue;
    const idx = String(scene.sceneIndex ?? 0).padStart(2, '0');
    const candidates = [`${idx}.png`, `scene-${idx}.png`];
    for (const candidate of candidates) {
      if (await fileExists(path.join(episodeDir, candidate))) {
        scene.imagePath = candidate;
        filled++;
        break;
      }
    }
  }
  if (filled > 0) {
    await writeEpisode(episodeDir, episode);
    console.log(`Auto-filled ${filled} imagePath field(s) from convention files.`);
  }
}

// Auto-detect animated clips by convention when animatedClip is empty.
// Naming: 01.mp4 = clip for scene 01, generated using 01.png (start) + 02.png (end) in Kling/Flow.
async function resolveSfxPaths(episode) {
  let sfxLibrary = null;
  try {
    const raw = await fs.readFile(path.join(ROOT, 'config', 'sfx-library.json'), 'utf-8');
    sfxLibrary = JSON.parse(raw);
  } catch {
    return;
  }

  let resolved = 0;
  for (const { scene } of getSceneRefs(episode)) {
    const tag = scene.sfxTag;
    if (!tag) continue;
    const entry = sfxLibrary.tags?.[tag];
    if (!entry?.file) continue;
    if (await fileExists(path.join(ROOT, entry.file))) {
      scene.sfxFile = entry.file;
      scene.sfxVolume = entry.volume ?? 0.25;
      resolved++;
    } else {
      console.log(`  SFX: "${entry.file}" not found — scene ${scene.sceneIndex} plays without SFX.`);
    }
  }
  if (resolved > 0) console.log(`  SFX: resolved ${resolved} scene(s) from library.`);
}

async function autoFillAnimatedClips(episodeDir, episode) {
  let filled = 0;
  for (const { scene } of getSceneRefs(episode)) {
    if (scene.animatedClip) continue;
    const idx = String(scene.sceneIndex ?? 0).padStart(2, '0');
    const candidate = `${idx}.mp4`;
    if (await fileExists(path.join(episodeDir, candidate))) {
      scene.animatedClip = candidate;
      filled++;
    }
  }
  if (filled > 0) {
    await writeEpisode(episodeDir, episode);
    console.log(`Auto-filled ${filled} animatedClip field(s) from convention files.`);
  }
}

const SHARED_AUDIO_DIR = path.join(ROOT, 'assets', 'audio');
const EPISODE_MUSIC_FILES = ['background.mp3', 'hook-jingle.mp3', 'outro-jingle.mp3'];

async function resolveSharedAudio(file) {
  const sharedPath = path.join(SHARED_AUDIO_DIR, file);
  return (await fileExists(sharedPath)) ? sharedPath : null;
}

async function validateAssets(episodeDir, episode) {
  const warnings = [];
  const infos = [];
  const scenes = getSceneRefs(episode);

  for (const { scene } of scenes) {
    const sceneNumber = String(scene.sceneIndex ?? 0).padStart(2, '0');
    const imagePath = resolveEpisodeAsset(episodeDir, scene.imagePath || '');
    const narrationPath = resolveEpisodeAsset(episodeDir, scene.narrationFile || '');
    const animatedPath = resolveEpisodeAsset(episodeDir, scene.animatedClip || '');

    if (!scene.imagePath || !(await fileExists(imagePath))) {
      warnings.push(`Scene ${sceneNumber}: imagePath missing (${scene.imagePath || '(empty)'})`);
    }

    if (!scene.narrationFile || !(await fileExists(narrationPath))) {
      warnings.push(`Scene ${sceneNumber}: narrationFile missing (${scene.narrationFile || '(empty)'})`);
    }

    if (!scene.animatedClip || !(await fileExists(animatedPath))) {
      infos.push(`Scene ${sceneNumber}: no animatedClip — will use Ken Burns fallback`);
    }
  }

  for (const file of EPISODE_MUSIC_FILES) {
    const inEpisode = await fileExists(path.join(episodeDir, file));
    const inShared = !inEpisode ? await resolveSharedAudio(file) : null;
    if (!inEpisode && !inShared) {
      warnings.push(`${file} missing (not in episode folder or assets/audio/)`);
    } else if (!inEpisode && inShared) {
      infos.push(`${file} — using shared fallback from assets/audio/`);
    }
  }

  return { warnings, infos };
}

function calculateTotalFrames(episode) {
  const scenes = (episode.acts || []).flatMap((act) => act.scenes || []);
  const sceneFrames = scenes.reduce((sum, scene) => {
    const sec = Number(scene.durationSec);
    const frames = Number.isFinite(sec) && sec > 0 ? Math.round(sec * FPS) : DEFAULT_SCENE_FRAMES;
    return sum + Math.max(frames, DEFAULT_SCENE_FRAMES);
  }, 0);

  const activityEnabled = typeof episode.activityFolder === 'string' && episode.activityFolder.trim().length > 0;

  return HOOK_FRAMES
    + sceneFrames
    + (activityEnabled ? BRIDGE_FRAMES + ACTIVITY_FRAMES : 0)
    + OUTRO_FRAMES
    + (episode.includeCta ? CTA_FRAMES : 0);
}

function printValidationResults(warnings, infos) {
  if (warnings.length === 0 && infos.length === 0) {
    console.log('Validation: no missing assets detected.');
    return;
  }
  for (const warning of warnings) console.log(`Warning: ${warning}`);
  for (const infoMessage of infos) console.log(`Info: ${infoMessage}`);
}

async function confirmProceed() {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question('Missing assets detected. Proceed anyway? [y/N]: ');
    return answer === 'y' || answer === 'Y';
  } finally {
    rl.close();
  }
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

// Build .remotion-public with copies (no symlinks — avoids Windows EPERM).
// Assets are served from there by the Remotion dev server during render.
// Music fallback: if a music file is missing from the episode folder, copy it from
// assets/audio/ into the episode's public slot so Remotion can serve it unchanged.
async function preparePublicDir(episodeDir) {
  const publicDir = path.join(ROOT, '.remotion-public');
  await fs.mkdir(publicDir, { recursive: true });

  const assetsDir = path.join(ROOT, 'assets');
  if (await fileExists(assetsDir)) {
    await copyDir(assetsDir, path.join(publicDir, 'assets'));
  }

  const relativeEpisode = path.relative(ROOT, episodeDir).replace(/\\/g, '/');
  await copyDir(episodeDir, path.join(publicDir, relativeEpisode));

  // Fill missing music files from shared assets/audio/ pool
  const episodePublicDir = path.join(publicDir, relativeEpisode);
  let sharedFilled = 0;
  for (const file of EPISODE_MUSIC_FILES) {
    const dest = path.join(episodePublicDir, file);
    if (!(await fileExists(dest))) {
      const src = await resolveSharedAudio(file);
      if (src) {
        await fs.copyFile(src, dest);
        sharedFilled++;
      }
    }
  }
  if (sharedFilled > 0) {
    console.log(`  Audio: filled ${sharedFilled} music file(s) from assets/audio/ shared pool.`);
  }

  return { publicDir, relativeEpisodeFolder: relativeEpisode };
}

// ─── Animal Facts constants (must match AnimalFactsEpisode.jsx) ───────────────
const ANIMAL_FPS                 = 30;
const ANIMAL_HOOK_FRAMES         = 240; // 8s
const ANIMAL_NAME_REVEAL_FRAMES  = 150; // 5s
const ANIMAL_TITLE_CARD_FRAMES   =  45; // 1.5s per fact
const ANIMAL_SUNG_RECAP_FRAMES   = 900; // 30s
const ANIMAL_ACTIVITY_FRAMES     = 900;
const ANIMAL_OUTRO_FRAMES        = 150; // 5s
const ANIMAL_FACT_KEYS           = ['fact1', 'fact2', 'fact3', 'fact4', 'fact5'];

const ANIMAL_IMAGES    = ['namereveal.png', 'fact1.png', 'fact2.png', 'fact3.png', 'fact4.png', 'fact5.png'];
const ANIMAL_NARRATION = [
  'narration-hook.mp3', 'narration-namereveal.mp3',
  'narration-fact1.mp3', 'narration-fact2.mp3', 'narration-fact3.mp3',
  'narration-fact4.mp3', 'narration-fact5.mp3',
  'narration-outro-cta.mp3',
];
const ANIMAL_EP_MUSIC  = ['background.mp3', 'sung-recap.mp3'];
const ANIMAL_SHR_MUSIC = ['hook-jingle.mp3', 'outro-jingle.mp3'];

function segFrames(episode, key, fallbackSec = 16) {
  return Math.round(((episode[key]?.durationSec) || fallbackSec) * ANIMAL_FPS);
}

function calculateTotalFramesAnimal(episode) {
  const activityEnabled = typeof episode.activityFolder === 'string' && episode.activityFolder.trim().length > 0;
  const factFrames = ANIMAL_FACT_KEYS.reduce(
    (sum, key) => sum + ANIMAL_TITLE_CARD_FRAMES + segFrames(episode, key),
    0,
  );
  return ANIMAL_HOOK_FRAMES + ANIMAL_NAME_REVEAL_FRAMES
    + factFrames
    + ANIMAL_SUNG_RECAP_FRAMES
    + (activityEnabled ? ANIMAL_ACTIVITY_FRAMES : 0)
    + ANIMAL_OUTRO_FRAMES;
}

// Spawns download-broll.mjs and waits — stdio passes through so progress is visible
function runBrollDownload(episodeDir) {
  return new Promise((resolve, reject) => {
    const relativePath = path.relative(ROOT, episodeDir).replace(/\\/g, '/');
    const child = spawn(
      process.execPath,
      [path.join(ROOT, 'scripts', 'download-broll.mjs'), '--episode', relativePath],
      { stdio: 'inherit', env: process.env },
    );
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`B-roll download exited ${code}`))));
    child.on('error', reject);
  });
}

async function validateAssetsAnimal(episodeDir) {
  const warnings = [];
  const infos = [];

  for (const img of ANIMAL_IMAGES) {
    if (!(await fileExists(path.join(episodeDir, img)))) {
      warnings.push(`Missing image: ${img}`);
    }
  }

  for (const nar of ANIMAL_NARRATION) {
    if (!(await fileExists(path.join(episodeDir, nar)))) {
      warnings.push(`Missing narration: ${nar}`);
    }
  }

  for (const file of ANIMAL_EP_MUSIC) {
    if (!(await fileExists(path.join(episodeDir, file)))) {
      warnings.push(`Missing audio: ${file} (episode-specific — drop into episode folder)`);
    }
  }

  for (const file of ANIMAL_SHR_MUSIC) {
    const inEpisode = await fileExists(path.join(episodeDir, file));
    const inShared = !inEpisode ? await resolveSharedAudio(file) : null;
    if (!inEpisode && !inShared) {
      warnings.push(`${file} missing (not in episode folder or assets/audio/)`);
    } else if (!inEpisode && inShared) {
      infos.push(`${file} — using shared fallback from assets/audio/`);
    }
  }

  return { warnings, infos };
}

// Center-crop horizontal 1920×1080 → vertical 1080×1920.
// Crops the center 608px width (= 1080 * 9/16), then scales to 1080×1920.
async function cropToVertical(horizontalMp4, episodeSlug) {
  const verticalMp4 = path.join(path.dirname(horizontalMp4), `${episodeSlug}_v.mp4`);
  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-i', horizontalMp4,
      '-vf', 'crop=608:1080:(iw-608)/2:0,scale=1080:1920',
      '-c:a', 'copy',
      verticalMp4,
    ]);
    ff.stderr.on('data', () => {});
    ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg crop exited ${code}`)));
  });
  return verticalMp4;
}

async function main() {
  const episodeDir = resolveEpisodeDir(episodeArg);
  const episode = await loadEpisode(episodeDir);

  const episodeSlug = `ep${String(episode.episodeNumber).padStart(2, '0')}-${episode.slug}`;
  const orientationSuffix = orientation === 'vertical' ? '_v' : '_h';
  let warnings, infos, totalFrames, compositionId, outputMp4;

  if (format === 'animal') {
    // Auto-download B-roll if not yet done for this episode
    const brollCount = Object.keys(episode.brollClips || {}).length;
    if (brollCount === 0) {
      console.log('\n  B-roll: not downloaded yet — running Pexels fetch now...');
      await runBrollDownload(episodeDir);
      Object.assign(episode, await loadEpisode(episodeDir)); // reload with updated brollClips
    } else {
      console.log(`  B-roll: ${brollCount}/5 clips ready.`);
    }

    ({ warnings, infos } = await validateAssetsAnimal(episodeDir));
    totalFrames   = calculateTotalFramesAnimal(episode);
    compositionId = orientation === 'vertical' ? 'AnimalFactsEpisode' : 'AnimalFactsEpisodeH';
    outputMp4     = path.join(ROOT, 'output', 'longform', 'animal', episodeSlug, `${episodeSlug}${orientationSuffix}.mp4`);
  } else {
    await autoFillImagePaths(episodeDir, episode);
    await autoFillAnimatedClips(episodeDir, episode);
    await resolveSfxPaths(episode);
    ({ warnings, infos } = await validateAssets(episodeDir, episode));
    totalFrames   = calculateTotalFrames(episode);
    compositionId = orientation === 'vertical' ? 'StoryLongFormEpisode' : 'StoryLongFormEpisodeH';
    outputMp4     = path.join(ROOT, 'output', 'longform', 'story', episodeSlug, `${episodeSlug}${orientationSuffix}.mp4`);
  }

  console.log('\n  JoyMaze Longform Renderer');
  console.log(`  Episode: ${episodeDir}`);
  console.log(`  Format: ${format} | Orientation: ${orientation} (${orientation === 'horizontal' ? '1920×1080 YouTube' : '1080×1920 TikTok'})`);
  console.log(`  Composition: ${compositionId} | Frames: ${totalFrames} (${(totalFrames / FPS / 60).toFixed(1)} min)`);

  printValidationResults(warnings, infos);

  if (DRY_RUN) {
    console.log('Dry run complete. No files written.');
    return;
  }

  if (warnings.length > 0 && !FORCE) {
    const confirmed = await confirmProceed();
    if (!confirmed) {
      console.log('Aborting.');
      return;
    }
  }

  console.log('  Preparing public dir (copying assets)...');
  const { publicDir, relativeEpisodeFolder } = await preparePublicDir(episodeDir);

  console.log('  Bundling...');
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, 'remotion', 'index.jsx'),
    publicDir,
    webpackOverride: (config) => config,
  });

  const inputProps = { episodeFolder: relativeEpisodeFolder, episode };
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });
  composition.durationInFrames = totalFrames;

  await fs.mkdir(path.dirname(outputMp4), { recursive: true });

  console.log('  Rendering...');
  let lastPct = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outputMp4,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct !== lastPct) {
        process.stdout.write(`\r  Progress: ${pct}%   `);
        lastPct = pct;
      }
    },
  });

  console.log(`\n  Render complete: ${outputMp4}`);

  if (CROP_VERTICAL && orientation === 'horizontal') {
    console.log('  Cropping to vertical 1080×1920...');
    const verticalMp4 = await cropToVertical(outputMp4, episodeSlug);
    console.log(`  Vertical output: ${verticalMp4}`);
  }

  episode.rendered = true;
  episode.renderedAt = new Date().toISOString();
  await writeEpisode(episodeDir, episode);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

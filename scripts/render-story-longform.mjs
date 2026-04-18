#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
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
const DEFAULT_SCENE_FRAMES = 180; // 6s minimum

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

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

if (format !== 'story') {
  console.log('Format not yet implemented');
  process.exit(0);
}

if (!episodeArg) {
  console.error('Usage: node scripts/render-story-longform.mjs --episode output/longform/story/ep01-slug');
  process.exit(1);
}

function resolveEpisodeDir(arg) {
  if (path.isAbsolute(arg) || arg.startsWith('output/') || arg.startsWith('output\\') || arg.includes(':\\')) {
    return path.resolve(ROOT, arg);
  }
  return path.join(ROOT, 'output', 'longform', 'story', arg);
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
    + OUTRO_FRAMES;
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

async function main() {
  const episodeDir = resolveEpisodeDir(episodeArg);
  const episode = await loadEpisode(episodeDir);
  await autoFillImagePaths(episodeDir, episode);
  await autoFillAnimatedClips(episodeDir, episode);
  await resolveSfxPaths(episode);
  const { warnings, infos } = await validateAssets(episodeDir, episode);
  const totalFrames = calculateTotalFrames(episode);

  const episodeSlug = `ep${String(episode.episodeNumber).padStart(2, '0')}-${episode.slug}`;
  const orientationSuffix = orientation === 'vertical' ? '_v' : '_h';
  const compositionId = orientation === 'vertical' ? 'StoryLongFormEpisode' : 'StoryLongFormEpisodeH';
  const outputMp4 = path.join(ROOT, 'output', 'longform', 'story', episodeSlug, `${episodeSlug}${orientationSuffix}.mp4`);

  console.log('\n  JoyMaze Story Longform Renderer');
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
  episode.rendered = true;
  episode.renderedAt = new Date().toISOString();
  await writeEpisode(episodeDir, episode);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

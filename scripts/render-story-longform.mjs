#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FPS = 30;
const HOOK_FRAMES = 600;
const BRIDGE_FRAMES = 450;
const ACTIVITY_FRAMES = 2700;
const OUTRO_FRAMES = 600;
const DEFAULT_SCENE_FRAMES = 120;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

const format = (() => {
  const index = args.indexOf('--format');
  return index !== -1 ? args[index + 1] : 'story';
})();

const episodeArg = (() => {
  const index = args.indexOf('--episode');
  return index !== -1 ? args[index + 1] : null;
})();

if (!['story', 'animal', 'puzzle-compilation'].includes(format)) {
  console.error('Usage: --format story|animal|puzzle-compilation');
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
  if (!assetPath) {
    return '';
  }

  if (path.isAbsolute(assetPath) || assetPath.includes(':\\')) {
    return assetPath;
  }

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

  const backgroundPath = path.join(episodeDir, 'background.mp3');
  const hookJinglePath = path.join(episodeDir, 'hook-jingle.mp3');
  const outroJinglePath = path.join(episodeDir, 'outro-jingle.mp3');

  if (!(await fileExists(backgroundPath))) {
    warnings.push('background.mp3 missing');
  }

  if (!(await fileExists(hookJinglePath))) {
    warnings.push('hook-jingle.mp3 missing');
  }

  if (!(await fileExists(outroJinglePath))) {
    warnings.push('outro-jingle.mp3 missing');
  }

  return { warnings, infos };
}

function calculateTotalFrames(episode) {
  const sceneFrames = (episode.acts || [])
    .flatMap((act) => act.scenes || [])
    .reduce((sum, scene) => {
      const sec = Number(scene.durationSec);
      return sum + (Number.isFinite(sec) && sec > 0 ? Math.round(sec * FPS) : DEFAULT_SCENE_FRAMES);
    }, 0);

  const activityEnabled = typeof episode.activityFolder === 'string' && episode.activityFolder.trim().length > 0;

  return HOOK_FRAMES
    + sceneFrames
    + (activityEnabled ? BRIDGE_FRAMES + ACTIVITY_FRAMES : 0)
    + OUTRO_FRAMES;
}

function buildRenderCommand(episodeDir, episode, totalFrames) {
  const episodeSlug = `ep${String(episode.episodeNumber).padStart(2, '0')}-${episode.slug}`;
  const outputMp4 = `output/longform/story/${episodeSlug}/${episodeSlug}.mp4`;
  const inputProps = {
    episodeFolder: episodeDir,
    episode,
  };

  const cmd = `npx remotion render StoryLongFormEpisode --props='${JSON.stringify(inputProps)}' --output=${outputMp4} --frames=1-${totalFrames}`;
  return { cmd, outputMp4 };
}

function printValidationResults(warnings, infos) {
  if (warnings.length === 0 && infos.length === 0) {
    console.log('Validation: no missing assets detected.');
    return;
  }

  for (const warning of warnings) {
    console.log(`Warning: ${warning}`);
  }

  for (const infoMessage of infos) {
    console.log(`Info: ${infoMessage}`);
  }
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

async function main() {
  const episodeDir = resolveEpisodeDir(episodeArg);
  const episode = await loadEpisode(episodeDir);
  const { warnings, infos } = await validateAssets(episodeDir, episode);
  const totalFrames = calculateTotalFrames(episode);
  const { cmd, outputMp4 } = buildRenderCommand(episodeDir, episode, totalFrames);

  console.log('\n  JoyMaze Story Longform Renderer');
  console.log(`  Episode: ${episodeDir}`);
  console.log(`  Format: ${format}`);

  printValidationResults(warnings, infos);

  if (DRY_RUN) {
    console.log(`Total frames: ${totalFrames} (${(totalFrames / FPS / 60).toFixed(1)} min)`);
    console.log('Render command:');
    console.log(cmd);
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

  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  } catch (error) {
    console.error(`Render failed: ${error.message}`);
    process.exit(1);
  }

  episode.rendered = true;
  episode.renderedAt = new Date().toISOString();
  await writeEpisode(episodeDir, episode);
  console.log(`Render complete: ${outputMp4}`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

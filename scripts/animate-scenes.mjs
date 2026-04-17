#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';
const RUNWAY_API_VERSION = '2024-11-06';
const RUNWAY_MODEL = 'gen3a_turbo';
const RUNWAY_RATIO = '768:1344';
const RUNWAY_DURATION = 5;
const RUNWAY_POLL_MS = 5000;
const RUNWAY_TIMEOUT_MS = 120 * 1000;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const episodeArg = (() => {
  const index = args.indexOf('--episode');
  return index !== -1 ? args[index + 1] : null;
})();

const backend = (() => {
  const index = args.indexOf('--backend');
  return index !== -1 ? args[index + 1] : 'svd';
})();

if (!episodeArg) {
  console.error('Usage: node scripts/animate-scenes.mjs --episode output/longform/story/ep01-slug');
  process.exit(1);
}

if (!['svd', 'runway'].includes(backend)) {
  console.error('Usage: --backend runway');
  process.exit(1);
}

function resolveEpisodeDir(arg) {
  if (path.isAbsolute(arg) || arg.startsWith('output/') || arg.startsWith('output\\') || arg.includes(':\\')) {
    return path.resolve(ROOT, arg);
  }
  return path.join(ROOT, 'output', 'longform', 'story', arg);
}

async function loadEpisode(episodeDir) {
  const episodePath = path.join(episodeDir, 'episode.json');
  return JSON.parse(await fs.readFile(episodePath, 'utf-8'));
}

async function writeEpisode(episodeDir, episode) {
  const episodePath = path.join(episodeDir, 'episode.json');
  await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`);
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getSceneRefs(episode) {
  return (episode.acts || [])
    .flatMap((act) => (act.scenes || []).map((scene) => ({ act, scene })))
    .sort((a, b) => (a.scene.sceneIndex ?? 0) - (b.scene.sceneIndex ?? 0));
}

function normalizeRelativeFile(filePath, fallbackName) {
  const normalized = (filePath && filePath.trim()) || fallbackName;
  return normalized.replace(/\\/g, '/');
}

function quoteShellArg(value) {
  return `"${String(value).replace(/(["\\])/g, '\\$1')}"`;
}

function buildSvdCommand(imagePath, outputPath) {
  return [
    'python scripts/setup/run-svd.py',
    `--input ${quoteShellArg(imagePath)}`,
    `--output ${quoteShellArg(outputPath)}`,
    '--frames 25',
    '--fps 8',
  ].join(' ');
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  return 'image/png';
}

async function buildDataUri(filePath) {
  const buffer = await fs.readFile(filePath);
  return `data:${getMimeType(filePath)};base64,${buffer.toString('base64')}`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Runway request failed (${response.status}): ${text}`);
  }
  return response.json();
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRunwayTask(taskId, apiKey) {
  const deadline = Date.now() + RUNWAY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const task = await fetchJson(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': RUNWAY_API_VERSION,
      },
    });

    if (task.status === 'SUCCEEDED') {
      return task;
    }

    if (task.status === 'FAILED' || task.status === 'CANCELLED') {
      throw new Error(`Runway task ${taskId} ended with status ${task.status}.`);
    }

    await sleep(RUNWAY_POLL_MS);
  }

  throw new Error(`Runway task ${taskId} timed out after ${RUNWAY_TIMEOUT_MS}ms.`);
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Runway output (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
}

async function renderWithRunway(scene, imagePath, outputPath) {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    throw new Error('RUNWAY_API_KEY is missing.');
  }

  const promptImage = await buildDataUri(imagePath);
  const createdTask = await fetchJson(`${RUNWAY_API_BASE}/image_to_video`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': RUNWAY_API_VERSION,
    },
    body: JSON.stringify({
      model: RUNWAY_MODEL,
      promptImage,
      promptText: scene.imagePromptHint || 'Gentle motion, preserve composition, portrait framing.',
      duration: RUNWAY_DURATION,
      ratio: RUNWAY_RATIO,
    }),
  });

  const completedTask = await waitForRunwayTask(createdTask.id, apiKey);
  const outputUrl = Array.isArray(completedTask.output) ? completedTask.output[0] : null;

  if (!outputUrl) {
    throw new Error(`Runway task ${createdTask.id} completed without an output URL.`);
  }

  await downloadFile(outputUrl, outputPath);
}

async function animateScene(scene, imagePath, outputPath) {
  if (backend === 'runway') {
    await renderWithRunway(scene, imagePath, outputPath);
    return 'runway';
  }

  const svdCommand = buildSvdCommand(imagePath, outputPath);

  try {
    execSync(svdCommand, { cwd: ROOT, stdio: 'inherit' });
    return 'svd';
  } catch (error) {
    const runwayKey = process.env.RUNWAY_API_KEY;
    if (!runwayKey) {
      throw new Error('SVD failed and RUNWAY_API_KEY is missing.');
    }

    await renderWithRunway(scene, imagePath, outputPath);
    return 'runway';
  }
}

async function main() {
  const episodeDir = resolveEpisodeDir(episodeArg);
  const episode = await loadEpisode(episodeDir);
  const scenes = getSceneRefs(episode);

  if (scenes.length === 0) {
    throw new Error('No scenes found in episode.json.');
  }

  console.log('\n  JoyMaze Scene Animator');
  console.log(`  Episode: ${episodeDir}`);
  console.log(`  Scenes: ${scenes.length}`);
  console.log(`  Backend: ${backend}`);

  for (let index = 0; index < scenes.length; index += 1) {
    const { scene } = scenes[index];
    const progress = `Scene ${String(index + 1).padStart(2, '0')}/${String(scenes.length).padStart(2, '0')}`;
    const imageRelative = scene.imagePath ? scene.imagePath.replace(/\\/g, '/') : '';
    const outputRelative = normalizeRelativeFile(
      scene.animatedClip,
      `scene-${String(scene.sceneIndex).padStart(2, '0')}.mp4`,
    );
    const imagePath = imageRelative ? path.join(episodeDir, imageRelative) : '';
    const outputPath = path.join(episodeDir, outputRelative);
    const outputExists = await fileExists(outputPath);

    console.log(`  ${progress}: ${scene.imagePromptHint || `scene ${scene.sceneIndex}`}`);

    if (scene.animatedClip && outputExists) {
      console.log(`    Skip: ${outputRelative} already exists.`);
      continue;
    }

    if (!imageRelative) {
      console.warn('    Warning: imagePath is empty. Skipping scene.');
      scene.animatedClip = '';
      continue;
    }

    if (!(await fileExists(imagePath))) {
      console.warn(`    Warning: image file missing (${imageRelative}). Skipping scene.`);
      scene.animatedClip = '';
      continue;
    }

    if (DRY_RUN) {
      if (backend === 'runway') {
        console.log(`    Image: ${imageRelative}`);
        console.log(`    Target: ${outputPath}`);
        console.log('    Would call Runway image_to_video.');
      } else {
        console.log(`    Image: ${imageRelative}`);
        console.log(`    Target: ${outputPath}`);
        console.log(`    Would run: ${buildSvdCommand(imagePath, outputPath)}`);
        console.log('    Would fall back to Runway if SVD fails and RUNWAY_API_KEY is set.');
      }
      continue;
    }

    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const usedBackend = await animateScene(scene, imagePath, outputPath);
      scene.animatedClip = outputRelative;
      await writeEpisode(episodeDir, episode);
      console.log(`    Wrote: ${outputRelative} (${usedBackend})`);
    } catch (error) {
      scene.animatedClip = '';
      console.warn(`    Warning: ${error.message}`);
      if (backend !== 'runway' && !process.env.RUNWAY_API_KEY) {
        console.warn('    Warning: partial animation is better than full failure; scene left unanimated.');
      }
    }
  }

  if (DRY_RUN) {
    console.log('\n  Dry run complete. No files written.');
    return;
  }

  console.log('\n  Scene animation complete.');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

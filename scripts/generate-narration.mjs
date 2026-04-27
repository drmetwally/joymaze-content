#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFile as parseAudioFile } from 'music-metadata';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const episodeArg = (() => {
  const index = args.indexOf('--episode');
  return index !== -1 ? args[index + 1] : null;
})();

if (!episodeArg) {
  console.error('Usage: node scripts/generate-narration.mjs --episode output/longform/story/ep01-slug');
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
  const raw = await fs.readFile(episodePath, 'utf-8');
  return JSON.parse(raw);
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getAudioDurationSec(filePath) {
  try {
    const meta = await parseAudioFile(filePath);
    return meta.format.duration ?? 0;
  } catch {
    return 0;
  }
}

async function generateNarration(text, outputPath) {
  const response = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: 'shimmer', // warm, gentle storyteller — better for children's narrative than nova
    input: text,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

async function main() {
  const episodeDir = resolveEpisodeDir(episodeArg);
  const episode = await loadEpisode(episodeDir);
  const scenes = getSceneRefs(episode);

  if (scenes.length === 0) {
    throw new Error('No scenes found in episode.json.');
  }

  console.log('\n  JoyMaze Longform Narration Generator');
  console.log(`  Episode: ${episodeDir}`);
  console.log(`  Scenes: ${scenes.length}`);

  for (let index = 0; index < scenes.length; index += 1) {
    const { scene } = scenes[index];
    const progress = `Scene ${String(index + 1).padStart(2, '0')}/${String(scenes.length).padStart(2, '0')}`;
    const defaultFile = `narration-scene-${String(scene.sceneIndex).padStart(2, '0')}.mp3`;
    const relativeFile = (scene.narrationFile && scene.narrationFile.trim()) || defaultFile;
    const normalizedRelativeFile = relativeFile.replace(/\\/g, '/');
    const outputPath = path.join(episodeDir, normalizedRelativeFile);

    console.log(`  ${progress}: ${scene.narration}`);

    try {
      const fileOnDisk = await fileExists(outputPath);

      if (scene.narrationFile && fileOnDisk) {
        if (!DRY_RUN && (scene.durationSec === 15 || !scene.durationSec)) {
          const audioDuration = await getAudioDurationSec(outputPath);
          if (audioDuration > 0) {
            scene.durationSec = Math.max(7.0, Math.round((audioDuration + 2.5) * 10) / 10);
            await writeEpisode(episodeDir, episode);
            console.log(`    Skip (duration updated): ${normalizedRelativeFile} → scene ${scene.durationSec}s`);
            continue;
          }
        }
        console.log(`    Skip: ${normalizedRelativeFile} already exists.`);
        continue;
      }

      if (!scene.narrationFile && fileOnDisk) {
        if (!DRY_RUN) {
          scene.narrationFile = normalizedRelativeFile;
          const audioDuration = await getAudioDurationSec(outputPath);
          if (audioDuration > 0) scene.durationSec = Math.max(7.0, Math.round((audioDuration + 2.5) * 10) / 10);
          await writeEpisode(episodeDir, episode);
        }
        console.log(`    Reusing existing file: ${normalizedRelativeFile}`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`    Target: ${outputPath}`);
        continue;
      }

      await generateNarration(scene.narration, outputPath);
      scene.narrationFile = normalizedRelativeFile;
      const audioDuration = await getAudioDurationSec(outputPath);
      if (audioDuration > 0) {
        scene.durationSec = Math.max(7.0, Math.round((audioDuration + 2.5) * 10) / 10); // 2s tail after narration ends
      }
      await writeEpisode(episodeDir, episode);
      console.log(`    Wrote: ${normalizedRelativeFile} (${audioDuration > 0 ? `${audioDuration.toFixed(1)}s audio → scene ${scene.durationSec}s` : 'duration unknown'})`);
    } catch (error) {
      console.warn(`    Warning: ${error.message}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n  Dry run complete. No files written.');
    return;
  }

  console.log('\n  Narration generation complete.');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

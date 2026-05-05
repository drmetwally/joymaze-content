#!/usr/bin/env node

/**
 * generate-story-reel-audio.mjs
 * Generates TTS narration audio for Story Reel V2 slides.
 *
 * Reads narration text from story.json (slide.narration), generates a .wav clip
 * per reel slide via Kokoro (free, default) or OpenAI, and writes narrationPath
 * entries back into story.json so the Remotion render picks them up automatically.
 *
 * Output:
 *   output/stories/<epXX-slug>/
 *     tts/
 *       intro.wav              — "Episode N. Title."
 *       reel_01.wav, reel_02.wav, ...  — one per reel slide (in reel order)
 *   story.json updated with narrationPath per reel slide + introNarrationPath
 *
 * Usage:
 *   node scripts/generate-story-reel-audio.mjs --story ep12-the-kitten-who-lit-the-mother-s-garden
 *   node scripts/generate-story-reel-audio.mjs --story ep12-the-kitten-who-lit-the-mother-s-garden --tts kokoro
 *   node scripts/generate-story-reel-audio.mjs --story ep12-the-kitten-who-lit-the-mother-s-garden --dry-run
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const FORCE     = args.includes('--force');
const ttsIdx    = args.indexOf('--tts');
const TTS_PROVIDER = ttsIdx !== -1 ? args[ttsIdx + 1] : 'kokoro';
const storyIdx  = args.indexOf('--story');
const STORY_ARG = storyIdx !== -1 ? args[storyIdx + 1] : null;

if (!STORY_ARG) {
  console.error('Usage: node scripts/generate-story-reel-audio.mjs --story <folder> [--tts openai|kokoro] [--dry-run] [--force]');
  process.exit(1);
}
if (!['openai', 'kokoro'].includes(TTS_PROVIDER)) {
  console.error('Unknown --tts provider. Use "openai" or "kokoro".');
  process.exit(1);
}

// ── Resolve story folder ────────────────────────────────────────────────────
function resolveStoryDir(arg) {
  if (path.isAbsolute(arg) || arg.includes(':\\') || arg.startsWith('/')) {
    return path.resolve(arg);
  }
  return path.join(ROOT, 'output', 'stories', arg);
}

function buildDefaultReelSlideOrder(slides = []) {
  if (slides.length === 0) return [];
  if (slides.length <= 3) return slides.map((_, i) => i + 1);
  if (slides.length === 4) return [1, 2, 3, 4];
  return [1, 2, Math.round(slides.length / 2), slides.length - 1, slides.length];
}

// ── TTS providers ──────────────────────────────────────────────────────────
async function generateOpenAITTS(text, outputPath, speed = 0.75, voice = 'shimmer') {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.audio.speech.create({
    model: 'tts-1',
    voice,
    input: text,
    response_format: 'wav',
    speed,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

async function generateKokoroTTS(text, outputPath, speed = 1.0) {
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'cpu',
  });
  const audio = await tts.generate(text, { voice: 'af_bella', speed });
  await audio.save(outputPath);
}

// ── Audio duration via FFmpeg ───────────────────────────────────────────────
function getAudioDuration(audioPath) {
  try {
    const out = execSync(`ffmpeg -i "${audioPath}" -f null - 2>&1`, { timeout: 10000 });
    const match = out.toString().match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    return match ? +match[1] * 3600 + +match[2] * 60 + parseFloat(match[3]) : null;
  } catch (e) {
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const storyDir = resolveStoryDir(STORY_ARG);
  const storyPath = path.join(storyDir, 'story.json');

  const story = JSON.parse(await fs.readFile(storyPath, 'utf-8'));

  const rawSlides = story.slides ?? [];
  const reelOrder = Array.isArray(story.reelSlideOrder) && story.reelSlideOrder.length >= 5
    ? [...new Set(story.reelSlideOrder.map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 1 && n <= rawSlides.length))].slice(0, 5)
    : buildDefaultReelSlideOrder(rawSlides);
  const reelSlides = reelOrder.map(n => rawSlides[n - 1]).filter(Boolean);

  const ttsDir = path.join(storyDir, 'tts');
  await fs.mkdir(ttsDir, { recursive: true });

  const generateFn = TTS_PROVIDER === 'openai'
    ? (text, p) => generateOpenAITTS(text, p, 0.75, 'shimmer')
    : (text, p) => generateKokoroTTS(text, p, 1.0);
  const providerLabel = TTS_PROVIDER === 'openai' ? 'OpenAI TTS (shimmer)' : 'Kokoro TTS (af_bella)';

  console.log('\n=== JoyMaze Story Reel Audio Generator ===');
  console.log(`Story    : ${path.relative(ROOT, storyDir)}`);
  console.log(`Episode : ${story.episode} — ${story.title}`);
  console.log(`TTS     : ${providerLabel}`);
  console.log(`Reel    : slides ${reelOrder.join(', ')}`);
  console.log('');

  if (DRY_RUN) {
    console.log('--- DRY RUN: would generate ---');
    const introText = `Episode ${story.episode}. ${story.title}.`;
    console.log(`  Intro: "${introText}"`);
    reelSlides.forEach((slide, i) => {
      console.log(`  reel_${String(i + 1).padStart(2, '0')}.wav: "${slide.narration}"`);
    });
    console.log('--- END DRY RUN ---\n');
    return;
  }

  // Generate intro VO
  const introText = `Episode ${story.episode}. ${story.title}.`;
  const introPath = path.join(ttsDir, 'intro.wav');
  process.stdout.write(`  [Intro]: "${introText}"... `);
  await generateFn(introText, introPath);
  const introDur = await getAudioDuration(introPath);
  console.log(`done (${introDur ? introDur.toFixed(2) + 's' : '?'})`);

  // Generate per-slide reel narration
  const narrationMap = {};
  for (let i = 0; i < reelSlides.length; i++) {
    const slide = reelSlides[i];
    const clipPath = path.join(ttsDir, `reel_${String(i + 1).padStart(2, '0')}.wav`);
    const label = `Slide ${reelOrder[i]}`;
    process.stdout.write(`  ${label}: "${slide.narration}"... `);
    await generateFn(slide.narration, clipPath);
    const dur = await getAudioDuration(clipPath);
    console.log(`done (${dur ? dur.toFixed(2) + 's' : '?'})`);

    // Map back to the original slide index (1-based) using a repo-relative path
    // so Remotion can serve the generated audio from the copied publicDir bundle.
    narrationMap[reelOrder[i] - 1] = path.relative(ROOT, clipPath).replace(/\\/g, '/');

  }
  // Write narrationPath entries into story.json slides
  const updatedSlides = story.slides.map((slide, idx) => {
    if (narrationMap[idx] !== undefined) {
      return { ...slide, narrationPath: narrationMap[idx] };
    }
    return slide;
  });

  const updatedStory = {
    ...story,
    slides: updatedSlides,
    introNarrationPath: path.relative(ROOT, introPath).replace(/\\/g, '/'),
  };

  await fs.writeFile(storyPath, `${JSON.stringify(updatedStory, null, 2)}\n`);
  console.log(`\n  Updated story.json with narrationPath entries.`);
  console.log(`  Audio: ${path.relative(ROOT, ttsDir)}`);
  console.log('');
  console.log('  Next: run the scheduler — render-video.mjs will pick up narration automatically.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORIES_DIR = path.join(ROOT, 'output', 'stories');
const MODEL = 'imagen-4.0-generate-001';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const WIDTH = 1080;
const HEIGHT = 1920;

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] ?? null : null;
};
const hasFlag = (flag) => args.includes(flag);

const STORY_ARG = getArg('--story');
const DRY_RUN = hasFlag('--dry-run');
const FORCE = hasFlag('--force');
const ALL_SLIDES = hasFlag('--all');
const SLIDES_ARG = getArg('--slides');

function buildDefaultReelSlideOrder(slides = []) {
  const count = Array.isArray(slides) ? slides.length : 0;
  if (count <= 5) return Array.from({ length: count }, (_, i) => i + 1);
  const picks = count >= 8
    ? [1, 3, 5, Math.max(7, count - 1), count]
    : [1, 2, Math.max(3, Math.ceil(count / 2)), Math.max(Math.ceil(count / 2) + 1, count - 1), count];
  return [...new Set(picks)].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
}

function parseSlideList(value) {
  if (!value) return [];
  return [...new Set(value.split(',').map((part) => Number(part.trim())).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveStoryDir(storyArg) {
  if (!storyArg) {
    throw new Error('Missing required --story <folder|path|story.json>');
  }

  const direct = path.isAbsolute(storyArg) ? storyArg : path.resolve(ROOT, storyArg);
  const candidates = [
    direct,
    path.join(STORIES_DIR, storyArg),
    path.join(STORIES_DIR, storyArg, 'story.json'),
  ];

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue;
    const stat = await fs.stat(candidate);
    if (stat.isDirectory()) return candidate;
    if (stat.isFile() && path.basename(candidate).toLowerCase() === 'story.json') {
      return path.dirname(candidate);
    }
  }

  throw new Error(`Story path not found: ${storyArg}`);
}

function parsePromptMarkdown(markdown) {
  const entries = new Map();
  const regex = /## Slide (\d+) \(ACT .*?\)\s+\*\*Narration:\*\*[\s\S]*?\*\*Image prompt:\*\*\s+([\s\S]*?)(?=\n---\n|\n## Slide \d+ \(ACT |$)/g;
  for (const match of markdown.matchAll(regex)) {
    const slideNumber = Number(match[1]);
    const prompt = match[2].trim();
    entries.set(slideNumber, prompt);
  }
  return entries;
}

async function loadPromptMaps(storyDir) {
  const fullPath = path.join(storyDir, 'image-prompts.md');
  const reelPath = path.join(storyDir, 'reel-image-prompts.md');

  if (!(await pathExists(fullPath))) {
    throw new Error(`Missing prompt file: ${path.relative(ROOT, fullPath)}`);
  }

  const fullMarkdown = await fs.readFile(fullPath, 'utf8');
  const fullMap = parsePromptMarkdown(fullMarkdown);

  let reelMap = new Map();
  if (await pathExists(reelPath)) {
    const reelMarkdown = await fs.readFile(reelPath, 'utf8');
    reelMap = parsePromptMarkdown(reelMarkdown);
  }

  return { fullMap, reelMap, fullPath, reelPath };
}

function adaptPromptForImagen(prompt) {
  return prompt
    .replace(/Generate at 9:16 portrait ratio \(1080[×x]1920 pixels\)\./gi, 'Portrait composition, vertical framing.')
    .replace(/Generate at 9:16 portrait ratio\./gi, 'Portrait composition, vertical framing.')
    .trim();
}

function extractHeroClause(prompt) {
  const match = prompt.match(/([A-Z][a-zA-Z]+)\s*[—-]\s*([^—-]{12,220})\s*[—-]/);
  if (!match) return '';
  return `${match[1]} — ${match[2].trim()}`;
}

function buildImagenPrompt(prompt) {
  const adapted = adaptPromptForImagen(prompt);
  const heroClause = extractHeroClause(prompt);
  const heroGuard = heroClause
    ? `Important continuity rule: ${heroClause}. Render this named protagonist only as that exact non-human animal with the described visible body traits. No humans, no dolls, no mammal substitution, no species swap. `
    : 'Important continuity rule: keep the protagonist exactly as described, as a non-human animal only. No humans, dolls, mammal substitution, or species swap. ';
  return `Children's story illustration. No text, no logos, no watermark. ${heroGuard}The named protagonist must remain the first and dominant subject in frame. ${adapted}`;
}

async function generateWithImagen(prompt) {
  const apiKey = process.env.VERTEX_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Set VERTEX_API_KEY or GOOGLE_AI_API_KEY in .env');
  }

  const url = `${BASE_URL}/models/${MODEL}:predict?key=${apiKey}`;
  const body = {
    instances: [{ prompt: buildImagenPrompt(prompt) }],
    parameters: { sampleCount: 1 },
  };

  const MAX_ATTEMPTS = 3;
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`Retry attempt ${attempt}/${MAX_ATTEMPTS} for slide...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const raw = await res.text();
      const data = JSON.parse(raw || '{}');
      if (data.error) {
        throw new Error(`Imagen error ${data.error.code}: ${data.error.message}`);
      }

      const b64 = data.generatedImages?.[0]?.image?.imageBytes
        || data.predictions?.[0]?.bytesBase64Encoded
        || data.images?.[0]?.imageBytes;
      if (!b64) {
        throw new Error('Imagen did not return an image');
      }

      return Buffer.from(b64, 'base64');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function normalizeStoryImage(imageBuffer) {
  return sharp(imageBuffer)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
}

async function main() {
  const storyDir = await resolveStoryDir(STORY_ARG);
  const storyPath = path.join(storyDir, 'story.json');
  if (!(await pathExists(storyPath))) {
    throw new Error(`Missing story.json in ${storyDir}`);
  }

  const story = JSON.parse(await fs.readFile(storyPath, 'utf8'));
  const reelOrder = Array.isArray(story.reelSlideOrder) && story.reelSlideOrder.length
    ? story.reelSlideOrder
    : buildDefaultReelSlideOrder(story.slides || []);
  const explicitSlides = parseSlideList(SLIDES_ARG);
  const targetSlides = explicitSlides.length
    ? explicitSlides
    : ALL_SLIDES
      ? Array.from({ length: story.slides.length }, (_, i) => i + 1)
      : reelOrder;

  const { fullMap, reelMap, fullPath, reelPath } = await loadPromptMaps(storyDir);

  console.log('\n=== JoyMaze Story Reel Image Generator ===');
  console.log(`Story    : ${path.relative(ROOT, storyDir)}`);
  console.log(`Title    : ${story.title}`);
  console.log(`Mode     : ${ALL_SLIDES ? 'all slides' : explicitSlides.length ? 'custom slide list' : 'reel-first'}`);
  console.log(`Slides   : ${targetSlides.join(', ')}`);
  console.log(`Prompt   : ${reelMap.size > 0 && !ALL_SLIDES && !explicitSlides.length ? path.relative(ROOT, reelPath) : path.relative(ROOT, fullPath)}`);
  console.log(`Output   : ${WIDTH}x${HEIGHT} PNG`);
  if (DRY_RUN) console.log('Mode     : DRY RUN');
  console.log('');

  const generationLog = [];

  for (const slideNumber of targetSlides) {
    const slide = story.slides?.[slideNumber - 1];
    if (!slide) {
      throw new Error(`Slide ${slideNumber} not found in story.json`);
    }

    const prompt = reelMap.get(slideNumber) || fullMap.get(slideNumber);
    if (!prompt) {
      throw new Error(`No image prompt found for slide ${slideNumber}`);
    }

    const fileName = slide.image || `${String(slideNumber).padStart(2, '0')}.png`;
    const outPath = path.join(storyDir, fileName);
    const exists = await pathExists(outPath);

    if (exists && !FORCE) {
      console.log(`Skip slide ${String(slideNumber).padStart(2, '0')} -> ${fileName} (already exists)`);
      generationLog.push({ slide: slideNumber, file: fileName, status: 'skipped-existing' });
      continue;
    }

    console.log(`Slide ${String(slideNumber).padStart(2, '0')} -> ${fileName}`);
    console.log(`  Narration: "${slide.narration}"`);
    console.log(`  Prompt: ${prompt.slice(0, 140)}${prompt.length > 140 ? '...' : ''}`);

    if (DRY_RUN) {
      generationLog.push({ slide: slideNumber, file: fileName, status: exists ? 'would-overwrite' : 'would-generate' });
      continue;
    }

    const rawImage = await generateWithImagen(prompt);
    const normalized = await normalizeStoryImage(rawImage);
    await fs.writeFile(outPath, normalized);
    console.log(`  Saved ${fileName} (${Math.round(normalized.length / 1024)} KB)`);
    generationLog.push({ slide: slideNumber, file: fileName, status: 'generated', bytes: normalized.length });
  }

  const logPath = path.join(storyDir, '_reel-image-generation.json');
  if (!DRY_RUN) {
    await fs.writeFile(logPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      model: MODEL,
      mode: ALL_SLIDES ? 'all' : explicitSlides.length ? 'custom' : 'reel-first',
      targetSlides,
      files: generationLog,
    }, null, 2)}\n`);
  }

  console.log('');
  console.log(DRY_RUN ? 'Dry run complete.' : `Done. Log -> ${path.relative(ROOT, logPath)}`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

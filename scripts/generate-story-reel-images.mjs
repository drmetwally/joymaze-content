#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORIES_DIR = path.join(ROOT, 'output', 'stories');
const MODEL = 'imagen-4.0-fast-generate-001';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const WIDTH = 1024;
const HEIGHT = 1536;

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
const FALLBACK_MODE = getArg('--fallback') || 'none';
const CONTINUE_ON_ERROR = hasFlag('--continue-on-error') || FALLBACK_MODE !== 'none';

function buildDefaultReelSlideOrder(slides = []) {
  const count = Array.isArray(slides) ? slides.length : 0;
  if (count <= 5) return Array.from({ length: count }, (_, i) => i + 1);
  const picks = count >= 8
    ? [1, 3, 5, Math.max(7, count - 1), count]
    : [1, 2, Math.max(3, Math.ceil(count / 2)), Math.max(Math.ceil(count / 2) + 1, count - 1), count];
  return [...new Set(picks)].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
}

function getNarrationWordCount(slide) {
  return String(slide?.narration ?? slide?.caption ?? '').split(/\s+/).filter(Boolean).length;
}

function getAdaptiveReelTargetCount(slides = [], story = {}) {
  const count = Array.isArray(slides) ? slides.length : 0;
  if (count <= 5) return count;
  const totalWords = slides.reduce((sum, slide) => sum + getNarrationWordCount(slide), 0);
  const sourceType = String(story.storySourceType || '').toLowerCase();
  const isRealish = sourceType === 'real_behavior' || sourceType === 'true_story_style';
  let target = 5;
  if (totalWords >= 56) target += 1;
  if (totalWords >= 76) target += 1;
  if ((isRealish && totalWords >= 90) || totalWords >= 102) target += 1;
  return Math.max(5, Math.min(target, Math.min(count, 8)));
}

function buildDistributedSlideOrder(slides = [], targetCount = 5) {
  const count = Array.isArray(slides) ? slides.length : 0;
  if (count <= targetCount) return Array.from({ length: count }, (_, i) => i + 1);
  const picks = [];
  for (let i = 0; i < targetCount; i++) {
    picks.push(1 + Math.round((i * (count - 1)) / Math.max(targetCount - 1, 1)));
  }
  return [...new Set(picks)].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
}

function resolveAdaptiveReelSlideOrder(slides = [], story = {}) {
  const mode = String(story.reelSelectionMode || (Array.isArray(story.reelSlideOrder) && story.reelSlideOrder.length ? 'manual-lock' : 'copy-driven-adaptive')).toLowerCase();
  if (mode === 'manual-lock') {
    const candidateOrder = Array.isArray(story.reelSlideOrder)
      ? story.reelSlideOrder.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= slides.length)
      : [];
    return candidateOrder.length >= 5 ? [...new Set(candidateOrder)] : buildDefaultReelSlideOrder(slides);
  }
  return buildDistributedSlideOrder(slides, getAdaptiveReelTargetCount(slides, story));
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
    .replace(/Generate at 9:16 portrait ratio \(1080[×x]1920 pixels\)\./gi, 'Vertical portrait composition, safe reel framing, extra breathing room above and below the main subject.')
    .replace(/Generate at 9:16 portrait ratio\./gi, 'Vertical portrait composition, safe reel framing, extra breathing room above and below the main subject.')
    .trim();
}

function extractHeroClause(prompt) {
  const match = prompt.match(/([A-Z][a-zA-Z]+)\s*[—-]\s*([^—-]{12,220})\s*[—-]/);
  if (!match) return '';
  return `${match[1]} — ${match[2].trim()}`;
}

function extractStyleClause(prompt) {
  const sentences = prompt
    .split(/\.(?:\s+|$)/)
    .map((part) => part.trim())
    .filter(Boolean);

  const styleSentence = [...sentences].reverse().find((sentence) => /watercolor|paper grain|brush|gouache|pastel|storybook|illustration|pixar|3d|render|painted|cel[- ]shaded|ink|anime/i.test(sentence));
  return styleSentence || '';
}

function buildSpeciesGuard(prompt) {
  const lower = String(prompt || '').toLowerCase();
  if (/(goose|geese|swan|cygnet|pigeon|puffin|sparrow|owl|bird|wing|beak|feather)/.test(lower)) {
    return 'Bird-specific guard: every visible main or secondary character must read clearly as a bird with a beak, feathers, wings, and bird body posture. Never stage any figure as a human couple, human parent-child portrait, engagement photo, or fashion portrait.';
  }
  return '';
}

function buildImagenPrompt(prompt) {
  const adapted = adaptPromptForImagen(prompt);
  const heroClause = extractHeroClause(prompt);
  const styleClause = extractStyleClause(prompt);
  const speciesGuard = buildSpeciesGuard(prompt);
  const heroGuard = heroClause
    ? `Important continuity rule: ${heroClause}. Render this named protagonist only as that exact non-human animal with the described visible body traits. No humans, no dolls, no mammal substitution, no species swap. `
    : 'Important continuity rule: keep the protagonist exactly as described, as a non-human animal only. No humans, dolls, mammal substitution, or species swap. ';
  const anatomyGuard = 'Visible anatomy must read immediately as animal anatomy, not human anatomy: show species-defining features such as beak, feathers, wings, paws, tail, fur, or animal body silhouette. Never render a human-style face, person, child, adult, human portrait, studio headshot, passport-photo framing, glasses, suit, jacket, or human clothing. If the shot is a close-up, it must still read unmistakably as an animal close-up.';
  const sideCharacterGuard = 'The protagonist is the ONLY animal subject visible in this scene unless the prompt explicitly names and describes a second character. Do not render any other animal, bird, insect, fly, mosquito, bug, beetle, ant, bee, wasp, butterfly, moth, dragonfly, or creature as a foreground, mid-ground, or surrounding subject. Insects, flies, and bugs mentioned in the story as environmental audio — crickets chirping, fireflies glowing, distant buzzing — are sound texture only and must NOT appear as visible creatures anywhere in the image. Background sounds and ambience — birds chirping, crickets, distant wildlife — are environmental texture only and must NOT appear as visible creatures in the image. Never invent a companion, bystander, human, child, or additional animal that the prompt does not explicitly describe.';
  const layoutGuard = 'Use one single full-frame illustration only. No split panels, no comic layout, no diptych, no triptych, no collage, no before-and-after layout, and no multiple separate scenes inside one frame.';
  const styleGuard = styleClause
    ? `Important style rule: keep the exact same illustration medium and character-design language across every slide. ${styleClause}. Preserve the same brushwork, line weight, palette treatment, and storybook finish. No photorealism, no live-action look, no glossy 3D rendering, no toy-like plastic texture, and no wildlife-photo realism. `
    : 'Important style rule: keep one consistent 2D children\'s-book illustration style across every slide. Preserve the same brushwork, line weight, palette treatment, and storybook finish. No photorealism, no live-action look, no glossy 3D rendering, and no wildlife-photo realism. ';
  return `Children's story illustration. ${styleGuard}No text, no logos, no watermark. ${heroGuard}${anatomyGuard} ${sideCharacterGuard} ${speciesGuard} ${layoutGuard}The named protagonist must remain the first and dominant subject in frame. ${adapted}`;
}

function classifyGenerationError(err) {
  const message = String(err?.message || err || 'Unknown error');
  if (/429|quota|rate limit|resource exhausted/i.test(message)) {
    return { type: 'quota', retryable: true, message };
  }
  if (/403|permission|unauthorized|api key/i.test(message)) {
    return { type: 'auth', retryable: false, message };
  }
  if (/404|not found|predict/i.test(message)) {
    return { type: 'endpoint', retryable: false, message };
  }
  if (/timed out|timeout|fetch failed|network|econnreset|socket/i.test(message)) {
    return { type: 'network', retryable: true, message };
  }
  if (/50[0-9]|service unavailable|rai response|failed to retrieve|server error|internal (server|error)/i.test(message)) {
    return { type: 'transient', retryable: true, message };
  }
  return { type: 'unknown', retryable: false, message };
}

function buildFallbackNotice({ slideNumber, fileName, classification }) {
  return {
    slide: slideNumber,
    file: fileName,
    status: 'failed-needs-fallback',
    failureType: classification.type,
    error: classification.message,
    fallback: FALLBACK_MODE,
  };
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
      const classification = classifyGenerationError(err);
      if (!classification.retryable || attempt === MAX_ATTEMPTS) break;
      const delayMs = classification.type === 'transient' ? attempt * 30_000 : 2_000;
      console.log(`  Retry ${attempt}/${MAX_ATTEMPTS} after ${delayMs / 1000}s (${classification.type})...`);
      await new Promise((r) => setTimeout(r, delayMs));
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
  const reelOrder = resolveAdaptiveReelSlideOrder(story.slides || [], story);
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
  console.log(`Output   : ${WIDTH}x${HEIGHT} PNG (vertical default)`);
  console.log(`Fallback : ${FALLBACK_MODE}`);
  if (CONTINUE_ON_ERROR) console.log('On error : continue and log fallback-needed slides');
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

    try {
      const rawImage = await generateWithImagen(prompt);
      const normalized = await normalizeStoryImage(rawImage);
      await fs.writeFile(outPath, normalized);
      console.log(`  Saved ${fileName} (${Math.round(normalized.length / 1024)} KB)`);
      generationLog.push({ slide: slideNumber, file: fileName, status: 'generated', bytes: normalized.length });
    } catch (err) {
      const classification = classifyGenerationError(err);
      console.warn(`  Generation failed [${classification.type}]: ${classification.message}`);
      if (!CONTINUE_ON_ERROR) {
        throw err;
      }
      if (classification.type === 'quota' && FALLBACK_MODE !== 'none') {
        console.warn(`  Marking slide for fallback workflow (${FALLBACK_MODE}).`);
      }
      generationLog.push(buildFallbackNotice({ slideNumber, fileName, classification }));
      continue;
    }
  }

  const logPath = path.join(storyDir, '_reel-image-generation.json');
  if (!DRY_RUN) {
    await fs.writeFile(logPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      model: MODEL,
      mode: ALL_SLIDES ? 'all' : explicitSlides.length ? 'custom' : 'reel-first',
      targetSlides,
      files: generationLog,
      fallbackMode: FALLBACK_MODE,
      continueOnError: CONTINUE_ON_ERROR,
    }, null, 2)}\n`);
  }

  const generatedCount = generationLog.filter((entry) => entry.status === 'generated').length;
  const failedCount = generationLog.filter((entry) => entry.status === 'failed-needs-fallback').length;
  const skippedCount = generationLog.filter((entry) => String(entry.status).startsWith('skipped')).length;

  console.log('');
  if (DRY_RUN) {
    console.log('Dry run complete.');
  } else {
    console.log(`Done. Log -> ${path.relative(ROOT, logPath)}`);
    console.log(`Summary  : generated=${generatedCount}, skipped=${skippedCount}, fallback-needed=${failedCount}`);
    if (failedCount > 0) {
      console.log('Next     : complete fallback generation for the marked slides, then rerun with --force for any final replacements if needed.');
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

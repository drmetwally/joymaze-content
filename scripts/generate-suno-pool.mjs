#!/usr/bin/env node

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SUNO_POOL_PATH = path.join(ROOT, 'config', 'suno-prompt-pool.json');
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_MAX_TOKENS = 1200;
const TODAY = new Date().toISOString().slice(0, 10);

const POOL_TYPES = [
  'story_background_ambient',
  'hook_jingle',
  'outro_jingle',
  'animal_background_ambient',
  'puzzle_compilation_bgm',
];

const TYPE_ALIAS_MAP = {
  story_background: 'story_background_ambient',
};

const TYPE_DETAILS = {
  story_background_ambient: {
    description: 'Acts 1-3 ambient music for story episodes.',
    duration: '3 minutes',
    style: 'ambient',
    mood: 'warm',
    themeHint: 'story',
  },
  hook_jingle: {
    description: 'Recurring Joyo hook intro.',
    duration: 'short recurring intro',
    style: 'jingle',
    mood: 'bright',
    themeHint: 'joyo-intro',
  },
  outro_jingle: {
    description: 'Recurring Joyo outro.',
    duration: 'short recurring outro',
    style: 'jingle',
    mood: 'uplifting',
    themeHint: 'joyo-outro',
  },
  animal_background_ambient: {
    description: 'Ambient for animal facts episodes.',
    duration: '3 minutes',
    style: 'ambient',
    mood: 'curious',
    themeHint: 'animal',
  },
  puzzle_compilation_bgm: {
    description: 'Background music for 1-hour puzzle compilations.',
    duration: 'long loop-friendly background',
    style: 'background',
    mood: 'playful',
    themeHint: 'puzzle',
  },
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const typeIdx = args.indexOf('--type');
const countIdx = args.indexOf('--count');
const requestedTypeRaw = typeIdx !== -1 ? args[typeIdx + 1] : null;
const countValue = countIdx !== -1 ? Number.parseInt(args[countIdx + 1], 10) : 5;
const COUNT = Number.isFinite(countValue) && countValue > 0 ? countValue : 5;

function normalizeType(value) {
  if (!value) {
    return null;
  }
  return TYPE_ALIAS_MAP[value] || value;
}

function createEmptyPool() {
  return {
    version: '1.0',
    lastExpanded: TODAY,
    pools: {
      story_background_ambient: [],
      hook_jingle: [],
      outro_jingle: [],
      animal_background_ambient: [],
      puzzle_compilation_bgm: [],
    },
  };
}

async function loadPoolConfig() {
  let pool = null;
  try {
    pool = JSON.parse(await fs.readFile(SUNO_POOL_PATH, 'utf-8'));
  } catch {}
  return pool;
}

async function callGroq(prompt) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: GROQ_MAX_TOKENS,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content.trim());
}

function buildPrompt(poolType, count, existingEntries) {
  const details = TYPE_DETAILS[poolType];
  const existingBlock = existingEntries.length
    ? `\nExisting prompts to avoid duplicating too closely:\n${existingEntries.slice(-8).map((entry) => `- ${entry.prompt}`).join('\n')}`
    : '\nNo existing prompts yet for this pool.';

  return `You are generating Suno prompt pool entries for JoyMaze.

Pool type: ${poolType}
Purpose: ${details.description}
Target count: ${count}
Target duration/style context: ${details.duration}${existingBlock}

Return one JSON object with exactly this shape:
{
  "prompts": [
    {
      "prompt": "string",
      "style": "string",
      "mood": "string",
      "themeHint": "string"
    }
  ]
}

Hard rules:
- Return exactly ${count} prompt objects.
- "prompt" must be a Suno-ready music prompt, concise but vivid.
- Keep every prompt child-safe, no lyrics unless the pool type is a jingle.
- Story and animal background prompts should feel educational, warm, and non-distracting.
- Puzzle compilation prompts should be loop-friendly and low-fatigue.
- hook_jingle and outro_jingle prompts should feel recurring and brand-safe.
- style must be a short label.
- mood must be a short label.
- themeHint must be a short label.
- Avoid near-duplicates of the existing prompts.`;
}

function nextEntryId(poolType, existingEntries) {
  const prefix = poolType;
  let maxNumber = 0;

  existingEntries.forEach((entry) => {
    const match = String(entry.id || '').match(/_(\d+)$/);
    if (match) {
      maxNumber = Math.max(maxNumber, Number.parseInt(match[1], 10));
    }
  });

  return `${prefix}_${String(maxNumber + 1).padStart(3, '0')}`;
}

function validateResponse(poolType, response, count) {
  if (!response || typeof response !== 'object' || !Array.isArray(response.prompts)) {
    throw new Error(`Groq response for ${poolType} did not include a prompts array.`);
  }

  if (response.prompts.length !== count) {
    throw new Error(`Groq response for ${poolType} returned ${response.prompts.length} prompts, expected ${count}.`);
  }
}

async function main() {
  const requestedType = normalizeType(requestedTypeRaw);
  if (requestedType && !POOL_TYPES.includes(requestedType)) {
    throw new Error(`Invalid pool type: ${requestedTypeRaw}`);
  }

  const poolTypes = requestedType ? [requestedType] : POOL_TYPES;
  const existingPool = (await loadPoolConfig()) || createEmptyPool();

  console.log('\n  JoyMaze Suno Prompt Pool Generator');
  console.log(`  Count per pool: ${COUNT}`);
  console.log(`  Pool types: ${poolTypes.join(', ')}`);

  if (DRY_RUN) {
    poolTypes.forEach((poolType) => {
      const existingEntries = existingPool.pools?.[poolType] || [];
      console.log(`\n--- DRY RUN: ${poolType} ---`);
      console.log(buildPrompt(poolType, COUNT, existingEntries));
      console.log('--- END ---');
    });
    console.log('');
    return;
  }

  for (const poolType of poolTypes) {
    const existingEntries = existingPool.pools?.[poolType] || [];
    const prompt = buildPrompt(poolType, COUNT, existingEntries);

    console.log(`\n  Calling Groq for ${poolType}...`);
    const response = await callGroq(prompt);
    validateResponse(poolType, response, COUNT);

    response.prompts.forEach((item) => {
      existingEntries.push({
        id: nextEntryId(poolType, existingEntries),
        prompt: item.prompt,
        style: item.style || TYPE_DETAILS[poolType].style,
        mood: item.mood || TYPE_DETAILS[poolType].mood,
        themeHint: item.themeHint || TYPE_DETAILS[poolType].themeHint,
        usedCount: 0,
      });
    });

    existingPool.pools[poolType] = existingEntries;

    console.log(`  Generated ${COUNT} prompts for ${poolType}:`);
    existingEntries.slice(-COUNT).forEach((entry) => {
      console.log(`    [${entry.id}] ${entry.prompt}`);
    });
  }

  existingPool.lastExpanded = TODAY;
  await fs.writeFile(SUNO_POOL_PATH, `${JSON.stringify(existingPool, null, 2)}\n`);
  console.log(`\n  Saved: config/suno-prompt-pool.json`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

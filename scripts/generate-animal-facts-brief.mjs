#!/usr/bin/env node

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ANIMAL_LONGFORM_DIR = path.join(ROOT, 'output', 'longform', 'animal');
const SUNO_POOL_PATH = path.join(ROOT, 'config', 'suno-prompt-pool.json');
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_MAX_TOKENS = 1200;

const args = process.argv.slice(2);
const SAVE = args.includes('--save');
const DRY_RUN = args.includes('--dry-run');
const TODAY = new Date().toISOString().slice(0, 10);

async function loadContext() {
  let styleGuide = '';
  let trends = null;
  let competitor = null;
  let hooksData = null;
  let dynamicThemes = null;
  let perfWeights = null;
  let psychTriggers = null;
  let sunoPool = null;
  let recentEpisodes = [];
  let nextEpisodeNumber = 1;

  try {
    styleGuide = await fs.readFile(path.join(ROOT, 'config', 'writing-style.md'), 'utf-8');
  } catch {}

  try {
    trends = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8'));
  } catch {}

  try {
    competitor = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'competitor-intelligence.json'), 'utf-8'));
  } catch {}

  try {
    hooksData = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'hooks-library.json'), 'utf-8'));
  } catch {}

  try {
    dynamicThemes = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'theme-pool-dynamic.json'), 'utf-8'));
  } catch {}

  try {
    perfWeights = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'performance-weights.json'), 'utf-8'));
  } catch {}

  try {
    psychTriggers = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'psychology-triggers.json'), 'utf-8'));
  } catch {}

  try {
    sunoPool = JSON.parse(await fs.readFile(SUNO_POOL_PATH, 'utf-8'));
  } catch {}

  try {
    const entries = await fs.readdir(ANIMAL_LONGFORM_DIR, { withFileTypes: true });
    const episodes = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const match = entry.name.match(/^ep(\d+)-/i);
        return {
          name: entry.name,
          number: match ? Number.parseInt(match[1], 10) : 0,
        };
      })
      .filter((entry) => Number.isFinite(entry.number) && entry.number > 0)
      .sort((a, b) => a.number - b.number);

    recentEpisodes = episodes.slice(-5).map((entry) => entry.name);
    if (episodes.length > 0) {
      nextEpisodeNumber = episodes[episodes.length - 1].number + 1;
    }
  } catch {}

  return {
    styleGuide,
    trends,
    competitor,
    hooksData,
    dynamicThemes,
    perfWeights,
    psychTriggers,
    sunoPool,
    recentEpisodes,
    nextEpisodeNumber,
  };
}

async function callGroq(systemPrompt, userPrompt) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: GROQ_MAX_TOKENS,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content.trim());
}

function getLowestUsedPoolEntry(sunoPool, poolType) {
  const entries = sunoPool?.pools?.[poolType];
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  return [...entries].sort((a, b) => {
    const usedDiff = (a.usedCount ?? 0) - (b.usedCount ?? 0);
    if (usedDiff !== 0) {
      return usedDiff;
    }
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  })[0];
}

function buildPrompt(context) {
  const {
    trends,
    competitor,
    hooksData,
    dynamicThemes,
    perfWeights,
    sunoPool,
    recentEpisodes,
    nextEpisodeNumber,
  } = context;

  const recentEpisodesBlock = recentEpisodes.length
    ? `\nRecent animal episodes to avoid repeating too closely:\n${recentEpisodes.map((episode) => `- ${episode}`).join('\n')}`
    : '\nNo prior animal episodes exist yet. This is episode 1.';

  const trendsBlock = trends?.trending_themes?.length
    ? `\nTrending themes this week:\n${trends.trending_themes.slice(0, 5).map((item) => `- ${item.theme} (score: ${item.score})`).join('\n')}`
    : '';

  const competitorBlock = competitor
    ? `\nCompetitor fact/hook patterns:\n${(competitor.winning_hooks || []).slice(0, 4).map((item) => `- "${item}"`).join('\n')}`
    : '';

  const hooksBlock = hooksData?.hooks?.length
    ? `\nHook library references:\n${hooksData.hooks
        .filter((item) => item.brand_safe !== false && item.text)
        .slice(0, 5)
        .map((item) => `- [${item.hook_type || 'hook'}] "${item.text}"`)
        .join('\n')}`
    : '';

  const dynamicThemesBlock = dynamicThemes?.themes?.length
    ? `\nPreferred active themes:\n${dynamicThemes.themes
        .filter((item) => item.status !== 'evicted' && item.brand_safe !== false)
        .slice(0, 5)
        .map((item) => `- ${item.name}`)
        .join('\n')}`
    : '';

  const perfWeightsBlock = perfWeights?.weights
    ? `\nPerformance weights:\n${Object.entries(perfWeights.weights)
        .filter(([, value]) => typeof value === 'object' && value !== null)
        .slice(0, 5)
        .map(([key, value]) => `- ${key}: ${value.weight ?? 'n/a'}`)
        .join('\n')}`
    : '';

  const selectedBackground = getLowestUsedPoolEntry(sunoPool, 'animal_background_ambient');
  const backgroundRule = selectedBackground
    ? `\nUse this exact Suno background prompt verbatim for "backgroundSunoPrompt":\n"${selectedBackground.prompt}"`
    : '\nGenerate a fresh ambient Suno background prompt for "backgroundSunoPrompt".';

  return `You are planning a JoyMaze animal facts long-form episode for kids ages 4-8 and their parents.
Episode number: ${nextEpisodeNumber}
Format: one animal, one hook fact, habitat section, diet section, fun fact section, one sung recap.${recentEpisodesBlock}${trendsBlock}${dynamicThemesBlock}${competitorBlock}${hooksBlock}${perfWeightsBlock}${backgroundRule}

Psychology map (inject verbatim and follow it exactly):
- hook: CURIOSITY_GAP (pose the fact as a question — "Did you know a lion's roar can be heard HOW far?")
- habitat: NOSTALGIA (sensory grounding — "Picture the golden grass stretching...")
- diet: CURIOSITY_GAP (surprising detail about what/how it eats)
- funFact: COMPLETION_SATISFACTION (payoff — the answer to something set up in habitat or diet)
- sungRecap: NOSTALGIA (warm, repeatable, earworm cadence)
- activity: CHALLENGE
- outro: SCREEN_RELIEF

Return one JSON object with exactly this shape:
{
  "animalName": "African Lion",
  "slug": "african-lion",
  "hookFact": "A lion's roar can be heard 8 kilometres away.",
  "habitat": {
    "description": "string",
    "imagePromptHint": "string"
  },
  "diet": {
    "description": "string",
    "imagePromptHint": "string"
  },
  "funFact": {
    "description": "string",
    "imagePromptHint": "string"
  },
  "sungRecapLyrics": "string",
  "sungRecapSunoPrompt": "string",
  "backgroundSunoPrompt": "string",
  "activityFolder": ""
}

Hard rules:
- Pick an animal that is educationally rich for ages 4-8 and is not in the recentEpisodes list above.
- animalName: clear common animal name.
- slug: kebab-case version of animalName.
- hookFact: one sentence only; verifiable, surprising, specific, and not vague.
- habitat.description, diet.description, funFact.description: warm, kid-friendly, factual, concise.
- Every imagePromptHint: specific Gemini guidance for one vertical portrait illustration.
- sungRecapLyrics: short, catchy, repeatable, child-friendly, formatted as multi-line lyrics.
- sungRecapSunoPrompt: upbeat children's educational song prompt, earworm cadence, about the chosen animal, around 30 seconds.
- If a background pool prompt was provided above, copy it exactly into "backgroundSunoPrompt".
- activityFolder may be an empty string if no activity is attached yet.`;
}

function validateBrief(brief) {
  if (!brief || typeof brief !== 'object') {
    throw new Error('Groq response was not a JSON object.');
  }

  const requiredPaths = [
    ['animalName'],
    ['slug'],
    ['hookFact'],
    ['habitat', 'description'],
    ['habitat', 'imagePromptHint'],
    ['diet', 'description'],
    ['diet', 'imagePromptHint'],
    ['funFact', 'description'],
    ['funFact', 'imagePromptHint'],
    ['sungRecapLyrics'],
    ['sungRecapSunoPrompt'],
    ['backgroundSunoPrompt'],
  ];

  for (const pathParts of requiredPaths) {
    let current = brief;
    for (const part of pathParts) {
      current = current?.[part];
    }

    if (typeof current !== 'string' || current.trim().length === 0) {
      throw new Error(`Brief field missing: ${pathParts.join('.')}`);
    }
  }
}

function buildEpisodeJson(brief, context) {
  const selectedBackground = getLowestUsedPoolEntry(context.sunoPool, 'animal_background_ambient');

  return {
    format: 'animal-facts',
    episodeNumber: context.nextEpisodeNumber,
    animalName: brief.animalName,
    slug: brief.slug,
    date: TODAY,
    psychologyMap: {
      hook: 'CURIOSITY_GAP',
      habitat: 'NOSTALGIA',
      diet: 'CURIOSITY_GAP',
      funFact: 'COMPLETION_SATISFACTION',
      sungRecap: 'NOSTALGIA',
      activity: 'CHALLENGE',
      outro: 'SCREEN_RELIEF',
    },
    hookFact: brief.hookFact,
    habitat: brief.habitat,
    diet: brief.diet,
    funFact: brief.funFact,
    sungRecapLyrics: brief.sungRecapLyrics,
    sunoPrompts: {
      sungRecap: brief.sungRecapSunoPrompt,
      background: selectedBackground?.prompt || brief.backgroundSunoPrompt,
    },
    jingleDropPaths: {
      background: 'background.mp3',
      sungRecap: 'sung-recap.mp3',
      hookJingle: 'hook-jingle.mp3',
      outroJingle: 'outro-jingle.mp3',
    },
    activityFolder: brief.activityFolder || '',
    rendered: false,
  };
}

function buildBriefMd(episode, episodeDir) {
  const psychologyRows = Object.entries(episode.psychologyMap)
    .map(([segment, trigger]) => `| ${segment} | ${trigger} |`)
    .join('\n');

  return `# Animal Facts Brief: ${episode.animalName}

- Episode number: ${episode.episodeNumber}
- Date: ${episode.date}
- Folder: ${episodeDir}

## Hook Fact
${episode.hookFact}

## Habitat
Description: ${episode.habitat.description}

Image prompt hint:
\`\`\`
${episode.habitat.imagePromptHint}
\`\`\`

## Diet
Description: ${episode.diet.description}

Image prompt hint:
\`\`\`
${episode.diet.imagePromptHint}
\`\`\`

## Fun Fact
Description: ${episode.funFact.description}

Image prompt hint:
\`\`\`
${episode.funFact.imagePromptHint}
\`\`\`

## Sung Recap Lyrics
\`\`\`
${episode.sungRecapLyrics}
\`\`\`

## Suno Drop Instructions
Drop these MP3 files into the episode folder:
- background.mp3
- sung-recap.mp3
- hook-jingle.mp3
- outro-jingle.mp3

Background Suno prompt:
\`\`\`
${episode.sunoPrompts.background}
\`\`\`

Sung recap Suno prompt:
\`\`\`
${episode.sunoPrompts.sungRecap}
\`\`\`

## Psychology Map
| Segment | Trigger |
| --- | --- |
${psychologyRows}
`;
}

function incrementPoolUsage(sunoPool, poolIds) {
  if (!sunoPool?.pools) {
    return sunoPool;
  }

  Object.entries(poolIds).forEach(([poolType, id]) => {
    if (!id || !Array.isArray(sunoPool.pools[poolType])) {
      return;
    }

    const entry = sunoPool.pools[poolType].find((item) => item.id === id);
    if (entry) {
      entry.usedCount = (entry.usedCount ?? 0) + 1;
    }
  });

  return sunoPool;
}

async function main() {
  console.log('\n  JoyMaze Animal Facts Planner');
  console.log(`  Date: ${TODAY}`);
  console.log('');

  const context = await loadContext();
  console.log(`  Next episode: ${context.nextEpisodeNumber}`);
  if (context.recentEpisodes.length > 0) {
    console.log(`  Recent episodes: ${context.recentEpisodes.join(', ')}`);
  }

  const systemPrompt = context.styleGuide || 'Write in a warm, child-friendly JoyMaze educational style.';
  const userPrompt = buildPrompt(context);

  if (DRY_RUN) {
    console.log('\n--- SYSTEM PROMPT (dry run) ---');
    console.log(systemPrompt);
    console.log('--- USER PROMPT (dry run) ---');
    console.log(userPrompt);
    console.log('--- END ---\n');
    return;
  }

  console.log(`  Calling Groq (${GROQ_MODEL})...`);
  const brief = await callGroq(systemPrompt, userPrompt);
  validateBrief(brief);

  const episodeJson = buildEpisodeJson(brief, context);
  const episodeFolderName = `ep${String(context.nextEpisodeNumber).padStart(2, '0')}-${episodeJson.slug}`;
  const episodeDir = path.join('output', 'longform', 'animal', episodeFolderName).replace(/\\/g, '/');
  const poolIds = {
    animal_background_ambient: getLowestUsedPoolEntry(context.sunoPool, 'animal_background_ambient')?.id || null,
  };

  console.log('');
  console.log(`  Animal: ${episodeJson.animalName}`);
  console.log(`  Hook:   "${episodeJson.hookFact}"`);
  console.log(`  Habitat: ${episodeJson.habitat.description}`);
  console.log(`  Diet:    ${episodeJson.diet.description}`);
  console.log(`  Fun fact: ${episodeJson.funFact.description}`);
  console.log('');

  if (!SAVE) {
    console.log('  Run with --save to create the folder and files.');
    return;
  }

  await fs.mkdir(path.join(ANIMAL_LONGFORM_DIR, episodeFolderName), { recursive: true });
  await fs.writeFile(
    path.join(ANIMAL_LONGFORM_DIR, episodeFolderName, 'episode.json'),
    `${JSON.stringify(episodeJson, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(ANIMAL_LONGFORM_DIR, episodeFolderName, 'brief.md'),
    buildBriefMd(episodeJson, episodeDir),
  );

  if (context.sunoPool) {
    incrementPoolUsage(context.sunoPool, poolIds);
    await fs.writeFile(SUNO_POOL_PATH, `${JSON.stringify(context.sunoPool, null, 2)}\n`);
  }

  console.log(`  Saved to: ${episodeDir}`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

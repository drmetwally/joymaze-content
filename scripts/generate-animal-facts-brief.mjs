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
const GROQ_MAX_TOKENS = 4000;

// 12-style pool — nature/documentary illustration styles for visual consistency per episode
// One picked deterministically per episode so all 4 images look like the same show
const ANIMAL_ART_STYLES = [
  'warm gouache illustration, nature documentary style, painterly brushwork, rich natural tones',
  'NatGeo Kids editorial illustration, clean linework, vibrant natural palette, flat digital painterly',
  'watercolor wildlife illustration, loose wet-on-wet washes, botanical detail, soft earth tones',
  'cinematic painted nature scene, dramatic sky lighting, photorealistic painterly, deep saturated colors',
  'vintage nature journal illustration, pen-and-ink with watercolor wash, scientific warmth, aged paper tone',
  'soft pastel children\'s nature book, gouache texture, gentle dappled sunlight, storybook warmth',
  'bold children\'s educational illustration, clean outlines, flat bright colors, playful expressive energy',
  'atmospheric oil painting nature style, thick impasto texture, dramatic rim lighting, rich jewel tones',
  'Japanese nature illustration style, delicate linework, muted ink washes, serene open composition',
  'Studio Ghibli-inspired nature scene, lush painterly backgrounds, warm golden-hour light, detailed foliage',
  'folk art nature illustration, hand-painted naive style, earthy palette, decorative organic patterning',
  'cinematic concept art nature style, volumetric light rays, atmospheric depth, detailed texture rendering',
];

function pickEpisodeStyle(episodeNumber) {
  return ANIMAL_ART_STYLES[(episodeNumber - 1) % ANIMAL_ART_STYLES.length];
}

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
  let contentIntelligence = null;
  let patternInterrupts = null;
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
    contentIntelligence = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'content-intelligence.json'), 'utf-8'));
  } catch {}

  try {
    patternInterrupts = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'pattern-interrupt-dynamic.json'), 'utf-8'));
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
    contentIntelligence,
    patternInterrupts,
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

function buildPrompt(context, artStyle) {
  const {
    trends,
    competitor,
    hooksData,
    dynamicThemes,
    perfWeights,
    psychTriggers,
    sunoPool,
    contentIntelligence,
    patternInterrupts,
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

  const contentIntelBlock = contentIntelligence
    ? [
        contentIntelligence.intelligence_summary?.recommended_focus_shift
          ? `\nContent focus this week: ${contentIntelligence.intelligence_summary.recommended_focus_shift}`
          : '',
        (contentIntelligence.new_themes || [])
          .filter((t) => t.brand_safe !== false)
          .slice(0, 4)
          .length
          ? `\nEmerging themes (bias animal/environment selection toward these):\n${(contentIntelligence.new_themes || [])
              .filter((t) => t.brand_safe !== false)
              .slice(0, 4)
              .map((t) => `- ${t.name}`)
              .join('\n')}`
          : '',
      ].filter(Boolean).join('')
    : '';

  const patternInterruptBlock = patternInterrupts?.interrupts
    ? `\nHook pattern references (use for hookFact style — surprising, direct, curiosity-gap):\n${patternInterrupts.interrupts
        .filter((i) => i.brand_safe !== false && i.subtype !== 'edutainment')
        .slice(0, 3)
        .map((i) => `- [${i.subtype}] ${i.topic}`)
        .join('\n')}`
    : '';

  const selectedBackground = getLowestUsedPoolEntry(sunoPool, 'animal_background_ambient');
  const backgroundRule = selectedBackground
    ? `\nFor "backgroundSunoPrompt", copy this verbatim: "${selectedBackground.prompt}"`
    : '\nFor "backgroundSunoPrompt", write one sentence of ambient background music that fits the animal\'s environment. No lyrics, children\'s documentary feel.';

  // Psychology trigger descriptions — tell Groq HOW to implement each trigger
  const psychBlock = psychTriggers
    ? `
## PSYCHOLOGY TRIGGER INJECTION
Write each section so it activates the assigned trigger:
- nameReveal → COMPLETION_SATISFACTION: burst of recognition and warmth. Animal name revealed with energy. Feels like a reward for watching.
- fact1 → CURIOSITY_GAP: state the most remarkable fact directly — then open "but why?" or "how is that possible?" Compels the viewer forward.
- fact2 → NOSTALGIA: grounding and familiar. Connect to something from the child's everyday world. "Just like when you..." quality.
- fact3 → CURIOSITY_GAP: surprising behavior or adaptation that contradicts expectations. Lead with the surprise, then explain.
- fact4 → COMPLETION_SATISFACTION: the "aha" connection — two facts from earlier link together. Something from fact1 or fact2 pays off here.
- fact5 → NOSTALGIA: warm, endearing, lovable. The trait that makes you want this animal as a friend.
- sungRecap → NOSTALGIA: warm, earworm cadence. The lyric should feel familiar on second listen. Repetition is a feature.
`
    : '';

  const visualStyleBlock = `
## VISUAL STYLE (apply to every imagePromptHint)
- Image format: horizontal landscape, 1920×1080 px — every imagePromptHint MUST end with "horizontal landscape format, 1920×1080 px"
- Bottom 15% of every image must be clear (no animals, no objects) — text overlay zone
- BOTTOM FADE (mandatory every scene): ground or environment at the lower edge must dissolve softly into light cream or pale white — like paint fading into paper. Include "ground fades softly to pale cream at lower edge" in every imagePromptHint.
- Art style for this episode (use EXACTLY this style across ALL 6 images — never deviate): ${artStyle}
- No text, logos, watermarks, or human characters in any image.
- PSYCHOLOGY COLOR CUES (weave into every imagePromptHint):
  * CURIOSITY_GAP (nameReveal, fact1, fact3): dramatic contrast lighting, deep rich shadows, single warm spotlight on animal
  * NOSTALGIA (fact2, fact5): warm amber-golden haze, late-afternoon glow, soft earthy muted tones
  * COMPLETION_SATISFACTION (fact4): vibrant saturated colors, bright warm sunlight, joyful open palette
- 3-SECOND VISUAL RULE: each image must communicate the fact visually in 3 seconds without audio. If the image prompt doesn't make this possible, rewrite it.

## SHOT TYPE RULES
Each image section has a shotType. Use it to set camera distance and framing:
- ESTABLISHING: wide shot — animal small in frame, full environment visible
- MEDIUM: mid-body shot — animal fills roughly half the frame, some environment visible
- CLOSE-UP: face or key feature fills most of the frame, background softly blurred
- ACTION: animal in motion — blur, dynamic pose, energy implied
- POV: viewer's eye-level looking directly at the animal or from animal's perspective

shotType assignments (use these exactly):
- nameReveal: ESTABLISHING
- fact1: ESTABLISHING (introduce the animal in its world)
- fact2: MEDIUM (mid-body, environment context, warm and relatable)
- fact3: ACTION (animal performing the notable behavior — dynamic, energetic)
- fact4: CLOSE-UP (key feature or detail that completes the "aha" connection)
- fact5: MEDIUM (warm, endearing portrait — the trait that makes you love this animal)
`;

  return `You are planning a JoyMaze animal facts long-form video episode for kids ages 4-8 and their parents.
Episode number: ${nextEpisodeNumber}
Format: hook (mystery question — NO animal name) → name reveal (payoff) → FACT 1 → FACT 2 → FACT 3 → FACT 4 → FACT 5 → sung recap.${recentEpisodesBlock}${trendsBlock}${dynamicThemesBlock}${competitorBlock}${hooksBlock}${perfWeightsBlock}${contentIntelBlock}${patternInterruptBlock}${backgroundRule}
${psychBlock}${visualStyleBlock}
Return one JSON object with EXACTLY this shape (no extra fields, no missing fields):
{
  "animalName": "Sea Otter",
  "slug": "sea-otter",
  "hookFact": "What ocean animal holds hands while sleeping so they don't drift apart?",
  "nameReveal": {
    "shotType": "ESTABLISHING",
    "compositionNote": "string — 1 sentence: foreground, background, lighting, animal posture",
    "psychologyBeat": "string — 3-6 words, e.g. 'burst of joyful recognition'",
    "imagePromptHint": "string — 50-70 words full Gemini prompt"
  },
  "fact1": {
    "numberLabel": "FACT 1",
    "description": "string — EXACTLY 4 sentences: (1) fact statement 12-15 words, (2) detailed explanation 14-18 words, (3) specific detail or stat 10-13 words, (4) comparison to child's world 10-13 words",
    "comparisonAnchor": "string — standalone version of sentence 3. Always starts with 'That's like...' or 'Just like...'",
    "shotType": "ESTABLISHING",
    "compositionNote": "string — 1 sentence",
    "psychologyBeat": "string — 3-6 words",
    "imagePromptHint": "string — 50-70 words full Gemini prompt"
  },
  "fact2": {
    "numberLabel": "FACT 2",
    "description": "string — EXACTLY 4 sentences: (1) fact statement 12-15 words, (2) detailed explanation 14-18 words, (3) specific detail or stat 10-13 words, (4) comparison to child's world 10-13 words. MINIMUM 48 words total.",
    "comparisonAnchor": "string",
    "shotType": "MEDIUM",
    "compositionNote": "string — 1 sentence",
    "psychologyBeat": "string — 3-6 words",
    "imagePromptHint": "string — 50-70 words full Gemini prompt"
  },
  "fact3": {
    "numberLabel": "FACT 3",
    "description": "string — EXACTLY 4 sentences: (1) fact statement 12-15 words, (2) detailed explanation 14-18 words, (3) specific detail or stat 10-13 words, (4) comparison to child's world 10-13 words. MINIMUM 48 words total.",
    "comparisonAnchor": "string",
    "shotType": "ACTION",
    "compositionNote": "string — 1 sentence",
    "psychologyBeat": "string — 3-6 words",
    "imagePromptHint": "string — 50-70 words full Gemini prompt"
  },
  "fact4": {
    "numberLabel": "FACT 4",
    "description": "string — EXACTLY 4 sentences: (1) fact statement 12-15 words, (2) detailed explanation 14-18 words, (3) specific detail or stat 10-13 words, (4) comparison to child's world 10-13 words. MINIMUM 48 words total.",
    "comparisonAnchor": "string",
    "shotType": "CLOSE-UP",
    "compositionNote": "string — 1 sentence",
    "psychologyBeat": "string — 3-6 words",
    "imagePromptHint": "string — 50-70 words full Gemini prompt"
  },
  "fact5": {
    "numberLabel": "FACT 5",
    "description": "string — EXACTLY 4 sentences: (1) fact statement 12-15 words, (2) detailed explanation 14-18 words, (3) specific detail or stat 10-13 words, (4) comparison to child's world 10-13 words. MINIMUM 48 words total.",
    "comparisonAnchor": "string",
    "shotType": "MEDIUM",
    "compositionNote": "string — 1 sentence",
    "psychologyBeat": "string — 3-6 words",
    "imagePromptHint": "string — 50-70 words full Gemini prompt"
  },
  "sungRecapLyrics": "string — short, catchy, repeatable, child-friendly, multi-line",
  "sungRecapSunoPrompt": "string — upbeat children's educational song, earworm cadence, ~30 seconds",
  "backgroundSunoPrompt": "string",
  "activityFolder": ""
}

Hard rules:
- Animal must be educationally rich for ages 4-8 and NOT in the recentEpisodes list.
- hookFact: MYSTERY QUESTION — NEVER include the animal name. The hook must make the viewer wonder "what animal is that?" before the name reveal pays it off. Format: curiosity question about the animal's most remarkable trait. Max 15 words. Example: "What ocean animal holds hands while sleeping so they don't drift apart?"
- description (each fact): EXACTLY 4 sentences. Target 38-56 words total. These are factual source sentences for later narration, so they must be clear, specific, and easy to rewrite into energetic spoken VO.
  Sentence roles:
  1. The surprising fact, stated clearly and directly.
  2. Why or how it works in simple, concrete language.
  3. One vivid real detail or verified statistic.
  4. A child-world comparison or relatable payoff.
  Keep the writing clean and factual, but avoid stiff textbook wording.
- comparisonAnchor: standalone version of sentence 3. Always starts with "That's like..." or "Just like..."
- Numbers/stats in description: use plain, clear phrasing. Never fabricate statistics. Only include numbers that are verified facts for this animal.
- 5 facts must together give a complete, surprising picture of the animal. No fact should be predictable. fact5 must be endearing.
- Every imagePromptHint: 50-70 words, complete Gemini generation prompt. MUST include: animal species, shotType framing, environment, lighting mood, psychology color cue, "ground fades softly to pale cream at lower edge", "horizontal landscape format, 1920×1080 px". Do NOT include text or logos.
- compositionNote: 1 sentence. What is in foreground, background, lighting direction, animal posture or expression.
- psychologyBeat: 3-6 words. The emotional beat this image serves.
- If a background pool prompt was provided above, copy it verbatim into "backgroundSunoPrompt".
- activityFolder may be empty string.`;
}

function validateBrief(brief) {
  if (!brief || typeof brief !== 'object') {
    throw new Error('Groq response was not a JSON object.');
  }

  const factKeys = ['fact1', 'fact2', 'fact3', 'fact4', 'fact5'];
  const requiredPaths = [
    ['animalName'],
    ['slug'],
    ['hookFact'],
    ['nameReveal', 'imagePromptHint'],
    ['nameReveal', 'compositionNote'],
    ['nameReveal', 'psychologyBeat'],
    ...factKeys.flatMap((f) => [
      [f, 'description'],
      [f, 'comparisonAnchor'],
      [f, 'imagePromptHint'],
      [f, 'compositionNote'],
      [f, 'psychologyBeat'],
    ]),
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

  // imagePromptHint word count — must be 40+ words (spec: 50-70); short prompts produce identical-looking images
  const imageHintSections = [
    ['nameReveal', 'imagePromptHint'],
    ...factKeys.map((f) => [f, 'imagePromptHint']),
  ];
  for (const [section, field] of imageHintSections) {
    const hint = brief[section]?.[field] || '';
    const wordCount = hint.split(/\s+/).filter(Boolean).length;
    if (wordCount < 40) {
      throw new Error(
        `${section}.imagePromptHint too short (${wordCount} words — minimum 40, target 50-70). Groq generated a lazy prompt. Re-run or use --force to regenerate.`,
      );
    }
  }

  // Runtime projection — rough planning estimate only.
  // Narration engine now targets punchier spoken copy around ~1.05 speed.
  const perFactSec = factKeys.reduce((sum, key) => {
    const wc = brief[key]?.description?.split(/\s+/).filter(Boolean).length || 0;
    return sum + Math.max((wc / 2.8) + 4, wc / 1.8);
  }, 0);
  const projectedSec = perFactSec + 13 + (5 * 1.5) + 30 + 8; // +hook+nameReveal+titleCards+sungRecap+outro
  if (projectedSec < 170) {
    console.warn(`  Warning: projected runtime ~${Math.round(projectedSec)}s — may feel short for the current longform target.`);
  }
}

function buildEpisodeJson(brief, context, artStyle) {
  const selectedBackground = getLowestUsedPoolEntry(context.sunoPool, 'animal_background_ambient');

  return {
    format: 'animal-facts',
    episodeNumber: context.nextEpisodeNumber,
    animalName: brief.animalName,
    slug: brief.slug,
    date: TODAY,
    artStyle,
    psychologyMap: {
      hook: 'CURIOSITY_GAP',
      nameReveal: 'COMPLETION_SATISFACTION',
      fact1: 'CURIOSITY_GAP',
      fact2: 'NOSTALGIA',
      fact3: 'CURIOSITY_GAP',
      fact4: 'COMPLETION_SATISFACTION',
      fact5: 'NOSTALGIA',
      sungRecap: 'NOSTALGIA',
      activity: 'CHALLENGE',
      outro: 'SCREEN_RELIEF',
    },
    hookFact: brief.hookFact,
    nameReveal: brief.nameReveal,
    fact1: brief.fact1,
    fact2: brief.fact2,
    fact3: brief.fact3,
    fact4: brief.fact4,
    fact5: brief.fact5,
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

  const imageSection = (label, filename, section) => {
    if (!section) return '';
    return `
## ${label} → save as \`${filename}\`
**Shot type:** ${section.shotType || 'MEDIUM'} · **Psychology beat:** _${section.psychologyBeat || ''}_
**Composition:** ${section.compositionNote || ''}

Image prompt (paste into Gemini):
\`\`\`
${section.imagePromptHint}
\`\`\`
`;
  };

  const FACT_KEYS = ['fact1', 'fact2', 'fact3', 'fact4', 'fact5'];

  const factImageSections = FACT_KEYS
    .map((key) => {
      const fact = episode[key];
      if (!fact) return '';
      return imageSection(`${fact.numberLabel || key.toUpperCase()} Image`, `${key}.png`, fact);
    })
    .join('');

  const factDescriptions = FACT_KEYS
    .map((key) => {
      const fact = episode[key];
      if (!fact) return '';
      return `**${fact.numberLabel || key.toUpperCase()}:** ${fact.description}\n\n_Comparison anchor:_ "${fact.comparisonAnchor || ''}"`;
    })
    .join('\n\n');

  return `# Animal Facts Brief: ${episode.animalName}

- Episode number: ${episode.episodeNumber}
- Date: ${episode.date}
- Folder: ${episodeDir}

## Episode Visual Style — set this in Gemini BEFORE generating any image
- **Art style:** ${episode.artStyle}
- **Apply to ALL 6 images** — open one Gemini session, paste the style first, then generate each image in sequence

## Hook Fact
${episode.hookFact}

---
## IMAGES — Generate in Gemini, drop into episode folder with exact filenames below
${imageSection('Name Reveal', 'namereveal.png', episode.nameReveal)}${factImageSections}
---

## Fact Descriptions (narration reference)

${factDescriptions}

---

## Sung Recap Lyrics
\`\`\`
${episode.sungRecapLyrics}
\`\`\`

## Suno Drop Instructions
Drop these MP3 files into the episode folder with exact filenames:
- \`background.mp3\` — Suno prompt below
- \`sung-recap.mp3\` — Suno prompt below
- \`hook-jingle.mp3\` — reuse from \`assets/audio/hook-jingle.mp3\`
- \`outro-jingle.mp3\` — reuse from \`assets/audio/outro-jingle.mp3\`

**Background Suno prompt:**
\`\`\`
${episode.sunoPrompts.background}
\`\`\`

**Sung recap Suno prompt:**
\`\`\`
${episode.sunoPrompts.sungRecap}
\`\`\`

---

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

  const artStyle    = pickEpisodeStyle(context.nextEpisodeNumber);
  const systemPrompt = context.styleGuide || 'Write in a warm, child-friendly JoyMaze educational style.';
  const userPrompt = buildPrompt(context, artStyle);

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

  const episodeJson = buildEpisodeJson(brief, context, artStyle);
  const episodeFolderName = `ep${String(context.nextEpisodeNumber).padStart(2, '0')}-${episodeJson.slug}`;
  const episodeDir = path.join('output', 'longform', 'animal', episodeFolderName).replace(/\\/g, '/');
  const poolIds = {
    animal_background_ambient: getLowestUsedPoolEntry(context.sunoPool, 'animal_background_ambient')?.id || null,
  };

  console.log('');
  console.log(`  Animal: ${episodeJson.animalName}`);
  console.log(`  Hook:   "${episodeJson.hookFact}"`);
  console.log(`  Fact 1: ${episodeJson.fact1?.description?.substring(0, 80)}...`);
  console.log(`  Fact 5: ${episodeJson.fact5?.description?.substring(0, 80)}...`);
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

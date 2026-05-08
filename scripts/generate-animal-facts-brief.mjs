#!/usr/bin/env node

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildVideoViralityBlock, loadVideoViralityRules } from './lib/video-virality.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ANIMAL_LONGFORM_DIR = path.join(ROOT, 'output', 'longform', 'animal');
const SUNO_POOL_PATH = path.join(ROOT, 'config', 'suno-prompt-pool.json');
const ANIMAL_SONG_TOPIC_BANK_PATH = path.join(ROOT, 'config', 'animal-song-topic-bank.json');
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
  let animalSongTopicBank = null;
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

  const videoViralityRules = await loadVideoViralityRules();

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
    animalSongTopicBank = JSON.parse(await fs.readFile(ANIMAL_SONG_TOPIC_BANK_PATH, 'utf-8'));
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
    videoViralityRules,
    sunoPool,
    contentIntelligence,
    patternInterrupts,
    animalSongTopicBank,
    recentEpisodes,
    nextEpisodeNumber,
  };
}

function getCandidateAnimalTopics(context) {
  const topics = context.animalSongTopicBank?.topics;
  if (!Array.isArray(topics)) return [];
  const recentSlugs = new Set(
    (context.recentEpisodes || [])
      .map((name) => String(name).match(/^ep\d+-(.+)$/i)?.[1] || '')
      .filter(Boolean)
  );

  return topics
    .filter((topic) => !recentSlugs.has(topic.slug))
    .sort((a, b) => {
      const championDiff = Number(Boolean(b.championTier)) - Number(Boolean(a.championTier));
      if (championDiff !== 0) return championDiff;
      const scoreA = (a.songabilityScore || 0) + (a.visualDistinctivenessScore || 0) + (a.surpriseScore || 0) + (a.sceneVarietyScore || 0);
      const scoreB = (b.songabilityScore || 0) + (b.visualDistinctivenessScore || 0) + (b.surpriseScore || 0) + (b.sceneVarietyScore || 0);
      return scoreB - scoreA;
    });
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
    videoViralityRules,
    sunoPool,
    contentIntelligence,
    patternInterrupts,
    recentEpisodes,
    nextEpisodeNumber,
  } = context;

  const candidateTopics = getCandidateAnimalTopics(context).slice(0, 6);

  const viralityBlock = buildVideoViralityBlock(videoViralityRules, 'animal_song_short');

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
    ? `\nHook pattern references (use for opening lyric energy — surprising, direct, curiosity-gap, replayable):\n${patternInterrupts.interrupts
        .filter((i) => i.brand_safe !== false && i.subtype !== 'edutainment')
        .slice(0, 3)
        .map((i) => `- [${i.subtype}] ${i.topic}`)
        .join('\n')}`
    : '';

  const candidateTopicsBlock = candidateTopics.length
    ? `\nPreferred animal-song source topics (choose one and preserve its best hook/fact logic):\n${candidateTopics.map((topic) => `- ${topic.animalName} | hook trait: ${topic.signatureHookTrait} | fact beats: ${topic.factBeats.slice(0, 4).join(' / ')} | loop idea: ${topic.loopEndingIdea}`).join('\n')}`
    : '';

  const selectedBackground = getLowestUsedPoolEntry(sunoPool, 'animal_background_ambient');
  const backgroundRule = selectedBackground
    ? `\nFor "backgroundSunoPrompt", copy this verbatim: "${selectedBackground.prompt}"`
    : '\nFor "backgroundSunoPrompt", write one sentence of ambient background music that fits the animal\'s environment. No lyrics, children\'s documentary feel.';

  // Psychology trigger descriptions — tell Groq HOW to implement each trigger
  const psychBlock = psychTriggers
    ? `
## PSYCHOLOGY TRIGGER INJECTION
Write the song beats so they activate these feelings:
- openingLyric → CURIOSITY_GAP: immediate wonder from the first sung line, no slow setup
- beat1 → COMPLETION_SATISFACTION: instant delight from naming the animal and landing its strongest visible trait
- beat2 → CURIOSITY_GAP: a surprising adaptation or behavior that makes the viewer lean in
- beat3 → NOSTALGIA or PLAY: rhythmic, lovable, relatable, or funny motion/behavior
- beat4 → COMPLETION_SATISFACTION: strongest payoff beat, often the cutest or most impressive visual idea
- loopEnding → NOSTALGIA + REPLAY: should feel natural, circular, and satisfying enough to restart
`
    : '';

  const visualStyleBlock = `
## VISUAL STYLE (apply to every imagePromptHint)
- Image format: vertical portrait, 1024×1536 px — every imagePromptHint MUST end with "vertical portrait format, 1024×1536 px"
- Bottom 15% of every image must be clear (no animals, no objects) — text overlay zone
- Compose with safe breathing room above and below the main subject so vertical reel framing does not crop away the core action.
- BOTTOM FADE (mandatory every scene): ground or environment at the lower edge must dissolve softly into light cream or pale white — like paint fading into paper. Include "ground fades softly to pale cream at lower edge" in every imagePromptHint.
- Art style for this episode (use EXACTLY this style across ALL images — never deviate): ${artStyle}
- No text, logos, watermarks, or human characters in any image.
- 3-SECOND VISUAL RULE: each image must communicate the beat visually in 3 seconds without audio. If the image prompt doesn't make this possible, rewrite it.

## SHOT TYPE RULES
Use these framing types across beats:
- ESTABLISHING: wide shot — animal small in frame, full environment visible
- MEDIUM: mid-body shot — animal fills roughly half the frame, some environment visible
- CLOSE-UP: face or key feature fills most of the frame, background softly blurred
- ACTION: animal in motion — blur, dynamic pose, energy implied

Recommended beat spread:
- beat1: ESTABLISHING or MEDIUM
- beat2: ACTION or MEDIUM
- beat3: ACTION or CLOSE-UP
- beat4: CLOSE-UP or MEDIUM
- loopEnding: MEDIUM or ESTABLISHING with strong restart energy
`;

  return `You are planning a JoyMaze Animal Facts Song Short for kids ages 4-8 and their parents.
Episode number: ${nextEpisodeNumber}
Format: **animal named immediately -> all-song from first line -> escalating fact wonder -> loop ending**.
${viralityBlock ? `\n## SHARED VIRAL VIDEO STRUCTURE CONTRACT\n${viralityBlock}\n` : ''}${recentEpisodesBlock}${trendsBlock}${dynamicThemesBlock}${competitorBlock}${hooksBlock}${perfWeightsBlock}${contentIntelBlock}${patternInterruptBlock}${candidateTopicsBlock}${backgroundRule}
${psychBlock}${visualStyleBlock}
Return one JSON object with EXACTLY this shape (no extra fields, no missing fields):
{
  "animalName": "Fennec Fox",
  "slug": "fennec-fox",
  "openingHookLine": "Fennec fox, tiny body, giant ears in the desert sun!",
  "songBeats": [
    {
      "key": "beat1",
      "title": "Immediate animal + strongest trait",
      "lyric": "string — short, catchy, factually clear lyric line",
      "factFocus": "string — the factual idea this beat is built on",
      "shotType": "ESTABLISHING or MEDIUM",
      "compositionNote": "string — 1 sentence",
      "psychologyBeat": "string — 3-6 words",
      "imagePromptHint": "string — 50-70 words full Gemini prompt"
    },
    {
      "key": "beat2",
      "title": "Escalating wonder beat",
      "lyric": "string",
      "factFocus": "string",
      "shotType": "MEDIUM or ACTION",
      "compositionNote": "string — 1 sentence",
      "psychologyBeat": "string — 3-6 words",
      "imagePromptHint": "string — 50-70 words full Gemini prompt"
    },
    {
      "key": "beat3",
      "title": "Most dynamic or surprising fact beat",
      "lyric": "string",
      "factFocus": "string",
      "shotType": "ACTION or CLOSE-UP",
      "compositionNote": "string — 1 sentence",
      "psychologyBeat": "string — 3-6 words",
      "imagePromptHint": "string — 50-70 words full Gemini prompt"
    },
    {
      "key": "beat4",
      "title": "Payoff beat",
      "lyric": "string",
      "factFocus": "string",
      "shotType": "CLOSE-UP or MEDIUM",
      "compositionNote": "string — 1 sentence",
      "psychologyBeat": "string — 3-6 words",
      "imagePromptHint": "string — 50-70 words full Gemini prompt"
    },
    {
      "key": "loopEnding",
      "title": "Loop ending beat",
      "lyric": "string — should reconnect naturally to the opening energy",
      "factFocus": "string",
      "shotType": "MEDIUM or ESTABLISHING",
      "compositionNote": "string — 1 sentence",
      "psychologyBeat": "string — 3-6 words",
      "imagePromptHint": "string — 50-70 words full Gemini prompt"
    }
  ],
  "visualExpansionMoments": [
    {
      "key": "moment1",
      "beatKey": "beat1",
      "title": "string — short creative label",
      "lyricFocus": "string — the exact lyric chunk or phrase this creative supports",
      "factFocus": "string — factual idea shown in this creative",
      "shotType": "ESTABLISHING or MEDIUM or ACTION or CLOSE-UP",
      "compositionNote": "string — 1 sentence",
      "psychologyBeat": "string — 3-6 words",
      "imagePromptHint": "string — 50-70 words full Gemini prompt"
    }
  ],
  "loopBackIdea": "string — 1 sentence on how the ending loops back into the opening line",
  "fullSongLyrics": "string — full short song, multi-line, includes the opening line and all beat ideas",
  "songSunoPrompt": "string — upbeat children's animal fact song, earworm cadence, loop-friendly, rich enough to support a longer fact reel when the song quality is strong",
  "backgroundSunoPrompt": "string"
}

Hard rules:
- Animal must be educationally rich for ages 4-8 and NOT in the recentEpisodes list.
- Name the animal immediately in the opening line. Do not build a standalone reveal scene.
- No CTA language at all.
- No numbered fact-classroom tone.
- The whole format is a song, not a prose explainer plus a song ending.
- Each lyric line must be short, sticky, child-friendly, and visually legible.
- Richer copy is allowed when it stays musical, clear, and replayable. Do not flatten strong material just to force a short runtime.
- The final reel should follow the selected song, not force the song to fit a fixed short duration.
- Keep \`songBeats\` as the lyrical spine, but make \`visualExpansionMoments\` the wider creative plan for production.
- For stronger / longer songs, \`visualExpansionMoments\` should usually expand to 8-10 creatives, even if \`songBeats\` stays at 4-5 beats.
- Beat 1 and the payoff beat must not cash out the same core fact. The opener should land the instantly graspable visible trait, while the payoff should reveal why that trait matters, what the animal does with it, or what emotional/factual resolve it earns.
- Every beat must contribute a different kind of wonder: visible trait, action, weird ability, care behavior, survival trick, tool use, home/family payoff, or another clearly distinct angle. Do not restate the same fact with different wording.
- Every visualExpansionMoment must feel visually distinct from the others. No duplicate holds disguised as separate ideas.
- The final visualExpansionMoment should usually be an explicit emotional/factual payoff, not just another pretty return or travel shot.
- Prefer a concrete end resolve such as home, burrow, chick, family, food delivery, cuddle, sleep, shell crack success, safe floating, or another unmistakable “why this matters” image when the material supports it.
- Choose 5 song beats only if the animal supports 5 truly strong beats. Avoid filler energy.
- Every beat must be understandable in 2-3 seconds visually.
- factFocus should stay factual and clear. Do not fabricate facts.
- Every imagePromptHint: 50-70 words, complete Gemini generation prompt. MUST include: animal species, shotType framing, environment, lighting mood, foreground detail, background depth, one focal action, "ground fades softly to pale cream at lower edge", "vertical portrait format, 1024×1536 px". Do NOT include text or logos.
- compositionNote: 1 sentence. What is in foreground, background, lighting direction, animal posture or expression.
- psychologyBeat: 3-6 words. The emotional beat this image serves.
- fullSongLyrics should feel musical and replayable, not like stitched prose facts.
- Avoid generic filler rhymes or scenery-only lines. Every sung line should either name a trait, show behavior, deepen wonder, or cash out the payoff.
- loopBackIdea must explicitly describe why the last line can feed back into the first line.
- If a background pool prompt was provided above, copy it verbatim into "backgroundSunoPrompt".`;
}

function expandImagePromptHint({ animalName, artStyle, beat, fallbackEnvironment = 'natural habitat' }) {
  const shotType = beat?.shotType || 'MEDIUM';
  const composition = beat?.compositionNote || `${animalName} shown clearly in its environment`;
  const factFocus = beat?.factFocus || '';
  const psychologyBeat = beat?.psychologyBeat || 'playful wonder';
  const lyric = beat?.lyric || '';
  const lightingMood = /night|moon|sleep/i.test(`${composition} ${factFocus} ${lyric}`)
    ? 'soft moonlit blue darkness with a gentle rim light on the animal'
    : /sunny|warm|desert|golden/i.test(`${composition} ${factFocus} ${lyric}`)
      ? 'warm late-afternoon sunlight with long readable shadows'
      : /danger|fright|defen/i.test(`${composition} ${factFocus} ${lyric}`)
        ? 'tense directional light with stronger contrast on the face and body'
        : 'soft natural daylight with clear directional light on the subject';
  const focalAction = /dig/i.test(`${composition} ${factFocus} ${lyric}`)
    ? 'one clawed digging action frozen mid-scrape with dirt visibly moving'
    : /curl|ball/i.test(`${composition} ${factFocus} ${lyric}`)
      ? 'the body curling inward so the defense behavior reads instantly'
      : /sniff|insect|eat|food/i.test(`${composition} ${factFocus} ${lyric}`)
        ? 'nose low to the ground as the animal tracks food with intent'
        : /burrow|home|return/i.test(`${composition} ${factFocus} ${lyric}`)
          ? 'the animal entering or reaching home in a way that clearly pays off the journey'
          : 'one instantly readable signature action that makes the fact obvious';
  const foregroundDetail = /close/i.test(String(shotType))
    ? 'sharp whiskers, claws, eyes, and shell texture in the foreground'
    : 'the animal large in frame with one crisp foreground detail like claws, shell plates, or sand texture';
  const backgroundDepth = `layered ${fallbackEnvironment} depth behind the subject with a simple horizon or habitat cue, kept soft enough that the animal reads first`;
  const base = [
    `${animalName}, ${shotType} framing, ${composition}.`,
    `Foreground detail: ${foregroundDetail}.`,
    `Background depth: ${backgroundDepth}.`,
    `Lighting mood: ${lightingMood}.`,
    `Focal action: ${focalAction}.`,
    `Show the factual idea clearly: ${factFocus}.`,
    `Lyric support: ${lyric || 'make the sung line feel obvious in one glance'}.`,
    `Mood should feel like ${psychologyBeat}, with child-friendly readability and strong visual clarity in 2-3 seconds.`,
    `Use ${artStyle}.`,
    `Keep the scene in ${fallbackEnvironment}, no text or logos, ground fades softly to pale cream at lower edge, vertical portrait format, 1024×1536 px, with safe breathing room above and below the subject for reel framing.`,
  ].join(' ');

  const existing = String(beat?.imagePromptHint || '').trim();
  if (!existing) return base;
  const normalized = `${existing.replace(/\s+/g, ' ').trim()} ${base}`.replace(/\s+/g, ' ').trim();
  return normalized;
}

function synthesizeVisualExpansionMomentsFromBeats(songBeats = []) {
  return songBeats.flatMap((beat, index) => {
    const beatKey = beat?.key || `beat${index + 1}`;
    const shotType = String(beat?.shotType || '').toUpperCase();
    const dynamic = /ACTION|ESTABLISHING/.test(shotType);
    const isLastBeat = index === songBeats.length - 1;
    return [
      {
        key: `${beatKey}-main`,
        beatKey,
        title: beat?.title || `Moment ${index + 1}`,
        lyricFocus: beat?.lyric || '',
        factFocus: beat?.factFocus || '',
        shotType: beat?.shotType || 'MEDIUM',
        compositionNote: beat?.compositionNote || '',
        psychologyBeat: beat?.psychologyBeat || '',
        imagePromptHint: beat?.imagePromptHint || '',
        imageAsset: `moment${index * 2 + 1}.png`,
      },
      {
        key: isLastBeat ? `${beatKey}-resolve` : `${beatKey}-accent`,
        beatKey,
        title: isLastBeat ? `${beat?.title || `Moment ${index + 1}`} payoff resolve` : `${beat?.title || `Moment ${index + 1}`} accent`,
        lyricFocus: beat?.lyric || '',
        factFocus: isLastBeat ? `${beat?.factFocus || ''} final payoff at home or family context`.trim() : (beat?.factFocus || ''),
        shotType: isLastBeat ? 'MEDIUM' : (dynamic ? 'ACTION' : 'MEDIUM'),
        compositionNote: isLastBeat
          ? `Explicit end payoff moment: ${beat?.compositionNote || ''} Show why the return or final beat matters in a concrete home, family, burrow, nest, cuddle, or feeding context.`.trim()
          : (beat?.compositionNote || ''),
        psychologyBeat: isLastBeat ? 'earned payoff resolve' : (beat?.psychologyBeat || ''),
        imagePromptHint: beat?.imagePromptHint || '',
        imageAsset: `moment${index * 2 + 2}.png`,
      },
    ];
  });
}

function normalizeCreativeMoments(moments, { animalName, artStyle, fallbackEnvironment }) {
  if (!Array.isArray(moments)) return [];
  return moments.map((moment) => {
    const wordCount = String(moment?.imagePromptHint || '').split(/\s+/).filter(Boolean).length;
    if (wordCount >= 70) return moment;
    return {
      ...moment,
      imagePromptHint: expandImagePromptHint({ animalName, artStyle, beat: moment, fallbackEnvironment }),
    };
  });
}

function normalizeBrief(brief, context, artStyle) {
  if (!brief || typeof brief !== 'object') return brief;
  const topic = getCandidateAnimalTopics(context).find((item) => item.animalName === brief.animalName || item.slug === brief.slug);
  const fallbackEnvironment = topic?.habitat || 'natural habitat';

  brief.songBeats = normalizeCreativeMoments(brief.songBeats, { animalName: brief.animalName, artStyle, fallbackEnvironment });
  const suppliedMoments = Array.isArray(brief.visualExpansionMoments) && brief.visualExpansionMoments.length >= 6
    ? brief.visualExpansionMoments
    : synthesizeVisualExpansionMomentsFromBeats(brief.songBeats);
  brief.visualExpansionMoments = normalizeCreativeMoments(suppliedMoments, { animalName: brief.animalName, artStyle, fallbackEnvironment });

  return brief;
}

function normalizeSemanticWords(text, animalName = '') {
  const animalWords = String(animalName || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const stop = new Set([
    'with', 'from', 'that', 'this', 'into', 'over', 'under', 'their', 'there', 'where', 'while', 'about', 'little', 'tiny', 'giant', 'animal', 'animals', 'song', 'beat', 'loop', 'back', 'again', 'really', 'very', 'just', 'like', 'they', 'them', 'then', 'than', 'your', 'into', 'onto', 'across', ...animalWords,
  ]);

  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stop.has(word));
}

function hasExcessiveSemanticOverlap(a, b, animalName = '') {
  const aWords = new Set(normalizeSemanticWords(a, animalName));
  const bWords = new Set(normalizeSemanticWords(b, animalName));
  if (!aWords.size || !bWords.size) return false;
  const overlap = [...aWords].filter((word) => bWords.has(word));
  return overlap.length >= 2;
}

function validateBrief(brief) {
  if (!brief || typeof brief !== 'object') {
    throw new Error('Groq response was not a JSON object.');
  }

  const requiredPaths = [
    ['animalName'],
    ['slug'],
    ['openingHookLine'],
    ['loopBackIdea'],
    ['fullSongLyrics'],
    ['songSunoPrompt'],
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

  if (!Array.isArray(brief.songBeats) || brief.songBeats.length < 4) {
    throw new Error('Brief field missing or too short: songBeats (minimum 4 beats required).');
  }

  for (let i = 0; i < brief.songBeats.length; i++) {
    const beat = brief.songBeats[i];
    if (!beat || typeof beat !== 'object') {
      throw new Error(`songBeats[${i}] is missing or invalid.`);
    }
    for (const key of ['key', 'title', 'lyric', 'factFocus', 'shotType', 'compositionNote', 'psychologyBeat', 'imagePromptHint']) {
      if (typeof beat[key] !== 'string' || beat[key].trim().length === 0) {
        throw new Error(`songBeats[${i}].${key} is missing.`);
      }
    }
    const wordCount = beat.imagePromptHint.split(/\s+/).filter(Boolean).length;
    if (wordCount < 40) {
      throw new Error(`songBeats[${i}].imagePromptHint too short (${wordCount} words — minimum 40, target 50-70).`);
    }
  }

  if (!Array.isArray(brief.visualExpansionMoments) || brief.visualExpansionMoments.length < 6) {
    throw new Error('Brief field missing or too short: visualExpansionMoments (minimum 6 creatives required).');
  }

  for (let i = 0; i < brief.visualExpansionMoments.length; i++) {
    const moment = brief.visualExpansionMoments[i];
    if (!moment || typeof moment !== 'object') {
      throw new Error(`visualExpansionMoments[${i}] is missing or invalid.`);
    }
    for (const key of ['key', 'beatKey', 'title', 'lyricFocus', 'factFocus', 'shotType', 'compositionNote', 'psychologyBeat', 'imagePromptHint']) {
      if (typeof moment[key] !== 'string' || moment[key].trim().length === 0) {
        throw new Error(`visualExpansionMoments[${i}].${key} is missing.`);
      }
    }
    const wordCount = moment.imagePromptHint.split(/\s+/).filter(Boolean).length;
    if (wordCount < 40) {
      throw new Error(`visualExpansionMoments[${i}].imagePromptHint too short (${wordCount} words — minimum 40, target 50-70).`);
    }
  }

  if (!/\b${''}/.source) {
    // no-op placeholder to avoid accidental template interpolation confusion in exact replacement block
  }

  if (!new RegExp(`\\b${String(brief.animalName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(brief.openingHookLine)) {
    throw new Error('openingHookLine must name the animal immediately.');
  }

  const songBeats = brief.songBeats || [];
  for (let i = 1; i < songBeats.length; i++) {
    const prev = songBeats[i - 1];
    const current = songBeats[i];
    if (hasExcessiveSemanticOverlap(prev.factFocus, current.factFocus, brief.animalName)) {
      throw new Error(`songBeats[${i - 1}] and songBeats[${i}] repeat the same core fact instead of escalating.`);
    }
  }

  const openingFact = `${brief.openingHookLine} ${songBeats[0]?.factFocus || ''} ${songBeats[0]?.lyric || ''}`;
  const payoffBeat = songBeats.find((beat) => /payoff/i.test(String(beat?.title || ''))) || songBeats[Math.max(songBeats.length - 2, 0)];
  if (payoffBeat && hasExcessiveSemanticOverlap(openingFact, `${payoffBeat.factFocus} ${payoffBeat.lyric}`, brief.animalName)) {
    throw new Error('The opener and payoff are repeating the same core fact. Give the payoff a different factual or emotional cash-out.');
  }

  const finalMoment = brief.visualExpansionMoments[brief.visualExpansionMoments.length - 1];
  if (finalMoment && /scenic|pretty|beautiful view|nice view/i.test(`${finalMoment.factFocus} ${finalMoment.compositionNote}`)) {
    throw new Error('Final visualExpansionMoment is reading like generic scenery instead of a concrete payoff image.');
  }

  if (/follow|subscribe|favorite fact|what did you learn|comment below|tell us/i.test(`${brief.fullSongLyrics} ${brief.loopBackIdea}`)) {
    throw new Error('CTA-style language detected in the sung-first brief.');
  }
}

function buildWideExpansionMoments(songBeats = [], suppliedMoments = []) {
  if (Array.isArray(suppliedMoments) && suppliedMoments.length > 0) {
    return suppliedMoments.map((moment, index) => ({
      ...moment,
      imageAsset: moment.imageAsset || `moment${index + 1}.png`,
    }));
  }

  return synthesizeVisualExpansionMomentsFromBeats(songBeats);
}

function buildSongScenePlan(songBeats = [], visualExpansionMoments = []) {
  const moments = buildWideExpansionMoments(songBeats, visualExpansionMoments);
  return moments.map((moment, index) => {
    const shotType = String(moment?.shotType || '').toUpperCase();
    const dynamic = /ACTION|ESTABLISHING/.test(shotType);
    const isFirst = index === 0;
    const isLast = index === moments.length - 1;
    const wordCount = String(moment?.lyricFocus || '').split(/\s+/).filter(Boolean).length;
    const durationWeight = Math.max(0.6, Math.min(1.8, wordCount / 7) + (isFirst ? 0.15 : 0) + (isLast ? 0.2 : 0));

    return {
      key: moment.key || `scene-${index + 1}`,
      beatKey: moment.beatKey || songBeats[Math.min(index, Math.max(songBeats.length - 1, 0))]?.key || `beat${index + 1}`,
      lyric: moment.lyricFocus || songBeats.find((beat) => beat.key === moment.beatKey)?.lyric || '',
      imageIndex: index,
      durationWeight: Number(durationWeight.toFixed(2)),
      cameraPreset: dynamic ? (isFirst ? 'wide-sweep' : 'lift-up') : (isLast ? 'loop-return' : index % 2 === 0 ? 'push-in' : 'drift-right'),
      captionLabel: moment.factFocus || moment.title || '',
      imageAsset: moment.imageAsset || `moment${index + 1}.png`,
    };
  });
}

function buildEpisodeJson(brief, context, artStyle) {
  const selectedBackground = getLowestUsedPoolEntry(context.sunoPool, 'animal_background_ambient');
  const songBeats = Array.isArray(brief.songBeats) ? brief.songBeats : [];
  const visualExpansionMoments = buildWideExpansionMoments(songBeats, brief.visualExpansionMoments);

  return {
    format: 'animal-facts-song-short',
    episodeNumber: context.nextEpisodeNumber,
    animalName: brief.animalName,
    slug: brief.slug,
    date: TODAY,
    artStyle,
    structure: 'named-immediately-all-song-loop',
    timingRule: 'follow-selected-song',
    psychologyMap: {
      openingLyric: 'CURIOSITY_GAP',
      beat1: 'COMPLETION_SATISFACTION',
      beat2: 'CURIOSITY_GAP',
      beat3: 'PLAY',
      beat4: 'COMPLETION_SATISFACTION',
      loopEnding: 'REPLAY',
    },
    openingHookLine: brief.openingHookLine,
    loopBackIdea: brief.loopBackIdea,
    songBeats,
    visualExpansionMoments,
    fullSongLyrics: brief.fullSongLyrics,
    songDurationTargetSec: 32,
    selectedSongDurationSec: null,
    songScenePlan: buildSongScenePlan(songBeats, visualExpansionMoments),
    sunoPrompts: {
      fullSong: brief.songSunoPrompt,
      background: selectedBackground?.prompt || brief.backgroundSunoPrompt,
    },
    jingleDropPaths: {
      background: 'background.mp3',
      fullSong: 'song.mp3',
    },
    rendered: false,
  };
}

function buildBriefMd(episode, episodeDir) {
  const psychologyRows = Object.entries(episode.psychologyMap)
    .map(([segment, trigger]) => `| ${segment} | ${trigger} |`)
    .join('\n');

  const beatImageSections = (episode.songBeats || [])
    .map((beat, index) => `
## ${beat.title || `Beat ${index + 1}`} → core beat anchor, save as \`beat${index + 1}.png\`
**Shot type:** ${beat.shotType || 'MEDIUM'} · **Psychology beat:** _${beat.psychologyBeat || ''}_
**Fact focus:** ${beat.factFocus || ''}
**Composition:** ${beat.compositionNote || ''}

**Lyric:** ${beat.lyric || ''}

Image prompt (paste into Gemini):
\`\`\`
${beat.imagePromptHint}
\`\`\`
`).join('');

  const wideExpansionSections = (episode.visualExpansionMoments || [])
    .map((moment, index) => `
## ${moment.title || `Creative ${index + 1}`} → expanded creative, save as \`${moment.imageAsset || `moment${index + 1}.png`}\`
**Linked beat:** ${moment.beatKey || ''} · **Shot type:** ${moment.shotType || 'MEDIUM'} · **Psychology beat:** _${moment.psychologyBeat || ''}_
**Fact focus:** ${moment.factFocus || ''}
**Composition:** ${moment.compositionNote || ''}

**Lyric focus:** ${moment.lyricFocus || ''}

Image prompt (paste into Gemini):
\`\`\`
${moment.imagePromptHint}
\`\`\`
`).join('');

  const beatLyricReference = (episode.songBeats || [])
    .map((beat, index) => `**Beat ${index + 1} — ${beat.title || beat.key}:** ${beat.lyric}\n\n_Fact focus:_ ${beat.factFocus || ''}`)
    .join('\n\n');

  return `# Animal Facts Song Short Brief: ${episode.animalName}

- Episode number: ${episode.episodeNumber}
- Date: ${episode.date}
- Folder: ${episodeDir}
- Structure: ${episode.structure}

## Episode Visual Style — set this in Gemini BEFORE generating any image
- **Art style:** ${episode.artStyle}
- **Apply to ALL beat images in one Gemini session** for consistency

## Opening Hook Line
${episode.openingHookLine}

## Loop Back Idea
${episode.loopBackIdea}

---
## IMAGES — Generate in Gemini, drop into episode folder with exact filenames below
### Core beat anchors
${beatImageSections}

### Wide expansion creatives
${wideExpansionSections}
---

## Beat Lyrics (reference)

${beatLyricReference}

---

## Full Song Lyrics
\`\`\`
${episode.fullSongLyrics}
\`\`\`

## Short-Form Song Contract
- Animal named immediately in first sung line
- Entire reel is song-driven from start to finish
- No CTA
- Loop ending required
- Selected song becomes the duration source of truth for final render timing
- Stronger songs may justify a longer fact reel with richer copy and more visual moments
- Longer songs should usually trigger more creatives, not longer holds on the same 5 images
- The final expanded creative should usually be the clearest home/family/payoff image in the reel
- Required core beat images: ${(episode.songBeats || []).map((_, index) => `\`beat${index + 1}.png\``).join(', ')}
- Preferred expanded creative images: ${(episode.visualExpansionMoments || []).map((moment, index) => `\`${moment.imageAsset || `moment${index + 1}.png`}\``).join(', ')}

## Suno Drop Instructions
Drop these MP3 files into the episode folder with exact filenames:
- \`background.mp3\` — background Suno prompt below
- \`song.mp3\` — full song Suno prompt below

**Background Suno prompt:**
\`\`\`
${episode.sunoPrompts.background}
\`\`\`

**Full song Suno prompt:**
\`\`\`
${episode.sunoPrompts.fullSong}
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

  const MAX_BRIEF_ATTEMPTS = 3;
  let brief;
  let validationError = null;
  for (let attempt = 1; attempt <= MAX_BRIEF_ATTEMPTS; attempt++) {
    if (attempt > 1) console.log(`  Brief retry attempt ${attempt}/${MAX_BRIEF_ATTEMPTS} (validation failed)...`);
    const attemptUserPrompt = attempt === 1
      ? userPrompt
      : `${userPrompt}\n\nIMPORTANT: Every imagePromptHint field must be at least 50 words. Write detailed, specific visual descriptions.`;
    console.log(`  Calling Groq (${GROQ_MODEL})...`);
    brief = await callGroq(systemPrompt, attemptUserPrompt);
    brief = normalizeBrief(brief, context, artStyle);
    validationError = null;
    try {
      validateBrief(brief);
      break;
    } catch (err) {
      validationError = err;
      console.error(`  Attempt ${attempt}/${MAX_BRIEF_ATTEMPTS} failed validation: ${err.message}`);
    }
  }

  // Build episodeJson first so we know the folder name regardless of validateBrief outcome
  const episodeJson = buildEpisodeJson(brief, context, artStyle);
  const episodeFolderName = `ep${String(context.nextEpisodeNumber).padStart(2, '0')}-${episodeJson.slug}`;
  const episodeDir = path.join('output', 'longform', 'animal', episodeFolderName).replace(/\\/g, '/');

  console.log('');
  console.log(`  Animal: ${episodeJson.animalName}`);
  console.log(`  Open:   "${episodeJson.openingHookLine}"`);
  console.log(`  Beat 1: ${episodeJson.songBeats?.[0]?.lyric?.substring(0, 80) || ''}`);
  console.log(`  Loop:   ${episodeJson.songBeats?.[episodeJson.songBeats.length - 1]?.lyric?.substring(0, 80) || ''}`);
  console.log('');

  if (!SAVE) {
    if (validationError) {
      console.error(`  \u26a0\ufe0f validateBrief failed: ${validationError.message}`);
      console.error('  Re-run with --save to write the raw brief for inspection before regenerating.');
    }
    return;
  }

  // Always create the folder first -- even if validation failed.
  // This lets the user inspect the raw output and retry without re-running Groq.
  await fs.mkdir(path.join(ANIMAL_LONGFORM_DIR, episodeFolderName), { recursive: true });
  await fs.writeFile(
    path.join(ANIMAL_LONGFORM_DIR, episodeFolderName, 'brief-raw.json'),
    `${JSON.stringify(brief, null, 2)}\n`,
  );

  if (validationError) {
    console.error(`  \u26a0\ufe0f validateBrief failed: ${validationError.message}`);
    console.error(`  Raw brief written to ${episodeDir}/brief-raw.json -- fix the generator and re-run.`);
    // Write a placeholder episode.json so the folder is complete
    await fs.writeFile(
      path.join(ANIMAL_LONGFORM_DIR, episodeFolderName, 'episode.json'),
      `${JSON.stringify({ error: validationError.message, animalName: episodeJson.animalName }, null, 2)}\n`,
    );
    process.exit(1);
  }

  const poolIds = {
    animal_background_ambient: getLowestUsedPoolEntry(context.sunoPool, 'animal_background_ambient')?.id || null,
  };

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

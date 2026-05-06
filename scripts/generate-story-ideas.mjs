#!/usr/bin/env node

/**
 * JoyMaze Content — Story Idea Generator
 *
 * Generates complete Archetype 8 "Joyo's Story Corner" episode concepts:
 * - Story title + theme
 * - 8-slide narration (hook, body escalation, emotional resolution, echo)
 * - Per-slide image prompt for Gemini/ChatGPT generation
 * - Outputs a ready-to-use story.json + companion image-prompts.md
 *
 * Usage:
 *   node scripts/generate-story-ideas.mjs                     # Generate 1 story idea, preview only
 *   node scripts/generate-story-ideas.mjs --save              # Save story.json + image-prompts.md
 *   node scripts/generate-story-ideas.mjs --episode 2         # Set episode number
 *   node scripts/generate-story-ideas.mjs --theme "lost bird" # Seed the theme
 *   node scripts/generate-story-ideas.mjs --count 3           # Generate 3 concepts (preview)
 *   node scripts/generate-story-ideas.mjs --dry-run           # Show system prompt, no API call
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildVideoViralityBlock, loadVideoViralityRules } from './lib/video-virality.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SAVE = args.includes('--save');
const episodeIdx = args.indexOf('--episode');
const EPISODE = episodeIdx !== -1 ? parseInt(args[episodeIdx + 1], 10) : null;
const themeIdx = args.indexOf('--theme');
const THEME_SEED = themeIdx !== -1 ? args[themeIdx + 1] : null;
const countIdx = args.indexOf('--count');
const COUNT = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 1;
const laneIdx = args.indexOf('--lane');
const STORY_LANE = laneIdx !== -1 ? args[laneIdx + 1] : null;
const slidesIdx = args.indexOf('--slides');
const SLIDE_COUNT = slidesIdx !== -1 ? parseInt(args[slidesIdx + 1], 10) : 8;

// Determine next episode number from existing stories
async function getNextEpisode() {
  if (EPISODE !== null) return EPISODE;
  const storiesDir = path.join(ROOT, 'output', 'stories');
  try {
    const entries = await fs.readdir(storiesDir);
    const epNumbers = entries
      .map(e => e.match(/^ep(\d+)-/))
      .filter(Boolean)
      .map(m => parseInt(m[1], 10));
    return epNumbers.length > 0 ? Math.max(...epNumbers) + 1 : 1;
  } catch {
    return 1;
  }
}

// Scan existing story folders to avoid repeating themes and character species
async function getExistingStories() {
  const storiesDir = path.join(ROOT, 'output', 'stories');
  try {
    const entries = await fs.readdir(storiesDir);
    const titles = [];
    for (const e of entries) {
      const jsonPath = path.join(storiesDir, e, 'story.json');
      try {
        const data = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
        const charNote = data.character ? ` [character: ${data.character.split(',')[0]}]` : '';
        titles.push(`Episode ${data.episode}: ${data.title} — ${data.theme}${charNote}`);
      } catch {}
    }
    return titles;
  } catch {
    return [];
  }
}

async function loadStyleContext() {
  const [styleGuide, archetypes] = await Promise.all([
    fs.readFile(path.join(ROOT, 'config', 'writing-style.md'), 'utf-8'),
    fs.readFile(path.join(ROOT, 'docs', 'CONTENT_ARCHETYPES.md'), 'utf-8'),
  ]);

  let trends = null;
  let weights = null;
  let competitor = null;
  let hooksData = null;
  let dynamicThemes = null;

  try {
    trends = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8'));
  } catch {}

  try {
    weights = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'performance-weights.json'), 'utf-8'));
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

  let psychTriggers = null;
  try {
    psychTriggers = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'psychology-triggers.json'), 'utf-8'));
  } catch {}

  let storySourceBank = null;
  try {
    storySourceBank = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'story-source-bank.json'), 'utf-8'));
  } catch {}

  const videoViralityRules = await loadVideoViralityRules();

  return { styleGuide, archetypes, trends, weights, competitor, hooksData, dynamicThemes, psychTriggers, storySourceBank, videoViralityRules };
}

// Extract only Archetype 8 section from archetypes doc
function extractArchetype8(archetypes) {
  const start = archetypes.indexOf('## ARCHETYPE 8');
  if (start === -1) return archetypes;
  return archetypes.slice(start);
}

// Extract writing voice rules (not the full 670-line guide)
function extractVoiceRules(styleGuide) {
  const sections = [
    'THE HYPNOTIC VOICE',
    'SENTENCE-LEVEL RULES',
    'WHAT NOT TO WRITE',
    'THE 4 HYPNOTIC PILLARS',
  ];
  const lines = styleGuide.split('\n');
  const extracted = [];
  let capturing = false;
  let sectionCount = 0;

  for (const line of lines) {
    const isHeader = line.match(/^##\s+(.+)/);
    if (isHeader) {
      const title = isHeader[1].trim();
      const match = sections.some(s => title.includes(s));
      if (match) {
        capturing = true;
        sectionCount++;
      } else if (capturing) {
        capturing = false;
      }
    }
    if (capturing) extracted.push(line);
    if (sectionCount >= 4 && !capturing) break;
  }
  return extracted.join('\n');
}

function buildSystemPrompt(styleGuide, archetypes, psychTriggers = null, videoViralityRules = null) {
  const voice = extractVoiceRules(styleGuide);
  const arch8 = extractArchetype8(archetypes);
  const viralityBlock = buildVideoViralityBlock(videoViralityRules, 'story_reel_v2');

  const styleRefCount = SLIDE_COUNT;

  return `You are the head writer for "Joyo's Story Corner" — a short-form kids story series by JoyMaze.

${viralityBlock ? `## SHARED VIRAL VIDEO STRUCTURE CONTRACT
${viralityBlock}
` : ''}

Your stories are short-form videos for Instagram Reels, TikTok, and YouTube Shorts. They target parents of children aged 4–8. They are pure story — no product mentions, no CTAs, no brand overlays.

## WRITING RULES (non-negotiable)

<voice-guide>
${voice}
</voice-guide>

## ARCHETYPE 8 — KIDS STORY FORMAT

<archetype>
${arch8}
</archetype>

## 8-BEAT VIRAL STORY ARC — ${SLIDE_COUNT} SLIDES

Every story follows this exact beat structure. One beat per slide. No beat can be skipped or merged.

- **BEAT 1 — THE GRAB (Slide 1):** Drop into a single vivid moment. No scene-setting, no introductions, no "once upon a time." The first sentence IS the hook — it creates a question, a tension, or an image the viewer cannot look away from. ONE sentence in narration. Something is already happening.

- **BEAT 2 — THE STAKES (Slide 2):** Establish what is at risk. Not "she wanted to find a home" — what happens if she fails? What will she lose? Make failure feel real and urgent. The viewer must care before Beat 3.

- **BEAT 3 — THE ATTEMPT (Slide 3):** The character tries the most obvious solution. It doesn't fully work, or it creates a new problem. Show the effort — the trying matters as much as the failing.

- **BEAT 4 — THE DEEPENING (Slide 4):** The problem grows. A new obstacle appears, or what they tried made things worse. The viewer should feel the situation tightening around the character.

- **BEAT 5 — THE BREAK (Slide 5):** The character's lowest moment. They are about to give up, or they do — briefly. This is the emotional bottom. Write it heavy, short, and quiet. Parents need to feel this. It is the beat that makes them lean forward.

- **BEAT 6 — THE TURN (Slide 6):** Something shifts. A piece of knowledge remembered, an unexpected perspective, a small act of help. The solution should feel surprising but inevitable in hindsight. The character's defining quality — the thing that was always there — saves them.

- **BEAT 7 — THE RESOLUTION (Slide 7):** The solution works. But something is different now — the character is changed, not just successful. Show the new state. This is not just victory, it is transformation.

- **BEAT 8 — THE ECHO (Slide 8):** ONE sentence only. No moral. No explanation. A small, specific image or action that contains the entire story. Written last, after everything else. This is what parents screenshot and share. It must land completely without context.

## THE SHARE TRIGGER — WHAT MAKES BEAT 8 WORK

Beat 8 must use one of these three techniques:
1. **Small action, big truth** — a tiny specific act that contains everything: "She flew the same path every full moon. Just in case someone needed guiding."
2. **The reversal** — reframes the whole story in one line: "The thing that made her different was the thing that saved them all."
3. **The sensory anchor** — one physical detail that carries the emotional weight: "The meadow smelled like home. She hadn't known it would."

NEVER end with: "And so she learned..." / "From that day on, she knew..." / "The moral of the story was..."

## HOOK-FIRST ARCHITECTURE

Beat 1 is the only chance to stop a scroll. The first sentence must create an unanswered question.

- NO: "In a forest filled with towering trees, Pip lived with her family." — world-building, viewer scrolls past.
- YES: "The bridge was out. Pip was the only fox who knew another way." — tension, specificity, a question formed immediately.
- YES: "She had one night to find a new home. She had no map." — stakes, urgency, drop into the problem.

## NARRATION RULES — CRITICAL

Each slide's narration is read aloud at TTS speed 0.85. The reel must feel like a real narrated story, not clipped captions.

**TARGET: 18–28 words per slide.**
**Beat 1 hard cap: 16 words. Beat 8 hard cap: 14 words.**

Use enough language to create a meaningful narrated beat. Short-form does not mean emotionally empty.

Other rules:
- 1–2 sentences per slide. Never 3.
- Beat 1: ONE sentence maximum. Immediate danger, tension, or open loop.
- Beats 2–6: give enough detail that the viewer feels progression, not summary.
- Beat 5: the emotional bottom must breathe. Let the sentence feel heavy, not rushed.
- Beat 7: resolution must show change, not just success.
- Beat 8: ONE sentence only. No CTA. No moral. No "more story" energy. It should feel like the world continues after the reel loops.
- No passive voice. Minimal adverbs. No adjective stacking.
- NEVER state the moral. The story does the work.

## IMAGE PROMPT RULES — CRITICAL

Each image_prompt is fed directly to Gemini or ChatGPT. Vague prompts produce near-identical images across slides. Every prompt must be cinematically distinct.

### REQUIRED ELEMENTS in every image_prompt:

1. **CAMERA FRAMING** — State it explicitly first:
   - Wide shot / Establishing shot / Mid-shot / Close-up / Extreme close-up
   - Camera angle: low angle / eye-level / slightly overhead / bird's eye
   - Example: "Wide establishing shot, low angle looking up through tall grass"

2. **CHARACTER DESIGN** — Consistent physical description every time:
   - Species, size relative to surroundings, body color, distinctive features
   - Current expression (ears flat, eyes wide, mouth slightly open)
   - Current posture/action (wings spread mid-flight, curled in a ball, leaning forward)
   - Size reference: is the character tiny against the scene or filling the frame?
   - The protagonist must stay the SAME non-human animal in every slide. Never let the image model substitute a child, woman, man, doll, or generic human figure for the hero.

3. **TIME OF DAY + LIGHTING** — Must progress across slides, never repeat:
   - Each act should have a distinct light: golden hour → dusk → full night → pre-dawn → dawn
   - Name the light source: soft golden backlight, cold moonlight from top-left, warm campfire glow
   - State the sky color and horizon state

4. **SCENE SPECIFICS** — Exact environment, not mood words:
   - Name specific plants, objects, textures (red poppies, mossy oak roots, dewy spider web)
   - Foreground element (specific, slightly out of focus)
   - Background (what is visible in the distance, how far does the scene extend)
   - Any other characters: species, position, expression, what they are doing

5. **ART STYLE** — Defined once in the "style" field and referenced briefly per slide:
   - Never use mood filler words: "cozy," "dreamy," "warm and nice," "whimsical atmosphere"
   - Instead: "soft watercolor, wet-on-wet edges, visible paper grain" or "3D Pixar render, subsurface skin scatter, soft rim light"

6. **CHARACTER REPETITION** — Every image_prompt must include the character's full physical description inline, not just their name. Do NOT write "Luna hovers above the river." Write "Luna — a firefly the size of a thumbnail, mahogany body, iridescent wings with faint blue veins, soft amber glow from her abdomen, oversized green eyes — hovers above the river." The AI generating the image has no memory between slides. Write every prompt as if it is the first one.
   - The protagonist name must stay identical across all slides. Never rename the hero.
   - The protagonist must be the FIRST named subject in every prompt, not introduced after the background or a crowd shot.
   - The first character clause of every prompt must explicitly restate the species and the body markers that prove it is not human, for example: feathers + beak + wings for a bird, paws + tail + whiskers for a kitten.
   - If other characters appear, label them separately so the hero remains visually dominant.

7. **OUTPUT DIMENSIONS** — Story slides render into a 1080×1920 video frame. Every image_prompt must end with: "Generate at 9:16 portrait ratio (1080×1920 pixels)." A native 9:16 source fills the video frame without letterboxing. Do NOT include any instruction to leave blank space at the bottom — the video compositor handles watermarks separately.

### WHAT NOT TO WRITE:
- "in a warm and cozy style" — useless filler
- "with a dreamy atmosphere" — tells the AI nothing
- "surrounded by wildflowers" — every slide cannot have the same wildflowers
- Repeating the same camera angle across multiple slides
- Two slides with the same time of day and lighting
- Referring to the character by name only — always describe them fully inline
- Any instruction about leaving bottom space blank — the compositor handles that
- Any ambiguity that could let the model swap the animal hero for a human subject
- Pronoun-only prompts where the species is never restated
- Opening the prompt with a crowd, landscape, or side character before the hero is named

### BAD PROMPT (produces same image as 4 other slides):
"Luna flying among the wildflowers, her light flickering, with other fireflies flying and sparkling around her, in a whimsical and dreamy atmosphere."

### GOOD PROMPT (produces a unique, directable scene):
"Mid-shot, slightly overhead angle. Luna — a firefly the size of a thumbnail, mahogany body, iridescent wings with faint blue veins, soft amber glow from her abdomen, oversized green eyes — hovers alone between two large white clover flowers at twilight. Her wings are spread mid-flight but her posture is uncertain — body tilted downward, eyes looking at her own glow. Her amber light illuminates only the nearest clover petal. In the blurred background, bright firefly lights sparkle in the distance like scattered stars. The sky is deep indigo. A single firefly reflection shimmers in a tiny puddle below her. Soft watercolor, indigo and amber palette, wet-on-wet edges, visible paper grain. Generate at 9:16 portrait ratio (1080×1920 pixels)."

### VISUAL PROGRESSION ACROSS SLIDES:
Plan the full visual arc before writing prompts:
- No two slides share the same: camera framing + time of day + location
- ACT 1: Wide → mid → close (establish world → introduce contrast → character's inner state)
- ACT 2: Varies with story events — use location changes to signal scene shifts
- ACT 3: Echo ACT 1's composition but show what has changed (full circle)

## OUTPUT FORMAT

Return a single JSON object with this exact structure — no extra text:

{
  "title": "Story Title Here",
  "episode": <number>,
  "theme": "One sentence describing the story and its emotional payoff",
  "hookQuestion": "A short curiosity-gap question or open-loop line for the reel hook. 8-14 words, answered only by the ending.",
  "outroEcho": "A very short emotional echo line that can support the final story beat if needed.",
  "style": "Art style to use consistently across all ${styleRefCount} slides (e.g., 'soft watercolor, wet-on-wet edges, warm pastel palette, visible paper grain')",
  "character": "Consistent physical description of the main character — species, size, color, distinctive markings, eye color/size, any unique feature. This exact description should be reusable inline inside every image_prompt.",
  "slides": [
    {
      "image": "01.png",
      "act": 1,
      "narration": "Slide narration text here. Short sentences.",
      "duration": 7,
      "image_prompt": "CAMERA FRAMING + ANGLE. Protagonist NAME + FULL PHYSICAL DESCRIPTION (inline, every slide, explicitly non-human animal traits visible) + expression + posture + position in frame. Specific scene environment (named foreground element + named background). Time of day + named light source + sky color. Other characters if any (species, position, expression) but the hero remains dominant. Art style. Generate at 9:16 portrait ratio (1080×1920 pixels)."
    }
  ]
}

Duration is in seconds. ACT 1 slides: 6–7s. ACT 2 slides: 7–9s. ACT 3 slides: 7–9s. Final slide: 7–8s.
- hookQuestion: must create an open loop with stakes, and must not simply restate slide 1.
- outroEcho: 4-8 words, warm and memorable, not a CTA. It may be unused by the reel compositor if the ending loops directly.${psychTriggers ? `

## PSYCHOLOGY LAYER — STORY TRIGGERS

Stories activate two triggers simultaneously. Apply both:

**NOSTALGIA** — The parent watching this should feel something they recognise from their own childhood. Ground the story in a sensation, a smell, a particular kind of light, or a quiet moment they have already lived. The "Grab" slide should land in the parent's memory before it lands in the child's imagination.

**IDENTITY_MIRROR** — The parent should see their own values reflected in the story's resolution. When the hero solves the problem through patience, curiosity, or kindness — the parent thinks "my child does that." Never name a virtue directly. Show it in a single precise action.

**Application rules:**
- Slide 1 narration: anchor in a sensory moment that parents recognise (NOSTALGIA)
- Resolution slide: the hero's winning action must mirror a virtue parents want to see in their child (IDENTITY_MIRROR)
- Image prompts: use warm, slightly nostalgic lighting (golden hour, morning window light, firelight) to reinforce the emotional register` : ''}`;
}

function scoreStorySeed(seed, themeSeed, trends, preferredLane = null) {
  let score = (seed.reelSuitability ?? 0.75) * 3
    + (seed.freshness ?? 0.75) * 1.75
    + (seed.confidence ?? 0.7) * 1.5
    + (seed.emotionalIntensity ?? 0.78) * 2.25
    + (seed.relatability ?? 0.75) * 1.75
    + (seed.virality ?? 0.72) * 1.75;

  const hay = `${seed.title || ''} ${seed.animal || ''} ${seed.coreEvent || ''} ${(seed.visualHooks || []).join(' ')} ${(seed.trendTags || []).join(' ')} ${(seed.seasonTags || []).join(' ')} ${seed.lane || ''}`.toLowerCase();
  if (preferredLane && seed.lane === preferredLane) {
    score += 3.5;
  }
  if (themeSeed) {
    const terms = String(themeSeed).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    score += terms.filter((t) => hay.includes(t)).length * 1.6;
  }
  const trendTerms = (trends?.trending_themes || []).slice(0, 6).flatMap((t) => String(t.theme || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  score += trendTerms.filter((t) => hay.includes(t)).length * 0.35;
  return score;
}

function getStorySeedById(storySourceBank, id) {
  return Array.isArray(storySourceBank?.seeds)
    ? storySourceBank.seeds.find((seed) => seed.id === id) || null
    : null;
}

function selectStorySourceSeeds(storySourceBank, themeSeed, trends, limit = 6, preferredLane = null) {
  const seeds = (Array.isArray(storySourceBank?.seeds) ? storySourceBank.seeds : [])
    .filter((seed) => seed?.brand_safe !== false && seed?.title && seed?.animal && seed?.coreEvent)
    .map((seed) => ({ ...seed, _score: scoreStorySeed(seed, themeSeed, trends, preferredLane) }))
    .sort((a, b) => b._score - a._score);

  const byLane = new Map();
  for (const seed of seeds) {
    if (!byLane.has(seed.lane)) byLane.set(seed.lane, seed);
  }

  const diversified = [...byLane.values()].sort((a, b) => b._score - a._score);
  const selected = [];
  for (const seed of diversified) {
    if (selected.length >= limit) break;
    selected.push(seed);
  }
  for (const seed of seeds) {
    if (selected.length >= limit) break;
    if (!selected.some((entry) => entry.id === seed.id)) selected.push(seed);
  }
  return selected.slice(0, limit);
}

function buildStorySourceBankBlock(storySourceBank, themeSeed, trends, preferredLane = null) {
  const selected = selectStorySourceSeeds(storySourceBank, themeSeed, trends, 6, preferredLane);
  if (!selected.length) return '';
  const lines = selected.map((seed) => {
    const hooks = Array.isArray(seed.visualHooks) ? seed.visualHooks.join(', ') : '';
    return `- [${seed.id}] ${seed.title} | animal: ${seed.animal} | lane: ${seed.lane} | core: ${seed.coreEvent}${seed.stakes ? ` | stakes: ${seed.stakes}` : ''}${seed.emotionalPattern ? ` | pattern: ${seed.emotionalPattern}` : ''}${hooks ? ` | visuals: ${hooks}` : ''}${typeof seed._score === 'number' ? ` | score: ${seed._score.toFixed(2)}` : ''}`;
  });
  return `\n\nSTORY SOURCE BANK — choose one of these as the structural seed and build from it. Do not copy it mechanically; expand it into a stronger original reel story with a real hook/body/resolution.\n${lines.join('\n')}`;
}

function buildSelectedSeedBlock(storySourceBank, outline = null) {
  const seed = outline?.sourceBankId ? getStorySeedById(storySourceBank, outline.sourceBankId) : null;
  if (!seed) return '';
  return `\n\nSELECTED STORY SEED — this is the factual/emotional spine chosen in pass 1. Preserve its core event, stakes, and emotional pattern while making the final story feel richer and more cinematic:\n${JSON.stringify(seed, null, 2)}`;
}

function buildOutlinePrompt(episodeNum, themeSeed, storySourceBank, trends, preferredLane = null) {
  const bankBlock = buildStorySourceBankBlock(storySourceBank, themeSeed, trends, preferredLane);
  const themeBlock = themeSeed
    ? `\nTheme seed from the user: "${themeSeed}". If possible, choose the source-bank seed that best matches it.`
    : '';
  const laneBlock = preferredLane
    ? `\nPreferred story lane: "${preferredLane}". Favor source-bank seeds from this lane unless the theme seed clearly points elsewhere.`
    : '';

  return `Build a STORY OUTLINE ONLY for Joyo's Story Corner Episode ${episodeNum}.${themeBlock}${laneBlock}${bankBlock}

Return ONLY JSON with this exact structure:
{
  "sourceBankId": "seed id you selected, or null if none",
  "title": "specific evocative title",
  "theme": "one sentence emotional promise",
  "hookQuestion": "8-14 words",
  "outroEcho": "4-8 words",
  "style": "one visual style line",
  "character": "full reusable protagonist description",
  "storyLane": "rescue|homecoming|loyalty|survival|parent_bond|migration|friendship",
  "beatPlan": [
    "Beat 1 vivid hook moment",
    "Beat 2 stakes",
    "Beat 3 attempt",
    "Beat 4 deepening",
    "Beat 5 lowest moment",
    "Beat 6 turn",
    "Beat 7 resolution",
    "Beat 8 echo image"
  ]
}

Rules:
- Pick one source-bank seed if available and make it the spine.
- Keep the protagonist a non-human animal.
- The beatPlan must escalate cleanly and feel narratable, not like summaries.
- Beat 5 must hurt. Beat 8 must be screenshot-worthy.
- No markdown fences. JSON only.`;
}

function buildUserPrompt(episodeNum, existingStories, themeSeed, trends, weights, competitor, hooksData, dynamicThemes, storySourceBank = null, outline = null, preferredLane = null) {
  // Characters banned due to overuse (update this list as new species accumulate)
  const BANNED_CHARACTERS = ['firefly', 'fireflies'];

  const avoidBlock = existingStories.length > 0
    ? `\n\nALREADY USED — do NOT repeat these themes, story types, OR main character species:\n${existingStories.map(s => `- ${s}`).join('\n')}`
    : '';

  const bannedCharsBlock = `\n\nBANNED CHARACTERS — overused recently, do NOT use these as the main character: ${BANNED_CHARACTERS.join(', ')}. Pick a completely different animal.`;

  const themeBlock = themeSeed
    ? `\n\nTheme seed from the user: "${themeSeed}" — build a story around this idea.`
    : '';

  const laneBlock = preferredLane
    ? `\n\nPREFERRED STORY LANE: ${preferredLane}. Prefer seeds and final story beats that clearly fit this lane unless a much stronger fit emerges from the theme seed.`
    : '';

  const storySourceBankBlock = buildStorySourceBankBlock(storySourceBank, themeSeed, trends, preferredLane);
  const selectedSeedBlock = buildSelectedSeedBlock(storySourceBank, outline);

  const outlineBlock = outline
    ? `\n\nMANDATORY STORY OUTLINE — use this as the exact emotional spine for the final story. Keep the same protagonist identity, core escalation, and ending image. Expand it into stronger narrated beats, do not flatten it back into summary copy:\n${JSON.stringify(outline, null, 2)}`
    : '';

  // Inject live trend data
  let trendsBlock = '';
  if (trends?.trending_themes?.length) {
    const topTrends = trends.trending_themes.slice(0, 5).map(t => t.theme).join(', ');
    const upcoming = (trends.upcoming_moments || [])
      .filter(e => e.days_away >= 0 && e.days_away <= 21)
      .map(e => `${e.event} in ${e.days_away} days`).join(', ');
    trendsBlock = `\n\nLIVE TREND DATA — let this inform your theme choice:
- Trending now: ${topTrends}
${upcoming ? `- Upcoming moments: ${upcoming}` : ''}
Pick a theme that overlaps naturally with at least one trending topic. Don't force it — if two story ideas are equal in quality, always pick the one that connects to a trend.`;
  }

  // Inject performance weights (when analytics data exists)
  let weightsBlock = '';
  if (weights?.categories?.length) {
    const boost = weights.categories.filter(c => c.tier === 'boost').map(c => c.label || c.category);
    const reduce = weights.categories.filter(c => c.tier === 'reduce').map(c => c.label || c.category);
    const topHooks = weights.categories
      .filter(c => c.topHook)
      .slice(0, 2)
      .map(c => `"${c.topHook}"`);
    weightsBlock = `\n\nPERFORMANCE DATA — content earning the most saves right now:
${boost.length ? `- Double down on: ${boost.join(', ')}` : ''}
${reduce.length ? `- Scale back: ${reduce.join(', ')}` : ''}
${topHooks.length ? `- Top-performing hook patterns: ${topHooks.join(' | ')}` : ''}
Lean your story theme and emotional arc toward the boost categories.`;
  }

  // Competitor intelligence: format signals + hook patterns
  let competitorBlock = '';
  if (competitor) {
    const formats  = (competitor.top_formats || []).slice(0, 3).map(f => `- ${f}`).join('\n');
    const hooks    = (competitor.winning_hooks || []).slice(0, 4).map(h => `- "${h}"`).join('\n');
    const stoppers = (competitor.scroll_stopper_formulas || []).slice(0, 3).map(s => `- ${s}`).join('\n');
    competitorBlock = `\n\nCOMPETITOR INTELLIGENCE (use to strengthen Beat 1 hook and visual direction — do not change slide count):
Format signals:\n${formats}
Winning hook patterns (inform Beat 1 narration style):\n${hooks}
Scroll-stopper formulas:\n${stoppers}`;
  }

  // Top hooks from intelligence library — Beat 1 inspiration
  let hookSeedsBlock = '';
  if (hooksData?.hooks?.length) {
    const topHooks = (hooksData.hooks || [])
      .filter(h => h.brand_safe !== false && h.text)
      .sort((a, b) => (b.performance_score ?? -1) - (a.performance_score ?? -1))
      .slice(0, 5)
      .map(h => `- [${h.hook_type || 'hook'}] "${h.text}"`);
    if (topHooks.length) {
      hookSeedsBlock = `\n\nINTELLIGENCE HOOK LIBRARY — use as rhythm/tone inspiration for Beat 1 narration (never copy verbatim):\n${topHooks.join('\n')}`;
    }
  }

  // Active intelligence themes — optional story angle seeds
  let activeThemesBlock = '';
  if (dynamicThemes?.themes?.length) {
    const active = (dynamicThemes.themes || [])
      .filter(t => t.status !== 'evicted' && t.brand_safe !== false)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 4)
      .map(t => `- ${t.name}${t.rationale ? ': ' + t.rationale : ''}`);
    if (active.length) {
      activeThemesBlock = `\n\nACTIVE INTELLIGENCE THEMES — if the story theme overlaps naturally with one of these, prefer it:\n${active.join('\n')}`;
    }
  }

  return `Generate a complete "Joyo's Story Corner" Episode ${episodeNum} story.

The story must:
1. Feature an animal or fantastical creature as the main character (no human protagonists)
2. Follow the ${SLIDE_COUNT}-slide 8-beat viral arc exactly — output exactly ${SLIDE_COUNT} slides, no more, no fewer
3. Have a title that is specific and evocative — not generic ("The Fox Who Crossed the River Alone" not "A Story About Courage")
4. Beat 1 narration: ONE sentence. Drop into action. Hook the viewer before they know the character's name.
5. Beat 8 narration: ONE sentence. The share trigger. Must land without context. Write this last.
6. End with a payoff that makes parents want to screenshot and share the final slide
7. Also write a separate hookQuestion for short-form reels. It should be 8-14 words, create a curiosity gap, and be answered only by the final beat.
8. Also write a separate outroEcho that is only 4-8 words, emotionally resonant, and not a CTA.
9. Most important: the story must feel narratable. Build a true hook, body escalation, and resolution across the reel-worthy beats — not eight clipped summaries.
10. Use the intelligence inputs aggressively: strongest hooks, emotional patterning, and top-performing thematic overlaps should shape copy choices, not just theme choice.

Story arcs that travel well for short-form:
- A small animal solves a big problem through cleverness, not strength
- A lost creature finds their way home
- Two very different characters become unexpected friends
- A creature who feels like a burden discovers they are the key
- An animal faces a fear alone and finds they were never as alone as they thought${bannedCharsBlock}${avoidBlock}${trendsBlock}${weightsBlock}${activeThemesBlock}${competitorBlock}${hookSeedsBlock}${storySourceBankBlock}${themeBlock}${laneBlock}${selectedSeedBlock}${outlineBlock}

Extra final-pass rules when a selected seed is provided:
- Preserve the seed's core event and stakes, do not swap to a different underlying story.
- Let Beat 5 fully cash out the seed's emotional danger or loneliness.
- Let Beat 8 echo the seed's most memorable visual hook in a smaller, quieter way.

Before you finalize, self-check every image_prompt:
- protagonist name appears in every prompt
- protagonist name appears within the first 14 words
- at least 3 character descriptor words are repeated from the character field
- prompt ends with 9:16 portrait ratio instruction

Return ONLY the JSON. No explanation. No markdown fences.`;
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseJsonResponse(raw) {
  return JSON.parse(String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
}

function validateOutline(outline) {
  if (!outline || typeof outline !== 'object') {
    throw new Error('Outline payload was empty.');
  }
  if (!Array.isArray(outline.beatPlan) || outline.beatPlan.length !== SLIDE_COUNT) {
    throw new Error(`Expected outline beatPlan with ${SLIDE_COUNT} items.`);
  }
  if (!outline.character || String(outline.character).split(/\s+/).length < 6) {
    throw new Error('Outline character description is too weak.');
  }
}

function buildStyleAnchor(style) {
  const raw = String(style || '').trim();
  if (!raw) return '';
  const clause = raw.replace(/\.*\s*$/, '');
  return `Keep the exact same illustration style across all slides: ${clause}. No photorealism, no glossy 3D, no live-action look.`;
}

function repairStoryConsistency(story) {
  if (!story || !Array.isArray(story.slides)) return story;
  const character = String(story.character || '').trim();
  const characterName = character.split(/[—,-]/)[0]?.trim();
  if (!character || !characterName) return story;
  const styleAnchor = buildStyleAnchor(story.style);

  story.slides = story.slides.map((slide) => {
    let prompt = String(slide.image_prompt || '').trim();
    if (!prompt) return slide;

    const intro = `${character}. `;
    const hasName = prompt.toLowerCase().includes(characterName.toLowerCase());
    const firstWords = prompt.split(/\s+/).slice(0, 14).join(' ').toLowerCase();
    const earlyName = firstWords.includes(characterName.toLowerCase());

    if (!hasName) {
      prompt = `${intro}${prompt}`;
    } else if (!earlyName) {
      prompt = `${intro}${prompt}`;
    }

    if (styleAnchor && !prompt.toLowerCase().includes('keep the exact same illustration style across all slides')) {
      prompt = `${prompt.replace(/\.*\s*$/, '')}. ${styleAnchor}`;
    }

    if (!/Generate at 9:16 portrait ratio \(1080×1920 pixels\)\.?$/i.test(prompt)) {
      prompt = `${prompt.replace(/\.*\s*$/, '')}. Generate at 9:16 portrait ratio (1080×1920 pixels).`;
    }

    return { ...slide, image_prompt: prompt };
  });

  return story;
}

function validateGeneratedStory(story) {
  if (!story || typeof story !== 'object') {
    throw new Error('Story payload was empty.');
  }
  if (!Array.isArray(story.slides) || story.slides.length !== SLIDE_COUNT) {
    throw new Error(`Expected ${SLIDE_COUNT} slides, got ${story.slides?.length}`);
  }

  const character = String(story.character || '').trim();
  const characterName = character.split(/[—,-]/)[0]?.trim();
  const descriptorWords = new Set(
    character
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4)
  );
  const styleAnchor = buildStyleAnchor(story.style);

  if (!character || descriptorWords.size < 4) {
    throw new Error('Character description is too weak for image consistency.');
  }

  story.slides.forEach((slide, index) => {
    const prompt = String(slide.image_prompt || '').trim();
    if (!prompt) {
      throw new Error(`Slide ${index + 1} is missing image_prompt.`);
    }
    const wordCount = prompt.split(/\s+/).filter(Boolean).length;
    if (wordCount < 24) {
      throw new Error(`Slide ${index + 1} image_prompt too short (${wordCount} words).`);
    }
    if (characterName && !prompt.toLowerCase().includes(characterName.toLowerCase())) {
      throw new Error(`Slide ${index + 1} image_prompt is missing protagonist name.`);
    }
    if (characterName) {
      const firstWords = prompt.split(/\s+/).slice(0, 14).join(' ').toLowerCase();
      if (!firstWords.includes(characterName.toLowerCase())) {
        throw new Error(`Slide ${index + 1} image_prompt does not introduce the hero early enough.`);
      }
    }
    const promptWords = new Set(
      prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 4)
    );
    const overlap = [...descriptorWords].filter((word) => promptWords.has(word)).length;
    if (overlap < Math.min(3, descriptorWords.size)) {
      throw new Error(`Slide ${index + 1} image_prompt does not repeat enough hero descriptors.`);
    }
    if (styleAnchor && !prompt.toLowerCase().includes('keep the exact same illustration style across all slides')) {
      throw new Error(`Slide ${index + 1} image_prompt is missing the style anchor.`);
    }
  });
}

function buildDefaultReelSlideOrder(slides = []) {
  const count = Array.isArray(slides) ? slides.length : 0;
  if (count <= 5) return Array.from({ length: count }, (_, i) => i + 1);
  const picks = count >= 8
    ? [1, 3, 5, Math.max(7, count - 1), count]
    : [1, 2, Math.max(3, Math.ceil(count / 2)), Math.max(Math.ceil(count / 2) + 1, count - 1), count];
  return [...new Set(picks)].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
}

function buildPromptMarkdown(story, reelSlideOrder, slides, title) {
  const lines = [
    `# ${title} — ${story.title}`,
    `Episode ${story.episode} | Art style: ${story.style}`,
    '',
    `**Story:** ${story.theme}`,
    '',
    `**Story Reel V2 default cut:** ${reelSlideOrder.map((n) => `Slide ${String(n).padStart(2, '0')}`).join(' → ')}`,
    '',
    story.character ? `**Main character (use this consistently in every image):** ${story.character}` : '',
    '',
    '---',
    '',
  ];

  for (const slide of slides) {
    lines.push(`## Slide ${slide.image.replace('.png', '')} (ACT ${slide.act})`);
    lines.push('');
    lines.push(`**Narration:** "${slide.narration}"`);
    lines.push('');
    lines.push('**Image prompt:**');
    lines.push(slide.image_prompt);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

async function saveStory(story, episodeNum) {
  const folder = `ep${String(episodeNum).padStart(2, '0')}-${slugify(story.title)}`;
  const storyDir = path.join(ROOT, 'output', 'stories', folder);
  await fs.mkdir(storyDir, { recursive: true });

  // Write story.json (same format generate-story-video.mjs expects)
  const reelSlideOrder = buildDefaultReelSlideOrder(story.slides);
  const storyJson = {
    title: story.title,
    episode: story.episode,
    theme: story.theme,
    hook: story.hook || null,         // Legacy intro hook
    hookQuestion: story.hookQuestion || story.hook || null,
    outroEcho: story.outroEcho || null,
    storySourceBankId: story.storySourceBankId || story.sourceBankId || null,
    storyLane: story.storyLane || null,
    reelSlideOrder,
    slides: story.slides.map(s => ({
      image: s.image,
      act: s.act,
      narration: s.narration,
      duration: s.duration,
    })),
    music: null,
  };
  await fs.writeFile(
    path.join(storyDir, 'story.json'),
    JSON.stringify(storyJson, null, 2),
    'utf-8'
  );

  // Write image-prompts.md for manual Gemini generation
  await fs.writeFile(
    path.join(storyDir, 'image-prompts.md'),
    buildPromptMarkdown(story, reelSlideOrder, story.slides, 'Image Prompts'),
    'utf-8'
  );

  const reelSlides = reelSlideOrder
    .map((n) => story.slides[n - 1])
    .filter(Boolean);
  await fs.writeFile(
    path.join(storyDir, 'reel-image-prompts.md'),
    buildPromptMarkdown(story, reelSlideOrder, reelSlides, 'Reel Image Prompts'),
    'utf-8'
  );

  return storyDir;
}

function printStory(story) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Episode ${story.episode}: ${story.title}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Theme: ${story.theme}`);
  console.log(`Hook: ${story.hookQuestion || story.hook || '(none)'}`);
  console.log(`Outro echo: ${story.outroEcho || '(none)'}`);
  console.log(`Reel cut: ${buildDefaultReelSlideOrder(story.slides).join(', ')}`);
  console.log(`Style: ${story.style}`);
  console.log('');

  for (const slide of story.slides) {
    const duration = `${slide.duration}s`;
    const label = `[Slide ${slide.image.replace('.png','')} | ACT ${slide.act} | ${duration}]`;
    console.log(`${label}`);
    console.log(`  Narration: "${slide.narration}"`);
    console.log(`  Image: ${slide.image_prompt.slice(0, 120)}...`);
    console.log('');
  }
}

async function main() {
  console.log('=== Joyo\'s Story Corner — Idea Generator ===\n');

  const episodeNum = await getNextEpisode();
  const [existing, { styleGuide, archetypes, trends, weights, competitor, hooksData, dynamicThemes, psychTriggers, storySourceBank, videoViralityRules }] = await Promise.all([
    getExistingStories(),
    loadStyleContext(),
  ]);

  if (trends) console.log(`  Trends loaded: ${trends.trending_themes?.slice(0,3).map(t => t.theme).join(', ')} ...`);
  if (weights?.categories?.length) console.log(`  Performance weights loaded: ${weights.categories.length} categories`);
  if (competitor) console.log(`  Competitor intelligence loaded (${competitor.date})`);
  if (hooksData?.hooks?.length) console.log(`  Hooks library loaded: ${hooksData.hooks.length} hooks`);
  if (dynamicThemes?.themes?.length) console.log(`  Dynamic themes loaded: ${dynamicThemes.themes.length} themes`);
  if (psychTriggers) console.log(`  Psychology triggers loaded: ${Object.keys(psychTriggers.triggers || {}).length} triggers`);
  if (storySourceBank?.seeds?.length) console.log(`  Story source bank loaded: ${storySourceBank.seeds.length} seeds`);

  const systemPrompt = buildSystemPrompt(styleGuide, archetypes, psychTriggers, videoViralityRules);
  const outlinePrompt = buildOutlinePrompt(episodeNum, THEME_SEED, storySourceBank, trends, STORY_LANE);
  const userPrompt = buildUserPrompt(episodeNum, existing, THEME_SEED, trends, weights, competitor, hooksData, dynamicThemes, storySourceBank, null, STORY_LANE);

  if (DRY_RUN) {
    console.log('=== SYSTEM PROMPT ===\n');
    console.log(systemPrompt);
    console.log('\n=== OUTLINE PROMPT ===\n');
    console.log(outlinePrompt);
    console.log('\n=== USER PROMPT ===\n');
    console.log(userPrompt);
    return;
  }

  // ── Groq API call ──
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.error('Error: GROQ_API_KEY not set in .env');
    process.exit(1);
  }

  const groq = new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' });

  const stories = [];

  for (let i = 0; i < COUNT; i++) {
    if (COUNT > 1) console.log(`Generating concept ${i + 1} of ${COUNT}...`);
    else console.log('Generating story concept...');

    let attempts = 0;
    let story = null;
    let lastError = null;

    while (attempts < 3 && !story) {
      attempts++;
      try {
        const retryFixBlock = lastError
          ? `\n\nIMPORTANT RETRY FIX: The previous attempt failed validation with this exact issue: ${lastError}. Correct that failure explicitly in this attempt.`
          : '';

        const outlineResponse = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: (i === 0 ? outlinePrompt : outlinePrompt + `\n\nMake this outline DIFFERENT from: ${stories.map(s => s.title).join(', ')}`) + retryFixBlock },
          ],
          temperature: 0.7,
          max_tokens: 1800,
        });

        const outline = parseJsonResponse(outlineResponse.choices[0].message.content);
        validateOutline(outline);

        const finalUserPrompt = buildUserPrompt(
          episodeNum + i,
          existing,
          THEME_SEED,
          trends,
          weights,
          competitor,
          hooksData,
          dynamicThemes,
          storySourceBank,
          outline,
          STORY_LANE
        ) + (i === 0 ? '' : `\n\nMake this concept DIFFERENT from: ${stories.map(s => s.title).join(', ')}`) + retryFixBlock;

        const response = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: finalUserPrompt },
          ],
          temperature: 0.82,
          max_tokens: 5000,
        });

        story = repairStoryConsistency(parseJsonResponse(response.choices[0].message.content));

        validateGeneratedStory(story);

        story.episode = episodeNum + i;
        story.storySourceBankId = outline.sourceBankId || null;
        story.storyLane = outline.storyLane || null;
        story.storyOutline = outline.beatPlan;
        stories.push(story);
      } catch (err) {
        lastError = err.message;
        if (attempts < 3) {
          console.log(`  Attempt ${attempts} failed (${err.message}), retrying...`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          console.error(`  Failed after 3 attempts: ${err.message}`);
        }
      }
    }
  }

  if (stories.length === 0) {
    console.error('No stories generated.');
    process.exit(1);
  }

  // Print all generated stories
  for (const story of stories) {
    printStory(story);
  }

  // Save if requested (saves first story only unless --count 1)
  if (SAVE) {
    for (const story of stories) {
      const saved = await saveStory(story, story.episode);
      console.log(`\nSaved: ${saved}`);
      console.log('  → story.json (ready for generate-story-video.mjs)');
      console.log('  → image-prompts.md (full prompt set for Gemini/ChatGPT)');
      console.log('  → reel-image-prompts.md (generate these 5 slides first for StoryReelV2)');
      console.log(`\nNext: generate the 5 selected reel images from reel-image-prompts.md first, then backfill the rest if needed.`);
      console.log(`Then: npm run generate:story:openai -- --story ${path.basename(saved)}`);
    }
  } else {
    console.log('\nRun with --save to scaffold story folder + save story.json + image-prompts.md + reel-image-prompts.md');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

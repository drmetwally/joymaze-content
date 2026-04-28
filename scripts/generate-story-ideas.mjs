#!/usr/bin/env node

/**
 * JoyMaze Content — Story Idea Generator
 *
 * Generates complete Archetype 8 "Joyo's Story Corner" episode concepts:
 * - Story title + theme
 * - 7-slide narration (hypnotic writing style, short punchy sentences)
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

  return { styleGuide, archetypes, trends, weights, competitor, hooksData, dynamicThemes, psychTriggers };
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

function buildSystemPrompt(styleGuide, archetypes, psychTriggers = null) {
  const voice = extractVoiceRules(styleGuide);
  const arch8 = extractArchetype8(archetypes);

  const styleRefCount = SLIDE_COUNT;

  return `You are the head writer for "Joyo's Story Corner" — a short-form kids story series by JoyMaze.

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

Each slide's narration is read aloud at TTS speed 0.85. Target: 3–4 seconds per slide.

**HARD LIMIT: 15 words maximum per slide (all sentences combined). No exceptions.**

At 15 words and speed 0.85, TTS produces ~3.5–4.0s of audio — exactly the target.
Count your words after writing each slide. If you are at 16, cut one word. Do not negotiate.

Examples of complete beats at ≤15 words (different animals — do not copy these characters):
- Beat 1 (fox): "The bridge was gone. Pip was the only one who knew another way." (13 words)
- Beat 3 (turtle): "She carried the stone herself. Each step slower than the last." (11 words)
- Beat 5 (crow): "He dropped it. The wind took it. He watched it disappear." (11 words)
- Beat 8 (rabbit): "She still leaves a carrot at the hollow root. Every winter." (11 words)

These examples prove full story beats are achievable within the limit. There is no reason to exceed it.

Other rules:
- 1–2 sentences only. Never 3.
- Beat 1: ONE sentence maximum. Make it the hook.
- Beat 5: Short, heavy sentences. The emotional bottom is felt in silence between words, not in length.
- Beat 8: ONE sentence only. Must work without any context. This is your share trigger.
- No passive voice. No adverbs. No adjective stacking.
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

7. **OUTPUT DIMENSIONS** — Story slides render into a 1080×1920 video frame. Every image_prompt must end with: "Generate at 9:16 portrait ratio (1080×1920 pixels)." A native 9:16 source fills the video frame without letterboxing. Do NOT include any instruction to leave blank space at the bottom — the video compositor handles watermarks separately.

### WHAT NOT TO WRITE:
- "in a warm and cozy style" — useless filler
- "with a dreamy atmosphere" — tells the AI nothing
- "surrounded by wildflowers" — every slide cannot have the same wildflowers
- Repeating the same camera angle across multiple slides
- Two slides with the same time of day and lighting
- Referring to the character by name only — always describe them fully inline
- Any instruction about leaving bottom space blank — the compositor handles that

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
  "outroEcho": "A very short emotional echo or teaser line for the ending card.",
  "style": "Art style to use consistently across all ${styleRefCount} slides (e.g., 'soft watercolor, wet-on-wet edges, warm pastel palette, visible paper grain')",
  "character": "Consistent physical description of the main character — species, size, color, distinctive markings, eye color/size, any unique feature. This description will be referenced in every image_prompt.",
  "slides": [
    {
      "image": "01.png",
      "act": 1,
      "narration": "Slide narration text here. Short sentences.",
      "duration": 7,
      "image_prompt": "CAMERA FRAMING + ANGLE. Character FULL PHYSICAL DESCRIPTION (inline, every slide) + expression + posture + position in frame. Specific scene environment (named foreground element + named background). Time of day + named light source + sky color. Other characters if any (species, position, expression). Art style. Generate at 9:16 portrait ratio (1080×1920 pixels)."
    }
  ]
}

Duration is in seconds. ACT 1 slides: 6–7s. ACT 2 slides: 7–8s. ACT 3 slides: 7–8s. Final slide: 8–10s.
- hookQuestion: must create an open loop with stakes, and must not simply restate slide 1.
- outroEcho: 4-8 words, warm and memorable, not a CTA.${psychTriggers ? `

## PSYCHOLOGY LAYER — STORY TRIGGERS

Stories activate two triggers simultaneously. Apply both:

**NOSTALGIA** — The parent watching this should feel something they recognise from their own childhood. Ground the story in a sensation, a smell, a particular kind of light, or a quiet moment they have already lived. The "Grab" slide should land in the parent's memory before it lands in the child's imagination.

**IDENTITY_MIRROR** — The parent should see their own values reflected in the story's resolution. When the hero solves the problem through patience, curiosity, or kindness — the parent thinks "my child does that." Never name a virtue directly. Show it in a single precise action.

**Application rules:**
- Slide 1 narration: anchor in a sensory moment that parents recognise (NOSTALGIA)
- Resolution slide: the hero's winning action must mirror a virtue parents want to see in their child (IDENTITY_MIRROR)
- Image prompts: use warm, slightly nostalgic lighting (golden hour, morning window light, firelight) to reinforce the emotional register` : ''}`;
}

function buildUserPrompt(episodeNum, existingStories, themeSeed, trends, weights, competitor, hooksData, dynamicThemes) {
  // Characters banned due to overuse (update this list as new species accumulate)
  const BANNED_CHARACTERS = ['firefly', 'fireflies'];

  const avoidBlock = existingStories.length > 0
    ? `\n\nALREADY USED — do NOT repeat these themes, story types, OR main character species:\n${existingStories.map(s => `- ${s}`).join('\n')}`
    : '';

  const bannedCharsBlock = `\n\nBANNED CHARACTERS — overused recently, do NOT use these as the main character: ${BANNED_CHARACTERS.join(', ')}. Pick a completely different animal.`;

  const themeBlock = themeSeed
    ? `\n\nTheme seed from the user: "${themeSeed}" — build a story around this idea.`
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

Story arcs that travel well for short-form:
- A small animal solves a big problem through cleverness, not strength
- A lost creature finds their way home
- Two very different characters become unexpected friends
- A creature who feels like a burden discovers they are the key
- An animal faces a fear alone and finds they were never as alone as they thought${bannedCharsBlock}${avoidBlock}${trendsBlock}${weightsBlock}${activeThemesBlock}${competitorBlock}${hookSeedsBlock}${themeBlock}

Return ONLY the JSON. No explanation. No markdown fences.`;
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function saveStory(story, episodeNum) {
  const folder = `ep${String(episodeNum).padStart(2, '0')}-${slugify(story.title)}`;
  const storyDir = path.join(ROOT, 'output', 'stories', folder);
  await fs.mkdir(storyDir, { recursive: true });

  // Write story.json (same format generate-story-video.mjs expects)
  const storyJson = {
    title: story.title,
    episode: story.episode,
    theme: story.theme,
    hook: story.hook || null,         // Legacy intro hook
    hookQuestion: story.hookQuestion || story.hook || null,
    outroEcho: story.outroEcho || null,
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
  const lines = [
    `# Image Prompts — ${story.title}`,
    `Episode ${story.episode} | Art style: ${story.style}`,
    '',
    `**Story:** ${story.theme}`,
    '',
    story.character ? `**Main character (use this consistently in every image):** ${story.character}` : '',
    '',
    '---',
    '',
  ];

  for (const slide of story.slides) {
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

  await fs.writeFile(
    path.join(storyDir, 'image-prompts.md'),
    lines.join('\n'),
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
  const [existing, { styleGuide, archetypes, trends, weights, competitor, hooksData, dynamicThemes, psychTriggers }] = await Promise.all([
    getExistingStories(),
    loadStyleContext(),
  ]);

  if (trends) console.log(`  Trends loaded: ${trends.trending_themes?.slice(0,3).map(t => t.theme).join(', ')} ...`);
  if (weights?.categories?.length) console.log(`  Performance weights loaded: ${weights.categories.length} categories`);
  if (competitor) console.log(`  Competitor intelligence loaded (${competitor.date})`);
  if (hooksData?.hooks?.length) console.log(`  Hooks library loaded: ${hooksData.hooks.length} hooks`);
  if (dynamicThemes?.themes?.length) console.log(`  Dynamic themes loaded: ${dynamicThemes.themes.length} themes`);
  if (psychTriggers) console.log(`  Psychology triggers loaded: ${Object.keys(psychTriggers.triggers || {}).length} triggers`);

  const systemPrompt = buildSystemPrompt(styleGuide, archetypes, psychTriggers);
  const userPrompt = buildUserPrompt(episodeNum, existing, THEME_SEED, trends, weights, competitor, hooksData, dynamicThemes);

  if (DRY_RUN) {
    console.log('=== SYSTEM PROMPT ===\n');
    console.log(systemPrompt);
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

    while (attempts < 3 && !story) {
      attempts++;
      try {
        const response = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: i === 0 ? userPrompt : userPrompt + `\n\nMake this concept DIFFERENT from: ${stories.map(s => s.title).join(', ')}` },
          ],
          temperature: 0.85,
          max_tokens: 5000,
        });

        const raw = response.choices[0].message.content.trim();
        // Strip markdown fences if present
        const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
        story = JSON.parse(jsonStr);

        // Validate structure
        if (!story.slides || story.slides.length !== SLIDE_COUNT) {
          throw new Error(`Expected ${SLIDE_COUNT} slides, got ${story.slides?.length}`);
        }

        story.episode = episodeNum + i;
        stories.push(story);
      } catch (err) {
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
      console.log('  → image-prompts.md (prompts for Gemini/ChatGPT)');
      console.log(`\nNext: generate images 01.png–${String(story.slides.length).padStart(2,'0')}.png in Gemini, drop into that folder.`);
      console.log(`Then: npm run generate:story:openai -- --story ${path.basename(saved)}`);
    }
  } else {
    console.log('\nRun with --save to scaffold story folder + save story.json + image-prompts.md');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

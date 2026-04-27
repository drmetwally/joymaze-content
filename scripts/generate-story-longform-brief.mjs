#!/usr/bin/env node

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORY_LONGFORM_DIR = path.join(ROOT, 'output', 'longform', 'story');
const SUNO_POOL_PATH = path.join(ROOT, 'config', 'suno-prompt-pool.json');
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_MAX_TOKENS = 5500;
const SCENES_PER_ACT = 8;
const TOTAL_SCENES = 24;

const args = process.argv.slice(2);
const SAVE = args.includes('--save');
const DRY_RUN = args.includes('--dry-run');
const TODAY = new Date().toISOString().slice(0, 10);

const orientation = (() => {
  const index = args.indexOf('--orientation');
  return index !== -1 ? args[index + 1] : 'horizontal';
})();

if (!['horizontal', 'vertical'].includes(orientation)) {
  console.error('Usage: --orientation horizontal|vertical');
  process.exit(1);
}

// 28-style pool — same as generate-prompts.mjs for brand consistency
// One style is picked per episode (consistent across all 24 scenes for visual coherence)
const ART_STYLES = [
  'warm watercolor illustration, wet-on-wet edges, visible paper grain',
  'soft pastel children\'s book illustration, gouache texture, gentle lighting',
  '3D Pixar-style render, subsurface skin scatter, soft rim light',
  'vintage storybook illustration, crosshatching, muted earthy tones',
  'ink-and-wash, bold black lines with loose watercolor fill',
  'crayon-on-paper children\'s drawing, thick waxy strokes, slight smudging',
  'soft-focus photorealistic, warm golden tones, shallow depth of field',
  'paper cutout collage, layered textures, flat color silhouettes',
  'oil painting with thick impasto brushstrokes, warm amber palette',
  'anime-inspired flat linework, bold outlines, vibrant saturated fills',
  'flat vector cartoon, clean geometry, bright primary colors',
  'claymation-style 3D, matte clay surfaces, soft studio lighting',
  'digital painterly, concept-art style, cinematic lighting',
  'mixed-media collage, torn paper textures, painted brush marks',
  'golden-hour photography style, lens flare, bokeh, warm orange cast',
  'Japanese woodblock print style, flat color areas, bold outlines, decorative borders',
  'soft felt-craft aesthetic, wool textures, hand-stitched outlines, muted palette',
  'children\'s editorial illustration, clean ink lines, limited 3-color palette',
  'gouache on toned paper, opaque highlights, muted mid-century palette',
  'pencil sketch with selective watercolor wash, loose gestural lines',
  'retro 1970s children\'s book illustration, earthy tones, rounded shapes, grain texture',
  'loose impressionist brushwork, dappled light, soft edges, garden palette',
  'bold graphic novel style, thick black outlines, flat cel shading',
  'folk art / naive style, flat perspective, hand-painted look',
  'linocut print style, high-contrast black/white with one accent color',
  'risograph print style, two-color overlapping halftone dots',
  'stained glass window style, bold lead lines, jewel-toned color fills',
  'moody blue-hour photography, long shadows, cool tones, window light glow',
];

// Child profiles — rotated by episode number so each story has a distinct protagonist
const CHILD_PROFILES = [
  { age: 4, gender: 'girl', name: 'Maya', description: 'a 4-year-old girl with curly dark hair and bright brown eyes, wearing a floral dress' },
  { age: 6, gender: 'boy',  name: 'Sam',  description: 'a 6-year-old boy with short sandy hair and freckles, wearing a blue striped t-shirt' },
  { age: 5, gender: 'girl', name: 'Lily', description: 'a 5-year-old girl with two braids and a yellow raincoat' },
  { age: 7, gender: 'boy',  name: 'Owen', description: 'a 7-year-old boy with glasses and messy brown hair, wearing a green hoodie' },
  { age: 8, gender: 'girl', name: 'Ruby', description: 'an 8-year-old girl with a red ponytail and paint-stained overalls' },
];

function pickEpisodeStyle(episodeNumber) {
  return ART_STYLES[(episodeNumber - 1) % ART_STYLES.length];
}

function pickEpisodeCharacter(episodeNumber) {
  return CHILD_PROFILES[(episodeNumber - 1) % CHILD_PROFILES.length];
}

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
  let ctaLibrary = null;
  let auditLearnings = [];
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
    ctaLibrary = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'cta-library.json'), 'utf-8'));
  } catch {}

  try {
    const raw = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'audit-learnings.json'), 'utf-8'));
    auditLearnings = (raw.lessons || []).filter(l => l.severity === 'critical' || l.severity === 'high');
  } catch {}

  try {
    const entries = await fs.readdir(STORY_LONGFORM_DIR, { withFileTypes: true });
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
    ctaLibrary,
    auditLearnings,
    recentEpisodes,
    nextEpisodeNumber,
  };
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

function buildPrompt(context, artStyle, character) {
  const {
    styleGuide,
    trends,
    competitor,
    hooksData,
    dynamicThemes,
    perfWeights,
    psychTriggers,
    sunoPool,
    contentIntelligence,
    ctaLibrary,
    auditLearnings,
    recentEpisodes,
    nextEpisodeNumber,
  } = context;

  const recentEpisodesBlock = recentEpisodes.length
    ? `\nRecent story episodes to avoid repeating too closely:\n${recentEpisodes.map((episode) => `- ${episode}`).join('\n')}`
    : '\nNo prior story episodes exist yet. This is episode 1.';

  const trendsBlock = trends?.trending_themes?.length
    ? `\nTrending themes this week:\n${trends.trending_themes.slice(0, 5).map((item) => `- ${item.theme} (score: ${item.score})`).join('\n')}`
    : '';

  const competitorBlock = competitor
    ? `\nCompetitor hook patterns:\n${(competitor.winning_hooks || []).slice(0, 4).map((item) => `- "${item}"`).join('\n')}`
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

  const selectedBackground = getLowestUsedPoolEntry(sunoPool, 'story_background_ambient');
  const backgroundRule = selectedBackground
    ? `\nFor the "sunoBackground" field, copy this verbatim: "${selectedBackground.prompt}"`
    : `\nFor the "sunoBackground" field, write one sentence describing ambient background music that fits the story mood. Example: "Soft piano melody with gentle nature sounds, warm and peaceful, no lyrics, children's story atmosphere."  Do NOT echo this instruction — write original music description.`;

  const psychBlock = psychTriggers
    ? `

## PSYCHOLOGY TRIGGER INJECTION
- Hook -> CURIOSITY_GAP: write a question that creates an open loop and is not answered in the question itself.
- Act 1 -> NOSTALGIA: the first scene narration must open in a sensory moment.
- Act 2 -> IDENTITY_MIRROR: do not resolve the problem here; the hero should still be facing it.
- Act 3 -> COMPLETION_SATISFACTION: the hero wins through one specific virtuous action, but do not name the virtue directly.
`
    : '';

  // New intelligence themes (raw from content-intelligence.json — distinct from processed pool)
  const intelligenceThemesBlock = contentIntelligence?.new_themes?.length
    ? `\nFresh intelligence themes (high confidence, brand-safe — prioritise these over generic ones):\n${
        contentIntelligence.new_themes
          .filter(t => t.brand_safe !== false && (t.confidence ?? 1) >= 0.75)
          .slice(0, 5)
          .map(t => `- ${t.name} (confidence ${t.confidence}) — ${t.rationale || ''}`)
          .join('\n')
      }`
    : '';

  // Story hook inspiration from content-intelligence new_hooks
  const intelligenceHooksBlock = contentIntelligence?.new_hooks?.length
    ? `\nIntelligence hook patterns (use as hookQuestion inspiration, not verbatim):\n${
        contentIntelligence.new_hooks
          .filter(h => h.brand_safe !== false)
          .slice(0, 4)
          .map(h => `- [${h.hook_type || 'hook'}] "${h.text}"`)
          .join('\n')
      }`
    : '';

  // Story CTA suggestions from cta-library — pick app/both entries as inspiration
  const ctaSuggestions = [];
  if (ctaLibrary?.ctas) {
    for (const platform of ['instagram', 'pinterest', 'tiktok']) {
      const bucket = ctaLibrary.ctas[platform];
      if (!bucket) continue;
      for (const type of ['app', 'both']) {
        (bucket[type] || []).filter(c => c.brand_safe !== false).slice(0, 1).forEach(c => ctaSuggestions.push(c.text));
      }
    }
  }
  const ctaLibraryBlock = ctaSuggestions.length
    ? `\nCTA library samples (use as inspiration for ctaText — keep yours to 4-8 words):\n${ctaSuggestions.slice(0, 3).map(t => `- "${t}"`).join('\n')}`
    : '';

  // Audit lessons — surface critical/high to avoid repeat mistakes
  const auditBlock = auditLearnings.length
    ? `\nAudit rules (do NOT violate these):\n${auditLearnings.slice(0, 5).map(l => `- [${l.severity}] ${l.lesson || l.description || JSON.stringify(l)}`).join('\n')}`
    : '';

  const visualStyleBlock = `
## EPISODE VISUAL STYLE (apply to every imagePromptHint)
- Art style (use EXACTLY this for all 24 scenes): ${artStyle}
- Protagonist (consistent across all 24 scenes): ${character.description}
- Protagonist name: ${character.name} — use ONLY this name in all compositionNotes and imagePromptHints. Never substitute another name.
- Protagonist pronouns: ${character.gender === 'girl' ? 'she/her' : 'he/him'} — never use the wrong pronoun anywhere in the brief.
- Image format: horizontal landscape, 1920×1080 px — every imagePromptHint MUST end with "horizontal landscape format, 1920×1080 px"
- Leave bottom 15% of every image clear (no characters, no objects — text overlay zone)
- BOTTOM FADE (mandatory every scene): The ground or environment at the lower edge must dissolve softly into light cream, ivory, or pale white — like paint fading into paper. Never cut abruptly at the bottom. Include in every imagePromptHint: "ground fades softly to pale cream at lower edge" or equivalent. This creates a natural storybook separation for the caption zone.
- PSYCHOLOGY COLOR CUES per act (mandatory — weave into every imagePromptHint):
  * Act 1 (NOSTALGIA): warm amber-golden haze, late-afternoon glow, golden rim light, earthy muted tones
  * Act 2 (IDENTITY_MIRROR): cool reflective blue-green tones, muted palette, atmospheric depth, slight desaturation
  * Act 3 (COMPLETION_SATISFACTION): vibrant saturated colors, bright warm sunlight, lit-from-within quality, joyful palette
- No JoyMaze branding, logos, or text in any image
- Each scene has a shotType field (ESTABLISHING / MEDIUM / CLOSE-UP / ACTION / POV) — use it to set the camera distance and framing in Gemini
`;

  const sfxBlock = `
## SOUND EFFECTS LIBRARY — assign one sfxTag per scene
Match the scene's action/environment to the best tag. Leave sfxTag empty string if no tag fits.
- garden_ambience: outdoor garden with birds and light wind (establishing shots, walking in garden)
- water_pour: watering can pouring water onto plants/soil
- footsteps_grass: walking on grass or earth
- soil_dig: digging, planting seeds in soil
- evening_ambience: crickets and evening birds (sunset/dusk scenes)
- wind_breeze: gentle outdoor breeze (open landscape, sky scenes)
- leaves_rustle: rustling leaves or hands touching plant leaves
- gentle_chime: soft emotional bell for quiet/climax close-up moments
- footsteps_indoor: walking on wood or tile (indoor scenes)
- rain_gentle: gentle rain sounds
- crowd_children: children playing in background
- book_page_turn: paper sounds (reading/activity scenes)
- magic_sparkle: wonder/discovery moments
- ocean_waves: beach or water scenes
- fire_crackling: cozy indoor fire scenes
`;

  return `${styleGuide}

---

You are planning a JoyMaze story long-form episode for kids ages 4-8 and their parents.
Episode number: ${nextEpisodeNumber}
Format: 3 acts, exactly 8 scenes per act, exactly 24 scenes total.${recentEpisodesBlock}${trendsBlock}${dynamicThemesBlock}${intelligenceThemesBlock}${competitorBlock}${hooksBlock}${intelligenceHooksBlock}${perfWeightsBlock}${ctaLibraryBlock}${auditBlock}${backgroundRule}${psychBlock}${visualStyleBlock}${sfxBlock}

Return one JSON object with exactly this shape:
{
  "title": "string",
  "slug": "string",
  "theme": "string",
  "hookQuestion": "string",
  "acts": [
    {
      "actNumber": 1,
      "triggerNote": "string",
      "scenes": [
        {
          "sceneIndex": 1,
          "shotType": "ESTABLISHING",
          "compositionNote": "string",
          "psychologyBeat": "string",
          "narration": "string",
          "imagePromptHint": "string",
          "sfxTag": "string"
        }
      ]
    }
  ],
  "ctaText": "string",
  "episodeCatchphrase": "string",
  "catchphraseScenes": [14, 22],
  "parentLayer": "string",
  "sunoBackground": "string"
}

Hard rules:
- PROTAGONIST NAME + GENDER: The character is named "${character.name}" (${character.gender}). Every compositionNote, narration, and imagePromptHint that references the character MUST use "${character.name}" or the correct pronoun (${character.gender === 'girl' ? 'she/her' : 'he/him'}). Never use a different name. Never use the wrong pronoun.
- title: short, child-friendly, storybook style.
- slug: kebab-case version of the title.
- theme: concise thematic label, like "ocean-adventure".
- hookQuestion: a curiosity-gap question answered only in Act 3.
- acts: exactly 3 acts.
- each act: exactly 8 scenes.
- sceneIndex: global numbering 1 through 24.
- shotType: one of ESTABLISHING | MEDIUM | CLOSE-UP | ACTION | POV. Rules:
  * Act 1 scene 1 MUST be ESTABLISHING (wide shot, full environment, sets the world).
  * No two consecutive scenes within the same act can share the same shotType.
  * Each act must use at least 4 different shotTypes.
  * Act 3 climax scene (scene 24) MUST be CLOSE-UP (maximum emotional intensity).
- compositionNote: 1 sentence. What is in the foreground, what is in the background, lighting direction, character posture or expression. Used by artist to frame the image before generating.
- psychologyBeat: 3-6 words. The emotional beat this scene serves. Examples: "warmth of memory," "tension before the leap," "quiet pride arrives," "world cracks open." Must align with the act's psychology trigger.
- narration: CRITICAL — spoken aloud by a TTS voice narrator. Must sound natural and warm when a computer voice reads it. Apply ALL rules:
  * Length: 12-18 words per scene. COMPLETE SENTENCES ONLY. No fragments separated by periods. TTS voices read sentence fragments as choppy robotic bursts — this destroys immersion.
  * Tone: warm bedtime story narrator. Gentle, guiding, flowing. Like an audiobook read aloud to young children.
  * Structure: 1-2 complete sentences using commas for rhythm, not periods between fragments. Never write "She watered. Again." or "Cold earth. Warm seed." — these are poetic on paper but robotic spoken.
  * Sensory and concrete: what the character does, sees, feels. Never abstract or expository.
  * NO inner monologue: no "she decided", "she thought", "he realized" — show the physical moment.
  * PSYCHOLOGY per act — mandatory:
    - Act 1 (NOSTALGIA): gentle sensory language, warmth, earthy detail. The listener should feel transported to a childhood afternoon.
    - Act 2 (IDENTITY_MIRROR): use "you" or language that mirrors the parent's experience — "the way children do", "the kind of patience that surprises you". Surface the recognizable.
    - Act 3 (COMPLETION_SATISFACTION): complete, resonant sentences. Each one a door clicking shut. Victory felt, not named.
  * BAD (sounds robotic when spoken): "Cold earth. Warm seed." / "She watered. Again." / "Day's end. Still waiting."
  * GOOD (flows naturally when spoken): "She pressed the seed gently into the cool dark earth and felt something very quiet begin." / "Far below the surface, in the quiet dark, something small and patient began to stir."
  * GOOD: "She watered it again, more carefully this time, as if she already knew how much this little life depended on her."
  * Scene 24 ONLY: the most resonant sentence in the episode, 12-16 words, completing the full emotional arc. This is the last thing heard before the outro.
  * No two narration lines may share the same opening 5 words. Vary sentence structure across all 24.
- hookQuestion: NOT a generic question. Must create an OPEN LOOP — unanswerable without watching. Lead with stakes or the payoff glimpse. BAD: "What happens when a seed grows?" GOOD: "Before Benny left the garden, something impossible happened." or "What if the smallest act of kindness could change everything around you?"
- imagePromptHint: a COMPLETE Gemini image generation prompt, 50-70 words. Mandatory checklist — every prompt MUST include all of these:
  * Scene composition: what the character is doing, facial expression, posture
  * Environment: setting detail, background elements
  * Act psychology color cue: Act 1 = amber-golden, Act 2 = cool reflective blue-green, Act 3 = vibrant saturated (woven naturally, not as a label)
  * Bottom fade: "ground fades softly to pale cream at lower edge" or equivalent phrasing
  * End with: "Horizontal landscape format, 1920×1080 px"
  * Do NOT begin with "Generate", "Create", "Render", or any meta-instruction — start directly with the scene description
  * Do NOT say "in the style of" — weave the art style naturally into the description
  * Do NOT repeat the same composition framing as the previous scene
- Act 1 scene 1 must begin in a sensory moment (close-up: hands, face, or object).
- Act 2 must not resolve the core problem.
- Act 3 must resolve the story through one concrete virtuous action.
- ctaText: 4-8 words, activity CTA.
- If a background pool prompt was provided above, copy it exactly into "sunoBackground".
- episodeCatchphrase: one short verbal pattern unique to this episode and this character. Memorable to a 4-year-old. Examples: "That's a ${character.name} idea!", "${character.name}'s thinking face!", a character-specific sound or saying. 3-6 words.
- catchphraseScenes: exactly 2 global scene indexes [N, M]. N = Act 2 scene where catchphrase is introduced (scene 9-16). M = Act 3 callback where it pays off (scene 17-24). Must be plausible given the narration you wrote.
- parentLayer: exactly 1 sentence. A moment in the story where a parent watching will smile or feel seen — layered naturally, not at the child's expense. Must reference a specific scene or moment in the story. Keep it honest and understated.`;
}

function validateBrief(brief) {
  if (!brief || typeof brief !== 'object') {
    throw new Error('Groq response was not a JSON object.');
  }

  if (!Array.isArray(brief.acts) || brief.acts.length !== 3) {
    throw new Error('Brief must contain exactly 3 acts.');
  }

  const totalScenes = brief.acts.reduce((count, act) => count + (Array.isArray(act.scenes) ? act.scenes.length : 0), 0);
  if (totalScenes !== TOTAL_SCENES) {
    throw new Error(`Brief must contain exactly ${TOTAL_SCENES} scenes (got ${totalScenes}).`);
  }

  brief.acts.forEach((act, actIndex) => {
    if (!Array.isArray(act.scenes) || act.scenes.length !== SCENES_PER_ACT) {
      throw new Error(`Act ${actIndex + 1} must contain exactly ${SCENES_PER_ACT} scenes.`);
    }
  });
}

function buildEpisodeJson(brief, context, artStyle, character) {
  const selectedBackground = getLowestUsedPoolEntry(context.sunoPool, 'story_background_ambient');
  const selectedHookJingle = getLowestUsedPoolEntry(context.sunoPool, 'hook_jingle');
  const selectedOutroJingle = getLowestUsedPoolEntry(context.sunoPool, 'outro_jingle');
  const activityFolder = '';

  const acts = brief.acts.map((act) => ({
    actNumber: act.actNumber,
    triggerNote: act.triggerNote,
    scenes: act.scenes.map((scene, index) => ({
      sceneIndex: scene.sceneIndex ?? ((act.actNumber - 1) * SCENES_PER_ACT) + index + 1,
      shotType: scene.shotType || 'MEDIUM',
      compositionNote: scene.compositionNote || '',
      psychologyBeat: scene.psychologyBeat || '',
      narration: scene.narration,
      imagePromptHint: scene.imagePromptHint,
      sfxTag: scene.sfxTag || '',
      imagePath: '',
      animatedClip: '',
      durationSec: 15,
      narrationFile: '',
    })),
  }));

  const totalDurationSec = 20
    + acts.reduce((sum, act) => sum + act.scenes.reduce((sceneSum, scene) => sceneSum + scene.durationSec, 0), 0)
    + (activityFolder ? 105 : 0)
    + 20;

  return {
    format: 'story-longform',
    episodeNumber: context.nextEpisodeNumber,
    title: brief.title,
    slug: brief.slug,
    theme: brief.theme,
    date: TODAY,
    psychologyMap: {
      hook: 'CURIOSITY_GAP',
      act1: 'NOSTALGIA',
      act2: 'IDENTITY_MIRROR',
      act3: 'COMPLETION_SATISFACTION',
      activity: 'CHALLENGE',
      outro: 'SCREEN_RELIEF',
    },
    hookQuestion: brief.hookQuestion,
    catchphrase: brief.episodeCatchphrase || '',
    catchphraseScenes: brief.catchphraseScenes || [],
    parentLayer: brief.parentLayer || '',
    includeCta: false,
    acts,
    artStyle: artStyle || '',
    character: character || {},
    hookJingleKey: selectedHookJingle?.id || 'hook_jingle_01',
    outroJingleKey: selectedOutroJingle?.id || 'outro_jingle_01',
    activityFolder,
    sunoPrompts: {
      background: (() => {
        const raw = selectedBackground?.prompt || brief.sunoBackground || '';
        const isEcho = !raw || /generate|suno background prompt for|copy this verbatim/i.test(raw);
        return isEcho
          ? `Gentle ambient music for a children's story about ${brief.theme || 'adventure'}, soft piano, warm and peaceful, no lyrics`
          : raw;
      })(),
      backgroundDropPath: 'background.mp3',
      hookJingle: selectedHookJingle?.prompt
        || `Upbeat playful children's jingle, 5-8 seconds, xylophone and ukulele, energetic and fun, no lyrics, theme: ${brief.theme || 'adventure'}`,
      hookJingleDropPath: 'hook-jingle.mp3',
      outroJingle: selectedOutroJingle?.prompt
        || `Warm cozy children's jingle, 5-8 seconds, soft piano and bells, gentle and satisfying, no lyrics, theme: ${brief.theme || 'adventure'}`,
      outroJingleDropPath: 'outro-jingle.mp3',
    },
    jingleDropPaths: {
      hook: 'hook-jingle.mp3',
      bridge: 'bridge-jingle.mp3',
      outro: 'outro-jingle.mp3',
    },
    totalDurationSec,
    rendered: false,
  };
}

function buildBriefMd(brief, episodeDir, artStyle, character, targetOrientation = 'horizontal') {
  const sceneRows = brief.acts
    .flatMap((act) => act.scenes)
    .sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0))
    .map((scene) => [
      `**Scene ${String(scene.sceneIndex).padStart(2, '0')}** · ${scene.shotType || 'MEDIUM'} · _${scene.psychologyBeat || ''}_`,
      `> ${scene.compositionNote || ''}`,
      scene.imagePromptHint,
    ].join('\n'))
    .join('\n\n');

  return `# Story Longform Brief: ${brief.title}
Date: ${TODAY}
Folder: ${episodeDir}
Theme: ${brief.theme}
Hook: "${brief.hookQuestion}"
CTA: "${brief.ctaText || 'Try it with your child!'}"
Catchphrase: "${brief.episodeCatchphrase || ''}" (introduce scene ${brief.catchphraseScenes?.[0] || 'N/A'}, callback scene ${brief.catchphraseScenes?.[1] || 'N/A'})
Parent layer: ${brief.parentLayer || ''}

## Episode visual style (use for ALL 24 scenes in Gemini)
- **Art style:** ${artStyle}
- **Protagonist:** ${character.description}
- **Render target:** ${targetOrientation === 'horizontal' ? 'YouTube 1920×1080 horizontal (16:9)' : 'TikTok 1080×1920 vertical (9:16)'}
- **Image format:** Horizontal landscape, 1920×1080 px — compose subject in center frame; full-bleed widescreen
- **Bottom 15% clear** — leave empty for text overlay

## Episode metadata
- Slug: ${brief.slug}
- Acts: 3
- Scenes: 24 (8 per act)

## Scene image prompts — name files 01.png, 02.png ... 24.png and drop in episode folder
${sceneRows}

## Step 2: Drop 3 MP3 files into episode folder

**background.mp3** — ambient background music (plays under all scenes)
\`\`\`
${brief.sunoPrompts.background}
\`\`\`

**hook-jingle.mp3** — plays during opening hook (upbeat, 5-8s)
\`\`\`
${brief.sunoPrompts.hookJingle}
\`\`\`

**outro-jingle.mp3** — plays during closing outro (warm, 5-8s)
\`\`\`
${brief.sunoPrompts.outroJingle}
\`\`\`

## Step 3: Run narration generation
\`\`\`
node scripts/generate-narration.mjs --episode ${episodeDir}
\`\`\`

## Step 4: Run scene animation
\`\`\`
node scripts/animate-scenes.mjs --episode ${episodeDir}
\`\`\`

## Step 5: Run render
\`\`\`
node scripts/render-story-longform.mjs --episode ${episodeDir} --orientation ${targetOrientation}
\`\`\`
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

function validateNarrationDiversity(brief) {
  const narrations = brief.acts
    .flatMap((act) => act.scenes)
    .map((scene) => ({ index: scene.sceneIndex, text: (scene.narration || '').toLowerCase() }));

  for (let i = 0; i < narrations.length; i++) {
    for (let j = i + 1; j < narrations.length; j++) {
      const wordsA = narrations[i].text.split(/\s+/).slice(0, 4).join(' ');
      const wordsB = narrations[j].text.split(/\s+/).slice(0, 4).join(' ');
      if (wordsA && wordsB && wordsA === wordsB) {
        console.warn(`  Warning: Scenes ${narrations[i].index} and ${narrations[j].index} share identical opening 4 words: "${wordsA}"`);
      }
    }
  }
}

function validateFinale(brief) {
  const act3 = brief.acts.find((act) => act.actNumber === 3);
  if (!act3) return;
  const lastScene = act3.scenes[act3.scenes.length - 1];
  if (!lastScene) return;
  const wordCount = (lastScene.narration || '').trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 6) {
    console.warn(`  Warning: Scene 24 finale narration is too short (${wordCount} words): "${lastScene.narration}" — target 6-12 words.`);
  }
}

function validateProtagonistConsistency(brief, character) {
  const wrongPronouns = character.gender === 'girl'
    ? [/\bhe\b/i, /\bhis\b/i, /\bhim\b/i, /\bhimself\b/i]
    : [/\bshe\b/i, /\bher\b/i, /\bhers\b/i, /\bherself\b/i];
  const name = character.name || '';

  brief.acts.forEach((act) => {
    act.scenes.forEach((scene) => {
      const fields = [scene.narration || '', scene.compositionNote || '', scene.imagePromptHint || ''];
      fields.forEach((text) => {
        for (const pattern of wrongPronouns) {
          if (pattern.test(text)) {
            console.warn(`  Warning: Scene ${scene.sceneIndex} uses wrong pronoun for ${character.gender} protagonist "${name}": "${text.slice(0, 70)}"`);
            break;
          }
        }
      });
    });
  });
}

async function main() {
  console.log('\n  JoyMaze Story Longform Planner');
  console.log(`  Date: ${TODAY}`);
  console.log('');

  const context = await loadContext();
  console.log(`  Next episode: ${context.nextEpisodeNumber}`);
  if (context.recentEpisodes.length > 0) {
    console.log(`  Recent episodes: ${context.recentEpisodes.join(', ')}`);
  }

  const artStyle = pickEpisodeStyle(context.nextEpisodeNumber);
  const character = pickEpisodeCharacter(context.nextEpisodeNumber);
  console.log(`  Art style:  ${artStyle}`);
  console.log(`  Character:  ${character.description}`);

  const prompt = buildPrompt(context, artStyle, character);

  if (DRY_RUN) {
    console.log('\n--- SYSTEM PROMPT (dry run) ---');
    console.log(prompt);
    console.log('--- END ---\n');
    return;
  }

  console.log(`  Calling Groq (${GROQ_MODEL})...`);
  const brief = await callGroq(prompt);
  validateBrief(brief);
  validateNarrationDiversity(brief);
  validateFinale(brief);
  validateProtagonistConsistency(brief, character);

  const episodeJson = buildEpisodeJson(brief, context, artStyle, character);
  const episodeFolderName = `ep${String(context.nextEpisodeNumber).padStart(2, '0')}-${episodeJson.slug}`;
  const episodeDir = path.join('output', 'longform', 'story', episodeFolderName).replace(/\\/g, '/');
  const poolIds = {
    story_background_ambient: getLowestUsedPoolEntry(context.sunoPool, 'story_background_ambient')?.id || null,
    hook_jingle: getLowestUsedPoolEntry(context.sunoPool, 'hook_jingle')?.id || null,
    outro_jingle: getLowestUsedPoolEntry(context.sunoPool, 'outro_jingle')?.id || null,
  };

  console.log('');
  console.log(`  Title: ${episodeJson.title}`);
  console.log(`  Hook:  "${episodeJson.hookQuestion}"`);
  episodeJson.acts.forEach((act) => {
    const summary = act.scenes.map((scene) => scene.narration).join(' | ');
    console.log(`  Act ${act.actNumber}: ${summary}`);
  });
  console.log('');

  if (!SAVE) {
    console.log('  Run with --save to create the folder and files.');
    return;
  }

  await fs.mkdir(path.join(STORY_LONGFORM_DIR, episodeFolderName), { recursive: true });
  await fs.writeFile(
    path.join(STORY_LONGFORM_DIR, episodeFolderName, 'episode.json'),
    `${JSON.stringify(episodeJson, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(STORY_LONGFORM_DIR, episodeFolderName, 'brief.md'),
    buildBriefMd(
      { ...brief, sunoPrompts: episodeJson.sunoPrompts },
      episodeDir,
      artStyle,
      character,
      orientation,
    ),
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

#!/usr/bin/env node
// generate-x-posts.mjs — JoyMaze X text post generator
// Generates 4 daily X posts with full intelligence injection, rule-based scoring, dedup, and feedback loop output.

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output', 'queue');
const SCORES_DIR = path.join(ROOT, 'output', 'scores');

// Config paths
const WRITING_STYLE_PATH  = path.join(ROOT, 'config', 'writing-style.md');
const TRENDS_PATH          = path.join(ROOT, 'config', 'trends-this-week.json');
const HOOKS_PATH           = path.join(ROOT, 'config', 'hooks-library.json');
const THEME_POOL_PATH      = path.join(ROOT, 'config', 'theme-pool-dynamic.json');
const CTA_LIBRARY_PATH     = path.join(ROOT, 'config', 'cta-library.json');
const PERF_WEIGHTS_PATH    = path.join(ROOT, 'config', 'performance-weights.json');

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const VERBOSE   = args.includes('--verbose');

const POST_COUNT  = 4;
const POST_TYPES  = ['story-hook', 'puzzle', 'insight', 'identity'];
const PUZZLE_CLOSE = 'drop your answer below \uD83D\uDC47';
const TWEET_MAX   = 280;
const SCORE_THRESHOLD = 0.55;   // posts below this trigger one retry
const DEDUP_DAYS  = 7;

// UTC hours optimised for North American parents (EST audience):
//   13 UTC = 8 AM EST  — post-drop-off morning scroll
//   17 UTC = 12 PM EST — lunch peak
//   21 UTC = 4 PM EST  — after-work / commute scroll
//   23 UTC = 6 PM EST  — pre-bedtime routine
const SCHEDULED_HOURS_UTC = [13, 17, 21, 23];

// ---------------------------------------------------------------------------
// Style guide — which ## sections to pull from writing-style.md
// ---------------------------------------------------------------------------
const STYLE_SECTIONS_TO_KEEP = [
  'WHO YOU ARE WRITING FOR',
  'THE IDENTITY SHIFT',
  'THE 4 HYPNOTIC PILLARS',
  'THE 3 REASONS PARENTS BUY',
  'HOOK LIBRARY',
  'HYPNOTIC CTA LIBRARY',
  'VIRAL HOOK ENGINEERING',
  'HYPNOTIC EDITING RULES',
  'WHAT NOT TO WRITE',
  'JOYMAZE EMOTIONAL ANCHORS',
];

// ---------------------------------------------------------------------------
// Banned patterns — used in scoring and injected into system prompt
// ---------------------------------------------------------------------------
const BANNED_OPENERS_RX = [
  /^research shows/i,
  /^did you know/i,
  /^studies show/i,
  /^science says/i,
  /^according to/i,
];

const BANNED_PHRASES_RX = [
  { rx: /it('s| is) a game.changer/i,              label: '"game changer" cliché' },
  { rx: /which resonates with you\?$/i,             label: 'robotic CTA "which resonates with you?"' },
  { rx: /save this for when you need it\.?$/i,      label: 'overused identity CTA' },
  { rx: /this picture|in this (photo|image|pic)/i,  label: 'image reference in text-only post' },
  { rx: /joymaze|download|install|app store|google play/i, label: 'promotional mention' },
];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function formatDateUTC(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function scheduledHours(count) {
  return SCHEDULED_HOURS_UTC.slice(0, count);
}

async function readTextIfExists(filePath) {
  try { return await fs.readFile(filePath, 'utf-8'); } catch { return ''; }
}

async function readJsonIfExists(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf-8')); } catch { return null; }
}

function log(...args) { console.log(...args); }
function verbose(...args) { if (VERBOSE) console.log('[verbose]', ...args); }

// ---------------------------------------------------------------------------
// Style guide extraction
// Extract only the sections relevant to X post generation.
// This keeps ~200–250 lines instead of all 796, preventing context flooding.
// ---------------------------------------------------------------------------
function extractStyleSections(writingStyle) {
  if (!writingStyle) return '';

  // Split on top-level ## headers, keeping the header with each section
  const sections = writingStyle.split(/(?=^## )/m);

  const kept = sections.filter(section =>
    STYLE_SECTIONS_TO_KEEP.some(name => section.includes(name))
  );

  return kept.join('\n').trim();
}

// ---------------------------------------------------------------------------
// System prompt — focused style sections + hard banned-patterns block
// ---------------------------------------------------------------------------
function buildSystemPrompt(writingStyle) {
  const styleCore = extractStyleSections(writingStyle);

  const bannedBlock = `
## BANNED PATTERNS — NEVER USE THESE (they mark AI-generated content)

### Banned openers (do not start any tweet1 with these):
- "Research shows" / "Studies show" / "Science says" / "According to"
- "Did you know"
- "You're the kind of parent who" (find a scene-entry instead)
- "I'll never forget the [adjective] [time] when" (too formulaic)

### Banned phrases (do not appear anywhere in the post):
- "it's a game changer" / "it's a game-changer"
- "which resonates with you?" — banned completely
- "save this for when you need it" — use AT MOST ONCE per daily batch, only when earned
- "JoyMaze", "download", "install", "App Store", "Google Play" — no product mentions
- Any phrase like "in this picture", "in this image", "this photo" — never reference images in a text post

### Banned in puzzle posts specifically:
- "Can your kid find X hidden [things] in this picture/image/photo" — text-only puzzles MUST be self-contained riddles
- Any challenge that requires a visual to work

### Quality signals you must hit:
- SPECIFICITY: concrete details — numbers, named objects, sounds, body language, textures
- The hook must work standalone — a reader sees ONLY tweet1 before deciding to keep reading
- Story threads must EARN their ending — no summary conclusions like "and I realized" or "it reminded me"
- Puzzle posts = self-contained word riddles or lateral-thinking puzzles; no image needed
- Rhythm: vary sentence length — short for impact, long for immersion, short again
`;

  return styleCore
    ? `${styleCore}\n\n${bannedBlock}`
    : `You are a brand copywriter for JoyMaze, a kids activity app for ages 4–8.\n${bannedBlock}`;
}

// ---------------------------------------------------------------------------
// Context builders — each reads one file and returns a short text block
// ---------------------------------------------------------------------------
function buildTrendNotes(trends) {
  if (!trends) return '';
  const top     = (trends.boost_themes    || []).slice(0, 5).join(', ');
  const rising  = (trends.rising_searches || []).slice(0, 5).join(', ');
  const kw      = (trends.caption_keywords || []).slice(0, 6).join(', ');
  return [
    top    ? `Trending themes: ${top}`    : '',
    rising ? `Rising searches: ${rising}` : '',
    kw     ? `Useful phrases: ${kw}`      : '',
  ].filter(Boolean).join('\n');
}

function buildHookNotes(hooksData) {
  const hooks = (hooksData?.hooks || [])
    .filter(h => h.brand_safe === true && h.text)
    .sort((a, b) => (b.performance_score ?? -1) - (a.performance_score ?? -1))
    .slice(0, 8)
    .map(h => `[${h.hook_type || 'hook'}] ${h.text}`);
  return hooks.length ? hooks.join('\n') : '';
}

function buildThemeNotes(themePool) {
  if (!themePool?.themes?.length) return '';
  const active = themePool.themes
    .filter(t => t.status !== 'evicted' && t.brand_safe !== false)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 5)
    .map(t => `- ${t.name}${t.rationale ? ': ' + t.rationale : ''}`);
  return active.length ? `Active content themes this week:\n${active.join('\n')}` : '';
}

function buildCtaNotes(ctaLib) {
  const xCtas = (ctaLib?.ctas?.x?.engagement || [])
    .filter(c => c.brand_safe !== false)
    .sort((a, b) => (b.performance_score ?? 0) - (a.performance_score ?? 0))
    .slice(0, 4)
    .map(c => `- "${c.text}"`);

  // Fallback from writing-style CTA library if dynamic pool is empty
  const fallback = [
    '- "You\'re one step away from the afternoon you keep hoping for."',
    '- "The quiet moment you want is closer than it feels."',
    '- "One small shift. Watch what follows."',
    '- "Lean into this. See where it takes you."',
  ];

  const options = xCtas.length ? xCtas : fallback;
  return `Soft CTA options (adapt freely — do not copy verbatim; use at most once across all 4 posts):\n${options.join('\n')}`;
}

function buildPerfNotes(perfWeights) {
  if (!perfWeights) return '';
  // performance-weights.json schema: { weights: { [archetype]: { weight, save_rate } } }
  const w = perfWeights.weights || perfWeights;
  if (typeof w !== 'object') return '';
  const top = Object.entries(w)
    .filter(([, v]) => typeof v === 'object' ? v.weight > 1.0 : false)
    .sort(([, a], [, b]) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 3)
    .map(([k]) => k);
  return top.length ? `High-resonance archetypes this week (lean into these angles): ${top.join(', ')}` : '';
}

// ---------------------------------------------------------------------------
// Recent tweet deduplication — load tweet1 fingerprints from last N days
// ---------------------------------------------------------------------------
async function loadRecentFingerprints(daysBack = DEDUP_DAYS) {
  const seen = new Set();
  const today = new Date();
  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const data = await readJsonIfExists(path.join(OUTPUT_DIR, `x-text-${formatDateUTC(d)}.json`));
    if (Array.isArray(data)) {
      data.forEach(p => {
        if (p.tweet1) seen.add(p.tweet1.toLowerCase().slice(0, 60));
      });
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// User prompt — all context injected, fixed type rules, no hardcoded CTAs
// ---------------------------------------------------------------------------
function nextScheduledHour(afterHour) {
  const next = SCHEDULED_HOURS_UTC.find(h => h > afterHour);
  return next ?? afterHour + 3;
}

function buildUserPrompt({ trendNotes, hookNotes, themeNotes, ctaNotes, perfNotes, recentFingerprints, date }) {
  const slotLines = POST_TYPES.map((type, i) =>
    `${i + 1}. ${type} at ${scheduledHours(POST_TYPES.length)[i]}:00 UTC`
  ).join('\n');

  const dedupBlock = recentFingerprints?.size > 0
    ? `\nDO NOT reuse or closely echo these recent opening lines:\n${[...recentFingerprints].slice(0, 20).map(f => `- "${f}..."`).join('\n')}`
    : '';

  const perfBlock  = perfNotes  ? `\n${perfNotes}\n`  : '';
  const trendBlock = trendNotes ? `\nWeekly trend notes:\n${trendNotes}\n` : '';
  const themeBlock = themeNotes ? `\n${themeNotes}\n`  : '';
  const hookBlock  = hookNotes  ? `\nWinning hook examples (use as inspiration, never copy):\n${hookNotes}\n` : '';
  const ctaBlock   = ctaNotes   ? `\n${ctaNotes}\n`   : '';

  return `You are writing 4 standalone X (Twitter) text posts for JoyMaze on ${date}.

Return ONLY valid JSON — an array of exactly ${POST_COUNT} objects.
Default shape: {"type":"story-hook|insight|identity","tweet1":"...","replies":["..."]}
Puzzle shape:  {"type":"puzzle","tweet1":"...","replies":["hint line"],"answer_tweet":"The answer is: X! ..."}

Required slot plan:
${slotLines}

═══ UNIVERSAL RULES ═══
- Write for parents of kids ages 4–8
- No hashtags, no links, no brand/app mentions
- No corporate tone — write like a real parent
- Every individual tweet: 280 characters max
- Each post must feel DISTINCTLY different in hook type, rhythm, and angle
- Do not mention scheduledHour in the output
${dedupBlock}

═══ TYPE-BY-TYPE RULES ═══

STORY-HOOK:
- tweet1 opens INSIDE a specific scene — no warm-up, no preamble
- Use exactly ONE of: sharp dialogue, unexpected detail, high-stakes parenting micro-moment, sensory contradiction
- replies: 2–3 items
  - reply 1: builds tension, struggle, or the emotional turn
  - reply 2 (if present): deepens the tension or raises the stakes
  - final reply: delivers the payoff — must be EARNED, not summarised
- No CTA. No "I realized". No "it reminded me". The reader feels the meaning — you don't explain it.
- The story must feel like it happened to a real person, not a teaching moment

PUZZLE:
- tweet1 is a SELF-CONTAINED TEXT RIDDLE — completely standalone
- Types that work: "I have X but no Y" riddles, "what am I?" riddles, lateral thinking puzzles, play-on-words challenges
- Themes: nature, animals, seasons, things kids interact with (pencils, books, clocks, shadows, keys)
- NEVER reference a picture, image, or visual
- replies: exactly 1 item — a HINT or engagement prompt. Do NOT include the answer here.
  Good examples: "Think carefully... drop your guess below 👇 — answer drops in a few hours"
                 "Any ideas? Reply below 👇 I'll reveal the answer with the next post"
                 "This one has a trick to it — what do you think? 👇 answer coming soon"
- Include a separate "answer_tweet" field (a plain string, not inside replies) with the delayed answer reveal.
  Format: "The answer is: [answer]! [one short fun reaction]. Did you get it?"
  Example: "The answer is: a clock ⏰ Hands but no arms — gets everyone! Did you get it?"
- The JSON shape for puzzle posts MUST include answer_tweet:
  {"type":"puzzle","tweet1":"...","replies":["hint or engagement line"],"answer_tweet":"The answer is: X! ..."}
- Keep the riddle thematic, age-appropriate, and genuinely fun to solve aloud

INSIGHT:
- tweet1 shares one specific, surprising parenting or child development observation
- NEVER open with "Research shows", "Did you know", "Studies show", "Science says"
- Frame as: a bold claim ("Kids who draw daily have steadier hands by age 7."), a contrast ("Screen time doesn't tire them out — unfinished puzzles do."), or a specific observation ("Most kids stop a maze at the first dead end. Then they try again when no one is watching.")
- replies: exactly 1 item — a specific, actionable tip. No vague advice.
- CTA is optional — if used, pick ONE from the options below and adapt it freely
${ctaBlock}

IDENTITY:
- tweet1 speaks to who the parent is in a SPECIFIC MOMENT — not a trait list
- NEVER open with "You're the kind of parent who" — find a scene, a feeling, a moment
- Think: the parent in the car after drop-off. The parent who picked up the crayons. The parent at 10pm who noticed something.
- replies: exactly 1 item — a deeper story beat, an emotional anchor, or a felt truth
- If using a CTA, use "save this for when you need it" AT MOST ONCE across the entire daily batch — only if the post genuinely earns it
${perfBlock}${trendBlock}${themeBlock}${hookBlock}
═══ QUALITY BAR ═══
- Every tweet1 must stop the scroll on its own — assume the reader sees ONLY this line before deciding
- Specificity beats generality every time: one crayon > "art supplies", 17 minutes > "a while"
- Puzzle posts: NO image needed to understand the challenge
- Story hooks: scenes, not summaries — put the reader inside the moment
- No weak filler: very, really, great, amazing, truly, awesome
- No emojis except the 👇 in the puzzle reply closing
- No repetition of hook structure, rhythm, or theme across the 4 posts
`;
}

// ---------------------------------------------------------------------------
// Groq API call
// ---------------------------------------------------------------------------
async function generateWithGroq(systemPrompt, userPrompt) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.92,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ---------------------------------------------------------------------------
// JSON parsing
// ---------------------------------------------------------------------------
function parseJsonArray(text) {
  const trimmed = text.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const start = trimmed.indexOf('[');
  const end   = trimmed.lastIndexOf(']');
  const slice = start !== -1 && end !== -1 ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(slice);
  if (!Array.isArray(parsed)) throw new Error('Model response was not a JSON array');
  return parsed;
}

// ---------------------------------------------------------------------------
// Text cleanup and normalisation
// ---------------------------------------------------------------------------
function cleanText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/#\S+/g, '')
    .trim();
}

function truncate(value, maxLength) {
  return value.length <= maxLength ? value : value.slice(0, maxLength).trim();
}

function extractReplies(source) {
  if (Array.isArray(source.replies)) return source.replies;
  const keyed = Object.keys(source)
    .filter(k => /^reply\d+$/i.test(k))
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
    .map(k => source[k]);
  if (keyed.length > 0) return keyed;
  if (source.reply1) return [source.reply1];
  return [];
}

function ensurePuzzleClose(text) {
  const stripped = text.replace(/\s+/g, ' ').trim()
    .replace(/drop your answer below(?:\s*\uD83D\uDC47)?[.!?]*$/i, '').trim();
  const joiner = stripped ? `${stripped} ` : '';
  return truncate(`${joiner}${PUZZLE_CLOSE}`, 280);
}

function normalizePosts(rawPosts) {
  const hours = scheduledHours(POST_COUNT);

  return POST_TYPES.map((type, index) => {
    const source  = rawPosts[index] || {};
    const tweet1  = truncate(cleanText(source.tweet1), TWEET_MAX);
    let replies   = extractReplies(source)
      .map(r => truncate(cleanText(r), TWEET_MAX))
      .filter(Boolean);

    const scheduledHour = hours[index];
    const post = { type, tweet1, scheduledHour };

    if (type === 'puzzle') {
      // reply1 = engagement/hint (no answer), answer posted separately later
      const hintReply = replies[0] || `Drop your guess below 👇 — answer coming in a few hours`;
      post.reply1  = truncate(cleanText(hintReply), TWEET_MAX);
      post.replies = [post.reply1];
      // Extract and schedule the delayed answer
      const rawAnswer = cleanText(source.answer_tweet || '');
      if (rawAnswer) {
        post.answer_tweet        = truncate(rawAnswer, TWEET_MAX);
        post.answer_scheduledHour = nextScheduledHour(scheduledHour);
      }
    } else if (type !== 'story-hook') {
      post.reply1  = replies[0] || '';
      post.replies = [post.reply1];
    } else {
      // story-hook: 2–3 replies
      if (replies.length === 0) replies = [''];
      post.reply1  = replies[0];
      post.replies = replies;
    }

    return post;
  });
}

// ---------------------------------------------------------------------------
// Rule-based post scorer
// Returns per-dimension scores + total (0–1) + pass flag + failure reasons
// ---------------------------------------------------------------------------
function scorePost(post, batchIdentityCTACount = 0) {
  const t1      = post.tweet1 || '';
  const t1low   = t1.toLowerCase();
  const allText = [t1, ...(post.replies || [])].join(' ');
  const allLow  = allText.toLowerCase();
  const reasons = [];

  // ── scroll-stop ──
  let scrollStop = 0.70;

  if (BANNED_OPENERS_RX.some(rx => rx.test(t1))) {
    scrollStop = 0.10;
    reasons.push('banned opener (Research shows / Did you know / etc.)');
  }
  if (/^you're the (kind|type) of parent who/i.test(t1)) {
    scrollStop = Math.min(scrollStop, 0.35);
    reasons.push('"You\'re the kind of parent who" opener');
  }
  if (/^i'll never forget the \w+ \w+ when/i.test(t1)) {
    scrollStop = Math.min(scrollStop, 0.45);
    reasons.push('formulaic "I\'ll never forget" opener');
  }
  // Specificity boosts
  if (/\d/.test(t1)) scrollStop = Math.min(1.0, scrollStop + 0.15);
  if (/[""]/.test(t1))      scrollStop = Math.min(1.0, scrollStop + 0.10); // dialogue
  if (t1.split(/\.\s+/).length >= 2 && t1.length < 120) {
    scrollStop = Math.min(1.0, scrollStop + 0.08); // staccato rhythm
  }

  // ── relevancy ──
  let relevancy = 0.60;
  const themeKw = ['color', 'maze', 'puzzle', 'draw', 'pencil', 'paper', 'crayon', 'printable',
                   'screen-free', 'screen free', 'activity', 'creative', 'focus', 'quiet', 'riddle',
                   'coloring', 'drawing', 'tracing', 'learning', 'craft'];
  const hits = themeKw.filter(w => allLow.includes(w)).length;
  if (hits === 0)      relevancy = 0.30;
  else if (hits >= 3)  relevancy = Math.min(1.0, 0.65 + hits * 0.05);

  // ── non-promotional ──
  let nonPromo = 1.0;
  if (/joymaze|download|install|app store|google play|buy now|get it now|free on/i.test(allLow)) {
    nonPromo = 0.20;
    reasons.push('promotional mention');
  }

  // ── engagement ──
  let engagement = 0.70;

  BANNED_PHRASES_RX.forEach(({ rx, label }) => {
    if (rx.test(allText)) {
      // "save this for when you need it" is allowed once per batch
      if (/save this for when you need it/i.test(allText) && batchIdentityCTACount < 1) {
        engagement = Math.min(engagement, 0.55); // mildly penalised but passes
      } else {
        engagement = Math.min(engagement, 0.30);
        reasons.push(label);
      }
    }
  });

  // Puzzle-specific: broken if references an image
  if (post.type === 'puzzle' && /this picture|this image|in this (photo|image|pic)|hidden .{1,20} in this/i.test(allText)) {
    scrollStop = 0.10;
    engagement = 0.10;
    reasons.push('puzzle references non-existent image');
  }

  // ── clarity ──
  let clarity = 0.80;
  if (t1.length > 280) { clarity = 0.20; reasons.push('tweet1 exceeds 280 chars'); }
  if (t1.length < 20)  { clarity = 0.20; reasons.push('tweet1 too short'); }
  if (!post.replies?.length || !post.replies[0]) {
    clarity = Math.min(clarity, 0.40);
    reasons.push('no reply');
  }

  const total = (scrollStop + relevancy + nonPromo + engagement + clarity) / 5;

  return {
    scrollStop: +scrollStop.toFixed(2),
    relevancy:  +relevancy.toFixed(2),
    nonPromo:   +nonPromo.toFixed(2),
    engagement: +engagement.toFixed(2),
    clarity:    +clarity.toFixed(2),
    total:      +total.toFixed(2),
    pass:       total >= SCORE_THRESHOLD,
    reasons,
  };
}

function scoreBatch(posts) {
  let identityCTACount = 0;
  return posts.map(post => {
    const score = scorePost(post, identityCTACount);
    if (post.type === 'identity' && /save this for when you need it/i.test([post.tweet1, ...post.replies].join(' '))) {
      identityCTACount++;
    }
    return { ...post, _score: score };
  });
}

// ---------------------------------------------------------------------------
// Retry prompt — targeted at specific failing slots
// ---------------------------------------------------------------------------
function buildRetryUserPrompt({ failingSlots, trendNotes, hookNotes, themeNotes, ctaNotes, date }) {
  const slotDescriptions = failingSlots.map(({ index, type, tweet1, reasons }) =>
    `Slot ${index + 1} (${type}): FAILED because: ${reasons.join('; ')}\n  Previous tweet1 was: "${tweet1}"`
  ).join('\n');

  return `You are rewriting ONLY the failing slots from a previous X post batch for JoyMaze on ${date}.

The following slots need to be completely rewritten — do not reuse any phrasing from the previous attempt:
${slotDescriptions}

Return ONLY valid JSON — an array containing ONLY the failing slots, in the same order.
Each object: {"type":"...","tweet1":"...","replies":["..."]}

Apply all the same rules as before:
- No "Research shows", "Did you know", banned openers
- Puzzle = self-contained text riddle, NO image references
- Identity = open with a specific scene/moment, NOT "You're the kind of parent who"
- Insight = bold claim or observation, NOT "Research shows"
- All tweets ≤ 280 chars
- No hashtags, no links, no brand mentions
- Specificity over generality
${trendNotes ? `\nTrends: ${trendNotes}` : ''}
${hookNotes  ? `\nHook examples: ${hookNotes}` : ''}
${themeNotes ? `\n${themeNotes}` : ''}
${ctaNotes   ? `\n${ctaNotes}` : ''}
`;
}

// ---------------------------------------------------------------------------
// Fallback posts (used when Groq is unavailable — written to Halbert standard)
// ---------------------------------------------------------------------------
function buildFallbackPosts() {
  const hours = scheduledHours(POST_COUNT);
  const posts = [
    {
      type: 'story-hook',
      tweet1: 'He kept asking for one more minute. Then the room went quiet before she understood why.',
      replies: [
        'The flashlight was in his shaking hand, but he still would not move. He kept staring at the dark gap beside the dresser like it had a plan of its own.',
        'So she crawled over first, tapped the floor, and said, "Then we check it together." He laughed at the dust bunny like it had fooled them both.',
      ],
    },
    {
      type: 'puzzle',
      tweet1: 'Most kids find 6 fast. The 7th is the one that changes the whole page. Can yours spot it?',
      replies: [`Hint: the last one is hiding near the edge where most kids stop looking. ${PUZZLE_CLOSE}`],
    },
    {
      type: 'insight',
      tweet1: 'Kids hold focus longer when the win feels close enough to reach.',
      replies: ['Try giving the challenge before the explanation. Kids lean in faster when discovery gets to happen in their own hands.'],
    },
    {
      type: 'identity',
      tweet1: 'The parent they remember is usually the one who turned small moments into something that mattered.',
      replies: ['One day they will not remember the perfect schedule. They will remember how calm you sounded when they needed help most.'],
    },
  ];

  return posts.map((p, i) => ({ ...p, reply1: p.replies[0], scheduledHour: hours[i] }));
}

// ---------------------------------------------------------------------------
// Save scores for feedback loop
// ---------------------------------------------------------------------------
async function saveScores(date, scoredPosts) {
  await fs.mkdir(SCORES_DIR, { recursive: true });
  const output = {
    date,
    generated_at: new Date().toISOString(),
    posts: scoredPosts.map(p => ({
      type:         p.type,
      tweet1:       p.tweet1,
      score:        p._score,
      scheduledHour: p.scheduledHour,
    })),
    batch_avg: +(scoredPosts.reduce((s, p) => s + (p._score?.total ?? 0), 0) / scoredPosts.length).toFixed(2),
    all_passed: scoredPosts.every(p => p._score?.pass),
  };
  await fs.writeFile(path.join(SCORES_DIR, `x-text-scores-${date}.json`), JSON.stringify(output, null, 2));
  return output.batch_avg;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const date = formatDateUTC();
  const outputPath = path.join(OUTPUT_DIR, `x-text-${date}.json`);

  log('=== JoyMaze X Text Post Generator ===');
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Date: ${date}`);

  // ── Load all context in parallel ──
  const [writingStyle, trends, hooks, themePool, ctaLib, perfWeights, recentFingerprints] = await Promise.all([
    readTextIfExists(WRITING_STYLE_PATH),
    readJsonIfExists(TRENDS_PATH),
    readJsonIfExists(HOOKS_PATH),
    readJsonIfExists(THEME_POOL_PATH),
    readJsonIfExists(CTA_LIBRARY_PATH),
    readJsonIfExists(PERF_WEIGHTS_PATH),
    loadRecentFingerprints(),
  ]);

  // ── Build prompts ──
  const systemPrompt = buildSystemPrompt(writingStyle);
  const trendNotes   = buildTrendNotes(trends);
  const hookNotes    = buildHookNotes(hooks);
  const themeNotes   = buildThemeNotes(themePool);
  const ctaNotes     = buildCtaNotes(ctaLib);
  const perfNotes    = buildPerfNotes(perfWeights);

  const userPrompt = buildUserPrompt({
    trendNotes, hookNotes, themeNotes, ctaNotes, perfNotes,
    recentFingerprints, date,
  });

  verbose('System prompt length:', systemPrompt.length, 'chars');
  verbose('User prompt length:',   userPrompt.length,   'chars');

  // ── Generate ──
  let posts;

  if (!process.env.GROQ_API_KEY) {
    if (!DRY_RUN) throw new Error('GROQ_API_KEY is required');
    log('No GROQ_API_KEY — using fallback posts for dry run.');
    posts = buildFallbackPosts();
  } else {
    try {
      log('Calling Groq...');
      const raw = await generateWithGroq(systemPrompt, userPrompt);
      posts = normalizePosts(parseJsonArray(raw));
    } catch (err) {
      if (!DRY_RUN) throw err;
      log(`Groq unavailable in dry run — using fallback posts. (${err.message})`);
      posts = buildFallbackPosts();
    }
  }

  // ── Score initial batch ──
  let scoredPosts = scoreBatch(posts);

  // ── Print scores ──
  log('\n── Post scores ──');
  scoredPosts.forEach((p, i) => {
    const s = p._score;
    const tag = s.pass ? '✓' : '✗';
    log(`${tag} [${i + 1}] ${p.type} | total: ${s.total} | scroll:${s.scrollStop} rel:${s.relevancy} promo:${s.nonPromo} eng:${s.engagement} clr:${s.clarity}`);
    if (s.reasons.length) log(`    Issues: ${s.reasons.join(' | ')}`);
  });

  // ── Retry failing slots (one attempt) ──
  const failingSlots = scoredPosts
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => !p._score.pass);

  if (failingSlots.length > 0 && process.env.GROQ_API_KEY) {
    log(`\nRetrying ${failingSlots.length} failing slot(s)...`);

    const retryPrompt = buildRetryUserPrompt({
      failingSlots: failingSlots.map(p => ({
        index:   p.index,
        type:    p.type,
        tweet1:  p.tweet1,
        reasons: p._score.reasons,
      })),
      trendNotes, hookNotes, themeNotes, ctaNotes, date,
    });

    try {
      const retryRaw   = await generateWithGroq(systemPrompt, retryPrompt);
      const retryParsed = normalizePosts(parseJsonArray(retryRaw));

      // Splice retried posts back into the correct positions
      let retryIndex = 0;
      scoredPosts = scoredPosts.map((p, i) => {
        if (!p._score.pass && retryIndex < retryParsed.length) {
          const candidate = { ...retryParsed[retryIndex++], scheduledHour: p.scheduledHour };
          const newScore  = scorePost(candidate, 0);
          const improved  = newScore.total > p._score.total;
          log(`  Slot ${i + 1}: retry ${improved ? 'improved' : 'did not improve'} (${p._score.total} → ${newScore.total})`);
          return improved ? { ...candidate, _score: newScore } : p;
        }
        return p;
      });
    } catch (err) {
      log(`Retry failed: ${err.message} — keeping original posts.`);
    }
  }

  // ── Strip internal scores from saved posts ──
  const cleanPosts = scoredPosts.map(({ _score, ...rest }) => rest);

  if (DRY_RUN) {
    log('\n── Generated posts (dry run) ──');
    console.log(JSON.stringify(cleanPosts, null, 2));
    log('\n── Scores ──');
    console.log(JSON.stringify(scoredPosts.map(p => ({ type: p.type, tweet1: p.tweet1.slice(0, 60), score: p._score })), null, 2));
    return;
  }

  // ── Save posts + scores ──
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(cleanPosts, null, 2));
  log(`\nSaved ${cleanPosts.length} X text posts → ${outputPath}`);

  const batchAvg = await saveScores(date, scoredPosts);
  log(`Scores saved → output/scores/x-text-scores-${date}.json | batch avg: ${batchAvg}`);

  const allPassed = scoredPosts.every(p => p._score.pass);
  if (!allPassed) {
    const failed = scoredPosts.filter(p => !p._score.pass).map(p => p.type);
    log(`\nWarning: ${failed.length} post(s) still below threshold after retry: ${failed.join(', ')}`);
    log('Posts saved regardless — review output/scores/ for details.');
  } else {
    log('All posts passed quality threshold.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

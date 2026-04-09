#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output', 'queue');
const WRITING_STYLE_PATH = path.join(ROOT, 'config', 'writing-style.md');
const TRENDS_PATH = path.join(ROOT, 'config', 'trends-this-week.json');
const HOOKS_PATH = path.join(ROOT, 'config', 'hooks-library.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const POST_COUNT = 4;
const POST_TYPES = ['story-hook', 'puzzle', 'insight', 'identity'];
const PUZZLE_CLOSE = 'drop your answer below \uD83D\uDC47';
const TWEET_MAX = 280;

function formatDateLocal(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function scheduledHours(count) {
  if (count <= 1) return [7];
  const start = 7;
  const end = 21;
  const hours = [];

  for (let i = 0; i < count; i++) {
    const raw = Math.round(start + (i * (end - start)) / (count - 1));
    const minHour = i === 0 ? start : hours[i - 1] + 1;
    hours.push(Math.min(end, Math.max(minHour, raw)));
  }

  return hours;
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function buildTrendNotes(trends) {
  if (!trends) return '';

  const topThemes = (trends.boost_themes || [])
    .slice(0, 5)
    .join(', ');
  const risingSearches = (trends.rising_searches || [])
    .slice(0, 5)
    .join(', ');
  const keywords = (trends.caption_keywords || [])
    .slice(0, 6)
    .join(', ');

  return [
    topThemes ? `Top themes this week: ${topThemes}` : '',
    risingSearches ? `Rising searches: ${risingSearches}` : '',
    keywords ? `Useful phrases: ${keywords}` : '',
  ].filter(Boolean).join('\n');
}

function buildHookNotes(hooksData) {
  const hooks = (hooksData?.hooks || [])
    .filter(hook => hook.brand_safe === true && hook.text)
    .sort((a, b) => (b.performance_score ?? -1) - (a.performance_score ?? -1))
    .slice(0, 8)
    .map(hook => `[${hook.hook_type || 'hook'}] ${hook.text}`);

  return hooks.length > 0 ? hooks.join('\n') : '';
}

function buildSystemPrompt(writingStyle) {
  return writingStyle || 'You are a brand copywriter for JoyMaze, a kids activity app.';
}

function buildUserPrompt({ trendNotes, hookNotes, date }) {
  const slotLines = POST_TYPES.map((type, index) => {
    const hour = scheduledHours(POST_TYPES.length)[index];
    return `${index + 1}. ${type} at ${hour}:00`;
  }).join('\n');

  return `You are writing standalone X text posts for JoyMaze on ${date}.

Return ONLY valid JSON as an array of exactly ${POST_COUNT} objects.
Each object must follow this shape exactly:
{"type":"story-hook|puzzle|insight|identity","tweet1":"...","replies":["..."]}

Required slot plan:
${slotLines}

Rules for every post:
- Write for parents of kids ages 4-8
- No hashtags
- No links
- No corporate tone
- Make each post feel distinct in hook, rhythm, and angle
- Keep every individual tweet at 280 characters or less
- Use weekly trends only when they feel natural
- Do not mention scheduledHour in the output

Type rules:
- story-hook:
  - tweet1 must stop the scroll with a specific, vivid hook. Use one of: a sharp line of dialogue, an unexpected detail, a tiny high-stakes parenting moment, or a sensory contradiction.
  - Avoid generic parenting summary lines. Start inside the scene.
  - replies must be an array with 2 or 3 items.
  - reply 1 builds tension, struggle, or the emotional turn.
  - final reply delivers the resolution or payoff.
  - No CTA.
- puzzle: tweet1 is a riddle or challenge hook. replies must contain exactly 1 item. That reply gives an answer or hint and ends with "${PUZZLE_CLOSE}".
- insight: tweet1 shares one surprising parenting or kids education fact. replies must contain exactly 1 item. That reply gives a practical tip or ends with "which resonates with you?"
- identity: tweet1 speaks to the parent they want to be. replies must contain exactly 1 item. That reply adds a deeper story or ends with "save this for when you need it"

Weekly trend notes:
${trendNotes || 'None'}

Winning hook examples:
${hookNotes || 'None'}

Quality bar:
- Strong first line
- Specific language
- One idea per tweet
- No repetition across posts
- No weak filler words
- No emojis except where the puzzle reply ending requires it
- Story hooks must feel like scenes, not summaries
- If a story needs room, use more replies instead of flattening the scene
`;
}

async function generateWithGroq(systemPrompt, userPrompt) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.9,
      max_tokens: 1800,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

function parseJsonArray(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  const jsonText = start !== -1 && end !== -1 ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(jsonText);

  if (!Array.isArray(parsed)) {
    throw new Error('Model response was not a JSON array');
  }

  return parsed;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/#\S+/g, '')
    .trim();
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trim();
}

function extractReplies(source) {
  if (Array.isArray(source.replies)) {
    return source.replies;
  }

  const keyedReplies = Object.keys(source)
    .filter(key => /^reply\d+$/i.test(key))
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
    .map(key => source[key]);

  if (keyedReplies.length > 0) {
    return keyedReplies;
  }

  if (source.reply1) {
    return [source.reply1];
  }

  return [];
}

function ensurePuzzleClose(text) {
  const stripped = text.replace(/\s+/g, ' ').trim();
  const withoutExisting = stripped.replace(/drop your answer below(?:\s*\uD83D\uDC47)?[.!?]*$/i, '').trim();
  const joiner = withoutExisting ? `${withoutExisting} ` : '';
  return truncate(`${joiner}${PUZZLE_CLOSE}`, 280);
}

function normalizePosts(rawPosts) {
  const hours = scheduledHours(POST_COUNT);

  return POST_TYPES.map((type, index) => {
    const source = rawPosts[index] || {};
    const tweet1 = truncate(cleanText(source.tweet1), TWEET_MAX);
    let replies = extractReplies(source)
      .map(reply => truncate(cleanText(reply), TWEET_MAX))
      .filter(Boolean);

    if (type === 'puzzle') {
      replies = [ensurePuzzleClose(replies[0] || '')];
    } else if (type !== 'story-hook') {
      replies = [replies[0] || ''];
    } else if (replies.length === 0) {
      replies = [''];
    }

    return {
      type,
      tweet1,
      reply1: replies[0] || '',
      replies,
      scheduledHour: hours[index],
    };
  });
}

function buildFallbackPosts() {
  const hours = scheduledHours(POST_COUNT);
  const tweet1s = [
    'He kept asking for one more minute. Then the room went quiet before she understood why.',
    'Most kids find 6 fast. The 7th is the one that changes the whole page. Can yours spot it?',
    'Kids hold focus longer when the win feels close enough to reach.',
    'The parent they remember is usually the one who turned small moments into something that mattered.',
    'She was bracing for the meltdown when her daughter whispered, "Wait. I think I see it."',
    'One path looks right until the final turn. Which one would your kid trust first?',
    'A short challenge can build more confidence than a long lecture ever will.',
    'You do not need perfect afternoons. You need a few moments that tell your kid you noticed who they are becoming.',
  ];
  const replies = [
    [
      'The flashlight was in his shaking hand, but he still would not move. He kept staring at the dark gap beside the dresser like it had a plan of its own.',
      'So she crawled over first, tapped the floor, and said, "Then we check it together." He laughed at the dust bunny like it had fooled them both.',
    ],
    [`Hint: the last one is hiding near the edge where most kids stop looking. ${PUZZLE_CLOSE}`],
    ['Try giving the challenge before the explanation. Kids lean in faster when discovery gets to happen in their own hands.'],
    ['The deeper story is simple: kids borrow their belief from us first. They grow into what we reflect back.'],
    [
      'The page was already crumpled from the first try. Her voice had that thin edge that says tears are close, even when the words are still brave.',
      'Then she found one clean line through the mess and followed it all the way out. The smile after that was pure relief. Hers too.',
    ],
    [`Reveal: the safer-looking turn sends you backward. The odd corner is the one to trust. ${PUZZLE_CLOSE}`],
    ['One useful shift: make the task slightly easier than you planned, then let momentum do the rest. which resonates with you?'],
    ['One day they will not remember the perfect schedule. They will remember how calm you sounded when they needed help most. save this for when you need it'],
  ];

  return POST_TYPES.map((type, index) => ({
    type,
    tweet1: tweet1s[index],
    reply1: replies[index][0],
    replies: replies[index],
    scheduledHour: hours[index],
  }));
}

async function main() {
  const date = formatDateLocal();
  const outputPath = path.join(OUTPUT_DIR, `x-text-${date}.json`);

  console.log('=== JoyMaze X Text Post Generator ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Date: ${date}`);

  const writingStyle = await readTextIfExists(WRITING_STYLE_PATH);
  const trends = await readJsonIfExists(TRENDS_PATH);
  const hooks = await readJsonIfExists(HOOKS_PATH);
  const systemPrompt = buildSystemPrompt(writingStyle);
  const userPrompt = buildUserPrompt({
    trendNotes: buildTrendNotes(trends),
    hookNotes: buildHookNotes(hooks),
    date,
  });

  let posts;

  if (!process.env.GROQ_API_KEY) {
    if (!DRY_RUN) {
      throw new Error('GROQ_API_KEY is required');
    }
    console.log('No GROQ_API_KEY found. Using fallback sample posts for dry run.');
    posts = buildFallbackPosts();
  } else {
    try {
      const raw = await generateWithGroq(systemPrompt, userPrompt);
      posts = normalizePosts(parseJsonArray(raw));
    } catch (err) {
      if (!DRY_RUN) {
        throw err;
      }
      console.log(`Groq unavailable in dry run. Using fallback sample posts instead. (${err.message})`);
      posts = buildFallbackPosts();
    }
  }

  if (DRY_RUN) {
    console.log(JSON.stringify(posts, null, 2));
    return;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(posts, null, 2));
  console.log(`Saved ${posts.length} X text posts to ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

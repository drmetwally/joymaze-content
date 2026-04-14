#!/usr/bin/env node

/**
 * JoyMaze Content — Challenge Video Brief Generator
 *
 * Generates a brief for the ActivityChallenge video format:
 * "Can your kid solve this?" — puzzle shown with a counting timer.
 * Viral mechanic: parents tag each other, kids compete on time.
 *
 * Output:
 *   output/challenge/[type]-[slug]/
 *     activity.json   — props for render-video.mjs --comp ActivityChallenge
 *     brief.md        — Gemini image prompt + step-by-step instructions
 *
 * Usage:
 *   node scripts/generate-challenge-brief.mjs              # Preview only
 *   node scripts/generate-challenge-brief.mjs --save       # Create folder + files
 *   node scripts/generate-challenge-brief.mjs --type maze  # Force puzzle type
 *   node scripts/generate-challenge-brief.mjs --dry-run    # Show prompt, no API call
 *
 * Puzzle types: maze | word-search | dot-to-dot | coloring
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHALLENGE_DIR = path.join(ROOT, 'output', 'challenge');

const args = process.argv.slice(2);
const SAVE    = args.includes('--save');
const DRY_RUN = args.includes('--dry-run');
const typeIdx = args.indexOf('--type');
const FORCE_TYPE = typeIdx !== -1 ? args[typeIdx + 1] : null;

const TODAY = new Date().toISOString().slice(0, 10);

// Rotate through puzzle types by day — different from ASMR rotation
const PUZZLE_TYPES = ['maze', 'word-search', 'dot-to-dot', 'maze', 'word-search'];
function getDefaultType() {
  return PUZZLE_TYPES[new Date().getDate() % PUZZLE_TYPES.length];
}

const ACTIVITY_LABEL_MAP = {
  'maze':       'MAZE',
  'word-search': 'WORD SEARCH',
  'dot-to-dot': 'DOT TO DOT',
  'coloring':   'COLORING',
};

// Difficulty tiers → countdown seconds
// maze: medium (45s), word-search: easy (60s), dot-to-dot: easy (60s)
const COUNTDOWN_MAP = {
  'maze':        45,
  'word-search': 60,
  'dot-to-dot':  60,
  'coloring':    30,
};

// ── Context loading ───────────────────────────────────────────────────────────

async function loadContext() {
  let styleGuide = '';
  let recentThemes = [];

  try {
    styleGuide = await fs.readFile(path.join(ROOT, 'config', 'writing-style.md'), 'utf-8');
  } catch {}

  // Avoid recent challenge themes
  try {
    const entries = await fs.readdir(CHALLENGE_DIR);
    recentThemes = entries
      .sort()
      .slice(-10)
      .map(e => e.replace(/^(maze|word-search|dot-to-dot|coloring)-/, '').replace(/-/g, ' '));
  } catch {}

  let trends = null;
  try {
    trends = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8'));
  } catch {}

  let competitor = null;
  try {
    competitor = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'competitor-intelligence.json'), 'utf-8'));
  } catch {}

  let hooksData = null;
  try {
    hooksData = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'hooks-library.json'), 'utf-8'));
  } catch {}

  let dynamicThemes = null;
  try {
    dynamicThemes = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'theme-pool-dynamic.json'), 'utf-8'));
  } catch {}

  let perfWeights = null;
  try {
    perfWeights = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'performance-weights.json'), 'utf-8'));
  } catch {}

  return { styleGuide, recentThemes, trends, competitor, hooksData, dynamicThemes, perfWeights };
}

// ── Groq call ─────────────────────────────────────────────────────────────────

async function callGroq(prompt) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 700,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content.trim());
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(type, context) {
  const { styleGuide, recentThemes, trends, competitor, hooksData, dynamicThemes, perfWeights } = context;

  const activityLabel = ACTIVITY_LABEL_MAP[type] ?? type.toUpperCase();
  const countdownSec  = COUNTDOWN_MAP[type] ?? 60;

  const recentStr = recentThemes.length
    ? `\nRecently used themes — pick something different: ${recentThemes.join(', ')}`
    : '';

  const trendsStr = trends?.trending_themes?.length
    ? `\nTRENDING THIS WEEK — bias toward one of these if it fits:\n`
      + trends.trending_themes.slice(0, 5).map(t => `- ${t.theme} (score: ${t.score})`).join('\n')
      + (trends.upcoming_moments?.length
        ? `\nUpcoming: ${trends.upcoming_moments.filter(e => e.days_away >= 0 && e.days_away <= 21).map(e => `${e.event} in ${e.days_away} days`).join(', ')}`
        : '')
    : '';

  const activeThemesStr = dynamicThemes?.themes?.length
    ? '\nACTIVE THEMES THIS WEEK (prefer one if it fits naturally):\n'
      + (dynamicThemes.themes || [])
          .filter(t => t.status !== 'evicted' && t.brand_safe !== false)
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
          .slice(0, 5)
          .map(t => `- ${t.name}`)
          .join('\n')
    : '';

  // Challenge-format competitor hooks — "Can your kid...?" scroll-stopper formulas
  const competitorStr = competitor
    ? '\nCOMPETITOR SCROLL-STOPPER FORMULAS — adapt for the challenge hook:\n'
      + (competitor.scroll_stopper_formulas || []).slice(0, 3).map(s => `- ${s}`).join('\n')
    : '';

  // Top performing hooks from intelligence library
  const hookLibraryStr = hooksData?.hooks?.length
    ? '\nHOOK STYLE REFERENCE (adapt into challenge format — never copy verbatim):\n'
      + (hooksData.hooks || [])
          .filter(h => h.brand_safe !== false && h.text)
          .sort((a, b) => (b.performance_score ?? -1) - (a.performance_score ?? -1))
          .slice(0, 4)
          .map(h => `- "${h.text}"`)
          .join('\n')
    : '';

  // Puzzle type image description guide
  const imageGuide = {
    'maze':        'a clear, kid-friendly maze with Start and Finish labels, moderate difficulty (4-8 year olds can solve in ~45s), black lines on white background',
    'word-search': 'a word search grid (10×10 or 12×12) with 6-8 hidden words on a theme, clean black letters on white background, word list shown below the grid',
    'dot-to-dot':  'a numbered dot-to-dot puzzle (20-40 dots) that reveals a cute animal or character when connected, clean black dots with numbers on white background',
    'coloring':    'a simple coloring page with bold black outlines, a single scene (animal, vehicle, or character), no color — just line art',
  }[type] ?? 'a simple, clean puzzle on white background';

  return `${styleGuide}

---

You are creating a "Challenge" video brief for JoyMaze — a kids activity app for ages 4-8. Parents are the audience on social media.

The video format: a ${activityLabel} puzzle is shown with a counting timer running. Parents share it to challenge their kids and each other.
Video length: ${countdownSec + 5} seconds total (${countdownSec}s timer + 5s hook/CTA).
${trendsStr}${activeThemesStr}${competitorStr}${hookLibraryStr}${recentStr}

Today's puzzle type: **${type}** — ${activityLabel}

Generate a fresh, engaging challenge brief. Return a JSON object with exactly these fields:
{
  "theme": "short kid-friendly theme name, 2-3 words (e.g. 'Ocean Animals')",
  "slug": "kebab-case folder name (e.g. 'ocean-animals')",
  "imagePrompt": "Gemini image prompt for the puzzle (${imageGuide}). Must end with: 'Portrait orientation, 9:16 aspect ratio (1080x1920 pixels). White background.'",
  "hookText": "4-8 word challenge hook for the video opener screen — must create urgency or a direct challenge to the viewer, Halbert style, no emoji",
  "ctaText": "4-8 word CTA shown at the end of the video — drives comments or saves (e.g. 'Drop your time below!'), no emoji",
  "hookAlternatives": ["alternative hook 1", "alternative hook 2"]
}

CRITICAL RULES:
- hookText must be a DIRECT CHALLENGE to the parent/child (e.g. "Can your kid beat the clock?", "Race the clock! Can you solve it?")
- ctaText must invite engagement — time drops, tags, saves (e.g. "Tag someone to beat your time!", "Drop your best time below!")
- Theme must NOT repeat recently used themes
- Image must show ONLY the blank unsolved puzzle — no answers, no highlights
- Art style: whimsical, warm, appealing to kids 4-8 and their parents`;
}

// ── Output builders ───────────────────────────────────────────────────────────

function buildActivityJson(type, brief) {
  return {
    type:           'challenge',
    puzzleType:     type,
    theme:          brief.theme,
    hookText:       brief.hookText,
    hookAlternatives: brief.hookAlternatives,
    ctaText:        brief.ctaText,
    activityLabel:  ACTIVITY_LABEL_MAP[type] ?? type.toUpperCase(),
    countdownSec:   COUNTDOWN_MAP[type] ?? 60,
    hookDurationSec: 2.5,
    holdAfterSec:   2.5,
    imagePath:      'puzzle.png',
    showJoyo:       true,
  };
}

function buildBriefMd(type, brief) {
  const folderName = `${type}-${brief.slug}`;
  const countdownSec = COUNTDOWN_MAP[type] ?? 60;
  const totalSec = countdownSec + 5;

  return `# Challenge Brief: ${brief.theme}
Date: ${TODAY}
Type: ${ACTIVITY_LABEL_MAP[type] ?? type.toUpperCase()} Challenge (${totalSec}s total — ${countdownSec}s timer)
Hook: "${brief.hookText}"
Hook alternatives: ${brief.hookAlternatives.map(h => `"${h}"`).join(' | ')}
CTA: "${brief.ctaText}"

---

## Step 1 — Generate puzzle image in Gemini

### puzzle.png — blank unsolved ${type} puzzle
${brief.imagePrompt}

---

## Step 2 — Save the image to this folder
- \`puzzle.png\`

Must be 1080×1920 px (9:16 portrait). Puzzle must be BLANK — no solution, no highlights.

## Step 3 — Render the challenge video
\`\`\`
npm run animate:challenge -- --challenge output/challenge/${folderName}
\`\`\`

## Step 4 — Publish
\`\`\`
npm run publish
\`\`\`

---

**Caption angle:** Challenge hook — "Can your kid beat ${countdownSec} seconds?" + comment bait (time drops)
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const type = FORCE_TYPE || getDefaultType();

  console.log('\n  JoyMaze Challenge Brief Generator');
  console.log(`  Type: ${type} (${ACTIVITY_LABEL_MAP[type]}) | Date: ${TODAY}`);
  console.log('');

  console.log('  Loading context...');
  const context = await loadContext();
  if (context.recentThemes.length > 0) {
    console.log(`    Recent themes: ${context.recentThemes.slice(-5).join(', ')}`);
  }

  if (DRY_RUN) {
    console.log('\n--- SYSTEM PROMPT (dry run) ---');
    console.log(buildPrompt(type, context));
    console.log('--- END ---\n');
    return;
  }

  console.log('  Calling Groq (llama-3.3-70b-versatile)...');
  const brief = await callGroq(buildPrompt(type, context));
  const folderName = `${type}-${brief.slug}`;

  console.log('');
  console.log('  ================================================================================');
  console.log(`  Challenge Brief — ${brief.theme} (${ACTIVITY_LABEL_MAP[type]})`);
  console.log(`  Folder: output/challenge/${folderName}/`);
  console.log(`  Hook:   "${brief.hookText}"`);
  console.log(`  CTA:    "${brief.ctaText}"`);
  console.log('');
  console.log('  Image prompt:');
  console.log(`    ${brief.imagePrompt}`);
  console.log('  ================================================================================');
  console.log('');

  if (!SAVE) {
    console.log('  Run with --save to create the folder and brief files.');
    return;
  }

  const challengeDir = path.join(CHALLENGE_DIR, folderName);
  await fs.mkdir(challengeDir, { recursive: true });

  await fs.writeFile(
    path.join(challengeDir, 'activity.json'),
    JSON.stringify(buildActivityJson(type, brief), null, 2),
  );

  await fs.writeFile(
    path.join(challengeDir, 'brief.md'),
    buildBriefMd(type, brief),
  );

  console.log(`  Saved to: output/challenge/${folderName}/`);
  console.log(`    activity.json  — ready for npm run animate:challenge`);
  console.log(`    brief.md       — your Gemini image prompt`);
  console.log('');
  console.log(`  Next: open output/challenge/${folderName}/brief.md`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

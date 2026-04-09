#!/usr/bin/env node

/**
 * JoyMaze Content — Daily ASMR Brief Generator
 *
 * Picks today's ASMR type + theme using Groq + style guide + analytics,
 * generates image prompts for Gemini, and creates the ASMR folder ready
 * for you to drop images into.
 *
 * Output:
 *   output/asmr/[type]-[slug]/
 *     activity.json   — title, type, hookText, hookAlternatives
 *     brief.md        — your Gemini prompts + step-by-step instructions
 *
 * Usage:
 *   node scripts/generate-asmr-brief.mjs           # Preview only (no files)
 *   node scripts/generate-asmr-brief.mjs --save    # Create folder + save files
 *   node scripts/generate-asmr-brief.mjs --type coloring
 *   node scripts/generate-asmr-brief.mjs --type maze
 *   node scripts/generate-asmr-brief.mjs --dry-run # Show prompt, no API call
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASMR_DIR = path.join(ROOT, 'output', 'asmr');

const args = process.argv.slice(2);
const SAVE    = args.includes('--save');
const DRY_RUN = args.includes('--dry-run');
const typeIdx = args.indexOf('--type');
const FORCE_TYPE = typeIdx !== -1 ? args[typeIdx + 1] : null;

const TODAY = new Date().toISOString().slice(0, 10);

// Alternate coloring / maze by calendar day
function getDefaultType() {
  return new Date().getDate() % 2 === 0 ? 'coloring' : 'maze';
}

// ── Context loading ───────────────────────────────────────────────────────────

async function loadContext() {
  let styleGuide = '';
  let archetypes = '';
  let analyticsContext = '';
  let recentThemes = [];

  try {
    styleGuide = await fs.readFile(path.join(ROOT, 'config', 'writing-style.md'), 'utf-8');
  } catch {}

  try {
    archetypes = await fs.readFile(path.join(ROOT, 'docs', 'CONTENT_ARCHETYPES.md'), 'utf-8');
  } catch {}

  // Analytics: surface top-performing themes to guide selection
  try {
    const analyticsPath = path.join(ROOT, 'output', 'analytics', 'latest.json');
    const analytics = JSON.parse(await fs.readFile(analyticsPath, 'utf-8'));
    const top = (analytics.topPosts || []).slice(0, 5);
    if (top.length > 0) {
      analyticsContext = `Top performing recent posts (saves + clicks):\n`
        + top.map(p => `- ${p.title || p.id}: ${p.saves || 0} saves, ${p.clicks || 0} clicks`).join('\n');
    }
  } catch {}

  // Recent ASMR folders — avoid repeating themes
  try {
    const entries = await fs.readdir(ASMR_DIR);
    recentThemes = entries
      .sort()
      .slice(-10)
      .map(e => e.replace(/^(coloring|maze|tracing|drawing)-/, '').replace(/-/g, ' '));
  } catch {}

  // Trending themes from collect-trends.mjs
  let trends = null;
  try {
    trends = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8'));
  } catch {}

  return { styleGuide, archetypes, analyticsContext, recentThemes, trends };
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
    max_tokens: 900,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content.trim());
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(type, context) {
  const { styleGuide, archetypes, analyticsContext, recentThemes, trends } = context;

  const recentStr = recentThemes.length
    ? `\nRecently used themes — pick something different: ${recentThemes.join(', ')}`
    : '';

  const analyticsStr = analyticsContext
    ? `\nPerformance data to guide theme choice:\n${analyticsContext}`
    : '';

  const trendsStr = trends?.trending_themes?.length
    ? `\nTRENDING THIS WEEK — bias your theme toward one of these if it fits naturally:\n`
      + trends.trending_themes.slice(0, 5).map(t => `- ${t.theme} (score: ${t.score})`).join('\n')
      + (trends.upcoming_moments?.length
        ? `\nUpcoming: ${trends.upcoming_moments.filter(e => e.days_away >= 0 && e.days_away <= 21).map(e => `${e.event} in ${e.days_away} days`).join(', ')}`
        : '')
    : '';

  const blankDesc = type === 'coloring'
    ? 'UNCOLORED black line art only — a printable coloring page with zero color applied. Clean black outlines on white background. Every shape interior is white and empty.'
    : 'blank maze — clean black lines on white, no solution path shown, clear Start and Finish labels';

  const coloredDesc = type === 'coloring'
    ? 'same scene fully colored in vibrant, kid-friendly colors — identical composition and characters as blank version, now fully colored'
    : 'same maze with the correct solution path drawn in a single bright contrasting color — all other areas unchanged';

  return `${styleGuide}

---

${archetypes}

---

You are creating a daily ASMR video brief for JoyMaze — a kids activity app for ages 4-8. Parents are the audience on social media.

Today's ASMR type: **${type}**
The video reveals the activity progressively: ${type === 'coloring'
  ? 'blank coloring page slowly fills with color top-to-bottom'
  : 'maze path draws itself left-to-right'}
${analyticsStr}${trendsStr}${recentStr}

Generate a fresh, engaging theme for today's ASMR video.

Return a JSON object with exactly these fields:
{
  "theme": "short kid-friendly theme name, 2-3 words (e.g. 'Ocean Animals')",
  "slug": "kebab-case folder name (e.g. 'ocean-animals')",
  "blankPrompt": "Gemini image prompt for the BLANK image (${blankDesc}). Must end with: 'Portrait orientation, 9:16 aspect ratio (1080x1920 pixels). White background.'",
  "coloredPrompt": "Gemini image prompt for the FINISHED image (${coloredDesc}). Must end with: 'Portrait orientation, 9:16 aspect ratio (1080x1920 pixels).'",
  "hookText": "3-6 word hook for the video overlay text — curiosity-driven, Halbert style from the writing guide, no emoji",
  "hookAlternatives": ["alternative hook 1", "alternative hook 2", "alternative hook 3"]
}

CRITICAL RULES — read carefully:
- Theme must NOT be in the recently used list
- Both image prompts must describe the SAME scene (same characters, same composition, same art style)
- BLANK IMAGE (${type === 'coloring' ? 'coloring' : 'maze'}): ${type === 'coloring'
    ? 'ZERO color. No fills. No shading. No "soft colors", no "pastel tones", no "lightly colored". If ANY color word appears in blankPrompt other than "black" and "white", it is WRONG. The blankPrompt describes a printable coloring sheet — black outlines, white interior, nothing else.'
    : 'NO solution path. No highlighted route. No colored lines. Only the blank maze structure.'}
- Hook: 3-6 words, builds curiosity or wonder, no hashtags, no emoji
- Art style: whimsical, warm, appealing to kids 4-8 and their parents`;
}

// ── Output builders ───────────────────────────────────────────────────────────

function buildActivityJson(type, brief) {
  return {
    title: brief.theme,
    type,
    revealType: type,
    hookText: brief.hookText,
    hookAlternatives: brief.hookAlternatives,
    theme: type === 'coloring'
      ? 'Watch the colors fill in, stroke by stroke'
      : 'Watch the maze path reveal itself',
    music: null,
  };
}

function buildBriefMd(type, brief) {
  const folderName = `${type}-${brief.slug}`;
  const file1 = type === 'coloring' ? 'blank.png'  : 'maze.png';
  const file2 = type === 'coloring' ? 'colored.png' : 'solved.png';
  const desc1 = type === 'coloring' ? 'blank coloring page (line art, no color)' : 'blank maze (no solution shown)';
  const desc2 = type === 'coloring' ? 'fully colored version' : 'solved version with path highlighted';

  return `# ASMR Brief: ${brief.theme}
Date: ${TODAY}
Type: ${type === 'coloring' ? 'Coloring reveal (top-to-bottom color sweep)' : 'Maze reveal (left-to-right path draw)'}
Hook: "${brief.hookText}"
Hook alternatives: ${brief.hookAlternatives.map(h => `"${h}"`).join(' | ')}

---

## Step 1 — Generate these 2 images in Gemini

### ${file1} — ${desc1}
${brief.blankPrompt}

---

### ${file2} — ${desc2}
${brief.coloredPrompt}

---

## Step 2 — Save both images to this folder
- \`${file1}\`
- \`${file2}\`

Both must be 1080×1920 px (9:16 portrait).

## Step 3 — Generate the video
\`\`\`
npm run generate:asmr -- --asmr ${folderName}
\`\`\`

## Step 4 — Publish
\`\`\`
npm run publish
\`\`\`
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const type = FORCE_TYPE || getDefaultType();

  console.log('\n  JoyMaze ASMR Brief Generator');
  console.log(`  Type: ${type} | Date: ${TODAY}`);
  console.log('');

  console.log('  Loading context (style guide + archetypes + analytics)...');
  const context = await loadContext();
  if (context.recentThemes.length > 0) {
    console.log(`    Recent themes: ${context.recentThemes.slice(-5).join(', ')}`);
  }
  if (context.analyticsContext) {
    console.log('    Analytics context loaded.');
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
  console.log(`  ASMR Brief — ${brief.theme} (${type})`);
  console.log(`  Folder: output/asmr/${folderName}/`);
  console.log(`  Hook:   "${brief.hookText}"`);
  console.log('');
  console.log('  Image 1 prompt (blank):');
  console.log(`    ${brief.blankPrompt}`);
  console.log('');
  console.log('  Image 2 prompt (finished):');
  console.log(`    ${brief.coloredPrompt}`);
  console.log('  ================================================================================');
  console.log('');

  if (!SAVE) {
    console.log('  Run with --save to create the folder and brief files.');
    return;
  }

  const asmrDir = path.join(ASMR_DIR, folderName);
  await fs.mkdir(asmrDir, { recursive: true });

  await fs.writeFile(
    path.join(asmrDir, 'activity.json'),
    JSON.stringify(buildActivityJson(type, brief), null, 2),
  );

  await fs.writeFile(
    path.join(asmrDir, 'brief.md'),
    buildBriefMd(type, brief),
  );

  console.log(`  Saved to: output/asmr/${folderName}/`);
  console.log(`    activity.json  — ready for npm run generate:asmr`);
  console.log(`    brief.md       — your Gemini image prompts`);
  console.log('');
  console.log(`  Next: open output/asmr/${folderName}/brief.md`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

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

// Rotate coloring / maze / wordsearch / dotdot by calendar day
function getDefaultType() {
  const types = ['coloring', 'maze', 'coloring', 'wordsearch', 'dotdot', 'maze'];
  return types[new Date().getDate() % types.length];
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

  return { styleGuide, archetypes, analyticsContext, recentThemes, trends, competitor, hooksData, dynamicThemes, perfWeights };
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
  const { styleGuide, archetypes, analyticsContext, recentThemes, trends, competitor, hooksData, dynamicThemes, perfWeights } = context;

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

  // Active intelligence themes — preferred theme pool for this week
  const activeThemesStr = dynamicThemes?.themes?.length
    ? '\nACTIVE THEMES THIS WEEK (prefer one if it fits the activity type naturally):\n'
      + (dynamicThemes.themes || [])
          .filter(t => t.status !== 'evicted' && t.brand_safe !== false)
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
          .slice(0, 5)
          .map(t => `- ${t.name}`)
          .join('\n')
    : '';

  // Competitor intelligence: winning hook patterns for hookText generation
  const competitorStr = competitor
    ? '\nCOMPETITOR HOOK PATTERNS — use to inform hookText and hookAlternatives style:\n'
      + (competitor.winning_hooks || []).slice(0, 4).map(h => `- "${h}"`).join('\n')
      + '\nScroll-stopper formulas:\n'
      + (competitor.scroll_stopper_formulas || []).slice(0, 3).map(s => `- ${s}`).join('\n')
    : '';

  // Top performing hooks from intelligence library — direct hookText inspiration
  const hookLibraryStr = hooksData?.hooks?.length
    ? '\nINTELLIGENCE HOOK LIBRARY — use as style/rhythm reference when writing hookText (adapt to 3-6 words, never copy verbatim):\n'
      + (hooksData.hooks || [])
          .filter(h => h.brand_safe !== false && h.text)
          .sort((a, b) => (b.performance_score ?? -1) - (a.performance_score ?? -1))
          .slice(0, 6)
          .map(h => `- [${h.hook_type || 'hook'}] "${h.text}"`)
          .join('\n')
    : '';

  // Performance weights: which activity types are resonating most
  const perfStr = perfWeights?.weights
    ? (() => {
        const w = perfWeights.weights;
        const top = Object.entries(w)
          .filter(([, v]) => typeof v === 'object' && v.weight > 1.0)
          .sort(([, a], [, b]) => (b.weight ?? 0) - (a.weight ?? 0))
          .slice(0, 2)
          .map(([k]) => k);
        return top.length ? `\nHigh-resonance activity types this week (prefer if choosing between options): ${top.join(', ')}` : '';
      })()
    : '';

  const blankDesc = type === 'coloring'
    ? 'UNCOLORED black line art only — a printable coloring page with zero color applied. Clean black outlines on white background. Every shape interior is white and empty.'
    : type === 'wordsearch'
      ? 'blank word search grid — 10×10 or 12×12 grid of random letters on white, with 6-8 hidden words on the theme. Clean black letters, no highlights, word list shown below the grid.'
      : type === 'dotdot'
        ? 'dot-to-dot puzzle — 30-50 small numbered dots on white background that outline the subject when connected. Dots are clearly visible small filled circles with numbers beside them. NO connecting lines drawn. The subject shape is suggested by dot placement only.'
        : 'blank maze — clean black lines on white, no solution path shown, clear Start and Finish labels';

  const coloredDesc = type === 'coloring'
    ? 'same scene fully colored in vibrant, kid-friendly colors — identical composition and characters as blank version, now fully colored'
    : type === 'wordsearch'
      ? 'same word search grid with each hidden word highlighted in a bright, distinct color (yellow, orange, or green marker stroke over each word) — identical layout, only the word highlights added'
      : type === 'dotdot'
        ? 'same subject as clean connected line art — all dots joined to form the complete outline of the subject. The connecting lines are drawn between dots in order. Same composition as the blank version, now fully connected.'
        : 'same maze with the correct solution path drawn in a single bright contrasting color — all other areas unchanged';

  return `${styleGuide}

---

${archetypes}

---

You are creating a daily ASMR video brief for JoyMaze — a kids activity app for ages 4-8. Parents are the audience on social media.

Today's ASMR type: **${type}**
The video reveals the activity progressively: ${type === 'coloring'
  ? 'blank coloring page slowly fills with color top-to-bottom'
  : type === 'dotdot'
    ? 'connecting lines draw between numbered dots in sequence, building the complete image dot-by-dot'
    : 'maze path draws itself left-to-right'}
${analyticsStr}${trendsStr}${activeThemesStr}${perfStr}${competitorStr}${hookLibraryStr}${recentStr}

Generate a fresh, engaging theme for today's ASMR video.

Return a JSON object with exactly these fields:
{
  "theme": "short kid-friendly theme name, 2-3 words (e.g. 'Ocean Animals')",
  "slug": "kebab-case folder name (e.g. 'ocean-animals')",
  "blankPrompt": "Gemini image prompt for the BLANK image (${blankDesc}). Must end with: 'Portrait orientation, 9:16 aspect ratio (1080x1920 pixels). White background.'",
  "coloredPrompt": "Gemini image prompt for the FINISHED image (${coloredDesc}). Must end with: 'Portrait orientation, 9:16 aspect ratio (1080x1920 pixels).${type !== 'coloring' ? ' White background.' : ''}'",
  "hookText": "3-6 word hook for the video overlay text — curiosity-driven, Halbert style from the writing guide, no emoji",
  "hookAlternatives": ["alternative hook 1", "alternative hook 2", "alternative hook 3"]
}

CRITICAL RULES — read carefully:
- Theme must NOT be in the recently used list
- Both image prompts must describe the SAME scene (same characters, same composition, same art style)
- BLANK IMAGE (${type}): ${type === 'coloring'
    ? 'ZERO color. No fills. No shading. No "soft colors", no "pastel tones", no "lightly colored". If ANY color word appears in blankPrompt other than "black" and "white", it is WRONG. The blankPrompt describes a printable coloring sheet — black outlines, white interior, nothing else.'
    : type === 'wordsearch'
      ? 'NO word highlights. No colored letters. No marker strokes. Only the plain grid of letters on white, identical to a printable word search puzzle before any answers are found.'
      : type === 'dotdot'
        ? 'ONLY numbered dots — no connecting lines whatsoever. If any line connecting dots appears in blankPrompt, it is WRONG. Small numbered dots on white background only. NOTE: If using pre-purchased assets instead of AI generation, copy your existing blank/solved pair as blank.png / solved.png and skip Gemini generation.'
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
      : type === 'dotdot'
        ? 'Watch the dots connect one by one'
        : type === 'wordsearch'
          ? 'Watch the hidden words reveal themselves'
          : 'Watch the maze path reveal itself',
    music: null,
  };
}

function buildBriefMd(type, brief) {
  const folderName = `${type}-${brief.slug}`;
  const file1 = 'blank.png';
  const file2 = 'solved.png';
  const desc1 = type === 'coloring'
    ? 'blank coloring page (line art, no color)'
    : type === 'dotdot'
      ? 'dot-to-dot puzzle (numbered dots, no connecting lines)'
      : type === 'wordsearch'
        ? 'blank word search grid (no highlights)'
        : 'blank maze (no solution shown)';
  const desc2 = type === 'coloring'
    ? 'fully colored version'
    : type === 'dotdot'
      ? 'solved — dots fully connected as clean line art'
      : type === 'wordsearch'
        ? 'solved — words highlighted'
        : 'solved — path highlighted';

  const typeLabel = type === 'coloring'
    ? 'Coloring reveal (top-to-bottom color sweep)'
    : type === 'dotdot'
      ? 'Dot-to-dot reveal (connecting lines draw in sequence)'
      : type === 'wordsearch'
        ? 'Word search reveal (word highlights expand)'
        : 'Maze reveal (solution path draws left-to-right)';

  return `# ASMR Brief: ${brief.theme}
Date: ${TODAY}
Type: ${typeLabel}
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

${type === 'maze'
  ? `## Step 3 — Extract maze solution path\n\`\`\`\nnpm run extract:path -- --asmr ${folderName}\n\`\`\`\n\n## Step 4 — Generate the video`
  : type === 'wordsearch'
    ? `## Step 3 — Extract word highlight rects\n\`\`\`\nnpm run extract:wordsearch -- --asmr ${folderName}\n\`\`\`\n\n## Step 4 — Generate the video`
    : type === 'dotdot'
      ? `## Step 3 — Extract dot positions + drawing order\n\`\`\`\nnpm run extract:dotdot -- --asmr ${folderName}\n\`\`\`\nNote: For pre-purchased assets, copy your blank/solved pair as blank.png / solved.png before running.\n\n## Step 4 — Generate the video`
      : `## Step 3 — Generate the video`}
\`\`\`
npm run animate:asmr -- --asmr ${folderName}
\`\`\`

## ${type === 'coloring' ? 'Step 3' : 'Step 5'} — Publish
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

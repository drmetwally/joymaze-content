#!/usr/bin/env node

/**
 * JoyMaze Content — Intelligence Refresh (THE BRAIN)
 *
 * Runs every Monday in the daily pipeline. Gathers all available signals
 * (analytics, trends, competitor web searches, recent content), synthesizes
 * them via Gemini, validates brand safety via Groq, and writes
 * config/content-intelligence.json for apply-intelligence.mjs to consume.
 *
 * Usage:
 *   node scripts/intelligence-refresh.mjs              # Full run
 *   node scripts/intelligence-refresh.mjs --dry-run    # Preview without writing
 *   node scripts/intelligence-refresh.mjs --skip-competitor  # Skip web searches (faster)
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DRY_RUN          = process.argv.includes('--dry-run');
const SKIP_COMPETITOR  = process.argv.includes('--skip-competitor');

const INTELLIGENCE_FILE   = path.join(ROOT, 'config', 'content-intelligence.json');
const TRENDS_FILE         = path.join(ROOT, 'config', 'trends-this-week.json');
const PERF_WEIGHTS_FILE   = path.join(ROOT, 'config', 'performance-weights.json');
const ANALYTICS_FILE      = path.join(ROOT, 'output', 'analytics.jsonl');
const ARCHIVE_DIR         = path.join(ROOT, 'output', 'archive');
const QUEUE_DIR           = path.join(ROOT, 'output', 'queue');
const PROMPTS_DIR         = path.join(ROOT, 'output', 'prompts');
const ARCHIVE_PROMPTS_DIR = path.join(ROOT, 'output', 'archive', 'prompts');
const COMP_INTEL_FILE     = path.join(ROOT, 'docs', 'COMPETITIVE_INTELLIGENCE.md');
const STYLE_GUIDE_FILE    = path.join(ROOT, 'config', 'writing-style.md');
const ARCHETYPES_FILE     = path.join(ROOT, 'docs', 'CONTENT_ARCHETYPES.md');

// Known competitor accounts for targeted search queries
const COMPETITOR_SITES = [
  'busytoddler.com',
  'kidsactivitiesblog.com',
  'fantasticfunandlearning.com',
  'thedadlab.com',
];

// Brand safety keyword blocklist (rule-based pass 1)
const BRAND_BLOCKLIST = [
  // Physical craft materials
  'glue', 'glitter', 'scissors', 'paint brush', 'paintbrush', 'craft supplies',
  'clay', 'play-doh', 'playdoh', 'pipe cleaner', 'popsicle stick', 'yarn', 'felt',
  // Competitors
  ...COMPETITOR_SITES,
  'busytoddler', 'kidsactivitiesblog', 'thedadlab',
  // Religion-specific (beyond generic "holiday")
  'jesus', 'god', 'allah', 'bible', 'quran', 'torah', 'church', 'mosque', 'synagogue',
  'baptism', 'communion', 'bar mitzvah',
  // Political / divisive
  'democrat', 'republican', 'trump', 'biden', 'vote', 'election', 'liberal', 'conservative',
  // Adult / inappropriate
  'violence', 'weapon', 'gun', 'knife', 'alcohol', 'beer', 'wine', 'drug',
  'sexy', 'dating', 'romance',
  // Fear directed at children
  'scary', 'terrifying', 'nightmare', 'monster attack', 'danger', 'threat',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadJson(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf-8')); } catch { return null; }
}

async function loadText(filePath) {
  try { return await fs.readFile(filePath, 'utf-8'); } catch { return ''; }
}

function log(msg) { console.log(msg); }

// Normalize for comparison
const normalize = s => s.toLowerCase().replace(/[/\\]/g, ' ').replace(/\s+/g, ' ').trim();

// ── Groq client (fast, cheap — used for brand safety + entropy checks) ───────
function groqClient() {
  if (!process.env.GROQ_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
}

// ── Gemini REST call ─────────────────────────────────────────────────────────
async function callGemini(systemInstruction, userPrompt, useSearch = false, temperature = 0.4) {
  const apiKey = process.env.VERTEX_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('VERTEX_API_KEY not set');

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      ...(useSearch ? {} : { responseMimeType: 'application/json' }),
    },
  };

  if (useSearch) {
    body.tools = [{ google_search: {} }];
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  return text;
}

// ── Step 1: Build input context ──────────────────────────────────────────────

async function buildInputContext() {
  log('  Loading analytics digest...');
  const analyticsDigest = await buildAnalyticsDigest();

  log('  Loading trends data...');
  const trendsData = await loadJson(TRENDS_FILE);

  log('  Loading performance weights...');
  const performanceWeights = await loadJson(PERF_WEIGHTS_FILE);

  log('  Loading recent prompts (last 14 days)...');
  const recentTopics = await loadRecentTopics(14);

  log('  Loading current dynamic pools (for dedup)...');
  const currentDynamicPools = await loadCurrentDynamicPools();

  log('  Loading static competitive intelligence...');
  const staticCompetitorContext = await loadText(COMP_INTEL_FILE);

  return {
    analyticsDigest,
    trendsData,
    performanceWeights,
    recentTopics,
    currentDynamicPools,
    staticCompetitorContext,
  };
}

async function buildAnalyticsDigest() {
  const digest = {
    totalPostsTracked: 0,
    postsWithAnalytics: 0,
    topPerformers: [],
    topHookPatterns: [],
    saveRateByCategory: {},
    averageSaveRate: 0,
  };

  // Scan queue + recent archive for metadata with analytics
  const items = [];
  const cutoff = Date.now() - 30 * 86400000; // last 30 days

  async function scanDir(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const fp = path.join(dir, e.name);
        if (e.isDirectory()) await scanDir(fp);
        else if (e.name.endsWith('.json')) {
          try {
            const stat = await fs.stat(fp);
            if (stat.mtimeMs < cutoff) return;
            const meta = JSON.parse(await fs.readFile(fp, 'utf-8'));
            if (meta.id && meta.category) items.push(meta);
          } catch {}
        }
      }
    } catch {}
  }

  await scanDir(QUEUE_DIR);
  await scanDir(ARCHIVE_DIR);

  digest.totalPostsTracked = items.length;

  const withAnalytics = items.filter(i => i.analytics?.pinterest?.lifetime?.impressions > 100);
  digest.postsWithAnalytics = withAnalytics.length;

  if (withAnalytics.length === 0) return digest;

  // Compute save rates per category
  const byCat = {};
  for (const item of withAnalytics) {
    const cat = item.category || 'unknown';
    const saves = item.analytics.pinterest.lifetime.saves || 0;
    const impressions = item.analytics.pinterest.lifetime.impressions || 1;
    if (!byCat[cat]) byCat[cat] = { saves: 0, impressions: 0, count: 0 };
    byCat[cat].saves += saves;
    byCat[cat].impressions += impressions;
    byCat[cat].count++;
  }

  let totalSaves = 0, totalImpressions = 0;
  for (const [cat, data] of Object.entries(byCat)) {
    const rate = data.saves / data.impressions;
    digest.saveRateByCategory[cat] = {
      saveRate: (rate * 100).toFixed(2) + '%',
      posts: data.count,
    };
    totalSaves += data.saves;
    totalImpressions += data.impressions;
  }
  digest.averageSaveRate = ((totalSaves / totalImpressions) * 100).toFixed(2) + '%';

  // Top 5 performers
  const scored = withAnalytics
    .map(i => ({
      id: i.id,
      category: i.category,
      theme: i.theme || i.promptTheme || '',
      saveRate: (i.analytics.pinterest.lifetime.saves / i.analytics.pinterest.lifetime.impressions * 100).toFixed(2),
      firstLineHook: (i.captions?.pinterest || i.captions?.instagram || '').split('\n')[0].split('|')[0].trim().slice(0, 100),
    }))
    .sort((a, b) => parseFloat(b.saveRate) - parseFloat(a.saveRate))
    .slice(0, 5);

  digest.topPerformers = scored;
  digest.topHookPatterns = scored.filter(i => i.firstLineHook).map(i => `"${i.firstLineHook}" (${i.saveRate}% save rate)`);

  return digest;
}

async function loadRecentTopics(daysBack) {
  const topics = { themes: new Set(), scenes: new Set(), hookPatterns: new Set() };

  for (let d = 0; d < daysBack; d++) {
    const date = new Date(Date.now() - d * 86400000);
    const dateStr = date.toISOString().slice(0, 10);
    const filename = `prompts-${dateStr}.md`;

    let content = null;
    for (const dir of [PROMPTS_DIR, ARCHIVE_PROMPTS_DIR]) {
      try { content = await fs.readFile(path.join(dir, filename), 'utf-8'); break; } catch {}
    }
    if (!content) continue;

    for (const m of content.matchAll(/\*\*Theme:\*\*\s*(.+)/gi)) topics.themes.add(m[1].trim());
    for (const m of content.matchAll(/\*\*Activity shown:\*\*\s*(.+)/gi)) topics.scenes.add(m[1].trim().slice(0, 60));
    for (const m of content.matchAll(/\*\*Caption hook idea:\*\*\s*"?([^"|]+)/gi)) topics.hookPatterns.add(m[1].trim().slice(0, 80));
  }

  return {
    themes: [...topics.themes],
    scenes: [...topics.scenes].slice(0, 20),
    hookPatterns: [...topics.hookPatterns].slice(0, 15),
  };
}

async function loadCurrentDynamicPools() {
  const CONFIG = path.join(ROOT, 'config');
  const result = { themes: [], hookTexts: [], ctaTexts: [], interruptTopics: [] };

  try {
    const d = await loadJson(path.join(CONFIG, 'theme-pool-dynamic.json'));
    result.themes = (d?.themes || []).map(t => t.name);
  } catch {}

  try {
    const d = await loadJson(path.join(CONFIG, 'hooks-library.json'));
    result.hookTexts = (d?.hooks || []).map(h => h.text);
  } catch {}

  try {
    const d = await loadJson(path.join(CONFIG, 'cta-library.json'));
    for (const platform of Object.values(d?.ctas || {})) {
      for (const pool of Object.values(platform)) {
        result.ctaTexts.push(...pool.map(c => c.text));
      }
    }
  } catch {}

  try {
    const d = await loadJson(path.join(CONFIG, 'pattern-interrupt-dynamic.json'));
    result.interruptTopics = (d?.interrupts || []).map(i => i.topic);
  } catch {}

  return result;
}

// ── Step 2: Competitor web searches ──────────────────────────────────────────

async function runCompetitorSearches(trendsData) {
  if (SKIP_COMPETITOR) {
    log('  Skipping competitor searches (--skip-competitor flag)');
    return null;
  }

  const apiKey = process.env.VERTEX_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    log('  Skipping competitor searches (no VERTEX_API_KEY)');
    return null;
  }

  const month = new Date().toLocaleDateString('en-US', { month: 'long' });
  const year  = new Date().getFullYear();
  const season = ['January','February','March'].includes(month) ? 'winter'
               : ['April','May','June'].includes(month) ? 'spring'
               : ['July','August','September'].includes(month) ? 'summer' : 'fall';

  const topTrend = trendsData?.boost_themes?.[0] || 'kids printable activities';
  const upcomingEvent = trendsData?.upcoming_moments
    ?.filter(e => e.days_away >= 0 && e.days_away <= 21)?.[0]?.event || '';

  const queries = [
    `kids printable activities ${month} ${year} site:pinterest.com`,
    `${COMPETITOR_SITES.slice(0, 2).join(' OR site:')} kids ${topTrend} printable ${year}`,
    `"screen-free activities for kids" ${year} ${season} new ideas`,
    `kids printable maze OR coloring OR "word search" viral ${month} ${year}`,
    upcomingEvent ? `best kids printable activities "${upcomingEvent}" ${year}` : `kids printable ${season} ${year} trending`,
    `"fine motor skills" OR "spatial reasoning" kids printable site:${COMPETITOR_SITES[0]} OR site:${COMPETITOR_SITES[1]}`,
  ];

  log(`  Running ${queries.length} competitor web searches via Gemini...`);

  const systemInstruction = `You are a competitive content analyst for JoyMaze, a kids activity app (printable mazes, coloring, word searches for ages 4-8). Analyze the search results and extract actionable intelligence.`;

  const userPrompt = `Search the web for these queries and synthesize what you find about trending kids activity content:

${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

From all results combined, extract:
1. Visual/content trends you observe (what's performing well — specific styles, formats, subjects)
2. Hook and caption patterns appearing repeatedly in top content
3. Content gaps — topics competitors haven't covered or are doing poorly
4. Specific new theme ideas NOT already in this list: ${trendsData?.boost_themes?.join(', ') || 'none'}
5. CTA patterns appearing in high-engagement posts

Be specific. Quote actual patterns observed, not generic advice. If you can't find evidence for something, say so.

Return as plain text in sections. Be concise — 3-5 bullet points per section.`;

  try {
    const raw = await callGemini(systemInstruction, userPrompt, true, 0.3);
    log(`  Competitor search complete (${raw.length} chars)`);
    return raw;
  } catch (err) {
    log(`  Competitor search failed: ${err.message} — using static baseline only`);
    return null;
  }
}

// ── Step 3: Synthesize intelligence via Gemini ────────────────────────────────

async function synthesizeIntelligence(inputContext, competitorResults) {
  const { analyticsDigest, trendsData, performanceWeights, recentTopics, currentDynamicPools, staticCompetitorContext } = inputContext;

  // Load brand context excerpts (not the full files — too large)
  const styleGuide = await loadText(STYLE_GUIDE_FILE);
  const archetypes = await loadText(ARCHETYPES_FILE);

  // Extract only critical sections
  const voiceRules = extractSection(styleGuide, ['THE HYPNOTIC VOICE', 'WHO YOU ARE WRITING FOR', 'THE 4 HYPNOTIC PILLARS', 'WHAT NOT TO WRITE']);
  const archetypeKeys = extractSection(archetypes, ['CONTENT ARCHETYPES OVERVIEW', 'DAILY MIX', 'ARCHETYPE CHEAT SHEET']);

  const systemInstruction = `You are JoyMaze's weekly content intelligence analyst.

JoyMaze creates social media content (images + captions) for a kids activity app. The audience is parents of children ages 4-8. Content includes: mazes, coloring pages, word searches, dot-to-dot, sudoku, tracing, pattern interrupts (myth-bust, did-you-know, surprising stats).

## BRAND VOICE (non-negotiable)
${voiceRules.slice(0, 2000)}

## CONTENT STRATEGY OVERVIEW
${archetypeKeys.slice(0, 1000)}

## BRAND CONSTRAINTS — verify EVERY suggestion against this checklist:
[ ] Fits parents of 4-8 year olds (not teens, not adults only)
[ ] No real craft materials required (digital/printable only — no glue, scissors, paint)
[ ] Emotionally resonant, not purely informational
[ ] "Screen-free / printable" positioning is possible
[ ] Not controversial, political, or divisive
[ ] No competitor brand names mentioned
[ ] Not fear-based or negative toward children`;

  const userPrompt = `Generate this week's content intelligence for JoyMaze.

## ANALYTICS THIS WEEK
Posts tracked: ${analyticsDigest.totalPostsTracked} | With analytics: ${analyticsDigest.postsWithAnalytics}
Average save rate: ${analyticsDigest.averageSaveRate}

Save rates by category:
${Object.entries(analyticsDigest.saveRateByCategory).map(([cat, d]) => `- ${cat}: ${d.saveRate} (${d.posts} posts)`).join('\n') || '- No data yet'}

Top performing hooks:
${analyticsDigest.topHookPatterns.length ? analyticsDigest.topHookPatterns.join('\n') : '- No data yet'}

Top performers:
${analyticsDigest.topPerformers.map(p => `- ${p.theme || p.category}: ${p.saveRate}% save rate`).join('\n') || '- No data yet'}

## TREND SIGNALS THIS WEEK
Trending themes: ${trendsData?.boost_themes?.join(', ') || 'none'}
Rising searches: ${trendsData?.rising_searches?.slice(0, 8).join(' | ') || 'none'}
Upcoming moments (next 21 days): ${(trendsData?.upcoming_moments || []).filter(e => e.days_away >= 0 && e.days_away <= 21).map(e => `${e.event} in ${e.days_away} days`).join(', ') || 'none'}

## COMPETITOR INTELLIGENCE
${competitorResults || staticCompetitorContext?.slice(0, 1500) || 'No competitor data available'}

## TOPICS COVERED IN LAST 14 DAYS (do NOT repeat these)
Themes used: ${recentTopics.themes.join(', ') || 'none'}
Recent hook patterns: ${recentTopics.hookPatterns.slice(0, 8).join(' | ') || 'none'}

## ALREADY IN DYNAMIC POOLS (do NOT duplicate)
Dynamic themes: ${currentDynamicPools.themes.join(', ') || 'none'}
Dynamic hooks (first 5): ${currentDynamicPools.hookTexts.slice(0, 5).join(' | ') || 'none'}
Dynamic interrupts: ${currentDynamicPools.interruptTopics.slice(0, 5).join(' | ') || 'none'}

## OUTPUT SCHEMA
Return ONLY valid JSON matching this exact structure — no markdown fences, no extra text:

{
  "new_themes": [
    {
      "name": "Theme Name Here",
      "confidence": 0.85,
      "brand_safe": true,
      "source": "trend_analysis|competitor_analysis|performance_analysis",
      "rationale": "One sentence explaining why this theme is timely or has a gap"
    }
  ],
  "new_hooks": [
    {
      "hook_type": "pattern_interrupt|curiosity_gap|emotional_mirror|identity_hook|transformation_hint|relief_hook|sensory_hook|secret_insider",
      "text": "The hook text here — one punchy sentence",
      "brand_safe": true,
      "source": "competitor_analysis|performance_analysis|trend_analysis",
      "archetype_fit": ["arch1", "arch3"],
      "rationale": "Why this hook type is needed (gap analysis)"
    }
  ],
  "new_ctas": [
    {
      "platform": "pinterest|instagram|tiktok|x|youtube",
      "type": "app|both|books|seasonal|viral|engagement|subscribe",
      "text": "CTA text here",
      "brand_safe": true,
      "source": "competitor_analysis|intelligence_refresh",
      "rationale": "Pattern observed or gap this fills"
    }
  ],
  "new_pattern_interrupts": [
    {
      "subtype": "myth-bust|did-you-know|surprising-stat|counterintuitive|seasonal-hook|edutainment",
      "topic": "The specific claim or fact — be concrete and surprising",
      "visual": "Specific visual direction — what should the image show",
      "confidence": 0.8,
      "brand_safe": true,
      "source": "trend_analysis|competitor_analysis",
      "rationale": "Why this topic is timely or missing from current pool"
    }
  ],
  "intelligence_summary": {
    "top_performing_archetype_this_week": "category name",
    "weakest_archetype_this_week": "category name",
    "recommended_focus_shift": "One sentence on what to prioritize next week",
    "competitor_patterns_detected": ["Pattern 1", "Pattern 2"],
    "hook_gap_identified": "Which hook type is underrepresented",
    "cta_fatigue_detected": false
  }
}

Generate:
- 3-5 new_themes (genuinely novel — not already in pools or last 14 days)
- 4-8 new_hooks (prioritize hook types not well-represented in existing library)
- 2-4 new_ctas across different platforms (patterns you observed, not generic)
- 2-4 new_pattern_interrupts (specific, surprising facts — not vague)
- Complete intelligence_summary

Quality bar: every suggestion must be specific enough to act on immediately. "Kids activities" is too vague. "Spring cleanup maze for 5-year-olds with a vacuum cleaner theme" is specific.`;

  log('  Calling Gemini to synthesize intelligence...');
  try {
    const raw = await callGemini(systemInstruction, userPrompt, false, 0.4);
    // Strip any markdown fences if Gemini added them
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    log(`  Intelligence synthesized: ${parsed.new_themes?.length || 0} themes, ${parsed.new_hooks?.length || 0} hooks, ${parsed.new_ctas?.length || 0} CTAs, ${parsed.new_pattern_interrupts?.length || 0} interrupts`);
    return parsed;
  } catch (err) {
    throw new Error(`Gemini synthesis failed: ${err.message}`);
  }
}

function extractSection(text, sectionNames) {
  const lines = text.split('\n');
  const extracted = [];
  let capturing = false;
  let captured = 0;

  for (const line of lines) {
    const isHeader = line.match(/^#{1,3}\s+(.+)/);
    if (isHeader) {
      const title = isHeader[1].trim().toUpperCase();
      const match = sectionNames.some(s => title.includes(s.toUpperCase()));
      if (match) { capturing = true; captured++; }
      else if (capturing && captured >= 2) { capturing = false; }
    }
    if (capturing) extracted.push(line);
    if (extracted.length > 200) break;
  }
  return extracted.join('\n');
}

// ── Step 4: Brand safety validation ──────────────────────────────────────────

function brandSafetyPassOne(payload) {
  // Load hardcoded theme pool for dedup
  const STATIC_THEMES = [
    'Ocean Animals', 'Space and Planets', 'Forest Animals', 'Safari and Jungle',
    'Dinosaurs', 'Farm Animals', 'Bugs and Insects', 'Arctic Animals', 'Birds',
    'Desert Animals', 'Pets and Cats', 'Dogs and Puppies', 'Butterflies', 'Sea Turtles',
    'Pirates and Treasure', 'Fairy Tale Castle', 'Dragons and Fantasy', 'Superheroes',
    'Mermaids', 'Knights and Armor', 'Wizards and Magic', 'Unicorns',
    'Vehicles and Trains', 'Rockets and Spaceships', 'Robots and Technology',
    'Fire Trucks', 'Airplanes', 'Submarines', 'Food and Cooking', 'Weather and Seasons',
    'Garden and Flowers', 'Camping Outdoors', 'Circus and Carnival', 'Sports and Games',
    'Construction and Building', 'Music Instruments', 'Holidays and Celebrations',
    'Birthday Party', 'Rainy Day Indoors', 'Snowy Winter', 'Spring Flowers', 'Autumn Leaves',
    'Numbers and Math', 'Alphabet Letters', 'Colors and Shapes', 'Science Experiments',
    'Maps and Geography', 'Ancient Egypt', 'Under the Sea', 'Candy Land', 'Bakery and Pastries',
    'Jungle Explorer', 'Treasure Map', 'Safari Adventure', 'Underwater Cave', 'Volcano Island',
    'Rainbow World', 'Toy Workshop', 'Snack Time', 'Funny Monsters', 'Baby Animals',
  ];
  const staticNorm = new Set(STATIC_THEMES.map(normalize));

  function checkText(text) {
    if (!text) return true;
    const lower = text.toLowerCase();
    return !BRAND_BLOCKLIST.some(word => lower.includes(word));
  }

  let flagged = 0;

  // Flag themes
  for (const t of (payload.new_themes || [])) {
    if (!checkText(t.name) || !checkText(t.rationale)) {
      t.brand_safe = false; flagged++;
    }
    // Also flag if it's a duplicate of the static pool
    if (staticNorm.has(normalize(t.name || ''))) {
      t.brand_safe = false;
      t._reject_reason = 'duplicate of static pool';
      flagged++;
    }
  }

  // Flag hooks
  for (const h of (payload.new_hooks || [])) {
    if (!checkText(h.text)) { h.brand_safe = false; flagged++; }
  }

  // Flag CTAs
  for (const c of (payload.new_ctas || [])) {
    if (!checkText(c.text)) { c.brand_safe = false; flagged++; }
  }

  // Flag pattern interrupts
  for (const p of (payload.new_pattern_interrupts || [])) {
    if (!checkText(p.topic) || !checkText(p.visual)) { p.brand_safe = false; flagged++; }
  }

  if (flagged > 0) log(`  Brand safety (pass 1): flagged ${flagged} entries as unsafe`);
  else log('  Brand safety (pass 1): all entries passed');

  return payload;
}

async function brandSafetyPassTwo(payload) {
  const groq = groqClient();
  if (!groq) {
    log('  Brand safety (pass 2): skipped — no GROQ_API_KEY');
    return payload;
  }

  // Only check entries that passed pass 1
  const toCheck = [
    ...(payload.new_themes || []).filter(t => t.brand_safe !== false).map(t => ({ type: 'theme', id: t.name, text: t.name + ': ' + (t.rationale || '') })),
    ...(payload.new_hooks || []).filter(h => h.brand_safe !== false).map(h => ({ type: 'hook', id: h.text?.slice(0, 40), text: h.text })),
    ...(payload.new_ctas || []).filter(c => c.brand_safe !== false).map(c => ({ type: 'cta', id: c.text?.slice(0, 40), text: c.text })),
    ...(payload.new_pattern_interrupts || []).filter(p => p.brand_safe !== false).map(p => ({ type: 'interrupt', id: p.topic?.slice(0, 40), text: p.topic + '. Visual: ' + p.visual })),
  ];

  if (toCheck.length === 0) return payload;

  const prompt = `You are a brand safety reviewer for JoyMaze — a children's educational app targeting parents of kids ages 4-8. The content is printable activities (mazes, coloring, word searches).

Rate each suggestion as SAFE, REVIEW, or REJECT:
- REJECT: inappropriate for children, genuinely off-brand, controversial, competitor mentions, physical craft materials required, fear-based
- REVIEW: borderline, needs human judgment (be conservative — only use REVIEW for genuinely ambiguous cases)
- SAFE: clearly on-brand and appropriate

Items to review:
${toCheck.map((item, i) => `${i + 1}. [${item.type}] "${item.text}"`).join('\n')}

Return ONLY valid JSON array: [{"index": 1, "verdict": "SAFE", "reason": "brief reason if not SAFE"}]`;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 600,
    });

    const raw = response.choices[0].message.content.trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    const verdicts = JSON.parse(raw);

    let rejected = 0, review = 0;
    for (const v of verdicts) {
      const item = toCheck[v.index - 1];
      if (!item) continue;

      if (v.verdict === 'REJECT') {
        // Find and flag the matching entry
        const allArrays = [...(payload.new_themes || []), ...(payload.new_hooks || []), ...(payload.new_ctas || []), ...(payload.new_pattern_interrupts || [])];
        for (const entry of allArrays) {
          const text = entry.name || entry.text || entry.topic || '';
          if (text.toLowerCase().includes(item.id.toLowerCase())) {
            entry.brand_safe = false;
            entry._reject_reason = v.reason;
            rejected++;
            break;
          }
        }
      } else if (v.verdict === 'REVIEW') {
        // brand_safe: null = needs human attention
        const allArrays = [...(payload.new_themes || []), ...(payload.new_hooks || []), ...(payload.new_ctas || []), ...(payload.new_pattern_interrupts || [])];
        for (const entry of allArrays) {
          const text = entry.name || entry.text || entry.topic || '';
          if (text.toLowerCase().includes(item.id.toLowerCase())) {
            entry.brand_safe = null;
            entry._review_reason = v.reason;
            review++;
            break;
          }
        }
      }
    }
    log(`  Brand safety (pass 2): ${rejected} rejected, ${review} flagged for review, rest SAFE`);
  } catch (err) {
    log(`  Brand safety (pass 2) failed: ${err.message} — continuing with pass-1 results`);
  }

  return payload;
}

// ── Step 5: Entropy check ────────────────────────────────────────────────────

async function computeEntropyScore(payload) {
  const groq = groqClient();
  if (!groq) return 2.0; // Default low entropy if no Groq

  const sampleEntries = [
    ...(payload.new_themes || []).filter(t => t.brand_safe !== false).slice(0, 3).map(t => t.name),
    ...(payload.new_hooks || []).filter(h => h.brand_safe !== false).slice(0, 3).map(h => h.text),
    ...(payload.new_ctas || []).filter(c => c.brand_safe !== false).slice(0, 2).map(c => c.text),
  ];

  if (sampleEntries.length === 0) return 0;

  const prompt = `JoyMaze is a kids activity app (printable mazes, coloring, word searches, ages 4-8). Brand voice: warm, emotional, educational, parent-guilt-to-relief. Content is screen-free and printable.

Rate how far these content suggestions drift from JoyMaze's core voice on a scale of 0-10:
0 = perfectly on-brand
5 = somewhat off but fixable
10 = completely off-brand or inappropriate

Suggestions:
${sampleEntries.map((s, i) => `${i + 1}. "${s}"`).join('\n')}

Return ONLY valid JSON: {"entropy_score": <number 0-10>, "warning_flags": ["flag1", "flag2"]}`;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 150,
    });
    const raw = response.choices[0].message.content.trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    const result = JSON.parse(raw);
    const score = parseFloat(result.entropy_score) || 2.0;
    if (result.warning_flags?.length) log(`  Entropy warnings: ${result.warning_flags.join(', ')}`);
    return score;
  } catch {
    return 2.0; // Safe default
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('\n=== JoyMaze Intelligence Refresh ===');
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  log(`Date: ${new Date().toISOString().slice(0, 10)}\n`);

  // Check if already ran this week
  const existing = await loadJson(INTELLIGENCE_FILE);
  if (existing?._meta?.week_of === new Date().toISOString().slice(0, 10) && !DRY_RUN) {
    if (existing._meta.status === 'applied') {
      log('Already refreshed and applied today. Nothing to do.');
      return;
    }
    if (existing._meta.status !== 'none') {
      log(`Already refreshed today (status: ${existing._meta.status}). Run apply-intelligence.mjs to apply.`);
      return;
    }
  }

  // 1. Build input context
  log('--- Step 1: Building input context ---');
  const inputContext = await buildInputContext();
  log(`  Tracked posts: ${inputContext.analyticsDigest.totalPostsTracked} (${inputContext.analyticsDigest.postsWithAnalytics} with analytics)`);
  log(`  Recent themes covered: ${inputContext.recentTopics.themes.length}`);
  log(`  Dynamic pool entries: ${inputContext.currentDynamicPools.themes.length} themes, ${inputContext.currentDynamicPools.hookTexts.length} hooks`);

  // 2. Competitor web searches
  log('\n--- Step 2: Competitor web searches ---');
  const competitorResults = await runCompetitorSearches(inputContext.trendsData);

  // 3. Synthesize intelligence
  log('\n--- Step 3: Synthesizing intelligence ---');
  let payload;
  try {
    payload = await synthesizeIntelligence(inputContext, competitorResults);
  } catch (err) {
    log(`\nFatal: ${err.message}`);
    log('Intelligence refresh failed. Check VERTEX_API_KEY and retry.');
    process.exit(1);
  }

  // 4. Brand safety validation
  log('\n--- Step 4: Brand safety validation ---');
  payload = brandSafetyPassOne(payload);
  payload = await brandSafetyPassTwo(payload);

  // 5. Entropy check
  log('\n--- Step 5: Entropy check ---');
  const entropyScore = await computeEntropyScore(payload);
  log(`  Entropy score: ${entropyScore.toFixed(1)}/10${entropyScore > 6 ? ' ⚠️  HIGH — will block auto-apply' : ' ✓'}`);

  // 6. Determine status
  const status = entropyScore > 6 ? 'entropy_blocked' : 'pending_apply';

  // 7. Assemble final document
  const today = new Date().toISOString().slice(0, 10);
  const safeCount = (arr) => (arr || []).filter(e => e.brand_safe === true).length;

  const intelligence = {
    _meta: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      week_of: today,
      status,
      applied_at: null,
      entropy_score: parseFloat(entropyScore.toFixed(1)),
      inputs_summary: {
        analytics_posts_analyzed: inputContext.analyticsDigest.totalPostsTracked,
        posts_with_analytics: inputContext.analyticsDigest.postsWithAnalytics,
        competitor_searches_performed: SKIP_COMPETITOR ? 0 : 6,
        trends_boost_themes: inputContext.trendsData?.boost_themes || [],
        rising_searches_count: inputContext.trendsData?.rising_searches?.length || 0,
      },
    },
    new_themes: payload.new_themes || [],
    new_hooks: payload.new_hooks || [],
    new_ctas: payload.new_ctas || [],
    new_pattern_interrupts: payload.new_pattern_interrupts || [],
    intelligence_summary: payload.intelligence_summary || {},
  };

  // 8. Write or preview
  log('\n--- Step 6: Writing output ---');
  if (DRY_RUN) {
    log('\n[DRY RUN] Would write config/content-intelligence.json:');
    log(`  Status: ${status}`);
    log(`  New themes (safe): ${safeCount(intelligence.new_themes)} / ${intelligence.new_themes.length}`);
    log(`  New hooks (safe):  ${safeCount(intelligence.new_hooks)} / ${intelligence.new_hooks.length}`);
    log(`  New CTAs (safe):   ${safeCount(intelligence.new_ctas)} / ${intelligence.new_ctas.length}`);
    log(`  New interrupts (safe): ${safeCount(intelligence.new_pattern_interrupts)} / ${intelligence.new_pattern_interrupts.length}`);
    if (entropyScore > 6) log(`  ⚠️  ENTROPY BLOCKED — run with --force-apply to override`);
    log('\nSample new themes:');
    intelligence.new_themes.filter(t => t.brand_safe).slice(0, 3).forEach(t => log(`  - ${t.name}: ${t.rationale}`));
    log('\nSample new hooks:');
    intelligence.new_hooks.filter(h => h.brand_safe).slice(0, 3).forEach(h => log(`  - [${h.hook_type}] "${h.text}"`));
    return;
  }

  await fs.writeFile(INTELLIGENCE_FILE, JSON.stringify(intelligence, null, 2) + '\n', 'utf-8');
  log('  ✓ Written to config/content-intelligence.json');

  // Summary
  log('\n--- Summary ---');
  log(`  Status: ${status}`);
  log(`  Safe themes: ${safeCount(intelligence.new_themes)} / ${intelligence.new_themes.length}`);
  log(`  Safe hooks:  ${safeCount(intelligence.new_hooks)} / ${intelligence.new_hooks.length}`);
  log(`  Safe CTAs:   ${safeCount(intelligence.new_ctas)} / ${intelligence.new_ctas.length}`);
  log(`  Safe interrupts: ${safeCount(intelligence.new_pattern_interrupts)} / ${intelligence.new_pattern_interrupts.length}`);

  if (intelligence.intelligence_summary?.recommended_focus_shift) {
    log(`\n  Focus shift: ${intelligence.intelligence_summary.recommended_focus_shift}`);
  }
  if (status === 'entropy_blocked') {
    log('\n  ⚠️  HIGH ENTROPY — intelligence written but NOT auto-applied.');
    log('  Review config/content-intelligence.json then run: npm run intelligence:apply:force');
  } else {
    log('\n  Intelligence ready. apply-intelligence.mjs will consume this next.');
  }
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });

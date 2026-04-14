#!/usr/bin/env node

/**
 * JoyMaze Content — Caption Generation Pipeline
 *
 * Generates platform-specific captions with hashtags and CTAs
 * for content pieces in the queue.
 *
 * Usage:
 *   node scripts/generate-captions.mjs              # Full run (uses Claude API)
 *   node scripts/generate-captions.mjs --dry-run     # Test with sample captions
 *   node scripts/generate-captions.mjs --id 2026-03-21-coloring-preview-00  # Single item
 *   node scripts/generate-captions.mjs --force       # Regenerate even if captions already exist
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const TEMPLATES_DIR = path.join(ROOT, 'templates', 'captions');

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const idIdx = args.indexOf('--id');
const FILTER_ID = idIdx !== -1 ? args[idIdx + 1] : null;

// Load configs
const hashtagsConfig = JSON.parse(
  await fs.readFile(path.join(ROOT, 'config', 'hashtags.json'), 'utf-8')
);
const platformsConfig = JSON.parse(
  await fs.readFile(path.join(ROOT, 'config', 'platforms.json'), 'utf-8')
);

// Load Hypnotic Writing style guide (injected into every prompt)
let writingStyleGuide = '';
try {
  writingStyleGuide = await fs.readFile(path.join(ROOT, 'config', 'writing-style.md'), 'utf-8');
} catch {
  // Style guide optional — pipeline works without it
}

// Load dynamic CTAs and hooks from intelligence system (silent fallback if files don't exist)
let dynamicCtas = {};
try {
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'cta-library.json'), 'utf-8'));
  dynamicCtas = raw.ctas || {};
} catch {}

let dynamicHookSupplement = '';
try {
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'hooks-library.json'), 'utf-8'));
  const hooks = (raw.hooks || [])
    .filter(h => h.brand_safe === true)
    .sort((a, b) => ((b.performance_score ?? -1) - (a.performance_score ?? -1)))
    .slice(0, 10);
  if (hooks.length > 0) {
    dynamicHookSupplement = '\n\n## TOP-PERFORMING HOOKS (use as inspiration, not verbatim):\n'
      + hooks.map(h => `[${(h.hook_type || 'hook').replace(/_/g, ' ')}] "${h.text}"`).join('\n');
  }
} catch {}

// Load trend signals, active themes, and competitor intelligence (silent fallback)
// Injected as lightweight context so captions reflect what's trending and what's working for competitors.
let intelligenceContext = '';
try {
  const [trendsRaw, themesRaw, competitorRaw] = await Promise.all([
    fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8').catch(() => null),
    fs.readFile(path.join(ROOT, 'config', 'theme-pool-dynamic.json'), 'utf-8').catch(() => null),
    fs.readFile(path.join(ROOT, 'config', 'competitor-intelligence.json'), 'utf-8').catch(() => null),
  ]);
  const lines = [];
  if (trendsRaw) {
    const trends = JSON.parse(trendsRaw);
    const boost   = (trends.boost_themes    || []).slice(0, 4).join(', ');
    const rising  = (trends.rising_searches || []).slice(0, 4).join(', ');
    const kw      = (trends.caption_keywords || []).slice(0, 5).join(', ');
    if (boost)  lines.push(`Trending themes this week: ${boost}`);
    if (rising) lines.push(`Rising search terms: ${rising}`);
    if (kw)     lines.push(`High-resonance caption words: ${kw}`);
  }
  if (themesRaw) {
    const pool = JSON.parse(themesRaw);
    const active = (pool.themes || [])
      .filter(t => t.status !== 'evicted' && t.brand_safe !== false)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 3)
      .map(t => t.name);
    if (active.length) lines.push(`Active content themes: ${active.join(', ')}`);
  }
  if (competitorRaw) {
    const comp = JSON.parse(competitorRaw);
    const patterns = (comp.caption_patterns || []).slice(0, 3).join(' | ');
    const hooks    = (comp.winning_hooks    || []).slice(0, 3).join(' | ');
    const themes   = (comp.viral_themes     || []).slice(0, 3).join(', ');
    if (patterns) lines.push(`Competitor caption patterns (what's working in this niche): ${patterns}`);
    if (hooks)    lines.push(`Competitor winning hooks (style reference only): ${hooks}`);
    if (themes)   lines.push(`Competitor viral themes: ${themes}`);
  }

  // Performance weights: which categories are saving vs not
  try {
    const perfRaw = await fs.readFile(path.join(ROOT, 'config', 'performance-weights.json'), 'utf-8');
    const perf = JSON.parse(perfRaw);
    const cats = perf.categories || [];
    if (cats.length > 0) {
      const boost  = cats.filter(c => c.tier === 'boost').map(c => c.label || c.category);
      const reduce = cats.filter(c => c.tier === 'reduce').map(c => c.label || c.category);
      if (boost.length)  lines.push(`High-saving content categories this week: ${boost.join(', ')} — lean into these`);
      if (reduce.length) lines.push(`Low-saving categories: ${reduce.join(', ')} — vary hook approach`);
    }
  } catch {}

  if (lines.length) {
    intelligenceContext = '\n\n## INTELLIGENCE SIGNALS (weave naturally into captions when relevant — do not force):\n'
      + lines.join('\n');
  }
} catch {}

// Platform caption targets
const PLATFORMS = ['pinterest', 'instagram', 'x', 'tiktok', 'youtube'];

// CTAs for rotation — soft only (no hard "Download now!" energy)
const CTAS = {
  app: [
    'More activities at joymaze.com',
    'Link in bio for more',
    'For more kids activities → joymaze.com',
  ],
  both: [
    'More activities at joymaze.com',
    'More printables at joymaze.com',
    'Link in bio for more',
  ],
  website: [
    'More at joymaze.com',
    'More activities at joymaze.com',
  ],
  books: [
    'More printables at joymaze.com',
    'Find more printable activities at joymaze.com',
  ],
  bio: [
    'Link in bio for more',
    'For more activities → link in bio',
  ],
};

/**
 * Pick random items from an array
 */
function pickRandom(arr, count = 1) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return count === 1 ? shuffled[0] : shuffled.slice(0, count);
}

/**
 * Get current season for seasonal hashtags
 */
function getCurrentSeason() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

/**
 * Generate hashtags for a platform based on content category
 */
function generateHashtags(platform, categoryId) {
  const config = hashtagsConfig.platformDefaults[platform];
  if (!config) return [];

  const allTags = new Set(config.alwaysInclude || []);

  // Add category-specific hashtags
  const categoryMap = {
    'coloring-preview': 'coloring',
    'before-after': 'coloring',
    'parent-tips': 'parenting',
    'app-feature': 'education',
    'book-preview': 'books',
    'fun-facts': 'education',
    'joyo-mascot': 'core',
    'motivation': 'parenting',
    'engagement': 'engagement',
    'seasonal': 'education',
    // Activity post categories
    'activity-maze': 'mazes',
    'activity-word-search': 'wordSearch',
    'activity-matching': 'matching',
    'activity-tracing': 'tracing',
    'activity-quiz': 'quiz',
    'activity-dot-to-dot': 'dotToDotActivity',
    'activity-sudoku': 'sudoku',
    'activity-coloring': 'coloringActivity',
    // ASMR video categories
    'asmr-coloring': 'asmr',
    'asmr-maze': 'asmr',
    'asmr-tracing': 'asmr',
    'asmr-drawing': 'asmr',
    // Story post categories
    'story': 'parenting',
    'story-marketing': 'parenting',
    'pattern-interrupt': 'engagement',
  };

  const categoryPool = categoryMap[categoryId] || 'core';
  const poolTags = hashtagsConfig.pools[categoryPool] || [];
  const coreTags = hashtagsConfig.pools.core || [];

  // Add from category pool
  for (const tag of pickRandom(poolTags, Math.min(poolTags.length, Math.ceil(config.count / 2)))) {
    allTags.add(tag);
  }

  // Fill remaining from configured pools
  for (const poolName of config.pools) {
    if (allTags.size >= config.count) break;
    const pool = hashtagsConfig.pools[poolName];
    if (!pool || !Array.isArray(pool)) continue;
    for (const tag of pickRandom(pool, 3)) {
      if (allTags.size >= config.count) break;
      allTags.add(tag);
    }
  }

  // Add seasonal hashtags occasionally
  const season = getCurrentSeason();
  const seasonalTags = hashtagsConfig.pools.seasonal?.[season];
  if (seasonalTags && Math.random() > 0.5 && allTags.size < config.count) {
    allTags.add(pickRandom(seasonalTags));
  }

  return [...allTags].slice(0, config.count);
}

/**
 * Load caption template for a platform (auto-selects asmr/activity template by format/category)
 */
async function loadTemplate(platform, categoryId, format) {
  // ASMR format gets its own templates
  if (format === 'asmr') {
    const asmrPath = path.join(TEMPLATES_DIR, `${platform}-asmr.txt`);
    try { return await fs.readFile(asmrPath, 'utf-8'); } catch {}
  }

  // Use activity-specific templates for activity categories
  const isActivity = categoryId?.startsWith('activity-');
  const templateName = isActivity ? `${platform}-activity` : platform;
  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.txt`);
  try {
    return await fs.readFile(templatePath, 'utf-8');
  } catch {
    // Fall back to default platform template
    if (isActivity) {
      const fallback = path.join(TEMPLATES_DIR, `${platform}.txt`);
      try { return await fs.readFile(fallback, 'utf-8'); } catch {}
    }
    return null;
  }
}

/**
 * Generate caption using Gemini free API (primary)
 */
async function generateWithGemini(prompt) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.VERTEX_API_KEY || process.env.GOOGLE_AI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * Generate caption using Groq free API (fallback 1)
 * Free tier: 14,400 req/day on llama-3.3-70b
 */
async function generateWithGroq(prompt, retries = 2) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  try {
    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    });
    return response.choices[0].message.content.trim();
  } catch (err) {
    // Retry on 429 rate limit — wait 65s for the Groq per-minute window to reset
    if (retries > 0 && err.status === 429) {
      console.log(`    [Groq 429] Rate limit hit — waiting 65s then retrying (${retries} retries left)...`);
      await new Promise(r => setTimeout(r, 65000));
      return generateWithGroq(prompt, retries - 1);
    }
    throw err;
  }
}

/**
 * Generate caption using Ollama local API (fallback 2)
 * Runs fully offline on device. Install: https://ollama.com
 * Recommended model for this device: llama3.2:3b (fits in 4GB VRAM)
 */
async function generateWithOllama(prompt) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({
    apiKey: 'ollama',
    baseURL: 'http://localhost:11434/v1',
  });

  const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500,
  });

  return response.choices[0].message.content.trim();
}

/**
 * Generate an X thread reply — a 2nd tweet posted as a reply to own main tweet.
 * The reply adds resolution, insight, or engagement bait that continues the hook.
 */
async function generateXThreadReply(mainCaption, metadata) {
  const isActivity = metadata.category?.startsWith('activity-');
  const isStory = metadata.category === 'story' || metadata.type === 'video';
  const topic = metadata.subject || metadata.categoryName || 'kids activity';

  let replyPrompt;
  if (isActivity) {
    replyPrompt = `You just posted this on X:\n"${mainCaption}"\n\nNow write the FIRST REPLY from the same author — a single tweet (under 280 chars) that:\n- Either gives the answer/result, OR asks parents what their kid scored/drew/found\n- Ends with a soft call to "drop it in the comments" or "tell us below"\n- Warm, brief, no hashtags\n- Topic: ${topic}\n\nReturn ONLY the reply tweet text, nothing else.`;
  } else if (isStory) {
    replyPrompt = `You just posted this hook on X:\n"${mainCaption}"\n\nNow write the FIRST REPLY from the same author — a single tweet (under 280 chars) that:\n- Delivers the resolution or emotional payoff of the story\n- Ends on a feeling, not a promotion\n- No CTA, no hashtags, no "download JoyMaze"\n- Topic: ${topic}\n\nReturn ONLY the reply tweet text, nothing else.`;
  } else {
    replyPrompt = `You just posted this on X:\n"${mainCaption}"\n\nNow write the FIRST REPLY from the same author — a single tweet (under 280 chars) that:\n- Adds one deeper insight or unexpected fact about ${topic}\n- OR asks a question parents will want to answer ("Which one does your kid love?")\n- Warm, specific, no hashtags, no CTA\n\nReturn ONLY the reply tweet text, nothing else.`;
  }

  try {
    const reply = await generateWithGroq(replyPrompt);
    return reply.trim().slice(0, 280);
  } catch {
    // Fallback defaults per content type
    if (isActivity) return `What did your kid think? Drop the result below 👇`;
    if (isStory) return `That's what happens when a child trusts their imagination. Every story starts with one brave step.`;
    return `Which activity does your kid always come back to? Drop it below 👇`;
  }
}

/**
 * Generate a dry-run caption
 */
function generateDryRunCaption(platform, metadata) {
  const templates = {
    pinterest: `Looking for fun activities that help your child learn and grow? ${metadata.categoryName} is a great way to build essential skills while having fun. JoyMaze makes it easy with kid-friendly ${metadata.subject || 'activities'} designed for ages 4-8. Download JoyMaze free on iOS and Android!`,

    instagram: `Which activity will YOUR kid try first?\n\nDid you know that ${metadata.subject || 'interactive activities'} can help children develop critical thinking and creativity?\n\nJoyMaze turns screen time into learning time with fun, engaging activities designed by educators.\n\nTry it free today — link in bio!`,

    x: `Kids + ${metadata.categoryName} = learning that feels like play. JoyMaze makes it fun and free!`,

    tiktok: `POV: You find an app that actually makes screen time educational. Your kids are going to love this.`,

    youtube: `Watch how JoyMaze turns ${metadata.subject || 'activities'} into fun learning experiences for kids ages 4-8. With colorful designs and engaging puzzles, your child will love learning new skills. Download JoyMaze free on iOS and Android!`,
  };

  return templates[platform] || `Check out JoyMaze — fun learning games for kids! ${metadata.categoryName}`;
}

/**
 * Generate captions for a single content piece
 */
async function generateCaptionsForContent(metadata) {
  console.log(`  Processing: ${metadata.id} — ${metadata.categoryName}`);

  const captions = {};

  for (const platform of PLATFORMS) {
    let caption;

    if (DRY_RUN) {
      caption = generateDryRunCaption(platform, metadata);
      console.log(`    [DRY RUN] ${platform}: generated sample caption`);
    } else {
      const template = await loadTemplate(platform, metadata.category, metadata.format);
      if (!template) {
        caption = generateDryRunCaption(platform, metadata);
        console.log(`    ${platform}: no template, using default`);
      } else {
        // Activity-specific template variables
        const isActivity = metadata.category?.startsWith('activity-');
        const activityType = isActivity ? metadata.category.replace('activity-', '').replace(/-/g, ' ') : '';
        const difficulty = metadata.difficulty || 'medium';

        const templatePrompt = template
          .replace('{{topic}}', metadata.subject || metadata.categoryName)
          .replace('{{category}}', metadata.categoryName || metadata.category)
          .replace('{{visualDescription}}', metadata.prompt || '')
          .replace('{{activityType}}', activityType)
          .replace('{{difficulty}}', difficulty);

        // Full prompt: style guide + intelligence context + template (for Gemini and Groq — large context models)
        const fullPrompt = writingStyleGuide
          ? `${writingStyleGuide}${dynamicHookSupplement}${intelligenceContext}\n\n---\n\n${templatePrompt}`
          : `${intelligenceContext}\n\n---\n\n${templatePrompt}`;

        // Short prompt: template only (for Ollama — llama3.2:3b has limited context)
        const shortPrompt = templatePrompt;

        // Fallback chain: Groq (primary) → Vertex/Gemini → Ollama (local)
        try {
          caption = await generateWithGroq(fullPrompt);
          console.log(`    ${platform}: generated via Groq`);
          // Rate limit guard: 30 req/min on Groq free tier
          await new Promise(r => setTimeout(r, 2500));
        } catch (err) {
          console.log(`    ${platform}: Groq failed (${err.message.slice(0, 80)}...), trying Vertex/Gemini...`);
          try {
            caption = await generateWithGemini(fullPrompt);
            console.log(`    ${platform}: generated via Vertex/Gemini`);
          } catch (err2) {
            console.log(`    ${platform}: Vertex failed (${err2.message.slice(0, 80)}...), trying Ollama...`);
            try {
              caption = await generateWithOllama(shortPrompt);
              console.log(`    ${platform}: generated via Ollama (local)`);
            } catch (err3) {
              console.error(`    ${platform}: all providers failed, using default`);
              caption = generateDryRunCaption(platform, metadata);
            }
          }
        }
      }
    }

    // Generate hashtags
    const hashtags = generateHashtags(platform, metadata.category);

    // Pick a CTA based on where the activity lives
    const BOOK_ONLY_CATEGORIES = ['activity-tracing', 'activity-quiz', 'book-preview'];
    const APP_AND_BOOK_CATEGORIES = ['activity-maze', 'activity-word-search', 'activity-matching',
                                     'activity-dot-to-dot', 'activity-sudoku', 'activity-coloring'];
    const ctaType = platform === 'instagram' ? 'bio' :
                    BOOK_ONLY_CATEGORIES.includes(metadata.category) ? 'books' :
                    APP_AND_BOOK_CATEGORIES.includes(metadata.category) ? 'both' : 'app';
    const hardcodedCtaPool = CTAS[ctaType] || CTAS.app;
    const dynamicCtaPool = (dynamicCtas[platform]?.[ctaType] || [])
      .filter(c => c.brand_safe === true)
      .map(c => c.text);
    const ctaPool = [...hardcodedCtaPool, ...dynamicCtaPool];
    const cta = pickRandom(ctaPool);

    // Assemble final caption
    let finalCaption = caption;
    if (platform === 'instagram' && hashtags.length > 0) {
      finalCaption = `${caption}\n\n.\n.\n.\n${hashtags.join(' ')}`;
    } else if (hashtags.length > 0 && platform !== 'pinterest') {
      finalCaption = `${caption}\n\n${hashtags.join(' ')}`;
    }

    const captionEntry = {
      text: finalCaption,
      rawCaption: caption,
      hashtags,
      cta,
      characterCount: finalCaption.length,
    };

    // X thread: generate a reply tweet for engagement (story resolution, puzzle hint, etc.)
    if (platform === 'x' && !DRY_RUN) {
      try {
        const reply1 = await generateXThreadReply(caption, metadata);
        captionEntry.thread = { tweet1: finalCaption, reply1 };
      } catch { /* thread is optional — post single tweet if this fails */ }
    }

    captions[platform] = captionEntry;
  }

  return captions;
}

/**
 * Main pipeline
 */
async function main() {
  console.log('=== JoyMaze Caption Generation Pipeline ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no API calls)' : 'LIVE (Groq → Vertex/Gemini → Ollama → default)'}`);
  if (FILTER_ID) console.log(`Filter: ${FILTER_ID}`);
  console.log('');

  // Read queue directory
  let queueFiles;
  try {
    queueFiles = await fs.readdir(QUEUE_DIR);
  } catch {
    console.log('No queue directory found. Run generate-images.mjs first.');
    process.exit(0);
  }

  const jsonFiles = queueFiles.filter(f => f.endsWith('.json'));
  if (jsonFiles.length === 0) {
    console.log('No content in queue. Run generate-images.mjs first.');
    process.exit(0);
  }

  console.log(`Found ${jsonFiles.length} items in queue.`);
  console.log('');

  let processed = 0;
  let skipped = 0;

  for (const filename of jsonFiles) {
    const filePath = path.join(QUEUE_DIR, filename);
    const metadata = JSON.parse(await fs.readFile(filePath, 'utf-8'));

    // Filter by ID if specified
    if (FILTER_ID && metadata.id !== FILTER_ID) {
      skipped++;
      continue;
    }

    // Skip if captions already exist (unless dry-run or --force)
    if (metadata.captions && !DRY_RUN && !FORCE) {
      console.log(`  Skipping ${metadata.id}: captions already generated`);
      skipped++;
      continue;
    }

    try {
      const captions = await generateCaptionsForContent(metadata);
      metadata.captions = captions;
      metadata.captionsGeneratedAt = new Date().toISOString();

      // Write updated metadata
      await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
      processed++;
    } catch (err) {
      console.error(`  Error processing ${metadata.id}: ${err.message}`);
    }
  }

  // Summary
  console.log('');
  console.log('=== Caption Generation Complete ===');
  console.log(`Processed: ${processed} items`);
  console.log(`Skipped: ${skipped} items`);
  console.log(`Platforms: ${PLATFORMS.join(', ')}`);
  console.log('');
  console.log('Content is ready in output/queue/ with captions and hashtags.');
  console.log('Next step: Run `node scripts/post-content.mjs` to publish.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

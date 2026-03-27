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
const idIdx = args.indexOf('--id');
const FILTER_ID = idIdx !== -1 ? args[idIdx + 1] : null;

// Load configs
const hashtagsConfig = JSON.parse(
  await fs.readFile(path.join(ROOT, 'config', 'hashtags.json'), 'utf-8')
);
const platformsConfig = JSON.parse(
  await fs.readFile(path.join(ROOT, 'config', 'platforms.json'), 'utf-8')
);

// Platform caption targets
const PLATFORMS = ['pinterest', 'instagram', 'x', 'tiktok', 'youtube'];

// CTAs for rotation
const CTAS = {
  app: [
    'Download JoyMaze free on iOS and Android!',
    'Try JoyMaze — fun learning games for kids!',
    'Get JoyMaze free today!',
  ],
  website: [
    'Visit joymaze.com for more!',
    'More fun at joymaze.com!',
  ],
  books: [
    'Get our activity books on Amazon!',
    'Our kids activity books are on Amazon!',
    'Check out our activity books on Amazon!',
  ],
  bio: [
    'Link in bio for free download!',
    'Link in bio!',
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
 * Load caption template for a platform
 */
async function loadTemplate(platform) {
  const templatePath = path.join(TEMPLATES_DIR, `${platform}.txt`);
  try {
    return await fs.readFile(templatePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Generate caption using Gemini free API (primary)
 */
async function generateWithGemini(prompt) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * Generate caption using Groq free API (fallback 1)
 * Free tier: 14,400 req/day on llama-3.3-70b
 */
async function generateWithGroq(prompt) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500,
  });

  return response.choices[0].message.content.trim();
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
      const template = await loadTemplate(platform);
      if (!template) {
        caption = generateDryRunCaption(platform, metadata);
        console.log(`    ${platform}: no template, using default`);
      } else {
        const prompt = template
          .replace('{{topic}}', metadata.subject || metadata.categoryName)
          .replace('{{category}}', metadata.categoryName)
          .replace('{{visualDescription}}', metadata.prompt || '');

        try {
          caption = await generateWithGemini(prompt);
          console.log(`    ${platform}: generated via Gemini`);
        } catch (err) {
          console.log(`    ${platform}: Gemini failed (${err.message.slice(0, 80)}...), trying Groq...`);
          try {
            caption = await generateWithGroq(prompt);
            console.log(`    ${platform}: generated via Groq`);
          } catch (err2) {
            console.log(`    ${platform}: Groq failed (${err2.message.slice(0, 80)}...), trying Ollama...`);
            try {
              caption = await generateWithOllama(prompt);
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

    // Pick a CTA
    const ctaPool = platform === 'instagram' ? CTAS.bio :
                    metadata.category === 'book-preview' ? CTAS.books : CTAS.app;
    const cta = pickRandom(ctaPool);

    // Assemble final caption
    let finalCaption = caption;
    if (platform === 'instagram' && hashtags.length > 0) {
      finalCaption = `${caption}\n\n.\n.\n.\n${hashtags.join(' ')}`;
    } else if (hashtags.length > 0 && platform !== 'pinterest') {
      finalCaption = `${caption}\n\n${hashtags.join(' ')}`;
    }

    captions[platform] = {
      text: finalCaption,
      rawCaption: caption,
      hashtags,
      cta,
      characterCount: finalCaption.length,
    };
  }

  return captions;
}

/**
 * Main pipeline
 */
async function main() {
  console.log('=== JoyMaze Caption Generation Pipeline ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no API calls)' : 'LIVE (Gemini → Groq → Ollama → default)'}`);
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

    // Skip if captions already exist (unless dry-run to allow re-testing)
    if (metadata.captions && !DRY_RUN) {
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

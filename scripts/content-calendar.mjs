#!/usr/bin/env node

/**
 * JoyMaze Content — Content Calendar Manager
 *
 * Manages content scheduling, topic rotation, and queue status.
 *
 * Usage:
 *   node scripts/content-calendar.mjs                # Show queue status + today's plan
 *   node scripts/content-calendar.mjs --week          # Show this week's plan
 *   node scripts/content-calendar.mjs --generate      # Generate tomorrow's content plan
 *   node scripts/content-calendar.mjs --stats         # Show posting statistics
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');

const args = process.argv.slice(2);
const SHOW_WEEK = args.includes('--week');
const GENERATE = args.includes('--generate');
const SHOW_STATS = args.includes('--stats');

// Content categories with daily rotation weights and hypnotic angles
const DAILY_MIX = [
  {
    category: 'coloring-preview',
    perDay: 2,
    label: 'Coloring Previews',
    hypnoticAngle: 'The quiet focus — a child reaching for crayons, the world going still.',
    hook: 'Let them get lost in color.',
  },
  {
    category: 'parent-tips',
    perDay: 2,
    label: 'Parent Tips',
    hypnoticAngle: 'The identity shift — from screen guilt to screen pride. Science gives them permission.',
    hook: 'What great parents already know.',
  },
  {
    category: 'app-feature',
    perDay: 1,
    label: 'App Features',
    hypnoticAngle: 'The absorption moment — when a child goes quiet and deeply focused. That\'s the proof.',
    hook: 'Watch them focus.',
  },
  {
    category: 'book-preview',
    perDay: 1,
    label: 'Book Previews',
    hypnoticAngle: 'The lasting gift — something physical that outlasts any toy, any trend.',
    hook: 'A gift they will come back to.',
  },
  {
    category: 'fun-facts',
    perDay: 1,
    label: 'Fun Facts',
    hypnoticAngle: 'The reframe — play is research. Fun is learning. The science confirms what parents already felt.',
    hook: 'The science behind the fun.',
  },
  {
    category: 'joyo-mascot',
    perDay: 1,
    label: 'Joyo Mascot',
    hypnoticAngle: 'The friend — Joyo is who kids want to be with. Emotional connection before the app.',
    hook: 'He loves what your kids love.',
  },
  {
    category: 'motivation',
    perDay: 1,
    label: 'Quotes',
    hypnoticAngle: 'The permission — timeless words that validate what parents already believe deep down.',
    hook: 'Screen time can be sacred time.',
  },
  {
    category: 'engagement',
    perDay: 1,
    label: 'Engagement Posts',
    hypnoticAngle: 'The choice — give kids agency, give parents a window into their child\'s world.',
    hook: 'Which calls to them?',
  },
  {
    category: 'seasonal',
    perDay: 1,
    label: 'Seasonal',
    hypnoticAngle: 'The moment — right now, this season, this feeling. Timely and alive.',
    hook: 'Made for right now.',
  },
  {
    category: 'before-after',
    perDay: 1,
    label: 'Before/After',
    hypnoticAngle: 'The transformation — the blank page becomes theirs. Potential turned into pride.',
    hook: 'Watch it come alive.',
  },
];

// Optimal posting times per platform
const POSTING_SCHEDULE = {
  pinterest: ['08:00', '12:00', '17:00', '20:00'],
  instagram: ['07:00', '11:00', '14:00', '19:00'],
  x: ['08:00', '12:00', '17:00'],
  tiktok: ['07:00', '10:00', '19:00'],
  youtube: ['10:00', '14:00', '18:00'],
};

/**
 * Read all queue items
 */
async function readQueue() {
  try {
    const files = await fs.readdir(QUEUE_DIR);
    const items = [];
    for (const f of files.filter(f => f.endsWith('.json'))) {
      const data = JSON.parse(await fs.readFile(path.join(QUEUE_DIR, f), 'utf-8'));
      items.push(data);
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Show queue status
 */
async function showStatus() {
  const items = await readQueue();

  const images = items.filter(i => i.type !== 'video');
  const videos = items.filter(i => i.type === 'video');

  console.log('=== Queue Status ===\n');
  console.log(`Total items: ${items.length} (${images.length} images, ${videos.length} videos)`);

  // Count by platform status
  const platformStats = {};
  for (const item of items) {
    for (const [platform, info] of Object.entries(item.platforms || {})) {
      if (!platformStats[platform]) platformStats[platform] = { pending: 0, posted: 0, failed: 0 };
      platformStats[platform][info.status || 'pending']++;
    }
  }

  console.log('\nPlatform Status:');
  for (const [platform, stats] of Object.entries(platformStats)) {
    console.log(`  ${platform}: ${stats.pending} pending | ${stats.posted} posted | ${stats.failed} failed`);
  }

  // Count by category
  const catCounts = {};
  for (const item of images) {
    const cat = item.categoryName || item.category || 'unknown';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }

  console.log('\nContent by Category:');
  for (const [cat, count] of Object.entries(catCounts)) {
    console.log(`  ${cat}: ${count}`);
  }

  // Caption status
  const withCaptions = items.filter(i => i.captions).length;
  const withoutCaptions = items.filter(i => !i.captions).length;
  console.log(`\nCaptions: ${withCaptions} ready | ${withoutCaptions} missing`);
}

/**
 * Show weekly plan
 */
function showWeekPlan() {
  console.log('=== This Week\'s Content Plan ===\n');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const isToday = i === ((dayOfWeek + 6) % 7);

    console.log(`${days[i]} ${dateStr}${isToday ? ' (TODAY)' : ''}`);

    // Rotate categories — shift by day index for variety
    const dayMix = [...DAILY_MIX];
    for (let j = 0; j < i; j++) {
      dayMix.push(dayMix.shift());
    }

    const totalImages = dayMix.reduce((sum, c) => sum + c.perDay, 0);
    console.log(`  Images: ${totalImages} planned`);
    for (const item of dayMix.slice(0, 5)) {
      console.log(`    - ${item.label} x${item.perDay}`);
    }
    console.log(`    ... and ${dayMix.length - 5} more categories`);
    console.log(`  Videos: 1-2 slideshows`);
    console.log('');
  }

  console.log('Posting Schedule:');
  for (const [platform, times] of Object.entries(POSTING_SCHEDULE)) {
    console.log(`  ${platform}: ${times.join(', ')}`);
  }
}

/**
 * Generate content plan for tomorrow
 */
function generatePlan() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][tomorrow.getDay()];

  console.log(`=== Content Plan: ${dayName} ${dateStr} ===\n`);

  console.log('Image Content (12 pieces):');
  let imageIdx = 1;
  for (const item of DAILY_MIX) {
    for (let i = 0; i < item.perDay; i++) {
      console.log(`  ${imageIdx}. [${item.category}] ${item.label}`);
      if (item.hook) console.log(`       Hook: "${item.hook}"`);
      if (item.hypnoticAngle) console.log(`       Angle: ${item.hypnoticAngle}`);
      imageIdx++;
    }
  }

  console.log('\nVideo Content (2 pieces):');
  console.log('  1. Slideshow — best 5-8 images with transitions');
  console.log('  2. Feature highlight — single activity deep dive');

  console.log('\nGenerate commands:');
  console.log(`  node scripts/generate-images.mjs --count 12`);
  console.log(`  node scripts/generate-captions.mjs`);
  console.log(`  node scripts/generate-videos.mjs --count 2`);

  console.log('\nOr run the full pipeline:');
  console.log('  npm run generate:all');
}

/**
 * Show posting statistics
 */
async function showStats() {
  const items = await readQueue();
  if (items.length === 0) {
    console.log('No data to analyze. Generate and post content first.');
    return;
  }

  console.log('=== Content Statistics ===\n');

  // Group by date
  const byDate = {};
  for (const item of items) {
    const date = item.generatedAt?.slice(0, 10) || 'unknown';
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(item);
  }

  for (const [date, dateItems] of Object.entries(byDate).sort()) {
    const images = dateItems.filter(i => i.type !== 'video').length;
    const videos = dateItems.filter(i => i.type === 'video').length;
    console.log(`${date}: ${images} images, ${videos} videos`);
  }

  // Top categories
  const catCounts = {};
  for (const item of items) {
    const cat = item.categoryName || 'unknown';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }

  console.log('\nCategory Distribution:');
  const sorted = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    const bar = '#'.repeat(Math.min(count * 3, 30));
    console.log(`  ${cat}: ${bar} (${count})`);
  }
}

/**
 * Main
 */
async function main() {
  if (SHOW_WEEK) {
    showWeekPlan();
  } else if (GENERATE) {
    generatePlan();
  } else if (SHOW_STATS) {
    await showStats();
  } else {
    await showStatus();
    console.log('\n---');
    console.log('Options: --week (weekly plan) | --generate (tomorrow\'s plan) | --stats (statistics)');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

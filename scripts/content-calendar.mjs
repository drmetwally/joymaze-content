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

// ========== STORY ARCHETYPES (Slots 1-5) ==========
// See docs/CONTENT_ARCHETYPES.md for full definitions and example executions.

// All 6 pure story archetypes — 3 appear per day (odd/even rotation)
const STORY_ARCHETYPES = [
  {
    category: 'story-restless-afternoon',
    label: 'Story: The Restless Afternoon',
    archetype: 1,
    marketingLevel: 'none',
    hook: 'It was 3:47pm on a Tuesday.',
    hypnoticAngle: 'Overwhelm → Calm. A restless child finds their anchor. No product. Pure story.',
  },
  {
    category: 'story-discovery',
    label: 'Story: The Discovery',
    archetype: 2,
    marketingLevel: 'none',
    hook: 'I didn\'t think it would hold her attention for more than five minutes.',
    hypnoticAngle: 'Skepticism → Surprise. Parent tries something. Low expectations. Then: it works.',
  },
  {
    category: 'story-nostalgia',
    label: 'Story: Childhood Nostalgia',
    archetype: 3,
    marketingLevel: 'none',
    hook: 'Remember when a box of crayons felt like the whole world?',
    hypnoticAngle: 'Longing → Warmth. A timeless childhood feeling a child today still gets to have.',
  },
  {
    category: 'story-quiet-room',
    label: 'Story: The Quiet Room',
    archetype: 4,
    marketingLevel: 'none',
    hook: 'All she wanted was twenty minutes.',
    hypnoticAngle: 'Guilt → Relief. The exhale when screen time finally feels okay. No pitch.',
  },
  {
    category: 'story-curious-child',
    label: 'Story: The Curious Child',
    archetype: 5,
    marketingLevel: 'none',
    hook: 'He stared at it for four minutes.',
    hypnoticAngle: 'Wonder → Pride. The child is the hero. Solving, creating, asking to come back.',
  },
  {
    category: 'story-before-i-knew',
    label: 'Story: Before I Knew This',
    archetype: 6,
    marketingLevel: 'none',
    hook: 'For a long time, I felt like I was doing it wrong.',
    hypnoticAngle: 'Frustration → Clarity. The parent who found a better way. Story ends at the shift.',
  },
];

// Fixed story slots (1 marketing + 1 pattern interrupt)
const STORY_FIXED = [
  {
    category: 'story-parent-who-chose',
    label: 'Story: The Parent Who Chose',
    archetype: 7,
    marketingLevel: 'subtle',
    hook: 'She didn\'t just hand her daughter a tablet.',
    hypnoticAngle: 'Identity → Confidence. JoyMaze appears as the setting — once, naturally. Not the hero.',
    ctaNote: 'CTA in first comment only.',
  },
  {
    category: 'pattern-interrupt',
    label: 'Pattern Interrupt / Myth-Bust',
    archetype: null,
    marketingLevel: 'none',
    hook: 'Everything you think you know about kids and screens is wrong.',
    hypnoticAngle: 'Curiosity or myth-bust. Edutainment. No product mention. Pure value.',
  },
];

// ========== ACTIVITY ARCHETYPES (Slots 6-10) ==========
// Actual puzzles & printable activities. High save/share potential.
// See docs/CONTENT_ARCHETYPES.md A1–A5.

const ACTIVITY_TYPES = [
  {
    category: 'activity-maze',
    label: 'Activity: Maze Puzzle',
    archetype: 'A1',
    marketingLevel: 'watermark',
    hook: 'Can your kid find the path?',
    skill: 'Problem-solving, spatial reasoning, focus',
    difficulty: ['easy', 'medium', 'hard'],
  },
  {
    category: 'activity-word-search',
    label: 'Activity: Word Search',
    archetype: 'A2',
    marketingLevel: 'watermark',
    hook: 'Find all 8 words!',
    skill: 'Vocabulary, letter recognition, focus',
    difficulty: ['easy', 'medium', 'hard'],
  },
  {
    category: 'activity-matching',
    label: 'Activity: Matching / Spot-the-Difference',
    archetype: 'A3',
    marketingLevel: 'watermark',
    hook: 'Which two are exactly the same?',
    skill: 'Observation, memory, attention to detail',
    difficulty: ['easy', 'medium', 'hard'],
  },
  {
    category: 'activity-tracing',
    label: 'Activity: Tracing / Drawing',
    archetype: 'A4',
    marketingLevel: 'watermark',
    hook: 'Trace the path to help Joyo!',
    skill: 'Fine motor skills, hand-eye coordination',
    difficulty: ['easy', 'medium'],
  },
  {
    category: 'activity-quiz',
    label: 'Activity: Quiz / Visual Puzzle',
    archetype: 'A5',
    marketingLevel: 'watermark',
    hook: 'How many can YOU spot?',
    skill: 'Logic, counting, pattern recognition',
    difficulty: ['easy', 'medium', 'hard'],
  },
];

// Difficulty rotation: Easy on Mon/Thu, Medium on Tue/Fri, Hard on Wed/Sat
const DIFFICULTY_BY_DAY = ['easy', 'easy', 'medium', 'hard', 'easy', 'medium', 'hard'];
//                         Sun     Mon     Tue      Wed     Thu     Fri      Sat

function getDifficulty(date) {
  return DIFFICULTY_BY_DAY[date.getDay()];
}

// ========== DAILY MIX BUILDER ==========

// Build the 10-post daily mix: 5 story + 5 activity
function buildDailyMix(date) {
  const d = date || new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const isOdd = dayOfYear % 2 === 1;
  const isSunday = d.getDay() === 0;
  const difficulty = getDifficulty(d);

  if (isSunday) {
    return {
      label: 'Sunday — Best-of Repost (story + activity top performers)',
      isRepost: true,
      archetypes: [1, 2, 3, 4, 5, 6],
      activityTypes: ACTIVITY_TYPES.map(a => a.category),
      slots: [],
    };
  }

  // 3 rotating story archetypes (odd/even day)
  const storyRotation = isOdd
    ? STORY_ARCHETYPES.filter(s => [1, 3, 5].includes(s.archetype))
    : STORY_ARCHETYPES.filter(s => [2, 4, 6].includes(s.archetype));

  const storySlots = [
    ...storyRotation.map(s => ({ ...s, type: 'story' })),
    { ...STORY_FIXED[0], type: 'story' },    // Archetype 7
    { ...STORY_FIXED[1], type: 'story' },    // Pattern interrupt
  ];

  // 5 activity slots (all 5 types daily, difficulty rotates)
  const activitySlots = ACTIVITY_TYPES.map(a => ({
    ...a,
    type: 'activity',
    todayDifficulty: difficulty,
  }));

  return {
    label: `${isOdd ? 'Odd' : 'Even'} Day — Arch ${isOdd ? '1,3,5' : '2,4,6'} + Activities (${difficulty})`,
    isRepost: false,
    slots: [...storySlots, ...activitySlots],
  };
}

// Legacy flat list for backward compat with showStatus() category counting
const DAILY_MIX = [
  ...STORY_ARCHETYPES.map(s => ({ ...s, perDay: 1 })),
  ...STORY_FIXED.map(s => ({ ...s, perDay: 1 })),
  ...ACTIVITY_TYPES.map(a => ({ ...a, perDay: 1 })),
];

// Video plan — 1 per day when ready (Archetype 8: Kids Story)
const VIDEO_PLAN = {
  category: 'kids-story-video',
  label: 'Kids Story Video — Joyo\'s Story Corner',
  archetype: 8,
  marketingLevel: 'none',
  format: '5–8 images + text overlays + soft music, 45–60s',
  hook: 'Joyo narrates. Pure kids story. Zero product. Maximum shareability.',
  ctaNote: 'No CTA anywhere — not in post, not in comment. Story only.',
};

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
  console.log('Strategy: 5 story posts (3 pure + 1 marketing + 1 pattern interrupt) + 5 activity posts');
  console.log('Daily target: 10 image posts + 1 video (if ready)\n');

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
    const mix = buildDailyMix(date);

    console.log(`${days[i]} ${dateStr}${isToday ? ' (TODAY)' : ''}`);

    if (mix.isRepost) {
      console.log('  REPOST DAY — pick top performers from the week (story + activity)');
    } else {
      console.log(`  ${mix.label}`);
      console.log('  Story posts (5):');
      for (const item of mix.slots.filter(s => s.type === 'story')) {
        const tag = item.marketingLevel === 'none' ? '' :
          item.marketingLevel === 'subtle' ? ' [subtle]' : ' [direct]';
        console.log(`    - ${item.label}${tag}`);
      }
      console.log('  Activity posts (5):');
      for (const item of mix.slots.filter(s => s.type === 'activity')) {
        console.log(`    - ${item.label} [${item.todayDifficulty}]`);
      }
    }
    console.log(`  Video: ${VIDEO_PLAN.label} (if ready)`);
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
  const mix = buildDailyMix(tomorrow);

  console.log(`=== Content Plan: ${dayName} ${dateStr} ===\n`);

  if (mix.isRepost) {
    console.log('REPOST DAY — pick top performers from the week.');
    console.log('Check analytics: npm run analytics:report');
    return;
  }

  console.log(`${mix.label}\n`);

  console.log('Story Posts (5):');
  let idx = 1;
  for (const item of mix.slots.filter(s => s.type === 'story')) {
    const mktTag = item.marketingLevel === 'none' ? 'pure story' :
      item.marketingLevel === 'subtle' ? 'subtle marketing' : 'direct marketing';
    console.log(`  ${idx}. [${item.category}] ${item.label} (${mktTag})`);
    if (item.hook) console.log(`       Hook: "${item.hook}"`);
    if (item.hypnoticAngle) console.log(`       Angle: ${item.hypnoticAngle}`);
    if (item.ctaNote) console.log(`       CTA: ${item.ctaNote}`);
    idx++;
  }

  console.log('\nActivity Posts (5):');
  for (const item of mix.slots.filter(s => s.type === 'activity')) {
    console.log(`  ${idx}. [${item.category}] ${item.label} — ${item.todayDifficulty} difficulty`);
    console.log(`       Hook: "${item.hook}"`);
    console.log(`       Skill: ${item.skill}`);
    idx++;
  }

  console.log(`\nVideo (1 — if ready):`);
  console.log(`  [${VIDEO_PLAN.category}] ${VIDEO_PLAN.label}`);
  console.log(`       Format: ${VIDEO_PLAN.format}`);

  console.log('\nDaily workflow:');
  console.log('  1. npm run daily              # Archive old + generate prompts');
  console.log('  2. Generate images in Gemini  # 5 story + 5 activity images');
  console.log('  3. npm run import:raw         # Brand + queue');
  console.log('  4. npm run generate:captions  # AI captions');
  console.log('  5. npm run post               # Publish');
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

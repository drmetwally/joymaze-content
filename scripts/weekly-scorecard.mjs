#!/usr/bin/env node

/**
 * JoyMaze Content — Weekly Scorecard
 *
 * Reads engagement data from queue + archive metadata, computes save rate by
 * archetype category, and writes ranked weights to config/performance-weights.json.
 * generate-prompts.mjs reads this file via loadPerformanceContext() to bias future
 * prompt generation toward proven performers.
 *
 * Usage:
 *   node scripts/weekly-scorecard.mjs              # Compute + print scorecard
 *   node scripts/weekly-scorecard.mjs --save        # Compute + save to performance-weights.json
 *   node scripts/weekly-scorecard.mjs --days 30     # Use 30-day window (default: 7)
 *   node scripts/weekly-scorecard.mjs --min-posts 3 # Require ≥3 posts per category (default: 2)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const ARCHIVE_DIR = path.join(ROOT, 'output', 'archive');
const WEIGHTS_FILE = path.join(ROOT, 'config', 'performance-weights.json');

const args = process.argv.slice(2);
const SAVE = args.includes('--save');
const MONDAY_ONLY = args.includes('--monday-only');
const daysIdx = args.indexOf('--days');
const LOOKBACK_DAYS = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 7;
const minIdx = args.indexOf('--min-posts');
const MIN_POSTS = minIdx !== -1 ? parseInt(args[minIdx + 1], 10) : 2;

// ── Category labels for display ──
const CATEGORY_LABELS = {
  'pure-story-arch1':     'Arch 1 — The Restless Afternoon',
  'pure-story-arch2':     'Arch 2 — The Quiet Win',
  'pure-story-arch3':     'Arch 3 — The Before-and-After',
  'pure-story-arch4':     'Arch 4 — The Educational Moment',
  'pure-story-arch5':     'Arch 5 — The Social Proof',
  'pure-story-arch6':     'Arch 6 — The Transformation',
  'subtle-marketing':     'Arch 7 — Subtle Marketing (JoyMaze app)',
  'pattern-interrupt':    'Pattern Interrupt',
  'activity-maze':        'Activity — Maze',
  'activity-word-search': 'Activity — Word Search',
  'activity-matching':    'Activity — Matching',
  'activity-dot-to-dot':  'Activity — Dot-to-Dot',
  'activity-sudoku':      'Activity — Sudoku',
  'activity-coloring':    'Activity — Coloring',
  'activity-tracing':     'Activity — Tracing',
  'activity-quiz':        'Activity — Quiz / Visual Puzzle',
};

// ── Load all metadata from queue + archive ──
async function loadAllMetadata() {
  const items = [];

  async function scanDir(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith('.json')) {
          try { items.push(JSON.parse(await fs.readFile(fullPath, 'utf-8'))); } catch {}
        } else if (entry.isDirectory()) {
          // One level deep for archive date dirs
          try {
            const subFiles = (await fs.readdir(fullPath)).filter(f => f.endsWith('.json'));
            for (const f of subFiles) {
              try { items.push(JSON.parse(await fs.readFile(path.join(fullPath, f), 'utf-8'))); } catch {}
            }
          } catch {}
        }
      }
    } catch {}
  }

  await Promise.all([scanDir(QUEUE_DIR), scanDir(ARCHIVE_DIR)]);
  return items;
}

// ── Compute save rate per category ──
function computeWeights(items, lookbackDays, minPosts) {
  const cutoff = new Date(Date.now() - lookbackDays * 86400000).toISOString();

  // Filter to items with Pinterest analytics + within lookback window
  const withData = items.filter(i =>
    i.analytics?.pinterest?.lifetime &&
    i.generatedAt >= cutoff
  );

  if (withData.length === 0) return { categories: [], raw: [], lookbackDays, generatedAt: new Date().toISOString(), note: 'No analytics data yet.' };

  // Aggregate by category
  const byCategory = {};
  for (const item of withData) {
    const cat = item.category || 'unknown';
    if (!byCategory[cat]) byCategory[cat] = { saves: 0, impressions: 0, posts: 0, hooks: [] };
    const l = item.analytics.pinterest.lifetime;
    byCategory[cat].saves += l.saves || 0;
    byCategory[cat].impressions += l.impressions || 0;
    byCategory[cat].posts++;
    // Track top hooks for the weights file
    const hook = item.captions?.pinterest?.rawCaption?.split('\n')[0]?.slice(0, 100);
    const saveRate = l.impressions > 0 ? (l.saves / l.impressions) * 100 : 0;
    if (hook) byCategory[cat].hooks.push({ hook, saves: l.saves || 0, saveRate });
  }

  // Rank by save rate, require minimum posts threshold
  const ranked = Object.entries(byCategory)
    .filter(([, d]) => d.posts >= minPosts && d.impressions > 0)
    .map(([cat, d]) => {
      const saveRate = (d.saves / d.impressions) * 100;
      const topHook = d.hooks.sort((a, b) => b.saveRate - a.saveRate)[0]?.hook || null;
      return {
        category: cat,
        label: CATEGORY_LABELS[cat] || cat,
        posts: d.posts,
        saves: d.saves,
        impressions: d.impressions,
        saveRate: parseFloat(saveRate.toFixed(2)),
        topHook,
      };
    })
    .sort((a, b) => b.saveRate - a.saveRate);

  // Assign weight scores: top 3 = boost, bottom 2 = reduce, rest = neutral
  // Weights are multipliers for generate-prompts.mjs to use in performance context
  const categories = ranked.map((row, i) => ({
    ...row,
    weight: i < 3 ? 1.5 : i >= ranked.length - 2 ? 0.6 : 1.0,
    tier: i < 3 ? 'boost' : i >= ranked.length - 2 ? 'reduce' : 'neutral',
  }));

  return {
    categories,
    raw: withData.length,
    lookbackDays,
    minPosts,
    generatedAt: new Date().toISOString(),
  };
}

// ── Print scorecard table ──
function printScorecard(weights) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  JoyMaze Weekly Scorecard — last ${weights.lookbackDays} days`);
  console.log(`  Items with analytics: ${weights.raw}   Generated: ${weights.generatedAt?.slice(0, 16)}`);
  console.log(`${'─'.repeat(72)}`);

  if (weights.note) {
    console.log(`\n  ${weights.note}`);
    console.log('  Run npm run analytics:collect to populate analytics data.\n');
    return;
  }

  if (weights.categories.length === 0) {
    console.log(`\n  Not enough data yet (need ≥${weights.minPosts} posts per category with impressions).\n`);
    return;
  }

  const header = '  Tier     | Category                              | Posts | Save Rate | Weight';
  console.log(header);
  console.log('  ' + '-'.repeat(70));

  for (const row of weights.categories) {
    const tier = row.tier === 'boost' ? 'BOOST  ' : row.tier === 'reduce' ? 'REDUCE ' : 'neutral';
    const label = (row.label || row.category).padEnd(38).slice(0, 38);
    const posts = String(row.posts).padEnd(6);
    const rate = `${row.saveRate.toFixed(1)}%`.padEnd(10);
    const weight = `×${row.weight.toFixed(1)}`;
    console.log(`  ${tier}| ${label}| ${posts}| ${rate}| ${weight}`);
  }

  console.log(`${'─'.repeat(72)}`);

  const boostList = weights.categories.filter(c => c.tier === 'boost').map(c => c.label || c.category).join(', ');
  const reduceList = weights.categories.filter(c => c.tier === 'reduce').map(c => c.label || c.category).join(', ');
  if (boostList) console.log(`\n  Double down on: ${boostList}`);
  if (reduceList) console.log(`  Scale back:     ${reduceList}`);
  console.log();
}

async function main() {
  if (MONDAY_ONLY && new Date().getDay() !== 1) {
    console.log(`📊 Scorecard skipped (runs Mondays only — today is ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]}). Run npm run scorecard to force.`);
    return;
  }

  console.log('\n📊 JoyMaze Weekly Scorecard\n');
  console.log(`Loading content metadata (last ${LOOKBACK_DAYS} days)...`);

  const items = await loadAllMetadata();
  console.log(`  ${items.length} metadata items loaded.`);

  const weights = computeWeights(items, LOOKBACK_DAYS, MIN_POSTS);
  printScorecard(weights);

  if (SAVE) {
    await fs.mkdir(path.join(ROOT, 'config'), { recursive: true });

    // Load existing weights to merge (preserve categories not in this window)
    let existing = {};
    try {
      existing = JSON.parse(await fs.readFile(WEIGHTS_FILE, 'utf-8'));
    } catch {}

    const output = {
      ...existing,
      ...weights,
      updatedAt: new Date().toISOString(),
    };

    await fs.writeFile(WEIGHTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`  Saved to: ${WEIGHTS_FILE}`);

    if (weights.categories.length > 0) {
      console.log('  generate-prompts.mjs will read this on next run via loadPerformanceContext().');
    }
  } else {
    console.log('  Run with --save to write performance-weights.json.');
  }

  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

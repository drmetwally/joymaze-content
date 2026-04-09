#!/usr/bin/env node

/**
 * JoyMaze Content — Analytics Report
 *
 * Reads engagement data from content metadata and generates performance reports.
 * Shows top performers, category breakdown, and trends.
 *
 * Usage:
 *   node scripts/analytics-report.mjs              # Last 7 days
 *   node scripts/analytics-report.mjs --days 30    # Last 30 days
 *   node scripts/analytics-report.mjs --save       # Save report to output/
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const ARCHIVE_DIR = path.join(ROOT, 'output', 'archive');

const args = process.argv.slice(2);
const SAVE_REPORT = args.includes('--save');
const daysIdx = args.indexOf('--days');
const LOOKBACK_DAYS = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 7;

// ========== Data Loading ==========

async function loadAllMetadata() {
  const items = [];

  // Queue
  try {
    const files = (await fs.readdir(QUEUE_DIR)).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        items.push(JSON.parse(await fs.readFile(path.join(QUEUE_DIR, f), 'utf-8')));
      } catch { /* skip invalid */ }
    }
  } catch { /* no queue */ }

  // Archive
  try {
    const dateDirs = await fs.readdir(ARCHIVE_DIR);
    for (const dateDir of dateDirs) {
      const dirPath = path.join(ARCHIVE_DIR, dateDir);
      try {
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) continue;
        const files = (await fs.readdir(dirPath)).filter(f => f.endsWith('.json'));
        for (const f of files) {
          try {
            items.push(JSON.parse(await fs.readFile(path.join(dirPath, f), 'utf-8')));
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
  } catch { /* no archive */ }

  return items;
}

function getAnalytics(item) {
  // Merge analytics from all platforms into a single object
  const a = { impressions: 0, saves: 0, pinClicks: 0, outboundClicks: 0 };

  if (item.analytics?.pinterest?.lifetime) {
    const p = item.analytics.pinterest.lifetime;
    a.impressions += p.impressions || 0;
    a.saves += p.saves || 0;
    a.pinClicks += p.pinClicks || 0;
    a.outboundClicks += p.outboundClicks || 0;
  }

  // Future: add Instagram, X analytics here

  return a;
}

// ========== Report Generation ==========

function generateReport(items, days) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const lines = [];

  // Filter to items with analytics data
  const withAnalytics = items.filter(i =>
    i.analytics && i.generatedAt >= cutoff
  );

  // All posted items (for context)
  const allPosted = items.filter(i =>
    i.platforms?.pinterest?.status === 'posted' && i.generatedAt >= cutoff
  );

  lines.push(`# JoyMaze Analytics Report`);
  lines.push(`Generated: ${new Date().toISOString().slice(0, 16)}`);
  lines.push(`Period: Last ${days} days`);
  lines.push(`Items with analytics: ${withAnalytics.length} / ${allPosted.length} posted`);
  lines.push('');

  if (withAnalytics.length === 0) {
    lines.push('No analytics data available yet.');
    lines.push('');
    lines.push('To collect analytics:');
    lines.push('  1. Ensure Pinterest Standard API access is approved');
    lines.push('  2. Update .env: PINTEREST_API_BASE=https://api.pinterest.com');
    lines.push('  3. Run: npm run analytics:collect');
    lines.push('');
    return lines.join('\n');
  }

  // Compute per-item metrics
  const scored = withAnalytics.map(item => {
    const a = getAnalytics(item);
    const saveRate = a.impressions > 0 ? (a.saves / a.impressions) * 100 : 0;
    return { ...item, metrics: a, saveRate };
  });

  // ---- Top Performers ----
  lines.push('## Top Performers (by saves)');
  lines.push('');
  const bySaves = [...scored].sort((a, b) => b.metrics.saves - a.metrics.saves).slice(0, 5);
  for (let i = 0; i < bySaves.length; i++) {
    const item = bySaves[i];
    const m = item.metrics;
    lines.push(`  ${i + 1}. ${item.id}`);
    lines.push(`     Category: ${item.categoryName || item.category}`);
    lines.push(`     ${m.impressions} impressions | ${m.saves} saves | ${m.pinClicks} clicks | ${item.saveRate.toFixed(1)}% save rate`);
    // Show the hook (first line of Pinterest caption)
    const hook = item.captions?.pinterest?.rawCaption?.split('\n')[0]?.slice(0, 80);
    if (hook) lines.push(`     Hook: "${hook}"`);
    lines.push('');
  }

  // ---- Top by Impressions ----
  lines.push('## Top Performers (by impressions)');
  lines.push('');
  const byImpressions = [...scored].sort((a, b) => b.metrics.impressions - a.metrics.impressions).slice(0, 5);
  for (let i = 0; i < byImpressions.length; i++) {
    const item = byImpressions[i];
    const m = item.metrics;
    lines.push(`  ${i + 1}. ${item.id} — ${m.impressions} impressions, ${m.saves} saves (${item.saveRate.toFixed(1)}%)`);
  }
  lines.push('');

  // ---- Category Performance ----
  lines.push('## Performance by Category');
  lines.push('');
  const byCategory = {};
  for (const item of scored) {
    const cat = item.category || 'unknown';
    if (!byCategory[cat]) byCategory[cat] = { items: [], totalImpressions: 0, totalSaves: 0, totalClicks: 0 };
    byCategory[cat].items.push(item);
    byCategory[cat].totalImpressions += item.metrics.impressions;
    byCategory[cat].totalSaves += item.metrics.saves;
    byCategory[cat].totalClicks += item.metrics.pinClicks;
  }

  const categoryRows = Object.entries(byCategory)
    .map(([cat, data]) => ({
      category: cat,
      count: data.items.length,
      avgImpressions: Math.round(data.totalImpressions / data.items.length),
      avgSaves: (data.totalSaves / data.items.length).toFixed(1),
      saveRate: data.totalImpressions > 0
        ? ((data.totalSaves / data.totalImpressions) * 100).toFixed(1)
        : '0.0',
    }))
    .sort((a, b) => parseFloat(b.saveRate) - parseFloat(a.saveRate));

  lines.push('  Category                     | Count | Avg Impr | Avg Saves | Save Rate');
  lines.push('  -----------------------------|-------|----------|-----------|----------');
  for (const row of categoryRows) {
    const cat = row.category.padEnd(29);
    lines.push(`  ${cat}| ${String(row.count).padEnd(6)}| ${String(row.avgImpressions).padEnd(9)}| ${row.avgSaves.padStart(9)} | ${row.saveRate}%`);
  }
  lines.push('');

  // ---- Hook Analysis ----
  lines.push('## Hook Patterns');
  lines.push('');
  const topHooks = scored
    .filter(i => i.captions?.pinterest?.rawCaption)
    .sort((a, b) => b.saveRate - a.saveRate)
    .slice(0, 5);

  lines.push('  Best-performing hooks:');
  for (const item of topHooks) {
    const hook = item.captions.pinterest.rawCaption.split('\n')[0].slice(0, 70);
    lines.push(`    "${hook}..." (${item.saveRate.toFixed(1)}% save rate)`);
  }
  lines.push('');

  const bottomHooks = scored
    .filter(i => i.captions?.pinterest?.rawCaption && i.metrics.impressions > 10)
    .sort((a, b) => a.saveRate - b.saveRate)
    .slice(0, 3);

  if (bottomHooks.length > 0) {
    lines.push('  Weakest hooks:');
    for (const item of bottomHooks) {
      const hook = item.captions.pinterest.rawCaption.split('\n')[0].slice(0, 70);
      lines.push(`    "${hook}..." (${item.saveRate.toFixed(1)}% save rate)`);
    }
    lines.push('');
  }

  // ---- Overall Stats ----
  lines.push('## Overall Summary');
  lines.push('');
  const totals = scored.reduce((acc, i) => {
    acc.impressions += i.metrics.impressions;
    acc.saves += i.metrics.saves;
    acc.clicks += i.metrics.pinClicks;
    acc.outbound += i.metrics.outboundClicks;
    return acc;
  }, { impressions: 0, saves: 0, clicks: 0, outbound: 0 });

  const overallSaveRate = totals.impressions > 0
    ? ((totals.saves / totals.impressions) * 100).toFixed(1) : '0.0';

  lines.push(`  Total impressions:    ${totals.impressions}`);
  lines.push(`  Total saves:          ${totals.saves}`);
  lines.push(`  Total pin clicks:     ${totals.clicks}`);
  lines.push(`  Total outbound clicks: ${totals.outbound}`);
  lines.push(`  Overall save rate:    ${overallSaveRate}% (industry avg: 2-5%)`);
  lines.push(`  Content pieces:       ${scored.length}`);
  lines.push('');

  return lines.join('\n');
}

// ========== Main ==========

async function main() {
  console.log('\n=== JoyMaze Analytics Report ===\n');

  const items = await loadAllMetadata();
  console.log(`Loaded ${items.length} content items.\n`);

  const report = generateReport(items, LOOKBACK_DAYS);
  console.log(report);

  if (SAVE_REPORT) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const outputPath = path.join(ROOT, 'output', `analytics-report-${dateStr}.md`);
    await fs.writeFile(outputPath, report);
    console.log(`Report saved to: ${outputPath}\n`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

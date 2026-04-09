#!/usr/bin/env node

/**
 * JoyMaze Content — Analytics Collector
 *
 * Fetches engagement metrics from platform APIs for posted content,
 * stores results in each item's metadata JSON.
 *
 * Usage:
 *   node scripts/collect-analytics.mjs                      # Collect from all platforms
 *   node scripts/collect-analytics.mjs --platform pinterest  # Pinterest only
 *   node scripts/collect-analytics.mjs --dry-run             # Show what would be fetched
 *   node scripts/collect-analytics.mjs --days 14             # Fetch for last 14 days (default: 7)
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const ARCHIVE_DIR = path.join(ROOT, 'output', 'archive');
const ANALYTICS_LOG = path.join(ROOT, 'output', 'analytics.jsonl');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const platIdx = args.indexOf('--platform');
const FILTER_PLATFORM = platIdx !== -1 ? args[platIdx + 1] : null;
const daysIdx = args.indexOf('--days');
const LOOKBACK_DAYS = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 7;

// ========== Pinterest Analytics ==========

const PINTEREST_API_BASE = process.env.PINTEREST_API_BASE || 'https://api-sandbox.pinterest.com';

function isSandbox() {
  return PINTEREST_API_BASE.includes('sandbox');
}

async function refreshPinterestToken() {
  const appId = process.env.PINTEREST_APP_ID;
  const appSecret = process.env.PINTEREST_APP_SECRET;
  const refreshToken = process.env.PINTEREST_REFRESH_TOKEN;

  if (!appId || !appSecret || !refreshToken) return null;

  const response = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
  });

  if (!response.ok) return null;

  const data = await response.json();
  console.log('\n  Pinterest token refreshed successfully.');
  console.log(`  New access token: ${data.access_token?.slice(0, 20)}...`);
  console.log('  UPDATE your .env file with the new PINTEREST_ACCESS_TOKEN above.\n');
  return data.access_token;
}

async function fetchPinterestPinAnalytics(pinId, startDate, endDate, token) {
  const url = `${PINTEREST_API_BASE}/v5/pins/${pinId}/analytics` +
    `?start_date=${startDate}&end_date=${endDate}` +
    `&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (response.status === 401) {
    // Try token refresh
    const newToken = await refreshPinterestToken();
    if (newToken) {
      const retry = await fetch(url.replace(PINTEREST_API_BASE, 'https://api.pinterest.com'), {
        headers: { 'Authorization': `Bearer ${newToken}` },
      });
      if (retry.ok) return retry.json();
    }
    throw new Error('Pinterest token expired. Refresh failed — update .env manually.');
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pinterest API ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

function parsePinterestAnalytics(apiResponse) {
  // Pinterest returns: { all: { daily_metrics: [...], summary_metrics: {...} } }
  const data = apiResponse?.all || apiResponse;

  const lifetime = {
    impressions: 0,
    saves: 0,
    pinClicks: 0,
    outboundClicks: 0,
  };

  const daily = [];

  if (data.daily_metrics) {
    for (const day of data.daily_metrics) {
      const entry = {
        date: day.date,
        impressions: day.data_status === 'READY' ? (day.metrics?.IMPRESSION || 0) : 0,
        saves: day.data_status === 'READY' ? (day.metrics?.SAVE || 0) : 0,
        pinClicks: day.data_status === 'READY' ? (day.metrics?.PIN_CLICK || 0) : 0,
        outboundClicks: day.data_status === 'READY' ? (day.metrics?.OUTBOUND_CLICK || 0) : 0,
      };
      daily.push(entry);
      lifetime.impressions += entry.impressions;
      lifetime.saves += entry.saves;
      lifetime.pinClicks += entry.pinClicks;
      lifetime.outboundClicks += entry.outboundClicks;
    }
  } else if (data.summary_metrics) {
    lifetime.impressions = data.summary_metrics.IMPRESSION || 0;
    lifetime.saves = data.summary_metrics.SAVE || 0;
    lifetime.pinClicks = data.summary_metrics.PIN_CLICK || 0;
    lifetime.outboundClicks = data.summary_metrics.OUTBOUND_CLICK || 0;
  }

  return { lifetime, daily };
}

// ========== Metadata Scanner ==========

async function scanMetadataFiles() {
  const files = [];

  // Scan queue
  try {
    const queueFiles = (await fs.readdir(QUEUE_DIR)).filter(f => f.endsWith('.json'));
    for (const f of queueFiles) {
      files.push({ path: path.join(QUEUE_DIR, f), source: 'queue' });
    }
  } catch { /* no queue */ }

  // Scan archive subdirectories
  try {
    const archiveDates = await fs.readdir(ARCHIVE_DIR);
    for (const dateDir of archiveDates) {
      const dirPath = path.join(ARCHIVE_DIR, dateDir);
      try {
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) continue;
        const archiveFiles = (await fs.readdir(dirPath)).filter(f => f.endsWith('.json'));
        for (const f of archiveFiles) {
          files.push({ path: path.join(dirPath, f), source: `archive/${dateDir}` });
        }
      } catch { /* skip */ }
    }
  } catch { /* no archive */ }

  return files;
}

// ========== ASMR Hook Performance Updater ==========

const ASMR_DIR = path.join(ROOT, 'output', 'asmr');

/**
 * After analytics are collected, scan queue + archive for ASMR video metadata.
 * Aggregate impressions/saves/clicks per (asmrFolder, hookText) pair and write
 * back to each folder's hook-performance.json so selectHook() can weight toward
 * higher-performing hooks on the next render.
 */
async function updateAsmrHookPerformance() {
  const items = [];

  async function scanDir(dir) {
    try {
      const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try { items.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8'))); } catch {}
      }
    } catch {}
  }

  await scanDir(QUEUE_DIR);
  try {
    const dateDirs = await fs.readdir(ARCHIVE_DIR);
    for (const d of dateDirs) {
      const dp = path.join(ARCHIVE_DIR, d);
      try { if ((await fs.stat(dp)).isDirectory()) await scanDir(dp); } catch {}
    }
  } catch {}

  // Filter to ASMR videos that have a hookText, asmrFolder, and some analytics
  const asmrItems = items.filter(i =>
    i.format === 'asmr' && i.hookText && i.asmrFolder
  );

  if (asmrItems.length === 0) return;

  // Aggregate analytics per folder → per hook
  // Collect from all platforms that have data
  const folderHookData = {}; // { [folder]: { [hookText]: { impressions, saves, clicks } } }

  for (const item of asmrItems) {
    const folder = item.asmrFolder;
    const hook = item.hookText;
    if (!folderHookData[folder]) folderHookData[folder] = {};
    if (!folderHookData[folder][hook]) folderHookData[folder][hook] = { impressions: 0, saves: 0, clicks: 0 };

    const agg = folderHookData[folder][hook];

    // Pinterest
    const pa = item.analytics?.pinterest?.lifetime;
    if (pa) {
      agg.impressions += pa.impressions || 0;
      agg.saves      += pa.saves || 0;
      agg.clicks     += (pa.pinClicks || 0) + (pa.outboundClicks || 0);
    }

    // X / Twitter
    const xa = item.analytics?.x;
    if (xa) {
      agg.impressions += xa.impressions || 0;
      agg.clicks      += xa.engagements || 0;
    }
  }

  // Write updated hook-performance.json for each ASMR folder
  let updated = 0;
  for (const [folderName, hookMap] of Object.entries(folderHookData)) {
    const perfPath = path.join(ASMR_DIR, folderName, 'hook-performance.json');

    let perf = { hooks: [], lastUpdated: null };
    try { perf = JSON.parse(await fs.readFile(perfPath, 'utf-8')); } catch {}

    for (const [hookText, agg] of Object.entries(hookMap)) {
      let entry = perf.hooks.find(h => h.text === hookText);
      if (!entry) {
        entry = { text: hookText, uses: 0, impressions: 0, saves: 0, clicks: 0 };
        perf.hooks.push(entry);
      }
      // Replace with fresh aggregate (re-calculated from source data each run)
      entry.impressions = agg.impressions;
      entry.saves       = agg.saves;
      entry.clicks      = agg.clicks;
    }

    perf.lastUpdated = new Date().toISOString().slice(0, 10);
    try {
      await fs.writeFile(perfPath, JSON.stringify(perf, null, 2));
      updated++;
    } catch { /* folder may not exist yet */ }
  }

  if (updated > 0) {
    console.log(`\nHook performance updated for ${updated} ASMR folder(s).`);
    console.log('  Next ASMR render will auto-weight toward best-performing hooks.');
  }
}

// ========== Main ==========

async function main() {
  console.log('\n=== JoyMaze Analytics Collector ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Lookback: ${LOOKBACK_DAYS} days`);
  if (FILTER_PLATFORM) console.log(`Platform filter: ${FILTER_PLATFORM}`);
  console.log('');

  // Check for sandbox mode
  if (isSandbox() && !DRY_RUN) {
    console.log('Pinterest is in SANDBOX mode — analytics API is not available.');
    console.log('Once Standard access is approved, update PINTEREST_API_BASE in .env to:');
    console.log('  PINTEREST_API_BASE=https://api.pinterest.com');
    console.log('\nRunning in dry-run mode instead.\n');
  }

  const pinterestToken = process.env.PINTEREST_ACCESS_TOKEN;
  if (!pinterestToken && !DRY_RUN) {
    console.log('No PINTEREST_ACCESS_TOKEN in .env. Cannot collect Pinterest analytics.');
  }

  // Date range
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
  console.log(`Date range: ${startDate} to ${endDate}\n`);

  // Scan all metadata files
  const metadataFiles = await scanMetadataFiles();
  console.log(`Found ${metadataFiles.length} content item(s) across queue + archive.\n`);

  let collected = 0;
  let skipped = 0;
  let errors = 0;
  const dailySummary = { impressions: 0, saves: 0, pinClicks: 0, outboundClicks: 0 };

  for (const { path: filePath, source } of metadataFiles) {
    let metadata;
    try {
      metadata = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    } catch { skipped++; continue; }

    // Pinterest analytics
    if ((!FILTER_PLATFORM || FILTER_PLATFORM === 'pinterest') &&
        metadata.platforms?.pinterest?.status === 'posted' &&
        metadata.platforms?.pinterest?.postId) {

      const pinId = metadata.platforms.pinterest.postId;
      const postedAt = metadata.platforms.pinterest.postedAt;

      // Skip pins less than 24h old (analytics not yet available)
      if (postedAt) {
        const ageHours = (Date.now() - new Date(postedAt).getTime()) / 3600000;
        if (ageHours < 24) {
          console.log(`  Skip: ${metadata.id} (posted ${Math.round(ageHours)}h ago — too recent)`);
          skipped++;
          continue;
        }
      }

      console.log(`  ${metadata.id} [${source}] pin:${pinId}`);

      if (DRY_RUN || isSandbox()) {
        console.log(`    [${DRY_RUN ? 'DRY RUN' : 'SANDBOX'}] Would fetch: GET /v5/pins/${pinId}/analytics`);
        skipped++;
        continue;
      }

      try {
        const apiResponse = await fetchPinterestPinAnalytics(pinId, startDate, endDate, pinterestToken);
        const analytics = parsePinterestAnalytics(apiResponse);

        // Store in metadata
        metadata.analytics = metadata.analytics || {};
        metadata.analytics.pinterest = {
          lastFetched: new Date().toISOString(),
          ...analytics,
        };

        // Save back to file
        await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));

        const l = analytics.lifetime;
        console.log(`    Impressions: ${l.impressions} | Saves: ${l.saves} | Clicks: ${l.pinClicks} | Outbound: ${l.outboundClicks}`);

        dailySummary.impressions += l.impressions;
        dailySummary.saves += l.saves;
        dailySummary.pinClicks += l.pinClicks;
        dailySummary.outboundClicks += l.outboundClicks;
        collected++;

        // Rate limiting: 200ms between calls
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.log(`    Error: ${err.message}`);
        errors++;
      }
    } else {
      skipped++;
    }
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Collected: ${collected} | Skipped: ${skipped} | Errors: ${errors}`);

  if (collected > 0) {
    console.log(`\nTotals (last ${LOOKBACK_DAYS} days):`);
    console.log(`  Impressions:    ${dailySummary.impressions}`);
    console.log(`  Saves:          ${dailySummary.saves}`);
    console.log(`  Pin clicks:     ${dailySummary.pinClicks}`);
    console.log(`  Outbound clicks: ${dailySummary.outboundClicks}`);

    const saveRate = dailySummary.impressions > 0
      ? ((dailySummary.saves / dailySummary.impressions) * 100).toFixed(1)
      : '0.0';
    console.log(`  Save rate:      ${saveRate}%`);

    // Append to analytics log
    const logEntry = {
      date: endDate,
      pinsAnalyzed: collected,
      ...dailySummary,
      saveRate: parseFloat(saveRate),
    };
    await fs.appendFile(ANALYTICS_LOG, JSON.stringify(logEntry) + '\n');
    console.log(`\nAppended to ${ANALYTICS_LOG}`);
  }

  // Update ASMR hook performance so next render auto-weights toward best hooks
  await updateAsmrHookPerformance();

  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

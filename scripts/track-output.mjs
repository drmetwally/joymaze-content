#!/usr/bin/env node

/**
 * track-output.mjs — Daily output counter
 *
 * Counts today's generated content (images, story videos, ASMR videos)
 * and appends one entry to output/daily-output-log.json.
 *
 * Zero API cost. Idempotent — re-running overwrites today's entry.
 * Phase 0 gate: 30 consecutive days with images≥10, storyVideos≥10, asmrVideos≥10.
 *
 * Usage:
 *   node scripts/track-output.mjs           # Count and append
 *   node scripts/track-output.mjs --report  # Print last 7 days, no write
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const LOG_PATH = path.join(OUTPUT_DIR, 'daily-output-log.json');
const REPORT_ONLY = process.argv.includes('--report');

const today = new Date().toISOString().slice(0, 10);

// Count image queue JSONs in today's archive folder.
// Excludes x-text posts and video queue entries.
async function countImages() {
  const archiveDir = path.join(OUTPUT_DIR, 'archive', today);
  try {
    const files = await fs.readdir(archiveDir);
    return files.filter(f =>
      f.endsWith('.json') &&
      !f.includes('story-ep') &&
      !f.includes('-asmr-') &&
      !f.startsWith('x-text-')
    ).length;
  } catch { return 0; }
}

// Count video mp4 files in output/videos/ matching a keyword prefix for today.
async function countVideos(keyword) {
  const videosDir = path.join(OUTPUT_DIR, 'videos');
  try {
    const files = await fs.readdir(videosDir);
    return files.filter(f =>
      f.startsWith(today) &&
      f.includes(keyword) &&
      f.endsWith('.mp4')
    ).length;
  } catch { return 0; }
}

// Count consecutive days at the gate threshold.
// Returns how many trailing days (including today) all meet the gate.
function countStreak(log) {
  let streak = 0;
  // Walk backwards from most recent entry
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.images >= 10 && e.storyVideos >= 10 && e.asmrVideos >= 10) {
      streak++;
    } else {
      break; // streak broken
    }
  }
  return streak;
}

async function report(log) {
  const recent = log.slice(-7);
  console.log('\nDaily Output Log — last 7 days');
  console.log('─'.repeat(56));
  console.log('Date        │ Images │ Stories │ ASMR │ Gate');
  console.log('─'.repeat(56));
  for (const e of recent) {
    const gate = e.images >= 10 && e.storyVideos >= 10 && e.asmrVideos >= 10;
    console.log(
      `${e.date}  │  ${String(e.images).padStart(4)}  │   ${String(e.storyVideos).padStart(4)}  │  ${String(e.asmrVideos).padStart(3)} │ ${gate ? 'MET' : '---'}`
    );
  }
  console.log('─'.repeat(56));
  const streak = countStreak(log);
  console.log(`Streak: ${streak}/30 consecutive gate days\n`);
}

async function main() {
  // Load existing log
  let log = [];
  try {
    log = JSON.parse(await fs.readFile(LOG_PATH, 'utf-8'));
    if (!Array.isArray(log)) log = [];
  } catch { /* first run */ }

  if (REPORT_ONLY) {
    await report(log);
    return;
  }

  // Count today's output
  const [images, storyVideos, asmrVideos] = await Promise.all([
    countImages(),
    countVideos('story'),
    countVideos('asmr'),
  ]);

  // Upsert today's entry
  log = log.filter(e => e.date !== today);
  log.push({ date: today, images, storyVideos, asmrVideos, loggedAt: new Date().toISOString() });
  log = log.slice(-90); // keep last 90 days

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(LOG_PATH, JSON.stringify(log, null, 2));

  // Summary
  const gate = images >= 10 && storyVideos >= 10 && asmrVideos >= 10;
  const streak = countStreak(log);
  console.log(`\nDaily Output — ${today}`);
  console.log(`  Images:       ${images}/10  ${images >= 10 ? 'OK' : '--'}`);
  console.log(`  Story videos: ${storyVideos}/10  ${storyVideos >= 10 ? 'OK' : '--'}`);
  console.log(`  ASMR videos:  ${asmrVideos}/10  ${asmrVideos >= 10 ? 'OK' : '--'}`);
  console.log(`  Phase 0 gate: ${gate ? 'MET' : 'not yet'} | Streak: ${streak}/30 days`);
  console.log(`  Saved: output/daily-output-log.json\n`);
}

main().catch(err => { console.error(err.message); process.exit(1); });

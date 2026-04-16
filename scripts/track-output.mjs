#!/usr/bin/env node

/**
 * track-output.mjs — Daily output counter
 *
 * Counts today's generated content and appends one entry to output/daily-output-log.json.
 *
 * Zero API cost. Idempotent — re-running overwrites today's entry.
 *
 * Phase 0 gate (updated 2026-04-13):
 *   images ≥ 10  AND  asmrVideos ≥ 1  AND  storyVideos ≥ 1  AND  xTextPosts ≥ 4
 *   30 consecutive days meeting all four thresholds = Phase 0 cleared.
 *
 * Usage:
 *   node scripts/track-output.mjs                                           # Count today
 *   node scripts/track-output.mjs --report                                  # Print last 7 days, no write
 *   node scripts/track-output.mjs --backfill 2026-04-15 --images 10 --x 4  # Manual entry for a past day
 *
 * Backfill flags (all optional, default 0):
 *   --backfill YYYY-MM-DD   date to log
 *   --images N              image count
 *   --story N               story video count
 *   --asmr N                ASMR video count
 *   --challenge N           challenge video count
 *   --x N                   X text post count
 *   --note "text"           optional note appended to the entry
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

// Parse --backfill mode
const backfillIdx = process.argv.indexOf('--backfill');
const BACKFILL_DATE = backfillIdx !== -1 ? process.argv[backfillIdx + 1] : null;

function argInt(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? parseInt(process.argv[i + 1], 10) || 0 : 0;
}
function argStr(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

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
      !f.includes('-challenge-') &&
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

// Count X text posts in today's queue file.
// Counts total entries (generated) — covers both manual warmup (not posted:true) and automation.
async function countXTextPosts() {
  const queuePath = path.join(OUTPUT_DIR, 'queue', `x-text-${today}.json`);
  try {
    const data = JSON.parse(await fs.readFile(queuePath, 'utf-8'));
    return Array.isArray(data) ? data.length : 0;
  } catch { return 0; }
}

// Phase 0 gate check — updated 2026-04-13
// images ≥ 10, asmrVideos ≥ 1, storyVideos ≥ 1, xTextPosts ≥ 4
function meetsGate(e) {
  return e.images >= 10 && e.asmrVideos >= 1 && e.storyVideos >= 1 && (e.xTextPosts ?? 0) >= 4;
}

// Count consecutive days at the gate threshold.
// Returns how many trailing days (including today) all meet the gate.
function countStreak(log) {
  let streak = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    if (meetsGate(log[i])) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

async function report(log) {
  const recent = log.slice(-7);
  console.log('\nDaily Output Log — last 7 days');
  console.log('─'.repeat(70));
  console.log('Date        │ Images │ Stories │ ASMR │ Challenge │ X Posts │ Gate');
  console.log('─'.repeat(78));
  for (const e of recent) {
    const gate = meetsGate(e);
    const xp   = e.xTextPosts ?? 0;
    const cv   = e.challengeVideos ?? 0;
    console.log(
      `${e.date}  │  ${String(e.images).padStart(4)}  │   ${String(e.storyVideos).padStart(4)}  │  ${String(e.asmrVideos).padStart(3)} │     ${String(cv).padStart(4)}    │   ${String(xp).padStart(4)}  │ ${gate ? 'MET' : '---'}`
    );
  }
  console.log('─'.repeat(70));
  const streak = countStreak(log);
  console.log(`Gate: images≥10, ASMR≥1, stories≥1, X text posts≥4`);
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

  let targetDate, images, storyVideos, asmrVideos, challengeVideos, xTextPosts;

  if (BACKFILL_DATE) {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(BACKFILL_DATE)) {
      console.error('Error: --backfill date must be YYYY-MM-DD');
      process.exit(1);
    }
    targetDate     = BACKFILL_DATE;
    images         = argInt('--images');
    storyVideos    = argInt('--story');
    asmrVideos     = argInt('--asmr');
    challengeVideos = argInt('--challenge');
    xTextPosts     = argInt('--x');
    console.log(`\nBackfill mode — logging ${targetDate} manually`);
  } else {
    // Count today's output from files
    targetDate = today;
    [images, storyVideos, asmrVideos, challengeVideos, xTextPosts] = await Promise.all([
      countImages(),
      countVideos('story'),
      countVideos('asmr'),
      countVideos('challenge'),
      countXTextPosts(),
    ]);
  }

  // Upsert entry (replaces existing entry for that date if present)
  const entry = { date: targetDate, images, storyVideos, asmrVideos, challengeVideos, xTextPosts, loggedAt: new Date().toISOString() };
  if (BACKFILL_DATE) entry.note = argStr('--note') ?? 'backfill — manually posted';
  log = log.filter(e => e.date !== targetDate);
  log.push(entry);
  log.sort((a, b) => a.date.localeCompare(b.date));
  log = log.slice(-90); // keep last 90 days

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(LOG_PATH, JSON.stringify(log, null, 2));

  // Summary
  const gate = meetsGate(entry);
  const streak = countStreak(log);
  console.log(`\nDaily Output — ${targetDate}${BACKFILL_DATE ? ' (backfill)' : ''}`);
  console.log(`  Images:          ${images}/10  ${images >= 10 ? 'OK' : '--'}`);
  console.log(`  Story videos:    ${storyVideos}/1   ${storyVideos >= 1 ? 'OK' : '--'}`);
  console.log(`  ASMR videos:     ${asmrVideos}/1   ${asmrVideos >= 1 ? 'OK' : '--'}`);
  console.log(`  Challenge videos: ${challengeVideos}     (bonus)`);
  console.log(`  X text posts:    ${xTextPosts}/4   ${xTextPosts >= 4 ? 'OK' : '--'}`);
  console.log(`  Phase 0 gate: ${gate ? 'MET' : 'not yet'} | Streak: ${streak}/30 days`);
  console.log(`  Saved: output/daily-output-log.json\n`);
}

main().catch(err => { console.error(err.message); process.exit(1); });

#!/usr/bin/env node

/**
 * JoyMaze Content — Daily Scheduler
 *
 * Scheduler responsibility: timing only.
 * Canonical generation responsibility: `npm run daily`.
 *
 * This wrapper exists so scheduled runs and manual runs share the same underlying pipeline.
 * Usage:
 *   node scripts/daily-scheduler.mjs        # Start scheduler daemon
 *   node scripts/daily-scheduler.mjs --now  # Run `npm run daily` immediately
 */

import cron from 'node-cron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const args = process.argv.slice(2);
const RUN_NOW = args.includes('--now');

function timestamp() {
  return new Date().toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}

async function runDailyCommand() {
  const passthrough = args.filter((arg) => arg !== '--now' && arg !== '--post-now');
  log(`Running canonical daily pipeline: npm run daily${passthrough.length ? ` -- ${passthrough.join(' ')}` : ''}`);
  try {
    const cmdArgs = ['run', 'daily'];
    if (passthrough.length) cmdArgs.push('--', ...passthrough);
    const { stdout, stderr } = await execFileAsync(NPM, cmdArgs, {
      cwd: ROOT,
      env: { ...process.env },
      timeout: 0,
    });
    if (stdout.trim()) stdout.trim().split('\n').forEach((line) => log(`  ${line}`));
    if (stderr.trim()) stderr.trim().split('\n').forEach((line) => log(`  [stderr] ${line}`));
    log('Canonical daily pipeline completed.');
  } catch (err) {
    log(`ERROR in npm run daily: ${err.message}`);
    if (err.stdout) err.stdout.split('\n').forEach((line) => line && log(`  ${line}`));
    if (err.stderr) err.stderr.split('\n').forEach((line) => line && log(`  [err] ${line}`));
    throw err;
  }
}

// ── 4 AM Creative Posting Job ─────────────────────────────────────────────────
// Runs at 4:00 AM Cairo time (Africa/Cairo = UTC+2, no DST).
// Hits peak US engagement window (6–11 PM Pacific).
// Only posts — no generation. Safe to run while you sleep.

// 4 AM job is now retired — posting is handled by the hourly Task Scheduler runner.
// This stub is kept so the cron schedule below doesn't error.
async function runPostingJob() {
  log('4 AM cron: posting now handled by hourly Task Scheduler (post-content.mjs --scheduled)');
  await appendLog('4am cron: no-op — hourly runner handles posting');
}

// ── Main ─────────────────────────────────────────────────────────────────────

const POST_NOW = args.includes('--post-now');

if (RUN_NOW) {
  runDailyCommand().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
} else if (POST_NOW) {
  // Immediate posting-only run — test the 4am job manually
  runPostingJob().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
} else {
  log('JoyMaze Daily Scheduler started.');
  log('Job 1 — 4:00 AM Cairo  : No-op (posting now handled by hourly Task Scheduler runner)');
  log('Job 2 — 9:00 AM Riyadh : Run npm run daily');
  log('Scheduler role: timing wrapper only, canonical generation flow lives in npm run daily');
  log('');
  log('POSTING: Handled by hourly Task Scheduler jobs (set up separately):');
  log('  Creative posts: node scripts/post-content.mjs --scheduled --limit 2  (every hour)');
  log('  X text posts:   node scripts/post-x-scheduled.mjs                    (every hour)');
  log('');
  log('Keep this terminal open, or set it up as a Task Scheduler job.');
  log('To test morning job: node scripts/daily-scheduler.mjs --now');
  log('');

  // 4 AM Cairo — creative posting (hits 6–11 PM US Pacific peak window)
  cron.schedule('0 4 * * *', () => {
    runPostingJob().catch(err => log(`Unhandled error in posting job: ${err.message}`));
  }, {
    timezone: 'Africa/Cairo',
  });

  // 9 AM Riyadh — run canonical daily pipeline
  cron.schedule('0 9 * * *', () => {
    runDailyCommand().catch(err => log(`Unhandled error in daily job: ${err.message}`));
  }, {
    timezone: 'Asia/Riyadh',
  });

  log('Waiting for next scheduled job...');
}

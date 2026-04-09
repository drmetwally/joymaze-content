#!/usr/bin/env node

/**
 * JoyMaze Content — Daily Scheduler
 *
 * Runs the automated morning workflow at 9:00 AM:
 *   1. Archive yesterday's queue (archive-queue.mjs)
 *   2. Generate today's image prompts (generate-prompts.mjs --save)
 *   3. Generate today's story idea (generate-story-ideas.mjs) [--with-story]
 *   4. Generate today's ASMR brief (generate-asmr-brief.mjs) [--with-asmr]
 *   5. Generate today's X text posts (generate-x-posts.mjs)
 *   6. Collect + report analytics [--with-analytics, or auto every 3 days]
 *   7. Auto-post any captioned items in queue to all live platforms
 *
 * By the time you open your computer:
 *   - output/prompts/ has today's image prompts ready
 *   - output/queue/x-text-YYYY-MM-DD.json has 8 text posts queued with hourly schedule
 *   - Any backlogged queue items are already live on all platforms
 *
 * Usage:
 *   node scripts/daily-scheduler.mjs                  # Start scheduler (runs at 9:00 AM daily)
 *   node scripts/daily-scheduler.mjs --now             # Run immediately (test/manual trigger)
 *   node scripts/daily-scheduler.mjs --with-story      # Also generate a story idea
 *   node scripts/daily-scheduler.mjs --with-analytics  # Force analytics run today
 *
 * To run as a persistent background process:
 *   Windows: Use Task Scheduler to run this script at login
 *   Or keep a terminal open with: node scripts/daily-scheduler.mjs
 */

import cron from 'node-cron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const RUN_NOW           = args.includes('--now');
const WITH_STORY        = !args.includes('--no-story');   // runs by default; skip with --no-story
const WITH_ASMR_BRIEF   = !args.includes('--no-asmr');    // runs by default; skip with --no-asmr
const WITH_ANALYTICS    = args.includes('--with-analytics');

const ANALYTICS_EVERY_N_DAYS = 3;  // Run analytics automatically every 3 days
const STATE_FILE = path.join(ROOT, 'output', 'scheduler-state.json');

const NODE = process.execPath; // Path to current node binary

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

// ── Scheduler state (tracks last analytics run date) ─────────────────────────

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

async function saveState(updates) {
  const current = await loadState();
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify({ ...current, ...updates }, null, 2));
}

function daysSince(isoDateStr) {
  if (!isoDateStr) return Infinity;
  return (Date.now() - new Date(isoDateStr).getTime()) / 86_400_000;
}

// ── Script runner ─────────────────────────────────────────────────────────────

async function runScript(scriptName, extraArgs = [], timeoutMs = 120_000) {
  const scriptPath = path.join(ROOT, 'scripts', scriptName);
  log(`Running: ${scriptName} ${extraArgs.join(' ')}`);

  try {
    const { stdout, stderr } = await execFileAsync(NODE, [scriptPath, ...extraArgs], {
      cwd: ROOT,
      env: { ...process.env },
      timeout: timeoutMs,
    });
    if (stdout.trim()) {
      stdout.trim().split('\n').forEach(line => log(`  ${line}`));
    }
    if (stderr.trim()) {
      stderr.trim().split('\n').forEach(line => log(`  [stderr] ${line}`));
    }
    log(`Done: ${scriptName}`);
    return true;
  } catch (err) {
    log(`ERROR in ${scriptName}: ${err.message}`);
    if (err.stdout) err.stdout.split('\n').forEach(line => log(`  ${line}`));
    if (err.stderr) err.stderr.split('\n').forEach(line => log(`  [err] ${line}`));
    return false;
  }
}

async function appendLog(entry) {
  const logPath = path.join(ROOT, 'output', 'scheduler.log');
  const line = `[${new Date().toISOString()}] ${entry}\n`;
  try {
    await fs.appendFile(logPath, line, 'utf-8');
  } catch {}
}

async function runDailyJob() {
  log('=== Daily Morning Job Starting ===');
  await appendLog('Daily job started');

  const state = await loadState();
  const today = new Date().toISOString().slice(0, 10);
  let stepNum = 0;
  const isMonday = new Date().getDay() === 1;
  const totalSteps = 3  // archive + prompts + x-text-posts (always run)
    + (WITH_STORY      ? 1 : 0)
    + (WITH_ASMR_BRIEF ? 1 : 0)
    + (WITH_ANALYTICS || daysSince(state.lastAnalyticsRun) >= ANALYTICS_EVERY_N_DAYS ? 1 : 0)
    + (isMonday ? 3 : 0);  // pinterest token refresh + intelligence-refresh + apply-intelligence
  // Posting is excluded from this job — handled by hourly Task Scheduler

  // Step 1: Archive previous day's queue
  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Archiving yesterday's queue...`);
  const archiveOk = await runScript('archive-queue.mjs');
  if (!archiveOk) log('Archive had issues — continuing anyway');

  // Monday: token refresh + analytics + scorecard + trends + intelligence refresh BEFORE prompt generation
  // This ensures today's prompts are generated with the freshest possible intelligence
  if (isMonday) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: [Monday] Refreshing Pinterest OAuth token...`);
    const pinterestRefreshOk = await runScript('refresh-pinterest-token.mjs', [], 30_000);
    if (pinterestRefreshOk) {
      log('  Pinterest access + refresh tokens updated in .env');
      await appendLog('Pinterest token refresh OK');
    } else {
      log('  Pinterest token refresh failed — run manually: npm run pinterest:refresh');
      log('  WARNING: token expires ~30 days from last manual refresh — do not ignore this');
      await appendLog('Pinterest token refresh FAILED');
    }

    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: [Monday] Collecting fresh analytics for intelligence...`);
    const mondayAnalyticsOk = await runScript('collect-analytics.mjs', [], 300_000);
    if (mondayAnalyticsOk) {
      await runScript('analytics-report.mjs', [], 60_000);
      await runScript('weekly-scorecard.mjs', ['--save'], 60_000);
      await saveState({ lastAnalyticsRun: today });
      await appendLog('Monday analytics + scorecard OK');
    } else {
      log('  Monday analytics failed — intelligence will use last known data');
    }
    await runScript('collect-trends.mjs', ['--monday-only'], 120_000);

    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: [Monday] Refreshing content intelligence...`);
    const intelligenceOk = await runScript('intelligence-refresh.mjs', [], 300_000);
    if (intelligenceOk) {
      log('  Intelligence written to config/content-intelligence.json');
      await appendLog('Intelligence refresh OK');
      const forceFlag = process.env.INTELLIGENCE_FORCE_APPLY === 'true' ? ['--force-apply'] : [];
      const applyOk = await runScript('apply-intelligence.mjs', forceFlag, 60_000);
      if (applyOk) {
        await appendLog('Intelligence applied to dynamic pools OK');
        log('  Dynamic pools updated — today\'s prompts will use fresh intelligence');
      } else {
        log('  Apply step skipped (entropy block?) — run: npm run intelligence:apply');
      }
    } else {
      log('  Intelligence refresh failed — prompts will use last week\'s pools');
      await appendLog('Intelligence refresh FAILED');
    }
  }

  // Step 2: Generate today's image prompts
  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Generating today's image prompts...`);
  const promptsOk = await runScript('generate-prompts.mjs', ['--save']);
  if (promptsOk) {
    log('Image prompts saved to output/prompts/ — ready for you!');
    await appendLog('Image prompts generated OK');
  } else {
    log('Prompt generation failed — check GROQ_API_KEY and retry manually: npm run generate:prompts');
    await appendLog('Prompt generation FAILED');
  }

  // Step 3: Generate story idea (default on; skip with --no-story)
  if (WITH_STORY) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating story idea for next episode...`);
    const storyOk = await runScript('generate-story-ideas.mjs', ['--save']);
    if (storyOk) {
      log('Story idea scaffolded in output/stories/');
      await appendLog('Story idea generated OK');
    } else {
      log('Story idea generation failed — run manually: npm run generate:story:idea');
      await appendLog('Story idea generation FAILED');
    }
  }

  // Step 4: Generate ASMR brief (default on; skip with --no-asmr)
  if (WITH_ASMR_BRIEF) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating today's ASMR brief...`);
    const asmrOk = await runScript('generate-asmr-brief.mjs', ['--save']);
    if (asmrOk) {
      log('ASMR brief ready in output/asmr/ — open brief.md for your Gemini prompts');
      await appendLog('ASMR brief generated OK');
    } else {
      log('ASMR brief failed — run manually: npm run generate:asmr:brief');
      await appendLog('ASMR brief FAILED');
    }
  }

  // Step N: Generate X text posts for the day (always runs — independent of images/captions)
  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Generating today's X text posts...`);
  const xPostsOk = await runScript('generate-x-posts.mjs', [], 60_000);
  if (xPostsOk) {
    log('X text posts saved to output/queue/x-text-YYYY-MM-DD.json — post-x-scheduled.mjs will drip them hourly');
    await appendLog('X text posts generated OK');
  } else {
    log('X text post generation failed — run manually: npm run x:generate');
    await appendLog('X text posts FAILED');
  }

  // Step N: Analytics — runs every 3 days automatically, or on --with-analytics
  const shouldRunAnalytics = WITH_ANALYTICS || daysSince(state.lastAnalyticsRun) >= ANALYTICS_EVERY_N_DAYS;
  if (shouldRunAnalytics) {
    stepNum++;
    const daysSinceStr = state.lastAnalyticsRun
      ? `${Math.floor(daysSince(state.lastAnalyticsRun))} days since last run`
      : 'first run';
    log(`Step ${stepNum}/${totalSteps}: Collecting + reporting analytics (${daysSinceStr})...`);
    // Analytics fetches platform APIs — allow 5 min
    const analyticsOk = await runScript('collect-analytics.mjs', [], 300_000);
    if (analyticsOk) {
      await runScript('analytics-report.mjs', [], 60_000);
      await saveState({ lastAnalyticsRun: today });
      await appendLog('Analytics collected OK');
      log(`Next analytics run in ${ANALYTICS_EVERY_N_DAYS} days.`);
    } else {
      log('Analytics collection failed — run manually: npm run analytics');
      await appendLog('Analytics FAILED');
    }
  } else {
    const daysUntil = Math.ceil(ANALYTICS_EVERY_N_DAYS - daysSince(state.lastAnalyticsRun));
    log(`Analytics: skipping (next auto-run in ${daysUntil} day(s) — use --with-analytics to force)`);
  }

  // Posting is now handled by the hourly Task Scheduler runner (post-content.mjs --scheduled)
  // This job only does generation. The hourly runner drips content throughout the day.
  log('Note: posting handled by hourly Task Scheduler (post-content.mjs --scheduled --limit 2)');
  await appendLog('Daily generation complete — posting handled by hourly runner');

  log('=== Daily Morning Job Complete ===');
  log('');
  log('Your next steps:');
  log('  1. Open output/prompts/ — read today\'s image prompts (5 inspiration + 5 activity slots)');
  log('     Inspiration folders: output/raw/fact-card/, challenge/, quiet/, printable/, identity/');
  log('     Activity folders:    output/raw/maze/, wordsearch/, matching/, tracing/, quiz/');
  log('  2. Generate images in Gemini/ChatGPT → save to the matching subfolder');
  log('  3. npm run import:raw            ← brands images + assigns scheduledHour (6am–9pm spread)');
  log('  4. npm run generate:captions     ← generates captions for all platforms');
  log('  5. Hourly Task Scheduler posts them automatically throughout the day');
  log('  X text posts: dripped hourly via post-x-scheduled.mjs (already running)');
  await appendLog('Daily job complete');
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
  // Immediate full run — useful for testing or manual trigger
  runDailyJob().catch(err => {
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
  log('Job 2 — 9:00 AM Riyadh : Generate prompts, ASMR brief, X posts, analytics');
  log(`ASMR brief:   ${WITH_ASMR_BRIEF ? 'ON  (skip with --no-asmr)'  : 'OFF (--no-asmr)'}`);
  log(`Analytics:    auto every ${ANALYTICS_EVERY_N_DAYS} days${WITH_ANALYTICS ? ' + forced today (--with-analytics)' : ''}`);
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

  // 9 AM Riyadh — daily generation + backlog posting
  cron.schedule('0 9 * * *', () => {
    runDailyJob().catch(err => log(`Unhandled error in daily job: ${err.message}`));
  }, {
    timezone: 'Asia/Riyadh',
  });

  log('Waiting for next scheduled job...');
}

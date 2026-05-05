#!/usr/bin/env node

/**
 * JoyMaze Content — Canonical Daily Pipeline
 *
 * This is the single source of truth for the full daily generation flow.
 * Manual runs use `npm run daily`.
 * Scheduled runs should call that same command rather than duplicating logic.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;

const args = process.argv.slice(2);
const WITH_STORY         = !args.includes('--no-story');
const WITH_PUZZLE_POSTS  = !args.includes('--no-puzzle-posts');
const WITH_STORY_REEL    = !args.includes('--no-story-reel');
const WITH_ASMR_BRIEF    = !args.includes('--no-asmr');
const WITH_CHALLENGE     = !args.includes('--no-challenge');
const WITH_ANIMAL_BRIEF  = !args.includes('--no-animal-brief');
const WITH_ANALYTICS     = args.includes('--with-analytics');

const ANALYTICS_EVERY_N_DAYS = 3;
const STATE_FILE = path.join(ROOT, 'output', 'scheduler-state.json');

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

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function getLatestStoryFolder() {
  const storiesDir = path.join(ROOT, 'output', 'stories');
  try {
    const entries = await fs.readdir(storiesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && /^ep\d+/.test(e.name));
    if (dirs.length === 0) return null;
    const withMtime = await Promise.all(
      dirs.map(async (d) => {
        const full = path.join(storiesDir, d.name);
        const stat = await fs.stat(full).catch(() => null);
        return stat ? { full, mtime: stat.mtimeMs } : null;
      })
    );
    const sorted = withMtime.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
    return sorted[0]?.full ?? null;
  } catch {
    return null;
  }
}

async function runScript(scriptName, extraArgs = [], timeoutMs = 120_000) {
  const scriptPath = path.join(ROOT, 'scripts', scriptName);
  log(`Running: ${scriptName} ${extraArgs.join(' ')}`);

  try {
    const { stdout, stderr } = await execFileAsync(NODE, [scriptPath, ...extraArgs], {
      cwd: ROOT,
      env: { ...process.env },
      timeout: timeoutMs,
    });
    if (stdout.trim()) stdout.trim().split('\n').forEach((line) => log(`  ${line}`));
    if (stderr.trim()) stderr.trim().split('\n').forEach((line) => log(`  [stderr] ${line}`));
    log(`Done: ${scriptName}`);
    return true;
  } catch (err) {
    log(`ERROR in ${scriptName}: ${err.message}`);
    if (err.stdout) err.stdout.split('\n').forEach((line) => line && log(`  ${line}`));
    if (err.stderr) err.stderr.split('\n').forEach((line) => line && log(`  [err] ${line}`));
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

async function main() {
  log('=== Daily Morning Job Starting ===');
  await appendLog('Daily job started');

  const state = await loadState();
  const today = new Date().toISOString().slice(0, 10);
  let stepNum = 0;
  const isMonday = new Date().getDay() === 1;
  const totalSteps = 3
    + (WITH_PUZZLE_POSTS ? 1 : 0)
    + (WITH_STORY ? 1 : 0)
    + (WITH_STORY && WITH_STORY_REEL ? 1 : 0)
    + (WITH_ASMR_BRIEF ? 1 : 0)
    + (WITH_CHALLENGE ? 1 : 0)
    + (WITH_ANIMAL_BRIEF ? 1 : 0)
    + (WITH_ANALYTICS || daysSince(state.lastAnalyticsRun) >= ANALYTICS_EVERY_N_DAYS ? 1 : 0)
    + (isMonday ? 3 : 0);

  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Archiving yesterday's queue...`);
  const archiveOk = await runScript('archive-queue.mjs');
  if (!archiveOk) log('Archive had issues, continuing anyway');

  if (isMonday) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: [Monday] Refreshing Pinterest OAuth token...`);
    const pinterestRefreshOk = await runScript('refresh-pinterest-token.mjs', [], 30_000);
    if (pinterestRefreshOk) {
      log('  Pinterest access + refresh tokens updated in .env');
      await appendLog('Pinterest token refresh OK');
    } else {
      log('  Pinterest token refresh failed, run manually: npm run pinterest:refresh');
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
      log('  Monday analytics failed, intelligence will use last known data');
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
        log('  Dynamic pools updated, today\'s prompts will use fresh intelligence');
      } else {
        log('  Apply step skipped, run: npm run intelligence:apply');
      }
    } else {
      log('  Intelligence refresh failed, prompts will use last week\'s pools');
      await appendLog('Intelligence refresh FAILED');
    }
  }

  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Generating today's image prompts...`);
  const promptsOk = await runScript('generate-prompts.mjs', ['--save']);
  if (promptsOk) {
    log('Image prompts saved to output/prompts/');
    await appendLog('Image prompts generated OK');
  } else {
    log('Prompt generation failed, retry manually: npm run generate:prompts');
    await appendLog('Prompt generation FAILED');
  }

  if (WITH_PUZZLE_POSTS) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating today's deterministic puzzle posts...`);
    const manifestPath = path.join('output', 'prompts', `activity-manifest-${today}.json`);
    const puzzlePostsOk = await runScript('generate-puzzle-image-post.mjs', ['--manifest', manifestPath, '--all-supported'], 180_000);
    if (puzzlePostsOk) {
      log('Puzzle posts generated from today\'s activity manifest');
      await appendLog('Puzzle posts generated OK');
    } else {
      log('Puzzle post generation failed, run manually: npm run puzzlepost:generate -- --manifest ' + manifestPath + ' --all-supported');
      await appendLog('Puzzle posts generation FAILED');
    }
  }

  if (WITH_STORY) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating story idea for next episode...`);
    const storyOk = await runScript('generate-story-ideas.mjs', ['--save']);
    if (storyOk) {
      log('Story idea scaffolded in output/stories/');
      await appendLog('Story idea generated OK');
    } else {
      log('Story idea generation failed, run manually: npm run generate:story:idea');
      await appendLog('Story idea generation FAILED');
    }
  }

  if (WITH_STORY && WITH_STORY_REEL) {
    const storyFolder = await getLatestStoryFolder();
    if (storyFolder && await pathExists(path.join(storyFolder, 'story.json'))) {
      stepNum++;
      log(`Step ${stepNum}/${totalSteps}: Generating Story Reel V2 (Imagen -> Remotion)...`);
      log(`  Story: ${path.relative(ROOT, storyFolder)}`);
      const reelImagesOk = await runScript('generate-story-reel-images.mjs', ['--story', storyFolder], 180_000);
      if (reelImagesOk) {
        const reelAudioOk = await runScript('generate-story-reel-audio.mjs', ['--story', storyFolder], 60_000);
        if (reelAudioOk) log('Story Reel V2 audio generated');
        else log('Story Reel V2 audio skipped, proceeding without narration');

        const reelRenderOk = await runScript('render-video.mjs', ['--comp', 'StoryReelV2', '--story', storyFolder], 180_000);
        if (reelRenderOk) {
          log('Story Reel V2 rendered -> output/videos/');
          await appendLog('Story Reel V2 render OK');
        } else {
          log('Story Reel V2 render failed, run manually: node scripts/render-video.mjs --comp StoryReelV2 --story ' + path.relative(ROOT, storyFolder));
          await appendLog('Story Reel V2 render FAILED');
        }
      } else {
        log('Story Reel V2 image gen failed, run manually: npm run generate:story:reel-images -- --story ' + path.relative(ROOT, storyFolder));
        await appendLog('Story Reel V2 image gen FAILED');
      }
    } else {
      log('Story Reel V2: no story folder found, skipping');
    }
  }

  if (WITH_ASMR_BRIEF) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating today's ASMR brief...`);
    const asmrOk = await runScript('generate-asmr-brief.mjs', ['--save']);
    if (asmrOk) {
      log('ASMR brief ready in output/asmr/');
      await appendLog('ASMR brief generated OK');
    } else {
      log('ASMR brief failed, run manually: npm run generate:asmr:brief');
      await appendLog('ASMR brief FAILED');
    }
  }

  if (WITH_CHALLENGE) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating today's challenge brief...`);
    const challengeOk = await runScript('generate-challenge-brief.mjs', ['--save']);
    if (challengeOk) {
      log('Challenge brief ready in output/challenge/');
      await appendLog('Challenge brief generated OK');
    } else {
      log('Challenge brief failed, run manually: npm run brief:challenge');
      await appendLog('Challenge brief FAILED');
    }
  }

  if (WITH_ANIMAL_BRIEF) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating animal facts brief for next song short...`);
    const animalBriefOk = await runScript('generate-animal-facts-brief.mjs', ['--save'], 120_000);
    if (animalBriefOk) {
      log('Animal brief ready in output/longform/animal/');
      await appendLog('Animal facts brief generated OK');
    } else {
      log('Animal brief failed, run manually: npm run longform:animal:plan:save');
      await appendLog('Animal facts brief FAILED');
    }
  }

  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Generating today's X text posts...`);
  const xPostsOk = await runScript('generate-x-posts.mjs', [], 60_000);
  if (xPostsOk) {
    log('X text posts saved to output/queue/x-text-YYYY-MM-DD.json');
    await appendLog('X text posts generated OK');
  } else {
    log('X text post generation failed, run manually: npm run x:generate');
    await appendLog('X text posts FAILED');
  }

  const shouldRunAnalytics = WITH_ANALYTICS || daysSince(state.lastAnalyticsRun) >= ANALYTICS_EVERY_N_DAYS;
  if (shouldRunAnalytics) {
    stepNum++;
    const daysSinceStr = state.lastAnalyticsRun ? `${Math.floor(daysSince(state.lastAnalyticsRun))} days since last run` : 'first run';
    log(`Step ${stepNum}/${totalSteps}: Collecting + reporting analytics (${daysSinceStr})...`);
    const analyticsOk = await runScript('collect-analytics.mjs', [], 300_000);
    if (analyticsOk) {
      await runScript('analytics-report.mjs', [], 60_000);
      await saveState({ lastAnalyticsRun: today });
      await appendLog('Analytics collected OK');
      log(`Next analytics run in ${ANALYTICS_EVERY_N_DAYS} days.`);
    } else {
      log('Analytics collection failed, run manually: npm run analytics');
      await appendLog('Analytics FAILED');
    }
  } else {
    const daysUntil = Math.ceil(ANALYTICS_EVERY_N_DAYS - daysSince(state.lastAnalyticsRun));
    log(`Analytics: skipping (next auto-run in ${daysUntil} day(s), use --with-analytics to force)`);
  }

  log('Note: posting handled by hourly Task Scheduler (post-content.mjs --scheduled --limit 2)');
  await appendLog('Daily generation complete — posting handled by hourly runner');

  log('=== Daily Morning Job Complete ===');
  await appendLog('Daily job complete');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

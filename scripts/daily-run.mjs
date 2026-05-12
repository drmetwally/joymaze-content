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
const DRY_RUN = args.includes('--dry-run');
const WITH_STORY         = !args.includes('--no-story');
const WITH_PUZZLE_POSTS  = !args.includes('--no-puzzle-posts');
const WITH_COLORING      = !args.includes('--no-coloring');
const WITH_DOTTODOT      = !args.includes('--no-dottodot');
const WITH_MATCHING      = !args.includes('--no-matching');
const FORCE_PUZZLES      = args.includes('--force-puzzles');
const WITH_INSPIRATION_IMAGES = !args.includes('--no-inspiration-images');
const WITH_STORY_REEL    = !args.includes('--no-story-reel');
const WITH_ASMR_BRIEF    = !args.includes('--no-asmr');
const WITH_CHALLENGE     = !args.includes('--no-challenge');
const WITH_ANIMAL_BRIEF  = !args.includes('--no-animal-brief');
const WITH_ANIMAL_REEL   = !args.includes('--no-animal-reel');
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

async function getLatestAsmrFolder() {
  const asmrDir = path.join(ROOT, 'output', 'asmr');
  try {
    const entries = await fs.readdir(asmrDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    if (dirs.length === 0) return null;
    const withMtime = await Promise.all(
      dirs.map(async (d) => {
        const full = path.join(asmrDir, d.name);
        const stat = await fs.stat(full).catch(() => null);
        return stat ? { full, name: d.name, mtime: stat.mtimeMs } : null;
      })
    );
    const sorted = withMtime.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
    return sorted[0] ? { full: sorted[0].full, name: sorted[0].name } : null;
  } catch {
    return null;
  }
}

async function getLatestChallengeFolder() {
  const challengeDir = path.join(ROOT, 'output', 'challenge');
  try {
    const entries = await fs.readdir(challengeDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && e.name !== 'generated-activity');
    if (dirs.length === 0) return null;
    const withMtime = await Promise.all(
      dirs.map(async (d) => {
        const full = path.join(challengeDir, d.name);
        const stat = await fs.stat(full).catch(() => null);
        return stat ? { full, name: d.name, mtime: stat.mtimeMs } : null;
      })
    );
    const sorted = withMtime.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
    return sorted[0] ? { full: sorted[0].full, name: sorted[0].name } : null;
  } catch {
    return null;
  }
}

async function getLatestAnimalFolder() {
  const animalDir = path.join(ROOT, 'output', 'longform', 'animal');
  try {
    const entries = await fs.readdir(animalDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && /^ep\d+/.test(e.name));
    if (dirs.length === 0) return null;
    const withMtime = await Promise.all(
      dirs.map(async (d) => {
        const full = path.join(animalDir, d.name);
        const stat = await fs.stat(full).catch(() => null);
        return stat ? { full, name: d.name, mtime: stat.mtimeMs } : null;
      })
    );
    const sorted = withMtime.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
    return sorted[0] ? { full: sorted[0].full, name: sorted[0].name } : null;
  } catch {
    return null;
  }
}

async function runScript(scriptName, extraArgs = [], timeoutMs = 120_000) {
  const scriptPath = path.join(ROOT, 'scripts', scriptName);
  const allArgs = [...extraArgs, ...(DRY_RUN ? ['--dry-run'] : [])];
  log(`Running: ${scriptName} ${allArgs.join(' ')}`);

  try {
    const { stdout, stderr } = await execFileAsync(NODE, [scriptPath, ...allArgs], {
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

const LOCK_FILE = path.join(ROOT, 'output', '.daily-lock');

async function main() {
  if (DRY_RUN) log('[DRY RUN] — child scripts will receive --dry-run flag');

  try {
    const existing = await fs.readFile(LOCK_FILE, 'utf-8');
    const pid = Number(existing.trim());
    let running = false;
    try { process.kill(pid, 0); running = true; } catch {}
    if (running) {
      log(`Daily run already in progress (PID ${pid}), exiting.`);
      process.exit(0);
    }
  } catch {}
  await fs.mkdir(path.join(ROOT, 'output'), { recursive: true });
  await fs.writeFile(LOCK_FILE, String(process.pid), 'utf-8');

  try {
    await runMain();
  } finally {
    await fs.unlink(LOCK_FILE).catch(() => {});
  }
}

async function runMain() {
  log('=== Daily Morning Job Starting ===');
  await appendLog('Daily job started');

  const state = await loadState();
  const today = new Date().toISOString().slice(0, 10);
  let stepNum = 0;
  const isMonday = new Date().getDay() === 1;
  const totalSteps = 4
    + (WITH_INSPIRATION_IMAGES ? 1 : 0)
    + (WITH_PUZZLE_POSTS ? 1 : 0)
    + (WITH_COLORING ? 1 : 0)
    + (WITH_DOTTODOT ? 1 : 0)
    + (WITH_MATCHING ? 1 : 0)
    + (WITH_STORY ? 1 : 0)
    + (WITH_STORY && WITH_STORY_REEL ? 1 : 0)
    + (WITH_ASMR_BRIEF ? 1 : 0)
    + (WITH_CHALLENGE ? 1 : 0)
    + (WITH_ANIMAL_BRIEF ? 1 : 0)
    + (WITH_ANIMAL_BRIEF && WITH_ANIMAL_REEL ? 1 : 0)
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

  if (WITH_INSPIRATION_IMAGES) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Auto-generating 5 inspiration images via Imagen...`);
    const inspirationOk = await runScript('generate-images-vertex.mjs', ['--inspiration-only'], 300_000);
    if (inspirationOk) {
      log('Inspiration images generated OK');
      await appendLog('Inspiration images generated OK');
    } else {
      log('Inspiration image generation had issues (quota or API error), continuing');
      await appendLog('Inspiration images generation WARNING/FAILED');
    }
  }

  const manifestPath = path.join('output', 'prompts', `activity-manifest-${today}.json`);
  let manifest = null;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(ROOT, manifestPath), 'utf8'));
  } catch (err) {
    if (!DRY_RUN) log(`Warning: Could not read manifest at ${manifestPath}: ${err.message}`);
  }

  if (WITH_PUZZLE_POSTS) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating today's deterministic puzzle posts (Maze/Wordsearch)...`);
    const forceFlag = FORCE_PUZZLES ? ['--force'] : [];
    // Only target maze and wordsearch in this legacy block
    const puzzlePostsOk = await runScript('generate-puzzle-image-post.mjs', ['--manifest', manifestPath, '--category', 'activity-maze', ...forceFlag], 180_000)
      && await runScript('generate-puzzle-image-post.mjs', ['--manifest', manifestPath, '--category', 'activity-word-search', ...forceFlag], 180_000);

    if (puzzlePostsOk) {
      log('Maze/Wordsearch puzzle posts generated OK');
      await appendLog('Maze/Wordsearch puzzle posts generated OK');
    } else {
      log('Maze/Wordsearch puzzle post generation failed');
      await appendLog('Maze/Wordsearch puzzle posts FAILED');
    }
  }

  async function handlePuzzleType(type, category, script, flag) {
    if (!flag || !manifest) return;
    const slot = (manifest.activitySlots || []).find(s => s.category === category);
    if (!slot) return;

    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating ${type} puzzle post...`);
    try {
      const forceFlag = FORCE_PUZZLES ? ['--force'] : [];
      const assetOk = await runScript(script, ['--imagen', '--theme', slot.theme, '--difficulty', slot.difficulty, '--slug', slot.slug, ...forceFlag], 120_000);
      if (assetOk) {
        const postOk = await runScript('generate-puzzle-image-post.mjs', ['--type', type, '--slug', slot.slug, ...forceFlag], 120_000);
        if (postOk) {
          log(`${type} puzzle post generated OK`);
          await appendLog(`${type} puzzle post generated OK`);
        } else {
          log(`${type} post rendering failed`);
        }
      } else {
        log(`${type} asset generation failed`);
      }
    } catch (err) {
      log(`ERROR in ${type} pipeline: ${err.message}`);
    }
  }

  await handlePuzzleType('coloring', 'activity-coloring', 'generate-coloring-assets.mjs', WITH_COLORING);
  await handlePuzzleType('dot-to-dot', 'activity-dot-to-dot', 'generate-imagen-dottodot-assets.mjs', WITH_DOTTODOT);
  await handlePuzzleType('matching', 'activity-matching', 'generate-matching-assets.mjs', WITH_MATCHING);

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
      // Audio runs first — it may expand story.json slide count; images must reflect final slide list
      const reelAudioOk = await runScript('generate-story-reel-audio.mjs', ['--story', storyFolder], 300_000);
      if (reelAudioOk) {
        log('Story Reel V2 audio generated');
        const reelImagesOk = await runScript('generate-story-reel-images.mjs', ['--story', storyFolder, '--continue-on-error'], 180_000);
        if (reelImagesOk) {
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
        log('Story Reel V2 audio FAILED — run manually: node scripts/generate-story-reel-audio.mjs --story ' + path.relative(ROOT, storyFolder));
        await appendLog('Story Reel V2 audio FAILED');
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
      const asmrFolder = await getLatestAsmrFolder();
      if (asmrFolder) {
        log(`ASMR: folder identified -> ${asmrFolder.name}`);
        const activityJsonPath = path.join(asmrFolder.full, 'activity.json');
        try {
          const activity = JSON.parse(await fs.readFile(activityJsonPath, 'utf-8'));
          const type = activity.type || activity.revealType;
          log(`ASMR type: ${type}`);

          let engineScript = '';
          let extractScript = '';
          if (type === 'maze') {
            engineScript = 'generate-maze-assets.mjs';
            extractScript = 'extract-maze-path.mjs';
          } else if (type === 'wordsearch') {
            engineScript = 'generate-wordsearch-assets.mjs';
            extractScript = 'extract-wordsearch-path.mjs';
          } else if (type === 'coloring') {
            engineScript = 'generate-coloring-assets.mjs';
            // coloring has no separate extract script
          } else if (type === 'dotdot') {
            engineScript = 'generate-imagen-dottodot-assets.mjs';
            extractScript = 'extract-dotdot-path.mjs';
          }

          if (engineScript) {
            log(`ASMR: running engine ${engineScript}...`);
            // Save activity.json
            const originalActivityJson = await fs.readFile(activityJsonPath, 'utf-8');
            const engineOk = await runScript(engineScript, ['--out-dir', asmrFolder.full, '--difficulty', 'medium'], 180_000);
            if (engineOk) {
              // Restore activity.json (engines overwrite it)
              await fs.writeFile(activityJsonPath, originalActivityJson);
              log('ASMR: engine OK, activity.json restored');

              if (extractScript) {
                log(`ASMR: running extract ${extractScript}...`);
                await runScript(extractScript, ['--asmr', activityJsonPath], 120_000);
              }

              log('ASMR: rendering video...');
              const asmrActivityJsonRel = path.relative(ROOT, activityJsonPath).replace(/\\/g, '/');
              const renderOk = await runScript('render-video.mjs', ['--comp', 'AsmrReveal', '--asmr', asmrActivityJsonRel], 600_000);
              if (renderOk) {
                log('ASMR video rendered OK');
                await appendLog(`ASMR pipeline OK (${type})`);
              } else {
                log(`ASMR render failed — run manually: node scripts/render-video.mjs --comp AsmrReveal --asmr ${asmrActivityJsonRel}`);
                await appendLog('ASMR render FAILED');
              }
            } else {
              log('ASMR engine failed');
              await appendLog('ASMR engine FAILED');
            }
          }
        } catch (err) {
          log(`ASMR: could not process pipeline: ${err.message}`);
        }
      }
      log('ASMR brief ready in output/asmr/');
      await appendLog('ASMR brief generated OK');
    } else {
      log('ASMR brief failed, run manually: npm run generate:asmr:brief');
      await appendLog('ASMR brief FAILED');
    }
  }

  if (WITH_CHALLENGE) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating today's challenge brief + video...`);
    const challengeOk = await runScript('generate-challenge-brief.mjs', ['--save']);
    if (challengeOk) {
      log('Challenge brief ready in output/challenge/');
      await appendLog('Challenge brief generated OK');

      const challengeFolder = await getLatestChallengeFolder();
      if (challengeFolder) {
        log(`Challenge: folder identified -> ${challengeFolder.name}`);
        log('Challenge: generating puzzle.png via Imagen...');
        const puzzleOk = await runScript('generate-challenge-puzzle.mjs', ['--challenge', challengeFolder.full], 120_000);
        if (puzzleOk) {
          log('Challenge: puzzle.png generated OK');
          log('Challenge: rendering video...');
          const challengeFolderRel = path.relative(ROOT, challengeFolder.full).replace(/\\/g, '/');
          const renderOk = await runScript('render-video.mjs', ['--comp', 'ActivityChallenge', '--challenge', challengeFolderRel], 180_000);
          if (renderOk) {
            log('Challenge video rendered OK');
            await appendLog(`Challenge pipeline OK (${challengeFolder.name})`);
          } else {
            log(`Challenge render failed — run manually: node scripts/render-video.mjs --comp ActivityChallenge --challenge ${challengeFolderRel}`);
            await appendLog('Challenge render FAILED');
          }
        } else {
          log('Challenge: puzzle.png generation failed');
          await appendLog('Challenge puzzle FAILED');
        }
      } else {
        log('Challenge: no folder found after brief, skipping render');
      }
    } else {
      log('Challenge brief failed, run manually: npm run brief:challenge');
      await appendLog('Challenge brief FAILED');
    }
  }

  if (WITH_ANIMAL_BRIEF) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating animal facts brief...`);
    const animalBriefOk = await runScript('generate-animal-facts-brief.mjs', ['--save'], 120_000);
    if (animalBriefOk) {
      log('Animal brief ready in output/longform/animal/');
      await appendLog('Animal facts brief generated OK');
    } else {
      log('Animal brief failed, run manually: npm run longform:animal:plan:save');
      await appendLog('Animal facts brief FAILED');
    }
  }

  if (WITH_ANIMAL_BRIEF && WITH_ANIMAL_REEL) {
    const animalFolder = await getLatestAnimalFolder();
    if (animalFolder && await pathExists(path.join(animalFolder.full, 'episode.json'))) {
      stepNum++;
      log(`Step ${stepNum}/${totalSteps}: Generating Animal Facts Song Short (full pipeline)...`);
      log(`  Episode: ${animalFolder.name}`);

      // Step A — TTS narration
      log('Animal: generating narration audio...');
      const narrationOk = await runScript('generate-animal-narration.mjs', ['--episode', animalFolder.full], 90_000);
      if (!narrationOk) {
        log('Animal: narration failed — run manually: npm run longform:animal:narrate -- --episode ' + path.relative(ROOT, animalFolder.full));
        await appendLog('Animal narration FAILED');
      } else {
        log('Animal: narration OK');
      }

      // Step B — Suno song (async, up to 4 min internal timeout)
      log('Animal: submitting Suno song...');
      const songOk = await runScript('generate-animal-song-sunoapi.mjs', ['--episode', animalFolder.full, '--kind', 'song', '--command', 'all'], 300_000);
      if (!songOk) {
        log('Animal: Suno song failed — run manually: node scripts/generate-animal-song-sunoapi.mjs --episode ' + path.relative(ROOT, animalFolder.full) + ' --kind song --command all');
        await appendLog('Animal Suno song FAILED');
      } else {
        log('Animal: Suno song OK');
      }

      // Step C — Suno background music (async, up to 4 min)
      log('Animal: submitting Suno background...');
      const bgOk = await runScript('generate-animal-song-sunoapi.mjs', ['--episode', animalFolder.full, '--kind', 'background', '--command', 'all'], 300_000);
      if (!bgOk) {
        log('Animal: Suno background failed — run manually: node scripts/generate-animal-song-sunoapi.mjs --episode ' + path.relative(ROOT, animalFolder.full) + ' --kind background --command all');
        await appendLog('Animal Suno background FAILED');
      } else {
        log('Animal: Suno background OK');
      }

      // Step D — Generate all moment images via Imagen
      log('Animal: generating moment images (Imagen)...');
      const momentsOk = await runScript('generate-animal-moments.mjs', ['--episode', animalFolder.full], 300_000);
      if (!momentsOk) {
        log('Animal: moment image gen failed — run manually: node scripts/generate-animal-moments.mjs --episode ' + path.relative(ROOT, animalFolder.full));
        await appendLog('Animal moments FAILED');
      } else {
        log('Animal: moments OK');
      }

      // Step E — B-roll download + transcode
      log('Animal: downloading B-roll...');
      const brollOk = await runScript('download-broll.mjs', ['--episode', animalFolder.full], 120_000);
      if (!brollOk) {
        log('Animal: B-roll download failed — run manually: npm run longform:animal:broll -- --episode ' + path.relative(ROOT, animalFolder.full));
        await appendLog('Animal B-roll FAILED');
      } else {
        log('Animal: B-roll OK');
      }

      // Step F — Remotion render
      log('Animal: rendering video...');
      const animalEpisodeRel = path.relative(ROOT, animalFolder.full).replace(/\\/g, '/');
      const renderOk = await runScript('render-video.mjs', ['--comp', 'AnimalFactsSongShort', '--episode', animalEpisodeRel], 300_000);
      if (renderOk) {
        log('Animal Facts video rendered OK');
        await appendLog(`Animal pipeline OK (${animalFolder.name})`);
      } else {
        log(`Animal render failed — run manually: node scripts/render-video.mjs --comp AnimalFactsSongShort --episode ${animalEpisodeRel}`);
        await appendLog('Animal render FAILED');
      }
    } else {
      log('Animal Reel: no episode folder found, skipping');
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

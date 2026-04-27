#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { uploadToCloud } from './upload-cloud.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const IMAGES_DIR = path.join(ROOT, 'output', 'images');
const VIDEOS_DIR = path.join(ROOT, 'output', 'videos');
const AUDIO_DIR = path.join(ROOT, 'assets', 'audio');
const SFX_DIR = path.join(ROOT, 'assets', 'sfx');
const STAGING_ROOT = path.join(ROOT, 'output', 'challenge', 'generated-activity');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_MUSIC = args.includes('--no-music');
const idIdx = args.indexOf('--id');
const FILTER_ID = idIdx !== -1 ? args[idIdx + 1] : null;
const hookIdx = args.indexOf('--hook');
const HOOK_OVERRIDE = hookIdx !== -1 ? args[hookIdx + 1] : null;

const PUZZLE_TYPES = ['maze', 'matching', 'quiz', 'dot-to-dot', 'spot-the-difference', 'tracing', 'word-search'];

const STATIC_DEFAULT_HOOKS = {
  maze: 'Can you solve this maze in 10 seconds?',
  matching: 'Can you spot every match in 10 seconds?',
  quiz: 'Can you solve this before time runs out?',
  'dot-to-dot': 'Can you guess it before the reveal?',
  'spot-the-difference': 'Can you spot them all in 10 seconds?',
  tracing: 'Can you trace this before time runs out?',
  'word-search': 'Can you find every word before time runs out?',
};

const ACTIVITY_LABELS = {
  maze: 'MAZE',
  matching: 'MATCHING',
  quiz: 'QUIZ',
  'dot-to-dot': 'DOT TO DOT',
  'spot-the-difference': 'SPOT THE DIFFERENCE',
  tracing: 'TRACING',
  'word-search': 'WORD SEARCH',
};

const TIMING_DEFAULTS = {
  maze: { challengeSec: 10, solveSec: 12 },
  matching: { challengeSec: 10, solveSec: 10 },
  quiz: { challengeSec: 10, solveSec: 10 },
  'dot-to-dot': { challengeSec: 8, solveSec: 14 },
  'spot-the-difference': { challengeSec: 10, solveSec: 10 },
  tracing: { challengeSec: 8, solveSec: 10 },
  'word-search': { challengeSec: 12, solveSec: 14 },
};

const TRANSITION_DURATION_SEC = 0.6;

function log(msg) {
  console.log(`[activity-video] ${msg}`);
}

async function loadActivityIntelligence() {
  let competitor = null;
  let trends = null;
  let hooksData = null;
  let dynamicThemes = null;
  let perfWeights = null;

  try {
    competitor = JSON.parse(
      await fs.readFile(path.join(ROOT, 'config', 'competitor-intelligence.json'), 'utf-8')
    );
  } catch {}
  try {
    trends = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8'));
  } catch {}
  try {
    hooksData = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'hooks-library.json'), 'utf-8'));
  } catch {}
  try {
    dynamicThemes = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'theme-pool-dynamic.json'), 'utf-8'));
  } catch {}
  try {
    perfWeights = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'performance-weights.json'), 'utf-8'));
  } catch {}

  const challengeTypes = new Set(['challenge_hook', 'curiosity_gap', 'pattern_interrupt', 'curiosity_hook']);
  const hookCandidates = (hooksData?.hooks || [])
    .filter((hook) => hook.brand_safe !== false && challengeTypes.has(hook.hook_type) && hook.text)
    .sort((a, b) => (b.performance_score ?? 0) - (a.performance_score ?? 0))
    .slice(0, 8)
    .map((hook) => hook.text)
    .filter((text) => text.length <= 70);

  const intelligenceContext = [
    trends?.boost_themes?.length
      ? `Trending themes this week: ${trends.boost_themes.slice(0, 3).join(', ')}.`
      : '',
    trends?.rising_searches?.length
      ? `Rising parent searches: ${trends.rising_searches.slice(0, 3).join(', ')}.`
      : '',
    hooksData?.hooks?.length
      ? `Top hooks in pool: ${hooksData.hooks.filter((h) => h.brand_safe).slice(0, 3).map((h) => `"${h.text}"`).join(' | ')}.`
      : '',
    dynamicThemes?.themes?.length
      ? `Active dynamic themes: ${dynamicThemes.themes.slice(0, 3).map((t) => t.name).join(', ')}.`
      : '',
  ].filter(Boolean).join('\n');

  return {
    competitor,
    trends,
    hooksData,
    dynamicThemes,
    perfWeights,
    hookCandidates: hookCandidates.length > 0 ? hookCandidates : null,
    intelligenceContext,
  };
}

const activityIntelligence = await loadActivityIntelligence();

function pickHook(activityType, intelligence = activityIntelligence) {
  if (intelligence?.hookCandidates?.length) {
    return intelligence.hookCandidates[Math.floor(Math.random() * intelligence.hookCandidates.length)];
  }
  return STATIC_DEFAULT_HOOKS[activityType] || 'Can you solve this before time runs out?';
}

function normalizePuzzleType(activityType) {
  if (activityType === 'activity-word-search') return 'word-search';
  return activityType;
}

function getTimingDefaults(activityType) {
  return TIMING_DEFAULTS[activityType] || { challengeSec: 10, solveSec: 10 };
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function safeCopyFile(src, dest) {
  if (!(await fileExists(src))) {
    return false;
  }
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
  return true;
}

async function findFirstExisting(paths) {
  for (const candidate of paths) {
    if (!candidate) {
      continue;
    }
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function resolveAudioPaths() {
  if (NO_MUSIC) {
    return {
      challengeAudioPath: '',
      tickAudioPath: '',
      transitionCueAudioPath: '',
      solveAudioPath: '',
    };
  }

  const challengeAudio = await findFirstExisting([
    path.join(AUDIO_DIR, 'background.mp3'),
    path.join(SFX_DIR, 'nature', 'evening_ambience.mp3'),
    path.join(SFX_DIR, 'nature', 'garden_ambience.mp3'),
    path.join(AUDIO_DIR, 'Twinkle - The Grey Room _ Density & Time.mp3'),
  ]);

  const transitionCue = await findFirstExisting([
    path.join(SFX_DIR, 'emotional', 'gentle_chime.mp3'),
    path.join(AUDIO_DIR, 'hook-jingle.mp3'),
  ]);

  const solveAudio = await findFirstExisting([
    path.join(AUDIO_DIR, 'crayon.mp3'),
    path.join(AUDIO_DIR, 'outro-jingle.mp3'),
  ]);

  return {
    challengeAudioPath: challengeAudio ? path.relative(ROOT, challengeAudio).replace(/\\/g, '/') : '',
    tickAudioPath: '',
    transitionCueAudioPath: transitionCue ? path.relative(ROOT, transitionCue).replace(/\\/g, '/') : '',
    solveAudioPath: solveAudio ? path.relative(ROOT, solveAudio).replace(/\\/g, '/') : '',
  };
}

function mapContainPoint({ x, y, imageWidth, imageHeight, videoWidth = 1080, videoHeight = 1920 }) {
  const imageAspect = imageWidth / imageHeight;
  const videoAspect = videoWidth / videoHeight;

  let renderWidth;
  let renderHeight;
  let offsetX;
  let offsetY;

  if (imageAspect > videoAspect) {
    renderWidth = videoWidth;
    renderHeight = videoWidth / imageAspect;
    offsetX = 0;
    offsetY = (videoHeight - renderHeight) / 2;
  } else {
    renderHeight = videoHeight;
    renderWidth = videoHeight * imageAspect;
    offsetX = (videoWidth - renderWidth) / 2;
    offsetY = 0;
  }

  return {
    x: offsetX + x * renderWidth,
    y: offsetY + y * renderHeight,
    renderWidth,
    renderHeight,
    offsetX,
    offsetY,
  };
}

async function loadSolverProps(stageDir) {
  const solverProps = {
    pathWaypoints: null,
    pathColor: undefined,
    wordRects: null,
    highlightColor: undefined,
    dotWaypoints: null,
    dotColor: undefined,
  };

  const pathJson = path.join(stageDir, 'path.json');
  if (await fileExists(pathJson)) {
    try {
      const data = JSON.parse(await fs.readFile(pathJson, 'utf-8'));
      solverProps.pathWaypoints = (data.waypoints || []).map((point) => {
        const mapped = mapContainPoint({
          x: point.x,
          y: point.y,
          imageWidth: data.width ?? 1080,
          imageHeight: data.height ?? 1920,
        });
        return { x: mapped.x, y: mapped.y };
      });
      if (data.pathColor) solverProps.pathColor = data.pathColor;
    } catch {
      // ignore malformed sidecar, degrade cleanly
    }
  }

  const wordsearchJson = path.join(stageDir, 'wordsearch.json');
  if (await fileExists(wordsearchJson)) {
    try {
      const data = JSON.parse(await fs.readFile(wordsearchJson, 'utf-8'));
      solverProps.wordRects = (data.rects || []).map((rect) => {
        const start = mapContainPoint({
          x: rect.x1,
          y: rect.y1,
          imageWidth: data.width ?? 1080,
          imageHeight: data.height ?? 1920,
        });
        const end = mapContainPoint({
          x: rect.x2,
          y: rect.y2,
          imageWidth: data.width ?? 1080,
          imageHeight: data.height ?? 1920,
        });
        return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
      });
      if (data.highlightColor) solverProps.highlightColor = data.highlightColor;
    } catch {
      // ignore malformed sidecar, degrade cleanly
    }
  }

  const dotsJson = path.join(stageDir, 'dots.json');
  if (await fileExists(dotsJson)) {
    try {
      const data = JSON.parse(await fs.readFile(dotsJson, 'utf-8'));
      solverProps.dotWaypoints = (data.dots || []).map((dot) => {
        const mapped = mapContainPoint({
          x: dot.x,
          y: dot.y,
          imageWidth: data.width ?? 1080,
          imageHeight: data.height ?? 1920,
        });
        return { x: mapped.x, y: mapped.y };
      });
      if (data.dotColor) solverProps.dotColor = data.dotColor;
    } catch {
      // ignore malformed sidecar, degrade cleanly
    }
  }

  return solverProps;
}

async function stagePuzzleAssets({ sourceId, imagePath, meta, activityType }) {
  const stageDir = path.join(STAGING_ROOT, sourceId);
  await ensureDir(stageDir);

  const stagedPuzzle = path.join(stageDir, 'puzzle.png');
  const stagedBlank = path.join(stageDir, 'blank.png');
  await safeCopyFile(imagePath, stagedPuzzle);
  await safeCopyFile(imagePath, stagedBlank);

  let solvedImagePath = '';
  const solvedCandidates = [
    meta.solvedImagePath,
    meta.outputs?.solved,
    meta.outputs?.solved_image,
    meta.outputs?.solvedImage,
  ]
    .filter(Boolean)
    .map((value) => path.isAbsolute(value) ? value : path.join(IMAGES_DIR, value));

  const solvedSource = await findFirstExisting(solvedCandidates);
  if (solvedSource) {
    const stagedSolved = path.join(stageDir, 'solved.png');
    await safeCopyFile(solvedSource, stagedSolved);
    solvedImagePath = path.relative(ROOT, stagedSolved).replace(/\\/g, '/');
  }

  const sidecarCandidates = [
    meta.pathJsonPath ? { src: meta.pathJsonPath, dest: 'path.json' } : null,
    meta.wordsearchJsonPath ? { src: meta.wordsearchJsonPath, dest: 'wordsearch.json' } : null,
    meta.dotsJsonPath ? { src: meta.dotsJsonPath, dest: 'dots.json' } : null,
  ].filter(Boolean);

  for (const sidecar of sidecarCandidates) {
    const src = path.isAbsolute(sidecar.src) ? sidecar.src : path.join(ROOT, sidecar.src);
    await safeCopyFile(src, path.join(stageDir, sidecar.dest));
  }

  const relStage = path.relative(ROOT, stageDir).replace(/\\/g, '/');
  const relPuzzle = `${relStage}/puzzle.png`;
  const relBlank = `${relStage}/blank.png`;
  const solverProps = await loadSolverProps(stageDir);

  return {
    stageDir,
    imagePath: relPuzzle,
    blankImagePath: relBlank,
    solvedImagePath,
    activityLabel: ACTIVITY_LABELS[activityType] || activityType.toUpperCase(),
    ...solverProps,
  };
}

function buildRenderProps({ meta, sourceId, activityType, stagedAssets, hookText, audioPaths }) {
  const timing = getTimingDefaults(activityType);

  return {
    imagePath: stagedAssets.imagePath,
    blankImagePath: stagedAssets.blankImagePath,
    solvedImagePath: stagedAssets.solvedImagePath,
    hookText,
    titleText: hookText,
    activityLabel: stagedAssets.activityLabel,
    puzzleType: activityType,
    countdownSec: meta.countdownSec ?? timing.challengeSec,
    hookDurationSec: meta.transitionDurationSec ?? TRANSITION_DURATION_SEC,
    holdAfterSec: meta.solveDurationSec ?? timing.solveSec,
    challengeAudioPath: audioPaths.challengeAudioPath,
    tickAudioPath: audioPaths.tickAudioPath,
    transitionCueAudioPath: audioPaths.transitionCueAudioPath,
    solveAudioPath: audioPaths.solveAudioPath,
    showJoyo: meta.showJoyo ?? true,
    showBrandWatermark: meta.showBrandWatermark ?? true,
    pathWaypoints: stagedAssets.pathWaypoints,
    pathColor: stagedAssets.pathColor,
    wordRects: stagedAssets.wordRects,
    highlightColor: stagedAssets.highlightColor,
    dotWaypoints: stagedAssets.dotWaypoints,
    dotColor: stagedAssets.dotColor,
  };
}

async function renderActivityVideo(outputPath, inputProps, sourceId) {
  const renderScript = path.join(ROOT, 'scripts', 'render-video.mjs');
  const propsFile = path.join(STAGING_ROOT, `${sourceId}-props.json`);
  await ensureDir(path.dirname(propsFile));
  await fs.writeFile(propsFile, JSON.stringify(inputProps, null, 2));
  const cmd = `node "${renderScript}" --comp ActivityChallenge --props-file "${propsFile}" --out "${outputPath}"${DRY_RUN ? ' --dry-run' : ''}`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT });
  } finally {
    await fs.unlink(propsFile).catch(() => {});
  }
}

async function writeQueueJson(sourceId, sourceMeta, videoFilename, hookText, renderer = 'remotion') {
  const videoId = `${sourceId}-yt-short`;
  const queuePath = path.join(QUEUE_DIR, `${videoId}.json`);

  const entry = {
    id: videoId,
    type: 'video',
    category: sourceMeta.category,
    categoryName: sourceMeta.categoryName,
    subject: sourceMeta.subject,
    source: 'activity-video',
    sourceId,
    hookText,
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    renderer,
    outputs: {
      youtube: videoFilename,
    },
    platforms: {
      youtube: {
        video: videoFilename,
        status: 'pending',
      },
    },
  };

  if (!DRY_RUN) {
    await fs.writeFile(queuePath, JSON.stringify(entry, null, 2));
    try {
      const videoPath = path.join(VIDEOS_DIR, videoFilename);
      entry.cloudUrl = await uploadToCloud(videoPath, 'joymaze/videos');
      await fs.writeFile(queuePath, JSON.stringify(entry, null, 2));
      log(`  Cloudinary: ${entry.cloudUrl}`);
    } catch (err) {
      console.warn(`  Cloudinary upload failed (local posting still works): ${err.message}`);
    }
  }

  return entry;
}

async function processItem(meta, sourceId) {
  const activityType = normalizePuzzleType(meta.category?.replace('activity-', '') || '');

  if (!PUZZLE_TYPES.includes(activityType)) {
    log(`  Skipping ${sourceId} - type "${activityType}" is not a supported puzzle type`);
    return false;
  }

  const videoId = `${sourceId}-yt-short`;
  const videoFilename = `${videoId}.mp4`;
  const videoPath = path.join(VIDEOS_DIR, videoFilename);
  const queuePath = path.join(QUEUE_DIR, `${videoId}.json`);

  if (await fileExists(queuePath)) {
    log(`  Skipping ${sourceId} - video already generated`);
    return false;
  }

  const sourceFilename = meta.outputs?.tiktok || meta.outputs?.instagram_portrait;
  if (!sourceFilename) {
    log(`  Skipping ${sourceId} - no suitable source image found`);
    return false;
  }

  const imagePath = path.join(IMAGES_DIR, sourceFilename);
  if (!(await fileExists(imagePath))) {
    log(`  Skipping ${sourceId} - image file not found: ${sourceFilename}`);
    return false;
  }

  const hookText = HOOK_OVERRIDE || meta.hookText || pickHook(activityType, activityIntelligence);
  const audioPaths = await resolveAudioPaths();
  const stagedAssets = await stagePuzzleAssets({ sourceId, imagePath, meta, activityType });
  const inputProps = buildRenderProps({
    meta,
    sourceId,
    activityType,
    stagedAssets,
    hookText,
    audioPaths,
  });

  log(`Processing: ${sourceId}`);
  log(`  Type: ${activityType}`);
  log(`  Hook: "${hookText}"`);
  log(`  Source image: ${sourceFilename}`);
  log(`  Stage dir: ${path.relative(ROOT, stagedAssets.stageDir).replace(/\\/g, '/')}`);
  log(`  Render: Remotion ActivityChallenge`);

  if (DRY_RUN) {
    await renderActivityVideo(videoPath, inputProps, sourceId);
    log(`  [dry-run] Would write: ${videoFilename}`);
    return true;
  }

  await ensureDir(VIDEOS_DIR);
  await renderActivityVideo(videoPath, inputProps, sourceId);

  const queueEntry = await writeQueueJson(sourceId, meta, videoFilename, hookText);
  log(`  Done: ${videoFilename}`);
  log(`  Queue: ${queueEntry.id}`);
  return true;
}

async function main() {
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${NO_MUSIC ? ' | no music' : ''}`);
  if (DRY_RUN) {
    log(`Intelligence context: [${activityIntelligence.trends?.boost_themes?.length || 0} trends, ${activityIntelligence.hooksData?.hooks?.length || 0} hooks, ${activityIntelligence.dynamicThemes?.themes?.length || 0} themes loaded]`);
  }

  let queueFiles;
  try {
    queueFiles = await fs.readdir(QUEUE_DIR);
  } catch {
    console.error('[activity-video] ERROR: output/queue/ not found. Run generate-images first.');
    process.exit(1);
  }

  const candidates = queueFiles.filter((file) =>
    file.endsWith('.json') &&
    file.includes('-activity-') &&
    !file.includes('-yt-short')
  );

  if (candidates.length === 0) {
    log('No activity queue items found.');
    return;
  }

  const toProcess = FILTER_ID
    ? candidates.filter((file) => file.startsWith(FILTER_ID))
    : candidates;

  if (toProcess.length === 0) {
    log(`No queue item matching --id "${FILTER_ID}".`);
    return;
  }

  log(`Found ${toProcess.length} candidate(s)${FILTER_ID ? ` (filtered to: ${FILTER_ID})` : ''}`);

  let generated = 0;
  let skipped = 0;

  for (const filename of toProcess) {
    const sourceId = filename.replace('.json', '');
    let meta;

    try {
      meta = JSON.parse(await fs.readFile(path.join(QUEUE_DIR, filename), 'utf-8'));
    } catch (err) {
      log(`  Error reading ${filename}: ${err.message}`);
      skipped++;
      continue;
    }

    const ok = await processItem(meta, sourceId);
    if (ok) {
      generated++;
    } else {
      skipped++;
    }
  }

  log(`Complete: ${generated} video(s) generated, ${skipped} skipped.`);
  if (generated > 0 && !DRY_RUN) {
    log('Videos: output/videos/');
    log('Queue: output/queue/*-yt-short.json');
    log('Post: node scripts/post-content.mjs --platform youtube');
  }
}

main().catch((err) => {
  console.error(`[activity-video] FATAL: ${err.message}`);
  process.exit(1);
});

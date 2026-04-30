#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { renderPuzzlePost } from './lib/puzzle-post-renderer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(ROOT, 'output', 'challenge', 'generated-activity');
const RAW_DIR = path.join(ROOT, 'output', 'raw');
const PROMPTS_DIR = path.join(ROOT, 'output', 'prompts');

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (flag, fallback = null) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] ?? fallback : fallback;
};

const DRY_RUN = hasFlag('--dry-run');
const TYPE_ARG = (getArg('--type', getArg('--puzzle-type', '')) || '').toLowerCase();
const THEME = getArg('--theme', 'Ocean Animals');
const TITLE = getArg('--title', '');
const DIFFICULTY = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const ACTIVITY_DIR_ARG = getArg('--activity-dir');
const SLUG_ARG = getArg('--slug');
const COUNTDOWN = getArg('--countdown');
const WORDS = getArg('--words');
const MANIFEST_ARG = getArg('--manifest');
const DATE_ARG = getArg('--date');
const SLOT_ARG = getArg('--slot');
const CATEGORY_ARG = getArg('--category');
const ALL_SUPPORTED = hasFlag('--all-supported');

function normalizeType(input) {
  if (input === 'wordsearch' || input === 'word-search') return 'word-search';
  if (input === 'maze') return 'maze';
  if (input === 'coloring') return 'coloring';
  if (input === 'matching') return 'matching';
  if (input === 'find-diff' || input === 'finddiff' || input === 'find-diff') return 'find-diff';
  if (input === 'dot-to-dot' || input === 'dottodot' || input === 'dot_to_dot') return 'dot-to-dot';
  return '';
}

function categoryToPuzzleType(category) {
  if (category === 'activity-maze') return 'maze';
  if (category === 'activity-word-search') return 'word-search';
  return '';
}

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function titleCase(input) {
  return String(input || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

function pickTitleText(activity, config, type) {
  if (TITLE) return TITLE;
  if (activity?.hookText) return activity.hookText;
  if (activity?.titleText) return activity.titleText;
  if (config?.title) return config.title;
  return getDefaultTitle(type, activity?.theme || config?.theme || THEME);
}

function getDefaultTitle(type, theme) {
  const themeLabel = titleCase(theme);
  return type === 'maze' ? `${themeLabel} Maze` : `${themeLabel} Word Search`;
}

function getScriptPath(type) {
  if (type === 'maze') return path.join(ROOT, 'scripts', 'generate-maze-assets.mjs');
  if (type === 'word-search') return path.join(ROOT, 'scripts', 'generate-wordsearch-assets.mjs');
  if (type === 'coloring') return path.join(ROOT, 'scripts', 'generate-coloring-assets.mjs');
  if (type === 'matching') return path.join(ROOT, 'scripts', 'generate-matching-assets.mjs');
  if (type === 'find-diff') return path.join(ROOT, 'scripts', 'generate-find-diff-assets.mjs');
  if (type === 'dot-to-dot') return path.join(ROOT, 'scripts', 'generate-dottodot-assets.mjs');
  return null;
}

function getRawFolder(type) {
  if (type === 'maze') return path.join(RAW_DIR, 'maze');
  if (type === 'word-search') return path.join(RAW_DIR, 'wordsearch');
  if (type === 'coloring') return path.join(RAW_DIR, 'coloring');
  if (type === 'matching') return path.join(RAW_DIR, 'matching');
  if (type === 'find-diff') return path.join(RAW_DIR, 'find-diff');
  if (type === 'dot-to-dot') return path.join(RAW_DIR, 'dot-to-dot');
  return path.join(RAW_DIR, type);
}

function runGenerator(type, config, dryRun = false) {
  const scriptPath = getScriptPath(type);
  const title = config.title || getDefaultTitle(type, config.theme);
  const commandArgs = [scriptPath, '--title', title, '--theme', config.theme, '--difficulty', config.difficulty, '--slug', config.slug];
  if (dryRun) commandArgs.push('--dry-run');
  if (config.countdown) commandArgs.push('--countdown', String(config.countdown));
  if (config.words && type === 'word-search') commandArgs.push('--words', config.words);

  const result = spawnSync('node', commandArgs, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Generator failed with code ${result.status}`);
  }
  return result.stdout;
}

async function latestManifestPath() {
  const entries = await fs.readdir(PROMPTS_DIR).catch(() => []);
  const manifests = entries.filter(name => /^activity-manifest-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
  if (manifests.length === 0) {
    throw new Error('No activity manifest found in output/prompts/. Run generate-prompts.mjs --save first.');
  }
  return path.join(PROMPTS_DIR, manifests[manifests.length - 1]);
}

async function loadManifest() {
  const manifestPath = MANIFEST_ARG
    ? path.resolve(ROOT, MANIFEST_ARG)
    : DATE_ARG
      ? path.join(PROMPTS_DIR, `activity-manifest-${DATE_ARG}.json`)
      : await latestManifestPath();

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return { manifest, manifestPath };
}

function resolveManifestTargets(manifest) {
  const slots = Array.isArray(manifest.activitySlots) ? manifest.activitySlots : [];
  const supported = slots.filter(slot => categoryToPuzzleType(slot.category));
  if (ALL_SUPPORTED) return supported;
  if (SLOT_ARG) {
    const slotNum = Number(SLOT_ARG);
    const found = slots.find(slot => Number(slot.slotIndex) === slotNum);
    if (!found) throw new Error(`Slot ${SLOT_ARG} not found in manifest.`);
    if (!categoryToPuzzleType(found.category)) throw new Error(`Slot ${SLOT_ARG} is ${found.category}, which is not a supported deterministic puzzle type yet.`);
    return [found];
  }
  if (CATEGORY_ARG) {
    const found = supported.find(slot => slot.category === CATEGORY_ARG);
    if (!found) throw new Error(`No manifest slot found for category ${CATEGORY_ARG}.`);
    return [found];
  }
  if (supported.length > 0) return [supported[0]];
  throw new Error('Manifest has no supported puzzle slots for maze or word-search.');
}

function buildConfigFromManifestSlot(manifest, slot) {
  const type = categoryToPuzzleType(slot.category);
  const datePart = manifest.date || new Date().toISOString().slice(0, 10);
  const slotPart = `slot${String(slot.slotIndex).padStart(2, '0')}`;
  const themePart = slugify(slot.theme || slot.label || type);
  return {
    source: 'manifest',
    manifestDate: manifest.date || null,
    slotIndex: slot.slotIndex,
    category: slot.category,
    type,
    theme: slot.theme || THEME,
    difficulty: String(slot.difficulty || DIFFICULTY || 'medium').toLowerCase(),
    title: TITLE || slot.topic || slot.subject || slot.label || getDefaultTitle(type, slot.theme || THEME),
    slug: SLUG_ARG || `${datePart}-${slotPart}-${themePart}-${type}`,
    activityDir: null,
    countdown: COUNTDOWN,
    words: WORDS,
  };
}

function buildDirectConfig() {
  const type = normalizeType(TYPE_ARG);
  if (!type) throw new Error('Usage: --type maze|wordsearch|matching|find-diff|coloring|dot-to-dot --theme "Theme Name" [--difficulty medium] [--activity-dir existing-folder]');
  return {
    source: 'direct',
    type,
    theme: THEME,
    difficulty: DIFFICULTY,
    title: TITLE || getDefaultTitle(type, THEME),
    slug: SLUG_ARG || `${slugify(THEME)}-${slugify(type)}-${DIFFICULTY}`,
    activityDir: ACTIVITY_DIR_ARG ? path.resolve(ROOT, ACTIVITY_DIR_ARG) : null,
    countdown: COUNTDOWN,
    words: WORDS,
  };
}

async function readCroppedSvg(activityDir, puzzleType) {
  let svgFile = path.join(activityDir, 'blank.svg');
  const svgRaw = await fs.readFile(svgFile, 'utf8');
  let metaFile = null;
  if (puzzleType === 'maze') {
    metaFile = path.join(activityDir, 'maze.json');
  } else if (puzzleType === 'word-search') {
    metaFile = path.join(activityDir, 'wordsearch.json');
  } else if (puzzleType === 'coloring') {
    metaFile = path.join(activityDir, 'coloring.json');
  } else if (puzzleType === 'matching') {
    metaFile = path.join(activityDir, 'matching.json');
  }
  if (!metaFile) return { svgContent: svgRaw, layoutMeta: null };
  const pad = 32;
  const meta = await fs.readFile(metaFile, 'utf8').then(JSON.parse).catch(() => null);
  if (!meta?.layout && !meta?.panels) return { svgContent: svgRaw, layoutMeta: null };
  const src = meta.layout ?? meta.panels;
  const { offsetX, offsetY, panelW: mazeW, panelH: mazeH } = src;
  return {
    svgContent: svgRaw.replace(/viewBox="[^"]*"/, `viewBox="${offsetX - pad} ${offsetY - pad} ${mazeW + pad * 2} ${mazeH + pad * 2}"`),
    layoutMeta: { ...src, cropPad: pad },
  };
}

async function buildPostImage(activityDir, activity, outputPath, type) {
  const titleText = pickTitleText(activity, null, type);
  const theme = activity.theme || THEME;
  // For matching, use solved.svg (labeled face-up cards) as the social post image
  const svgFile = type === 'matching' ? 'solved.svg' : 'blank.svg';
  const svgRaw = await fs.readFile(path.join(activityDir, svgFile), 'utf8');
  const { layoutMeta } = await readCroppedSvg(activityDir, type);
  const postMeta = {
    difficulty: activity.difficulty || DIFFICULTY,
    ageMin: 5,
    ageMax: 8,
    brandName: 'JoyMaze',
    puzzleType: type,
    layout: layoutMeta,
  };
  await renderPuzzlePost(svgRaw, titleText, theme, outputPath, postMeta);
}

async function processOne(config) {
  const activityDir = config.activityDir || path.join(GENERATED_DIR, config.slug);
  if (!config.activityDir) {
    console.log(`[puzzle-post] generating ${config.type} assets for theme: ${config.theme}`);
    const output = runGenerator(config.type, config, DRY_RUN);
    process.stdout.write(output);
    if (DRY_RUN) {
      console.log(`[puzzle-post] dry-run target dir: ${activityDir}`);
      return;
    }
  }
  const activityPath = path.join(activityDir, 'activity.json');
  const puzzleJsonName = config.type === 'maze' ? 'maze.json' : config.type === 'coloring' ? 'coloring.json' : config.type === 'matching' ? 'matching.json' : config.type === 'find-diff' ? 'diff.json' : config.type === 'dot-to-dot' ? 'dots.json' : 'puzzle.json';
  const puzzlePath = path.join(activityDir, puzzleJsonName);
  const activity = JSON.parse(await fs.readFile(activityPath, 'utf8'));
  const puzzle = JSON.parse(await fs.readFile(puzzlePath, 'utf8'));
  const postPath = path.join(activityDir, 'post.png');
  console.log(`[puzzle-post] activityDir: ${activityDir}`);
  if (DRY_RUN) {
    console.log('[puzzle-post] dry-run only, no files written.');
    return;
  }
  const rawFolder = getRawFolder(config.type);
  const rawSuffix = config.source === 'manifest'
    ? `${manifestSafe(config.manifestDate)}-slot${String(config.slotIndex).padStart(2, '0')}-${slugify(activity.theme || config.theme)}`
    : slugify(activity.theme || config.theme || config.slug);
  const rawBase = (() => {
    const t = config.type;
    if (t === 'maze') return 'maze';
    if (t === 'word-search') return 'wordsearch';
    if (t === 'coloring') return 'coloring';
    if (t === 'matching') return 'matching';
    if (t === 'find-diff') return 'find-diff';
    if (t === 'dot-to-dot') return 'dot-to-dot';
    return t;
  })() + `-${rawSuffix}`;
  const rawImagePath = path.join(rawFolder, `${rawBase}.png`);
  const rawSidecarPath = path.join(rawFolder, `${rawBase}.json`);
  console.log(`[puzzle-post] rawImage   : ${rawImagePath}`);
  await fs.mkdir(rawFolder, { recursive: true });
  await buildPostImage(activityDir, activity, postPath, config.type);
  await fs.copyFile(postPath, rawImagePath);
  const resolvedTitleText = pickTitleText(activity, config, config.type);
  const subject = config.title || resolvedTitleText || getDefaultTitle(config.type, activity.theme || config.theme);
  const sidecar = {
    category: config.type === 'maze' ? 'activity-maze' : 'activity-word-search',
    subject,
    hookText: activity.hookText || activity.titleText || '',
    difficulty: puzzle.difficulty || activity.difficulty || config.difficulty,
    theme: activity.theme || config.theme,
    source: config.source === 'manifest' ? 'puzzle-generator-manifest' : 'puzzle-generator',
    sourceFolder: path.relative(ROOT, activityDir).replace(/\\/g, '/'),
    puzzleType: config.type,
    titleText: resolvedTitleText || '',
    ctaText: activity.ctaText || 'Save this for later',
    manifestDate: config.manifestDate || null,
    manifestSlotIndex: config.slotIndex || null,
    manifestCategory: config.category || null,
  };
  await fs.writeFile(rawSidecarPath, JSON.stringify(sidecar, null, 2));
  console.log(`[puzzle-post] wrote post : ${postPath}`);
  console.log(`[puzzle-post] wrote raw  : ${rawImagePath}`);
  console.log(`[puzzle-post] wrote meta : ${rawSidecarPath}`);
}

function manifestSafe(dateStr) {
  return String(dateStr || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, '');
}

async function main() {
  if (MANIFEST_ARG || DATE_ARG || SLOT_ARG || CATEGORY_ARG || ALL_SUPPORTED) {
    const { manifest, manifestPath } = await loadManifest();
    const targets = resolveManifestTargets(manifest);
    console.log(`[puzzle-post] manifest   : ${manifestPath}`);
    console.log(`[puzzle-post] targets    : ${targets.map(t => `${t.slotIndex}:${t.category}:${t.theme}`).join(', ')}`);
    for (const slot of targets) await processOne(buildConfigFromManifestSlot(manifest, slot));
    return;
  }
  await processOne(buildDirectConfig());
}

main().catch((error) => {
  console.error('[puzzle-post] failed:', error.message);
  process.exit(1);
});

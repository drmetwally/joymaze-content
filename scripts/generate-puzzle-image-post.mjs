#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(ROOT, 'output', 'challenge', 'generated-activity');
const RAW_DIR = path.join(ROOT, 'output', 'raw');

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

function normalizeType(input) {
  if (input === 'wordsearch' || input === 'word-search') return 'word-search';
  if (input === 'maze') return 'maze';
  return '';
}

const PUZZLE_TYPE = normalizeType(TYPE_ARG);
if (!PUZZLE_TYPE) {
  console.error('Usage: --type maze|wordsearch --theme "Theme Name" [--difficulty medium] [--activity-dir existing-folder]');
  process.exit(1);
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

function pickColors(type) {
  return type === 'maze'
    ? { accent: '#52A447', accentSoft: '#EAF7E7', frame: '#D8EFD1' }
    : { accent: '#F28C28', accentSoft: '#FFF0E2', frame: '#FFD7B0' };
}

function renderOverlaySvg({ width, height, theme, titleText, ctaText, accent, accentSoft, frame }) {
  const safeTheme = escapeXml(theme);
  const safeTitle = escapeXml(titleText);
  const safeCta = escapeXml(ctaText);

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#FFFFFF"/>
    <rect x="26" y="26" width="${width - 52}" height="${height - 52}" rx="28" fill="#FFFFFF" stroke="${frame}" stroke-width="6"/>
    <rect x="54" y="54" width="320" height="58" rx="29" fill="${accentSoft}"/>
    <text x="78" y="91" font-size="28" font-family="Arial, sans-serif" font-weight="700" fill="${accent}">FREE PRINTABLE</text>
    <text x="500" y="100" text-anchor="middle" font-size="44" font-family="Arial, sans-serif" font-weight="800" fill="#1F2937">${safeTitle}</text>
    <text x="500" y="142" text-anchor="middle" font-size="22" font-family="Arial, sans-serif" fill="#6B7280">Theme: ${safeTheme}</text>
    <rect x="70" y="1332" width="860" height="92" rx="24" fill="${accentSoft}"/>
    <text x="500" y="1388" text-anchor="middle" font-size="30" font-family="Arial, sans-serif" font-weight="700" fill="#374151">${safeCta}</text>
  </svg>`;
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getDefaultTitle(type, theme) {
  const themeLabel = titleCase(theme);
  return type === 'maze' ? `${themeLabel} Maze` : `${themeLabel} Word Search`;
}

function getScriptPath(type) {
  return type === 'maze'
    ? path.join(ROOT, 'scripts', 'generate-maze-assets.mjs')
    : path.join(ROOT, 'scripts', 'generate-wordsearch-assets.mjs');
}

function getRawFolder(type) {
  return type === 'maze' ? path.join(RAW_DIR, 'maze') : path.join(RAW_DIR, 'wordsearch');
}

async function ensurePuzzlePng(activityDir) {
  const puzzlePath = path.join(activityDir, 'puzzle.png');
  if (await fileExists(puzzlePath)) return puzzlePath;
  const blankPath = path.join(activityDir, 'blank.png');
  if (!(await fileExists(blankPath))) {
    throw new Error(`Missing puzzle.png and blank.png in ${activityDir}`);
  }
  await fs.copyFile(blankPath, puzzlePath);
  return puzzlePath;
}

function runGenerator(type, outSlug, dryRun = false) {
  const scriptPath = getScriptPath(type);
  const title = TITLE || getDefaultTitle(type, THEME);
  const commandArgs = [scriptPath, '--title', title, '--theme', THEME, '--difficulty', DIFFICULTY, '--slug', outSlug];
  if (dryRun) commandArgs.push('--dry-run');
  if (COUNTDOWN) commandArgs.push('--countdown', COUNTDOWN);
  if (WORDS && type === 'word-search') commandArgs.push('--words', WORDS);

  const result = spawnSync('node', commandArgs, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Generator failed with code ${result.status}`);
  }
  return result.stdout;
}

async function buildPostImage(activityDir, activity, outputPath) {
  const sourcePuzzlePath = await ensurePuzzlePng(activityDir);
  const puzzleBuffer = await sharp(sourcePuzzlePath)
    .resize(820, 1110, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  const { accent, accentSoft, frame } = pickColors(PUZZLE_TYPE);
  const overlaySvg = renderOverlaySvg({
    width: 1000,
    height: 1500,
    theme: activity.theme || THEME,
    titleText: activity.activityLabel || (PUZZLE_TYPE === 'maze' ? 'Maze Puzzle' : 'Word Search'),
    ctaText: 'Save this for your next quiet-time printable',
    accent,
    accentSoft,
    frame,
  });

  const frameSvg = `
  <svg width="840" height="1130" viewBox="0 0 840 1130" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="832" height="1122" rx="28" fill="#FFFFFF" stroke="${frame}" stroke-width="8"/>
  </svg>`;

  await sharp({
    create: {
      width: 1000,
      height: 1500,
      channels: 4,
      background: '#FFFFFF',
    },
  })
    .composite([
      { input: Buffer.from(overlaySvg), top: 0, left: 0 },
      { input: Buffer.from(frameSvg), top: 190, left: 80 },
      { input: puzzleBuffer, top: 200, left: 90 },
    ])
    .png()
    .toFile(outputPath);
}

async function main() {
  const defaultSlug = `${slugify(THEME)}-${PUZZLE_TYPE === 'maze' ? 'maze-post' : 'wordsearch-post'}-${DIFFICULTY}`;
  const slug = SLUG_ARG || defaultSlug;
  const activityDir = ACTIVITY_DIR_ARG ? path.resolve(ROOT, ACTIVITY_DIR_ARG) : path.join(GENERATED_DIR, slug);

  if (!ACTIVITY_DIR_ARG) {
    console.log(`[puzzle-post] generating ${PUZZLE_TYPE} assets for theme: ${THEME}`);
    const output = runGenerator(PUZZLE_TYPE, slug, DRY_RUN);
    process.stdout.write(output);
    if (DRY_RUN) {
      console.log(`[puzzle-post] dry-run target dir: ${activityDir}`);
      return;
    }
  }

  const activityPath = path.join(activityDir, 'activity.json');
  const puzzleJsonName = PUZZLE_TYPE === 'maze' ? 'maze.json' : 'puzzle.json';
  const puzzlePath = path.join(activityDir, puzzleJsonName);
  const activity = JSON.parse(await fs.readFile(activityPath, 'utf8'));
  const puzzle = JSON.parse(await fs.readFile(puzzlePath, 'utf8'));

  const postPath = path.join(activityDir, 'post.png');
  const rawFolder = getRawFolder(PUZZLE_TYPE);
  const rawBase = `${PUZZLE_TYPE === 'maze' ? 'maze' : 'wordsearch'}-${slugify(activity.theme || THEME || slug)}`;
  const rawImagePath = path.join(rawFolder, `${rawBase}.png`);
  const rawSidecarPath = path.join(rawFolder, `${rawBase}.json`);

  console.log(`[puzzle-post] activityDir: ${activityDir}`);
  console.log(`[puzzle-post] rawImage   : ${rawImagePath}`);

  if (DRY_RUN) {
    console.log('[puzzle-post] dry-run only, no files written.');
    return;
  }

  await fs.mkdir(rawFolder, { recursive: true });
  await buildPostImage(activityDir, activity, postPath);
  await fs.copyFile(postPath, rawImagePath);

  const sidecar = {
    category: PUZZLE_TYPE === 'maze' ? 'activity-maze' : 'activity-word-search',
    subject: TITLE || getDefaultTitle(PUZZLE_TYPE, activity.theme || THEME),
    hookText: activity.hookText || activity.titleText || '',
    difficulty: puzzle.difficulty || DIFFICULTY,
    theme: activity.theme || THEME,
    source: 'puzzle-generator',
    sourceFolder: path.relative(ROOT, activityDir).replace(/\\/g, '/'),
    puzzleType: PUZZLE_TYPE,
    titleText: activity.titleText || '',
    ctaText: activity.ctaText || 'Save this for later',
  };

  await fs.writeFile(rawSidecarPath, JSON.stringify(sidecar, null, 2));
  console.log(`[puzzle-post] wrote post : ${postPath}`);
  console.log(`[puzzle-post] wrote raw  : ${rawImagePath}`);
  console.log(`[puzzle-post] wrote meta : ${rawSidecarPath}`);
}

main().catch((error) => {
  console.error('[puzzle-post] failed:', error.message);
  process.exit(1);
});

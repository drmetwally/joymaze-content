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

function getStyleKit(type) {
  return type === 'maze'
    ? {
        accent: '#4DAF54',
        accentStrong: '#2F8C39',
        accentSoft: '#ECF8EE',
        frame: '#CEEBCD',
        heroGlow: '#D9F5DA',
        footerBg: '#F5FBF5',
        badgeText: 'MAZE TIME',
      }
    : {
        accent: '#F28C28',
        accentStrong: '#D96A12',
        accentSoft: '#FFF1E4',
        frame: '#FFD7B3',
        heroGlow: '#FFE6CC',
        footerBg: '#FFF8F2',
        badgeText: 'WORD SEARCH',
      };
}

function renderBackgroundSvg({ width, height, titleText, theme, difficulty, ctaText, style }) {
  const safeTheme = escapeXml(theme);
  const safeTitle = escapeXml(titleText);
  const safeDifficulty = escapeXml(titleCase(difficulty));
  const safeCta = escapeXml(ctaText);
  const safeBadge = escapeXml(style.badgeText);

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="100%" stop-color="${style.footerBg}"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#000000" flood-opacity="0.10"/>
      </filter>
    </defs>

    <rect width="100%" height="100%" fill="url(#bg)"/>
    <circle cx="110" cy="120" r="70" fill="${style.heroGlow}" opacity="0.65"/>
    <circle cx="905" cy="170" r="110" fill="${style.accentSoft}" opacity="0.75"/>
    <circle cx="930" cy="1345" r="82" fill="${style.accentSoft}" opacity="0.60"/>
    <circle cx="80" cy="1365" r="56" fill="${style.heroGlow}" opacity="0.50"/>

    <rect x="34" y="34" width="932" height="1432" rx="34" fill="#FFFFFF" stroke="${style.frame}" stroke-width="4"/>

    <rect x="70" y="66" width="236" height="52" rx="26" fill="${style.accentSoft}"/>
    <text x="188" y="100" text-anchor="middle" font-size="24" font-family="Arial, sans-serif" font-weight="800" fill="${style.accentStrong}">${safeBadge}</text>

    <rect x="736" y="66" width="194" height="52" rx="26" fill="#FFFFFF" stroke="${style.frame}" stroke-width="2"/>
    <text x="833" y="100" text-anchor="middle" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#475569">${safeDifficulty}</text>

    <text x="78" y="178" font-size="56" font-family="Arial, sans-serif" font-weight="800" fill="#16202A">${safeTitle}</text>
    <text x="78" y="222" font-size="24" font-family="Arial, sans-serif" fill="#5B6472">Printable puzzle • clear lines • kid-friendly challenge</text>

    <rect x="78" y="252" width="410" height="42" rx="21" fill="${style.accentSoft}"/>
    <text x="102" y="280" font-size="21" font-family="Arial, sans-serif" font-weight="700" fill="${style.accentStrong}">Theme: ${safeTheme}</text>

    <g filter="url(#shadow)">
      <rect x="78" y="332" width="844" height="940" rx="34" fill="#FFFFFF" stroke="${style.frame}" stroke-width="6"/>
      <rect x="112" y="366" width="776" height="872" rx="26" fill="#FFFFFF" stroke="#EEF2F7" stroke-width="3"/>
    </g>

    <rect x="78" y="1312" width="844" height="102" rx="26" fill="${style.footerBg}" stroke="${style.frame}" stroke-width="2"/>
    <text x="500" y="1360" text-anchor="middle" font-size="28" font-family="Arial, sans-serif" font-weight="800" fill="#27313D">${safeCta}</text>
    <text x="500" y="1394" text-anchor="middle" font-size="18" font-family="Arial, sans-serif" fill="#667085">Save this printable for quiet time, travel, or classroom stations.</text>
  </svg>`;
}

function renderPaperFrameSvg(style) {
  return `
  <svg width="776" height="872" viewBox="0 0 776 872" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="776" height="872" rx="26" fill="#FFFFFF"/>
    <rect x="14" y="14" width="748" height="844" rx="20" fill="#FFFFFF" stroke="#EFF3F8" stroke-width="3"/>
    <circle cx="56" cy="54" r="7" fill="${style.accent}" opacity="0.55"/>
    <circle cx="720" cy="54" r="7" fill="${style.accent}" opacity="0.55"/>
    <circle cx="56" cy="818" r="7" fill="${style.accent}" opacity="0.55"/>
    <circle cx="720" cy="818" r="7" fill="${style.accent}" opacity="0.55"/>
  </svg>`;
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
    if (!categoryToPuzzleType(found.category)) {
      throw new Error(`Slot ${SLOT_ARG} is ${found.category}, which is not a supported deterministic puzzle type yet.`);
    }
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
    title: TITLE || getDefaultTitle(type, slot.theme || THEME),
    slug: SLUG_ARG || `${datePart}-${slotPart}-${themePart}-${type}`,
    activityDir: null,
    countdown: COUNTDOWN,
    words: WORDS,
  };
}

function buildDirectConfig() {
  const type = normalizeType(TYPE_ARG);
  if (!type) {
    throw new Error('Usage: --type maze|wordsearch --theme "Theme Name" [--difficulty medium] [--activity-dir existing-folder]');
  }

  return {
    source: 'direct',
    type,
    theme: THEME,
    difficulty: DIFFICULTY,
    title: TITLE || getDefaultTitle(type, THEME),
    slug: SLUG_ARG || `${slugify(THEME)}-${type === 'maze' ? 'maze-post' : 'wordsearch-post'}-${DIFFICULTY}`,
    activityDir: ACTIVITY_DIR_ARG ? path.resolve(ROOT, ACTIVITY_DIR_ARG) : null,
    countdown: COUNTDOWN,
    words: WORDS,
  };
}

async function buildPostImage(activityDir, activity, outputPath, type) {
  const sourcePuzzlePath = await ensurePuzzlePng(activityDir);
  const style = getStyleKit(type);
  const backgroundSvg = renderBackgroundSvg({
    width: 1000,
    height: 1500,
    theme: activity.theme || THEME,
    titleText: activity.titleText || activity.activityLabel || getDefaultTitle(type, activity.theme || THEME),
    difficulty: activity.difficulty || DIFFICULTY,
    ctaText: activity.ctaText || 'Save this for your next quiet-time printable',
    style,
  });

  const paperFrameSvg = renderPaperFrameSvg(style);
  const puzzleBuffer = await sharp(sourcePuzzlePath)
    .resize(730, 820, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 1000,
      height: 1500,
      channels: 4,
      background: '#FFFFFF',
    },
  })
    .composite([
      { input: Buffer.from(backgroundSvg), top: 0, left: 0 },
      { input: Buffer.from(paperFrameSvg), top: 366, left: 112 },
      { input: puzzleBuffer, top: 392, left: 135 },
    ])
    .png()
    .toFile(outputPath);
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
  const puzzleJsonName = config.type === 'maze' ? 'maze.json' : 'puzzle.json';
  const puzzlePath = path.join(activityDir, puzzleJsonName);
  const activity = JSON.parse(await fs.readFile(activityPath, 'utf8'));
  const puzzle = JSON.parse(await fs.readFile(puzzlePath, 'utf8'));

  const postPath = path.join(activityDir, 'post.png');
  const rawFolder = getRawFolder(config.type);
  const rawSuffix = config.source === 'manifest'
    ? `${manifestSafe(config.manifestDate)}-slot${String(config.slotIndex).padStart(2, '0')}-${slugify(activity.theme || config.theme)}`
    : slugify(activity.theme || config.theme || config.slug);
  const rawBase = `${config.type === 'maze' ? 'maze' : 'wordsearch'}-${rawSuffix}`;
  const rawImagePath = path.join(rawFolder, `${rawBase}.png`);
  const rawSidecarPath = path.join(rawFolder, `${rawBase}.json`);

  console.log(`[puzzle-post] activityDir: ${activityDir}`);
  console.log(`[puzzle-post] rawImage   : ${rawImagePath}`);

  if (DRY_RUN) {
    console.log('[puzzle-post] dry-run only, no files written.');
    return;
  }

  await fs.mkdir(rawFolder, { recursive: true });
  await buildPostImage(activityDir, activity, postPath, config.type);
  await fs.copyFile(postPath, rawImagePath);

  const sidecar = {
    category: config.type === 'maze' ? 'activity-maze' : 'activity-word-search',
    subject: config.title || getDefaultTitle(config.type, activity.theme || config.theme),
    hookText: activity.hookText || activity.titleText || '',
    difficulty: puzzle.difficulty || activity.difficulty || config.difficulty,
    theme: activity.theme || config.theme,
    source: config.source === 'manifest' ? 'puzzle-generator-manifest' : 'puzzle-generator',
    sourceFolder: path.relative(ROOT, activityDir).replace(/\\/g, '/'),
    puzzleType: config.type,
    titleText: activity.titleText || '',
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
    for (const slot of targets) {
      await processOne(buildConfigFromManifestSlot(manifest, slot));
    }
    return;
  }

  await processOne(buildDirectConfig());
}

main().catch((error) => {
  console.error('[puzzle-post] failed:', error.message);
  process.exit(1);
});

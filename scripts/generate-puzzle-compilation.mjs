#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASMR_DIR = path.join(ROOT, 'output', 'asmr');
const PUZZLE_COMPILATION_DIR = path.join(ROOT, 'output', 'longform', 'puzzle-compilation');
const SUNO_POOL_PATH = path.join(ROOT, 'config', 'suno-prompt-pool.json');
const DEFAULT_CHAPTER_DURATION_SEC = 75;
const DEFAULT_COUNT = 45;
const FALLBACK_PROMPT = "calm playful children's background music, loop-friendly, no lyrics, 60 minutes";

const args = process.argv.slice(2);
const SAVE = args.includes('--save');
const DRY_RUN = args.includes('--dry-run');

const requestedCount = (() => {
  const index = args.indexOf('--count');
  if (index === -1) {
    return DEFAULT_COUNT;
  }

  const value = Number.parseInt(args[index + 1], 10);
  return Number.isFinite(value) && value > 0 ? value : NaN;
})();

const requestedType = (() => {
  const index = args.indexOf('--type');
  return index !== -1 ? args[index + 1] : '';
})();

if (!Number.isFinite(requestedCount)) {
  console.error('Usage: --count must be a positive integer');
  process.exit(1);
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeRelativePath(targetPath) {
  return targetPath.replace(/\\/g, '/');
}

async function loadSunoPool() {
  try {
    return JSON.parse(await fs.readFile(SUNO_POOL_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function getLowestUsedPoolEntry(sunoPool, poolType) {
  const entries = sunoPool?.pools?.[poolType];
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  return [...entries].sort((a, b) => {
    const usedDiff = (a.usedCount ?? 0) - (b.usedCount ?? 0);
    if (usedDiff !== 0) {
      return usedDiff;
    }
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  })[0];
}

function incrementPoolUsage(sunoPool, poolType, poolId) {
  if (!sunoPool?.pools?.[poolType] || !poolId) {
    return sunoPool;
  }

  const entry = sunoPool.pools[poolType].find((item) => item.id === poolId);
  if (entry) {
    entry.usedCount = (entry.usedCount ?? 0) + 1;
  }

  return sunoPool;
}

async function scanActivities() {
  let directories = [];

  try {
    directories = await fs.readdir(ASMR_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const validActivities = [];

  for (const entry of directories) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      const folderPath = path.join(ASMR_DIR, entry.name);
      const activityPath = path.join(folderPath, 'activity.json');
      const blankPath = path.join(folderPath, 'blank.png');
      const solvedPath = path.join(folderPath, 'solved.png');

      let activity = null;
      try {
        activity = JSON.parse(await fs.readFile(activityPath, 'utf-8'));
      } catch {
        continue;
      }

      const hasBlank = await fileExists(blankPath);
      const hasSolved = await fileExists(solvedPath);
      if (!hasBlank || !hasSolved) {
        continue;
      }

      validActivities.push({
        folder: normalizeRelativePath(path.relative(ROOT, folderPath)),
        title: activity?.title || entry.name,
        type: activity?.type || activity?.revealType || 'unknown',
        hookText: activity?.hookText || '',
      });
    } catch {
      continue;
    }
  }

  return validActivities;
}

function shuffleInPlace(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }

  return items;
}

function pickActivities(validActivities, typeFilter, count) {
  const filtered = typeFilter
    ? validActivities.filter((entry) => entry.type === typeFilter)
    : [...validActivities];

  const shuffled = shuffleInPlace([...filtered]);
  const picked = shuffled.slice(0, count);

  return {
    filtered,
    picked,
    warning: filtered.length < count
      ? `Only ${filtered.length} valid activities available${typeFilter ? ` for type "${typeFilter}"` : ''}; using all available.`
      : '',
  };
}

function buildCompilationJson(picked, selectedPoolEntry, typeFilter) {
  const today = new Date().toISOString().slice(0, 10);
  const typeLabel = typeFilter ? `${typeFilter}s` : 'puzzles';
  const title = `1 Hour of ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} for Kids`;
  const slug = `1-hour-${typeLabel}-${today}`;
  const chapters = picked.map((entry, index) => ({
    chapterNumber: index + 1,
    activityFolder: entry.folder,
    activityType: entry.type,
    chapterTitle: entry.title,
    durationSec: DEFAULT_CHAPTER_DURATION_SEC,
  }));
  const totalDurationSec = chapters.reduce((sum, chapter) => sum + chapter.durationSec, 0);

  return {
    format: 'puzzle-compilation',
    title,
    slug,
    date: today,
    backgroundMusicSunoPrompt: selectedPoolEntry?.prompt || FALLBACK_PROMPT,
    backgroundMusicDropPath: 'background.mp3',
    chapters,
    totalDurationSec,
    rendered: false,
  };
}

function printSummary({ validCount, filteredCount, compilation, picked, warning, dryRun }) {
  console.log('\n  JoyMaze Puzzle Compilation Planner');
  console.log(`  Total valid activities found: ${validCount}`);
  console.log(`  Activities after type filter: ${filteredCount}`);

  if (warning) {
    console.log(`  Warning: ${warning}`);
  }

  console.log(`  Would pick ${picked.length} chapters (~${(compilation.totalDurationSec / 60).toFixed(1)} min)`);
  console.log(`  Title: ${compilation.title}`);
  console.log(`  Slug: ${compilation.slug}`);
  console.log('  Chapters:');

  if (picked.length === 0) {
    console.log('  - None');
  } else {
    picked.forEach((entry, index) => {
      console.log(`  - ${index + 1}. ${entry.title} [${entry.type}]`);
    });
  }

  console.log('  Suno background prompt:');
  console.log(`  ${compilation.backgroundMusicSunoPrompt}`);

  if (dryRun) {
    console.log('  Dry run complete. No files written.');
  } else {
    console.log('  Run with --save to write compilation.json');
  }
}

async function main() {
  const sunoPool = await loadSunoPool();
  const selectedPoolEntry = getLowestUsedPoolEntry(sunoPool, 'puzzle_compilation_bgm');
  const validActivities = await scanActivities();
  const { filtered, picked, warning } = pickActivities(validActivities, requestedType, requestedCount);
  const compilation = buildCompilationJson(picked, selectedPoolEntry, requestedType);

  if (DRY_RUN) {
    printSummary({
      validCount: validActivities.length,
      filteredCount: filtered.length,
      compilation,
      picked,
      warning,
      dryRun: true,
    });
    return;
  }

  printSummary({
    validCount: validActivities.length,
    filteredCount: filtered.length,
    compilation,
    picked,
    warning,
    dryRun: false,
  });

  if (!SAVE) {
    return;
  }

  const outputDir = path.join(PUZZLE_COMPILATION_DIR, compilation.slug);

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, 'compilation.json'),
      `${JSON.stringify(compilation, null, 2)}\n`,
    );
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }

  if (sunoPool && selectedPoolEntry?.id) {
    try {
      incrementPoolUsage(sunoPool, 'puzzle_compilation_bgm', selectedPoolEntry.id);
      await fs.writeFile(SUNO_POOL_PATH, `${JSON.stringify(sunoPool, null, 2)}\n`);
    } catch {}
  }

  console.log(`  Saved to: ${normalizeRelativePath(path.relative(ROOT, outputDir))}/`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

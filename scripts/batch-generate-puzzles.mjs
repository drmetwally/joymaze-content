#!/usr/bin/env node

/**
 * Batch-generate puzzle collections — only puzzle.png output.
 *
 * Usage:
 *   node scripts/batch-generate-puzzles.mjs
 *   node scripts/batch-generate-puzzles.mjs --dry-run
 *   node scripts/batch-generate-puzzles.mjs --theme "monster truck" --count 15
 *
 * Outputs: output/puzzle-collection/{theme-slug}/ws-01.png … ws-15.png + maze-01.png … maze-15.png
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getArg = (f, def = null) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] ?? def : def; };

const DRY_RUN   = hasFlag('--dry-run');
const THEME     = getArg('--theme', 'monster truck');
const COUNT     = parseInt(getArg('--count', '15'), 10);
const WS_DIFF   = getArg('--ws-difficulty', 'medium');
const MAZE_DIFF = getArg('--maze-difficulty', 'hard');

const themeSlug = THEME.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const COLLECTION_DIR = path.join(ROOT, 'output', 'puzzle-collection', themeSlug);

// 60 unique monster-truck-themed words — 15 groups of 5
const WORD_GROUPS = [
  ['TRUCK',  'WHEEL',  'CRUSH',  'BOOST',  'SPEED'],
  ['FLAME',  'BEAST',  'TURBO',  'GIANT',  'SMASH'],
  ['RALLY',  'NITRO',  'ROAR',   'DRIFT',  'JUMP'],
  ['POWER',  'REBEL',  'MOTOR',  'CLASH',  'THUMP'],
  ['BLAZE',  'STORM',  'TITAN',  'GRIND',  'RUMBLE'],
  ['CRUNCH', 'LAUNCH', 'BLAST',  'SHIFT',  'GRAVEL'],
  ['TROPHY', 'DIESEL', 'CHROME', 'SPIKE',  'COBRA'],
  ['ROCKET', 'VIPER',  'IRON',   'FURY',   'RACER'],
  ['ARENA',  'GROWL',  'DIRT',   'GEARS',  'VAULT'],
  ['HOWL',   'CAGE',   'AXLE',   'SKID',   'BRAKE'],
  ['GAUGE',  'HERO',   'HORNS',  'PISTON', 'RIVAL'],
  ['HEAT',   'GRIT',   'DRIVE',  'SURGE',  'BRAWL'],
  ['TRACK',  'GLIDE',  'POUND',  'CHAMP',  'CROWN'],
  ['PRIZE',  'GLORY',  'BONK',   'ZOOM',   'SPIN'],
  ['WHAM',   'BANG',   'FLEX',   'ROMP',   'SLAM'],
];

async function copyPuzzle(srcDir, destFile) {
  const src = path.join(srcDir, 'puzzle.png');
  await fs.mkdir(path.dirname(destFile), { recursive: true });
  await fs.copyFile(src, destFile);
}

async function main() {
  const n = Math.min(COUNT, WORD_GROUPS.length);
  console.log(`\n=== Batch puzzle generator ===`);
  console.log(`Theme: ${THEME}  Count: ${n}  WS diff: ${WS_DIFF}  Maze diff: ${MAZE_DIFF}`);
  console.log(`Output: ${COLLECTION_DIR}`);
  if (DRY_RUN) console.log('DRY RUN — no files will be written\n');
  console.log('');

  // ── Word Search ──────────────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const pad  = String(i + 1).padStart(2, '0');
    const slug = `ws-${themeSlug}-${pad}`;
    const words = WORD_GROUPS[i].join(',');
    const outDir = path.join(ROOT, 'output', 'challenge', 'generated-activity', slug);

    const cmd = [
      'node', 'scripts/generate-wordsearch-assets.mjs',
      '--theme',      JSON.stringify(THEME),
      '--title',      JSON.stringify(`${THEME} Word Search`),
      '--difficulty', WS_DIFF,
      '--words',      words,
      '--slug',       slug,
      '--force',
    ].join(' ');

    console.log(`[ws ${pad}/${n}] ${words}`);
    if (!DRY_RUN) {
      execSync(cmd, { stdio: 'inherit', cwd: ROOT });
      await copyPuzzle(outDir, path.join(COLLECTION_DIR, `ws-${pad}.png`));
      console.log(`  → ws-${pad}.png`);
    } else {
      console.log(`  [dry-run] ${cmd}`);
    }
  }

  // ── Maze ─────────────────────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const pad  = String(i + 1).padStart(2, '0');
    const slug = `maze-${themeSlug}-${MAZE_DIFF}-${pad}`;
    const seed = 1000 + i;
    const outDir = path.join(ROOT, 'output', 'challenge', 'generated-activity', slug);

    const cmd = [
      'node', 'scripts/generate-maze-assets.mjs',
      '--theme',      JSON.stringify(THEME),
      '--title',      JSON.stringify(`${THEME} Maze`),
      '--difficulty', MAZE_DIFF,
      '--seed',       seed,
      '--slug',       slug,
      '--force',
    ].join(' ');

    console.log(`[maze ${pad}/${n}] seed=${seed}`);
    if (!DRY_RUN) {
      execSync(cmd, { stdio: 'inherit', cwd: ROOT });
      await copyPuzzle(outDir, path.join(COLLECTION_DIR, `maze-${pad}.png`));
      console.log(`  → maze-${pad}.png`);
    } else {
      console.log(`  [dry-run] ${cmd}`);
    }
  }

  console.log(`\n=== Done ===`);
  if (!DRY_RUN) {
    console.log(`${n} word searches + ${n} mazes → ${COLLECTION_DIR}`);
    const files = await fs.readdir(COLLECTION_DIR);
    console.log(`Files: ${files.join(', ')}`);
  }
}

main().catch(err => {
  console.error('[batch] failed:', err);
  process.exit(1);
});

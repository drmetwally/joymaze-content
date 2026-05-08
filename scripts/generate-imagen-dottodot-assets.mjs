#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getArg = (f, def = null) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] ?? def : def;
};

const THEME       = getArg('--theme', 'monster truck');
const DIFFICULTY  = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const TITLE       = getArg('--title', `${THEME} Dot to Dot`);
const SEED        = getArg('--seed');
const SLUG        = getArg('--slug');
const FORCE       = hasFlag('--force');
const DRY_RUN     = hasFlag('--dry-run');

async function main() {
  const themeSlug = THEME.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const finalSlug = SLUG || `imagen-dottodot-${themeSlug}-${DIFFICULTY}`;
  
  const outDir = path.join('output', 'challenge', 'generated-activity', finalSlug);
  const coloringDir = path.join('output', 'challenge', 'generated-activity', `${finalSlug}-coloring-tmp`);

  // Step 1: Generate coloring page via Imagen
  const coloringCmd = [
    'node', 'scripts/generate-coloring-assets.mjs',
    '--imagen',
    '--theme', JSON.stringify(THEME),
    '--title', JSON.stringify(TITLE),
    '--difficulty', DIFFICULTY,
    '--out-dir', coloringDir,
    SEED ? `--seed ${SEED}` : '',
    FORCE ? '--force' : '',
    DRY_RUN ? '--dry-run' : '',
  ].filter(Boolean).join(' ');

  console.log(`[imagen-dottodot] Step 1: generating coloring page...`);
  if (DRY_RUN) console.log(`[dry-run] ${coloringCmd}`);
  execSync(coloringCmd, { stdio: 'inherit', cwd: ROOT });

  if (DRY_RUN) {
    console.log(`[imagen-dottodot] dry-run — skipping Step 2`);
    return;
  }

  // Step 2: Extract dot-to-dot from coloring page
  const sourceImage = path.join(coloringDir, 'blank.png');
  const dottodotCmd = [
    'node', 'scripts/generate-dottodot-from-image.mjs',
    '--source-image', sourceImage,
    '--theme', JSON.stringify(THEME),
    '--title', JSON.stringify(TITLE),
    '--difficulty', DIFFICULTY,
    '--out-dir', outDir,
    '--force', // Always force in the combined pipeline because we just generated a new source
  ].join(' ');

  console.log(`[imagen-dottodot] Step 2: extracting dot-to-dot...`);
  execSync(dottodotCmd, { stdio: 'inherit', cwd: ROOT });

  console.log(`[imagen-dottodot] done → ${outDir}`);
}

main().catch(err => {
  console.error('[imagen-dottodot] failed:', err);
  process.exit(1);
});
#!/usr/bin/env node
/**
 * seed-library-index.mjs — Bootstrap the universal asset library index.
 *
 * Reads the existing matching sticker library at assets/stickers/matching/index.json
 * and seeds it into the new assets/library/index.json under the 'character' role.
 * Also scans assets/generated/coloring-pages/<theme>/ for 'scene' entries.
 *
 * Idempotent — safe to re-run; won't duplicate entries.
 * Run: node scripts/seed-library-index.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Load existing matching sticker index ────────────────────────────────────────

const STICKER_INDEX = path.join(ROOT, 'public', 'assets', 'stickers', 'matching', 'index.json');

// ── Helpers ─────────────────────────────────────────────────────────────────────

async function fileExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function addChar(theme, charName, { added, errors }) {
  const absPath = path.join(ROOT, 'public', 'assets', 'stickers', 'matching', theme, `${charName}.png`);
  if (!(await fileExists(absPath))) {
    errors.push(`${theme}/${charName}.png — file not found, skipping`);
    return;
  }
  const { addToIndex } = await import('./lib/asset-library.mjs');
  await addToIndex(theme, 'character', absPath);
  added.push(`${theme}/character/${charName}`);
}

async function addScene(absPath, theme, { added, errors }) {
  if (!(await fileExists(absPath))) {
    errors.push(`${absPath} — file not found, skipping`);
    return;
  }
  const { addToIndex } = await import('./lib/asset-library.mjs');
  await addToIndex(theme, 'scene', absPath);
  added.push(`${theme}/scene/${path.basename(absPath)}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[seed-library] Scanning matching sticker library...\n');

  const stickerData = JSON.parse(await fs.readFile(STICKER_INDEX, 'utf8'));
  const themes = stickerData.themes ?? {};

  const stats = { added: [], errors: [] };
  let charCount = 0;
  let sceneCount = 0;

  // 1. Seed character entries from matching sticker library
  for (const [theme, characters] of Object.entries(themes)) {
    for (const charName of characters) {
      await addChar(theme, charName, stats);
      charCount++;
    }
  }

  // 2. Seed scene entries from existing coloring-page assets
  const coloringRoot = path.join(ROOT, 'assets', 'generated', 'coloring-pages');
  try {
    const themeDirs = await fs.readdir(coloringRoot);
    for (const themeDir of themeDirs) {
      if (themeDir === 'staging') continue; // skip staging
      const mainDir = path.join(coloringRoot, themeDir);
      try {
        const files = (await fs.readdir(mainDir))
          .filter(f => f.toLowerCase().endsWith('.png'));
        for (const file of files) {
          await addScene(path.join(mainDir, file), themeDir, stats);
          sceneCount++;
        }
      } catch {
        // empty or not a directory
      }
    }
  } catch {
    // coloring-pages directory doesn't exist yet — no scene entries to seed
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const { assetLibraryHealth } = await import('./lib/asset-library.mjs');
  const health = await assetLibraryHealth();

  console.log(`[seed-library] Done.`);
  console.log(`  Characters seeded: ${charCount}`);
  console.log(`  Scenes seeded: ${sceneCount}`);
  if (stats.errors.length > 0) {
    console.log(`  Errors (non-fatal):`);
    stats.errors.forEach(e => console.log(`    - ${e}`));
  }
  console.log('');
  console.log('[seed-library] Index summary:');
  for (const [theme, roles] of Object.entries(health)) {
    const chars = roles.character ?? 0;
    const scenes = roles.scene ?? 0;
    console.log(`  ${theme}: ${chars} characters, ${scenes} scenes`);
  }
}

main().catch(err => {
  console.error('[seed-library] Fatal:', err);
  process.exit(1);
});
#!/usr/bin/env node

/**
 * render-batch.mjs — Batch video renderer for Phase 0 daily gate
 *
 * Scans output/stories/ and output/asmr/ for folders that have their source
 * assets but no rendered video yet. Renders each pending folder using the
 * existing generate-story-video.mjs and generate-asmr-video.mjs scripts.
 *
 * "Already rendered" check: looks for any .mp4 in output/videos/ containing
 * the folder's slug identifier. Won't re-render if a video was made on a
 * previous day.
 *
 * Phase 0 targets: ≥1 story video + ≥1 ASMR video per day.
 *
 * Usage:
 *   node scripts/render-batch.mjs              # render all pending
 *   node scripts/render-batch.mjs --dry-run    # scan + report without rendering
 *   node scripts/render-batch.mjs --story-only # stories only
 *   node scripts/render-batch.mjs --asmr-only  # ASMR only
 *   node scripts/render-batch.mjs --force      # re-render even if video exists
 *
 * Every invocation respects --dry-run from child script perspective too.
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const STORIES   = path.join(ROOT, 'output', 'stories');
const ASMR      = path.join(ROOT, 'output', 'asmr');
const VIDEOS    = path.join(ROOT, 'output', 'videos');

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const STORY_ONLY = args.includes('--story-only');
const ASMR_ONLY  = args.includes('--asmr-only');
const FORCE      = args.includes('--force');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function listFolders(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch { return []; }
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// Returns true if output/videos/ already has a .mp4 containing `slug`
async function videoExists(slug) {
  try {
    const files = await fs.readdir(VIDEOS);
    return files.some(f => f.includes(slug) && f.endsWith('.mp4'));
  } catch { return false; }
}

// Read JSON from a file, return null on failure
async function readJson(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); }
  catch { return null; }
}

// Run a child script, streaming output to stdout
function run(cmd) {
  console.log(`\n  > ${cmd}`);
  if (DRY_RUN) {
    console.log('    [dry-run] skipped');
    return;
  }
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', timeout: 300_000 });
  } catch (err) {
    console.error(`  ✗ Command failed: ${err.message}`);
  }
}

// ─── Story scanner ────────────────────────────────────────────────────────────

async function pendingStories() {
  const folders = await listFolders(STORIES);
  const pending = [];

  for (const folder of folders) {
    const dir      = path.join(STORIES, folder);
    const jsonPath = path.join(dir, 'story.json');

    // Needs story.json
    if (!(await fileExists(jsonPath))) continue;

    // Needs at least one slide image (01.png is always first slide)
    const hasImage = await fileExists(path.join(dir, '01.png'));
    if (!hasImage) {
      console.log(`  [skip] ${folder} — no slide images yet (drop 01.png … NN.png)`);
      continue;
    }

    const meta = await readJson(jsonPath);
    const ep   = meta?.episode ?? '??';
    const epPad = String(ep).padStart(2, '0');
    // Story video slug: story-ep01 (any date prefix)
    const slug = `story-ep${epPad}`;

    if (!FORCE && (await videoExists(slug))) {
      console.log(`  [done]  ${folder} → ${slug}.mp4 already rendered`);
      continue;
    }

    pending.push({ folder, slug, jsonPath });
  }

  return pending;
}

// ─── ASMR scanner ─────────────────────────────────────────────────────────────

async function pendingAsmr() {
  const folders = await listFolders(ASMR);
  const pending = [];

  for (const folder of folders) {
    const dir      = path.join(ASMR, folder);
    const jsonPath = path.join(dir, 'activity.json');

    // Needs activity.json
    if (!(await fileExists(jsonPath))) continue;

    const meta = await readJson(jsonPath);
    const type = meta?.type ?? 'coloring';

    // Check for required image pair
    const isColoring = type === 'coloring';
    const blankFile  = isColoring ? 'blank.png'  : 'maze.png';
    const solvedFile = isColoring ? 'colored.png' : 'solved.png';

    const hasBlank  = await fileExists(path.join(dir, blankFile));
    const hasSolved = await fileExists(path.join(dir, solvedFile));

    if (!hasBlank || !hasSolved) {
      const missing = [!hasBlank && blankFile, !hasSolved && solvedFile].filter(Boolean);
      console.log(`  [skip] ${folder} — missing images: ${missing.join(', ')}`);
      continue;
    }

    // ASMR video slug: asmr-{folder} (any date prefix)
    const slug = `asmr-${folder}`;

    if (!FORCE && (await videoExists(slug))) {
      console.log(`  [done]  ${folder} → ${slug}.mp4 already rendered`);
      continue;
    }

    pending.push({ folder, slug, type });
  }

  return pending;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nRender Batch${DRY_RUN ? ' [DRY RUN]' : ''} — ${new Date().toISOString().slice(0, 10)}`);
  console.log('─'.repeat(60));

  const dryFlag    = DRY_RUN ? ' --dry-run' : '';
  let storiesCount = 0;
  let asmrCount    = 0;

  // ── Stories ────────────────────────────────────────────────────────────────
  if (!ASMR_ONLY) {
    console.log('\nStories:');
    const stories = await pendingStories();

    if (stories.length === 0) {
      console.log('  none pending');
    } else {
      for (const { folder } of stories) {
        run(`node scripts/generate-story-video.mjs --story ${folder} --remotion${dryFlag}`);
        storiesCount++;
      }
    }
  }

  // ── ASMR ───────────────────────────────────────────────────────────────────
  if (!STORY_ONLY) {
    console.log('\nASMR:');
    const asmrPending = await pendingAsmr();

    if (asmrPending.length === 0) {
      console.log('  none pending');
    } else {
      for (const { folder } of asmrPending) {
        run(`node scripts/generate-asmr-video.mjs --asmr ${folder} --remotion${dryFlag}`);
        asmrCount++;
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  if (DRY_RUN) {
    console.log(`Dry run complete: ${storiesCount} stories + ${asmrCount} ASMR videos would be rendered`);
  } else {
    console.log(`Batch complete: ${storiesCount} stories + ${asmrCount} ASMR videos rendered`);
  }
  console.log();
}

main().catch(err => { console.error(err.message); process.exit(1); });

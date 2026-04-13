#!/usr/bin/env node

/**
 * prepend-hook.mjs — Prepend a HookIntro clip to an existing story video
 *
 * Renders a short HookIntro composition via Remotion, then FFmpeg-concats it
 * to the front of a story (or any) video. Output replaces or renames the input.
 *
 * Usage:
 *   node scripts/prepend-hook.mjs --video output/videos/2026-04-13-story-ep01-remotion.mp4
 *   node scripts/prepend-hook.mjs --video ... --headline "Can your kid solve this?"
 *   node scripts/prepend-hook.mjs --video ... --headline "..." --subline "Screen-free fun"
 *   node scripts/prepend-hook.mjs --video ... --out output/videos/final-ep01.mp4
 *   node scripts/prepend-hook.mjs --video ... --dry-run
 *
 * Defaults:
 *   --headline  Auto-extracted from queue JSON for the video, or generic fallback
 *   --subline   "Screen-free fun for ages 4–8"
 *   --out       Original video path (overwrites with hook prepended)
 *
 * FFmpeg path: D:/Dev/ffmpeg/ffmpeg.exe (with PATH fallback)
 */

import 'dotenv/config';
import fs     from 'fs/promises';
import path   from 'path';
import os     from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] ?? null : null; };
const hasFlag = (f) => args.includes(f);

const videoArg   = getArg('--video');
const headlineArg = getArg('--headline');
const sublineArg  = getArg('--subline') ?? 'Screen-free fun for ages 4–8';
const outArg      = getArg('--out');
const DRY_RUN     = hasFlag('--dry-run');

if (!videoArg) {
  console.error('Usage: node scripts/prepend-hook.mjs --video <path> [--headline "..."] [--out <path>]');
  process.exit(1);
}

// ─── FFmpeg resolver ──────────────────────────────────────────────────────────
function findFfmpeg() {
  const candidates = [
    'D:/Dev/ffmpeg/ffmpeg.exe',
    'D:/Dev/ffmpeg/bin/ffmpeg.exe',
    '/usr/bin/ffmpeg',
    'ffmpeg',
  ];
  for (const c of candidates) {
    try { execSync(`"${c}" -version`, { stdio: 'ignore' }); return c; } catch { /* try next */ }
  }
  throw new Error('FFmpeg not found. Install it or add to PATH.');
}

// ─── Queue JSON scanner — try to auto-extract headline from queue metadata ───
async function autoHeadline(videoPath) {
  const videoFile = path.basename(videoPath, '.mp4');
  const queueDir  = path.join(ROOT, 'output', 'queue');
  try {
    const files = await fs.readdir(queueDir);
    for (const f of files) {
      if (!f.endsWith('.json') || f.startsWith('x-text-')) continue;
      const items = JSON.parse(await fs.readFile(path.join(queueDir, f), 'utf-8'));
      const match = Array.isArray(items)
        ? items.find(i => i.outputFile === `${videoFile}.mp4` || i.id === videoFile)
        : null;
      if (match?.hookText) return match.hookText;
    }
  } catch { /* no queue found */ }

  // Fallback: derive from video filename
  if (videoFile.includes('story-ep')) return 'A story for your little one ✨';
  if (videoFile.includes('asmr'))     return 'Watch this to the end 👀';
  return 'Your kid will love this 🧩';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const videoPath  = path.isAbsolute(videoArg) ? videoArg : path.join(ROOT, videoArg);
  const finalOut   = outArg
    ? (path.isAbsolute(outArg) ? outArg : path.join(ROOT, outArg))
    : videoPath; // overwrite original by default

  // Verify source video exists
  try { await fs.access(videoPath); } catch {
    console.error(`✗ Source video not found: ${videoPath}`);
    process.exit(1);
  }

  const headline = headlineArg ?? await autoHeadline(videoPath);
  const subline  = sublineArg;

  console.log('\n🎬  Prepend Hook');
  console.log(`    Source  : ${videoPath}`);
  console.log(`    Headline: "${headline}"`);
  console.log(`    Subline : "${subline}"`);
  console.log(`    Output  : ${finalOut}`);

  if (DRY_RUN) {
    console.log('\n    [dry-run] — render + concat skipped.\n');
    return;
  }

  const ffmpeg   = findFfmpeg();
  const tempDir  = path.join(ROOT, 'output', '.hook-temp');
  await fs.mkdir(tempDir, { recursive: true });

  const hookPath = path.join(tempDir, `hook-${Date.now()}.mp4`);

  // ── Step 1: Render HookIntro ──
  console.log('\n    Step 1/3: Rendering HookIntro...');
  const props = JSON.stringify({ headline, subline: subline });
  execSync(
    `node scripts/render-video.mjs --comp HookIntro --props ${JSON.stringify(props)} --out "${hookPath}"`,
    { cwd: ROOT, stdio: 'inherit', timeout: 180_000 }
  );

  // ── Step 2: Write concat list ──
  const listPath = path.join(tempDir, 'concat-list.txt');
  await fs.writeFile(listPath, `file '${hookPath}'\nfile '${videoPath}'\n`);

  // ── Step 3: FFmpeg concat ──
  const concatOut = path.join(tempDir, `concat-${Date.now()}.mp4`);
  console.log('\n    Step 2/3: Concatenating...');
  execSync(
    `"${ffmpeg}" -f concat -safe 0 -i "${listPath}" -c copy "${concatOut}" -y`,
    { cwd: ROOT, stdio: 'inherit', timeout: 120_000 }
  );

  // ── Step 4: Move to final output ──
  await fs.rename(concatOut, finalOut);

  // ── Cleanup ──
  await fs.rm(hookPath, { force: true });
  await fs.rm(listPath, { force: true });
  try { await fs.rmdir(tempDir); } catch { /* not empty — fine */ }

  console.log(`\n    ✓ Done → ${finalOut}\n`);
}

main().catch(err => { console.error('\n✗', err.message); process.exit(1); });

#!/usr/bin/env node

/**
 * JoyMaze Content — Queue Archive
 *
 * Moves old queue items (JSON + images) to output/archive/{date}/ so each day
 * starts with a clean queue.
 *
 * Usage:
 *   node scripts/archive-queue.mjs              # Archive items from previous days
 *   node scripts/archive-queue.mjs --all        # Archive everything (including today)
 *   node scripts/archive-queue.mjs --dry-run    # Preview what would be archived
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const IMAGES_DIR = path.join(ROOT, 'output', 'images');
const RAW_DIR = path.join(ROOT, 'output', 'raw');
const ARCHIVE_DIR = path.join(ROOT, 'output', 'archive');
const ASMR_DIR = path.join(ROOT, 'output', 'asmr');
const STORIES_DIR = path.join(ROOT, 'output', 'stories');
const VIDEOS_DIR = path.join(ROOT, 'output', 'videos');
const PROMPTS_DIR = path.join(ROOT, 'output', 'prompts');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ARCHIVE_ALL = args.includes('--all');

const TODAY = new Date().toISOString().slice(0, 10);

async function moveFile(src, dest) {
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Cross-device: copy + delete
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    } else {
      throw err;
    }
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n=== JoyMaze Queue Archive ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Today: ${TODAY}`);
  console.log(`Archive scope: ${ARCHIVE_ALL ? 'ALL items' : 'Items older than today'}\n`);

  // Read queue
  let queueFiles;
  try {
    queueFiles = (await fs.readdir(QUEUE_DIR)).filter(f => f.endsWith('.json'));
  } catch {
    console.log('Queue directory not found. Nothing to archive.');
    return;
  }

  if (queueFiles.length === 0) {
    console.log('Queue is empty. Continuing with other sweeps...');
  }

  if (queueFiles.length > 0) console.log(`Found ${queueFiles.length} item(s) in queue.\n`);

  const summary = {}; // { date: count }
  let archived = 0;
  let skipped = 0;

  for (const file of queueFiles) {
    // x-text files are arrays managed by post-x-scheduled.mjs (posted flags per entry)
    if (file.startsWith('x-text-')) {
      console.log(`  Skip: ${file} (x-text — managed by post-x-scheduled.mjs)`);
      skipped++;
      continue;
    }

    const filePath = path.join(QUEUE_DIR, file);
    let metadata;
    try {
      metadata = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    } catch (err) {
      console.log(`  Skipping ${file} (invalid JSON: ${err.message})`);
      skipped++;
      continue;
    }

    const itemDate = metadata.generatedAt?.slice(0, 10) || 'unknown';

    // Skip today's items unless --all
    if (!ARCHIVE_ALL && itemDate >= TODAY) {
      console.log(`  Skip: ${metadata.id} (today — ${itemDate})`);
      skipped++;
      continue;
    }

    const archiveDateDir = path.join(ARCHIVE_DIR, itemDate);
    const archiveImagesDir = path.join(archiveDateDir, 'images');

    console.log(`  Archive: ${metadata.id} (${itemDate})`);

    if (!DRY_RUN) {
      // Move JSON metadata
      await moveFile(filePath, path.join(archiveDateDir, file));

      // Move associated images
      if (metadata.outputs) {
        for (const [platform, filename] of Object.entries(metadata.outputs)) {
          const imgSrc = path.join(IMAGES_DIR, filename);
          if (await fileExists(imgSrc)) {
            await moveFile(imgSrc, path.join(archiveImagesDir, filename));
            console.log(`    Moved image: ${filename} (${platform})`);
          }
        }
      }

      // Move source raw file if tracked
      if (metadata.sourceFile) {
        const rawSrc = path.join(RAW_DIR, metadata.sourceFile);
        if (await fileExists(rawSrc)) {
          const archiveRawDir = path.join(archiveDateDir, 'raw');
          await moveFile(rawSrc, path.join(archiveRawDir, metadata.sourceFile));
          console.log(`    Moved raw: ${metadata.sourceFile}`);
        }
      }
    }

    summary[itemDate] = (summary[itemDate] || 0) + 1;
    archived++;
  }

  // Sweep remaining raw files — move any leftover files not already archived
  // Scans both RAW_DIR root and one level of subdirectories (e.g. raw/story/, raw/activity/)
  let rawArchived = 0;
  try {
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.tiff'];
    const rawEntries = await fs.readdir(RAW_DIR, { withFileTypes: true });

    // Build list of { rawFile (basename), rawPath (absolute) }
    const candidates = [];
    for (const entry of rawEntries) {
      if (entry.isDirectory()) {
        const subDir = path.join(RAW_DIR, entry.name);
        const subFiles = await fs.readdir(subDir);
        for (const f of subFiles) {
          if (imageExts.includes(path.extname(f).toLowerCase())) {
            candidates.push({ rawFile: f, rawPath: path.join(subDir, f) });
          }
        }
      } else if (imageExts.includes(path.extname(entry.name).toLowerCase())) {
        candidates.push({ rawFile: entry.name, rawPath: path.join(RAW_DIR, entry.name) });
      }
    }

    for (const { rawFile, rawPath } of candidates) {
      const stat = await fs.stat(rawPath);
      const fileDate = stat.mtime.toISOString().slice(0, 10);

      // Only archive raw files from before today
      if (!ARCHIVE_ALL && fileDate >= TODAY) continue;

      const archiveRawDir = path.join(ARCHIVE_DIR, fileDate, 'raw');
      console.log(`  Archive raw: ${rawFile} → ${fileDate}/raw/`);
      if (!DRY_RUN) {
        await moveFile(rawPath, path.join(archiveRawDir, rawFile));
      }
      rawArchived++;
    }
  } catch { /* no raw dir */ }

  // Sweep ASMR briefs — move folders from output/asmr/ to output/archive/asmr/
  let asmrArchived = 0;
  try {
    const asmrEntries = await fs.readdir(ASMR_DIR, { withFileTypes: true });
    for (const entry of asmrEntries) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(ASMR_DIR, entry.name);

      // Determine date: read activity.json generatedAt, fall back to folder mtime
      let folderDate;
      try {
        const meta = JSON.parse(await fs.readFile(path.join(folderPath, 'activity.json'), 'utf-8'));
        folderDate = (meta.generatedAt || meta.createdAt || '').slice(0, 10);
      } catch {}
      if (!folderDate) {
        const stat = await fs.stat(folderPath);
        folderDate = stat.mtime.toISOString().slice(0, 10);
      }

      if (!ARCHIVE_ALL && folderDate >= TODAY) {
        console.log(`  Skip ASMR: ${entry.name} (today — ${folderDate})`);
        continue;
      }

      const dest = path.join(ARCHIVE_DIR, 'asmr', entry.name);
      console.log(`  Archive ASMR: ${entry.name} → archive/asmr/`);
      if (!DRY_RUN) {
        await fs.mkdir(path.join(ARCHIVE_DIR, 'asmr'), { recursive: true });
        await fs.rename(folderPath, dest).catch(async err => {
          if (err.code === 'EXDEV') {
            // Cross-device: recursive copy + remove
            await fs.cp(folderPath, dest, { recursive: true });
            await fs.rm(folderPath, { recursive: true, force: true });
          } else throw err;
        });
      }
      asmrArchived++;
    }
  } catch { /* no asmr dir */ }

  // Sweep story episode folders — output/stories/{slug}/ → output/archive/stories/
  let storiesArchived = 0;
  try {
    const storyEntries = await fs.readdir(STORIES_DIR, { withFileTypes: true });
    for (const entry of storyEntries) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(STORIES_DIR, entry.name);

      let folderDate;
      try {
        const meta = JSON.parse(await fs.readFile(path.join(folderPath, 'story.json'), 'utf-8'));
        folderDate = (meta.generatedAt || meta.createdAt || '').slice(0, 10);
      } catch {}
      if (!folderDate) {
        const stat = await fs.stat(folderPath);
        folderDate = stat.mtime.toISOString().slice(0, 10);
      }

      if (!ARCHIVE_ALL && folderDate >= TODAY) {
        console.log(`  Skip story: ${entry.name} (today — ${folderDate})`);
        continue;
      }

      const dest = path.join(ARCHIVE_DIR, 'stories', entry.name);
      console.log(`  Archive story: ${entry.name} → archive/stories/`);
      if (!DRY_RUN) {
        await fs.mkdir(path.join(ARCHIVE_DIR, 'stories'), { recursive: true });
        await fs.rename(folderPath, dest).catch(async err => {
          if (err.code === 'EXDEV') {
            await fs.cp(folderPath, dest, { recursive: true });
            await fs.rm(folderPath, { recursive: true, force: true });
          } else throw err;
        });
      }
      storiesArchived++;
    }
  } catch { /* no stories dir */ }

  // Sweep loose video files — output/videos/*.mp4 → output/archive/videos/
  let videosArchived = 0;
  const videoExts = ['.mp4', '.mov', '.webm'];
  try {
    const videoEntries = await fs.readdir(VIDEOS_DIR, { withFileTypes: true });
    for (const entry of videoEntries) {
      if (!entry.isFile() || !videoExts.includes(path.extname(entry.name).toLowerCase())) continue;
      const filePath = path.join(VIDEOS_DIR, entry.name);
      const stat = await fs.stat(filePath);
      const fileDate = stat.mtime.toISOString().slice(0, 10);

      if (!ARCHIVE_ALL && fileDate >= TODAY) {
        console.log(`  Skip video: ${entry.name} (today)`);
        continue;
      }

      console.log(`  Archive video: ${entry.name} → archive/videos/`);
      if (!DRY_RUN) {
        await fs.mkdir(path.join(ARCHIVE_DIR, 'videos'), { recursive: true });
        await moveFile(filePath, path.join(ARCHIVE_DIR, 'videos', entry.name));
      }
      videosArchived++;
    }
  } catch { /* no videos dir */ }

  // Sweep X text post files — output/queue/x-text-YYYY-MM-DD.json → output/archive/x-text/
  let xTextArchived = 0;
  try {
    const xTextFiles = (await fs.readdir(QUEUE_DIR)).filter(f => /^x-text-\d{4}-\d{2}-\d{2}\.json$/.test(f));
    for (const file of xTextFiles) {
      const fileDate = file.slice(7, 17); // extract YYYY-MM-DD from x-text-YYYY-MM-DD.json
      if (!ARCHIVE_ALL && fileDate >= TODAY) {
        console.log(`  Skip x-text: ${file} (today — ${fileDate})`);
        continue;
      }
      const src = path.join(QUEUE_DIR, file);
      const dest = path.join(ARCHIVE_DIR, 'x-text', file);
      console.log(`  Archive x-text: ${file} → archive/x-text/`);
      if (!DRY_RUN) {
        await fs.mkdir(path.join(ARCHIVE_DIR, 'x-text'), { recursive: true });
        await moveFile(src, dest);
      }
      xTextArchived++;
    }
  } catch { /* no x-text files */ }

  // Sweep prompt files — output/prompts/*.json → output/archive/prompts/
  let promptsArchived = 0;
  try {
    const promptEntries = await fs.readdir(PROMPTS_DIR, { withFileTypes: true });
    for (const entry of promptEntries) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!entry.isFile() || (ext !== '.json' && ext !== '.md')) continue;
      const filePath = path.join(PROMPTS_DIR, entry.name);
      const stat = await fs.stat(filePath);
      const fileDate = stat.mtime.toISOString().slice(0, 10);

      if (!ARCHIVE_ALL && fileDate >= TODAY) {
        console.log(`  Skip prompt: ${entry.name} (today)`);
        continue;
      }

      console.log(`  Archive prompt: ${entry.name} → archive/prompts/`);
      if (!DRY_RUN) {
        await fs.mkdir(path.join(ARCHIVE_DIR, 'prompts'), { recursive: true });
        await moveFile(filePath, path.join(ARCHIVE_DIR, 'prompts', entry.name));
      }
      promptsArchived++;
    }
  } catch { /* no prompts dir */ }

  // Summary
  console.log('\n--- Summary ---');
  if (archived === 0 && rawArchived === 0 && asmrArchived === 0 && storiesArchived === 0 && videosArchived === 0 && promptsArchived === 0 && xTextArchived === 0) {
    console.log('Nothing to archive. All items are from today.');
  } else {
    for (const [date, count] of Object.entries(summary).sort()) {
      console.log(`  ${date}: ${count} item(s)`);
    }
    if (rawArchived > 0) console.log(`  raw files: ${rawArchived} image(s)`);
    if (asmrArchived > 0) console.log(`  asmr briefs: ${asmrArchived} folder(s)`);
    if (storiesArchived > 0) console.log(`  story episodes: ${storiesArchived} folder(s)`);
    if (videosArchived > 0) console.log(`  videos: ${videosArchived} file(s)`);
    if (promptsArchived > 0) console.log(`  prompts: ${promptsArchived} file(s)`);
    if (xTextArchived > 0) console.log(`  x-text posts: ${xTextArchived} file(s)`);
    console.log(`\nArchived: ${archived} queue + ${rawArchived} raw + ${asmrArchived} ASMR + ${storiesArchived} stories + ${videosArchived} videos + ${promptsArchived} prompts + ${xTextArchived} x-text${DRY_RUN ? ' (dry run)' : ''}`);
  }
  if (skipped > 0) console.log(`Skipped: ${skipped} item(s)`);
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

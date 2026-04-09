#!/usr/bin/env node

/**
 * JoyMaze Content — Raw Image Import Pipeline
 *
 * Takes manually generated images (from ChatGPT, Gemini, etc.),
 * applies JoyMaze branding, exports platform-sized versions,
 * and queues them for caption generation + posting.
 *
 * Usage:
 *   node scripts/import-raw.mjs                             # Import all images from output/raw/
 *   node scripts/import-raw.mjs --dry-run                   # Preview without writing files
 *   node scripts/import-raw.mjs --category coloring-preview  # Set category for all imports
 *   node scripts/import-raw.mjs --subject "happy dinosaur"   # Set subject for all imports
 *   node scripts/import-raw.mjs --text "Color Me!"           # Set text overlay for all imports
 *   node scripts/import-raw.mjs --no-watermark               # Skip joymaze.com watermark
 *   node scripts/import-raw.mjs --file image1.png            # Import a single file
 *
 * Sidecar metadata:
 *   Place a .json file next to any image with the same name to set per-image metadata:
 *   output/raw/dinosaur.png + output/raw/dinosaur.json
 *   { "category": "coloring-preview", "subject": "happy dinosaur", "textOverlay": "Color Me!" }
 */

import 'dotenv/config';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToCloud } from './upload-cloud.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'output', 'raw');
const OUTPUT_DIR = path.join(ROOT, 'output', 'images');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const ASSETS_DIR = path.join(ROOT, 'assets');

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_WATERMARK = args.includes('--no-watermark');
const NO_HOOKS = args.includes('--no-hooks');

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const CLI_CATEGORY = getArgValue('--category');
const CLI_SUBJECT = getArgValue('--subject');
const CLI_TEXT = getArgValue('--text');
const CLI_FILE = getArgValue('--file');

// Supported image extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.tiff'];

// Spread N posts evenly from startHour to endHour (inclusive)
function scheduledHours(count, startHour = 6, endHour = 21) {
  if (count <= 1) return [startHour];
  const hours = [];
  for (let i = 0; i < count; i++) {
    const raw = Math.round(startHour + (i * (endHour - startHour)) / (count - 1));
    const minHour = i === 0 ? startHour : hours[i - 1] + 1;
    hours.push(Math.min(endHour, Math.max(minHour, raw)));
  }
  return hours;
}

// ========== HOOK OVERLAY TEMPLATES ==========
// Halbert-style scroll-stoppers. Short (max ~8 words), punchy, open a curiosity loop.
// {theme} is replaced with the extracted theme from the filename.

const STORY_HOOKS = [
  // Curiosity Gap
  'Something shifts. You\'ll see it.',
  'This changes everything.',
  'Nobody talks about this part.',
  'Watch what happens next.',
  'You weren\'t expecting this.',
  'This moment stays with you.',
  'Most parents miss this.',
  'The quiet part no one mentions.',
  // Emotional Mirror
  'You know this feeling.',
  'This is the moment you\'ve been waiting for.',
  'Feel that? That\'s the good kind.',
  'The afternoon you didn\'t expect.',
  // Pattern Interrupt
  'This isn\'t what you think.',
  'Screen time, rewritten.',
  'Not just another app moment.',
  // Transformation Hint
  'One moment changes the whole day.',
  'Before this, nothing worked.',
  'The shift starts here.',
  // Sensory
  'Hear that quiet? The good kind.',
  'Picture this. Then feel it.',
];

const ACTIVITY_HOOKS = [
  // Challenge hooks (strongest for activities)
  'Can they solve this?',
  'This one stumps most kids.',
  'Try this with your child.',
  'Bet they can\'t finish in 2 minutes.',
  'Hand them this. Watch what happens.',
  'Think they can crack it?',
  'Most kids miss the hidden path.',
  'Only sharp eyes catch this one.',
  // Dare hooks
  'Dare them to try.',
  'No peeking at the answer.',
  'See who finishes first.',
  // Skill hooks
  'Focus builds here.',
  'The kind of screen time teachers love.',
  'Problem-solving starts with this.',
  'Their brain lights up. Watch.',
  // Theme-specific challenge hooks (use {theme})
  'This {theme} puzzle stumps most kids.',
  'Can they solve the {theme} challenge?',
  '{theme} + sharp eyes = solved.',
];

const PATTERN_INTERRUPT_HOOKS = [
  'Nobody talks about this.',
  'This changes the conversation.',
  'Read this before you scroll.',
  'The part they don\'t tell you.',
  'Stop. This matters.',
  'Everything you assumed is wrong.',
];

/**
 * Pick a hook for the given category and theme.
 * Uses a seeded selection based on content index to avoid duplicates in the same batch.
 */
function pickHook(category, theme, index) {
  let pool;
  if (category === 'pattern-interrupt') {
    pool = PATTERN_INTERRUPT_HOOKS;
  } else if (category.startsWith('activity-')) {
    pool = ACTIVITY_HOOKS;
  } else if (category === 'story' || category === 'story-marketing') {
    pool = STORY_HOOKS;
  } else {
    return null; // No hook for general/misc categories
  }

  // Pick by index rotation so same-batch posts get different hooks
  const hook = pool[index % pool.length];

  // Replace {theme} placeholder with actual theme (capitalized)
  if (theme && hook.includes('{theme}')) {
    const cleanTheme = theme.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return hook.replace(/\{theme\}/g, cleanTheme);
  }

  return hook;
}

// Content categories (matches generate-images.mjs + activity types)
const CATEGORIES = {
  'coloring-preview': { name: 'Coloring Page Preview', defaultText: 'Color Me!' },
  'parent-tips': { name: 'Activity Tips for Parents', defaultText: '' },
  'app-feature': { name: 'App Feature Highlight', defaultText: 'Try it in JoyMaze!' },
  'book-preview': { name: 'Book Preview', defaultText: 'Available on Amazon!' },
  'fun-facts': { name: 'Fun Facts / Did You Know', defaultText: 'Did You Know?' },
  'joyo-mascot': { name: 'Joyo Mascot Scene', defaultText: '' },
  'motivation': { name: 'Quotes & Motivation', defaultText: '' },
  'engagement': { name: 'User Engagement', defaultText: 'Which one would YOU pick?' },
  'seasonal': { name: 'Seasonal Content', defaultText: 'Seasonal Fun!' },
  'before-after': { name: 'Before/After Coloring', defaultText: 'Before & After' },
  // Activity post categories (A1-A5)
  'activity-maze': { name: 'Activity: Maze Puzzle', defaultText: '' },
  'activity-word-search': { name: 'Activity: Word Search', defaultText: '' },
  'activity-matching': { name: 'Activity: Matching Puzzle', defaultText: '' },
  'activity-tracing': { name: 'Activity: Tracing Activity', defaultText: '' },
  'activity-quiz': { name: 'Activity: Quiz / Visual Puzzle', defaultText: '' },
  'activity-dot-to-dot': { name: 'Activity: Dot-to-Dot', defaultText: '' },
  'activity-sudoku': { name: 'Activity: Sudoku Puzzle', defaultText: '' },
  'activity-coloring': { name: 'Activity: Coloring Page', defaultText: 'Color Me!' },
  // Intelligence-driven inspiration slots (replace story archetypes)
  'fact-card': { name: 'Fact Card (Educational)', defaultText: '' },
  'activity-challenge': { name: 'Activity Challenge', defaultText: '' },
  'quiet-moment': { name: 'Quiet Moment', defaultText: '' },
  'printable-tease': { name: 'Printable Tease', defaultText: '' },
  'identity': { name: 'Identity Post', defaultText: '' },
  // Legacy categories (kept for backward compat)
  'story': { name: 'Story Post', defaultText: '' },
  'story-marketing': { name: 'Story Post (Subtle Marketing)', defaultText: '' },
  'pattern-interrupt': { name: 'Pattern Interrupt', defaultText: '' },
  'general': { name: 'General', defaultText: '' },
};

// Platform export sizes
// Source images should be generated at 2:3 portrait (1000×1500) — optimizes for Pinterest + Instagram.
// X (16:9) and TikTok (9:16) are auto-adapted via smartResize; portrait source letterboxes acceptably on X.
const PLATFORM_SIZES = {
  pinterest:          { width: 1000, height: 1500, suffix: 'pin' },   // 2:3 — primary platform
  instagram_portrait: { width: 1080, height: 1350, suffix: 'ig-pt' }, // 4:5 — feed + Stories
  instagram_square:   { width: 1080, height: 1080, suffix: 'ig-sq' }, // 1:1 — grid fallback
  tiktok:             { width: 1080, height: 1920, suffix: 'tt'    }, // 9:16 — image carousels
  x:                  { width: 1200, height: 675,  suffix: 'x'    }, // 16:9 — text-first, portrait letterboxed
};

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Try to auto-detect category from filename
 */
// Explicit keyword map — each entry lists the strings that must appear in the filename
// to trigger that category. Order matters: more specific entries come first.
const CATEGORY_KEYWORDS = {
  'activity-dot-to-dot': ['dot-to-dot', 'dottodot', 'dotdot'],
  'activity-word-search': ['wordsearch', 'word-search'],
  'activity-matching':   ['matching'],
  'activity-tracing':    ['tracing'],
  'activity-sudoku':     ['sudoku'],
  'activity-coloring':   ['coloring'],
  'activity-quiz':       ['quiz'],
  'activity-maze':       ['maze'],
  'story-marketing':     ['story-marketing'],
  'pattern-interrupt':   ['pattern-interrupt', 'pattern'],
  'coloring-preview':    ['coloring-preview'],
  'parent-tips':         ['parent-tips', 'parenttips'],
  'app-feature':         ['app-feature', 'appfeature'],
  'book-preview':        ['book-preview', 'bookpreview'],
  'fun-facts':           ['fun-facts', 'funfacts'],
  'joyo-mascot':         ['joyo'],
  'motivation':          ['motivation', 'quote'],
  'engagement':          ['engagement'],
  'seasonal':            ['seasonal'],
  'before-after':        ['before-after', 'beforeafter'],
  'story':               ['story'],
};

function detectCategory(filename) {
  const lower = filename.toLowerCase();
  // Strip leading digits + separator (e.g., "01-story-..." → "story-...")
  const stripped = lower.replace(/^\d+[-_\s]*/, '');

  // Priority: match from the START of the (stripped) filename first.
  // This prevents "story-doing a maze activity" from matching 'maze' before 'story'.
  for (const [id, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => stripped.startsWith(kw))) {
      return id;
    }
  }

  // Fallback: contains-match (for filenames like "spring-maze-fun.png")
  for (const [id, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return id;
    }
  }

  return 'general';
}

/**
 * Read sidecar JSON metadata for an image
 */
async function readSidecar(imagePath) {
  const ext = path.extname(imagePath);
  const sidecarPath = imagePath.replace(ext, '.json');
  try {
    const data = await fs.readFile(sidecarPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Smart resize: landscape images into portrait/square canvases get a blurred background
 * letterbox instead of a harsh center-crop. Same-orientation images use cover.
 */
async function smartResize(inputBuffer, targetWidth, targetHeight) {
  const meta = await sharp(inputBuffer).metadata();
  const inputAspect = meta.width / meta.height;
  const targetAspect = targetWidth / targetHeight;

  // If aspects are close enough or both landscape, just cover-crop
  if (Math.abs(inputAspect - targetAspect) < 0.15 || (inputAspect > 1 && targetAspect > 1)) {
    return sharp(inputBuffer).resize(targetWidth, targetHeight, { fit: 'cover' }).png().toBuffer();
  }

  // Blur background: scale to fill (cover) + gaussian blur
  const bgBuffer = await sharp(inputBuffer)
    .resize(targetWidth, targetHeight, { fit: 'cover' })
    .blur(28)
    .png()
    .toBuffer();

  // Foreground: fit entirely within canvas (contain), transparent padding
  const fgBuffer = await sharp(inputBuffer)
    .resize(targetWidth, targetHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(bgBuffer)
    .composite([{ input: fgBuffer, blend: 'over' }])
    .png()
    .toBuffer();
}

/**
 * Composite brand elements onto an image (replicates generate-images.mjs logic)
 */
async function compositeBrandElements(imageBuffer, { width, height, textOverlay, addWatermark = true, addPrintableBadge = false, hookText = null }) {
  const resizedBuffer = await smartResize(imageBuffer, width, height);
  let image = sharp(resizedBuffer);

  const layers = [];

  // Add watermark (joymaze.com text)
  if (addWatermark) {
    const watermarkSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${width - 220}" y="${height - 50}" width="200" height="36" rx="8" fill="rgba(0,0,0,0.5)" />
        <text x="${width - 120}" y="${height - 26}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="white" font-weight="bold">joymaze.com</text>
      </svg>`;
    layers.push({ input: Buffer.from(watermarkSvg), top: 0, left: 0 });
  }

  // Add "FREE Printable" badge for activity posts (top-left, green badge)
  if (addPrintableBadge) {
    const badgeFontSize = Math.floor(width / 28);
    const badgeW = Math.floor(badgeFontSize * 8.5);
    const badgeH = Math.floor(badgeFontSize * 2.2);
    const badgeX = 15;
    const badgeY = 15;
    const badgeSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="10" fill="#00897B" />
        <text x="${badgeX + badgeW / 2}" y="${badgeY + badgeH / 2 + badgeFontSize / 3}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${badgeFontSize}" fill="white" font-weight="bold">FREE Printable</text>
      </svg>`;
    layers.push({ input: Buffer.from(badgeSvg), top: 0, left: 0 });
  }

  // Add text overlay
  if (textOverlay) {
    const fontSize = Math.min(48, Math.floor(width / 15));
    const padding = 20;
    const textWidth = Math.min(width - 80, textOverlay.length * fontSize * 0.55);
    const boxWidth = textWidth + padding * 2;
    const boxHeight = fontSize + padding * 2;
    const boxX = (width - boxWidth) / 2;
    const boxY = 40;

    const textSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="12" fill="rgba(255,107,53,0.9)" />
        <text x="${width / 2}" y="${boxY + boxHeight / 2 + fontSize / 3}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" fill="white" font-weight="bold">${escapeXml(textOverlay)}</text>
      </svg>`;
    layers.push({ input: Buffer.from(textSvg), top: 0, left: 0 });
  }

  // Add hook text overlay (bottom-center, semi-transparent dark bar)
  if (hookText) {
    // Scale font relative to height for landscape, width for portrait — keeps bar proportional
    const isLandscape = width > height;
    const hookFontSize = Math.min(Math.floor((isLandscape ? height : width) / 18), 56);
    const hookPaddingV = Math.floor(hookFontSize * 0.7);
    const hookPaddingH = Math.floor(hookFontSize * 1.2);

    // Word-wrap if needed (max ~28 chars per line)
    const hookWords = hookText.split(' ');
    const hookLines = [];
    let hLine = '';
    for (const w of hookWords) {
      if ((hLine + ' ' + w).trim().length > 28) {
        hookLines.push(hLine.trim());
        hLine = w;
      } else {
        hLine += ' ' + w;
      }
    }
    if (hLine.trim()) hookLines.push(hLine.trim());

    const lineHeight = Math.floor(hookFontSize * 1.35);
    const barHeight = hookLines.length * lineHeight + hookPaddingV * 2;
    const barY = height - barHeight - 70; // above watermark
    const barX = 30;
    const barWidth = width - 60;

    const hookTextElements = hookLines.map((line, idx) =>
      `<text x="${width / 2}" y="${barY + hookPaddingV + (idx + 1) * lineHeight - lineHeight * 0.15}"
         text-anchor="middle" font-family="Arial, sans-serif" font-size="${hookFontSize}"
         fill="white" font-weight="bold">${escapeXml(line)}</text>`
    ).join('\n');

    const hookSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}"
          rx="16" fill="rgba(0,0,0,0.6)" />
        ${hookTextElements}
      </svg>`;
    layers.push({ input: Buffer.from(hookSvg), top: 0, left: 0 });
  }

  // Add logo watermark if available
  try {
    const logoPath = path.join(ASSETS_DIR, 'logos', 'icon.png');
    await fs.access(logoPath);
    const logoSize = Math.floor(Math.min(width, height) * 0.08);
    const logoBuffer = await sharp(logoPath).resize(logoSize, logoSize).png().toBuffer();
    layers.push({
      input: logoBuffer,
      top: height - logoSize - 55,
      left: 15,
    });
  } catch {
    // Logo not available, skip
  }

  if (layers.length > 0) {
    image = image.composite(layers);
  }

  return image.png().toBuffer();
}

// ========== FOLDER-BASED CATEGORY DETECTION ==========
// Maps subfolder names under output/raw/ to categories.
// Drop images into the right folder — name them whatever you want.
const FOLDER_CATEGORY_MAP = {
  // New intelligence-driven slot folders
  'fact-card':          'fact-card',
  'fact':               'fact-card',
  'challenge':          'activity-challenge',
  'activity-challenge': 'activity-challenge',
  'quiet':              'quiet-moment',
  'quiet-moment':       'quiet-moment',
  'printable':          'printable-tease',
  'printable-tease':    'printable-tease',
  'identity':           'identity',
  // Legacy folders (kept for backward compat)
  'story':            'story',
  'story-marketing':  'story-marketing',
  'pattern':          'pattern-interrupt',
  'pattern-interrupt':'pattern-interrupt',
  'maze':             'activity-maze',
  'wordsearch':       'activity-word-search',
  'word-search':      'activity-word-search',
  'matching':         'activity-matching',
  'dottodot':         'activity-dot-to-dot',
  'dot-to-dot':       'activity-dot-to-dot',
  'quiz':             'activity-quiz',
  'sudoku':           'activity-sudoku',
  'coloring':         'activity-coloring',
  'tracing':          'activity-tracing',
};

/**
 * Detect category from the parent folder name.
 * Returns null if the file is directly in output/raw/ (no subfolder).
 */
function detectCategoryFromFolder(filePath) {
  const parentDir = path.basename(path.dirname(filePath)).toLowerCase();
  return FOLDER_CATEGORY_MAP[parentDir] || null;
}

/**
 * Import a single raw image
 */
async function importImage(filePath, index, scheduledHour = null) {
  const filename = path.basename(filePath);
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);

  // Determine metadata: CLI args > sidecar JSON > folder > filename auto-detect
  const sidecar = await readSidecar(filePath);

  const category = CLI_CATEGORY || sidecar?.category || detectCategoryFromFolder(filePath) || detectCategory(filename);
  const categoryInfo = CATEGORIES[category] || CATEGORIES.general;
  const subject = CLI_SUBJECT || sidecar?.subject || baseName.replace(/[-_]/g, ' ');
  const textOverlay = CLI_TEXT ?? sidecar?.textOverlay ?? categoryInfo.defaultText;
  const addWatermark = !NO_WATERMARK;

  // Extract theme from filename for hook personalization (e.g., "maze-ocean.png" → "ocean")
  const theme = baseName.replace(/^(maze|wordsearch|word-search|matching|tracing|quiz|sudoku|coloring|dot-to-dot|story|story-marketing|pattern|pattern-interrupt)-?/i, '').replace(/[-_]\d+$/, '');
  const hookText = NO_HOOKS ? null : (sidecar?.hookText ?? pickHook(category, theme, index));

  const dateStr = new Date().toISOString().slice(0, 10);
  const contentId = `${dateStr}-${category}-${String(index).padStart(2, '0')}`;

  const folderCategory = detectCategoryFromFolder(filePath);
  const relPath = path.relative(RAW_DIR, filePath).replace(/\\/g, '/');
  console.log(`  Importing: ${relPath}`);
  console.log(`    ID: ${contentId}`);
  console.log(`    Category: ${categoryInfo.name} (${category})${folderCategory ? ' [from folder]' : ''}`);
  console.log(`    Subject: ${subject}`);
  if (textOverlay) console.log(`    Text overlay: ${textOverlay}`);
  if (hookText) console.log(`    Hook: "${hookText}"`);
  if (sidecar) console.log(`    Sidecar metadata: found`);

  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would export to ${Object.keys(PLATFORM_SIZES).length} platform sizes`);
    return { id: contentId, category, subject, dryRun: true };
  }

  // Read raw image
  const rawBuffer = await fs.readFile(filePath);

  // Export for each platform
  const outputs = {};
  for (const [platformKey, size] of Object.entries(PLATFORM_SIZES)) {
    const outFilename = `${contentId}-${size.suffix}.png`;
    const outputPath = path.join(OUTPUT_DIR, outFilename);

    const branded = await compositeBrandElements(rawBuffer, {
      width: size.width,
      height: size.height,
      textOverlay,
      addWatermark,
      addPrintableBadge: category.startsWith('activity-'),
      hookText,
    });

    await fs.writeFile(outputPath, branded);
    outputs[platformKey] = outFilename;
    console.log(`    Exported: ${outFilename} (${size.width}x${size.height})`);
  }

  // Create queue metadata (same format as generate-images.mjs)
  const metadata = {
    id: contentId,
    category,
    categoryName: categoryInfo.name,
    subject,
    source: 'manual-import',
    sourceFile: filename,
    textOverlay: textOverlay || null,
    hookText: hookText || null,
    generatedAt: new Date().toISOString(),
    scheduledHour: scheduledHour !== null ? scheduledHour : undefined, // hourly drip scheduler
    dryRun: false,
    outputs,
    platforms: {
      pinterest: { image: outputs.pinterest, status: 'pending' },
      instagram: { image: outputs.instagram_square, status: 'pending' },
      x: { image: outputs.x, status: 'pending' },
    },
    captions: null, // Filled by generate-captions.mjs
  };

  const metadataPath = path.join(QUEUE_DIR, `${contentId}.json`);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  // Upload platform variants to Cloudinary for GitHub Actions posting
  try {
    const cloudUrls = {};
    for (const [key, filename] of Object.entries(outputs)) {
      const localPath = path.join(OUTPUT_DIR, filename);
      cloudUrls[key] = await uploadToCloud(localPath, 'joymaze/images');
    }
    metadata.cloudUrls = cloudUrls;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`    Cloudinary: uploaded ${Object.keys(cloudUrls).length} variants`);
  } catch (err) {
    console.warn(`    Cloudinary upload failed (local posting still works): ${err.message}`);
  }

  return metadata;
}

/**
 * Recursively scan a directory (1 level deep) for image files.
 * Scans output/raw/*.png AND output/raw/story/*.png, etc.
 */
async function scanForImages(dir) {
  const results = [];

  // Top-level files
  try {
    const topFiles = await fs.readdir(dir);
    for (const f of topFiles) {
      const fullPath = path.join(dir, f);
      const stat = await fs.stat(fullPath);
      if (stat.isFile() && IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch { /* dir doesn't exist */ }

  // One level of subfolders
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      const subDir = path.join(dir, entry);
      const stat = await fs.stat(subDir);
      if (stat.isDirectory()) {
        try {
          const subFiles = await fs.readdir(subDir);
          for (const f of subFiles) {
            if (IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase())) {
              results.push(path.join(subDir, f));
            }
          }
        } catch { /* skip unreadable subdirs */ }
      }
    }
  } catch { /* no entries */ }

  return results;
}

/**
 * Main pipeline
 */
async function main() {
  console.log('=== JoyMaze Raw Image Import Pipeline ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE (importing + branding)'}`);
  console.log(`Source: ${RAW_DIR}`);
  if (CLI_CATEGORY) console.log(`Category override: ${CLI_CATEGORY}`);
  if (CLI_SUBJECT) console.log(`Subject override: ${CLI_SUBJECT}`);
  if (CLI_TEXT) console.log(`Text overlay override: ${CLI_TEXT}`);
  if (NO_WATERMARK) console.log(`Watermark: disabled`);
  console.log('');

  // Ensure directories exist
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(QUEUE_DIR, { recursive: true });

  // Find images to import (scans output/raw/ + all subfolders)
  let filePaths; // full paths, not just names
  if (CLI_FILE) {
    const filePath = path.isAbsolute(CLI_FILE) ? CLI_FILE : path.join(RAW_DIR, CLI_FILE);
    try {
      await fs.access(filePath);
      filePaths = [filePath];
    } catch {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
  } else {
    try {
      filePaths = await scanForImages(RAW_DIR);
    } catch {
      console.log(`No raw directory found at ${RAW_DIR}. Creating it now.`);
      console.log('Drop your manually generated images into output/raw/ and run again.');
      process.exit(0);
    }
  }

  if (filePaths.length === 0) {
    console.log('No images found in output/raw/ (or subfolders).');
    console.log('');
    console.log('How to use:');
    console.log('  1. Generate images manually in ChatGPT, Gemini, or any tool');
    console.log('  2. Drop them into a subfolder by category:');
    console.log('     output/raw/story/        → story posts');
    console.log('     output/raw/maze/         → maze puzzles');
    console.log('     output/raw/wordsearch/   → word search');
    console.log('     output/raw/matching/     → matching puzzles');
    console.log('     output/raw/dottodot/     → dot-to-dot');
    console.log('     output/raw/quiz/         → visual quizzes');
    console.log('     output/raw/sudoku/       → sudoku');
    console.log('     output/raw/coloring/     → coloring pages');
    console.log('     output/raw/pattern/      → pattern interrupt');
    console.log('     output/raw/story-marketing/ → marketing story');
    console.log('  3. Or drop directly into output/raw/ (filename keywords used for detection)');
    console.log('  4. Run: node scripts/import-raw.mjs');
    process.exit(0);
  }

  console.log(`Found ${filePaths.length} image(s) to import.`);
  console.log('');

  // Pre-compute scheduled hours: spread evenly across 6 AM–9 PM
  const hours = scheduledHours(filePaths.length, 6, 21);
  console.log(`Scheduled hours: ${hours.join(', ')}`);
  console.log('');

  // Import each image
  const results = [];
  for (let i = 0; i < filePaths.length; i++) {
    try {
      const result = await importImage(filePaths[i], i, hours[i]);
      results.push(result);
    } catch (err) {
      console.error(`  Error importing ${path.basename(filePaths[i])}: ${err.message}`);
    }
  }

  // Summary
  console.log('');
  console.log('=== Import Complete ===');
  console.log(`Imported: ${results.length} images`);
  if (!DRY_RUN) {
    console.log(`Platform images: ${results.length * Object.keys(PLATFORM_SIZES).length} files in output/images/`);
    console.log(`Queue entries: ${results.length} files in output/queue/`);
  }
  console.log('');
  console.log('Next steps:');
  console.log('  1. Run `node scripts/generate-captions.mjs` to add captions');
  console.log('  2. Run `node scripts/post-content.mjs` to publish');

  return results;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

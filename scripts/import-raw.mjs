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

// Content categories (matches generate-images.mjs)
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
  'general': { name: 'General', defaultText: '' },
};

// Platform export sizes (matches generate-images.mjs)
const PLATFORM_SIZES = {
  pinterest: { width: 1000, height: 1500, suffix: 'pin' },
  instagram_square: { width: 1080, height: 1080, suffix: 'ig-sq' },
  instagram_portrait: { width: 1080, height: 1350, suffix: 'ig-pt' },
  x: { width: 1200, height: 675, suffix: 'x' },
};

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Try to auto-detect category from filename
 */
function detectCategory(filename) {
  const lower = filename.toLowerCase();
  for (const [id] of Object.entries(CATEGORIES)) {
    if (id === 'general') continue;
    // Match category keywords in filename
    const keywords = id.split('-');
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
 * Composite brand elements onto an image (replicates generate-images.mjs logic)
 */
async function compositeBrandElements(imageBuffer, { width, height, textOverlay, addWatermark = true }) {
  let image = sharp(imageBuffer).resize(width, height, { fit: 'cover' });

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

/**
 * Import a single raw image
 */
async function importImage(filePath, index) {
  const filename = path.basename(filePath);
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);

  // Determine metadata: CLI args > sidecar JSON > auto-detect
  const sidecar = await readSidecar(filePath);

  const category = CLI_CATEGORY || sidecar?.category || detectCategory(filename);
  const categoryInfo = CATEGORIES[category] || CATEGORIES.general;
  const subject = CLI_SUBJECT || sidecar?.subject || baseName.replace(/[-_]/g, ' ');
  const textOverlay = CLI_TEXT ?? sidecar?.textOverlay ?? categoryInfo.defaultText;
  const addWatermark = !NO_WATERMARK;

  const dateStr = new Date().toISOString().slice(0, 10);
  const contentId = `${dateStr}-${category}-${String(index).padStart(2, '0')}`;

  console.log(`  Importing: ${filename}`);
  console.log(`    ID: ${contentId}`);
  console.log(`    Category: ${categoryInfo.name} (${category})`);
  console.log(`    Subject: ${subject}`);
  if (textOverlay) console.log(`    Text overlay: ${textOverlay}`);
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
    generatedAt: new Date().toISOString(),
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

  return metadata;
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

  // Find images to import
  let files;
  if (CLI_FILE) {
    const filePath = path.isAbsolute(CLI_FILE) ? CLI_FILE : path.join(RAW_DIR, CLI_FILE);
    try {
      await fs.access(filePath);
      files = [path.basename(filePath)];
    } catch {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
  } else {
    try {
      const allFiles = await fs.readdir(RAW_DIR);
      files = allFiles.filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    } catch {
      console.log(`No raw directory found at ${RAW_DIR}. Creating it now.`);
      console.log('Drop your manually generated images into output/raw/ and run again.');
      process.exit(0);
    }
  }

  if (files.length === 0) {
    console.log('No images found in output/raw/.');
    console.log('');
    console.log('How to use:');
    console.log('  1. Generate images manually in ChatGPT, Gemini, or any tool');
    console.log('  2. Save them to output/raw/');
    console.log('  3. (Optional) Add a .json sidecar with metadata:');
    console.log('     { "category": "coloring-preview", "subject": "happy dinosaur", "textOverlay": "Color Me!" }');
    console.log('  4. Run: node scripts/import-raw.mjs');
    console.log('');
    console.log('Available categories:');
    for (const [id, info] of Object.entries(CATEGORIES)) {
      console.log(`  ${id.padEnd(20)} ${info.name}`);
    }
    process.exit(0);
  }

  console.log(`Found ${files.length} image(s) to import.`);
  console.log('');

  // Import each image
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(RAW_DIR, files[i]);
    try {
      const result = await importImage(filePath, i);
      results.push(result);
    } catch (err) {
      console.error(`  Error importing ${files[i]}: ${err.message}`);
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

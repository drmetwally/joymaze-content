#!/usr/bin/env node

/**
 * JoyMaze Content — Image Generation Pipeline
 *
 * Generates branded social media images using AI APIs (DALL-E / Gemini)
 * and composites JoyMaze brand elements via sharp.
 *
 * Usage:
 *   node scripts/generate-images.mjs              # Full run (uses AI APIs)
 *   node scripts/generate-images.mjs --dry-run     # Test with placeholder images
 *   node scripts/generate-images.mjs --count 3     # Generate 3 images instead of default
 *   node scripts/generate-images.mjs --category coloring  # Single category
 */

import 'dotenv/config';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output', 'images');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const ASSETS_DIR = path.join(ROOT, 'assets');

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const countIdx = args.indexOf('--count');
const IMAGE_COUNT = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 10;
const catIdx = args.indexOf('--category');
const FILTER_CATEGORY = catIdx !== -1 ? args[catIdx + 1] : null;

// Load platform config
const platformsConfig = JSON.parse(
  await fs.readFile(path.join(ROOT, 'config', 'platforms.json'), 'utf-8')
);

// Content categories with generation prompts
const CATEGORIES = [
  {
    id: 'coloring-preview',
    name: 'Coloring Page Preview',
    prompt: 'A beautiful, inviting kids coloring page showing {{subject}}, clean bold outlines on white background, simple rounded shapes for ages 4-8, warm cartoon style — the kind that makes a child reach for their crayons immediately',
    subjects: ['a friendly dinosaur', 'a magical unicorn', 'a happy puppy', 'an underwater scene with fish', 'a rocket ship in space', 'a butterfly garden'],
    textOverlays: [
      'Let them get lost in color.',
      'Watch what happens next.',
      'The page is waiting for them.',
      'Their hands. Their rules.',
    ],
  },
  {
    id: 'parent-tips',
    name: 'Activity Tips for Parents',
    prompt: 'A clean, warm infographic-style illustration about {{subject}}, soft pastel palette, educational warmth — the kind of design that makes parents feel like great decision-makers',
    subjects: ['5 benefits of mazes for kids brain development', 'why coloring helps fine motor skills', 'how word search builds vocabulary', 'screen time that actually helps kids learn', 'fun ways to practice counting at home'],
    textOverlays: [
      'This one surprised us too.',
      'Worth knowing.',
      'The science is in the fun.',
      'What great parents already know.',
    ],
  },
  {
    id: 'app-feature',
    name: 'App Feature Highlight',
    prompt: 'A warm, vibrant illustration showing a child completely absorbed in {{subject}}, soft glow of concentration, cartoon style, joyful colors — the quiet focus parents dream of seeing, no real human faces',
    subjects: ['a colorful maze game on a tablet', 'a fun word search puzzle', 'an engaging sudoku for kids', 'a dot-to-dot animal drawing', 'a matching memory card game'],
    textOverlays: [
      'Watch them focus.',
      'This is what good screen time looks like.',
      'One tap. Real learning.',
      'Something shifts when they open this.',
    ],
  },
  {
    id: 'book-preview',
    name: 'Book Preview',
    prompt: 'A beautifully crafted kids activity book cover for {{subject}}, professional design with warm playful colors — the kind of book that looks like a promise of fun guaranteed, child-friendly typography',
    subjects: ['mazes and puzzles for kids', 'coloring adventures for ages 4-8', 'word search fun for young minds', 'brain games activity book'],
    textOverlays: [
      'A gift they will come back to.',
      'Activities that outlast any toy.',
      'Keep it meaningful.',
      'Available on Amazon.',
    ],
  },
  {
    id: 'fun-facts',
    name: 'Fun Facts / Did You Know',
    prompt: 'A colorful, inviting educational illustration about {{subject}}, kid-friendly infographic warmth, bright cheerful design that makes learning feel like discovery rather than study',
    subjects: ['a brain with puzzle pieces showing learning', 'colorful letters and words floating', 'numbers and math symbols in a fun pattern', 'a maze shaped like a brain'],
    textOverlays: [
      'This changed how we think about play.',
      'The science behind the fun.',
      'Did you know?',
      'Every parent should see this.',
    ],
  },
  {
    id: 'joyo-mascot',
    name: 'Joyo Mascot Scene',
    prompt: 'Joyo — a round, colorful, irresistibly cheerful cartoon mascot character — {{subject}}, bright vibrant kids illustration style, white background — the kind of character children feel like befriending immediately',
    subjects: ['waving hello happily', 'solving a maze puzzle', 'painting with a big brush', 'reading a book surrounded by stars', 'celebrating with confetti'],
    textOverlays: [
      '',
      'Meet Joyo.',
      'He loves what your kids love.',
    ],
  },
  {
    id: 'motivation',
    name: 'Quotes & Motivation',
    prompt: 'A serene, beautiful background with soft pastel colors and gentle kid-friendly elements — scattered stars, soft clouds, resting crayons — warm and still, like a room just after laughter fades',
    subjects: [''],
    textOverlays: ['{{quote}}'],
    quotes: [
      'Every child is an artist.',
      'Play is the highest form of research.',
      'The quietest rooms hold the biggest discoveries.',
      'A child absorbed in play is learning everything.',
      'Screen time can be sacred time.',
    ],
  },
  {
    id: 'engagement',
    name: 'User Engagement',
    prompt: 'A vivid, playful split-screen illustration showing {{subject}}, colorful cartoon style, fun visual contrast — designed to make a child point at the screen and choose',
    subjects: ['two different maze paths side by side', 'two coloring styles of the same animal', 'easy vs hard puzzle comparison', 'two cute animal characters'],
    textOverlays: [
      'Which calls to them?',
      'Which would YOUR child pick?',
      'Let them decide.',
      'Two paths. One magic moment.',
    ],
  },
  {
    id: 'seasonal',
    name: 'Seasonal Content',
    prompt: 'A festive, inviting illustration of {{subject}}, warm kid-friendly cartoon style, seasonal colors that feel like a celebration is just beginning — not a decoration but an atmosphere',
    subjects: ['spring flowers and butterflies coloring theme', 'summer beach maze adventure', 'fall leaves and pumpkin activities', 'winter snowflake puzzles'],
    textOverlays: [
      'Made for right now.',
      'This week\'s favorite activity.',
      'The season inside the screen.',
      'New season. Same joy.',
    ],
  },
  {
    id: 'before-after',
    name: 'Before/After Coloring',
    prompt: 'A compelling side-by-side illustration of {{subject}}: left side is a black and white outline full of quiet potential, right side is beautifully colored and alive — cartoon style that makes you want to reach for a crayon',
    subjects: ['a cute cat drawing', 'a tropical fish scene', 'a castle with towers', 'a garden with flowers'],
    textOverlays: [
      'Watch it come alive.',
      'Before their hands. After their hands.',
      'The transformation is the point.',
      'Color changes everything.',
    ],
  },
];

// Platform export configurations
const PLATFORM_SIZES = {
  pinterest: { width: 1000, height: 1500, suffix: 'pin' },
  instagram_square: { width: 1080, height: 1080, suffix: 'ig-sq' },
  instagram_portrait: { width: 1080, height: 1350, suffix: 'ig-pt' },
  x: { width: 1200, height: 675, suffix: 'x' },
};

/**
 * Generate a placeholder image for dry-run mode
 */
async function generatePlaceholderImage(width, height, label) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#FF6B35;stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:#4ECDC4;stop-opacity:0.3" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <rect x="20" y="20" width="${width - 40}" height="${height - 40}" fill="none" stroke="#FF6B35" stroke-width="3" stroke-dasharray="10,5" rx="15" />
      <text x="${width / 2}" y="${height / 2 - 20}" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#2C3E50" font-weight="bold">JoyMaze</text>
      <text x="${width / 2}" y="${height / 2 + 20}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#666">${escapeXml(label)}</text>
      <text x="${width / 2}" y="${height / 2 + 55}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#999">${width}x${height} — DRY RUN</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generate an image using DALL-E API
 */
async function generateWithDallE(prompt) {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    style: 'vivid',
  });

  const imageUrl = response.data[0].url;
  const imageResponse = await fetch(imageUrl);
  return Buffer.from(await imageResponse.arrayBuffer());
}

/**
 * Generate an image using Gemini API
 */
async function generateWithGemini(prompt) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `Generate an image: ${prompt}` }] }],
    generationConfig: { responseModalities: ['image', 'text'] },
  });

  for (const part of result.response.candidates[0].content.parts) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }
  throw new Error('Gemini did not return an image');
}

/**
 * Composite brand elements onto an image using sharp
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
 * Pick a random item from an array
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a single content piece
 */
async function generateContentPiece(category, index) {
  const subject = pickRandom(category.subjects);
  const prompt = category.prompt.replace('{{subject}}', subject);

  // Pick from hypnotic overlay library if available, otherwise fall back to legacy field
  let textOverlay = category.textOverlays?.length
    ? pickRandom(category.textOverlays)
    : (category.textOverlay || '');

  if (textOverlay === '{{quote}}' && category.quotes) {
    textOverlay = pickRandom(category.quotes);
  } else if (textOverlay === '{{subject}}') {
    textOverlay = subject;
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const contentId = `${dateStr}-${category.id}-${String(index).padStart(2, '0')}`;

  console.log(`  Generating: ${contentId} — ${category.name}`);
  console.log(`    Subject: ${subject || '(none)'}`);

  // Generate or create placeholder base image
  let baseImage;
  if (DRY_RUN) {
    baseImage = await generatePlaceholderImage(1024, 1024, `${category.name}\n${subject}`);
    console.log('    [DRY RUN] Using placeholder image');
  } else {
    try {
      console.log('    Generating with DALL-E...');
      baseImage = await generateWithDallE(prompt);
    } catch (err) {
      console.log(`    DALL-E failed (${err.message}), trying Gemini...`);
      try {
        baseImage = await generateWithGemini(prompt);
      } catch (err2) {
        console.error(`    Both APIs failed. Using placeholder. Error: ${err2.message}`);
        baseImage = await generatePlaceholderImage(1024, 1024, `API ERROR\n${category.name}`);
      }
    }
  }

  // Export for each platform
  const outputs = {};
  for (const [platformKey, size] of Object.entries(PLATFORM_SIZES)) {
    const filename = `${contentId}-${size.suffix}.png`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    const branded = await compositeBrandElements(baseImage, {
      width: size.width,
      height: size.height,
      textOverlay,
    });

    await fs.writeFile(outputPath, branded);
    outputs[platformKey] = filename;
    console.log(`    Exported: ${filename} (${size.width}x${size.height})`);
  }

  // Create queue metadata
  const metadata = {
    id: contentId,
    category: category.id,
    categoryName: category.name,
    subject,
    prompt,
    textOverlay,
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
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
  console.log('=== JoyMaze Image Generation Pipeline ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no API calls)' : 'LIVE (using AI APIs)'}`);
  console.log(`Target: ${IMAGE_COUNT} images`);
  if (FILTER_CATEGORY) console.log(`Category filter: ${FILTER_CATEGORY}`);
  console.log('');

  // Ensure output directories exist
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(QUEUE_DIR, { recursive: true });

  // Filter categories if specified
  let categories = CATEGORIES;
  if (FILTER_CATEGORY) {
    categories = categories.filter(c => c.id.includes(FILTER_CATEGORY));
    if (categories.length === 0) {
      console.error(`No category matching "${FILTER_CATEGORY}". Available: ${CATEGORIES.map(c => c.id).join(', ')}`);
      process.exit(1);
    }
  }

  // Generate content pieces
  const results = [];
  let generated = 0;

  while (generated < IMAGE_COUNT) {
    const category = categories[generated % categories.length];
    const indexInCategory = Math.floor(generated / categories.length);

    try {
      const result = await generateContentPiece(category, indexInCategory);
      results.push(result);
      generated++;
    } catch (err) {
      console.error(`  Error generating ${category.name}: ${err.message}`);
      generated++; // Skip and continue
    }
  }

  // Summary
  console.log('');
  console.log('=== Generation Complete ===');
  console.log(`Generated: ${results.length} content pieces`);
  console.log(`Images: ${results.length * Object.keys(PLATFORM_SIZES).length} files in output/images/`);
  console.log(`Queue: ${results.length} metadata files in output/queue/`);
  console.log('');
  console.log('Next step: Run `node scripts/generate-captions.mjs` to add captions.');

  return results;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * generate-challenge-puzzle.mjs
 * Generates puzzle.png from activity.json.imagePrompt via Imagen.
 *
 * Usage:
 *   node scripts/generate-challenge-puzzle.mjs --challenge output/challenge/maze-slug
 *   node scripts/generate-challenge-puzzle.mjs --challenge output/challenge/maze-slug --force
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const API_KEY = process.env.VERTEX_API_KEY;
const MODEL = 'imagen-4.0-fast-generate-001';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${API_KEY}`;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');
const challengeFolderArg = args.includes('--challenge') ? args[args.indexOf('--challenge') + 1] : null;

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  if (!API_KEY) {
    console.error('VERTEX_API_KEY not set in .env');
    process.exit(1);
  }

  if (!challengeFolderArg) {
    console.error('Usage: node scripts/generate-challenge-puzzle.mjs --challenge output/challenge/maze-slug');
    process.exit(1);
  }

  const challengeDir = path.resolve(ROOT, challengeFolderArg);
  const activityJsonPath = path.join(challengeDir, 'activity.json');
  const outPath = path.join(challengeDir, 'puzzle.png');

  if (!await fileExists(activityJsonPath)) {
    console.error(`Error: activity.json not found in ${challengeDir}`);
    process.exit(1);
  }

  if (!FORCE && await fileExists(outPath)) {
    console.log(`SKIP  puzzle.png (exists in ${path.relative(ROOT, challengeDir)})`);
    process.exit(0);
  }

  const activity = JSON.parse(await fs.readFile(activityJsonPath, 'utf-8'));
  let basePrompt = activity.imagePrompt;

  if (!basePrompt) {
    // Older activity.json files may not have imagePrompt — synthesize one from theme + puzzleType
    const type = activity.puzzleType || activity.type || 'puzzle';
    const theme = activity.theme || 'animals';
    const typeLabel = type === 'word-search' ? 'word search grid'
      : type === 'maze' ? 'maze'
      : type === 'dot-to-dot' ? 'dot-to-dot connect-the-dots activity'
      : type === 'matching' ? 'matching pairs activity'
      : type === 'coloring' ? 'coloring page'
      : 'puzzle activity';
    basePrompt = `A clean, child-friendly ${typeLabel} with a "${theme}" theme. Bold outlines, simple shapes, no filled-in colors, designed for kids ages 4-8. High contrast black outlines on white background, clearly printable.`;
    console.warn(`[warn] imagePrompt missing in activity.json — using synthesized prompt for theme "${theme}" / type "${type}"`);
  }

  // Append orientation and background requirements as per spec
  const fullPrompt = `${basePrompt} Portrait orientation, 9:16 aspect ratio (1080x1920 pixels). White background.`;

  if (DRY_RUN) {
    console.log(`DRY   puzzle.png in ${path.relative(ROOT, challengeDir)} — prompt: ${fullPrompt.slice(0, 100)}...`);
    return;
  }

  console.log(`GEN   puzzle.png in ${path.relative(ROOT, challengeDir)} ...`);

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: fullPrompt }],
      parameters: { sampleCount: 1 },
    }),
  });

  const data = await res.json();
  if (data.error) {
    console.error(`API error: ${data.error.message}`);
    process.exit(1);
  }

  const b64 = data.predictions?.[0]?.bytesBase64Encoded
           || data.generatedImages?.[0]?.image?.imageBytes;

  if (!b64) {
    console.error(`No image in response: ${JSON.stringify(data).slice(0, 500)}`);
    process.exit(1);
  }

  await fs.writeFile(outPath, Buffer.from(b64, 'base64'));
  const stat = await fs.stat(outPath);
  console.log(`OK    (${(stat.size / 1024).toFixed(0)}KB)`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

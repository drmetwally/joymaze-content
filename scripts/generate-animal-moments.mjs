#!/usr/bin/env node

/**
 * generate-animal-moments.mjs
 * Generates all moment*.png production images to the episode folder.
 *
 * Usage:
 *   node scripts/generate-animal-moments.mjs --episode output/longform/animal/ep03-hedgehog
 *   node scripts/generate-animal-moments.mjs --episode output/longform/animal/ep03-hedgehog --force
 *   node scripts/generate-animal-moments.mjs --episode output/longform/animal/ep03-hedgehog --dry-run
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
const DELAY_MS = 2000;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');
const episodeFolderArg = args.includes('--episode') ? args[args.indexOf('--episode') + 1] : null;

async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildImagenPrompt(prompt, animalName, artStyle) {
  return [
    `Children's wildlife illustration of ${animalName}.`,
    'No text, no letters, no words, no labels, no logos, no watermark, no captions rendered anywhere in the image — the image must be 100% wordless artwork.',
    `Keep the subject unmistakably ${animalName} in every frame, with accurate animal anatomy and species-defining features.`,
    'Use a single full-frame illustration only, not a collage or split panel.',
    'Keep the image child-friendly, instantly readable, and visually clear within 2 to 3 seconds.',
    `Preserve one consistent illustration treatment across the set: ${artStyle}.`,
    prompt,
  ].join(' ');
}

async function generate(prompt, outPath) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1 },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`API error ${data.error.code}: ${data.error.message}`);
  const b64 = data.predictions?.[0]?.bytesBase64Encoded
           || data.generatedImages?.[0]?.image?.imageBytes;
  if (!b64) throw new Error(`No image in response: ${JSON.stringify(data).slice(0, 200)}`);
  await fs.writeFile(outPath, Buffer.from(b64, 'base64'));
  const stat = await fs.stat(outPath);
  return stat.size;
}

async function main() {
  if (!API_KEY) {
    console.error('VERTEX_API_KEY not set in .env');
    process.exit(1);
  }

  if (!episodeFolderArg) {
    console.error('Usage: node scripts/generate-animal-moments.mjs --episode <folder>');
    process.exit(1);
  }

  const episodeDir = path.resolve(ROOT, episodeFolderArg);
  const episodeJsonPath = path.join(episodeDir, 'episode.json');

  if (!(await pathExists(episodeJsonPath))) {
    console.error(`Error: episode.json not found in ${episodeDir}`);
    process.exit(1);
  }

  const episode = JSON.parse(await fs.readFile(episodeJsonPath, 'utf-8'));
  const moments = episode.visualExpansionMoments || [];

  if (moments.length === 0) {
    console.log('No moments found in episode.json');
    process.exit(0);
  }

  console.log(`Generating animal moments for ${episode.animalName} in ${path.relative(ROOT, episodeDir)}`);
  
  let total = moments.length, skipped = 0, generated = 0, failed = 0;

  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i];
    const asset = moment.imageAsset || `moment${i + 1}.png`;
    const outPath = path.join(episodeDir, asset);

    if (!FORCE && await pathExists(outPath)) {
      console.log(`SKIP  ${asset} (exists)`);
      skipped++;
      continue;
    }

    const prompt = buildImagenPrompt(moment.imagePromptHint, episode.animalName, episode.artStyle);

    if (DRY_RUN) {
      console.log(`DRY   ${asset} -> ${prompt.slice(0, 100)}...`);
      generated++;
      continue;
    }

    process.stdout.write(`GEN   ${asset} ... `);
    try {
      const bytes = await generate(prompt, outPath);
      console.log(`OK (${(bytes / 1024).toFixed(0)}KB)`);
      generated++;
      
      // Rate limiting: 2s between calls, 4s every 5 calls
      if (i < moments.length - 1) {
        if (generated % 5 === 0) {
          process.stdout.write(`  [rate limit pause] `);
          await sleep(DELAY_MS * 2);
        } else {
          await sleep(DELAY_MS);
        }
      }
    } catch (err) {
      console.log(`FAIL: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${generated} generated, ${skipped} skipped, ${failed} failed / ${total} total`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

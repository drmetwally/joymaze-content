#!/usr/bin/env node
/**
 * generate-matching-stickers.mjs
 * Generates the matching card sticker library via Imagen 4.0.
 * Idempotent — skips files that already exist.
 * Output: assets/stickers/matching/{theme}/{name}.png
 *
 * Usage:
 *   node scripts/generate-matching-stickers.mjs
 *   node scripts/generate-matching-stickers.mjs --theme ocean
 *   node scripts/generate-matching-stickers.mjs --force   (regenerate existing)
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'stickers', 'matching');
const INDEX_PATH = path.join(OUT_DIR, 'index.json');

const API_KEY = process.env.VERTEX_API_KEY;
const MODEL = 'imagen-4.0-generate-001';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${API_KEY}`;
const DELAY_MS = 2000;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const themeFilter = args.includes('--theme') ? args[args.indexOf('--theme') + 1] : null;

const BASE_STYLE = 'cute cartoon, flat illustration style, thick bold outlines, bright cheerful colors, pure white background with no border or frame, simple clean design, kids activity book art style, no text, square composition, friendly smiling face';

const STICKERS = {
  animals: {
    cat:      `orange tabby cat sitting upright, ${BASE_STYLE}`,
    dog:      `golden retriever puppy sitting, tongue out, ${BASE_STYLE}`,
    rabbit:   `white fluffy rabbit with long ears, ${BASE_STYLE}`,
    elephant: `baby elephant with big ears, trunk curled up, ${BASE_STYLE}`,
    lion:     `lion cub with fluffy mane, ${BASE_STYLE}`,
    penguin:  `chubby penguin standing, black and white with orange beak, ${BASE_STYLE}`,
  },
  ocean: {
    fish:      `tropical clownfish with orange and white stripes, ${BASE_STYLE}`,
    crab:      `red crab front view with big claws, ${BASE_STYLE}`,
    seahorse:  `yellow seahorse with curled tail, ${BASE_STYLE}`,
    octopus:   `purple octopus with eight tentacles, ${BASE_STYLE}`,
    turtle:    `green sea turtle with patterned shell, swimming pose, ${BASE_STYLE}`,
    dolphin:   `blue dolphin leaping, ${BASE_STYLE}`,
  },
  space: {
    rocket:     `red and white rocket ship blasting off with flames, ${BASE_STYLE}`,
    planet:     `Saturn with colorful rings, ${BASE_STYLE}`,
    astronaut:  `astronaut in white spacesuit with helmet visor, waving, ${BASE_STYLE}`,
    star:       `big yellow five-pointed star with a happy face, ${BASE_STYLE}`,
    ufo:        `green flying saucer UFO with blinking lights, ${BASE_STYLE}`,
    moon:       `crescent moon with a sleepy face, yellow, ${BASE_STYLE}`,
  },
  dinosaurs: {
    trex:          `T-Rex dinosaur standing upright with tiny arms, green, ${BASE_STYLE}`,
    triceratops:   `Triceratops dinosaur with three horns and frill, ${BASE_STYLE}`,
    stegosaurus:   `Stegosaurus with orange back plates, green body, ${BASE_STYLE}`,
    pterodactyl:   `Pterodactyl flying with wings spread, ${BASE_STYLE}`,
    brachiosaurus: `Brachiosaurus with very long neck, eating leaves, ${BASE_STYLE}`,
    raptor:        `small Velociraptor standing on two legs, blue and purple, ${BASE_STYLE}`,
  },
  farm: {
    cow:     `black and white dairy cow, standing, ${BASE_STYLE}`,
    pig:     `pink pig with curly tail and round snout, ${BASE_STYLE}`,
    chicken: `yellow chick with orange beak and feet, fluffy, ${BASE_STYLE}`,
    horse:   `brown horse with flowing mane, ${BASE_STYLE}`,
    sheep:   `fluffy white sheep with black face and feet, ${BASE_STYLE}`,
    duck:    `yellow rubber duck with orange bill, ${BASE_STYLE}`,
  },
  vehicles: {
    car:      `red toy car, side view, shiny and round, ${BASE_STYLE}`,
    bus:      `yellow school bus, side view, ${BASE_STYLE}`,
    train:    `colorful toy train engine with smoke puffs, ${BASE_STYLE}`,
    airplane: `blue and white passenger airplane, side view, ${BASE_STYLE}`,
    boat:     `small red and white sailboat on water, ${BASE_STYLE}`,
    bicycle:  `red bicycle with round wheels, side view, ${BASE_STYLE}`,
  },
};

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  if (data.error) throw new Error(`API error: ${data.error.message}`);
  const b64 = data.predictions?.[0]?.bytesBase64Encoded
           || data.generatedImages?.[0]?.image?.imageBytes;
  if (!b64) throw new Error(`No image in response: ${JSON.stringify(data).slice(0, 200)}`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, Buffer.from(b64, 'base64'));
  const stat = await fs.stat(outPath);
  return stat.size;
}

async function writeIndex() {
  const indexData = {
    version: '1.0',
    last_updated: new Date().toISOString().split('T')[0],
    themes: Object.fromEntries(
      Object.entries(STICKERS).map(([theme, chars]) => [theme, Object.keys(chars)])
    ),
    notes: 'PNG files, white background, 400x400px approx. Named exactly as listed. Add new theme key + filenames to expand; place PNGs in the matching subfolder.',
  };
  await fs.writeFile(INDEX_PATH, JSON.stringify(indexData, null, 2));
}

async function run() {
  if (!API_KEY) { console.error('VERTEX_API_KEY not set in .env'); process.exit(1); }

  const themes = themeFilter ? { [themeFilter]: STICKERS[themeFilter] } : STICKERS;
  if (themeFilter && !STICKERS[themeFilter]) {
    console.error(`Unknown theme: ${themeFilter}. Available: ${Object.keys(STICKERS).join(', ')}`);
    process.exit(1);
  }

  let total = 0, skipped = 0, generated = 0, failed = 0;

  for (const [theme, chars] of Object.entries(themes)) {
    for (const [name, prompt] of Object.entries(chars)) {
      total++;
      const outPath = path.join(OUT_DIR, theme, `${name}.png`);
      if (!FORCE && await fileExists(outPath)) {
        console.log(`SKIP  ${theme}/${name}.png (exists)`);
        skipped++;
        continue;
      }
      process.stdout.write(`GEN   ${theme}/${name}.png ... `);
      try {
        const bytes = await generate(prompt, outPath);
        console.log(`OK (${(bytes / 1024).toFixed(0)}KB)`);
        generated++;
        if (generated % 5 === 0) {
          process.stdout.write(`  [rate limit pause] `);
          await sleep(DELAY_MS * 2);
        } else {
          await sleep(DELAY_MS);
        }
      } catch (err) {
        console.log(`FAIL: ${err.message}`);
        failed++;
      }
    }
  }

  await writeIndex();
  console.log(`\nDone. ${generated} generated, ${skipped} skipped, ${failed} failed / ${total} total`);
  console.log(`Index updated: ${INDEX_PATH}`);
}

run().catch(err => { console.error('FATAL:', err.message); process.exit(1); });

#!/usr/bin/env node
/**
 * generate-asset-library.mjs — Manual Imagen batch tool for coloring pages and find-diff scenes.
 *
 * Usage:
 *   node scripts/generate-asset-library.mjs --type coloring-pages --theme "Ocean Animals"
 *   node scripts/generate-asset-library.mjs --type coloring-pages --theme "Space" --count 6
 *   node scripts/generate-asset-library.mjs --type coloring-pages --all
 *   node scripts/generate-asset-library.mjs --review          # promote staged assets to main library
 *
 * Flow:
 *   1. Generate → assets/generated/<type>/<theme>/staging/   (await human visual review)
 *   2. Review   → move approved PNGs from staging/ to main library/
 *   3. Generator reads from main library via pickAsset() in asset-library.mjs
 *
 * Pricing: Imagen Standard $0.04/image. At ~37 images this session cost ~$1.50.
 * Zero cost in the daily pipeline — all generators read pre-built library only.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIBRARY_ROOT = path.join(ROOT, 'assets', 'generated');

// ── Imagen model ─────────────────────────────────────────────────────────────
// Using the same VERTEX_API_KEY REST API pattern as generate-images-vertex.mjs
// API: POST https://generativelanguage.googleapis.com/v1beta/models/<model>:predict?key=<key>

const API_KEY = process.env.VERTEX_API_KEY || process.env.GOOGLE_AI_API_KEY;
const IMAGEN_MODEL = 'imagen-4.0-generate-001';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const SAMPLE_COUNT = 1;

if (!API_KEY) {
  console.warn('[asset-library] WARNING: VERTEX_API_KEY not set — image generation will fail');
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getArg = (f, def = null) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] ?? def : def;
};

const ACTION     = hasFlag('--review') ? 'review' : 'generate';
const TYPE       = getArg('--type', 'coloring-pages');  // coloring-pages | finddiff-scenes
const THEME      = getArg('--theme', null);
const ALL_THEMES = hasFlag('--all');
const COUNT      = Math.max(1, Math.min(8, parseInt(getArg('--count', '4'), 10) || 4));
const DRY_RUN    = hasFlag('--dry-run');
const PROMPT_LANG = getArg('--lang', 'en');

// ── Theme families ────────────────────────────────────────────────────────────

const COLORING_THEMES = [
  'Ocean Animals',
  'Space Adventure',
  'Dinosaurs',
  'Farm Animals',
  'Jungle Safari',
  'Fairy Princess',
  'Vehicles',
  'Kitchen Food',
];

const FINDDIFF_THEMES = [
  'Ocean Animals',
  'Space Adventure',
  'Animals',
  'Dinosaurs',
  'Farm',
];

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Build an Imagen prompt for a coloring page illustration.
 * Requirements:
 *   - Black outlines on white background
 *   - Simple, clean shapes suitable for kids ages 4-8 to color
 *   - Single scene/illustration, centered, no text
 *   - High acceptance rate: simple cartoon style, no photorealism, no faces
 */
function buildColoringPrompt(theme) {
  const sceneMap = {
    'Ocean Animals': 'A coloring page illustration of ocean animals — a cheerful fish, a friendly octopus, a crab, a seahorse, a starfish, and a turtle swimming in a coral reef. Bold black outlines on white background, simple cartoon style for children ages 4-8, no text, clean line art, white fill, no shading.',
    'Space Adventure': 'A coloring page illustration of a space adventure — a rocket ship, a planet with rings, the moon, stars, an alien, and a satellite floating in space. Bold black outlines on white background, simple cartoon style for children ages 4-8, no text, clean line art, white fill, no shading.',
    'Dinosaurs': 'A coloring page illustration of dinosaurs — a T-Rex, a stegosaurus, a triceratops, a pterodactyl, and a brontosaurus in a prehistoric landscape. Bold black outlines on white background, simple cartoon style for children ages 4-8, no text, clean line art, white fill, no shading.',
    'Farm Animals': 'A coloring page illustration of farm animals — a cow, a pig, a horse, a chicken, a sheep, and a barn. Bold black outlines on white background, simple cartoon style for children ages 4-8, no text, clean line art, white fill, no shading.',
    'Jungle Safari': 'A coloring page illustration of jungle safari animals — an elephant, a giraffe, a lion, a monkey, and a parrot in the jungle. Bold black outlines on white background, simple cartoon style for children ages 4-8, no text, clean line art, white fill, no shading.',
    'Fairy Princess': 'A coloring page illustration of a fairy princess scene — a castle, a princess, a unicorn, a fairy with wings, and magical flowers. Bold black outlines on white background, simple cartoon style for children ages 4-8, no text, clean line art, white fill, no shading.',
    'Vehicles': 'A coloring page illustration of vehicles — a fire truck, a race car, a helicopter, a sailboat, a bicycle, and a bus. Bold black outlines on white background, simple cartoon style for children ages 4-8, no text, clean line art, white fill, no shading.',
    'Kitchen Food': 'A coloring page illustration of kitchen and food — a cupcake, an apple, a pizza slice, a carrot, an ice cream cone, and a cookie on a plate. Bold black outlines on white background, simple cartoon style for children ages 4-8, no text, clean line art, white fill, no shading.',
  };
  return sceneMap[theme] || `A coloring page illustration with bold black outlines on white background, simple cartoon style for children ages 4-8, no text, clean line art, white fill, no shading. Theme: ${theme}.`;
}

/**
 * Build an Imagen prompt for a find-the-difference two-panel scene.
 * Requirements:
 *   - Two identical illustrated scenes side by side (top panel / bottom panel)
 *   - Simple cartoon style, bold outlines, colorful
 *   - Left panel is panel A, right panel is panel B
 *   - Both panels must be the same illustration — differences are added by the generator
 */
function buildFindDiffPrompt(theme) {
  const sceneMap = {
    'Ocean Animals': 'Two identical coloring-page style illustrations of ocean animals scene — fish, octopus, crab, seahorse, coral, and turtle in an underwater scene. Simple cartoon style, bold black outlines, clean white backgrounds. The two panels are identical copies.',
    'Space Adventure': 'Two identical coloring-page style illustrations of a space scene — rocket, planet, moon, stars, alien, and satellite. Simple cartoon style, bold black outlines, clean white backgrounds. The two panels are identical copies.',
    'Animals': 'Two identical coloring-page style illustrations of a cute animal scene — dog, cat, rabbit, bear, and bird in a forest. Simple cartoon style, bold black outlines, clean white backgrounds. The two panels are identical copies.',
    'Dinosaurs': 'Two identical coloring-page style illustrations of a dinosaur scene — T-Rex, stegosaurus, triceratops, and volcano in a prehistoric landscape. Simple cartoon style, bold black outlines, clean white backgrounds. The two panels are identical copies.',
    'Farm': 'Two identical coloring-page style illustrations of a farm scene — cow, pig, horse, chicken, barn, and sunflower. Simple cartoon style, bold black outlines, clean white backgrounds. The two panels are identical copies.',
  };
  return sceneMap[theme] || `Two identical coloring-page style illustrations, simple cartoon style with bold black outlines on white background for children ages 4-8, no text. Theme: ${theme}. The two panels are identical copies.`;
}

// ── Imagen client ─────────────────────────────────────────────────────────────

async function generateImagenImage(prompt, outputPath) {
  if (!API_KEY) throw new Error('VERTEX_API_KEY not set in .env');

  const url = `${BASE_URL}/models/${IMAGEN_MODEL}:predict?key=${API_KEY}`;
  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: SAMPLE_COUNT },
  };

  console.log(`  [Imagen] generating: "${prompt.slice(0, 80)}..."`);

  let raw;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    raw = await res.text();
  } catch (err) {
    throw new Error(`Fetch failed: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(raw || '{}');
  } catch {
    throw new Error(`Invalid JSON response: ${raw.slice(0, 200)}`);
  }

  if (data.error) throw new Error(`Imagen error ${data.error.code}: ${data.error.message}`);

  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Empty response (safety filter or unsupported content)');

  const imageBuffer = Buffer.from(b64, 'base64');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, imageBuffer);
  const sizeKb = Math.round(imageBuffer.length / 1024);
  console.log(`  [Imagen] wrote ${sizeKb}KB → ${outputPath}`);
  return { path: outputPath, sizeKb };
}

// ── Staging helpers ───────────────────────────────────────────────────────────

function stagingPath(type, theme) {
  return path.join(LIBRARY_ROOT, type, theme.toLowerCase().replace(/[^a-z0-9]+/g, '-'), 'staging');
}

function libraryPath(type, theme) {
  return path.join(LIBRARY_ROOT, type, theme.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// ── Generate action ───────────────────────────────────────────────────────────

async function generateType(type, theme, count) {
  const outDir = stagingPath(type, theme);
  await fs.mkdir(outDir, { recursive: true });

  const prompt = type === 'coloring-pages'
    ? buildColoringPrompt(theme)
    : buildFindDiffPrompt(theme);

  const results = [];
  const errors = [];

  for (let i = 0; i < count; i++) {
    const timestamp = Date.now();
    const filename = `${slugify(theme)}-${count > 1 ? `${i + 1}-of-${count}-` : ''}${timestamp}.png`;
    const outPath = path.join(outDir, filename);

    if (DRY_RUN) {
      console.log(`  [dry-run] would generate: ${outPath}`);
      results.push({ path: outPath, dryRun: true });
      continue;
    }

    try {
      const result = await generateImagenImage(prompt, outPath);
      results.push(result);
    } catch (err) {
      console.error(`  [ERROR] image ${i + 1} failed: ${err.message}`);
      errors.push({ index: i, error: err.message });
    }
  }

  return { results, errors, outDir };
}

// ── Review / promote action ──────────────────────────────────────────────────

async function reviewStaging(type) {
  console.log(`\n[asset-library] Review — type: ${type}\n`);
  console.log('Staging folders with pending assets:\n');

  const typeRoot = path.join(LIBRARY_ROOT, type);
  let foundAny = false;

  try {
    const themes = await fs.readdir(typeRoot);
    for (const themeDir of themes) {
      const stagingDir = path.join(typeRoot, themeDir, 'staging');
      const mainDir = path.join(typeRoot, themeDir);

      try {
        const stagingFiles = await fs.readdir(stagingDir);
        const mainFiles = await fs.readdir(mainDir).catch(() => []);

        const staged = stagingFiles.filter(f => f.endsWith('.png'));
        const approved = mainFiles.filter(f => f.endsWith('.png'));

        if (staged.length > 0) {
          foundAny = true;
          console.log(`  Theme: ${themeDir}`);
          console.log(`    Staged (needs review): ${staged.length}  → ${staged.join(', ')}`);
          console.log(`    Approved (in library): ${approved.length}`);
          if (approved.length > 0) {
            console.log(`    ${approved.slice(0, 3).join(', ')}${approved.length > 3 ? ` +${approved.length - 3} more` : ''}`);
          }
          console.log('');
        }
      } catch {
        // no staging dir for this theme
      }
    }
  } catch {
    console.log('  No assets generated yet. Run with --type and --theme first.');
  }

  if (!foundAny) {
    console.log('  No staged assets found.');
  }

  console.log('To promote staged assets:');
  console.log('  node scripts/generate-asset-library.mjs --review --promote --type <type> --theme "<theme>"');
  console.log('');
  console.log('To delete staged assets without promoting:');
  console.log('  node scripts/generate-asset-library.mjs --review --purge --type <type> --theme "<theme>"');
}

async function promoteAssets(type, theme) {
  const stagingDir = stagingPath(type, theme);
  const mainDir = libraryPath(type, theme);

  const stagedFiles = (await fs.readdir(stagingDir).catch(() => [])).filter(f => f.endsWith('.png'));
  if (stagedFiles.length === 0) {
    console.log(`[asset-library] No staged assets to promote for "${theme}".`);
    return;
  }

  await fs.mkdir(mainDir, { recursive: true });

  let promoted = 0;
  for (const file of stagedFiles) {
    const src = path.join(stagingDir, file);
    const dst = path.join(mainDir, file);
    await fs.rename(src, dst);
    console.log(`  promoted: ${file}`);
    promoted++;
  }

  console.log(`[asset-library] ✓ ${promoted} asset(s) promoted to main library: ${mainDir}`);
}

async function purgeStaging(type, theme) {
  const stagingDir = stagingPath(type, theme);
  const files = (await fs.readdir(stagingDir).catch(() => [])).filter(f => f.endsWith('.png'));
  let purged = 0;
  for (const file of files) {
    await fs.unlink(path.join(stagingDir, file));
    purged++;
  }
  console.log(`[asset-library] ✓ purged ${purged} staged file(s) from ${stagingDir}`);
}

// ── Asset library status ───────────────────────────────────────────────────────

async function libraryHealth(type) {
  const typeRoot = path.join(LIBRARY_ROOT, type);
  const summary = {};

  try {
    const themes = await fs.readdir(typeRoot);
    for (const themeDir of themes) {
      const mainDir = path.join(typeRoot, themeDir);
      const files = (await fs.readdir(mainDir).catch(() => [])).filter(f => f.endsWith('.png'));
      summary[themeDir] = files.length;
    }
  } catch {
    // no library yet
  }

  return summary;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  if (ACTION === 'review') {
    const promoteFlag = hasFlag('--promote');
    const purgeFlag   = hasFlag('--purge');
    const reviewTheme = getArg('--theme', null);

    if (promoteFlag) {
      if (!reviewTheme) {
        console.error('[asset-library] --promote requires --theme');
        process.exit(1);
      }
      await promoteAssets(TYPE, reviewTheme);
      return;
    }

    if (purgeFlag) {
      if (!reviewTheme) {
        console.error('[asset-library] --purge requires --theme');
        process.exit(1);
      }
      await purgeStaging(TYPE, reviewTheme);
      return;
    }

    // Default review: show all staged + library state
    await reviewStaging(TYPE);
    return;
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  if (DRY_RUN) {
    console.log('[asset-library] dry-run mode — no API calls will be made\n');
  }

  if (ALL_THEMES) {
    const themes = TYPE === 'coloring-pages' ? COLORING_THEMES : FINDDIFF_THEMES;
    console.log(`[asset-library] Generating ${TYPE} for ALL ${themes.length} themes (${COUNT} images each)\n`);

    let totalErrors = 0;
    for (const theme of themes) {
      console.log(`\n[asset-library] Theme: ${theme} (${COLORING_THEMES.indexOf(theme) + 1}/${themes.length})`);
      const { errors } = await generateType(TYPE, theme, COUNT);
      totalErrors += errors.length;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const estimatedCost = (themes.length * COUNT * 0.04).toFixed(2);
    console.log(`\n[asset-library] Done in ${elapsed}s | ~$${estimatedCost} at Imagen Standard rate`);
    if (totalErrors > 0) console.log(`[asset-library] ${totalErrors} image(s) failed — check errors above`);
    return;
  }

  if (!THEME) {
    console.error('[asset-library] --theme required (or use --all)');
    console.error(`[asset-library] Available themes for ${TYPE}:`);
    const themes = TYPE === 'coloring-pages' ? COLORING_THEMES : FINDDIFF_THEMES;
    themes.forEach(t => console.error(`  - "${t}"`));
    process.exit(1);
  }

  console.log(`[asset-library] Generating ${COUNT} ${TYPE} image(s) for theme: "${THEME}"`);
  if (!DRY_RUN) {
    const estimatedCost = (COUNT * 0.04).toFixed(2);
    console.log(`[asset-library] Estimated cost: ~$${estimatedCost} (Imagen Standard @ $0.04/image)\n`);
  }

  const { results, errors, outDir } = await generateType(TYPE, THEME, COUNT);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[asset-library] Done in ${elapsed}s`);
  console.log(`[asset-library] Output: ${outDir}`);
  console.log(`[asset-library] ${results.filter(r => !r.dryRun).length} image(s) written, ${errors.length} failed`);

  if (!DRY_RUN && results.length > 0) {
    console.log('\n[asset-library] Next step: review the generated images visually, then promote:');
    console.log(`  node scripts/generate-asset-library.mjs --review --promote --type ${TYPE} --theme "${THEME}"`);
  }
}

main().catch(err => {
  console.error('[asset-library] fatal:', err);
  process.exit(1);
});
#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, process.platform === 'win32' ? '' : '/'));
const MODEL = 'imagen-4.0-generate-001';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] ?? null : null;
};
const hasFlag = (flag) => args.includes(flag);

const episodeArg = getArg('--episode');
const picksArg = getArg('--picks') || 'moment1,moment7,moment10';
const force = hasFlag('--force');
const dryRun = hasFlag('--dry-run');

function normalizePath(input) {
  if (!input) return null;
  return path.isAbsolute(input) ? input : path.resolve(ROOT, input);
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function buildImagenPrompt(prompt, animalName, artStyle) {
  return [
    `Children's wildlife illustration of ${animalName}.`,
    'No text, no logos, no watermark.',
    `Keep the subject unmistakably ${animalName} in every frame, with accurate animal anatomy and species-defining features.`,
    'Use a single full-frame illustration only, not a collage or split panel.',
    'Keep the image child-friendly, instantly readable, and visually clear within 2 to 3 seconds.',
    `Preserve one consistent illustration treatment across the set: ${artStyle}.`,
    prompt,
  ].join(' ');
}

async function generateWithImagen(prompt) {
  const apiKey = process.env.VERTEX_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('Set VERTEX_API_KEY or GOOGLE_AI_API_KEY in .env');
  const url = `${BASE_URL}/models/${MODEL}:predict?key=${apiKey}`;
  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: 1 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  const data = JSON.parse(raw || '{}');
  if (data.error) throw new Error(`Imagen error ${data.error.code}: ${data.error.message}`);
  const b64 = data.generatedImages?.[0]?.image?.imageBytes
    || data.predictions?.[0]?.bytesBase64Encoded
    || data.images?.[0]?.imageBytes;
  if (!b64) throw new Error('Imagen did not return an image');
  return Buffer.from(b64, 'base64');
}

function collectAssets(episode) {
  const items = [];
  for (let i = 0; i < (episode.songBeats || []).length; i++) {
    items.push({
      kind: 'beat',
      asset: `beat${i + 1}.png`,
      title: episode.songBeats[i].title,
      prompt: episode.songBeats[i].imagePromptHint,
      factFocus: episode.songBeats[i].factFocus,
    });
  }
  for (let i = 0; i < (episode.visualExpansionMoments || []).length; i++) {
    items.push({
      kind: 'moment',
      asset: episode.visualExpansionMoments[i].imageAsset || `moment${i + 1}.png`,
      title: episode.visualExpansionMoments[i].title,
      prompt: episode.visualExpansionMoments[i].imagePromptHint,
      factFocus: episode.visualExpansionMoments[i].factFocus,
    });
  }
  return items;
}

async function main() {
  const episodeDir = normalizePath(episodeArg);
  if (!episodeDir) throw new Error('Missing required --episode <folder>');
  const episodeJsonPath = path.join(episodeDir, 'episode.json');
  if (!(await pathExists(episodeJsonPath))) throw new Error(`episode.json not found: ${episodeJsonPath}`);

  const episode = JSON.parse(await fs.readFile(episodeJsonPath, 'utf8'));
  const picks = picksArg.split(',').map((x) => x.trim()).filter(Boolean);
  const allAssets = collectAssets(episode);
  const selected = picks.map((pick) => {
    const found = allAssets.find((item) => item.asset.replace(/\.png$/i, '') === pick.replace(/\.png$/i, '') || item.asset === pick);
    if (!found) throw new Error(`Requested asset not found in episode: ${pick}`);
    return found;
  });

  console.log(`QC animal Imagen slice for ${path.basename(episodeDir)}`);
  console.log(`Assets: ${selected.map((item) => item.asset).join(', ')}`);

  const qcDir = path.join(episodeDir, 'qc-imagen-slice');
  await fs.mkdir(qcDir, { recursive: true });
  const manifest = [];

  for (const item of selected) {
    const outPath = path.join(qcDir, `qc-${item.asset}`);
    const prompt = buildImagenPrompt(item.prompt, episode.animalName, episode.artStyle);
    manifest.push({ asset: item.asset, title: item.title, factFocus: item.factFocus, outPath, prompt });
    if (dryRun) continue;
    if (!force && await pathExists(outPath)) {
      console.log(`Skipping existing ${path.basename(outPath)}`);
      continue;
    }
    console.log(`Generating ${item.asset}...`);
    const image = await generateWithImagen(prompt);
    await fs.writeFile(outPath, image);
  }

  await fs.writeFile(path.join(qcDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Saved manifest: ${path.join(qcDir, 'manifest.json')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

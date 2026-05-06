#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PLAN_FILE = path.join(ROOT, 'config', 'story-audio-plan.json');
const MANIFEST_FILE = path.join(ROOT, 'config', 'story-audio-sourced.json');

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] ?? null : null;
};

const DRY_RUN = hasFlag('--dry-run');
const ACTIVATE = hasFlag('--activate');
const laneArg = getArg('--lane');
const kindArg = (getArg('--kind') || 'music').toLowerCase();
const limitArg = Number(getArg('--limit') || 2);
const LIMIT = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 2;

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function parseExternalTarget(value = '') {
  const [provider, ...rest] = String(value).split(':');
  return {
    raw: value,
    provider: String(provider || '').trim().toLowerCase(),
    query: rest.join(':').trim(),
  };
}

function pickArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

function pickPixabayHits(payload) {
  if (Array.isArray(payload?.hits)) return payload.hits;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.audio)) return payload.audio;
  if (Array.isArray(payload?.music)) return payload.music;
  return [];
}

function pickPixabayAudioUrl(hit = {}) {
  const candidates = [
    hit.previewURL,
    hit.downloadURL,
    hit.audioURL,
    hit.url,
    hit.file,
    hit.preview?.url,
    hit.preview?.mp3,
    hit.audio?.url,
    hit.audio?.mp3,
    hit.music?.url,
    hit.music?.mp3,
  ].filter(Boolean);
  return candidates[0] || '';
}

function pickPixabayTitle(hit = {}, fallback = 'track') {
  return hit.name || hit.title || hit.tags || hit.id || fallback;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function downloadFile(url, destPath) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'JoyMazeContent/1.0 (+story audio fetch)',
    },
  });
  if (!response.ok) {
    throw new Error(`download failed ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(destPath, Buffer.from(arrayBuffer));
}

async function searchPixabayAudio(query) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    throw new Error('PIXABAY_API_KEY is missing');
  }

  const url = new URL('https://pixabay.com/api/audio/');
  url.searchParams.set('key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('per_page', String(Math.max(LIMIT, 3)));
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('order', 'popular');

  const response = await fetch(url, {
    headers: {
      'user-agent': 'JoyMazeContent/1.0 (+story audio fetch)',
      'accept': 'application/json,text/plain,*/*',
    },
  });

  const bodyText = await response.text();
  if (!response.ok) {
    const detail = bodyText.slice(0, 240).replace(/\s+/g, ' ').trim();
    if (response.status === 403) {
      throw new Error(`Pixabay audio API denied access (403). The current Pixabay key likely does not have audio endpoint access yet. Response: ${detail}`);
    }
    throw new Error(`Pixabay audio API error ${response.status}: ${detail}`);
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new Error(`Pixabay audio API returned non-JSON response: ${bodyText.slice(0, 240)}`);
  }

  return pickPixabayHits(payload);
}

async function main() {
  const plan = await readJson(PLAN_FILE);
  if (!plan) throw new Error('Missing config/story-audio-plan.json');

  const manifest = (await readJson(MANIFEST_FILE, {
    version: 1,
    generatedAt: null,
    downloads: [],
  })) || { version: 1, generatedAt: null, downloads: [] };

  const requestedLanes = laneArg ? [laneArg] : Object.keys(plan.lanePlans || {}).filter((lane) => lane !== 'default');
  if (!requestedLanes.length) throw new Error('No lanes available in story-audio-plan.json');

  if (kindArg !== 'music') {
    throw new Error(`Only --kind music is implemented right now. Received: ${kindArg}`);
  }

  let changedPlan = false;
  let downloadedCount = 0;

  for (const lane of requestedLanes) {
    const lanePlan = plan.lanePlans?.[lane];
    if (!lanePlan) {
      console.warn(`Skipping unknown lane: ${lane}`);
      continue;
    }

    const targets = pickArray(lanePlan.externalTargets?.music).map(parseExternalTarget);
    const pixabayTargets = targets.filter((target) => target.provider === 'pixabay' && target.query);

    if (!pixabayTargets.length) {
      console.log(`No Pixabay music targets configured for lane ${lane}`);
      continue;
    }

    const poolPaths = [];
    const laneDir = path.join(ROOT, 'assets', 'audio', 'external', 'pixabay', lane);
    if (!DRY_RUN) await ensureDir(laneDir);

    console.log(`\nLane: ${lane}`);

    for (const target of pixabayTargets.slice(0, LIMIT)) {
      console.log(`  Query: ${target.query}`);
      let hits = [];
      try {
        hits = await searchPixabayAudio(target.query);
      } catch (error) {
        console.warn(`  ! ${error.message}`);
        continue;
      }

      if (!hits.length) {
        console.log('  ! No audio hits returned');
        continue;
      }

      const selected = hits.find((hit) => pickPixabayAudioUrl(hit)) || hits[0];
      const audioUrl = pickPixabayAudioUrl(selected);
      if (!audioUrl) {
        console.log('  ! Hit returned but no audio URL could be resolved');
        continue;
      }

      const title = pickPixabayTitle(selected, target.query);
      const baseName = `${slugify(target.query)}-${String(selected.id || 'audio')}`;
      const relativePath = path.posix.join('assets', 'audio', 'external', 'pixabay', lane, `${baseName}.mp3`);
      const absolutePath = path.join(ROOT, relativePath);

      console.log(`  -> ${title}`);
      if (!DRY_RUN) {
        await downloadFile(audioUrl, absolutePath);
      }

      manifest.downloads.push({
        fetchedAt: new Date().toISOString(),
        provider: 'pixabay',
        kind: 'music',
        lane,
        query: target.query,
        id: selected.id ?? null,
        title,
        audioUrl,
        relativePath,
      });
      poolPaths.push(relativePath.replace(/\\/g, '/'));
      downloadedCount += 1;
    }

    if (poolPaths.length && ACTIVATE) {
      const existingPoolName = lanePlan.musicPool || plan.lanePlans.default?.musicPool || 'soft_doc';
      const existingPool = pickArray(plan.musicPools?.[existingPoolName]);
      const extPoolName = `pixabay_${lane}`;
      plan.musicPools[extPoolName] = [...new Set([...poolPaths, ...existingPool])];
      lanePlan.musicPool = extPoolName;
      changedPlan = true;
      console.log(`  Activated music pool: ${extPoolName}`);
    }
  }

  manifest.generatedAt = new Date().toISOString();

  if (downloadedCount && !DRY_RUN) {
    await writeJson(MANIFEST_FILE, manifest);
  }
  if (changedPlan && !DRY_RUN) {
    await writeJson(PLAN_FILE, plan);
  }

  console.log(`\nDone. Downloaded: ${downloadedCount}${ACTIVATE ? ', plan updated when assets resolved.' : ''}`);
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.message}`);
  process.exit(1);
});

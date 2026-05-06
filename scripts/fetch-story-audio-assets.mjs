#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PLAN_FILE = path.join(ROOT, 'config', 'story-audio-plan.json');
const MANIFEST_FILE = path.join(ROOT, 'config', 'story-audio-sourced.json');
const SFX_LIBRARY_FILE = path.join(ROOT, 'config', 'sfx-library.json');

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
  return Array.isArray(value) ? value : [];
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

function pickFreesoundPreviewUrl(hit = {}) {
  return hit.previews?.['preview-lq-mp3']
    || hit.previews?.['preview-hq-mp3']
    || hit.previews?.['preview-lq-ogg']
    || hit.previews?.['preview-hq-ogg']
    || '';
}

function pickFreesoundTitle(hit = {}, fallback = 'sound') {
  return hit.name || hit.title || hit.id || fallback;
}

function guessSfxVolume(query = '') {
  const q = String(query).toLowerCase();
  if (q.includes('whoosh') || q.includes('impact') || q.includes('gust')) return 0.13;
  if (q.includes('wind') || q.includes('breeze') || q.includes('ambience') || q.includes('ambient')) return 0.16;
  if (q.includes('grass') || q.includes('rustle') || q.includes('leaves')) return 0.17;
  if (q.includes('sea') || q.includes('water') || q.includes('ocean')) return 0.16;
  return 0.16;
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
  if (!key) throw new Error('PIXABAY_API_KEY is missing');

  const url = new URL('https://pixabay.com/api/audio/');
  url.searchParams.set('key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('per_page', String(Math.max(LIMIT, 3)));
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('order', 'popular');

  const response = await fetch(url, {
    headers: {
      'user-agent': 'JoyMazeContent/1.0 (+story audio fetch)',
      accept: 'application/json,text/plain,*/*',
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

async function searchFreesound(query) {
  const token = process.env.FREESOUND_API_KEY;
  if (!token) throw new Error('FREESOUND_API_KEY is missing');

  const url = new URL('https://freesound.org/apiv2/search/text/');
  url.searchParams.set('query', query);
  url.searchParams.set('token', token);
  url.searchParams.set('fields', 'id,name,previews,license,username,url,duration');
  url.searchParams.set('filter', 'duration:[3 TO 60]');
  url.searchParams.set('page_size', String(Math.max(LIMIT, 4)));
  url.searchParams.set('sort', 'score');

  const response = await fetch(url, {
    headers: {
      'user-agent': 'JoyMazeContent/1.0 (+story audio fetch)',
      accept: 'application/json',
    },
  });

  const bodyText = await response.text();
  if (!response.ok) {
    const detail = bodyText.slice(0, 240).replace(/\s+/g, ' ').trim();
    throw new Error(`Freesound API error ${response.status}: ${detail}`);
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new Error(`Freesound API returned non-JSON response: ${bodyText.slice(0, 240)}`);
  }

  return Array.isArray(payload?.results) ? payload.results : [];
}

function relativeToPosix(...parts) {
  return path.posix.join(...parts.map((part) => String(part).replace(/\\/g, '/')));
}

function buildSfxTagName(lane, role) {
  return `ext_${lane}_${role}`;
}

function getSfxRoleAssignments(downloadedTags = []) {
  return {
    hookSfxTag: downloadedTags[0] || null,
    act1SfxTag: downloadedTags[0] || null,
    act2SfxTag: downloadedTags[1] || downloadedTags[0] || null,
  };
}

async function fetchMusicForLane({ lane, lanePlan, manifest, plan }) {
  const targets = pickArray(lanePlan.externalTargets?.music).map(parseExternalTarget);
  const pixabayTargets = targets.filter((target) => target.provider === 'pixabay' && target.query);

  if (!pixabayTargets.length) {
    console.log(`No Pixabay music targets configured for lane ${lane}`);
    return { downloadedCount: 0, changedPlan: false };
  }

  const poolPaths = [];
  const laneDir = path.join(ROOT, 'assets', 'audio', 'external', 'pixabay', lane);
  if (!DRY_RUN) await ensureDir(laneDir);

  console.log(`\nLane: ${lane} (music)`);
  let downloadedCount = 0;
  let changedPlan = false;

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
    const relativePath = relativeToPosix('assets', 'audio', 'external', 'pixabay', lane, `${baseName}.mp3`);
    const absolutePath = path.join(ROOT, relativePath);

    console.log(`  -> ${title}`);
    if (!DRY_RUN) await downloadFile(audioUrl, absolutePath);

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
    poolPaths.push(relativePath);
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

  return { downloadedCount, changedPlan };
}

async function fetchSfxForLane({ lane, lanePlan, manifest, sfxLibrary }) {
  const targets = pickArray(lanePlan.externalTargets?.sfx).map(parseExternalTarget);
  const freesoundTargets = targets.filter((target) => target.provider === 'freesound' && target.query);

  if (!freesoundTargets.length) {
    console.log(`No Freesound SFX targets configured for lane ${lane}`);
    return { downloadedCount: 0, changedPlan: false, changedLibrary: false };
  }

  const laneDir = path.join(ROOT, 'assets', 'sfx', 'external', 'freesound', lane);
  if (!DRY_RUN) await ensureDir(laneDir);

  console.log(`\nLane: ${lane} (sfx)`);
  let downloadedCount = 0;
  let changedPlan = false;
  let changedLibrary = false;
  const downloadedTags = [];

  for (const [index, target] of freesoundTargets.slice(0, LIMIT).entries()) {
    console.log(`  Query: ${target.query}`);
    let hits = [];
    try {
      hits = await searchFreesound(target.query);
    } catch (error) {
      console.warn(`  ! ${error.message}`);
      continue;
    }

    if (!hits.length) {
      console.log('  ! No sound hits returned');
      continue;
    }

    const selected = hits.find((hit) => pickFreesoundPreviewUrl(hit)) || hits[0];
    const audioUrl = pickFreesoundPreviewUrl(selected);
    if (!audioUrl) {
      console.log('  ! Hit returned but no preview URL could be resolved');
      continue;
    }

    const title = pickFreesoundTitle(selected, target.query);
    const baseName = `${slugify(target.query)}-${String(selected.id || `sound-${index + 1}`)}`;
    const relativePath = relativeToPosix('assets', 'sfx', 'external', 'freesound', lane, `${baseName}.mp3`);
    const absolutePath = path.join(ROOT, relativePath);
    const role = index === 0 ? 'hook_act1' : index === 1 ? 'act2' : `alt_${index + 1}`;
    const tagName = buildSfxTagName(lane, role);
    const volume = guessSfxVolume(target.query);

    console.log(`  -> ${title}`);
    if (!DRY_RUN) await downloadFile(audioUrl, absolutePath);

    manifest.downloads.push({
      fetchedAt: new Date().toISOString(),
      provider: 'freesound',
      kind: 'sfx',
      lane,
      query: target.query,
      id: selected.id ?? null,
      title,
      audioUrl,
      username: selected.username ?? null,
      license: selected.license ?? null,
      relativePath,
      tagName,
    });

    sfxLibrary.tags[tagName] = {
      file: relativePath,
      volume,
    };
    downloadedTags.push(tagName);
    downloadedCount += 1;
    changedLibrary = true;
  }

  if (downloadedTags.length && ACTIVATE) {
    const assignments = getSfxRoleAssignments(downloadedTags);
    if (assignments.hookSfxTag) lanePlan.hookSfxTag = assignments.hookSfxTag;
    if (assignments.act1SfxTag) lanePlan.act1SfxTag = assignments.act1SfxTag;
    if (assignments.act2SfxTag) lanePlan.act2SfxTag = assignments.act2SfxTag;
    changedPlan = true;
    console.log(`  Activated SFX tags: ${downloadedTags.join(', ')}`);
  }

  return { downloadedCount, changedPlan, changedLibrary };
}

async function main() {
  const plan = await readJson(PLAN_FILE);
  if (!plan) throw new Error('Missing config/story-audio-plan.json');

  const manifest = (await readJson(MANIFEST_FILE, {
    version: 1,
    generatedAt: null,
    downloads: [],
  })) || { version: 1, generatedAt: null, downloads: [] };

  const sfxLibrary = (await readJson(SFX_LIBRARY_FILE, {
    tags: {},
    _note: 'Add files to assets/sfx/ subfolders. Render script resolves tags at render time — missing files fall back silently.',
  })) || { tags: {} };

  const requestedLanes = laneArg ? [laneArg] : Object.keys(plan.lanePlans || {}).filter((lane) => lane !== 'default');
  if (!requestedLanes.length) throw new Error('No lanes available in story-audio-plan.json');
  if (!['music', 'sfx'].includes(kindArg)) throw new Error(`Unsupported --kind ${kindArg}. Use music or sfx.`);

  let changedPlan = false;
  let changedLibrary = false;
  let downloadedCount = 0;

  for (const lane of requestedLanes) {
    const lanePlan = plan.lanePlans?.[lane];
    if (!lanePlan) {
      console.warn(`Skipping unknown lane: ${lane}`);
      continue;
    }

    if (kindArg === 'music') {
      const result = await fetchMusicForLane({ lane, lanePlan, manifest, plan });
      changedPlan = changedPlan || result.changedPlan;
      downloadedCount += result.downloadedCount;
    } else {
      const result = await fetchSfxForLane({ lane, lanePlan, manifest, sfxLibrary });
      changedPlan = changedPlan || result.changedPlan;
      changedLibrary = changedLibrary || result.changedLibrary;
      downloadedCount += result.downloadedCount;
    }
  }

  manifest.generatedAt = new Date().toISOString();

  if (downloadedCount && !DRY_RUN) await writeJson(MANIFEST_FILE, manifest);
  if (changedPlan && !DRY_RUN) await writeJson(PLAN_FILE, plan);
  if (changedLibrary && !DRY_RUN) await writeJson(SFX_LIBRARY_FILE, sfxLibrary);

  console.log(`\nDone. Downloaded: ${downloadedCount}${ACTIVATE ? ', activation applied where assets resolved.' : ''}`);
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.message}`);
  process.exit(1);
});

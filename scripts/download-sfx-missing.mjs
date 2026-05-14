/**
 * download-sfx-missing.mjs
 * Downloads missing SFX files from Freesound and adds 4 new tags to sfx-library.json
 * One-off script — safe to re-run (skips already-downloaded files)
 */

import { writeFileSync, mkdirSync, existsSync, createWriteStream } from 'fs';
import { readFileSync } from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API_KEY = 'olxn50cNjgzNlcHztMqDV5LNbxSNVL7VqDwl1qnl';
const BASE_URL = 'https://freesound.org/apiv2';

// ── Files to download (tags already in sfx-library.json, files missing on disk) ──
const MISSING_FILES = [
  { tag: 'footsteps_indoor',  path: 'assets/sfx/nature/footsteps_indoor.mp3',    query: 'indoor footsteps quiet' },
  { tag: 'rain_gentle',       path: 'assets/sfx/nature/rain_gentle.mp3',          query: 'gentle rain soft ambience' },
  { tag: 'ocean_waves',       path: 'assets/sfx/nature/ocean_waves.mp3',          query: 'ocean waves calm shore' },
  { tag: 'fire_crackling',    path: 'assets/sfx/nature/fire_crackling.mp3',       query: 'fire crackling soft' },
  { tag: 'wind_indoor',       path: 'assets/sfx/nature/wind_indoor.mp3',          query: 'indoor wind subtle' },
  { tag: 'crowd_children',    path: 'assets/sfx/ambient/crowd_children.mp3',      query: 'children playing ambient' },
  { tag: 'book_page_turn',    path: 'assets/sfx/ambient/book_page_turn.mp3',      query: 'book page turn' },
  { tag: 'magic_sparkle',     path: 'assets/sfx/emotional/magic_sparkle.mp3',     query: 'magic sparkle shimmer' },
];

// ── New tags to ADD to sfx-library.json ──
const NEW_TAGS = [
  {
    tag: 'payoff_release',
    entry: { file: 'assets/sfx/emotional/payoff_release.mp3', volume: 0.18 },
    path: 'assets/sfx/emotional/payoff_release.mp3',
    query: 'warm resolution chime emotional',
  },
  {
    tag: 'hook_observed',
    entry: { file: 'assets/sfx/nature/hook_observed.mp3', volume: 0.14 },
    path: 'assets/sfx/nature/hook_observed.mp3',
    query: 'quiet suspense nature night',
  },
  {
    tag: 'middle_night',
    entry: { file: 'assets/sfx/nature/middle_night.mp3', volume: 0.16 },
    path: 'assets/sfx/nature/middle_night.mp3',
    query: 'night ambience crickets soft',
  },
  {
    tag: 'middle_motion',
    entry: { file: 'assets/sfx/nature/middle_motion.mp3', volume: 0.17 },
    path: 'assets/sfx/nature/middle_motion.mp3',
    query: 'footsteps movement outdoor',
  },
];

// ── Helpers ──

async function freesoundSearch(query) {
  // Freesound v2 accepts token as query param OR as "Authorization: Token <key>" header
  // The filter must be URL-encoded — square brackets need encoding
  const params = new URLSearchParams({
    query,
    fields: 'id,name,duration,previews,license',
    filter: 'duration:[1 TO 60]',
    page_size: '5',
    token: API_KEY,
  });
  const url = `${BASE_URL}/search/text/?${params}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Token ${API_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Search HTTP ${res.status} for query "${query}" — ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  return data.results || [];
}

function pickResult(results) {
  // prefer duration 5–45s
  for (const r of results) {
    if (r.duration >= 5 && r.duration <= 45 && r.previews?.['preview-hq-mp3']) return r;
  }
  // fallback: any result with a preview
  for (const r of results) {
    if (r.previews?.['preview-hq-mp3']) return r;
  }
  return null;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const doRequest = (targetUrl, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      https.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doRequest(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} downloading ${targetUrl}`));
        }
        const ws = createWriteStream(destPath);
        res.pipe(ws);
        ws.on('finish', () => ws.close(() => resolve()));
        ws.on('error', reject);
      }).on('error', reject);
    };

    doRequest(url);
  });
}

async function downloadTag(tag, filePath, query) {
  const absPath = path.join(ROOT, filePath);

  if (existsSync(absPath)) {
    console.log(`  [SKIP] ${tag} — already exists at ${filePath}`);
    return { tag, status: 'skipped' };
  }

  let results = await freesoundSearch(query);

  // Retry with shorter query if 0 results
  if (results.length === 0) {
    const shorterQuery = query.split(' ').slice(0, -1).join(' ');
    console.log(`  [RETRY] 0 results for "${query}", trying "${shorterQuery}"`);
    results = await freesoundSearch(shorterQuery);
  }

  if (results.length === 0) {
    console.log(`  [FAIL] ${tag} — no results found`);
    return { tag, status: 'no_results' };
  }

  const picked = pickResult(results);
  if (!picked) {
    console.log(`  [FAIL] ${tag} — no usable preview in results`);
    return { tag, status: 'no_preview' };
  }

  const previewUrl = picked.previews['preview-hq-mp3'];
  console.log(`  [DL]   ${tag} — "${picked.name}" (${picked.duration.toFixed(1)}s) → ${filePath}`);

  await downloadFile(previewUrl, absPath);
  console.log(`  [OK]   ${tag} saved`);
  return { tag, status: 'downloaded', source: picked.name, duration: picked.duration };
}

// ── Main ──

async function main() {
  console.log('=== download-sfx-missing.mjs ===\n');

  // Ensure base dirs exist
  for (const dir of ['assets/sfx/nature', 'assets/sfx/ambient', 'assets/sfx/emotional']) {
    const abs = path.join(ROOT, dir);
    if (!existsSync(abs)) {
      mkdirSync(abs, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  }

  const results = {};

  // Step 1: Download the 8 missing files (tags already in JSON)
  console.log('\n--- Downloading 8 missing files (tags already in sfx-library.json) ---');
  for (const item of MISSING_FILES) {
    try {
      results[item.tag] = await downloadTag(item.tag, item.path, item.query);
    } catch (err) {
      console.log(`  [ERR] ${item.tag} — ${err.message}`);
      results[item.tag] = { tag: item.tag, status: 'error', error: err.message };
    }
  }

  // Step 2: Download files for the 4 NEW tags
  console.log('\n--- Downloading 4 new-tag files ---');
  for (const item of NEW_TAGS) {
    try {
      results[item.tag] = await downloadTag(item.tag, item.path, item.query);
    } catch (err) {
      console.log(`  [ERR] ${item.tag} — ${err.message}`);
      results[item.tag] = { tag: item.tag, status: 'error', error: err.message };
    }
  }

  // Step 3: Add 4 new tags to sfx-library.json
  console.log('\n--- Updating config/sfx-library.json ---');
  const sfxPath = path.join(ROOT, 'config/sfx-library.json');
  const sfxLib = JSON.parse(readFileSync(sfxPath, 'utf8'));

  let added = 0;
  for (const item of NEW_TAGS) {
    if (sfxLib.tags[item.tag]) {
      console.log(`  [SKIP] tag "${item.tag}" already exists — not overwriting`);
    } else {
      sfxLib.tags[item.tag] = item.entry;
      console.log(`  [ADD]  "${item.tag}" → ${item.entry.file} (vol ${item.entry.volume})`);
      added++;
    }
  }

  writeFileSync(sfxPath, JSON.stringify(sfxLib, null, 2) + '\n', 'utf8');
  console.log(`\nWrote sfx-library.json — ${added} tag(s) added.\n`);

  // Step 4: Summary
  console.log('=== SUMMARY ===');
  const downloaded = Object.values(results).filter(r => r.status === 'downloaded');
  const skipped    = Object.values(results).filter(r => r.status === 'skipped');
  const failed     = Object.values(results).filter(r => ['error', 'no_results', 'no_preview'].includes(r.status));

  console.log(`Downloaded : ${downloaded.length}`);
  for (const r of downloaded) console.log(`  + ${r.tag} — "${r.source}" (${r.duration?.toFixed(1)}s)`);

  console.log(`Skipped    : ${skipped.length}`);
  for (const r of skipped) console.log(`  = ${r.tag}`);

  console.log(`Failed     : ${failed.length}`);
  for (const r of failed) console.log(`  x ${r.tag} — ${r.status}${r.error ? ': ' + r.error : ''}`);

  console.log(`JSON tags added: ${added}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });

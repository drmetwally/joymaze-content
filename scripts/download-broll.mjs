#!/usr/bin/env node

/**
 * download-broll.mjs
 * Downloads B-roll clips from Pixabay (animated/cartoon, primary) and Pexels (live footage, fallback).
 *
 * Strategy per fact:
 *   1. Groq generates 2-3 behavior/trait keywords from the fact description
 *   2. Pixabay searched first with "[animal] cartoon" query (animated clips)
 *   3. Pexels searched as fallback with "[animal] + keyword" (live footage)
 *   4. Best clip downloaded, transcoded to 1920×1080 H.264 at 30fps CFR
 *   5. episode.brollClips written to episode.json
 *
 * Clips are muted at render time — narration is the only audio track.
 * Graceful fallback: skips any fact where neither source finds a qualifying clip.
 *
 * Usage:
 *   npm run longform:animal:broll -- --episode output/longform/animal/ep03-hedgehog
 *   npm run longform:animal:broll -- --episode output/longform/animal/ep03-hedgehog --force
 *   npm run longform:animal:broll -- --episode output/longform/animal/ep03-hedgehog --dry-run
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function findFfmpeg() {
  const candidates = [
    path.join(ROOT, 'node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe'),
    'D:/Dev/ffmpeg/ffmpeg.exe',
    'ffmpeg',
  ];
  for (const c of candidates) {
    if (c === 'ffmpeg') return c; // plain command — let OS resolve it
    if (existsSync(c)) return c;
  }
  return 'ffmpeg';
}

// Force 30fps CFR, strip audio — Remotion bundled FFmpeg has pad/scale-pad disabled,
// so use scale=w:h only (stretches non-16:9 clips, acceptable since Pixabay is 1920×1080).
// -c:v copy is used when already H.264; fallback to libx264 if container copy fails.
function transcodeClip(rawPath, outPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = findFfmpeg();
    // Try fast copy first (audio strip only — works for already-CFR 1920×1080 H.264)
    const copyCmd = `"${ffmpeg}" -y -i "${rawPath}" -c:v copy -an "${outPath}"`;
    exec(copyCmd, (err) => {
      if (!err) return resolve();
      // Fallback: re-encode with scale (pad filter not available in Remotion FFmpeg build)
      const encCmd = `"${ffmpeg}" -y -i "${rawPath}" -vf "scale=1920:1080" -r 30 -c:v libx264 -crf 23 -preset fast -an "${outPath}"`;
      exec(encCmd, (err2) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });
}

const GROQ_MODEL      = 'llama-3.3-70b-versatile';
const GROQ_MAX_TOKENS = 80;
const PEXELS_BASE     = 'https://api.pexels.com/videos/search';
const PIXABAY_BASE    = 'https://pixabay.com/api/videos/';
const FACT_KEYS       = ['fact1', 'fact2', 'fact3', 'fact4', 'fact5'];
const MIN_CLIP_SEC    = 5;    // minimum clip duration in seconds
const MIN_CLIP_WIDTH  = 1280; // minimum width in pixels (HD)

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE   = args.includes('--force');

const episodeArg = (() => {
  const i = args.indexOf('--episode');
  return i !== -1 ? args[i + 1] : null;
})();

if (!episodeArg) {
  console.error('Usage: node scripts/download-broll.mjs --episode output/longform/animal/ep01-slug [--dry-run] [--force]');
  process.exit(1);
}

function resolveEpisodeDir(arg) {
  if (path.isAbsolute(arg) || arg.startsWith('output/') || arg.startsWith('output\\') || arg.includes(':\\')) {
    return path.resolve(ROOT, arg);
  }
  return path.join(ROOT, 'output', 'longform', 'animal', arg);
}

async function loadJson(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf-8')); } catch { return null; }
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function callGroq(userPrompt) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  const res = await client.chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: GROQ_MAX_TOKENS,
    temperature: 0.3,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return res.choices[0]?.message?.content?.trim() || '';
}

async function getKeywords(animalName, description) {
  const prompt = `Generate 2-3 short search keywords for finding cartoon/animated video clips about this animal fact.
Animal: ${animalName}
Fact: "${description.substring(0, 120)}"

Output a JSON array of 2-3 keyword strings (1-2 words each). Focus on the BEHAVIOR described, not generic terms.
Examples: ["sleeping", "spines defense"], ["swimming water", "holding paws"]
Output ONLY the JSON array.`;

  try {
    const raw = await callGroq(prompt);
    const match = raw.match(/\[.*?\]/s);
    if (match) {
      const keywords = JSON.parse(match[0]);
      if (Array.isArray(keywords) && keywords.length > 0) return keywords;
    }
  } catch { /* fall through */ }
  return ['animal'];
}

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Pixabay video search — returns animated/cartoon clips first
async function pixabaySearch(query, videoType = 'animation') {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return null;
  const url = `${PIXABAY_BASE}?key=${apiKey}&q=${encodeURIComponent(query)}&video_type=${videoType}&min_width=${MIN_CLIP_WIDTH}&per_page=10&safesearch=true`;
  try {
    return await fetchJson(url);
  } catch { return null; }
}

function pickBestPixabayClip(result) {
  if (!result?.hits?.length) return null;
  const qualifying = result.hits
    .filter((v) => v.duration >= MIN_CLIP_SEC)
    .map((v) => {
      // Pixabay video sizes: large (1920+), medium, small, tiny
      const file = v.videos?.large?.url ? v.videos.large
        : v.videos?.medium?.url ? v.videos.medium
        : null;
      if (!file || !file.url) return null;
      const width = file.width || 1280;
      return { url: file.url, score: v.duration + (width / 100), duration: v.duration, width };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return qualifying[0] || null;
}

// Pexels video search — live footage fallback
async function pexelsSearch(query) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;
  const url = `${PEXELS_BASE}?query=${encodeURIComponent(query)}&orientation=landscape&size=large&per_page=10`;
  try {
    return await fetchJson(url, { Authorization: apiKey });
  } catch { return null; }
}

function pickBestPexelsClip(result) {
  if (!result?.videos?.length) return null;
  const scored = result.videos
    .filter((v) => v.duration >= MIN_CLIP_SEC)
    .map((v) => {
      const bestFile = (v.video_files || [])
        .filter((f) => f.width >= MIN_CLIP_WIDTH && f.file_type === 'video/mp4')
        .sort((a, b) => b.width - a.width)[0];
      if (!bestFile) return null;
      return { url: bestFile.link, score: v.duration + (bestFile.width / 100), duration: v.duration, width: bestFile.width };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function downloadFile(url, destPath, attempt = 1) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location, destPath, attempt).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    request.on('error', async (err) => {
      file.close();
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000));
        downloadFile(url, destPath, attempt + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

async function main() {
  const episodeDir  = resolveEpisodeDir(episodeArg);
  const episodePath = path.join(episodeDir, 'episode.json');

  const episode = await loadJson(episodePath);
  if (!episode) throw new Error(`episode.json not found at ${episodePath}`);

  const hasPixabay = !!process.env.PIXABAY_API_KEY;
  const hasPexels  = !!process.env.PEXELS_API_KEY;

  console.log('\n  JoyMaze B-Roll Downloader');
  console.log(`  Animal: ${episode.animalName}`);
  console.log(`  Episode: ${episodeDir}`);
  console.log(`  Sources: ${[hasPixabay && 'Pixabay (animated)', hasPexels && 'Pexels (live)'].filter(Boolean).join(' → ')}`);
  console.log(`  Mode: ${DRY_RUN ? 'dry-run' : FORCE ? 'force' : 'normal'}`);
  console.log();

  if (!hasPixabay && !hasPexels) {
    console.error('  ERROR: Set PIXABAY_API_KEY and/or PEXELS_API_KEY in .env');
    process.exit(1);
  }

  const brollClips = episode.brollClips || {};
  let dirty = false;

  for (const factKey of FACT_KEYS) {
    const fact = episode[factKey];
    if (!fact) { console.log(`  Skip: ${factKey} — not in episode.json`); continue; }

    const outFile    = `broll-${factKey}.mp4`;
    const outPath    = path.join(episodeDir, outFile);
    const alreadyHas = await fileExists(outPath);

    if (alreadyHas && !FORCE) {
      console.log(`  Skip: ${outFile} exists (--force to re-download)`);
      if (!brollClips[factKey]) { brollClips[factKey] = outFile; dirty = true; }
      continue;
    }

    const description = fact.description || fact.narration || '';
    process.stdout.write(`  ${factKey.toUpperCase()} — generating keywords...`);
    const behaviorKeywords = await getKeywords(episode.animalName, description);
    console.log(` [${behaviorKeywords.join(', ')}]`);

    let picked = null;
    const animalLower = episode.animalName.toLowerCase();

    // ── PASS 1: Pixabay animated — "[animal] cartoon" ──────────────────────
    if (hasPixabay) {
      const cartoonQuery = `${animalLower} cartoon`;
      if (DRY_RUN) {
        console.log(`    Would search Pixabay (animated): "${cartoonQuery}"`);
      } else {
        process.stdout.write(`    Pixabay animated: "${cartoonQuery}"...`);
        const res = await pixabaySearch(cartoonQuery, 'animation');
        picked = pickBestPixabayClip(res);
        console.log(picked ? ` found (${picked.duration}s, ${picked.width}px)` : ' no clip');
      }
    }

    // ── PASS 2: Pixabay behavior + animal (animation) ──────────────────────
    if (!picked && hasPixabay) {
      for (const kw of behaviorKeywords) {
        const query = `${animalLower} ${kw}`;
        if (DRY_RUN) { console.log(`    Would search Pixabay (animated): "${query}"`); continue; }
        process.stdout.write(`    Pixabay animated: "${query}"...`);
        const res = await pixabaySearch(query, 'animation');
        picked = pickBestPixabayClip(res);
        console.log(picked ? ` found (${picked.duration}s, ${picked.width}px)` : ' no clip');
        if (picked) break;
      }
    }

    // ── PASS 3: Pixabay all video types (includes film clips) ─────────────
    if (!picked && hasPixabay) {
      const query = animalLower;
      if (DRY_RUN) {
        console.log(`    Would search Pixabay (all): "${query}"`);
      } else {
        process.stdout.write(`    Pixabay all: "${query}"...`);
        const res = await pixabaySearch(query, 'all');
        picked = pickBestPixabayClip(res);
        console.log(picked ? ` found (${picked.duration}s, ${picked.width}px)` : ' no clip');
      }
    }

    // ── PASS 4: Pexels live footage — "[animal] + behavior" ───────────────
    if (!picked && hasPexels) {
      for (const kw of behaviorKeywords) {
        const query = kw.toLowerCase().includes(animalLower) ? kw : `${animalLower} ${kw}`;
        if (DRY_RUN) { console.log(`    Would search Pexels: "${query}"`); continue; }
        process.stdout.write(`    Pexels: "${query}"...`);
        const res = await pexelsSearch(query);
        picked = res ? pickBestPexelsClip(res) : null;
        if (picked) { picked.source = 'pexels'; }
        console.log(picked ? ` found (${picked.duration}s, ${picked.width}px)` : ' no clip');
        if (picked) break;
      }
    }

    // ── PASS 5: Pexels animal name only ────────────────────────────────────
    if (!picked && hasPexels) {
      if (DRY_RUN) {
        console.log(`    Would search Pexels fallback: "${animalLower}"`);
      } else {
        process.stdout.write(`    Pexels fallback: "${animalLower}"...`);
        const res = await pexelsSearch(animalLower);
        picked = res ? pickBestPexelsClip(res) : null;
        if (picked) { picked.source = 'pexels'; }
        console.log(picked ? ` found (${picked.duration}s, ${picked.width}px)` : ' no clip');
      }
    }

    if (!picked) {
      console.log(`    No clip found — fact scene will use illustrated image (Ken Burns)`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`    Would download → ${outFile}`);
      continue;
    }

    process.stdout.write(`    Downloading → ${outFile}...`);
    const rawPath = outPath.replace('.mp4', '-raw.mp4');
    try {
      await downloadFile(picked.url, rawPath);
      process.stdout.write(` transcoding to 1920×1080 @30fps CFR...`);
      await transcodeClip(rawPath, outPath);
      await fs.unlink(rawPath).catch(() => {});
      console.log(' done');
      brollClips[factKey] = outFile;
      dirty = true;
    } catch (err) {
      console.log(` FAILED (${err.message}) — using illustrated image fallback`);
      await fs.unlink(rawPath).catch(() => {});
      await fs.unlink(outPath).catch(() => {});
    }
    console.log();
  }

  if (!DRY_RUN && dirty) {
    episode.brollClips = brollClips;
    await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`);
    console.log(`  episode.json updated — brollClips: ${JSON.stringify(brollClips)}`);
  }

  if (DRY_RUN) {
    console.log('  Dry run complete. No files written.');
    return;
  }

  const downloaded = Object.keys(brollClips).length;
  const skipped    = FACT_KEYS.length - downloaded;
  console.log(`\n  B-roll complete: ${downloaded}/5 clips downloaded${skipped > 0 ? `, ${skipped} using illustrated image fallback` : ''}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

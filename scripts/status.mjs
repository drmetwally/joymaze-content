#!/usr/bin/env node
/**
 * npm run status
 * Full pipeline snapshot: generation state, media queue, archive, X text posts, cooldown.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const QUEUE_DIR  = path.join(ROOT, 'output', 'queue');
const ARCHIVE    = path.join(ROOT, 'output', 'archive');
const COOLDOWN   = path.join(ROOT, 'output', 'posting-cooldown.json');

const PLATFORMS = ['pinterest', 'instagram', 'x', 'tiktok', 'youtube'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function utcDateStr(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

async function readJSON(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); }
  catch { return null; }
}

async function listDir(p) {
  try { return await fs.readdir(p); }
  catch { return []; }
}

async function exists(p) {
  try { await fs.access(p); return true; }
  catch { return false; }
}

// ── Cooldown ─────────────────────────────────────────────────────────────────

async function printCooldown(now) {
  const data = await readJSON(COOLDOWN);
  if (!data) { console.log('Cooldown    : none — posting active\n'); return; }
  const until = new Date(data.until); until.setUTCHours(0,0,0,0);
  const today = new Date(now);        today.setUTCHours(0,0,0,0);
  const active = until > today;
  const days   = Math.ceil((until - today) / 86_400_000);
  if (active) {
    console.log(`Cooldown    : ⏸  ACTIVE until ${data.until} (${days} day(s) left)`);
    console.log(`  Reason    : ${data.reason}`);
  } else {
    console.log(`Cooldown    : ✓ expired (was until ${data.until})`);
  }
  console.log('');
}

// ── Generation state ─────────────────────────────────────────────────────────

async function printGenerationState(todayUTC) {
  console.log('── Generation (today) ' + '─'.repeat(30));

  // Prompts
  const promptFile = path.join(ROOT, 'output', 'prompts', `prompts-${todayUTC}.md`);
  console.log(`  Prompts   : ${await exists(promptFile) ? '✓ generated' : '✗ not yet generated'}`);

  // Media queue items (non x-text)
  const queueFiles = (await listDir(QUEUE_DIR))
    .filter(f => f.endsWith('.json') && !f.startsWith('x-text-'));
  console.log(`  Images    : ${queueFiles.length} item(s) in queue`);
  if (queueFiles.length > 0) {
    for (const f of queueFiles) {
      const item = await readJSON(path.join(QUEUE_DIR, f));
      const cat = item?.category || item?.type || 'unknown';
      console.log(`    - ${f.replace('.json','')}  (${cat})`);
    }
  }

  // Stories
  const storyEps = (await listDir(path.join(ROOT, 'output', 'stories')))
    .filter(e => !e.startsWith('.'));
  console.log(`  Stories   : ${storyEps.length} episode(s)${storyEps.length ? ' — ' + storyEps.join(', ') : ''}`);

  // ASMR
  const asmrItems = (await listDir(path.join(ROOT, 'output', 'asmr')))
    .filter(e => !e.startsWith('.'));
  console.log(`  ASMR      : ${asmrItems.length} brief(s)${asmrItems.length ? ' — ' + asmrItems.join(', ') : ''}`);

  // Videos
  const videoItems = (await listDir(path.join(ROOT, 'output', 'videos')))
    .filter(e => !e.startsWith('.'));
  console.log(`  Videos    : ${videoItems.length} rendered`);

  console.log('');
}

// ── Archive summary ───────────────────────────────────────────────────────────

async function printArchive(todayUTC) {
  const days = (await listDir(ARCHIVE))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse()
    .slice(0, 5); // last 5 days

  if (!days.length) { return; }

  console.log('── Recent Archive (posted media) ' + '─'.repeat(19));

  for (const day of days) {
    const isToday = day === todayUTC;
    const dir = path.join(ARCHIVE, day);
    const files = (await listDir(dir)).filter(f => f.endsWith('.json'));
    if (!files.length) continue;

    // per-platform counts
    const counts = {};
    for (const p of PLATFORMS) counts[p] = { ok: 0, fail: 0, pending: 0 };
    let total = 0;

    for (const f of files) {
      const item = await readJSON(path.join(dir, f));
      if (!item?.platforms) continue;
      total++;
      for (const p of PLATFORMS) {
        const pl = item.platforms[p];
        if (!pl) continue;
        if (pl.status === 'posted')  counts[p].ok++;
        else if (pl.status === 'failed') counts[p].fail++;
        else counts[p].pending++;
      }
    }

    const summary = PLATFORMS
      .filter(p => counts[p].ok + counts[p].fail + counts[p].pending > 0)
      .map(p => {
        const { ok, fail } = counts[p];
        return `${p[0].toUpperCase()}${p.slice(1)} ${ok}✓${fail ? ' ' + fail + '✗' : ''}`;
      })
      .join('  ');

    console.log(`  ${day}${isToday ? ' (today)' : ''}  ${total} items  |  ${summary || 'no platform data'}`);
  }

  console.log('');
}

// ── X text queue ─────────────────────────────────────────────────────────────

function entryStatus(entry, nowHour) {
  if (entry.posted === true)            return '✓ posted ';
  if (entry.error)                      return '✗ failed ';
  if (entry.tweetId)                    return '~ partial';
  if (entry.scheduledHour <= nowHour)   return '⚡ due now';
  return '⏳ pending';
}

async function printXQueue(todayUTC, nowHour) {
  const filePath = path.join(QUEUE_DIR, `x-text-${todayUTC}.json`);
  const entries  = await readJSON(filePath);

  console.log('── X Text Posts — Today ' + '─'.repeat(27));

  if (!Array.isArray(entries)) {
    console.log('  (no queue file for today — run npm run x:generate)\n');
    return;
  }

  let nextPending = null;
  for (const e of entries) {
    const status = entryStatus(e, nowHour);
    const hour   = `${pad(e.scheduledHour ?? '?')}:00 UTC`;
    const type   = (e.type || 'unknown').padEnd(12);
    let extra    = '';
    if (e.tweetId)  extra  = `  id:${e.tweetId}`;
    if (e.postedAt) extra += `  @ ${e.postedAt.slice(0,16).replace('T',' ')}`;
    if (e.error)    extra  = `  ERR: ${e.error.slice(0,55)}`;
    console.log(`  ${hour}  ${type}  ${status}${extra}`);
    if (e.posted !== true && !e.error && nextPending === null) nextPending = e.scheduledHour;
  }

  const posted  = entries.filter(e => e.posted === true).length;
  const failed  = entries.filter(e => e.error).length;
  const pending = entries.length - posted - failed;
  console.log(`\n  Summary: ${posted}/${entries.length} posted  |  ${pending} pending  |  ${failed} failed`);
  if (nextPending !== null) console.log(`  Next post: ${pad(nextPending)}:00 UTC`);
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const now     = new Date();
  const nowHour = now.getUTCHours();
  const today   = utcDateStr(now);

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         JoyMaze Pipeline Status                  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Time        : ${now.toUTCString()}`);
  console.log(`UTC date    : ${today}  |  UTC hour: ${nowHour}:xx`);
  console.log('');

  await printCooldown(now);
  await printGenerationState(today);
  await printArchive(today);
  await printXQueue(today, nowHour);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });

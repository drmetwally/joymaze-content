#!/usr/bin/env node
/**
 * generate-brief.mjs
 * Generates a daily HTML brief from output/queue/ for manual copy-paste posting.
 * Usage: node scripts/generate-brief.mjs [YYYY-MM-DD]
 *        npm run brief
 */

import fs from 'fs';
import path from 'path';

const DATE = process.argv[2] || new Date().toISOString().split('T')[0];
const QUEUE_DIR = 'output/queue';
const OUT_FILE = `output/daily-brief-${DATE}.html`;

const PLATFORM_META = {
  pinterest:  { label: 'Pinterest',  color: '#E60023', emoji: '📌' },
  instagram:  { label: 'Instagram',  color: '#E1306C', emoji: '📸' },
  tiktok:     { label: 'TikTok',     color: '#69C9D0', emoji: '🎵' },
  youtube:    { label: 'YouTube',    color: '#FF0000', emoji: '▶' },
  x:          { label: 'X',         color: '#888',    emoji: '✕' },
};

// ─── File discovery ──────────────────────────────────────────────────────────

function readQueueFiles() {
  if (!fs.existsSync(QUEUE_DIR)) {
    console.error(`Queue directory not found: ${QUEUE_DIR}`);
    process.exit(1);
  }

  let files = fs.readdirSync(QUEUE_DIR)
    .filter(f => f.endsWith('.json') && f.includes(DATE))
    .map(f => path.join(QUEUE_DIR, f));

  if (files.length === 0) {
    // Fall back to most recent available date
    const all = fs.readdirSync(QUEUE_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    const latestDate = all.map(f => f.match(/(\d{4}-\d{2}-\d{2})/)?.[1]).find(Boolean);
    if (!latestDate) { console.error('No queue files found.'); process.exit(1); }

    console.log(`No files for ${DATE} — showing most recent: ${latestDate}`);
    files = all.filter(f => f.includes(latestDate)).map(f => path.join(QUEUE_DIR, f));
  }

  return files;
}

function isXTextFile(filepath) {
  return path.basename(filepath).startsWith('x-text-');
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseXTextFile(filepath) {
  const raw = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  return (Array.isArray(raw) ? raw : [raw]).map(p => ({ _src: 'x-text', ...p }));
}

function parseMediaFile(filepath) {
  const raw = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  return [{ _src: 'media', ...raw }];
}

// ─── HTML helpers ────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function copyBox(text, extraClass = '') {
  return `<div class="copy-box ${extraClass}" onclick="sel(this)">${esc(text)}</div>`;
}

// ─── Card builders ────────────────────────────────────────────────────────────

function xTextCard(post, uid) {
  const posted = post.posted === true;
  const hour   = post.scheduledHour != null ? `${post.scheduledHour}:00 UTC` : '';

  const replies = (post.replies?.length ? post.replies : [post.reply1])
    .filter(Boolean)
    .map(r => `<div class="reply-wrap"><span class="reply-lbl">↳ Reply</span>${copyBox(r)}</div>`)
    .join('');

  const answer = post.answer_tweet
    ? `<div class="reply-wrap"><span class="reply-lbl">↳ Answer (${post.answer_scheduledHour ?? '?'}:00 UTC)</span>${copyBox(post.answer_tweet)}</div>`
    : '';

  return `
<div class="card ${posted ? 'is-posted' : ''}" id="${uid}">
  <div class="card-hd">
    <span class="badge x-badge">✕ X</span>
    <span class="badge type-badge">${esc(post.type || 'text')}</span>
    <span class="sched">${hour}</span>
    <span class="status-pill ${posted ? 'done' : 'todo'}">${posted ? '✓ Posted' : '⏳ Pending'}</span>
    <button class="mark-btn" onclick="toggle('${uid}',this)">${posted ? 'Unmark' : 'Mark Posted'}</button>
  </div>
  <div class="card-bd">
    <div class="lbl">Tweet</div>
    ${copyBox(post.tweet1, 'tweet-main')}
    ${replies}
    ${answer}
  </div>
</div>`;
}

function mediaPlatformBlock(platform, metadata) {
  const pm      = PLATFORM_META[platform] || { label: platform, color: '#666', emoji: '📱' };
  const pStatus = metadata.platforms?.[platform]?.status || 'pending';
  const caption = metadata.captions?.[platform];
  const text    = caption?.text || caption?.rawCaption || '(no caption yet — run generate:captions)';
  const tags    = (caption?.hashtags || []).map(h => h.startsWith('#') ? h : `#${h}`).join(' ');

  const cloudUrl =
    metadata.cloudUrls?.[platform] ||
    metadata.cloudUrls?.pinterest   ||
    metadata.cloudUrls?.instagram_portrait ||
    metadata.cloudUrl               ||
    null;

  const isVideo = metadata.type === 'video' || String(metadata.outputFile || '').endsWith('.mp4');

  const mediaTile = cloudUrl
    ? (isVideo
        ? `<a href="${esc(cloudUrl)}" target="_blank" class="media-tile vid-tile">▶ Open Video</a>`
        : `<a href="${esc(cloudUrl)}" target="_blank" class="media-tile"><img src="${esc(cloudUrl)}" loading="lazy" onerror="this.parentElement.innerHTML='⚠ load err'"></a>`)
    : `<div class="media-tile no-media">No URL</div>`;

  return `
<div class="p-block ${pStatus === 'posted' ? 'p-done' : ''}">
  <div class="p-hd" style="border-left:4px solid ${pm.color}">
    <span class="p-name">${pm.emoji} ${pm.label}</span>
    <span class="p-pill ${pStatus === 'posted' ? 'done' : 'todo'}">${pStatus === 'posted' ? '✓ Posted' : '⏳ Pending'}</span>
  </div>
  <div class="p-body">
    ${mediaTile}
    <div class="caption-col">
      <div class="lbl">Caption</div>
      ${copyBox(text)}
      ${tags ? `<div class="lbl">Hashtags</div>${copyBox(tags, 'tags-box')}` : ''}
    </div>
  </div>
</div>`;
}

function mediaCard(metadata, uid) {
  const platforms  = Object.keys(metadata.platforms || {});
  const allPosted  = platforms.length > 0 && platforms.every(p => metadata.platforms[p]?.status === 'posted');
  const blocks     = platforms.map(p => mediaPlatformBlock(p, metadata)).join('');

  return `
<div class="card ${allPosted ? 'is-posted' : ''}" id="${uid}">
  <div class="card-hd">
    <span class="badge cat-badge">${esc(metadata.categoryName || metadata.category || 'post')}</span>
    <span class="id-lbl">${esc(metadata.id || '')}</span>
    <span class="status-pill ${allPosted ? 'done' : 'todo'}">${allPosted ? '✓ All Posted' : '⏳ Pending'}</span>
  </div>
  ${blocks}
</div>`;
}

// ─── HTML shell ───────────────────────────────────────────────────────────────

function buildHtml(cards, date, total, posted) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JoyMaze Brief — ${date}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d0d14;color:#ddd;padding:20px}
a{color:inherit;text-decoration:none}

.top{max-width:900px;margin:0 auto 20px;padding:20px 22px;background:#161622;border:1px solid #252535;border-radius:12px}
.top h1{font-size:20px;color:#fff;margin-bottom:4px}
.top p{font-size:12px;color:#666;margin-bottom:12px}
.stats{display:flex;gap:12px;flex-wrap:wrap}
.stat{background:#202030;padding:6px 14px;border-radius:8px;font-size:13px}
.stat strong{color:#a78bfa}

.tip{max-width:900px;margin:0 auto 16px;padding:10px 14px;background:#1a180a;border:1px solid #3a3510;border-radius:8px;font-size:12px;color:#a09040}

.cards{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:18px}

.card{background:#161622;border:1px solid #242434;border-radius:12px;overflow:hidden;transition:border-color .2s}
.card:hover{border-color:#404060}
.card.is-posted{opacity:.55;border-color:#1a2e1a}

.card-hd{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#101018;flex-wrap:wrap}
.badge{padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}
.x-badge{background:#111;border:1px solid #333;color:#ccc}
.type-badge{background:#252535;color:#9090b0}
.cat-badge{background:#2d1a50;color:#b090f0}
.id-lbl{font-size:11px;color:#444;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sched{font-size:11px;color:#555;margin-left:auto}
.status-pill{font-size:12px;padding:3px 10px;border-radius:20px;white-space:nowrap}
.status-pill.todo{background:#2a1e06;color:#e09030}
.status-pill.done{background:#0a2016;color:#40b060}
.mark-btn{padding:4px 12px;border-radius:6px;border:1px solid #353550;background:#202030;color:#9090b0;cursor:pointer;font-size:12px;white-space:nowrap}
.mark-btn:hover{background:#303050;color:#fff}

.card-bd{padding:14px;display:flex;flex-direction:column;gap:10px}
.lbl{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.copy-box{background:#0a0a12;border:1px solid #222232;border-radius:8px;padding:11px 13px;font-size:14px;line-height:1.6;cursor:pointer;white-space:pre-wrap;word-break:break-word;transition:background .12s,border-color .12s;user-select:text}
.copy-box:hover{background:#14142a;border-color:#505080}
.copy-box:active{background:#1c1c40}
.tweet-main{font-size:16px}
.tags-box{font-size:12px;color:#5080c0}
.reply-wrap{border-left:3px solid #252545;padding-left:12px;display:flex;flex-direction:column;gap:4px}
.reply-lbl{font-size:11px;color:#505080}

.p-block{padding:12px 14px;border-top:1px solid #1a1a28}
.p-block.p-done{opacity:.5}
.p-hd{display:flex;align-items:center;gap:10px;padding-left:10px;margin-bottom:10px}
.p-name{font-size:13px;font-weight:600;color:#bbb}
.p-pill{font-size:11px;margin-left:auto;padding:2px 8px;border-radius:10px}
.p-pill.todo{color:#e09030}
.p-pill.done{color:#40b060}
.p-body{display:flex;gap:12px;align-items:flex-start}
.media-tile{flex-shrink:0;width:90px;height:90px;border-radius:8px;overflow:hidden;border:1px solid #252535;display:flex;align-items:center;justify-content:center;background:#0a0a14;font-size:12px;color:#5060a0}
.media-tile img{width:100%;height:100%;object-fit:cover;display:block}
.vid-tile{font-size:12px;color:#5070d0;text-align:center;line-height:1.4;padding:8px}
.no-media{font-size:11px;color:#333;border:1px dashed #252535}
.caption-col{flex:1;display:flex;flex-direction:column;gap:8px;min-width:0}

@media(max-width:600px){.p-body{flex-direction:column}.media-tile{width:100%;height:140px}}
</style>
</head>
<body>
<div class="top">
  <h1>JoyMaze Daily Brief — ${date}</h1>
  <p>Manual posting mode — click any text block to select &amp; copy it</p>
  <div class="stats">
    <div class="stat"><strong>${total}</strong> posts total</div>
    <div class="stat"><strong>${posted}</strong> posted</div>
    <div class="stat"><strong>${total - posted}</strong> remaining</div>
  </div>
</div>
<div class="tip">💡 Click any caption or tweet to select all text. Open image links in a new tab. Use "Mark Posted" to track progress (session only — reopen to reset).</div>
<div class="cards">
${cards.join('\n')}
</div>
<script>
function sel(el){
  const r=document.createRange();r.selectNodeContents(el);
  const s=window.getSelection();s.removeAllRanges();s.addRange(r);
  try{document.execCommand('copy')}catch(e){}
}
function toggle(id,btn){
  const c=document.getElementById(id);if(!c)return;
  const was=c.classList.contains('is-posted');
  c.classList.toggle('is-posted',!was);
  const pill=c.querySelector('.card-hd .status-pill');
  if(pill){pill.className='status-pill '+(was?'todo':'done');pill.textContent=was?'⏳ Pending':'✓ Posted';}
  btn.textContent=was?'Mark Posted':'Unmark';
}
</script>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const files = readQueueFiles();
console.log(`Reading ${files.length} queue file(s) for ${DATE}...`);

const cards = [];
let total = 0, posted = 0;

for (const filepath of files) {
  const items = isXTextFile(filepath) ? parseXTextFile(filepath) : parseMediaFile(filepath);

  for (const item of items) {
    total++;
    const isPosted = item.posted === true
      || (item.platforms && Object.values(item.platforms).every(p => p?.status === 'posted'));
    if (isPosted) posted++;

    const uid = `card-${cards.length}`;
    cards.push(item._src === 'x-text' ? xTextCard(item, uid) : mediaCard(item, uid));
  }
}

fs.mkdirSync('output', { recursive: true });
fs.writeFileSync(OUT_FILE, buildHtml(cards, DATE, total, posted), 'utf8');

const absPath = path.resolve(OUT_FILE).replace(/\\/g, '/');
console.log(`\n✓  Brief written: ${OUT_FILE}`);
console.log(`   ${total} posts — ${posted} posted, ${total - posted} remaining`);
console.log(`\n   Open in browser:`);
console.log(`   file:///${absPath}`);

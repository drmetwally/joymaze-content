#!/usr/bin/env node
/**
 * JoyMaze System Health Check
 * Validates env vars, config files, dynamic pools, pipeline links, and platform credentials.
 * Run: npm run health-check
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

// ─── Terminal colors ─────────────────────────────────────────────────────────
const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJSON(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return null; }
}

function daysSince(isoString) {
  if (!isoString) return Infinity;
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 86400000);
}

function envSet(name) {
  const val = process.env[name];
  return val && val.trim().length > 0;
}

// ─── Results collector ────────────────────────────────────────────────────────
const results = [];
let totalOk = 0, totalWarn = 0, totalFail = 0;

function row(status, label, detail = '') {
  const icon = status === 'ok'   ? c.green('✓')
             : status === 'warn' ? c.yellow('⚠')
             : c.red('✗');
  if (status === 'ok')   totalOk++;
  if (status === 'warn') totalWarn++;
  if (status === 'fail') totalFail++;
  const detailStr = detail ? c.dim(`  ${detail}`) : '';
  results.push(`  ${icon} ${label}${detailStr}`);
}

function section(title) {
  results.push('');
  results.push(c.bold(c.cyan(title)));
}

// ─── Checks ───────────────────────────────────────────────────────────────────

async function checkEnv() {
  section('ENVIRONMENT');

  const required = [
    { name: 'GROQ_API_KEY',    scripts: 'generate-prompts, generate-x-posts, generate-asmr-video', optional: false },
    { name: 'VERTEX_API_KEY',  scripts: 'generate-images, intelligence-refresh', optional: false },
  ];

  const optional = [
    { name: 'OPENAI_API_KEY',              scripts: 'generate-story-video (TTS)', optional: true },
    { name: 'CLOUDINARY_CLOUD_NAME',       scripts: 'post-content (media upload)', optional: true },
    { name: 'CLOUDINARY_API_KEY',          scripts: 'post-content (media upload)', optional: true },
    { name: 'WEBSITE_URL',                 scripts: 'post-content (captions)', optional: true },
    { name: 'PINTEREST_API_BASE',          scripts: 'post-content (Pinterest API mode)', optional: true },
  ];

  for (const { name, scripts, optional: isOptional } of [...required, ...optional]) {
    if (envSet(name)) {
      row('ok', name, scripts);
    } else if (isOptional) {
      row('warn', name, `optional — used by: ${scripts}`);
    } else {
      row('fail', name, `REQUIRED — used by: ${scripts}`);
    }
  }
}

async function checkPlatformCreds() {
  section('PLATFORM CREDENTIALS');

  const platforms = [
    {
      name: 'Pinterest',
      vars: ['PINTEREST_ACCESS_TOKEN', 'PINTEREST_BOARD_ID'],
      optional: false,
    },
    {
      name: 'Instagram',
      vars: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID'],
      optional: true,
    },
    {
      name: 'X (Twitter)',
      vars: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'],
      optional: false,
      note: 'account suspended — re-enable when new account ready',
    },
    {
      name: 'TikTok',
      vars: ['TIKTOK_ACCESS_TOKEN'],
      optional: true,
    },
    {
      name: 'YouTube',
      vars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_REFRESH_TOKEN'],
      optional: true,
    },
  ];

  // Check for X account suspension marker
  const cooldownPath = path.join(ROOT, 'output', 'posting-cooldown.json');
  const cooldown = await readJSON(cooldownPath);
  const xSuspended = !!(cooldown?.until && new Date(cooldown.until) > new Date());

  for (const { name, vars, optional: isOptional, note } of platforms) {
    const allSet = vars.every(v => envSet(v));
    const missingVars = vars.filter(v => !envSet(v));

    if (name === 'X (Twitter)' && xSuspended) {
      row('warn', name, `cooldown active until ${cooldown.until} (${cooldown.reason})`);
    } else if (allSet) {
      row('ok', name, note || vars.join(', '));
    } else if (isOptional) {
      row('warn', name, `optional — missing: ${missingVars.join(', ')}`);
    } else {
      row('fail', name, `missing: ${missingVars.join(', ')}`);
    }
  }
}

async function checkConfigFiles() {
  section('CONFIG FILES');

  const configs = [
    { path: 'config/writing-style.md',             label: 'writing-style.md',              optional: false },
    { path: 'docs/CONTENT_ARCHETYPES.md',           label: 'CONTENT_ARCHETYPES.md',         optional: false },
    { path: 'config/audit-learnings.json',          label: 'audit-learnings.json',           optional: false },
    { path: 'config/hooks-library.json',            label: 'hooks-library.json',             optional: false },
    { path: 'config/theme-pool-dynamic.json',       label: 'theme-pool-dynamic.json',        optional: false },
    { path: 'config/pattern-interrupt-dynamic.json',label: 'pattern-interrupt-dynamic.json', optional: false },
    { path: 'config/cta-library.json',              label: 'cta-library.json',               optional: true  },
    { path: 'config/hashtags.json',                 label: 'hashtags.json',                  optional: true  },
    { path: 'config/platforms.json',                label: 'platforms.json',                 optional: true  },
    { path: 'config/content-intelligence.json',     label: 'content-intelligence.json',      optional: true  },
  ];

  for (const { path: rel, label, optional: isOptional } of configs) {
    const abs = path.join(ROOT, rel);
    const exists = await fileExists(abs);
    if (exists) {
      row('ok', label, rel);
    } else if (isOptional) {
      row('warn', label, `optional — not found: ${rel}`);
    } else {
      row('fail', label, `REQUIRED — not found: ${rel}`);
    }
  }
}

async function checkDynamicPools() {
  section('DYNAMIC POOLS');

  const pools = [
    { path: 'config/theme-pool-dynamic.json',        label: 'Theme pool',        key: 'themes',     minEntries: 1 },
    { path: 'config/pattern-interrupt-dynamic.json', label: 'Pattern interrupts', key: 'interrupts', minEntries: 1 },
    { path: 'config/hooks-library.json',             label: 'Hooks library',     key: 'hooks',      minEntries: 1 },
    { path: 'config/cta-library.json',               label: 'CTA library',       key: 'ctas',       minEntries: 1 },
  ];

  for (const { path: rel, label, key, minEntries } of pools) {
    const abs = path.join(ROOT, rel);
    const data = await readJSON(abs);
    if (!data) {
      row('fail', label, `file missing or invalid JSON: ${rel}`);
      continue;
    }
    const val = data[key];
    const entries = Array.isArray(val)              ? val.length
                  : (val && typeof val === 'object') ? Object.values(val).reduce((s, v) => s + (Array.isArray(v) ? v.length : 1), 0)
                  : Array.isArray(data)              ? data.length
                  : 0;
    if (entries >= minEntries) {
      row('ok', label, `${entries} entries`);
    } else {
      row('warn', label, `only ${entries} entries (min ${minEntries})`);
    }
  }

  // Competitor intelligence freshness
  const ciPath = path.join(ROOT, 'config', 'competitor-intelligence.json');
  const ci = await readJSON(ciPath);
  if (!ci) {
    row('warn', 'Competitor intelligence', 'not found — run: npm run intelligence:competitor');
  } else {
    const age = daysSince(ci.generated_at);
    if (age <= 7) {
      row('ok',   'Competitor intelligence', `age ${age}d — generated ${ci.date || ci.generated_at?.slice(0,10)}`);
    } else if (age <= 14) {
      row('warn', 'Competitor intelligence', `age ${age}d — stale (>7d), run: npm run intelligence:competitor`);
    } else {
      row('fail', 'Competitor intelligence', `age ${age}d — very stale (>14d), run: npm run intelligence:competitor`);
    }
  }

  // Trends freshness
  const trendsPath = path.join(ROOT, 'config', 'trends-this-week.json');
  const trends = await readJSON(trendsPath);
  if (!trends) {
    row('warn', 'Trends this week', 'not found — run: npm run trends');
  } else {
    const age = daysSince(trends.generated_at || trends.date || trends.generated);
    if (age <= 7) {
      row('ok',   'Trends this week', `age ${age}d — ${(trends.trends || []).slice(0,3).join(', ')}`);
    } else {
      row('warn', 'Trends this week', `age ${age}d — stale, run: npm run trends`);
    }
  }

  // Audit learnings
  const alPath = path.join(ROOT, 'config', 'audit-learnings.json');
  const al = await readJSON(alPath);
  if (!al) {
    row('fail', 'Audit learnings', 'not found — run system will skip rule injection');
  } else {
    const lessons = al.lessons || [];
    row('ok', 'Audit learnings', `${lessons.length} rules (${lessons.filter(l => l.severity === 'critical').length} critical)`);
  }
}

async function checkPipelineLinks() {
  section('PIPELINE LINKS');

  // generate-prompts → output/prompts/
  const today = new Date().toISOString().slice(0, 10);
  const promptsFile = path.join(ROOT, 'output', 'prompts', `prompts-${today}.md`);
  if (await fileExists(promptsFile)) {
    row('ok', 'Prompts → today\'s file', `prompts-${today}.md exists`);
  } else {
    row('warn', 'Prompts → today\'s file', `prompts-${today}.md not found — run: npm run generate:prompts`);
  }

  // X text posts → today's queue
  const xFile = path.join(ROOT, 'output', 'queue', `x-text-${today}.json`);
  if (await fileExists(xFile)) {
    const posts = await readJSON(xFile);
    const count = Array.isArray(posts) ? posts.length : 0;
    row('ok', 'X posts → today\'s queue', `x-text-${today}.json (${count} posts)`);
  } else {
    row('warn', 'X posts → today\'s queue', `x-text-${today}.json not found — run: npm run x:generate`);
  }

  // intelligence-refresh → competitor-intelligence.json
  const ciExists = await fileExists(path.join(ROOT, 'config', 'competitor-intelligence.json'));
  row(ciExists ? 'ok' : 'fail',
    'Intelligence → competitor-intelligence.json',
    ciExists ? 'linked' : 'missing — run: npm run intelligence:competitor');

  // apply-intelligence → dynamic pools
  const poolsExist = await Promise.all([
    fileExists(path.join(ROOT, 'config', 'theme-pool-dynamic.json')),
    fileExists(path.join(ROOT, 'config', 'pattern-interrupt-dynamic.json')),
    fileExists(path.join(ROOT, 'config', 'hooks-library.json')),
  ]);
  if (poolsExist.every(Boolean)) {
    row('ok', 'Intelligence → dynamic pools', 'theme + interrupts + hooks all present');
  } else {
    row('fail', 'Intelligence → dynamic pools', 'one or more pool files missing');
  }

  // trends → generate-prompts (via trends-this-week.json)
  const trendsExists = await fileExists(path.join(ROOT, 'config', 'trends-this-week.json'));
  row(trendsExists ? 'ok' : 'warn',
    'Trends → generate-prompts',
    trendsExists ? 'trends-this-week.json → injected into prompt generation' : 'trends-this-week.json missing — run: npm run trends');

  // audit-learnings → generate-prompts + generate-x-posts
  const alExists = await fileExists(path.join(ROOT, 'config', 'audit-learnings.json'));
  row(alExists ? 'ok' : 'fail',
    'Audit learnings → generation + scoring',
    alExists ? 'audit-learnings.json → injected into both prompts and X post generation' : 'missing — rule injection disabled');

  // analytics → performance weights (Phase 2 — not yet live)
  const analyticsDir = path.join(ROOT, 'output', 'analytics');
  const analyticsExists = await fileExists(analyticsDir);
  const perfWeightsPath = path.join(ROOT, 'config', 'story-performance-weights.json');
  const perfWeightsExists = await fileExists(perfWeightsPath);
  if (perfWeightsExists) {
    row('ok', 'Analytics → performance weights', 'story-performance-weights.json exists (Phase 2 active)');
  } else {
    row('warn', 'Analytics → performance weights', 'Phase 2 not yet active — needs 8+ published episodes with analytics');
  }

  // GitHub Actions workflow files
  const workflowDir = path.join(ROOT, '.github', 'workflows');
  const workflowExists = await fileExists(workflowDir);
  if (workflowExists) {
    const files = await fs.readdir(workflowDir).catch(() => []);
    row('ok', 'GitHub Actions workflows', `${files.length} workflow(s): ${files.join(', ')}`);
  } else {
    row('warn', 'GitHub Actions workflows', '.github/workflows/ not found');
  }
}

async function checkOutputDirs() {
  section('OUTPUT DIRECTORIES');

  const dirs = [
    { path: 'output/queue',   label: 'Queue',   optional: false },
    { path: 'output/raw',     label: 'Raw',     optional: false },
    { path: 'output/prompts', label: 'Prompts', optional: false },
    { path: 'output/archive', label: 'Archive', optional: false },
    { path: 'output/stories', label: 'Stories', optional: true  },
    { path: 'output/asmr',    label: 'ASMR',    optional: true  },
    { path: 'output/scores',  label: 'Scores',  optional: true  },
  ];

  for (const { path: rel, label, optional: isOptional } of dirs) {
    const abs = path.join(ROOT, rel);
    const exists = await fileExists(abs);
    if (exists) {
      const files = await fs.readdir(abs).catch(() => []);
      row('ok', `output/${label.toLowerCase()}/`, `${files.length} file(s)`);
    } else if (isOptional) {
      row('warn', `output/${label.toLowerCase()}/`, 'not created yet');
    } else {
      row('fail', `output/${label.toLowerCase()}/`, 'directory missing — run mkdir');
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log(c.bold('╔══════════════════════════════════════════════════╗'));
  console.log(c.bold('║        JoyMaze System Health Check               ║'));
  console.log(c.bold('╚══════════════════════════════════════════════════╝'));

  await checkEnv();
  await checkPlatformCreds();
  await checkConfigFiles();
  await checkDynamicPools();
  await checkPipelineLinks();
  await checkOutputDirs();

  // Print all rows
  for (const r of results) console.log(r);

  // Summary
  console.log('');
  console.log('─'.repeat(52));
  const summaryParts = [];
  if (totalOk   > 0) summaryParts.push(c.green(`${totalOk} ok`));
  if (totalWarn > 0) summaryParts.push(c.yellow(`${totalWarn} warnings`));
  if (totalFail > 0) summaryParts.push(c.red(`${totalFail} failures`));
  console.log(`  Summary: ${summaryParts.join(' · ')}`);
  console.log('');

  if (totalFail > 0) {
    console.log(c.red('  ✗ Fix failures before posting.'));
  } else if (totalWarn > 0) {
    console.log(c.yellow('  ⚠ Warnings are optional/known gaps — review if needed.'));
  } else {
    console.log(c.green('  ✓ All systems healthy.'));
  }
  console.log('');
}

main().catch(e => { console.error(e.message); process.exit(1); });

#!/usr/bin/env node

/**
 * JoyMaze Content — Intelligence Applier
 *
 * Reads config/content-intelligence.json and merges new entries into the
 * four dynamic pool files. Handles deduplication, scoring, pool size
 * management, and weekly aging. No API calls — pure JSON manipulation.
 *
 * Usage:
 *   node scripts/apply-intelligence.mjs              # Apply if status is pending_apply
 *   node scripts/apply-intelligence.mjs --dry-run    # Show what would change, no writes
 *   node scripts/apply-intelligence.mjs --force-apply # Bypass entropy_blocked status
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_APPLY = process.argv.includes('--force-apply');

const INTELLIGENCE_FILE  = path.join(ROOT, 'config', 'content-intelligence.json');
const THEME_DYNAMIC_FILE = path.join(ROOT, 'config', 'theme-pool-dynamic.json');
const HOOKS_FILE         = path.join(ROOT, 'config', 'hooks-library.json');
const CTAS_FILE          = path.join(ROOT, 'config', 'cta-library.json');
const INTERRUPTS_FILE    = path.join(ROOT, 'config', 'pattern-interrupt-dynamic.json');
const X_POST_TOPICS_FILE = path.join(ROOT, 'config', 'x-post-topics-dynamic.json');
const ARCHIVE_DIR        = path.join(ROOT, 'output', 'archive');
const QUEUE_DIR          = path.join(ROOT, 'output', 'queue');
const PERF_WEIGHTS_FILE  = path.join(ROOT, 'config', 'performance-weights.json');

// ── Hardcoded THEME_POOL (mirrored from generate-prompts.mjs for dedup) ──
const STATIC_THEME_POOL = [
  'Ocean Animals', 'Space and Planets', 'Forest Animals', 'Safari and Jungle',
  'Dinosaurs', 'Farm Animals', 'Bugs and Insects', 'Arctic Animals', 'Birds',
  'Desert Animals', 'Pets and Cats', 'Dogs and Puppies', 'Butterflies', 'Sea Turtles',
  'Pirates and Treasure', 'Fairy Tale Castle', 'Dragons and Fantasy', 'Superheroes',
  'Mermaids', 'Knights and Armor', 'Wizards and Magic', 'Unicorns',
  'Vehicles and Trains', 'Rockets and Spaceships', 'Robots and Technology',
  'Fire Trucks', 'Airplanes', 'Submarines',
  'Food and Cooking', 'Weather and Seasons', 'Garden and Flowers', 'Camping Outdoors',
  'Circus and Carnival', 'Sports and Games', 'Construction and Building',
  'Music Instruments', 'Holidays and Celebrations', 'Birthday Party',
  'Rainy Day Indoors', 'Snowy Winter', 'Spring Flowers', 'Autumn Leaves',
  'Numbers and Math', 'Alphabet Letters', 'Colors and Shapes', 'Science Experiments',
  'Maps and Geography', 'Ancient Egypt', 'Under the Sea',
  'Candy Land', 'Bakery and Pastries', 'Jungle Explorer', 'Treasure Map',
  'Safari Adventure', 'Underwater Cave', 'Volcano Island', 'Rainbow World',
  'Toy Workshop', 'Snack Time', 'Funny Monsters', 'Baby Animals',
];

// ── Hardcoded PATTERN_INTERRUPT topics (mirrored for dedup) ──
const STATIC_INTERRUPT_TOPICS = [
  'Coloring inside the lines is NOT more important than free coloring — messy coloring builds creativity faster',
  'Kids don\'t need less screen time — they need BETTER screen time (active vs passive)',
  'Boredom is not the enemy — bored kids invent, create, and problem-solve',
  'Puzzle difficulty should NOT match age exactly — slight frustration builds grit',
  'Mazes activate the same brain region as chess — spatial reasoning and planning',
  'Kids who do puzzles 3x/week score 30% higher on spatial reasoning tests',
  'Coloring reduces cortisol (stress hormone) in children just like meditation does',
  'Word searches build the same scanning skills kids need for reading fluency',
  '73% of parents say their child asks for activity books MORE than tablet games',
  'The average 5-year-old can solve a maze faster than most adults think',
  'The WORST time to give a kid a puzzle is when they\'re calm — give it when they\'re restless',
  'Printing a coloring page is more engaging than a coloring app — the paper matters',
  'Kids learn more from activities they CHOOSE than ones assigned to them',
  'Dot-to-dot is stealth math — kids practice number sequencing without realizing it',
  'Spring break doesn\'t have to mean screen overload — 5 printable activities for the car ride',
  'Rainy day survival kit: 3 puzzles that buy you 45 minutes of quiet',
  'Summer slide is real — keep their brain sharp with 10 minutes of puzzles a day',
  'Back-to-school prep starts with fine motor skills — tracing and coloring are homework warmups',
  'The 5 skills every kindergarten teacher wishes kids practiced at home',
  'How to tell if your kid is a visual learner, kinesthetic learner, or both',
  'What happens in a child\'s brain during a maze — the science of problem-solving',
  'Why kids who trace before they write have neater handwriting — the motor memory connection',
  'Quiet kids aren\'t bored — they\'re processing. Silence is a sign of deep focus, not disengagement',
  'Coloring books don\'t limit creativity — they train it. Constraint is the mother of invention',
  'Kids who struggle with mazes aren\'t "bad at puzzles" — they\'re building persistence',
  'Dot-to-dot counting prepares kids for multiplication more than flash cards do',
  'Left-handed kids who use activity books develop better bilateral coordination than those who only type',
  'A child who colors for 20 minutes shows the same calm EEG pattern as an adult after yoga',
  'Kids complete 40% more of an activity when a parent sits nearby — even if the parent isn\'t helping',
  'Printable activities get used 3× more when stored in a visible folder vs. a drawer',
  'The average age a child masters a maze jumps by 18 months when they practice 3× per week',
  'The messier the coloring, the more confident the child — perfectionists color less freely',
  'Giving a child the WRONG answer first actually teaches them to think harder',
  'Screen-free activities don\'t need to compete with screens — they win by being tactile, not by banning tech',
  'Road trip season is coming — the one printable pack that survived 6 hours with a 5-year-old',
  'The 10-minute morning routine that sets kids up for a focused school day',
  'The 3 types of puzzles every pediatric OT recommends — and why each one matters differently',
];

// ── Normalize text for dedup comparison ──
const normalize = s => s.toLowerCase().replace(/[/\\]/g, ' ').replace(/\s+/g, ' ').trim();

function firstNWords(s, n = 8) {
  return normalize(s).split(' ').slice(0, n).join(' ');
}

// Simple Levenshtein for near-duplicate detection
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ── Load a JSON config file (returns null if missing) ──
async function loadJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// ── Write JSON config file (skips in dry-run) ──
async function writeJson(filePath, data, label) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would write ${label}`);
    return;
  }
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ Wrote ${label}`);
}

// ── Eviction score: higher = more evictable ──
function evictionScore(entry) {
  const conf = typeof entry.confidence === 'number' ? entry.confidence : 0.5;
  const decay = typeof entry.decay_weeks === 'number' ? entry.decay_weeks : 0;
  const perf = typeof entry.performance_score === 'number' ? entry.performance_score : 0.5;
  return (1 - conf) * 0.3 + (decay / 12) * 0.4 + (1 - perf) * 0.3;
}

// ── Is entry protected from eviction? ──
function isProtected(entry) {
  return (typeof entry.performance_score === 'number' && entry.performance_score >= 0.7)
      || (typeof entry.times_used === 'number' && entry.times_used >= 5);
}

// ────────────────────────────────────────────────────────────────────
// THEME POOL
// ────────────────────────────────────────────────────────────────────

async function applyNewThemes(newThemes, current) {
  if (!newThemes?.length) return { added: 0, evicted: 0, pool: current };

  const staticNorm = new Set(STATIC_THEME_POOL.map(normalize));
  const existingNorm = new Set(current.themes.map(t => normalize(t.name)));
  const MAX = current._meta.max_entries || 30;

  const toAdd = newThemes.filter(t => {
    if (!t.brand_safe) return false;
    if ((t.confidence ?? 1) < 0.5) return false;
    const n = normalize(t.name);
    if (staticNorm.has(n) || existingNorm.has(n)) return false;
    return true;
  });

  if (!toAdd.length) {
    console.log('  Themes: nothing new to add (all duplicates or low confidence)');
    return { added: 0, evicted: 0, pool: current };
  }

  let pool = [...current.themes];
  let evicted = 0;

  // Evict to make room
  const overflow = pool.length + toAdd.length - MAX;
  if (overflow > 0) {
    const candidates = pool
      .filter(e => !isProtected(e))
      .sort((a, b) => evictionScore(b) - evictionScore(a));
    const toEvict = candidates.slice(0, overflow);
    const evictNames = new Set(toEvict.map(e => e.name));
    pool = pool.filter(e => !evictNames.has(e.name));
    evicted = toEvict.length;
    if (!DRY_RUN) toEvict.forEach(e => console.log(`    Evicted theme: "${e.name}"`));
    else toEvict.forEach(e => console.log(`    [DRY] Would evict theme: "${e.name}"`));
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const t of toAdd) {
    pool.push({
      name: t.name,
      added_week: today,
      source: t.source || 'intelligence_refresh',
      confidence: t.confidence ?? 0.7,
      performance_score: null,
      times_used: 0,
      last_used: null,
      decay_weeks: 0,
      brand_safe: true,
      rationale: t.rationale || '',
    });
    console.log(`  ${DRY_RUN ? '[DRY] Would add' : 'Added'} theme: "${t.name}"`);
  }

  current.themes = pool;
  current._meta.last_updated = today;
  return { added: toAdd.length, evicted, pool: current };
}

// ────────────────────────────────────────────────────────────────────
// HOOKS LIBRARY
// ────────────────────────────────────────────────────────────────────

async function applyNewHooks(newHooks, current) {
  if (!newHooks?.length) return { added: 0, pool: current };

  const MAX_PER_TYPE = current._meta.max_entries_per_type || 12;
  const HOOK_TYPES = Object.keys(current.hook_type_index);
  let added = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const h of newHooks) {
    if (!h.brand_safe) continue;
    if (!h.hook_type || !h.text) continue;

    const hookType = h.hook_type.toLowerCase().replace(/ /g, '_');
    if (!HOOK_TYPES.includes(hookType)) {
      console.log(`  Skipping hook with unknown type: "${hookType}"`);
      continue;
    }

    // Dedup: near-match on first 8 words
    const newPrefix = firstNWords(h.text);
    const isDuplicate = current.hooks.some(existing => {
      const existingPrefix = firstNWords(existing.text);
      return similarity(newPrefix, existingPrefix) > 0.7;
    });
    if (isDuplicate) {
      console.log(`  Skip duplicate hook: "${h.text.slice(0, 60)}..."`);
      continue;
    }

    // Check cap for this type
    const typeHooks = current.hooks.filter(e => e.hook_type === hookType);
    if (typeHooks.length >= MAX_PER_TYPE) {
      // Evict lowest performer that isn't protected
      const evictable = typeHooks
        .filter(e => !isProtected(e))
        .sort((a, b) => evictionScore(b) - evictionScore(a));
      if (evictable.length === 0) {
        console.log(`  Skip hook (type "${hookType}" at cap, all entries protected)`);
        continue;
      }
      const victim = evictable[0];
      current.hooks = current.hooks.filter(e => e.id !== victim.id);
      console.log(`  ${DRY_RUN ? '[DRY] Would evict' : 'Evicted'} hook: "${victim.text.slice(0, 50)}..."`);
    }

    const id = `hook_${today.replace(/-/g, '')}_${String(added).padStart(3, '0')}`;
    const entry = {
      id,
      hook_type: hookType,
      text: h.text,
      performance_score: null,
      save_rate_pct: null,
      source: h.source || 'intelligence_refresh',
      added_week: today,
      times_used: 0,
      decay_weeks: 0,
      brand_safe: true,
      archetype_fit: h.archetype_fit || [],
    };

    if (!DRY_RUN) {
      current.hooks.push(entry);
      current.hook_type_index[hookType].push(id);
    }
    console.log(`  ${DRY_RUN ? '[DRY] Would add' : 'Added'} hook [${hookType}]: "${h.text.slice(0, 70)}"`);
    added++;
  }

  current._meta.last_updated = today;
  return { added, pool: current };
}

// ────────────────────────────────────────────────────────────────────
// CTA LIBRARY
// ────────────────────────────────────────────────────────────────────

async function applyNewCtas(newCtas, current) {
  if (!newCtas?.length) return { added: 0, pool: current };

  const MAX = current._meta.max_entries_per_platform_per_type || 8;
  let added = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const c of newCtas) {
    if (!c.brand_safe) continue;
    const platform = c.platform?.toLowerCase();
    const type = c.type?.toLowerCase();
    if (!platform || !type || !c.text) continue;

    if (!current.ctas[platform]) {
      console.log(`  Skip CTA for unknown platform: "${platform}"`);
      continue;
    }
    if (!current.ctas[platform][type]) {
      current.ctas[platform][type] = [];
    }

    const pool = current.ctas[platform][type];

    // Dedup: normalized exact match
    const normNew = normalize(c.text);
    if (pool.some(e => normalize(e.text) === normNew)) {
      continue; // silent — exact dupes expected occasionally
    }

    if (pool.length >= MAX) {
      const evictable = pool.filter(e => !isProtected(e))
        .sort((a, b) => evictionScore(b) - evictionScore(a));
      if (evictable.length === 0) continue;
      const victim = evictable[0];
      const idx = pool.indexOf(victim);
      pool.splice(idx, 1);
    }

    const id = `cta_${platform}_${type}_${today.replace(/-/g, '')}_${String(added).padStart(3, '0')}`;
    pool.push({
      id,
      text: c.text,
      performance_score: null,
      outbound_click_rate_pct: null,
      source: c.source || 'intelligence_refresh',
      added_week: today,
      times_used: 0,
      decay_weeks: 0,
      brand_safe: true,
    });
    console.log(`  ${DRY_RUN ? '[DRY] Would add' : 'Added'} CTA [${platform}/${type}]: "${c.text.slice(0, 70)}"`);
    added++;
  }

  current._meta.last_updated = today;
  return { added, pool: current };
}

// ────────────────────────────────────────────────────────────────────
// X POST TOPIC SEEDS
// insight_seeds, identity_scenes, story_seeds — rotate weekly
// ────────────────────────────────────────────────────────────────────

async function applyNewXPostTopics(newTopics, current) {
  if (!newTopics?.length) return { added: 0, pool: current };

  const MAX = current._meta?.max_entries || 40;
  const today = new Date().toISOString().slice(0, 10);
  const VALID_TYPES = new Set(['insight', 'identity', 'story']);

  const existingNorm = new Set(current.topics.map(t => normalize(t.text)));

  const toAdd = newTopics.filter(t => {
    if (!t.brand_safe) return false;
    if (!t.text || !VALID_TYPES.has(t.type)) return false;
    return !existingNorm.has(normalize(t.text));
  });

  if (!toAdd.length) {
    console.log('  X topics: nothing new to add (all duplicates or invalid)');
    return { added: 0, pool: current };
  }

  let pool = [...current.topics];

  // Evict lowest-value entries to make room
  const overflow = pool.length + toAdd.length - MAX;
  if (overflow > 0) {
    const candidates = pool
      .filter(e => !isProtected(e))
      .sort((a, b) => evictionScore(b) - evictionScore(a));
    candidates.slice(0, overflow).forEach(e => {
      const idx = pool.indexOf(e);
      if (idx !== -1) pool.splice(idx, 1);
    });
  }

  let added = 0;
  for (const t of toAdd) {
    pool.push({
      text: t.text,
      type: t.type,
      source: t.source || 'intelligence_refresh',
      added_week: today,
      confidence: t.confidence ?? 0.75,
      times_used: 0,
      last_used: null,
      decay_weeks: 2,
      brand_safe: true,
    });
    console.log(`  ${DRY_RUN ? '[DRY] Would add' : 'Added'} X topic [${t.type}]: "${(t.text || '').slice(0, 70)}"`);
    added++;
  }

  current.topics = pool;
  current._meta.last_updated = today;
  return { added, pool: current };
}

// ────────────────────────────────────────────────────────────────────
// PATTERN INTERRUPT POOL
// ────────────────────────────────────────────────────────────────────

async function applyNewPatternInterrupts(newInterrupts, current) {
  if (!newInterrupts?.length) return { added: 0, pool: current };

  const MAX = current._meta.max_entries || 20;
  const allStaticTopics = STATIC_INTERRUPT_TOPICS.map(normalize);
  const existingTopics = current.interrupts.map(i => normalize(i.topic));
  let added = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const item of newInterrupts) {
    if (!item.brand_safe) continue;
    if ((item.confidence ?? 1) < 0.5) continue;
    if (!item.topic || !item.subtype || !item.visual) continue;

    // Dedup against static + dynamic topics
    const normTopic = normalize(item.topic);
    const isDupe = allStaticTopics.some(t => similarity(firstNWords(t, 10), firstNWords(normTopic, 10)) > 0.65)
                || existingTopics.some(t => similarity(firstNWords(t, 10), firstNWords(normTopic, 10)) > 0.65);
    if (isDupe) {
      console.log(`  Skip duplicate interrupt: "${item.topic.slice(0, 60)}..."`);
      continue;
    }

    // Evict if at cap
    if (current.interrupts.length >= MAX) {
      const evictable = current.interrupts
        .filter(e => !isProtected(e))
        .sort((a, b) => evictionScore(b) - evictionScore(a));
      if (!evictable.length) continue;
      const victim = evictable[0];
      current.interrupts = current.interrupts.filter(e => e.topic !== victim.topic);
      existingTopics.splice(existingTopics.indexOf(normalize(victim.topic)), 1);
    }

    const entry = {
      subtype: item.subtype,
      topic: item.topic,
      visual: item.visual,
      added_week: today,
      source: item.source || 'intelligence_refresh',
      confidence: item.confidence ?? 0.7,
      performance_score: null,
      times_used: 0,
      last_used: null,
      decay_weeks: 0,
      brand_safe: true,
      rationale: item.rationale || '',
    };

    if (!DRY_RUN) {
      current.interrupts.push(entry);
      existingTopics.push(normTopic);
    }
    console.log(`  ${DRY_RUN ? '[DRY] Would add' : 'Added'} pattern interrupt [${item.subtype}]: "${item.topic.slice(0, 70)}"`);
    added++;
  }

  current._meta.last_updated = today;
  return { added, pool: current };
}

// ────────────────────────────────────────────────────────────────────
// AGING PASS — runs every Monday regardless of new intelligence
// ────────────────────────────────────────────────────────────────────

function agePool(entries, fieldKey = 'name') {
  const pruned = [];
  const kept = entries.filter(entry => {
    entry.decay_weeks = (entry.decay_weeks || 0) + 1;
    const perf = typeof entry.performance_score === 'number' ? entry.performance_score : null;
    const decay = entry.decay_weeks;
    if (isProtected(entry)) return true;
    if (decay >= 12) { pruned.push(entry[fieldKey] || entry.topic || entry.text); return false; }
    if (decay >= 8 && (perf === null || perf < 0.3)) { pruned.push(entry[fieldKey] || entry.topic || entry.text); return false; }
    return true;
  });
  return { kept, pruned };
}

function runAgingPass(themesPool, hooksLibrary, ctaLibrary, patternPool) {
  let totalPruned = 0;

  // Age themes
  const { kept: themes, pruned: themesPruned } = agePool(themesPool.themes, 'name');
  themesPool.themes = themes;
  themesPruned.forEach(n => console.log(`  Aged out theme: "${n}"`));
  totalPruned += themesPruned.length;

  // Age hooks
  const { kept: hooks, pruned: hooksPruned } = agePool(hooksLibrary.hooks, 'id');
  hooksLibrary.hooks = hooks;
  // Rebuild index after aging
  for (const type of Object.keys(hooksLibrary.hook_type_index)) {
    hooksLibrary.hook_type_index[type] = hooks
      .filter(h => h.hook_type === type)
      .map(h => h.id);
  }
  hooksPruned.forEach(id => console.log(`  Aged out hook: ${id}`));
  totalPruned += hooksPruned.length;

  // Age CTAs
  for (const platform of Object.keys(ctaLibrary.ctas)) {
    for (const type of Object.keys(ctaLibrary.ctas[platform])) {
      const { kept, pruned } = agePool(ctaLibrary.ctas[platform][type], 'id');
      ctaLibrary.ctas[platform][type] = kept;
      pruned.forEach(id => console.log(`  Aged out CTA: ${id}`));
      totalPruned += pruned.length;
    }
  }

  // Age pattern interrupts
  const { kept: interrupts, pruned: intPruned } = agePool(patternPool.interrupts, 'topic');
  patternPool.interrupts = interrupts;
  intPruned.forEach(t => console.log(`  Aged out interrupt: "${String(t).slice(0, 60)}"`));
  totalPruned += intPruned.length;

  return totalPruned;
}

// ────────────────────────────────────────────────────────────────────
// PERFORMANCE SCORE FEEDBACK
// ────────────────────────────────────────────────────────────────────

async function updatePerformanceScores(themesPool, hooksLibrary, ctaLibrary) {
  // Load baseline save rate from performance-weights
  let baselineSaveRate = 0.02; // fallback 2%
  try {
    const pw = JSON.parse(await fs.readFile(PERF_WEIGHTS_FILE, 'utf-8'));
    const rates = (pw.categories || []).map(c => parseFloat(c.saveRate) / 100).filter(r => r > 0);
    if (rates.length) baselineSaveRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  } catch {}

  // Scan recent archive metadata for save rates
  const lookbackDays = 7;
  const cutoff = Date.now() - lookbackDays * 86400000;
  const metaFiles = [];

  async function scanDir(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const fp = path.join(dir, e.name);
        if (e.isDirectory()) await scanDir(fp);
        else if (e.name.endsWith('.json') && e.name !== 'content-intelligence.json') {
          try {
            const stat = await fs.stat(fp);
            if (stat.mtimeMs >= cutoff) metaFiles.push(fp);
          } catch {}
        }
      }
    } catch {}
  }

  await scanDir(QUEUE_DIR);
  await scanDir(ARCHIVE_DIR);

  let updated = 0;
  for (const fp of metaFiles) {
    let meta;
    try { meta = JSON.parse(await fs.readFile(fp, 'utf-8')); } catch { continue; }
    const saves = meta.analytics?.pinterest?.lifetime?.saves;
    const impressions = meta.analytics?.pinterest?.lifetime?.impressions;
    if (!saves || !impressions || impressions < 100) continue;

    const observedRate = saves / impressions;
    const normalizedScore = Math.min(1, observedRate / baselineSaveRate);

    // Match theme
    const theme = meta.theme || meta.promptTheme;
    if (theme) {
      const normTheme = normalize(theme);
      const match = themesPool.themes.find(t => normalize(t.name) === normTheme);
      if (match) {
        const prev = typeof match.performance_score === 'number' ? match.performance_score : normalizedScore;
        match.performance_score = parseFloat((prev * 0.6 + normalizedScore * 0.4).toFixed(3));
        match.times_used = (match.times_used || 0) + 1;
        match.last_used = new Date(meta.generatedAt || Date.now()).toISOString().slice(0, 10);
        updated++;
      }
    }

    // Match hook (first line of caption)
    const caption = meta.captions?.pinterest || meta.captions?.instagram;
    if (caption) {
      const firstLine = caption.split('\n')[0].split('|')[0].trim();
      const hookPrefix = firstNWords(firstLine);
      for (const hook of hooksLibrary.hooks) {
        if (similarity(firstNWords(hook.text), hookPrefix) > 0.7) {
          const prev = typeof hook.performance_score === 'number' ? hook.performance_score : normalizedScore;
          hook.performance_score = parseFloat((prev * 0.6 + normalizedScore * 0.4).toFixed(3));
          hook.save_rate_pct = parseFloat((observedRate * 100).toFixed(2));
          hook.times_used = (hook.times_used || 0) + 1;
          updated++;
          break;
        }
      }
    }

    // Match CTA
    if (caption) {
      const outboundClicks = meta.analytics?.pinterest?.lifetime?.outboundClicks;
      if (outboundClicks && impressions > 0) {
        const clickRate = outboundClicks / impressions;
        const ctaLine = caption.split('\n').find(l => l.toLowerCase().includes('joymaze') || l.toLowerCase().includes('amazon'));
        if (ctaLine) {
          const normCta = normalize(ctaLine);
          for (const platform of Object.keys(ctaLibrary.ctas)) {
            for (const type of Object.keys(ctaLibrary.ctas[platform])) {
              for (const entry of ctaLibrary.ctas[platform][type]) {
                if (similarity(normalize(entry.text), normCta) > 0.7) {
                  const prev = typeof entry.performance_score === 'number' ? entry.performance_score : clickRate;
                  entry.performance_score = parseFloat((prev * 0.6 + clickRate * 0.4).toFixed(3));
                  entry.outbound_click_rate_pct = parseFloat((clickRate * 100).toFixed(3));
                  entry.times_used = (entry.times_used || 0) + 1;
                  updated++;
                }
              }
            }
          }
        }
      }
    }
  }

  if (updated > 0) console.log(`  Performance scores updated: ${updated} entries`);
  else console.log('  No analytics matches found for performance score update');
}

// ────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== JoyMaze Intelligence Applier ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // Monday-only gate
  if (process.argv.includes('--monday-only')) {
    const day = new Date().getDay();
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day];
    if (day !== 1) {
      console.log(`apply-intelligence: skipped (--monday-only, today is ${dayName}).`);
      return;
    }
  }

  // 1. Load intelligence file
  const intelligence = await loadJson(INTELLIGENCE_FILE);
  if (!intelligence || intelligence._meta?.status === 'none') {
    console.log('No intelligence to apply (status: none). Run intelligence-refresh.mjs first.');
    return;
  }

  const status = intelligence._meta?.status;
  if (status === 'applied') {
    console.log(`Intelligence for week ${intelligence._meta?.week_of} already applied. Nothing to do.`);
    return;
  }
  if (status === 'entropy_blocked' && !FORCE_APPLY) {
    const score = intelligence._meta?.entropy_score;
    console.log(`\n⚠️  Intelligence blocked — entropy score ${score}/10 exceeds threshold.`);
    console.log('Review config/content-intelligence.json then re-run with --force-apply to override.');
    return;
  }

  console.log(`\nApplying intelligence for week: ${intelligence._meta?.week_of || 'unknown'}`);
  if (status === 'entropy_blocked') console.log('  (Forcing past entropy block as requested)');

  // 2. Load current dynamic pools
  const [themesPool, hooksLibrary, ctaLibrary, patternPool, xPostTopics] = await Promise.all([
    loadJson(THEME_DYNAMIC_FILE),
    loadJson(HOOKS_FILE),
    loadJson(CTAS_FILE),
    loadJson(INTERRUPTS_FILE),
    loadJson(X_POST_TOPICS_FILE),
  ]);

  if (!themesPool || !hooksLibrary || !ctaLibrary || !patternPool) {
    console.error('One or more dynamic pool files missing. Run from repo root after initial setup.');
    process.exit(1);
  }

  if (!xPostTopics) {
    console.warn('  Warning: x-post-topics-dynamic.json missing — X topic seeds will not be updated.');
  }

  // 3. Weekly aging pass (always runs — independent of new intelligence)
  console.log('\n--- Aging pass ---');
  const pruned = runAgingPass(themesPool, hooksLibrary, ctaLibrary, patternPool);
  console.log(`  Total entries pruned: ${pruned}`);

  // 4. Update performance scores from recent analytics
  console.log('\n--- Performance score update ---');
  await updatePerformanceScores(themesPool, hooksLibrary, ctaLibrary);

  // 5. Apply new entries
  console.log('\n--- Applying new intelligence ---');

  const { added: themesAdded, evicted: themesEvicted } =
    await applyNewThemes(intelligence.new_themes, themesPool);

  const { added: hooksAdded } =
    await applyNewHooks(intelligence.new_hooks, hooksLibrary);

  const { added: ctasAdded } =
    await applyNewCtas(intelligence.new_ctas, ctaLibrary);

  const { added: interruptsAdded } =
    await applyNewPatternInterrupts(intelligence.new_pattern_interrupts, patternPool);

  const { added: xTopicsAdded } = xPostTopics
    ? await applyNewXPostTopics(intelligence.new_x_post_topics, xPostTopics)
    : { added: 0 };

  // 6. Write updated pools
  console.log('\n--- Writing updated pools ---');
  const writes = [
    writeJson(THEME_DYNAMIC_FILE, themesPool, 'theme-pool-dynamic.json'),
    writeJson(HOOKS_FILE, hooksLibrary, 'hooks-library.json'),
    writeJson(CTAS_FILE, ctaLibrary, 'cta-library.json'),
    writeJson(INTERRUPTS_FILE, patternPool, 'pattern-interrupt-dynamic.json'),
  ];
  if (xPostTopics) writes.push(writeJson(X_POST_TOPICS_FILE, xPostTopics, 'x-post-topics-dynamic.json'));
  await Promise.all(writes);

  // 7. Mark intelligence as applied
  if (!DRY_RUN) {
    intelligence._meta.status = 'applied';
    intelligence._meta.applied_at = new Date().toISOString();
    await writeJson(INTELLIGENCE_FILE, intelligence, 'content-intelligence.json (status → applied)');
  }

  // 8. Summary
  console.log(`\n--- Summary ---`);
  console.log(`  Themes:     +${themesAdded} added, ${themesEvicted} evicted`);
  console.log(`  Hooks:      +${hooksAdded} added`);
  console.log(`  CTAs:       +${ctasAdded} added`);
  console.log(`  Interrupts: +${interruptsAdded} added`);
  console.log(`  X topics:   +${xTopicsAdded} added`);
  console.log(`  Pruned (aging): ${pruned}`);
  if (DRY_RUN) console.log('\n  [DRY RUN] No files were written.');
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });

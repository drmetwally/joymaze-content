import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function hashStringToSeed(input) {
  let h = 2166136261 >>> 0;
  const str = String(input);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function choose(items, seedInput) {
  if (!items.length) return null;
  const seed = hashStringToSeed(seedInput);
  return items[seed % items.length];
}

async function readJson(relPath) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, relPath), 'utf-8'));
  } catch {
    return null;
  }
}

// ── Core hook-quality rules ───────────────────────────────────────────────────
// 1. Hooks must reference the puzzle type specifically (maze / word search)
// 2. The countdown or word count must appear in the hook
// 3. Count hooks (challenge framing: "1 in 5 kids gets this right") are the
//    single highest-performing structure for kids puzzle content.
// 4. Parent direct-address ("Can YOUR kid...") is the #2 structure.
// 5. Competitive framing ("beat the timer", "beat the clock") is #3.

// ── Hardcoded challenge pool (always available, highest quality) ─────────────
const CHALLENGE_HOOKS = {
  maze: [
    (countdown) => `1 in 4 kids gets stuck on this maze. Can yours beat the ${countdown}-second timer?`,
    (countdown) => `This maze confused our entire class. Can your kid solve it in ${countdown} seconds?`,
    (countdown) => `Challenge: Can your kid finish this maze before the timer hits ${countdown}?`,
    (countdown) => `Most adults take 2× longer than this timer. Can your kid beat ${countdown} seconds?`,
    (countdown) => `Race the clock: ${countdown} seconds to solve this maze. Go!`,
    (countdown) => `Can your kid crack this before the ${countdown}-second buzzer?`,
    (countdown) => `The ${countdown}-second challenge. Can your kid solve it?`,
    () => `Tag a kid who would absolutely destroy this maze`,
    (countdown) => `Drop your time below — most kids solve this in under ${countdown}s`,
  ],
  'word-search': [
    (countdown, wordsCount) => `1 in 5 kids misses at least one word. Can yours find all ${wordsCount} in ${countdown}s?`,
    (countdown, wordsCount) => `This word search has ${wordsCount} hidden words. Can your kid find them all before ${countdown}s?`,
    (countdown, wordsCount) => `The word search that makes adults quit. Can your kid find all ${wordsCount} words?`,
    (countdown, wordsCount) => `Most parents miss word #${Math.ceil(wordsCount / 2)}. Can your kid find all ${wordsCount}?`,
    (countdown, wordsCount) => `Timer: ${countdown}s. Hidden words: ${wordsCount}. Can your kid spot them all?`,
    (countdown, wordsCount) => `Race the clock — ${countdown}s to find all ${wordsCount} words. Go!`,
    (countdown, wordsCount) => `${wordsCount} words hidden in this puzzle. How fast can your kid find them?`,
    () => `Tag a kid who's fast at word searches`,
    (countdown, wordsCount) => `Word search challenge: ${wordsCount} words, ${countdown}s. Drop your time below!`,
  ],
  default: [
    (countdown) => `Can your kid solve this in ${countdown} seconds?`,
    (countdown) => `This puzzle confused our whole class. Can your kid crack it?`,
    () => `Tag a kid who loves puzzles like this`,
  ],
};

function getChallengeHooks(puzzleType, countdownSec, wordsCount) {
  const pool = CHALLENGE_HOOKS[puzzleType] || CHALLENGE_HOOKS.default;
  return pool.map(fn => {
    try {
      return fn(countdownSec, wordsCount);
    } catch {
      return fn(countdownSec);
    }
  });
}

// ── Adapt a generic hook to puzzle context ───────────────────────────────────
// Attempts to make a generic hook specific to puzzle type.
// Returns null if the hook structure cannot be meaningfully adapted.
function adaptHook(line, { puzzleType, countdownSec, wordsCount }) {
  if (!line || line.length < 10) return null;
  const lower = line.toLowerCase();

  // Skip if the hook is clearly about unrelated topics (too generic social noise)
  const skipPatterns = [
    'believe', 'crazy', 'shocking', 'fact about', 'secret to', 'thing about',
    'this hack', 'game changer', 'mistake', 'worst', 'best advice', 'you won\'t',
    'think about', 'ask yourself', 'ever wonder', 'if i told you',
    'honest with you', 'struggling with', 'having trouble',
    'picture their little face', 'that quiet guilt', 'you\'re the parent',
  ];
  if (skipPatterns.some(p => lower.includes(p))) return null;

  // Parent/kid direct address — adapt if present
  if (lower.includes('your kid') || lower.includes('your child') || lower.includes('your little') || lower.includes('kid') || lower.includes('child')) {
    if (puzzleType === 'word-search') {
      return line
        .replace(/your kid|your child|your little kid|your child|your little/gi, 'your kid')
        .replace(/this maze|this puzzle|this challenge|this activity/gi, 'this word search')
        + (wordsCount ? ` (${wordsCount} hidden words)` : '');
    }
    if (puzzleType === 'maze') {
      return line
        .replace(/your kid|your child|your little kid|your child|your little/gi, 'your kid')
        .replace(/this word search|this puzzle|this challenge|this activity/gi, 'this maze')
        + (countdownSec ? ` (${countdownSec}s to solve)` : '');
    }
  }

  // Timer / seconds patterns — inject puzzle context
  if (lower.includes('second') || lower.includes('minute') || lower.includes('timer') || lower.includes('clock') || lower.includes('time')) {
    if (puzzleType === 'maze' && !lower.includes('word')) {
      return `${line} — can your kid beat the ${countdownSec}-second timer?`;
    }
    if (puzzleType === 'word-search' && wordsCount) {
      return line.includes('word')
        ? line
        : `${line} — ${wordsCount} hidden words to find.`;
    }
  }

  // Count / "1 in X" patterns — keep as-is, they work universally
  if (/\d+\s*(in|out of)/i.test(line)) return line;

  // Generic challenge — add puzzle context
  if (lower.includes('challenge') || lower.includes('race') || lower.includes('beat')) {
    if (puzzleType === 'maze') return line.includes('maze') ? line : `${line} — maze edition`;
    if (puzzleType === 'word-search') return line.includes('word') ? line : `${line} — word search edition`;
  }

  return null;
}

function getPsychologyChallengeExamples(psychologyTriggers) {
  const challenge = psychologyTriggers?.triggers?.CHALLENGE;
  return (challenge?.caption_opener_examples || [])
    .filter(Boolean);
}

function getBrandSafeHooks(hooksData) {
  return (hooksData?.hooks || [])
    .filter((hook) => hook?.brand_safe !== false && hook?.text)
    .map((hook) => String(hook.text).trim());
}

function getPatternInterrupts(contentIntelligence) {
  return (contentIntelligence?.new_pattern_interrupts || [])
    .filter((item) => item?.brand_safe !== false && item?.topic)
    .map((item) => String(item.topic).trim());
}

function buildFallbackTemplates({ puzzleType, countdownSec, wordsCount }) {
  if (puzzleType === 'maze') {
    return [
      `Can your kid solve this maze before ${countdownSec} seconds?`,
      `This maze stumps most adults. Can your kid beat it in ${countdownSec} seconds?`,
      `Can your kid beat this maze before the timer hits 0?`,
      `Most adults get stuck here. Can your kid finish first?`,
      `How fast can your kid crack this maze?`,
    ];
  }
  if (puzzleType === 'word-search') {
    return [
      `Can your kid find all ${wordsCount} words before the timer hits 0?`,
      `Most people miss one word. Can your kid find all ${wordsCount}?`,
      `Can your kid spot all ${wordsCount} hidden words in time?`,
      `There is always one word people miss. Can your kid find it?`,
      `How fast can your kid find all ${wordsCount} hidden words?`,
    ];
  }
  return [
    `Can your kid solve this before the timer hits 0?`,
    `How fast can your kid crack this puzzle?`,
  ];
}

// ── Weighted random from hooks-activity.json pool ───────────────────────────
// Returns {text, style} or null.  Mirrors pickHook() in generate-activity-video.mjs.
async function pickActivityHook(puzzleType) {
  const data = await readJson('config/hooks-activity.json');
  // hooks-activity.json key matches puzzleType exactly (maze, word-search, matching, …)
  const pool = data?.hooks?.[puzzleType];
  const eligible = pool ? pool.filter((h) => h.performance_score >= 0) : [];
  if (eligible.length === 0) return null;
  // Weighted random: weight = max(performance_score, 0.1) so all entries have a chance.
  const weights = eligible.map((h) => Math.max(h.performance_score, 0.1));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i];
    if (r <= 0) return eligible[i];
  }
  return eligible[eligible.length - 1];
}

export async function buildChallengeHook({ puzzleType, countdownSec, wordsCount = null, seedHint = '' }) {
  const [hooksData, psychologyTriggers, contentIntelligence] = await Promise.all([
    readJson('config/hooks-library.json'),
    readJson('config/psychology-triggers.json'),
    readJson('config/content-intelligence.json'),
  ]);

  // Priority 0: hooks-activity.json curated pool (Halbert direct-response, puzzle-specific)
  // Returns {text, style} — use .text as the hook string if available.
  const activityHook = await pickActivityHook(puzzleType);
  if (activityHook?.text) return activityHook.text;

  // Priority 1: hardcoded challenge pool (highest quality, always relevant)
  const hardcodedPool = getChallengeHooks(puzzleType, countdownSec, wordsCount);

  // Priority 2: psychology triggers → adapted to puzzle type
  const psychPool = getPsychologyChallengeExamples(psychologyTriggers)
    .map(line => adaptHook(line, { puzzleType, countdownSec, wordsCount }))
    .filter(Boolean);

  // Priority 3: hooks library → adapted (filtered by skip patterns)
  const hookPool = getBrandSafeHooks(hooksData)
    .map(line => adaptHook(line, { puzzleType, countdownSec, wordsCount }))
    .filter(Boolean);

  // Priority 4: pattern interrupts → adapted
  const patternPool = getPatternInterrupts(contentIntelligence)
    .map(line => adaptHook(line, { puzzleType, countdownSec, wordsCount }))
    .filter(Boolean);

  // Priority 5: fallback templates (structural fallbacks)
  const templates = buildFallbackTemplates({ puzzleType, countdownSec, wordsCount });

  // Build final pool: hardcoded first, then hook pool, then pattern, then templates
  // Deduplicate within each tier
  const pool = [
    ...hardcodedPool,
    ...hookPool,
    ...patternPool,
    ...templates,
  ];
  const unique = [...new Set(pool.filter(Boolean))];

  const selected = choose(unique, `${puzzleType}|${countdownSec}|${wordsCount}|${seedHint}`);

  if (selected) return selected;

  // Absolute fallback
  return templates[0];
}
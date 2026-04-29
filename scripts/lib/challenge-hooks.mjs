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

function getChallengeExamples(psychologyTriggers) {
  const challenge = psychologyTriggers?.triggers?.CHALLENGE;
  return challenge?.caption_opener_examples || [];
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

function buildTemplates({ puzzleType, countdownSec, wordsCount }) {
  if (puzzleType === 'maze') {
    return [
      `Can your kid solve this maze before ${countdownSec} seconds?`,
      `This maze stumps most adults. Can your kid beat it in ${countdownSec} seconds?`,
      `Can your kid beat this maze before the timer hits 0?`,
      `Most adults get stuck here. Can your kid finish first?`,
      `How fast can your kid crack this maze?`
    ];
  }

  if (puzzleType === 'word-search') {
    return [
      `Can your kid find all ${wordsCount} words before the timer hits 0?`,
      `Most people miss one word. Can your kid find all ${wordsCount}?`,
      `Can your kid spot all ${wordsCount} hidden words in time?`,
      `There is always one word people miss. Can your kid find it?`,
      `How fast can your kid find all ${wordsCount} hidden words?`
    ];
  }

  return [
    `Can your kid solve this before the timer hits 0?`,
    `How fast can your kid crack this puzzle?`
  ];
}

function adaptIntelligenceLine(line, { puzzleType, countdownSec, wordsCount }) {
  const lower = String(line || '').toLowerCase();
  if (!lower) return null;

  if (puzzleType === 'maze') {
    if (lower.includes('stumped') || lower.includes('adults')) {
      return `This maze stumps most adults. Can your kid beat it in ${countdownSec} seconds?`;
    }
    if (lower.includes('can your kid')) {
      return `Can your kid solve this maze before ${countdownSec} seconds?`;
    }
  }

  if (puzzleType === 'word-search') {
    if (lower.includes('hidden word') || lower.includes('first try')) {
      return `Most people miss one word. Can your kid find all ${wordsCount}?`;
    }
    if (lower.includes('can your kid')) {
      return `Can your kid find all ${wordsCount} words before the timer hits 0?`;
    }
  }

  return null;
}

export async function buildChallengeHook({ puzzleType, countdownSec, wordsCount = null, seedHint = '' }) {
  const [hooksData, psychologyTriggers, contentIntelligence] = await Promise.all([
    readJson('config/hooks-library.json'),
    readJson('config/psychology-triggers.json'),
    readJson('config/content-intelligence.json'),
  ]);

  const challengeExamples = getChallengeExamples(psychologyTriggers)
    .map((line) => adaptIntelligenceLine(line, { puzzleType, countdownSec, wordsCount }))
    .filter(Boolean);
  const hookPool = getBrandSafeHooks(hooksData)
    .map((line) => adaptIntelligenceLine(line, { puzzleType, countdownSec, wordsCount }))
    .filter(Boolean);
  const patternPool = getPatternInterrupts(contentIntelligence)
    .map((line) => adaptIntelligenceLine(line, { puzzleType, countdownSec, wordsCount }))
    .filter(Boolean);

  const templates = buildTemplates({ puzzleType, countdownSec, wordsCount });
  const pool = [...challengeExamples, ...hookPool, ...patternPool, ...templates];
  const unique = [...new Set(pool.filter(Boolean))];
  return choose(unique, `${puzzleType}|${countdownSec}|${wordsCount}|${seedHint}`) || templates[0];
}

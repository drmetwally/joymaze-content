#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(ROOT, 'output', 'challenge', 'generated-activity');
const RAW_DIR = path.join(ROOT, 'output', 'raw');
const PROMPTS_DIR = path.join(ROOT, 'output', 'prompts');

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (flag, fallback = null) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] ?? fallback : fallback;
};

const DRY_RUN = hasFlag('--dry-run');
const TYPE_ARG = (getArg('--type', getArg('--puzzle-type', '')) || '').toLowerCase();
const THEME = getArg('--theme', 'Ocean Animals');
const TITLE = getArg('--title', '');
const DIFFICULTY = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const ACTIVITY_DIR_ARG = getArg('--activity-dir');
const SLUG_ARG = getArg('--slug');
const COUNTDOWN = getArg('--countdown');
const WORDS = getArg('--words');
const MANIFEST_ARG = getArg('--manifest');
const DATE_ARG = getArg('--date');
const SLOT_ARG = getArg('--slot');
const CATEGORY_ARG = getArg('--category');
const ALL_SUPPORTED = hasFlag('--all-supported');

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 1500;
const PUZZLE_LEFT = 70;
const PUZZLE_TOP = 280;
const PUZZLE_WIDTH = 860;
const PUZZLE_HEIGHT = 960;

function normalizeType(input) {
  if (input === 'wordsearch' || input === 'word-search') return 'word-search';
  if (input === 'maze') return 'maze';
  return '';
}

function categoryToPuzzleType(category) {
  if (category === 'activity-maze') return 'maze';
  if (category === 'activity-word-search') return 'word-search';
  return '';
}

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function titleCase(input) {
  return String(input || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(input, maxCharsPerLine = 22, maxLines = 2) {
  const words = String(input || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumed < words.length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.!,?;:]+$/g, '')}…`;
  }
  return lines;
}

function shortenForZone(text, maxCharsPerLine = 18, maxLines = 2) {
  if (!text) return '';
  const variants = [];
  const raw = String(text).trim();
  variants.push(raw);
  variants.push(raw.replace(/,.*$/, '').trim());
  variants.push(raw.replace(/\bin \d+\s*seconds?\b/gi, '').replace(/\s{2,}/g, ' ').trim());
  variants.push(raw.replace(/Can your kid/gi, 'Can your child').replace(/\s{2,}/g, ' ').trim());
  variants.push(raw.replace(/,.*$/, '').replace(/\bin \d+\s*seconds?\b/gi, '').replace(/Can your kid/gi, 'Can your child').replace(/\s{2,}/g, ' ').trim());

  for (const candidate of variants) {
    if (!candidate) continue;
    const lines = wrapText(candidate, maxCharsPerLine, maxLines);
    const joined = lines.join(' ');
    if (!joined.endsWith('…')) return candidate;
  }

  return variants.find(Boolean) || raw;
}

function pickTitleText(activity, config, type) {
  const candidates = [
    TITLE,
    activity?.titleText,
    config?.title,
    activity?.hookText,
    activity?.ctaText,
    getDefaultTitle(type, activity?.theme || config?.theme || THEME),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const shortened = shortenForZone(candidate, 18, 2);
    const lines = wrapText(shortened, 18, 2);
    if (!lines.join(' ').endsWith('…')) return shortened;
  }

  return shortenForZone(candidates[0] || getDefaultTitle(type, activity?.theme || config?.theme || THEME), 18, 2);
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getDefaultTitle(type, theme) {
  const themeLabel = titleCase(theme);
  return type === 'maze' ? `${themeLabel} Maze` : `${themeLabel} Word Search`;
}

function getScriptPath(type) {
  return type === 'maze'
    ? path.join(ROOT, 'scripts', 'generate-maze-assets.mjs')
    : path.join(ROOT, 'scripts', 'generate-wordsearch-assets.mjs');
}

function getRawFolder(type) {
  return type === 'maze' ? path.join(RAW_DIR, 'maze') : path.join(RAW_DIR, 'wordsearch');
}

async function ensurePuzzlePng(activityDir) {
  const puzzlePath = path.join(activityDir, 'puzzle.png');
  if (await fileExists(puzzlePath)) return puzzlePath;
  const blankPath = path.join(activityDir, 'blank.png');
  if (!(await fileExists(blankPath))) {
    throw new Error(`Missing puzzle.png and blank.png in ${activityDir}`);
  }
  await fs.copyFile(blankPath, puzzlePath);
  return puzzlePath;
}

function getThemeDecor(theme, type) {
  const t = String(theme || '').toLowerCase();

  if (t.includes('ocean') || t.includes('sea')) {
    return {
      background: '#FFF8E7',
      motif: '#D9B24C',
      decorA: '#6EC5B8',
      decorB: '#F08A5D',
      decorC: '#7BC96F',
      family: 'ocean',
    };
  }
  if (t.includes('space') || t.includes('rocket') || t.includes('planet')) {
    return {
      background: '#EEF4FF',
      motif: '#A8B8FF',
      decorA: '#7AA6FF',
      decorB: '#F7B267',
      decorC: '#B39DFF',
      family: 'space',
    };
  }
  if (t.includes('pet') || t.includes('cat') || t.includes('dog') || t.includes('animal')) {
    return {
      background: '#FFF7F0',
      motif: '#E8B98E',
      decorA: '#F4A261',
      decorB: '#84C69B',
      decorC: '#E5989B',
      family: 'animals',
    };
  }
  if (t.includes('color') || t.includes('shape')) {
    return {
      background: '#F1F7FF',
      motif: '#9FC2FF',
      decorA: '#6EA8FE',
      decorB: '#F9C74F',
      decorC: '#90DBF4',
      family: 'confetti',
    };
  }
  if (t.includes('workshop') || t.includes('toy')) {
    return {
      background: '#FFF6EE',
      motif: '#E6B980',
      decorA: '#F4A261',
      decorB: '#7AA6FF',
      decorC: '#84C69B',
      family: 'workshop',
    };
  }

  return type === 'maze'
    ? {
        background: '#FFF8E7',
        motif: '#D4A017',
        decorA: '#6EC5B8',
        decorB: '#F08A5D',
        decorC: '#7BC96F',
        family: 'ocean',
      }
    : {
        background: '#EEF6FF',
        motif: '#8BB8FF',
        decorA: '#F7B267',
        decorB: '#7AA6FF',
        decorC: '#8FD3FE',
        family: 'confetti',
      };
}

function getStyleKit(type, theme) {
  const decor = getThemeDecor(theme, type);
  return type === 'maze'
    ? {
        accent: '#4DAF54',
        accentStrong: '#2F8C39',
        badgeFill: '#4DAF54',
        title: '#1A1A2E',
        subtitle: '#2F8C39',
        puzzleShadowOpacity: '0.08',
        ...decor,
      }
    : {
        accent: '#3E7BFA',
        accentStrong: '#275AD8',
        badgeFill: '#3E7BFA',
        title: '#1A1A2E',
        subtitle: '#2D6AE3',
        puzzleShadowOpacity: '0.08',
        ...decor,
      };
}

function renderFishCluster(style) {
  return `
    <g opacity="0.95">
      <g transform="translate(70 118)">
        <ellipse cx="0" cy="0" rx="32" ry="20" fill="${style.decorA}"/>
        <polygon points="30,0 56,-12 56,12" fill="${style.decorA}"/>
        <circle cx="-10" cy="-4" r="3" fill="#FFFFFF" opacity="0.9"/>
      </g>
      <g transform="translate(145 84) scale(0.82)">
        <ellipse cx="0" cy="0" rx="28" ry="18" fill="${style.decorB}"/>
        <polygon points="26,0 50,-10 50,10" fill="${style.decorB}"/>
        <circle cx="-8" cy="-3" r="3" fill="#FFFFFF" opacity="0.9"/>
      </g>
      <g transform="translate(872 1194) scale(0.92)">
        <ellipse cx="0" cy="0" rx="34" ry="21" fill="${style.decorC}"/>
        <polygon points="32,0 58,-12 58,12" fill="${style.decorC}"/>
        <circle cx="-10" cy="-4" r="3" fill="#FFFFFF" opacity="0.9"/>
      </g>
      <g transform="translate(810 1270) scale(0.76)">
        <ellipse cx="0" cy="0" rx="28" ry="18" fill="${style.decorA}"/>
        <polygon points="26,0 50,-10 50,10" fill="${style.decorA}"/>
        <circle cx="-8" cy="-3" r="3" fill="#FFFFFF" opacity="0.9"/>
      </g>
    </g>`;
}

function renderStarCluster(style) {
  const stars = [
    [86, 96, 24, style.decorA],
    [156, 138, 18, style.decorB],
    [864, 1230, 24, style.decorC],
    [806, 1184, 16, style.decorA],
  ];
  return `<g opacity="0.92">${stars.map(([x, y, r, fill]) => `
      <g transform="translate(${x} ${y}) scale(${r / 24})">
        <polygon points="0,-24 7,-8 24,-8 11,2 16,20 0,10 -16,20 -11,2 -24,-8 -7,-8" fill="${fill}"/>
      </g>`).join('')}
    </g>`;
}

function renderPawCluster(style) {
  return `
    <g opacity="0.88">
      <g transform="translate(86 110)">
        <circle cx="0" cy="0" r="16" fill="${style.decorA}"/>
        <circle cx="-18" cy="-18" r="8" fill="${style.decorA}"/>
        <circle cx="0" cy="-24" r="8" fill="${style.decorA}"/>
        <circle cx="18" cy="-18" r="8" fill="${style.decorA}"/>
      </g>
      <g transform="translate(850 1228) scale(0.9)">
        <circle cx="0" cy="0" r="16" fill="${style.decorB}"/>
        <circle cx="-18" cy="-18" r="8" fill="${style.decorB}"/>
        <circle cx="0" cy="-24" r="8" fill="${style.decorB}"/>
        <circle cx="18" cy="-18" r="8" fill="${style.decorB}"/>
      </g>
    </g>`;
}

function renderConfettiCluster(style) {
  return `
    <g opacity="0.9">
      <rect x="56" y="92" width="20" height="20" rx="4" fill="${style.decorA}" transform="rotate(18 66 102)"/>
      <circle cx="108" cy="116" r="10" fill="${style.decorB}"/>
      <polygon points="144,86 160,112 128,112" fill="${style.decorC}"/>
      <rect x="846" y="1192" width="22" height="22" rx="5" fill="${style.decorC}" transform="rotate(-14 857 1203)"/>
      <circle cx="894" cy="1236" r="10" fill="${style.decorA}"/>
      <polygon points="818,1248 834,1274 802,1274" fill="${style.decorB}"/>
    </g>`;
}

function renderWorkshopCluster(style) {
  return `
    <g opacity="0.9">
      <rect x="54" y="92" width="34" height="14" rx="7" fill="${style.decorA}"/>
      <rect x="66" y="82" width="10" height="38" rx="5" fill="${style.decorB}"/>
      <circle cx="138" cy="110" r="13" fill="${style.decorC}"/>
      <rect x="824" y="1206" width="36" height="14" rx="7" fill="${style.decorB}"/>
      <rect x="836" y="1196" width="10" height="38" rx="5" fill="${style.decorA}"/>
      <circle cx="892" cy="1232" r="13" fill="${style.decorC}"/>
    </g>`;
}

function renderCornerDecor(style, type) {
  switch (style.family) {
    case 'ocean': return renderFishCluster(style);
    case 'space': return renderStarCluster(style);
    case 'animals': return renderPawCluster(style);
    case 'confetti': return renderConfettiCluster(style);
    case 'workshop': return renderWorkshopCluster(style);
    default: return type === 'maze' ? renderFishCluster(style) : renderStarCluster(style);
  }
}

function renderMarginMotif(style, type) {
  const nodes = [];
  if (style.family === 'ocean' || type === 'maze') {
    for (let y = 86; y <= 1260; y += 74) {
      nodes.push(`<path d="M30 ${y} q18 -12 36 0 q18 12 36 0" fill="none" stroke="${style.motif}" stroke-width="2" opacity="0.18"/>`);
      nodes.push(`<path d="M892 ${y} q18 -12 36 0 q18 12 36 0" fill="none" stroke="${style.motif}" stroke-width="2" opacity="0.18"/>`);
    }
  } else if (style.family === 'space') {
    for (let y = 88; y <= 1270; y += 92) {
      nodes.push(`<circle cx="40" cy="${y}" r="3" fill="${style.motif}" opacity="0.16"/>`);
      nodes.push(`<circle cx="60" cy="${y + 18}" r="2.5" fill="${style.motif}" opacity="0.16"/>`);
      nodes.push(`<circle cx="936" cy="${y}" r="3" fill="${style.motif}" opacity="0.16"/>`);
      nodes.push(`<circle cx="916" cy="${y + 18}" r="2.5" fill="${style.motif}" opacity="0.16"/>`);
    }
  } else if (style.family === 'animals') {
    for (let y = 96; y <= 1260; y += 110) {
      nodes.push(`<circle cx="42" cy="${y}" r="3.5" fill="${style.motif}" opacity="0.15"/>`);
      nodes.push(`<circle cx="34" cy="${y - 10}" r="2.4" fill="${style.motif}" opacity="0.15"/>`);
      nodes.push(`<circle cx="50" cy="${y - 12}" r="2.4" fill="${style.motif}" opacity="0.15"/>`);
      nodes.push(`<circle cx="942" cy="${y}" r="3.5" fill="${style.motif}" opacity="0.15"/>`);
      nodes.push(`<circle cx="934" cy="${y - 10}" r="2.4" fill="${style.motif}" opacity="0.15"/>`);
      nodes.push(`<circle cx="950" cy="${y - 12}" r="2.4" fill="${style.motif}" opacity="0.15"/>`);
    }
  } else {
    for (let y = 88; y <= 1270; y += 78) {
      nodes.push(`<circle cx="42" cy="${y}" r="4" fill="${style.motif}" opacity="0.16"/>`);
      nodes.push(`<circle cx="68" cy="${y + 20}" r="3" fill="${style.motif}" opacity="0.16"/>`);
      nodes.push(`<circle cx="934" cy="${y}" r="4" fill="${style.motif}" opacity="0.16"/>`);
      nodes.push(`<circle cx="908" cy="${y + 20}" r="3" fill="${style.motif}" opacity="0.16"/>`);
    }
  }
  return nodes.join('');
}

function renderBackgroundSvg({ width, height, titleText, theme, difficulty, style, type }) {
  const safeTheme = escapeXml(theme);
  const safeDifficulty = escapeXml(titleCase(difficulty));
  const decor = renderCornerDecor(style, type);
  const motif = renderMarginMotif(style, type);
  const titleLines = wrapText(titleText, 18, 2);
  const titleTspans = titleLines.map((line, index) => `<tspan x="70" dy="${index === 0 ? 0 : 62}">${escapeXml(line)}</tspan>`).join('');
  const themeY = titleLines.length > 1 ? 254 : 190;

  // tied to 1000x1500 canvas — positions are absolute px, not relative.
  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="titleShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="2" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.18"/>
      </filter>
      <filter id="puzzleShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="${style.puzzleShadowOpacity}"/>
      </filter>
    </defs>

    <rect width="100%" height="100%" fill="${style.background}"/>
    ${motif}
    ${decor}

    <text x="70" y="108" font-size="64" font-family="Arial, sans-serif" font-weight="900" letter-spacing="1" fill="${style.title}" filter="url(#titleShadow)">${titleTspans}</text>
    <text x="70" y="${themeY}" font-size="30" font-family="Arial, sans-serif" font-weight="700" fill="${style.subtitle}">${safeTheme}</text>

    <rect x="784" y="74" width="146" height="48" rx="24" fill="${style.badgeFill}"/>
    <text x="857" y="106" text-anchor="middle" font-size="22" font-family="Arial, sans-serif" font-weight="800" fill="#FFFFFF">${safeDifficulty}</text>

    <g filter="url(#puzzleShadow)">
      <rect x="${PUZZLE_LEFT}" y="${PUZZLE_TOP}" width="${PUZZLE_WIDTH}" height="${PUZZLE_HEIGHT}" rx="28" fill="#FFFFFF"/>
    </g>

  </svg>`;
}

function renderStartMarkerSvg(style) {
  // tied to 1000x1500 canvas — positions are absolute px, not relative.
  return `
  <svg width="170" height="120" viewBox="0 0 170 120" xmlns="http://www.w3.org/2000/svg">
    <circle cx="58" cy="60" r="40" fill="#FFCBA4" stroke="#E4A37D" stroke-width="3"/>
    <circle cx="46" cy="54" r="4" fill="#1A1A2E"/>
    <circle cx="69" cy="54" r="4" fill="#1A1A2E"/>
    <path d="M46 73 q12 12 24 0" fill="none" stroke="#1A1A2E" stroke-width="3" stroke-linecap="round"/>
    <path d="M102 42 h38 l18 18 -18 18 h-38 q-14 0 -14 -18 q0 -18 14 -18z" fill="#FFFFFF" stroke="${style.accent}" stroke-width="3"/>
    <text x="122" y="66" text-anchor="middle" font-size="18" font-family="Arial, sans-serif" font-weight="900" fill="${style.accent}">→ Start!</text>
  </svg>`;
}

function renderFinishMarkerSvg(style) {
  // tied to 1000x1500 canvas — positions are absolute px, not relative.
  return `
  <svg width="150" height="130" viewBox="0 0 150 130" xmlns="http://www.w3.org/2000/svg">
    <polygon points="48,6 57,32 84,32 62,48 70,74 48,58 26,74 34,48 12,32 39,32" fill="#F4C430" stroke="#D29B00" stroke-width="3"/>
    <text x="80" y="86" font-size="24" font-family="Arial, sans-serif" font-weight="900" fill="${style.accent}">FINISH</text>
  </svg>`;
}

function runGenerator(type, config, dryRun = false) {
  const scriptPath = getScriptPath(type);
  const title = config.title || getDefaultTitle(type, config.theme);
  const commandArgs = [scriptPath, '--title', title, '--theme', config.theme, '--difficulty', config.difficulty, '--slug', config.slug];
  if (dryRun) commandArgs.push('--dry-run');
  if (config.countdown) commandArgs.push('--countdown', String(config.countdown));
  if (config.words && type === 'word-search') commandArgs.push('--words', config.words);

  const result = spawnSync('node', commandArgs, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Generator failed with code ${result.status}`);
  }
  return result.stdout;
}

async function latestManifestPath() {
  const entries = await fs.readdir(PROMPTS_DIR).catch(() => []);
  const manifests = entries.filter(name => /^activity-manifest-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
  if (manifests.length === 0) {
    throw new Error('No activity manifest found in output/prompts/. Run generate-prompts.mjs --save first.');
  }
  return path.join(PROMPTS_DIR, manifests[manifests.length - 1]);
}

async function loadManifest() {
  const manifestPath = MANIFEST_ARG
    ? path.resolve(ROOT, MANIFEST_ARG)
    : DATE_ARG
      ? path.join(PROMPTS_DIR, `activity-manifest-${DATE_ARG}.json`)
      : await latestManifestPath();

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return { manifest, manifestPath };
}

function resolveManifestTargets(manifest) {
  const slots = Array.isArray(manifest.activitySlots) ? manifest.activitySlots : [];
  const supported = slots.filter(slot => categoryToPuzzleType(slot.category));

  if (ALL_SUPPORTED) return supported;

  if (SLOT_ARG) {
    const slotNum = Number(SLOT_ARG);
    const found = slots.find(slot => Number(slot.slotIndex) === slotNum);
    if (!found) throw new Error(`Slot ${SLOT_ARG} not found in manifest.`);
    if (!categoryToPuzzleType(found.category)) {
      throw new Error(`Slot ${SLOT_ARG} is ${found.category}, which is not a supported deterministic puzzle type yet.`);
    }
    return [found];
  }

  if (CATEGORY_ARG) {
    const found = supported.find(slot => slot.category === CATEGORY_ARG);
    if (!found) throw new Error(`No manifest slot found for category ${CATEGORY_ARG}.`);
    return [found];
  }

  if (supported.length > 0) return [supported[0]];
  throw new Error('Manifest has no supported puzzle slots for maze or word-search.');
}

function buildConfigFromManifestSlot(manifest, slot) {
  const type = categoryToPuzzleType(slot.category);
  const datePart = manifest.date || new Date().toISOString().slice(0, 10);
  const slotPart = `slot${String(slot.slotIndex).padStart(2, '0')}`;
  const themePart = slugify(slot.theme || slot.label || type);
  return {
    source: 'manifest',
    manifestDate: manifest.date || null,
    slotIndex: slot.slotIndex,
    category: slot.category,
    type,
    theme: slot.theme || THEME,
    difficulty: String(slot.difficulty || DIFFICULTY || 'medium').toLowerCase(),
    title: TITLE || slot.topic || slot.subject || slot.label || getDefaultTitle(type, slot.theme || THEME),
    slug: SLUG_ARG || `${datePart}-${slotPart}-${themePart}-${type}`,
    activityDir: null,
    countdown: COUNTDOWN,
    words: WORDS,
  };
}

function buildDirectConfig() {
  const type = normalizeType(TYPE_ARG);
  if (!type) {
    throw new Error('Usage: --type maze|wordsearch --theme "Theme Name" [--difficulty medium] [--activity-dir existing-folder]');
  }

  return {
    source: 'direct',
    type,
    theme: THEME,
    difficulty: DIFFICULTY,
    title: TITLE || getDefaultTitle(type, THEME),
    slug: SLUG_ARG || `${slugify(THEME)}-${type === 'maze' ? 'maze-post' : 'wordsearch-post'}-${DIFFICULTY}`,
    activityDir: ACTIVITY_DIR_ARG ? path.resolve(ROOT, ACTIVITY_DIR_ARG) : null,
    countdown: COUNTDOWN,
    words: WORDS,
  };
}

async function buildPostImage(activityDir, activity, outputPath, type) {
  const sourcePuzzlePath = await ensurePuzzlePng(activityDir);
  const style = getStyleKit(type, activity.theme || THEME);
  const backgroundSvg = renderBackgroundSvg({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    theme: activity.theme || THEME,
    titleText: pickTitleText(activity, null, type),
    difficulty: activity.difficulty || DIFFICULTY,
    style,
    type,
  });

  const puzzleBuffer = await sharp(sourcePuzzlePath)
    .resize(PUZZLE_WIDTH, PUZZLE_HEIGHT, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 4,
      background: style.background,
    },
  })
    .composite([
      { input: Buffer.from(backgroundSvg), top: 0, left: 0 },
      { input: puzzleBuffer, top: PUZZLE_TOP, left: PUZZLE_LEFT },
      { input: Buffer.from(renderStartMarkerSvg(style)), top: PUZZLE_TOP + 4, left: PUZZLE_LEFT - 54 },
      { input: Buffer.from(renderFinishMarkerSvg(style)), top: PUZZLE_TOP + PUZZLE_HEIGHT - 26, left: PUZZLE_LEFT + PUZZLE_WIDTH - 20 },
    ])
    .png()
    .toFile(outputPath);
}

async function processOne(config) {
  const activityDir = config.activityDir || path.join(GENERATED_DIR, config.slug);

  if (!config.activityDir) {
    console.log(`[puzzle-post] generating ${config.type} assets for theme: ${config.theme}`);
    const output = runGenerator(config.type, config, DRY_RUN);
    process.stdout.write(output);
    if (DRY_RUN) {
      console.log(`[puzzle-post] dry-run target dir: ${activityDir}`);
      return;
    }
  }

  const activityPath = path.join(activityDir, 'activity.json');
  const puzzleJsonName = config.type === 'maze' ? 'maze.json' : 'puzzle.json';
  const puzzlePath = path.join(activityDir, puzzleJsonName);
  const activity = JSON.parse(await fs.readFile(activityPath, 'utf8'));
  const puzzle = JSON.parse(await fs.readFile(puzzlePath, 'utf8'));

  const postPath = path.join(activityDir, 'post.png');

  console.log(`[puzzle-post] activityDir: ${activityDir}`);

  if (DRY_RUN) {
    console.log('[puzzle-post] dry-run only, no files written.');
    return;
  }

  const rawFolder = getRawFolder(config.type);
  const rawSuffix = config.source === 'manifest'
    ? `${manifestSafe(config.manifestDate)}-slot${String(config.slotIndex).padStart(2, '0')}-${slugify(activity.theme || config.theme)}`
    : slugify(activity.theme || config.theme || config.slug);
  const rawBase = `${config.type === 'maze' ? 'maze' : 'wordsearch'}-${rawSuffix}`;
  const rawImagePath = path.join(rawFolder, `${rawBase}.png`);
  const rawSidecarPath = path.join(rawFolder, `${rawBase}.json`);

  console.log(`[puzzle-post] rawImage   : ${rawImagePath}`);

  await fs.mkdir(rawFolder, { recursive: true });
  await buildPostImage(activityDir, activity, postPath, config.type);
  await fs.copyFile(postPath, rawImagePath);

  const subject = config.title || activity.titleText || getDefaultTitle(config.type, activity.theme || config.theme);
  const sidecar = {
    category: config.type === 'maze' ? 'activity-maze' : 'activity-word-search',
    subject,
    hookText: activity.hookText || activity.titleText || '',
    difficulty: puzzle.difficulty || activity.difficulty || config.difficulty,
    theme: activity.theme || config.theme,
    source: config.source === 'manifest' ? 'puzzle-generator-manifest' : 'puzzle-generator',
    sourceFolder: path.relative(ROOT, activityDir).replace(/\\/g, '/'),
    puzzleType: config.type,
    titleText: activity.titleText || '',
    ctaText: activity.ctaText || 'Save this for later',
    manifestDate: config.manifestDate || null,
    manifestSlotIndex: config.slotIndex || null,
    manifestCategory: config.category || null,
  };

  await fs.writeFile(rawSidecarPath, JSON.stringify(sidecar, null, 2));
  console.log(`[puzzle-post] wrote post : ${postPath}`);
  console.log(`[puzzle-post] wrote raw  : ${rawImagePath}`);
  console.log(`[puzzle-post] wrote meta : ${rawSidecarPath}`);
}

function manifestSafe(dateStr) {
  return String(dateStr || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, '');
}

async function main() {
  if (MANIFEST_ARG || DATE_ARG || SLOT_ARG || CATEGORY_ARG || ALL_SUPPORTED) {
    const { manifest, manifestPath } = await loadManifest();
    const targets = resolveManifestTargets(manifest);
    console.log(`[puzzle-post] manifest   : ${manifestPath}`);
    console.log(`[puzzle-post] targets    : ${targets.map(t => `${t.slotIndex}:${t.category}:${t.theme}`).join(', ')}`);
    for (const slot of targets) {
      await processOne(buildConfigFromManifestSlot(manifest, slot));
    }
    return;
  }

  await processOne(buildDirectConfig());
}

main().catch((error) => {
  console.error('[puzzle-post] failed:', error.message);
  process.exit(1);
});

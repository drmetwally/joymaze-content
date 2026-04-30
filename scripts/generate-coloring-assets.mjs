#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { buildChallengeHook } from './lib/challenge-hooks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT, 'output', 'challenge', 'generated-activity');

const CANVAS_W = 1080;
const CANVAS_H = 1500;
const BG_COLOR = '#FAFAFA';

// ── Canvas & layout constants ────────────────────────────────────────────────

const SLOT_COLS = 4;
const SLOT_ROWS = 3;
const OFFSET_X = 40;
const OFFSET_Y = 100;
const PANEL_W = CANVAS_W - 2 * OFFSET_X;  // 1000
const PANEL_H = CANVAS_H - OFFSET_Y - 20;  // 1380
const SLOT_W = Math.floor(PANEL_W / SLOT_COLS);   // 250
const SLOT_H = Math.floor(PANEL_H / SLOT_ROWS);   // 460
const OBJECT_SIZE = 130;

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getArg = (f, def = null) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] ?? def : def;
};

const DRY_RUN   = hasFlag('--dry-run');
const TITLE     = getArg('--title', 'Color the Scene');
const THEME     = getArg('--theme', TITLE);
const DIFFICULTY = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const SEED_ARG  = getArg('--seed');
const SLUG_ARG  = getArg('--slug');
const OUT_DIR_ARG = getArg('--out-dir');

const PUZZLE_TYPE = 'coloring';
const COUNTDOWN_SEC = 0;
const SOLVE_DURATION_SEC = 15;
const DEFAULT_CHALLENGE_AUDIO_VOLUME = 0.11;
const DEFAULT_TICK_AUDIO_VOLUME = 0.3;
const DEFAULT_TRANSITION_CUE_VOLUME = 0.24;
const DEFAULT_SOLVE_AUDIO_VOLUME = 0.52;

const difficultyDefaults = {
  easy:   { objects: 6 },
  medium: { objects: 9 },
  hard:   { objects: 12 },
};
const OBJECT_COUNT = difficultyDefaults[DIFFICULTY]?.objects ?? 9;

// ── Seed helpers ─────────────────────────────────────────────────────────────

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randInt(rng, max) { return Math.floor(rng() * max); }
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Theme families ───────────────────────────────────────────────────────────

function resolveThemeFamily(t) {
  const s = t.toLowerCase();
  if (s.includes('ocean') || s.includes('sea') || s.includes('fish')) return 'ocean';
  if (s.includes('space') || s.includes('rocket') || s.includes('planet')) return 'space';
  if (s.includes('jungle') || s.includes('safari') || s.includes('zoo')) return 'animals';
  return 'animals';
}

// ── Shape drawing helpers ────────────────────────────────────────────────────

function svgGroup(id, children) {
  return `  <g id="${id}">\n${children}\n  </g>`;
}

function circle(cx, cy, r, fill, stroke = 'none', sw = 0) {
  return `    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${stroke !== 'none' ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
}

function rect(x, y, w, h, fill, rx = 0, stroke = 'none', sw = 0) {
  return `    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${rx ? ` rx="${rx}"` : ''}${stroke !== 'none' ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
}

function polygon(points, fill, stroke = 'none', sw = 0) {
  const pts = points.map(p => `${p[0]},${p[1]}`).join(' ');
  return `    <polygon points="${pts}" fill="${fill}"${stroke !== 'none' ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
}

function svgPathLine(d, fill, stroke = 'none', sw = 0) {
  return `    <path d="${d}" fill="${fill}"${stroke !== 'none' ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
}

function ellipse(cx, cy, rx, ry, fill, stroke = 'none', sw = 0) {
  return `    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${stroke !== 'none' ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
}

// ── Ocean shapes ─────────────────────────────────────────────────────────────

const OCEAN_PALETTE = ['#FF8C42', '#FFD700', '#4ECDC4', '#FF6B6B', '#A8E6CF', '#C3B1E1'];

function drawOceanFish(cx, cy, size, color, rot) {
  const s = size * 0.9;
  return svgGroup('fish', `
    ${svgPathLine(`M ${cx-s*0.5} ${cy} L ${cx+s*0.5} ${cy-s*0.3} L ${cx+s*0.5} ${cy+s*0.3} Z`, color, '#1A1A1A', 6)}
    ${svgPathLine(`M ${cx-s*0.5} ${cy} L ${cx-s*0.8} ${cy-s*0.4} L ${cx-s*0.8} ${cy+s*0.4} Z`, color, '#1A1A1A', 6)}
    ${circle(cx + s*0.25, cy - s*0.08, s*0.1, '#1A1A2A')}
  `);
}

function drawOceanBubble(cx, cy, size, color, rot) {
  return svgGroup('bubble', `
    ${circle(cx, cy, size * 0.5, 'none', '#1A1A1A', 6)}
    ${circle(cx - size*0.15, cy - size*0.15, size*0.12, 'rgba(255,255,255,0.7)')}
  `);
}

function drawOceanShell(cx, cy, size, color, rot) {
  return svgGroup('shell', `
    ${svgPathLine(`M ${cx} ${cy-size*0.6} Q ${cx+size*0.6} ${cy} ${cx} ${cy+size*0.6} Q ${cx-size*0.6} ${cy} ${cx} ${cy-size*0.6} Z`, color, '#1A1A1A', 6)}
    ${svgPathLine(`M ${cx-size*0.1} ${cy-size*0.4} Q ${cx+size*0.3} ${cy-size*0.3} ${cx+size*0.2} ${cy+size*0.2}`, 'none', '#1A1A1A', 4)}
  `);
}

function drawOceanCrab(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('crab', `
    ${circle(cx, cy, s, color, '#1A1A1A', 6)}
    ${circle(cx - s*1.2, cy - s*0.5, s*0.6, color, '#1A1A1A', 6)}
    ${circle(cx + s*1.2, cy - s*0.5, s*0.6, color, '#1A1A1A', 6)}
    ${circle(cx - s*0.4, cy - s*0.8, s*0.5, color, '#1A1A1A', 6)}
    ${circle(cx + s*0.4, cy - s*0.8, s*0.5, color, '#1A1A1A', 6)}
    ${circle(cx - s*0.9, cy - s*1.1, s*0.35, color, '#1A1A1A', 6)}
    ${circle(cx + s*0.9, cy - s*1.1, s*0.35, color, '#1A1A1A', 6)}
    ${circle(cx - s*0.2, cy - s*0.1, s*0.12, '#1A1A2A')}
    ${circle(cx + s*0.2, cy - s*0.1, s*0.12, '#1A1A2A')}
  `);
}

function drawOceanCoral(cx, cy, size, color, rot) {
  const s = size * 0.3;
  return svgGroup('coral', `
    ${rect(cx - s, cy - s*2, s*2, s*3, color, s, '#1A1A1A', 6)}
    ${rect(cx - s*2.5, cy - s*0.5, s*1.5, s*1.5, color, s*0.4, '#1A1A1A', 6)}
    ${rect(cx + s*0.5, cy - s*0.5, s*1.5, s*1.5, color, s*0.4, '#1A1A1A', 6)}
  `);
}

function drawOceanStarfish(cx, cy, size, color, rot) {
  const s = size * 0.5;
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const a1 = (i * 72 - 90) * Math.PI / 180;
    const a2 = ((i * 72) + 36 - 90) * Math.PI / 180;
    pts.push([cx + Math.cos(a1) * s, cy + Math.sin(a1) * s]);
    pts.push([cx + Math.cos(a2) * s * 0.4, cy + Math.sin(a2) * s * 0.4]);
  }
  return svgGroup('starfish', polygon(pts, color, '#1A1A1A', 6));
}

function drawOceanSeahorse(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('seahorse', `
    ${svgPathLine(`M ${cx} ${cy-s*2} Q ${cx+s*1.5} ${cy-s*1.5} ${cx+s*0.5} ${cy} Q ${cx+s*0.3} ${cy+s*0.5} ${cx} ${cy+s*1.5}`, color, '#1A1A1A', 6)}
    ${circle(cx + s*0.1, cy - s*1.8, s*0.3, color, '#1A1A1A', 6)}
    ${circle(cx + s*0.2, cy - s*2.1, s*0.08, '#1A1A2A')}
  `);
}

const OCEAN_FACTORIES = [drawOceanFish, drawOceanBubble, drawOceanShell, drawOceanCrab, drawOceanCoral, drawOceanStarfish, drawOceanSeahorse];

// ── Animals shapes ───────────────────────────────────────────────────────────

const ANIMAL_PALETTE = ['#FFB347', '#87CEEB', '#98D8C8', '#F7DC6F', '#D7BDE2', '#BB8FCE'];

function drawAnimalDog(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('dog', `
    ${circle(cx, cy, s, color, '#1A1A1A', 6)}
    ${svgPathLine(`M ${cx-s} ${cy-s*0.6} L ${cx-s*1.2} ${cy-s*1.4} L ${cx-s*0.5} ${cy-s*0.9}`, color, '#1A1A1A', 6)}
    ${svgPathLine(`M ${cx+s} ${cy-s*0.6} L ${cx+s*1.2} ${cy-s*1.4} L ${cx+s*0.5} ${cy-s*0.9}`, color, '#1A1A1A', 6)}
    ${circle(cx - s*0.3, cy - s*0.15, s*0.15, '#1A1A2A')}
    ${circle(cx + s*0.3, cy - s*0.15, s*0.15, '#1A1A2A')}
    ${ellipse(cx, cy + s*0.3, s*0.25, s*0.18, '#1A1A2A')}
  `);
}

function drawAnimalCat(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('cat', `
    ${circle(cx, cy, s, color, '#1A1A1A', 6)}
    ${svgPathLine(`M ${cx-s} ${cy-s*0.6} L ${cx-s*1.0} ${cy-s*1.6} L ${cx-s*0.4} ${cy-s*0.9}`, color, '#1A1A1A', 6)}
    ${svgPathLine(`M ${cx+s} ${cy-s*0.6} L ${cx+s*1.0} ${cy-s*1.6} L ${cx+s*0.4} ${cy-s*0.9}`, color, '#1A1A1A', 6)}
    ${circle(cx - s*0.3, cy - s*0.15, s*0.13, '#1A1A2A')}
    ${circle(cx + s*0.3, cy - s*0.15, s*0.13, '#1A1A2A')}
    ${ellipse(cx, cy + s*0.3, s*0.12, s*0.08, '#FF69B4')}
  `);
}

function drawAnimalPaw(cx, cy, size, color, rot) {
  const s = size * 0.35;
  return svgGroup('paw', `
    ${circle(cx, cy + s*0.2, s*0.9, color, '#1A1A1A', 6)}
    ${circle(cx - s*0.7, cy - s*0.4, s*0.5, color, '#1A1A1A', 6)}
    ${circle(cx + s*0.7, cy - s*0.4, s*0.5, color, '#1A1A1A', 6)}
    ${circle(cx - s*0.35, cy - s*1.0, s*0.45, color, '#1A1A1A', 6)}
    ${circle(cx + s*0.35, cy - s*1.0, s*0.45, color, '#1A1A1A', 6)}
  `);
}

function drawAnimalBone(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('bone', `
    ${rect(cx - s*2, cy - s*0.4, s*4, s*0.8, color, s*0.4, '#1A1A1A', 6)}
    ${circle(cx - s*2, cy - s*0.8, s*0.5, color, '#1A1A1A', 6)}
    ${circle(cx - s*2, cy + s*0.8, s*0.5, color, '#1A1A1A', 6)}
    ${circle(cx + s*2, cy - s*0.8, s*0.5, color, '#1A1A1A', 6)}
    ${circle(cx + s*2, cy + s*0.8, s*0.5, color, '#1A1A1A', 6)}
  `);
}

function drawAnimalBall(cx, cy, size, color, rot) {
  return svgGroup('ball', `
    ${circle(cx, cy, size * 0.45, color, '#1A1A1A', 6)}
    ${svgPathLine(`M ${cx - size*0.45} ${cy} A ${size*0.45} ${size*0.45} 0 0 1 ${cx + size*0.45} ${cy}`, 'none', '#1A1A1A', 5)}
    ${circle(cx, cy, size * 0.45, 'none', '#1A1A1A', 6)}
  `);
}

function drawAnimalHouse(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('house', `
    ${svgPathLine(`M ${cx} ${cy-s*1.8} L ${cx+s*1.4} ${cy-s*0.3} L ${cx+s*1.4} ${cy+s*1.2} L ${cx-s*1.4} ${cy+s*1.2} L ${cx-s*1.4} ${cy-s*0.3} Z`, color, '#1A1A1A', 6)}
    ${rect(cx - s*0.5, cy + s*0.1, s, s*1.1, '#8B4513', s*0.2, '#1A1A1A', 5)}
    ${circle(cx, cy - s*0.8, s*0.3, '#FFD700', '#1A1A1A', 4)}
  `);
}

const ANIMAL_FACTORIES = [drawAnimalDog, drawAnimalCat, drawAnimalPaw, drawAnimalBone, drawAnimalBall, drawAnimalHouse];

// ── Space shapes ─────────────────────────────────────────────────────────────

const SPACE_PALETTE = ['#FF6B6B', '#A8E6CF', '#88D8B0', '#F7DC6F', '#D2B4DE', '#F0B27A'];

function drawSpaceRocket(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('rocket', `
    ${svgPathLine(`M ${cx} ${cy-s*2} L ${cx+s*0.6} ${cy+s*0.8} L ${cx-s*0.6} ${cy+s*0.8} Z`, color, '#1A1A1A', 6)}
    ${svgPathLine(`M ${cx+s*0.6} ${cy+s*0.8} L ${cx+s*1.2} ${cy+s*1.8} L ${cx+s*0.3} ${cy+s*0.8}`, color, '#1A1A1A', 5)}
    ${svgPathLine(`M ${cx-s*0.6} ${cy+s*0.8} L ${cx-s*1.2} ${cy+s*1.8} L ${cx-s*0.3} ${cy+s*0.8}`, color, '#1A1A1A', 5)}
    ${rect(cx - s*0.3, cy - s*0.5, s*0.6, s*1.0, '#87CEEB', s*0.1, '#1A1A1A', 5)}
    ${circle(cx, cy - s*0.2, s*0.2, '#FFD700')}
  `);
}

function drawSpacePlanet(cx, cy, size, color, rot) {
  const s = size * 0.45;
  return svgGroup('planet', `
    ${circle(cx, cy, s, color, '#1A1A1A', 6)}
    ${ellipse(cx, cy, s*1.6, s*0.35, 'none', '#1A1A1A', 4)}
  `);
}

function drawSpaceStar(cx, cy, size, color, rot) {
  const s = size * 0.5;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * 36 - 90) * Math.PI / 180;
    const r = i % 2 === 0 ? s : s * 0.4;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return svgGroup('star', polygon(pts, color, '#1A1A1A', 6));
}

function drawSpaceMoon(cx, cy, size, color, rot) {
  const s = size * 0.45;
  return svgGroup('moon', `
    ${circle(cx, cy, s, color, '#1A1A1A', 6)}
    ${circle(cx + s*0.3, cy - s*0.3, s*0.4, '#FAFAFA')}
  `);
}

function drawSpaceUfo(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('ufo', `
    ${ellipse(cx, cy, s*1.2, s*0.4, color, '#1A1A1A', 6)}
    ${circle(cx, cy - s*0.3, s*0.5, color, '#1A1A1A', 5)}
    ${circle(cx - s*0.8, cy + s*0.5, s*0.15, '#FFD700')}
    ${circle(cx, cy + s*0.5, s*0.15, '#FFD700')}
    ${circle(cx + s*0.8, cy + s*0.5, s*0.15, '#FFD700')}
  `);
}

function drawSpaceSatellite(cx, cy, size, color, rot) {
  const s = size * 0.35;
  return svgGroup('satellite', `
    ${rect(cx - s*1.5, cy - s*0.15, s*3, s*0.3, color, s*0.1, '#1A1A1A', 5)}
    ${rect(cx - s*0.2, cy - s*2, s*0.4, s*4, '#87CEEB', 0, '#1A1A1A', 4)}
    ${circle(cx, cy, s*0.3, color, '#1A1A1A', 5)}
  `);
}

const SPACE_FACTORIES = [drawSpaceRocket, drawSpacePlanet, drawSpaceStar, drawSpaceMoon, drawSpaceUfo, drawSpaceSatellite];

// ── Scene builder ────────────────────────────────────────────────────────────

function buildScene(slots, colored) {
  const fill = colored ? null : '#FFFFFF';
  const stroke = '#1A1A1A';
  const strokeWidth = colored ? 3 : 6;  // thinner strokes on colored version
  const lines = slots.filter(s => s.visible).map(slot => {
    const factory = slot.factory;
    return factory(slot.cx, slot.cy, slot.size, slot.color, slot.rotation);
  });
  return lines.join('\n');
}

// ── Coloring JSON builder ────────────────────────────────────────────────────

function buildColoringJson({ objects, theme, folderRel }) {
  return {
    version: 1,
    puzzleType: PUZZLE_TYPE,
    theme,
    objectCount: objects.filter(o => o.visible).length,
    emptySlots: objects.filter(o => !o.visible).length,
    objects: objects.map(o => ({
      slotIndex: o.index,
      type: o.typeName,
      cx: o.cx,
      cy: o.cy,
      size: o.size,
      color: o.color,
      visible: o.visible,
    })),
    panels: {
      canvasW: CANVAS_W,
      canvasH: CANVAS_H,
      offsetX: OFFSET_X,
      offsetY: OFFSET_Y,
      panelW: PANEL_W,
      panelH: PANEL_H,
      slotCols: SLOT_COLS,
      slotRows: SLOT_ROWS,
    },
  };
}

// ── Output helpers ───────────────────────────────────────────────────────────

async function writeSvgPng(svg, outSvgPath, outPngPath) {
  await fs.writeFile(outSvgPath, svg, 'utf8');
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(outPngPath, pngBuffer);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const seed = SEED_ARG ? Number(SEED_ARG) : hashStringToSeed(`${TITLE}|${THEME}|${DIFFICULTY}`);
  const rng = mulberry32(seed);
  const slug = SLUG_ARG || `coloring-${THEME.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${DIFFICULTY}`;
  const outDir = OUT_DIR_ARG ? path.resolve(ROOT, OUT_DIR_ARG) : path.join(OUTPUT_ROOT, slug);
  const folderRel = path.relative(ROOT, outDir).replace(/\\/g, '/');

  const family = resolveThemeFamily(THEME);

  let factories, palette;
  if (family === 'ocean') { factories = OCEAN_FACTORIES; palette = OCEAN_PALETTE; }
  else if (family === 'space') { factories = SPACE_FACTORIES; palette = SPACE_PALETTE; }
  else { factories = ANIMAL_FACTORIES; palette = ANIMAL_PALETTE; }

  // Build slots — fill some with themed objects, leave rest empty
  const totalSlots = SLOT_COLS * SLOT_ROWS; // 12
  const slotCount = totalSlots;
  const emptyCount = slotCount - OBJECT_COUNT; // 3 for medium

  const slots = [];
  const usedSlots = new Set();

  // For coloring pages we fill all requested slots without adjacency constraint.
  // Slot assignment is inherently non-adjacent due to the grid layout.
  const shuffledFactoryOrder = shuffle([...Array(factories.length).keys()], rng);
  let objectIdx = 0;

  for (let si = 0; si < slotCount && objectIdx < OBJECT_COUNT; si++) {
    const colIdx = si % SLOT_COLS;
    const rowIdx = Math.floor(si / SLOT_COLS);
    const cx = OFFSET_X + colIdx * SLOT_W + SLOT_W / 2;
    const cy = OFFSET_Y + rowIdx * SLOT_H + SLOT_H / 2;

    const factoryIdx = shuffledFactoryOrder[objectIdx % shuffledFactoryOrder.length];
    const typeName = factories[factoryIdx].name.replace('draw', '').toLowerCase().replace(/^[a-z]/, c => c.toUpperCase());

    slots.push({
      index: si,
      cx, cy,
      size: OBJECT_SIZE,
      color: palette[objectIdx % palette.length],
      rotation: 0,
      visible: true,
      factory: factories[factoryIdx],
      typeName,
    });
    objectIdx++;
  }

  // Mark empty slots
  for (let i = 0; i < slotCount; i++) {
    if (!usedSlots.has(i)) {
      const colIdx = i % SLOT_COLS;
      const rowIdx = Math.floor(i / SLOT_COLS);
      slots.push({
        index: i,
        cx: OFFSET_X + colIdx * SLOT_W + SLOT_W / 2,
        cy: OFFSET_Y + rowIdx * SLOT_H + SLOT_H / 2,
        size: OBJECT_SIZE,
        color: '#FFFFFF',
        rotation: 0,
        visible: false,
        factory: factories[0],
        typeName: 'empty',
      });
    }
  }

  // Sort back to index order
  slots.sort((a, b) => a.index - b.index);

  const hookTitle = await buildChallengeHook({
    theme: THEME,
    puzzleType: PUZZLE_TYPE,
    difficulty: DIFFICULTY,
    seedHint: `${TITLE}|${THEME}|${DIFFICULTY}`,
  });

  // Build SVGs — blank uses white fills, colored uses palette fills
  const titleLabel = `  <text x="${CANVAS_W / 2}" y="58" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="32" font-weight="900" fill="#FF6B35" letter-spacing="2">Color the ${THEME}!</text>`;

  const blankSvg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="${BG_COLOR}"/>
  ${titleLabel}
  <rect x="${OFFSET_X - 8}" y="${OFFSET_Y - 8}" width="${PANEL_W + 16}" height="${PANEL_H + 16}" fill="none" stroke="#CCCCCC" stroke-width="2" rx="8"/>
  <rect x="${OFFSET_X}" y="${OFFSET_Y}" width="${PANEL_W}" height="${PANEL_H}" fill="${BG_COLOR}"/>
${buildScene(slots, false)}
</svg>`;

  const coloredSvg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#F5F5F5"/>
  ${titleLabel}
  <rect x="${OFFSET_X - 8}" y="${OFFSET_Y - 8}" width="${PANEL_W + 16}" height="${PANEL_H + 16}" fill="none" stroke="#CCCCCC" stroke-width="2" rx="8"/>
  <rect x="${OFFSET_X}" y="${OFFSET_Y}" width="${PANEL_W}" height="${PANEL_H}" fill="#F5F5F5"/>
${buildScene(slots, true)}
</svg>`;

  const coloringJson = buildColoringJson({ objects: slots, theme: THEME, folderRel });

  const activityJson = {
    type: 'challenge',
    puzzleType: PUZZLE_TYPE,
    difficulty: DIFFICULTY,
    theme: THEME,
    titleText: hookTitle,
    hookText: `Color the ${THEME}!`,
    ctaText: 'Show us your coloring in the comments!',
    activityLabel: 'COLORING PAGE',
    countdownSec: COUNTDOWN_SEC,
    hookDurationSec: 2.5,
    holdAfterSec: SOLVE_DURATION_SEC,
    blankImage: 'blank.png',
    solvedImage: 'colored.png',
    imagePath: 'puzzle.png',
    challengeAudioVolume: DEFAULT_CHALLENGE_AUDIO_VOLUME,
    tickAudioVolume: DEFAULT_TICK_AUDIO_VOLUME,
    transitionCueVolume: DEFAULT_TRANSITION_CUE_VOLUME,
    solveAudioVolume: DEFAULT_SOLVE_AUDIO_VOLUME,
    showJoyo: true,
    showBrandWatermark: false,
    sourceFolder: folderRel,
  };

  console.log(`[coloring-factory] title      : ${TITLE}`);
  console.log(`[coloring-factory] theme      : ${THEME}`);
  console.log(`[coloring-factory] family    : ${family}`);
  console.log(`[coloring-factory] outDir    : ${outDir}`);
  console.log(`[coloring-factory] seed      : ${seed}`);
  console.log(`[coloring-factory] difficulty: ${DIFFICULTY}`);
  console.log(`[coloring-factory] objects   : ${slots.filter(s=>s.visible).length} (${SLOT_COLS}×${SLOT_ROWS} grid)`);

  if (DRY_RUN) {
    console.log('[coloring-factory] dry-run only, no files written.');
    return;
  }

  await fs.mkdir(outDir, { recursive: true });

  await Promise.all([
    writeSvgPng(blankSvg, path.join(outDir, 'blank.svg'), path.join(outDir, 'blank.png')),
    writeSvgPng(coloredSvg, path.join(outDir, 'colored.svg'), path.join(outDir, 'colored.png')),
    fs.writeFile(path.join(outDir, 'coloring.json'), JSON.stringify(coloringJson, null, 2)),
    fs.writeFile(path.join(outDir, 'activity.json'), JSON.stringify(activityJson, null, 2)),
  ]);
  await fs.copyFile(path.join(outDir, 'blank.png'), path.join(outDir, 'puzzle.png'));

  console.log('[coloring-factory] wrote files:');
  for (const f of ['activity.json', 'coloring.json', 'blank.svg', 'blank.png', 'colored.svg', 'colored.png', 'puzzle.png']) {
    console.log(`  - ${path.join(outDir, f)}`);
  }
}

main().catch((error) => {
  console.error('[coloring-factory] failed:', error);
  process.exit(1);
});
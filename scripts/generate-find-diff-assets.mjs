#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { buildChallengeHook } from './lib/challenge-hooks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT, 'output', 'challenge', 'generated-activity');

// ── Canvas & layout constants ────────────────────────────────────────────────────

const CANVAS_W = 1080;
const CANVAS_H = 1500;

const TOP_Y = 80;
const BOTTOM_Y = 820;
const PANEL_X = 40;
const PANEL_W = 1000;
const PANEL_H = 640;
const SLOT_COLS = 4;
const SLOT_ROWS = 3;
const SLOT_W = Math.floor(PANEL_W / SLOT_COLS);   // 250
const SLOT_H = Math.floor(PANEL_H / SLOT_ROWS);   // ~213

const DIFF_STROKE = '#FF4444';
const DIFF_FILL = 'rgba(255,68,68,0.12)';
const DIFF_STROKE_WIDTH = 5;

// ── CLI args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getArg = (f, def = null) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] ?? def : def;
};

const DRY_RUN   = hasFlag('--dry-run');
const TITLE     = getArg('--title', 'Spot the Difference');
const THEME     = getArg('--theme', TITLE);
const DIFFICULTY = (getArg('--difficulty', 'medium') || 'medium').toLowerCase();
const SEED_ARG  = getArg('--seed');
const SLUG_ARG  = getArg('--slug');
const OUT_DIR_ARG = getArg('--out-dir');

const PUZZLE_TYPE = 'find-diff';
const COUNTDOWN_SEC = 17;
const SOLVE_DURATION_SEC = 12;

const difficultyDefaults = {
  easy:      { diffs: 3 },
  medium:    { diffs: 5 },
  hard:      { diffs: 7 },
  difficult: { diffs: 9 },
  extreme:   { diffs: 12 },
};
const DIFF_COUNT = difficultyDefaults[DIFFICULTY]?.diffs ?? 5;

// ── Seed helpers ────────────────────────────────────────────────────────────────

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
function randFloat(rng, min, max) { return min + rng() * (max - min); }
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Theme families ───────────────────────────────────────────────────────────────

function resolveThemeFamily(t) {
  const s = t.toLowerCase();
  if (s.includes('ocean') || s.includes('sea') || s.includes('fish')) return 'ocean';
  if (s.includes('space') || s.includes('rocket') || s.includes('planet')) return 'space';
  if (s.includes('jungle') || s.includes('safari') || s.includes('zoo')) return 'jungle';
  return 'animals';
}

// ── Shape drawing helpers ────────────────────────────────────────────────────────

function slotCenter(slotIndex) {
  const col = slotIndex % SLOT_COLS;
  const row = Math.floor(slotIndex / SLOT_COLS);
  return {
    x: PANEL_X + col * SLOT_W + SLOT_W / 2,
    y: TOP_Y + row * SLOT_H + SLOT_H / 2,
  };
}

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

// ── Ocean shapes ────────────────────────────────────────────────────────────────

const OCEAN_PALETTE = ['#FF8C42', '#FFD700', '#4ECDC4', '#FF6B6B', '#A8E6CF', '#C3B1E1'];

function drawOceanFish(cx, cy, size, color, rot) {
  const s = size * 0.9;
  return svgGroup('fish', `
    ${svgPathLine(`M ${cx-s*0.5} ${cy} L ${cx+s*0.5} ${cy-s*0.3} L ${cx+s*0.5} ${cy+s*0.3} Z`, color)}
    ${svgPathLine(`M ${cx-s*0.5} ${cy} L ${cx-s*0.8} ${cy-s*0.4} L ${cx-s*0.8} ${cy+s*0.4} Z`, color)}
    ${circle(cx + s*0.25, cy - s*0.08, s*0.1, '#1A1A2A')}
  `);
}

function drawOceanBubble(cx, cy, size, color, rot) {
  return svgGroup('bubble', `
    ${circle(cx, cy, size * 0.5, 'none', color, 3)}
    ${circle(cx - size*0.15, cy - size*0.15, size*0.12, 'rgba(255,255,255,0.7)')}
  `);
}

function drawOceanShell(cx, cy, size, color, rot) {
  return svgGroup('shell', `
    ${svgPathLine(`M ${cx} ${cy-size*0.6} Q ${cx+size*0.6} ${cy} ${cx} ${cy+size*0.6} Q ${cx-size*0.6} ${cy} ${cx} ${cy-size*0.6} Z`, color, color, 2)}
    ${svgPathLine(`M ${cx-size*0.1} ${cy-size*0.4} Q ${cx+size*0.3} ${cy-size*0.1} ${cx} ${cy+size*0.2}`, 'none', color, 2)}
  `);
}

function drawOceanCrab(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('crab', `
    ${circle(cx, cy, s, color)}
    ${circle(cx - s*1.2, cy - s*0.5, s*0.6, color)}
    ${circle(cx + s*1.2, cy - s*0.5, s*0.6, color)}
    ${circle(cx - s*0.4, cy - s*0.8, s*0.5, color)}
    ${circle(cx + s*0.4, cy - s*0.8, s*0.5, color)}
    ${circle(cx - s*0.9, cy - s*1.1, s*0.35, color)}
    ${circle(cx + s*0.9, cy - s*1.1, s*0.35, color)}
    ${circle(cx - s*0.2, cy - s*0.1, s*0.12, '#1A1A2A')}
    ${circle(cx + s*0.2, cy - s*0.1, s*0.12, '#1A1A2A')}
  `);
}

function drawOceanCoral(cx, cy, size, color, rot) {
  const s = size * 0.3;
  return svgGroup('coral', `
    ${rect(cx - s, cy - s*2, s*2, s*3, color, s)}
    ${rect(cx - s*2.5, cy - s*0.5, s*1.5, s*1.5, color, s*0.4)}
    ${rect(cx + s*0.5, cy - s*0.5, s*1.5, s*1.5, color, s*0.4)}
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
  return svgGroup('starfish', polygon(pts, color, color, 2));
}

function drawOceanSeahorse(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('seahorse', `
    ${svgPathLine(`M ${cx} ${cy-s*2} Q ${cx+s*1.5} ${cy-s*1.5} ${cx+s*0.5} ${cy} Q ${cx+s*1} ${cy+s*0.5} ${cx} ${cy+s*2}`, color, color, 2)}
    ${circle(cx + s*0.1, cy - s*1.8, s*0.3, color)}
    ${circle(cx + s*0.2, cy - s*2.1, s*0.08, '#1A1A2A')}
  `);
}

const OCEAN_FACTORIES = [drawOceanFish, drawOceanBubble, drawOceanShell, drawOceanCrab, drawOceanCoral, drawOceanStarfish, drawOceanSeahorse];

// ── Animals shapes ──────────────────────────────────────────────────────────────

const ANIMAL_PALETTE = ['#FFB347', '#87CEEB', '#98D8C8', '#F7DC6F', '#D7BDE2', '#F1948A'];

function drawAnimalDog(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('dog', `
    ${circle(cx, cy, s, color)}
    ${svgPathLine(`M ${cx-s} ${cy-s*0.6} L ${cx-s*1.2} ${cy-s*1.4} L ${cx-s*0.5} ${cy-s*0.9} Z`, color)}
    ${svgPathLine(`M ${cx+s} ${cy-s*0.6} L ${cx+s*1.2} ${cy-s*1.4} L ${cx+s*0.5} ${cy-s*0.9} Z`, color)}
    ${circle(cx - s*0.3, cy - s*0.15, s*0.15, '#1A1A2A')}
    ${circle(cx + s*0.3, cy - s*0.15, s*0.15, '#1A1A2A')}
    ${ellipse(cx, cy + s*0.3, s*0.25, s*0.18, '#1A1A2A')}
  `);
}

function drawAnimalCat(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('cat', `
    ${circle(cx, cy, s, color)}
    ${svgPathLine(`M ${cx-s} ${cy-s*0.6} L ${cx-s*1.0} ${cy-s*1.6} L ${cx-s*0.4} ${cy-s*0.8} Z`, color)}
    ${svgPathLine(`M ${cx+s} ${cy-s*0.6} L ${cx+s*1.0} ${cy-s*1.6} L ${cx+s*0.4} ${cy-s*0.8} Z`, color)}
    ${circle(cx - s*0.3, cy - s*0.15, s*0.13, '#1A1A2A')}
    ${circle(cx + s*0.3, cy - s*0.15, s*0.13, '#1A1A2A')}
    ${ellipse(cx, cy + s*0.3, s*0.12, s*0.08, '#FF69B4')}
  `);
}

function drawAnimalPaw(cx, cy, size, color, rot) {
  const s = size * 0.35;
  return svgGroup('paw', `
    ${circle(cx, cy + s*0.2, s*0.9, color)}
    ${circle(cx - s*0.7, cy - s*0.4, s*0.5, color)}
    ${circle(cx + s*0.7, cy - s*0.4, s*0.5, color)}
    ${circle(cx - s*0.35, cy - s*1.0, s*0.45, color)}
    ${circle(cx + s*0.35, cy - s*1.0, s*0.45, color)}
  `);
}

function drawAnimalBone(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('bone', `
    ${rect(cx - s*2, cy - s*0.4, s*4, s*0.8, color, s*0.4)}
    ${circle(cx - s*2, cy - s*0.8, s*0.5, color)}
    ${circle(cx - s*2, cy + s*0.8, s*0.5, color)}
    ${circle(cx + s*2, cy - s*0.8, s*0.5, color)}
    ${circle(cx + s*2, cy + s*0.8, s*0.5, color)}
  `);
}

function drawAnimalBall(cx, cy, size, color, rot) {
  return svgGroup('ball', `
    ${circle(cx, cy, size * 0.45, color)}
    ${svgPathLine(`M ${cx - size*0.45} ${cy} A ${size*0.45} ${size*0.45} 0 0 1 ${cx + size*0.45} ${cy}`, 'rgba(255,255,255,0.5)', color, 2)}
  `);
}

function drawAnimalHouse(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('house', `
    ${svgPathLine(`M ${cx} ${cy-s*1.8} L ${cx+s*1.4} ${cy-s*0.3} L ${cx+s*1.4} ${cy+s*1.2} L ${cx-s*1.4} ${cy+s*1.2} L ${cx-s*1.4} ${cy-s*0.3} Z`, color)}
    ${rect(cx - s*0.5, cy + s*0.1, s, s*1.1, '#8B4513', s*0.2)}
    ${circle(cx, cy - s*0.8, s*0.3, '#FFD700')}
  `);
}

const ANIMAL_FACTORIES = [drawAnimalDog, drawAnimalCat, drawAnimalPaw, drawAnimalBone, drawAnimalBall, drawAnimalHouse];

// ── Space shapes ────────────────────────────────────────────────────────────────

const SPACE_PALETTE = ['#FF6B6B', '#A8E6CF', '#88D8B0', '#F7DC6F', '#D2B4DE', '#85C1E9'];

function drawSpaceRocket(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('rocket', `
    ${svgPathLine(`M ${cx} ${cy-s*2} L ${cx+s*0.6} ${cy+s*0.8} L ${cx-s*0.6} ${cy+s*0.8} Z`, color)}
    ${svgPathLine(`M ${cx+s*0.6} ${cy+s*0.8} L ${cx+s*1.2} ${cy+s*1.8} L ${cx+s*0.3} ${cy+s*0.8} Z`, '#FF6B6B')}
    ${svgPathLine(`M ${cx-s*0.6} ${cy+s*0.8} L ${cx-s*1.2} ${cy+s*1.8} L ${cx-s*0.3} ${cy+s*0.8} Z`, '#FF6B6B')}
    ${rect(cx - s*0.3, cy - s*0.5, s*0.6, s*1.0, '#87CEEB', s*0.1)}
    ${circle(cx, cy - s*0.2, s*0.2, '#FFD700')}
  `);
}

function drawSpacePlanet(cx, cy, size, color, rot) {
  const s = size * 0.45;
  return svgGroup('planet', `
    ${circle(cx, cy, s, color)}
    ${ellipse(cx, cy, s*1.6, s*0.35, 'none', color, 3)}
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
  return svgGroup('star', polygon(pts, color, color, 2));
}

function drawSpaceMoon(cx, cy, size, color, rot) {
  const s = size * 0.45;
  return svgGroup('moon', `
    ${circle(cx, cy, s, color)}
    ${circle(cx + s*0.35, cy - s*0.2, s*0.7, '#F5F1E8')}
  `);
}

function drawSpaceAlien(cx, cy, size, color, rot) {
  const s = size * 0.4;
  return svgGroup('alien', `
    ${svgPathLine(`M ${cx} ${cy-s*1.6} Q ${cx+s*1.2} ${cy-s*0.5} ${cx+s*0.8} ${cy+s*1.2} Q ${cx} ${cy+s*1.6} ${cx-s*0.8} ${cy+s*1.2} Q ${cx-s*1.2} ${cy-s*0.5} ${cx} ${cy-s*1.6} Z`, color)}
    ${ellipse(cx - s*0.35, cy - s*0.2, s*0.25, s*0.35, '#1A1A2A')}
    ${ellipse(cx + s*0.35, cy - s*0.2, s*0.25, s*0.35, '#1A1A2A')}
    ${svgPathLine(`M ${cx-s*0.2} ${cy+s*0.6} Q ${cx} ${cy+s*0.9} ${cx+s*0.2} ${cy+s*0.6}`, 'none', color, 2)}
  `);
}

function drawSpaceComet(cx, cy, size, color, rot) {
  const s = size * 0.3;
  return svgGroup('comet', `
    ${circle(cx, cy, s, color)}
    ${svgPathLine(`M ${cx-s*0.5} ${cy-s*0.5} L ${cx-s*3} ${cy-s*3}`, `${color}99`, color, 3)}
    ${svgPathLine(`M ${cx-s*0.3} ${cy+s*0.3} L ${cx-s*2} ${cy+s*2}`, `${color}66`, color, 2)}
  `);
}

const SPACE_FACTORIES = [drawSpaceRocket, drawSpacePlanet, drawSpaceStar, drawSpaceMoon, drawSpaceAlien, drawSpaceComet];

function ellipse(cx, cy, rx, ry, fill) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
}

// ── Scene builder ──────────────────────────────────────────────────────────────

function buildScene(slots, palette, factories, seed) {
  return slots.map((slot, i) => {
    if (!slot.visible) return `  <!-- empty slot ${i} -->`;
    const color = slot.color;
    const factory = factories[slot.typeIndex % factories.length];
    return factory(slot.cx, slot.cy, slot.size, color, slot.rotation || 0);
  }).join('\n');
}

function buildDiffCircles(diffs) {
  return diffs.map(d => {
    const { x, y, radius } = d;
    return `  <circle cx="${x}" cy="${y}" r="${radius}" fill="${DIFF_FILL}" stroke="${DIFF_STROKE}" stroke-width="${DIFF_STROKE_WIDTH}"/>`;
  }).join('\n');
}

// ── Diff application ─────────────────────────────────────────────────────────────

function applyDiff(slot, diffType, rng) {
  switch (diffType) {
    case 'color_change': {
      const altColors = ['#FF6B6B', '#4ECDC4', '#FFD700', '#9B59B6', '#2ECC71', '#E67E22'];
      const otherColors = altColors.filter(c => c !== slot.color);
      return { ...slot, color: otherColors[randInt(rng, otherColors.length)] };
    }
    case 'remove':
      return { ...slot, visible: false };
    case 'add':
      return { ...slot, visible: true };
    case 'size_change':
      return { ...slot, size: slot.size * (rng() > 0.5 ? 1.6 : 0.55) };
    case 'rotation':
      return { ...slot, rotation: (slot.rotation || 0) + (rng() > 0.5 ? 45 : -45) };
    default:
      return slot;
  }
}

function diffLabel(diffCount) {
  if (diffCount === 1) return 'Can you spot the 1 difference?';
  return `Can you spot all ${diffCount} differences?`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const seed = SEED_ARG ? Number(SEED_ARG) : hashStringToSeed(`${TITLE}|${THEME}|${DIFFICULTY}`);
  const rng = mulberry32(seed);
  const slug = SLUG_ARG || `find-diff-${THEME.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${DIFFICULTY}`
  const outDir = OUT_DIR_ARG ? path.resolve(ROOT, OUT_DIR_ARG) : path.join(OUTPUT_ROOT, slug);
  const folderRel = path.relative(ROOT, outDir).replace(/\\/g, '/');

  const family = resolveThemeFamily(THEME);

  // Resolve factories + palette
  let factories, palette;
  if (family === 'ocean') { factories = OCEAN_FACTORIES; palette = OCEAN_PALETTE; }
  else if (family === 'space') { factories = SPACE_FACTORIES; palette = SPACE_PALETTE; }
  else { factories = ANIMAL_FACTORIES; palette = ANIMAL_PALETTE; }

  // Build slot grid — 4×3 = 12 slots
  const slotCount = SLOT_COLS * SLOT_ROWS; // 12
  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    const col = i % SLOT_COLS;
    const row = Math.floor(i / SLOT_COLS);
    const cx = PANEL_X + col * SLOT_W + SLOT_W / 2;
    const cy = TOP_Y + row * SLOT_H + SLOT_H / 2;
    const size = Math.min(SLOT_W, SLOT_H) * 0.72;
    // Leave 1–2 slots empty for natural feel
    const visible = i < slotCount - 1 - randInt(rng, 2);
    slots.push({ index: i, cx, cy, size, color: palette[i % palette.length], rotation: 0, visible, typeIndex: i % factories.length });
  }

  // Snapshot original slots BEFORE diff loop — topScene uses unmodified scene
  const originalSlots = slots.map(s => ({ ...s }));

  // Pick diff slots — no adjacent slots
  const diffTypes = ['color_change', 'color_change', 'size_change', 'rotation', 'remove', 'add'];
  const usedSlots = new Set();
  const diffs = [];
  shuffle([...diffTypes], rng);
  let diffsPlaced = 0;

  for (let attempt = 0; attempt < 200 && diffsPlaced < DIFF_COUNT; attempt++) {
    const si = randInt(rng, slotCount);
    const adjacents = [si - 1, si + 1, si - SLOT_COLS, si + SLOT_COLS].filter(
      j => j >= 0 && j < slotCount && (Math.floor(j / SLOT_COLS) === Math.floor(si / SLOT_COLS) || j % SLOT_COLS === si % SLOT_COLS)
    );
    if (usedSlots.has(si) || adjacents.some(a => usedSlots.has(a))) continue;
    usedSlots.add(si);
    const slot = slots[si];
    const diffType = diffsPlaced < diffs.length ? diffTypes[diffsPlaced] : diffTypes[randInt(rng, diffTypes.length)];
    const diffedSlot = applyDiff({ ...slot }, diffType, rng);
    diffs.push({
      id: diffsPlaced,
      type: diffType,
      slotIndex: si,
      x: slot.cx,
      y: slot.cy + (BOTTOM_Y - TOP_Y), // canvas-absolute: shifted to bottom panel
      radius: Math.min(slot.size * 0.9, 65),
    });
    slots[si] = diffedSlot;
    diffsPlaced++;
  }

  // Build SVGs — topScene uses originalSlots (unmodified), bottomScene uses diffed slots shifted down
  const topScene = buildScene(originalSlots, palette, factories, seed);
  const bottomScene = buildScene(
    slots.map(s => ({ ...s, cy: s.cy + (BOTTOM_Y - TOP_Y) })),
    palette, factories, seed + 1
  );
  const diffCircles = buildDiffCircles(diffs);

  const labelStrip = `  <text x="${CANVAS_W / 2}" y="58" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="32" font-weight="900" fill="#FF6B35" letter-spacing="2">SPOT THE DIFFERENCES</text>`;
  const dividerLabel = `  <text x="${CANVAS_W / 2}" y="${BOTTOM_Y - 20}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#888" font-weight="bold">↓ FIND THE DIFFERENCES ↓</text>`;
  const dividerLine = `  <line x1="40" y1="${BOTTOM_Y - 50}" x2="${CANVAS_W - 40}" y2="${BOTTOM_Y - 50}" stroke="#DDD" stroke-width="2" stroke-dasharray="8,6"/>`;
  const panelBorder = (y) => `  <rect x="${PANEL_X - 4}" y="${y - 4}" width="${PANEL_W + 8}" height="${PANEL_H + 8}" fill="none" stroke="#E0E0E0" stroke-width="3" rx="8"/>`;

  const blankSvg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#FAFAF8"/>
  ${labelStrip}
  ${panelBorder(TOP_Y)}
  <rect x="${PANEL_X}" y="${TOP_Y}" width="${PANEL_W}" height="${PANEL_H}" fill="#FAFAF8"/>
${topScene}
  ${dividerLine}
  ${dividerLabel}
  ${panelBorder(BOTTOM_Y)}
  <rect x="${PANEL_X}" y="${BOTTOM_Y}" width="${PANEL_W}" height="${PANEL_H}" fill="#FAFAF8"/>
${bottomScene}
</svg>`;

  const solvedSvg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#FAFAF8"/>
  ${labelStrip}
  ${panelBorder(TOP_Y)}
  <rect x="${PANEL_X}" y="${TOP_Y}" width="${PANEL_W}" height="${PANEL_H}" fill="#FAFAF8"/>
${topScene}
  ${dividerLine}
  ${dividerLabel}
  ${panelBorder(BOTTOM_Y)}
  <rect x="${PANEL_X}" y="${BOTTOM_Y}" width="${PANEL_W}" height="${PANEL_H}" fill="#FAFAF8"/>
${bottomScene}
${diffCircles}
</svg>`;

  const diffJson = {
    version: 1,
    puzzleType: PUZZLE_TYPE,
    diffCount: diffs.length,
    diffs,
    panels: {
      canvasW: CANVAS_W,
      canvasH: CANVAS_H,
      topPanelY: TOP_Y,
      bottomPanelY: BOTTOM_Y,
      panelW: PANEL_W,
      panelH: PANEL_H,
      offsetX: PANEL_X,
      slotCols: SLOT_COLS,
      slotRows: SLOT_ROWS,
    },
  };

  const activityJson = {
    type: 'challenge',
    puzzleType: PUZZLE_TYPE,
    difficulty: DIFFICULTY,
    theme: THEME,
    titleText: diffLabel(diffs.length),
    hookText: diffLabel(diffs.length),
    ctaText: 'Tag a kid who found them all!',
    activityLabel: 'FIND THE DIFFERENCES',
    countdownSec: COUNTDOWN_SEC,
    hookDurationSec: 2.5,
    holdAfterSec: SOLVE_DURATION_SEC,
    blankImage: 'blank.png',
    solvedImage: 'solved.png',
    imagePath: 'puzzle.png',
    showJoyo: true,
    showBrandWatermark: false,
    sourceFolder: folderRel,
  };

  console.log(`[find-diff-factory] title      : ${TITLE}`);
  console.log(`[find-diff-factory] theme      : ${THEME}`);
  console.log(`[find-diff-factory] family    : ${family}`);
  console.log(`[find-diff-factory] outDir    : ${outDir}`);
  console.log(`[find-diff-factory] seed      : ${seed}`);
  console.log(`[find-diff-factory] difficulty: ${DIFFICULTY}`);
  console.log(`[find-diff-factory] diffs     : ${diffs.length} (${diffs.map(d => d.type).join(', ')})`);

  if (DRY_RUN) {
    console.log('[find-diff-factory] dry-run only, no files written.');
    return;
  }

  await fs.mkdir(outDir, { recursive: true });

  const writePng = async (svg, name) => {
    const svgPath = path.join(outDir, name.replace('.png', '.svg'));
    const pngPath = path.join(outDir, name);
    await fs.writeFile(svgPath, svg, 'utf8');
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    await fs.writeFile(pngPath, buf);
    return [svgPath, pngPath];
  };

  const [, blankPngPath] = await writePng(blankSvg, 'blank.png');
  const [, solvedPngPath] = await writePng(solvedSvg, 'solved.png');
  await fs.copyFile(blankPngPath, path.join(outDir, 'puzzle.png'));

  await Promise.all([
    fs.writeFile(path.join(outDir, 'diff.json'), JSON.stringify(diffJson, null, 2)),
    fs.writeFile(path.join(outDir, 'activity.json'), JSON.stringify(activityJson, null, 2)),
  ]);

  console.log('[find-diff-factory] wrote files:');
  for (const f of ['activity.json', 'diff.json', 'blank.svg', 'blank.png', 'solved.svg', 'solved.png', 'puzzle.png']) {
    console.log(`  - ${path.join(outDir, f)}`);
  }
}

main().catch(err => {
  console.error('[find-diff-factory] failed:', err);
  process.exit(1);
});

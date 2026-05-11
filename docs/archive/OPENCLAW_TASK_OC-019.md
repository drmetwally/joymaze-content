# OpenClaw Task — OC-019: Dot-to-Dot Generator

Date assigned: 2026-04-30
Depends on: OC-018 ✅
Audit required: Yes — write audit report at `docs/OPENCLAW_REPORT_2026-04-30_task-oc-019.md` when done

---

## Context

OC-019 is the final new generator in the puzzle factory. After this, build sprint ends.

`scripts/generate-dottodot-assets.mjs` — deterministic dot-to-dot generator. One themed shape per puzzle, defined as an ordered sequence of numbered dots. Blank = dots + numbers, no connecting lines. Solved = dots + numbers + lines. No AI calls. 7-file contract.

**Critical:** `render-video.mjs` already reads `dots.json` and passes waypoints to the challenge reel animation. The contract is already wired — the generator just needs to produce the right file. Do NOT touch `render-video.mjs`.

---

## dots.json contract (already defined — match exactly)

`render-video.mjs` lines 358–375 read this file. Shape must match:

```json
{
  "version": 1,
  "puzzleType": "dot-to-dot",
  "theme": "Ocean Animals",
  "shapeName": "fish",
  "dotCount": 18,
  "width": 1080,
  "height": 1500,
  "dotColor": "#FF6B35",
  "dots": [
    { "x": 0.72, "y": 0.38 },
    { "x": 0.65, "y": 0.22 }
  ]
}
```

- `x` and `y` are **normalized 0–1** relative to `width`×`height`
- `dots` array is ordered — index 0 = dot #1, index N-1 = dot #N
- `dotColor` is optional (render-video defaults to `#FF6B35` if absent — include it anyway)
- `width` and `height` must match `CANVAS_W` and `CANVAS_H` of the generator (1080×1500)

---

## Output contract (7 files)

All written to `output/challenge/generated-activity/<slug>/`:

```
blank.svg      — numbered dots only, no connecting lines
blank.png      — rasterized blank
solved.svg     — numbered dots + connecting lines forming the shape
solved.png     — rasterized solved
puzzle.png     — copy of blank.png
dots.json      — dot waypoints for reel animation (contract above)
activity.json  — standard challenge metadata
```

---

## Canvas and layout

```
CANVAS_W = 1080
CANVAS_H = 1500
DRAWING_AREA: centered rect, roughly x=90–990, y=150–1350 (800×1200 usable)
```

Title strip at top (same style as coloring generator):
```
"Connect the Dots!" — y=70, centered, Arial Black, #FF6B35, font-size 34
```

The shape's normalized coordinates (0–1) map into the drawing area:
```javascript
const DA_X = 90, DA_Y = 150, DA_W = 900, DA_H = 1200;
// pixel position of dot i:
const px = DA_X + dot.x * DA_W;
const py = DA_Y + dot.y * DA_H;
```

This gives ample margin and keeps dots away from canvas edges.

---

## Shape library

Each shape is a pre-defined ordered array of normalized `[x, y]` points tracing the silhouette. Shapes are hardcoded — not computed at runtime. Define **5–6 shapes per theme family**. The generator picks one shape per puzzle using the seeded RNG.

### Rendering rules

**Blank (dot layer only):**
- Dot circle: `r=10`, `fill="#1A1A1A"`
- Number label: centered on dot, `font-size=22`, `font-family="Arial Black, Arial, sans-serif"`, `fill="#FFFFFF"`, `font-weight=900`
- Number position: the white number sits on top of the black dot — centered by `dominant-baseline="central" text-anchor="middle"`
- Background: `#FAFAFA`, panel border rect same as coloring generator

**Solved (dot layer + line layer):**
- Connecting lines drawn BEFORE dots so dots render on top
- Line style: `stroke="#FF6B35"` (brand orange), `stroke-width=3`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`
- Draw as a single `<polyline points="x1,y1 x2,y2 ...">` for the full sequence
- If the shape is closed (first and last dot connect), use `<polygon>` instead of `<polyline>`
- Dots and numbers render identically to blank — always on top of the lines

### Shape definitions — Ocean family

Define these 5 shapes. Coordinates trace the outline in order. All values 0–1.

**fish** (18 dots) — close shape (connect last dot back to first):
```javascript
const FISH = [
  [0.85, 0.50], // 1  mouth
  [0.82, 0.35], // 2  upper jaw
  [0.72, 0.22], // 3  top front
  [0.55, 0.18], // 4  top mid
  [0.38, 0.20], // 5  top rear
  [0.22, 0.25], // 6  upper tail fork
  [0.08, 0.12], // 7  tail top tip
  [0.18, 0.42], // 8  tail inner top
  [0.10, 0.50], // 9  tail center notch
  [0.18, 0.58], // 10 tail inner bottom
  [0.08, 0.88], // 11 tail bottom tip
  [0.22, 0.75], // 12 lower tail fork
  [0.38, 0.80], // 13 belly rear
  [0.55, 0.82], // 14 belly mid
  [0.72, 0.78], // 15 belly front
  [0.82, 0.65], // 16 lower jaw
  [0.85, 0.50], // closes to 1
  // eye as separate start: skip — keep as continuous path only
];
// Note: remove the closing duplicate [0.85,0.50] from the dots array;
// handle closure in SVG by connecting dot N back to dot 1.
```

**starfish** (10 dots) — 5 outer tips + 5 inner notches, alternating:
```javascript
// Generate mathematically:
const STARFISH = [];
for (let i = 0; i < 10; i++) {
  const angle = (i * 36 - 90) * Math.PI / 180;
  const r = (i % 2 === 0) ? 0.44 : 0.18; // outer tip vs inner notch
  STARFISH.push([0.50 + Math.cos(angle) * r, 0.50 + Math.sin(angle) * r]);
}
// closed shape
```

**crab** (20 dots) — body outline + two claw arms:
```javascript
const CRAB = [
  [0.50, 0.30], // 1  top center body
  [0.65, 0.28], // 2  top right body
  [0.80, 0.20], // 3  right claw base
  [0.92, 0.10], // 4  right claw top
  [0.90, 0.25], // 5  right claw inner
  [0.82, 0.32], // 6  right shoulder
  [0.88, 0.48], // 7  right side
  [0.82, 0.65], // 8  right leg area
  [0.70, 0.72], // 9  lower right
  [0.55, 0.75], // 10 bottom right
  [0.50, 0.78], // 11 bottom center
  [0.45, 0.75], // 12 bottom left
  [0.30, 0.72], // 13 lower left
  [0.18, 0.65], // 14 left leg area
  [0.12, 0.48], // 15 left side
  [0.18, 0.32], // 16 left shoulder
  [0.10, 0.25], // 17 left claw inner
  [0.08, 0.10], // 18 left claw top
  [0.20, 0.20], // 19 left claw base
  [0.35, 0.28], // 20 top left body
  // closes back to 1
];
```

**whale** (16 dots) — rounded body, tail flukes:
```javascript
const WHALE = [
  [0.15, 0.42], // 1  nose/mouth
  [0.10, 0.35], // 2  upper lip
  [0.20, 0.22], // 3  forehead
  [0.42, 0.15], // 4  top front
  [0.65, 0.18], // 5  top back
  [0.78, 0.22], // 6  dorsal fin base front
  [0.82, 0.12], // 7  dorsal fin tip
  [0.86, 0.22], // 8  dorsal fin base rear
  [0.90, 0.30], // 9  upper tail base
  [0.98, 0.20], // 10 right fluke tip
  [0.92, 0.42], // 11 fluke notch
  [0.98, 0.62], // 12 left fluke tip
  [0.90, 0.58], // 13 lower tail base
  [0.75, 0.68], // 14 belly rear
  [0.45, 0.72], // 15 belly mid
  [0.15, 0.58], // 16 belly front
  // closes back to 1
];
```

**seahorse** (22 dots) — curled tail, head crest:
```javascript
const SEAHORSE = [
  [0.50, 0.08], // 1  crown tip
  [0.58, 0.12], // 2  head top right
  [0.65, 0.20], // 3  eye area
  [0.68, 0.30], // 4  snout tip
  [0.62, 0.36], // 5  chin
  [0.55, 0.38], // 6  neck right
  [0.62, 0.48], // 7  chest right
  [0.65, 0.60], // 8  belly right
  [0.62, 0.72], // 9  lower body right
  [0.58, 0.82], // 10 tail base right
  [0.65, 0.88], // 11 tail curl outer
  [0.70, 0.92], // 12 tail tip
  [0.60, 0.95], // 13 tail end
  [0.50, 0.90], // 14 tail inner
  [0.42, 0.82], // 15 tail base left
  [0.38, 0.70], // 16 lower body left
  [0.35, 0.58], // 17 belly left
  [0.38, 0.46], // 18 chest left
  [0.44, 0.36], // 19 neck left
  [0.38, 0.26], // 20 jaw left
  [0.42, 0.14], // 21 head top left
  [0.50, 0.08], // closes to 1
];
```

### Shape definitions — Animals family

Define 5 animal shapes using the same approach. Minimum required for audit:
- **dog_face** (~16 dots) — round head, ear triangles
- **cat_face** (~14 dots) — round head, pointed ear triangles
- **rabbit** (~18 dots) — oval body, long ear outlines
- **paw** (~14 dots) — 4 toe circles + main pad
- **bird** (~16 dots) — wing, tail, beak profile

OpenClaw should define these freehand, then verify visually by generating a solved.png and confirming the connected shape is recognizable.

### Shape definitions — Space family

Define 5 space shapes:
- **rocket** (~20 dots) — rect body, triangle nose, fin triangles
- **star4** (~8 dots) — 4-pointed star (simpler than starfish)
- **moon** (~12 dots) — crescent (outer arc + inner arc cutout)
- **ufo** (~14 dots) — oval dome + flat disc rim
- **planet** (~16 dots) — circle + ring ellipse overlay

---

## Difficulty tiers

Difficulty controls which shapes are available and the minimum dot count:

| Tier | Dot count range | Shape complexity |
|------|----------------|-----------------|
| easy | 8–12 | Simple geometric (star, paw, bird) |
| medium | 14–22 | Medium silhouette (fish, whale, rocket) |
| hard | 24–35 | Detailed outline (crab, seahorse, planet-with-ring) |

If a theme has fewer than 2 shapes at the requested complexity, fall back to medium complexity. Never fail — always produce output.

CLI default: `--difficulty medium`.

---

## CLI interface

Same pattern as all other generators:

```
node scripts/generate-dottodot-assets.mjs \
  [--title "..."] \
  [--theme "Ocean Animals"] \
  [--difficulty medium] \
  [--seed 12345] \
  [--slug custom-slug] \
  [--out-dir path] \
  [--dry-run]
```

`--dry-run` prints theme family, shape name, dot count — writes no files.

---

## activity.json

```json
{
  "type": "challenge",
  "puzzleType": "dot-to-dot",
  "difficulty": "medium",
  "theme": "Ocean Animals",
  "titleText": "Connect the dots to reveal the ocean animal!",
  "hookText": "Connect the dots!",
  "ctaText": "What did you draw? Tell us below!",
  "activityLabel": "DOT TO DOT",
  "countdownSec": 20,
  "hookDurationSec": 2.5,
  "holdAfterSec": 12,
  "blankImage": "blank.png",
  "solvedImage": "solved.png",
  "imagePath": "puzzle.png"
}
```

`countdownSec: 20` — dot-to-dot needs slightly more time than matching/find-diff (more dots to trace). Total ≈ 2.5 + 20 + 2 + 12 = 36.5s. This is just over the 35s band — if it feels too long during reel review, drop to `countdownSec: 17` to land at 33.5s. Flag in the audit report which value was used.

---

## Verification

### Dry run
```
node scripts/generate-dottodot-assets.mjs --theme "Ocean Animals" --difficulty medium --dry-run
```
Must print: theme family, shape name, dot count.

### Live generation
```
node scripts/generate-dottodot-assets.mjs --theme "Ocean Animals" --difficulty medium --slug oc-019-ocean-dottodot-test --seed 42
```
Must exit 0. All 7 files written.

### Challenge reel render
```
node scripts/render-video.mjs --comp ActivityChallenge --challenge output/challenge/generated-activity/oc-019-ocean-dottodot-test --out output/videos/oc-019-dottodot-challenge.mp4
```
Must exit 0. `dots.json` should be detected and `dotWaypoints` passed to composition (look for this in render-video console output if verbose flag exists).

### Visual check (Claude will read PNGs)
- `blank.png`: white background, numbered black dots only — no lines between them. Numbers legible. Dots distributed across the canvas, not clumped.
- `solved.png`: same dots + orange connecting lines forming a recognizable shape. The shape should be identifiable (fish looks like a fish, not a blob).

Also generate a second theme to confirm shape library breadth:
```
node scripts/generate-dottodot-assets.mjs --theme "Space" --difficulty medium --slug oc-019-space-dottodot-test --seed 42
```
Read both `blank.png` and `solved.png`. Space shape should look like a rocket, star, or planet — not an ocean shape.

---

## Important constraints

- No AI calls — shapes are hardcoded coordinate arrays, seeded RNG picks which shape
- `dots.json` field names must match exactly — `render-video.mjs` reads `dotsData.dots[i].x` and `dotsData.dots[i].y`
- `width` and `height` in `dots.json` must be `1080` and `1500` (canvas dimensions)
- Connecting lines in `solved.svg` must render BELOW dots (z-order: lines first, dots second, numbers third)
- Do NOT modify `render-video.mjs`, `ActivityChallenge.jsx`, or any existing generators

---

## Audit report

Write `docs/OPENCLAW_REPORT_2026-04-30_task-oc-019.md` covering:
- Shapes implemented per theme (list names + dot counts)
- `countdownSec` value chosen and why (17 vs 20)
- Visual description: blank (dots + numbers readable?) + solved (shape recognizable?)
- `dots.json` sample for the ocean test (first 3 dots)
- Challenge reel exit code
- Any shapes that look unclear — flag for Claude to decide accept/redesign

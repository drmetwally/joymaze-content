# OpenClaw Task — OC-018: Coloring Page Generator + Image Post Integration

Date assigned: 2026-04-30
Depends on: OC-016 ✅ OC-017 ✅
Audit required: Yes — write audit report at `docs/OPENCLAW_REPORT_2026-04-30_task-oc-018.md` when done

---

## Context

OC-018 completes Sprint 2 by adding the coloring lane to the puzzle factory. Two deliverables:

1. **`scripts/generate-coloring-assets.mjs`** — new deterministic SVG generator producing a coloring page (blank = outlines) and a pre-colored version (colored = filled). No AI calls. Same 7-file contract as matching and find-diff.

2. **`generate-puzzle-image-post.mjs --type coloring`** — extend the existing image post script to support coloring posts. Small addition — mostly plumbing.

The ASMR bridge already works. `activityJsonToProps()` in `render-video.mjs` already handles `colored.png` as the reveal end-state when `revealType === 'coloring'`. As long as the generator outputs `colored.png`, the ASMR lane gets coloring for free.

---

## Pre-flight fix (do this first — 5 minutes)

In `scripts/generate-matching-assets.mjs`, the label truncation limit is 7 characters, causing "JELLYFI..." instead of "JELLYFISH".

Find the label truncation code and increase it. Labels like "JELLYFISH" (9 chars) and "STARFISH" (8 chars) must fit. A limit of 10 characters handles everything in the current ocean pack. If the label still overflows at 10 chars, reduce the font size for that card instead of truncating.

After fix, regenerate `--theme "Ocean Animals" --difficulty medium --seed 42` and confirm "JELLYFISH" renders in full.

---

## Part 1 — `scripts/generate-coloring-assets.mjs`

### Output contract (7 files, same as other generators)

All written to `output/challenge/generated-activity/<slug>/`:

```
blank.svg      — coloring page: thick black outlines, white fills
blank.png      — rasterized blank
colored.svg    — pre-colored: same scene with palette fills
colored.png    — rasterized colored  ← ASMR bridge reads this
puzzle.png     — copy of blank.png (alias)
coloring.json  — scene metadata for future animated reveal
activity.json  — standard challenge metadata
```

**`colored.png` is the critical output** — the existing ASMR TTB wipe reads it directly. Do NOT name it `solved.png`.

### Canvas

`1080×1500` — same as find-diff. Portrait. Same canvas = consistent across all image posts and ASMR video.

### Layout

Use the same 4×3 slot grid as find-diff (SLOT_COLS=4, SLOT_ROWS=3). But adjust the feel:

- `objectSize = 130` (larger than find-diff's 80 — more breathing room, easier to color)
- Leave **3–4 empty slots** instead of 2, so the page doesn't feel cramped
- Top strip: title text ("Color the [Theme]!") — same style as find-diff's "SPOT THE DIFFERENCES" header
- No divider, no bottom panel — single full-canvas scene

Layout within canvas:
```
TITLE STRIP  y=0 to y=90     "Color the Ocean Animals!"
SCENE        y=100 to y=1480  4×3 slot grid of themed objects
```

Slot grid math (same as find-diff, adapted for single panel):
```javascript
const SLOT_COLS = 4, SLOT_ROWS = 3;
const PANEL_W = 1000, PANEL_H = 1380;
const OFFSET_X = 40, OFFSET_Y = 100;
const SLOT_W = Math.floor(PANEL_W / SLOT_COLS);  // 250
const SLOT_H = Math.floor(PANEL_H / SLOT_ROWS);  // 460
```

Each slot center: `cx = OFFSET_X + col * SLOT_W + SLOT_W/2`, `cy = OFFSET_Y + row * SLOT_H + SLOT_H/2`

### Theme object pools

**Reuse the exact same shape factories from `generate-find-diff-assets.mjs`** — same `drawFish`, `drawBubble`, `drawShell`, etc. per theme family. Do NOT duplicate them; copy the factories block.

Same `resolveThemeFamily()` mapping as all other generators.

### Blank SVG rendering (coloring page style)

In the blank, every object must look like a **printable coloring page**:
- Shape fill: `#FFFFFF` (white)
- Shape stroke: `#1A1A1A`, stroke-width `6` (bold outline — much thicker than find-diff)
- Background: `#FAFAFA` (off-white)
- Panel border: thin rect `stroke="#CCCCCC" stroke-width="2" fill="none"` around the scene area

The thick black outlines are what make it feel like a real coloring page. If a factory function draws internal details (eyes, fins) as separate elements, those should also use the thick outline style.

### Colored SVG rendering

In the colored version, every object gets its `slot.color` from `palette[i % palette.length]`. Same palette rotation as find-diff. Background: `#F5F5F5` or a very light tint matching the first palette color at 15% opacity.

Blank and colored must be **identical in shape, position, and size** — only fill color differs. Use the same slot assignments and the same RNG seed for both. No shuffling between blank and colored calls.

### coloring.json contract

```json
{
  "version": 1,
  "puzzleType": "coloring",
  "theme": "Ocean Animals",
  "objectCount": 9,
  "emptySlots": 3,
  "objects": [
    {
      "slotIndex": 0,
      "type": "fish",
      "cx": 165,
      "cy": 330,
      "size": 130,
      "color": "#FF6B6B",
      "visible": true
    }
  ],
  "panels": {
    "canvasW": 1080,
    "canvasH": 1500,
    "offsetX": 40,
    "offsetY": 100,
    "panelW": 1000,
    "panelH": 1380
  }
}
```

### activity.json

Follow the exact same shape as matching and find-diff. Key fields:

```json
{
  "type": "challenge",
  "puzzleType": "coloring",
  "difficulty": "medium",
  "theme": "Ocean Animals",
  "titleText": "Color the ocean animals!",
  "hookText": "Color the ocean animals!",
  "ctaText": "Show us your coloring in the comments!",
  "activityLabel": "COLORING PAGE",
  "countdownSec": 0,
  "hookDurationSec": 2.5,
  "holdAfterSec": 15,
  "blankImage": "blank.png",
  "solvedImage": "colored.png",
  "imagePath": "puzzle.png"
}
```

`countdownSec: 0` — there is no countdown for a coloring page; the ASMR TTB wipe handles timing natively. `holdAfterSec: 15` gives time to admire the colored result.

`solvedImage` must be `"colored.png"` — this is what `activityJsonToProps()` uses to resolve the ASMR end-state image.

### Difficulty tiers

Coloring pages don't have difficulty in the traditional sense. Use difficulty to control how many objects appear:

| Tier | Objects |
|------|---------|
| easy | 6 |
| medium | 9 |
| hard | 12 (all slots filled) |

CLI default: `--difficulty medium` (9 objects).

### CLI interface

Same as other generators:

```
node scripts/generate-coloring-assets.mjs \
  [--title "..."] \
  [--theme "Ocean Animals"] \
  [--difficulty medium] \
  [--seed 12345] \
  [--slug custom-slug] \
  [--out-dir path] \
  [--dry-run]
```

`--dry-run` prints theme family, object count, and slot assignments — writes no files.

---

## Part 2 — `generate-puzzle-image-post.mjs --type coloring`

The image post for a coloring page is simple: show the blank (the coloring page itself) with a "Color this!" hook badge at the top. No wrapper chrome needed — the coloring page IS the content.

### Changes to `generate-puzzle-image-post.mjs`

1. Add `'coloring'` to the `SUPPORTED_TYPES` array (or equivalent type guard)

2. Add a case to `ensurePuzzlePng()` (or equivalent):
   ```javascript
   case 'coloring':
     return runGenerator('generate-coloring-assets.mjs', theme, difficulty, slug);
   ```

3. Add a case to the `getRawFolder()` / output routing:
   ```javascript
   case 'coloring': return path.join(OUTPUT_RAW, 'coloring');
   ```

4. The puzzle image for the post is `blank.png` (the outline version). The wrapper should read it from the activity folder just like maze and word-search read their puzzle images.

5. No other wrapper changes needed. The existing title badge and puzzle-fit logic works for coloring pages.

**Do NOT modify `render-video.mjs`, `AsmrReveal`, or `activityJsonToProps()`** — the ASMR bridge is already wired correctly. Just ensure `colored.png` exists in the output folder.

---

## Verification

### Generator dry run
```
node scripts/generate-coloring-assets.mjs --theme "Ocean Animals" --difficulty medium --dry-run
```
Must print: theme family, object count (9), slot assignments with type + color.

### Live generation
```
node scripts/generate-coloring-assets.mjs --theme "Ocean Animals" --difficulty medium --slug oc-018-ocean-coloring-test --seed 42
```
Must exit 0. All 7 files in `output/challenge/generated-activity/oc-018-ocean-coloring-test/`.

### Visual check (read PNGs — Claude will review)
- `blank.png`: white background, 9 themed shapes with thick black outlines, zero color fills
- `colored.png`: same 9 shapes in same positions, each filled with a distinct palette color

### ASMR render
```
node scripts/render-video.mjs --comp AsmrReveal --challenge output/challenge/generated-activity/oc-018-ocean-coloring-test --out output/videos/oc-018-coloring-asmr.mp4
```
Must exit 0. Thumbnail should show the stacked blank page. Video should TTB-wipe from blank to colored.

### Image post
```
node scripts/generate-puzzle-image-post.mjs --type coloring --theme "Ocean Animals" --difficulty medium --activity-dir output/challenge/generated-activity/oc-018-ocean-coloring-test
```
Must exit 0. `post.png` written to the activity folder and raw copy placed in `output/raw/coloring/`.

---

## Important constraints

- No AI calls — pure SVG generation, seeded PRNG, deterministic
- Reuse shape factories from `generate-find-diff-assets.mjs` (copy the block, do not import — generators are self-contained scripts)
- `colored.png` is the canonical name — do NOT use `solved.png` for this type
- Do NOT modify `render-video.mjs`, `ActivityChallenge.jsx`, `AsmrReveal.jsx`, or any existing generators

---

## Audit report

Write `docs/OPENCLAW_REPORT_2026-04-30_task-oc-018.md` covering:
- Pre-flight fix result: "JELLYFISH" truncation resolved? (Y/N)
- Object types rendered per theme (list them)
- Visual description: blank (outlines only, bold, printable feel?) + colored (distinct palette colors?)
- ASMR render: exit code + what the thumbnail shows
- Image post render: exit code + what the post.png looks like
- Any judgment calls or flags for Claude

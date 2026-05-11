# OpenClaw Task — OC-017: Find-the-Difference Puzzle Generator

Date assigned: 2026-04-30
Depends on: OC-016 (complete) — follow the same generator contract
Audit required: Yes — write audit report at `docs/OPENCLAW_REPORT_2026-04-30_task-oc-017.md` when done

---

## Context

OC-017 adds `scripts/generate-find-diff-assets.mjs` — a deterministic, code-only SVG generator for find-the-difference puzzles. No AI calls. Follows the same 7-file output contract as the maze and matching generators.

The puzzle shows two nearly-identical scenes side by side (or stacked). N programmatic differences are applied to one panel. The solved version draws circles around each difference.

---

## Output contract (must match exactly)

All 7 files written to `output/challenge/generated-activity/<slug>/`:

```
blank.svg      — two panels, no difference markers
blank.png      — rasterized blank (Puppeteer or sharp, same as other generators)
solved.svg     — two panels with circles drawn around each difference location
solved.png     — rasterized solved
puzzle.png     — copy of blank.png (alias, same as other generators)
diff.json      — difference metadata (positions, types) for future animated reveal
activity.json  — standard challenge metadata
```

---

## Layout

Use a **stacked** layout (top = original, bottom = modified). Stacked is preferable to side-by-side for portrait video — panels are larger and differences are more visible at thumbnail scale.

Recommended canvas: **1080×1500** (matches image post dimensions — will also be used later by OC-018 for coloring, so consistent canvas sizes help).

Layout within canvas:
- **Label strip (top):** "SPOT THE DIFFERENCES" — ~60px tall, centered, Fredoka or Arial Black, theme accent color
- **Top panel (original):** x=40, y=80, w=1000, h=640
- **Divider label:** "↓ FIND [N] DIFFERENCES ↓" or a thin line — ~60px at y=740
- **Bottom panel (modified):** x=40, y=820, w=1000, h=640

Bottom panel is where differences are applied. Solved circles are drawn on the bottom panel only.

---

## Scene design

Scenes are composed of **themed SVG objects** — simple geometric shapes arranged in a grid of slots.

### Slot model

Divide each panel into a **4×3 grid of object slots** (12 slots, ~250×213px each). Each slot holds 0 or 1 object. Objects are drawn centered in their slot.

Each slot object has:
```javascript
{
  type: 'fish' | 'bubble' | 'shell' | 'coral' | ...,  // from theme pool
  x: Number,        // slot center x
  y: Number,        // slot center y
  size: Number,     // base size (e.g. 80)
  color: String,    // hex fill
  rotation: Number, // degrees
  visible: Boolean, // false = slot is empty
}
```

Populate slots by shuffling a theme-specific object pool (seeded PRNG), then placing one object per slot. Leave ~2 slots empty (visible: false) so the scenes don't feel overcrowded.

### Theme object pools

Define drawing functions for each theme family. Keep shapes simple — circles, ellipses, polygons, and basic SVG paths. The goal is: recognizable at 80–120px, clearly distinct from other objects in the same theme.

**Ocean** (use existing `ocean` family): fish (oval body + triangle tail), bubble (circle), shell (spiral approximation), crab (body + legs), coral (branching rect stack), starfish (5-pointed star), seahorse (simple path)

**Animals/Pets** (use `animals` family): dog face (circle + ear triangles), cat face (circle + pointed ears), paw print, bone, ball, house shape, collar

**Space** (use `space` family): rocket (rect + triangle top + fins), planet (circle + ellipse ring), star (4- or 5-pointed), moon (crescent via two circles), alien face (oval + eyes), comet (circle + trail lines)

Add at least 6 object types per theme. Use the same `resolveThemeFamily()` mapping as `generate-matching-assets.mjs` and `generate-wordsearch-assets.mjs`.

---

## Difficulty tiers

| Tier | Differences | Grid |
|------|-------------|------|
| easy | 3 | 4×3 |
| medium | 5 | 4×3 |
| hard | 7 | 4×3 |
| difficult | 9 | 4×3 (dense) |
| extreme | 12 | 4×3 (all slots filled) |

CLI default: `--difficulty medium` (5 differences).

---

## Difference types

Apply exactly N differences to the bottom panel (right/modified scene). Each difference targets one slot object:

| Type | What changes |
|------|-------------|
| `color_change` | object fill color changes to a different color from a safe palette |
| `remove` | object is removed (visible: false in bottom panel) |
| `add` | empty slot gains an object (visible: false in top, true in bottom) |
| `size_change` | object drawn at 1.5× or 0.6× its normal size |
| `rotation` | object rotated 30–45° relative to top panel |

Rules:
- No two differences in adjacent slots (they'd visually merge)
- Each slot is used at most once
- `color_change` and `size_change` are the most common (easy to see, visually satisfying)
- `remove`/`add` used sparingly — 1 or 2 max per puzzle

Use the seeded PRNG to pick which slots get which difference types.

---

## diff.json contract

```json
{
  "version": 1,
  "puzzleType": "find-diff",
  "diffCount": 5,
  "diffs": [
    {
      "id": 0,
      "type": "color_change",
      "slotIndex": 3,
      "x": 460,
      "y": 1120,
      "radius": 55
    }
  ],
  "panels": {
    "canvasW": 1080,
    "canvasH": 1500,
    "topPanelY": 80,
    "bottomPanelY": 820,
    "panelW": 1000,
    "panelH": 640,
    "offsetX": 40
  }
}
```

`x` and `y` are the center of the difference circle in **canvas coordinates** (not panel-relative). The bottom panel's offsetY is 820, so a slot at panel-relative (200, 150) = canvas (240, 970). This lets a future `FindDiffReveal` component draw circles directly without computing panel offsets.

`radius` is the suggested circle radius for the solved overlay (50–70px depending on object size).

---

## Solved overlay

In `solved.svg`, draw a circle at each `diff.x, diff.y` with `diff.radius`. Style:
- Stroke: `#FF4444` (red), stroke-width 6
- Fill: `rgba(255,68,68,0.10)` (light red tint)
- No text label inside the circle

The circles should be clearly visible but not so large they obscure the image.

---

## activity.json

Follow the exact same shape as `generate-matching-assets.mjs`. Key fields:

```json
{
  "type": "challenge",
  "puzzleType": "find-diff",
  "difficulty": "medium",
  "theme": "Ocean Animals",
  "titleText": "Can you spot all 5 differences?",
  "hookText": "Can you spot all 5 differences?",
  "ctaText": "Tag a kid who found them all!",
  "activityLabel": "FIND THE DIFFERENCES",
  "countdownSec": 17,
  "hookDurationSec": 2.5,
  "holdAfterSec": 12,
  "blankImage": "blank.png",
  "solvedImage": "solved.png",
  "imagePath": "puzzle.png",
  ...
}
```

`titleText` and `hookText` should reference the actual difficulty count:
- easy: "Can you spot all 3 differences?"
- medium: "Can you spot all 5 differences?"
- hard: "Can you spot all 7 differences?"
- etc.

`countdownSec: 17` gives total duration of ~2.5 + 17 + 2 + 12 = **33.5s** — inside the locked 25–35s band.

---

## CLI interface

Match the matching generator's CLI exactly:

```
node scripts/generate-find-diff-assets.mjs \
  [--title "..."] \
  [--theme "Ocean Animals"] \
  [--difficulty medium] \
  [--seed 12345] \
  [--slug custom-slug] \
  [--out-dir path] \
  [--dry-run]
```

`--dry-run` prints resolved theme family, difference count, and slot assignments — writes no files.

---

## Verification

### Dry run
```
node scripts/generate-find-diff-assets.mjs --theme "Ocean Animals" --difficulty medium --dry-run
```
Must print: theme family, pair count, slot assignments, difference types.

### Live generation
```
node scripts/generate-find-diff-assets.mjs --theme "Ocean Animals" --difficulty medium --slug oc-017-ocean-diff-test
```
Must exit 0. All 7 files written to `output/challenge/generated-activity/oc-017-ocean-diff-test/`.

### Challenge reel render
```
node scripts/render-video.mjs --comp ActivityChallenge --challenge output/challenge/generated-activity/oc-017-ocean-diff-test --out output/videos/oc-017-find-diff.mp4
```
Must exit 0. Thumbnail should show the stacked two-panel layout with recognizable themed objects.

### Visual check
- `blank.png`: two identical-looking panels, no circles
- `solved.png`: same panels, N red circles visible on the bottom panel only
- Differences are visually detectable (not trivially obvious, not hidden)

---

## Important constraints

- No AI calls — pure SVG generation, seeded PRNG, deterministic
- Do NOT modify `render-video.mjs`, `ActivityChallenge.jsx`, or any existing generators — this is additive only
- Static reveal is acceptable (same as matching) — animated `FindDiffReveal` is a future follow-up
- `find-diff` falls through to `CHALLENGE_SFX_MAP.default` in `render-video.mjs` — no SFX wiring needed

---

## Audit report

Write `docs/OPENCLAW_REPORT_2026-04-30_task-oc-017.md` covering:
- Object types implemented per theme (list them)
- Difficulty tier verification (dry-run output for easy + hard)
- Visual description of blank vs solved (panel layout, object variety, circle placement)
- Whether both panels look visually distinct enough to be playable
- Challenge reel render exit code
- Any judgment calls or flags for Claude

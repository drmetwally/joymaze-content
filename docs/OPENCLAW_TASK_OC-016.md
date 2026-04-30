# OpenClaw Task — OC-016: Matching Puzzle Generator

Date assigned: 2026-04-30
Depends on: OC-010 through OC-014B (maze generator contract established and proven)
Audit required: Yes — write audit report at `docs/OPENCLAW_REPORT_2026-04-30_task-oc-016.md` when done

---

## Context

The deterministic puzzle pipeline now has a proven contract from the maze generator:

```
output/challenge/generated-activity/<slug>/
  activity.json      — challenge metadata (titleText, hookText, puzzleType, countdownSec, etc.)
  matching.json      — puzzle-specific layout data (pairs, grid, item positions)
  blank.svg         — unsolved puzzle, clean outlines
  blank.png         — rasterized blank
  solved.svg        — solved puzzle, connections/matches drawn
  solved.png        — rasterized solved
  puzzle.png        — the challenge-reel source image (usually blank.svg rendered)
  path.json         — [maze only] solution waypoints
```

OC-016 builds the matching puzzle generator following this same contract. A matching puzzle shows a grid of item cards face-down; the player reveals and matches pairs. The blank image shows all cards face-down, the solved image shows matched pairs connected/highlighted.

---

## Key files to read first

- `scripts/generate-maze-assets.mjs` — read the full maze generator to understand the contract, output structure, difficulty tiers, CLI args, SVG building, and activity.json shape
- `output/challenge/generated-activity/ocean-animals-maze-post-medium/activity.json` — maze activity.json for exact field shape
- `output/challenge/generated-activity/ocean-animals-maze-post-medium/maze.json` — maze matching.json equivalent for layout metadata shape
- `remotion/compositions/ActivityChallenge.jsx` — to understand how the challenge reel consumes activity.json for matching puzzles

---

## Matching puzzle design

### Visual structure
- A grid of cards (e.g. 4×3 = 6 pairs = 12 cards), all face-down in the blank image
- Each card has an icon/illustration and a label (text below the icon)
- The solved image shows the same grid with connecting lines between matched pairs, or matched pairs highlighted in a distinct color

### Matching reveal in the challenge reel
The reveal mechanic for matching is different from maze and word-search:
- **Maze**: animated path draw (waypoints)
- **Word-search**: word highlight rects (wordRects)
- **Matching**: cards flip or highlight in pairs as they are "found"

For the challenge reel, the reveal should probably be a **pair-by-pair highlight sequence** — each match briefly highlights, then stays highlighted. This is architecturally similar to the word-search word-by-word reveal.

If the challenge reel reveal for matching is non-trivial to implement, do the generator first and flag the reveal mechanic as a separate follow-up item.

---

## What to build

### `scripts/generate-matching-assets.mjs`

Follow the maze generator's structure closely. Key sections:

**1. CLI args** — mirror the maze generator args:
- `--title`
- `--theme`
- `--difficulty` (easy / medium / hard / difficult / extreme)
- `--pairs` (optional — override number of pairs; default by difficulty)
- `--slug`
- `--out-dir`
- `--dry-run`

Difficulty tiers for matching (suggested defaults):
```
easy:     4 pairs (4×3 grid)
medium:   6 pairs (4×3 or 6×2)
hard:     8 pairs (4×4)
difficult: 10 pairs (5×4)
extreme:  12 pairs (6×4)
```

**2. Pair generation**
- Use a curated pool of items per theme family (similar to word-search word packs)
- Shuffle and pick N pairs per difficulty
- Each pair = two identical items with different positions in the grid

**3. Layout**
- Grid layout: calculate rows/cols to fit N pairs with minimal empty cells
- Card positions: distribute pairs randomly across grid positions

**4. SVG generation** (blank + solved)
- **blank**: draw all cards face-down (uniform card back design, same pattern on each)
- **solved**: draw all cards face-up with labels visible, and draw connection lines between matching pairs (or highlight matched pairs with a colored border)

**5. Output files**
```
matching.json   — grid dimensions, pair list with positions, card labels, connection lines
activity.json  — identical contract to maze: type='challenge', puzzleType='matching', titleText, hookText, countdownSec, blankImage, solvedImage, etc.
blank.svg + blank.png
solved.svg + solved.png
puzzle.png    — alias for blank.png (challenge reel source)
```

**6. The matching.json shape** should include:
```json
{
  "version": 1,
  "puzzleType": "matching",
  "title": "...",
  "theme": "...",
  "difficulty": "medium",
  "pairs": [
    {
      "id": 0,
      "label": "Dog",
      "iconEmoji": "🐕",
      "positions": [0, 7]   // grid indices of the two cards for this pair
    },
    ...
  ],
  "grid": { "cols": 4, "rows": 3 },
  "connections": [
    { "from": 0, "to": 7, "label": "Dog" },
    ...
  ]
}
```

**7. Hook and challenge metadata**
- `hookText` / `titleText`: same as maze — "Can your kid find all the matches?" or similar
- `ctaText`: "Tag a kid who's faster!"
- `activityLabel`: 'MATCHING'
- `countdownSec`: 15 (same as maze)
- `holdAfterSec`: 12 (same as maze)
- `puzzleType`: 'matching'

**8. SVG card design**
- Card back: a rounded rectangle with a simple pattern (dots, stars, or a small logo) — uniform across all cards in blank
- Card face (solved): rounded rectangle with the item emoji/icon centered, label text below
- Matched connection: a colored line between the two card centers in the solved image, or highlighted card borders in brand orange/yellow

---

## Verification

After building the generator, run:
```
node scripts/generate-matching-assets.mjs --theme "Ocean Animals" --difficulty medium
```

Then verify the output folder contains all required files. Run a challenge reel render:
```
node scripts/render-video.mjs --comp ActivityChallenge --challenge output/challenge/generated-activity/<matching-slug> --out output/videos/oc-016-matching-challenge.mp4
```

The render must exit 0. Whether the reveal animation works for matching depends on what `ActivityChallenge` currently supports — flag if the reveal feels wrong or non-existent for matching type.

---

## Audit report

Write `docs/OPENCLAW_REPORT_2026-04-30_task-oc-016.md` covering:
- Generator structure and difficulty tier defaults
- What the matching.json and activity.json contracts look like
- Render exit code and any reveal mechanic observations
- Any flags for Claude (especially the reveal animation status for matching)

---

## Reference: maze generator contract for comparison

The maze generator writes this exact activity.json shape — matching should match it field-for-field where applicable:
```json
{
  "type": "challenge",
  "puzzleType": "matching",
  "shape": "rectangle",
  "difficulty": "medium",
  "theme": "Ocean Animals",
  "titleText": "...",
  "hookText": "...",
  "ctaText": "...",
  "activityLabel": "MATCHING",
  "countdownSec": 15,
  "hookDurationSec": 2.5,
  "holdAfterSec": 12,
  "imagePath": "puzzle.png",
  "blankImage": "blank.png",
  "solvedImage": "solved.png",
  "showJoyo": true,
  "showBrandWatermark": false,
  "sourceFolder": "output/challenge/generated-activity/<slug>"
}
```

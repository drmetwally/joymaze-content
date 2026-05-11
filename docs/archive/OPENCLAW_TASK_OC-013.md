# OpenClaw Task — OC-013: Challenge Reel Stickers + Word-Search Footer Fix

Date assigned: 2026-04-30
Depends on: OC-012 (challenge reel visual tuning) — complete
Audit required: Yes — write audit report at `docs/OPENCLAW_REPORT_2026-04-30_task-oc-013.md` when done

---

## Context

Two pipelines use the same raw puzzle assets (`blank.png`, `solved.png`):
- **Image post** (`scripts/lib/puzzle-post-renderer.mjs` + Puppeteer) — renders the static 1000×1500 PNG for social media
- **Challenge reel** (`remotion/compositions/ActivityChallenge.jsx` + Remotion) — renders the animated solve video

The START/FINISH stickers were wired into the image post renderer in OC-011. They were never added to the challenge reel — that is the gap.

The "FIND THESE WORDS" label was added to the word-search SVG generator in OC-011 to improve the image post. But that baked it into `blank.png`/`puzzle.png`, so it now appears inside the challenge reel video as a visible footer tag that conflicts with the word list clue display.

---

## Three fixes in scope

### Fix 1 — Maze challenge reel: START / FINISH sticker overlays

**Problem:** The maze challenge reel shows no entry/exit markers. The player has no visual cue for where to start or where the goal is.

**Where to make the change:**
- `scripts/render-video.mjs` — `challengeJsonToProps()` function
- `remotion/compositions/ActivityChallenge.jsx` — the composition that renders the puzzle video

**What to build:**

Step A — In `challengeJsonToProps()`, when `puzzleType === 'maze'`, read `maze.json` from the challenge folder. Extract:
- `layout.offsetX`, `layout.offsetY`, `layout.mazeW`, `layout.mazeH`, `layout.cropPad` (or derive cropPad from offsetX as the border)
- `entry` cell object (typically `{ row: 0, col: N }`) — this is the start
- `exit` cell object (typically `{ row: M, col: N }`) — this is the finish
- Grid dimensions: `cols`, `rows`

Compute normalized fractions for where the sticker should sit inside the fitted maze image area:
```javascript
// cropPad = border around maze within the SVG
const cropX = layout.offsetX - cropPad;
const cropY = layout.offsetY - cropPad;
const cropW = layout.mazeW + cropPad * 2;
const cropH = layout.mazeH + cropPad * 2;

// Cell size in SVG units
const cellW = layout.mazeW / cols;
const cellH = layout.mazeH / rows;

// Center of entry cell in crop-relative coords
const startFractionX = (layout.offsetX + entry.col * cellW + cellW / 2 - cropX) / cropW;
const startFractionY = (layout.offsetY + entry.row * cellH + cellH / 2 - cropY) / cropH;

// Center of exit cell in crop-relative coords
const finishFractionX = (layout.offsetX + exit.col * cellW + cellW / 2 - cropX) / cropW;
const finishFractionY = (layout.offsetY + exit.row * cellH + cellH / 2 - cropY) / cropH;
```

Pass `mazeStartFraction: { x, y }` and `mazeFinishFraction: { x, y }` through the props object.

Step B — In `ActivityChallenge.jsx`, when `puzzleType === 'maze'` and `mazeStartFraction` / `mazeFinishFraction` props are present, render two badge overlays positioned over the puzzle image area:

- **START badge:** green circle or rounded pill with "▶ START" text. Position: `mazeStartFraction` mapped to the rendered image bounds within the composition.
- **FINISH badge:** gold/yellow star or rounded pill with "★ FINISH" text. Position: `mazeFinishFraction` mapped to the rendered image bounds.

Badge style should match the image post sticker aesthetic: rounded corners, emoji or icon, readable at video scale. Keep them visually modest — they should point to the maze location, not dominate the frame. Roughly 60–80px tall at 1080px height.

Both badges should be visible during the **countdown phase** (so the viewer knows where to solve from) and remain visible during the **solve reveal phase** (so the payoff is clear).

---

### Fix 2 — Word-search: remove "FIND THESE WORDS" footer from raw SVG assets

**Problem:** The label `FIND THESE WORDS` with a divider line was added to the SVG output in OC-011. This label is correct in the image post (where it labels the word list section). But because it is baked into the SVG, it also appears in `blank.png`/`puzzle.png`, which are the assets the challenge reel uses. In the reel video it reads as a stray footer tag over the clue words.

**Where to make the change:**
- `scripts/generate-wordsearch-assets.mjs` — remove the `FIND THESE WORDS` label + divider line from the SVG generation
- `scripts/lib/puzzle-post-renderer.mjs` — add the label as an HTML element in the word list zone instead

**What to change in `generate-wordsearch-assets.mjs`:**
Find the SVG section that renders the `FIND THESE WORDS` label and the thin divider line above the word columns. Remove those two elements from the SVG. The word columns themselves (the actual clue words in the grid below) should remain — only remove the label header and divider.

**What to change in `puzzle-post-renderer.mjs`:**
In the HTML template, above the word list section (which is currently an `<img>` tag showing the bottom portion of the SVG, or rendered inline), add a small `<div>` with:
- Text: `FIND THESE WORDS`
- Style: small caps or slightly smaller font than the clue words, centered, muted color matching the theme accent, with a thin `border-top` or `<hr>` style divider above it

If the word list is currently entirely SVG-rendered (the SVG image shows both grid and word list), then the cleanest approach is: keep rendering the full SVG image, but overlay a narrow HTML band at the word list zone entry point. Check how the renderer currently handles the word list zone before deciding.

---

### Fix 3 — Word-search challenge reel: theme sticker

**Problem:** The maze gets START/FINISH stickers. The word-search reel has nothing decorative to give it visual personality. A single theme-appropriate emoji badge in the top-right corner of the puzzle frame would match the image post aesthetic and give the reel more brand feel.

**Where to make the change:**
- `remotion/compositions/ActivityChallenge.jsx`

**What to build:**
When `puzzleType === 'wordsearch'`, render a single emoji badge in the top-right corner of the puzzle image area. Use the same theme family detection the image post renderer uses — check `scripts/lib/puzzle-post-renderer.mjs` for the `getThemeConfig()` or equivalent function that maps theme strings to emoji sets. Pick the primary emoji from that config.

The badge should be:
- Positioned: top-right corner of the puzzle image frame, ~16px inset from the edge
- Style: white or translucent circular backing, 56–70px diameter at 1080 height, emoji centered
- Present during both countdown and solve phases

The theme string is already available in the challenge activity.json as `theme`. Pass it through props if it isn't already there.

---

## Important constraint

Do NOT modify `puzzle-post-renderer.mjs` in a way that breaks the existing image post renders. The image post pipeline (maze and word-search) was just approved and is production-ready. Any changes to the renderer must keep the existing post output visually identical or better.

Run the following after any renderer change:
```
node scripts/generate-puzzle-image-post.mjs --type maze --theme "Ocean Animals" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type wordsearch --theme "Dogs and Poodles" --difficulty medium
```
Both must exit 0 and the word list zone must still be readable.

---

## Regenerate fresh puzzle folders for testing

The existing `ocean-animals-maze-post-medium` and `dinosaurs-wordsearch-post-easy` folders have the old SVGs with the baked-in label. After Fix 2, regenerate fresh challenge folders:
```
node scripts/generate-wordsearch-assets.mjs --title "Dogs and Poodles Word Search" --theme "Dogs and Poodles" --difficulty medium --slug oc-013-wordsearch-test
```
Then render the challenge reel against that new folder to confirm the label is gone.

---

## Verification renders

Run both:
```
node scripts/render-video.mjs --comp ActivityChallenge --challenge output/challenge/generated-activity/ocean-animals-maze-post-medium --out output/videos/oc-013-maze.mp4
node scripts/render-video.mjs --comp ActivityChallenge --challenge output/challenge/generated-activity/oc-013-wordsearch-test --out output/videos/oc-013-wordsearch.mp4
```

Both must exit 0. Thumbnails should show:
- Maze: START badge visible at maze entry, FINISH badge visible at maze exit
- Word-search: theme emoji sticker visible top-right, NO "FIND THESE WORDS" footer text in the puzzle image area

---

## Audit report

Write `docs/OPENCLAW_REPORT_2026-04-30_task-oc-013.md` covering:
- What changed in each of the 3 fixes
- Whether the image post regression check passed (both post renders still clean)
- Render evidence for maze (sticker positions in thumbnail) and word-search (footer absent, theme sticker present)
- Any judgment calls or flags for Claude

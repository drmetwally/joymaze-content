# OpenClaw Diagnostic Report — Challenge Reel Solve Reveal
Date: 2026-04-29

## Summary

Both the word-search and maze generators produce correct `solved.png` outputs.
The solve reveal code in `ActivityChallenge.jsx` / `SolveReveal` is fully implemented.
Two bugs prevent the solve from being visible: a timing field and a missing file.

---

## Bug 1 — `holdAfterSec: 2.5` collapses the solve phase (both generators)

**Location:** `generate-wordsearch-assets.mjs` and `generate-maze-assets.mjs`
Both write `"holdAfterSec": 2.5` into `activity.json`.

**What this field controls:**
In `ActivityChallenge.jsx`:
```js
const solveFrames = Math.max(1, Math.round(holdAfterSec * fps));  // fps = 30
```
`solveFrames` is the TOTAL duration of `<SolveReveal>`. With `holdAfterSec: 2.5` → 75 frames.

**Word-search impact:**
`WordSearchReveal` divides `durationFrames` evenly across all words:
```js
const framesPerWord = durationFrames / wordCount;  // 75 / 8 = 9.4 frames
```
Each word gets 9.4 frames. But `EXPAND_FRAMES = 14` (the highlight sweep animation).
Result: every word highlight is cut off mid-sweep — reveal appears to not fire at all.

**Maze impact:**
Even with WipeReveal fallback (see Bug 2), `holdAfterSec: 2.5` gives only 75 frames
for the entire wipe — barely perceptible, looks like a flash.

**Fix — update both generators:**

`generate-wordsearch-assets.mjs`: set `holdAfterSec: 15` in the emitted `activity.json`
- At 15s → `framesPerWord = 450 / 8 = 56` frames per word → 14 expand + 42 hold ✅

`generate-maze-assets.mjs`: set `holdAfterSec: 12` in the emitted `activity.json`
- 12s gives the MazeSolverReveal / WipeReveal enough time for a satisfying draw ✅

Both values should be hardcoded constants at the top of their respective scripts:
```js
const SOLVE_DURATION_SEC = 15;  // wordsearch
const SOLVE_DURATION_SEC = 12;  // maze
```

---

## Bug 2 — Maze generator does not emit `path.json` (maze only)

**Location:** `generate-maze-assets.mjs`

**What happens without `path.json`:**
In `render-video.mjs` (challenge path, line ~430):
```js
const pathData = JSON.parse(await fs.readFile(path.resolve(activityDir, 'path.json'), 'utf-8'));
pathWaypoints = pathData.waypoints.map(p => ({ x: offsetX + p.x * renderW, y: ... }));
// catch: pathWaypoints stays null
```
In `SolveReveal` (ActivityChallenge.jsx line 192):
```js
if (pathWaypoints?.length > 1 && (normalizedType === 'maze' || normalizedType === 'tracing')) {
  return <MazeSolverReveal ... />;
}
// pathWaypoints is null → falls through to WipeReveal
```
Without `path.json`, the animated pencil-draw (`MazeSolverReveal`) never fires.
It falls through to a left-to-right static wipe — still technically a reveal, but not
the animated path draw that was designed and built.

**Required `path.json` schema:**
```json
{
  "waypoints": [
    { "x": 0.123, "y": 0.045 },
    { "x": 0.134, "y": 0.045 },
    ...
  ],
  "pathColor": "#22BB44"
}
```
Waypoints are **normalized 0–1 coordinates** relative to the image (blank.png) dimensions.
`render-video.mjs` scales them to video pixel space at render time, accounting for letterboxing.

**Fix:**
`generate-maze-assets.mjs` already has the solution path in `maze.json`
(the `solution` array of cell coordinates).
After generating the maze, add a `path.json` export step:

1. Read each cell in `maze.json.solution` (e.g. `[{row, col}, ...]`)
2. Compute the pixel center of each cell:
   ```
   x_px = margin + col * cellSize + cellSize / 2
   y_px = margin + row * cellSize + cellSize / 2
   ```
3. Normalize to 0–1:
   ```
   x = x_px / imageWidth   (imageWidth = 1700)
   y = y_px / imageHeight   (imageHeight = 2200)
   ```
4. Write `path.json` alongside the other outputs.

**Waypoint density:** aim for 200–500 waypoints. The solution path visits each cell center.
For a 12×9 medium maze that's already a good density (~108 cells). If the grid is coarse,
interpolate 2–3 sub-points per cell edge to smooth the pencil animation.

---

## What is already correct — do not change

- `solved.png` — both generators produce it from the puzzle structure. No AI needed. ✅
- `wordsearch.json` — the `rects` array (normalized `{x1,y1,x2,y2}`) is loaded by `render-video.mjs`
  and passed to `WordSearchReveal` as `wordRects`. Format is correct. ✅
- `WordSearchReveal` — fires correctly when `wordRects.length > 0`. ✅
- `SolveReveal` routing — correctly dispatches to `WordSearchReveal` / `MazeSolverReveal` /
  `WipeReveal` based on `puzzleType` and presence of data. Logic is sound. ✅
- `ActivityChallenge` composition structure — `<Sequence from={solveStart}>` is wired correctly. ✅

---

## Minimal change set

| File | Change |
|------|--------|
| `scripts/generate-wordsearch-assets.mjs` | `holdAfterSec: 15` in emitted `activity.json` |
| `scripts/generate-maze-assets.mjs` | `holdAfterSec: 12` in emitted `activity.json` |
| `scripts/generate-maze-assets.mjs` | emit `path.json` with normalized waypoints from `maze.json.solution` |

No changes needed to any Remotion composition, render-video.mjs, or the solver components.

---

## Verification steps after fix

1. Run `node scripts/generate-maze-assets.mjs --dry-run` — confirm `path.json` appears in output
2. Run `node scripts/generate-wordsearch-assets.mjs` → generate fresh folder
3. Render both: `npm run animate:challenge -- --challenge <folder>`
4. Word-search: confirm 8 highlight rects draw in sequence over ~13s, then cross-fade to solved.png
5. Maze: confirm pencil cursor traces the solution path over ~10s, then cross-fades to solved.png
6. Check `Path pts :` line in render console — if it shows waypoint count, MazeSolverReveal is active

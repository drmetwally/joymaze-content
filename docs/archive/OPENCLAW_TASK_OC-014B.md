# OpenClaw Task — OC-014B: ASMR Generator Integration (Maze-First)

Date assigned: 2026-04-30
Depends on: OC-013 (complete), OC-014B seam map (`docs/OPENCLAW_OC-014B_SEAM_MAP_2026-04-30.md`)
Audit required: Yes — write audit report at `docs/OPENCLAW_REPORT_2026-04-30_task-oc-014b.md` when done

---

## Context

The new deterministic puzzle pipeline (maze generator → image post wrapper → challenge reel) is now fully wired. The ASMR lane is a separate older system that still assumes manually-dropped assets in `output/asmr/<slug>/` folders.

The goal of OC-014B is to bridge these two systems so the ASMR lane can render directly from a generated maze folder — no manual asset dropping required.

**Product direction (locked):**
- Maze ASMR: integrate with the generator pipeline — this is the primary goal
- Coloring ASMR: normalize filename contract only (no generator integration yet — that comes with OC-018)
- Word-search ASMR: de-prioritize — remove from active rotation, keep code dormant

---

## Key files

- `scripts/generate-asmr-video.mjs` — ASMR brief + renderer entry point
- `scripts/render-video.mjs` — generic render dispatch (`asmrJsonToProps()` for ASMR, `challengeJsonToProps()` for challenge reels)
- `remotion/compositions/AsmrReveal.jsx` — Remotion composition for ASMR
- `scripts/generate-maze-assets.mjs` — maze generator (writes to `output/challenge/generated-activity/<slug>/`)
- `scripts/generate-asmr-brief.mjs` — brief generator (still includes word-search/dotdot rotation — fix in scope)

---

## Three fixes in scope

### Fix 1 — Maze filename normalization

**Problem:** `generate-asmr-video.mjs` resolves the maze asset pair as `['maze.png', 'solved.png']` (lines 1105, 1261, 1321). The new deterministic maze generator writes `blank.png`, not `maze.png`. The ASMR renderer will silently fail to find the blank maze image from any generated folder.

**What to change in `generate-asmr-video.mjs`:**
In all three places where the maze file pair is resolved (`['maze.png', 'solved.png']`), update to prefer `blank.png` with `maze.png` as a legacy fallback:

```javascript
// prefer new generator contract; fall back to legacy name for old manual folders
const blankFile = await fileExists(path.join(asmrDir, 'blank.png')) ? 'blank.png' : 'maze.png';
// [then use blankFile instead of hardcoded 'maze.png']
```

Use the same fallback pattern wherever the maze pair is constructed. Do not remove `maze.png` support — old manual folders may still use it.

---

### Fix 2 — Maze ASMR bridge: render directly from a generated folder

**Problem:** The ASMR lane expects `output/asmr/<slug>/activity.json` as its entry point. The new maze generator writes to `output/challenge/generated-activity/<slug>/activity.json`. These are separate folder trees with no bridge.

**What to build:**

Add a `--challenge-folder <path>` flag to `generate-asmr-video.mjs` (or to `render-video.mjs` — choose the cleaner seam) that:

1. Accepts a generated maze folder path (e.g. `output/challenge/generated-activity/ocean-animals-maze-post-medium`)
2. Reads `activity.json` from that folder
3. Resolves `blank.png` (Fix 1 naming), `solved.png`, and `path.json` from the same folder
4. Builds the ASMR render props and passes them to `AsmrReveal` with `revealType: 'maze'`
5. Writes the output video to `output/videos/oc-014b-maze-asmr.mp4` (or the standard ASMR output path)

**The ASMR composition needs `revealType: 'maze'` and a valid `path.json` waypoints array to activate the path-drawing animation.** Both are already present in the generated maze folder — the challenge reel already reads them successfully via `challengeJsonToProps()`. Mirror that logic for the ASMR path.

**Check `render-video.mjs` `asmrJsonToProps()` for the current ASMR prop shape.** The composition expects:
- `blankImagePath`
- `solvedImagePath`
- `revealType` (`'maze'` | `'coloring'`)
- `pathWaypoints` (for maze path animation)

Do not create a new prop schema — reuse the existing `asmrJsonToProps()` output shape. If the generated folder has fields the ASMR path doesn't yet read (e.g. `path.json`), extend `asmrJsonToProps()` to read it.

**Proof of success:** The following command must exit 0 and produce a valid `.mp4`:
```
node scripts/render-video.mjs --comp AsmrReveal --challenge output/challenge/generated-activity/ocean-animals-maze-post-medium --out output/videos/oc-014b-maze-asmr.mp4
```
Or equivalent via `generate-asmr-video.mjs --challenge-folder ...`. Choose whichever is cleaner.

---

### Fix 3 — Remove word-search from ASMR brief rotation

**Problem:** `generate-asmr-brief.mjs` line 44 rotates: `['coloring', 'maze', 'coloring', 'wordsearch', 'dotdot', 'maze']`. Word-search ASMR is no longer a product priority — challenge reels are the correct home for word-search solving.

**What to change in `generate-asmr-brief.mjs`:**
Remove `'wordsearch'` and `'dotdot'` from the rotation array. New rotation: `['coloring', 'maze', 'coloring', 'maze']` (or similar — use your judgment, but the two active types are `coloring` and `maze` only).

Keep all word-search and dot-to-dot rendering code in place — do not delete it. Just stop generating new briefs for those types.

---

## Out of scope for this task

- Coloring generator integration — no deterministic coloring generator exists yet. That's OC-018 territory.
- `colored.png` vs `solved.png` naming for coloring — document the correct canonical name (`colored.png`) in the audit report if you encounter it, but do not change coloring rendering behavior. Leave for OC-018.
- Word-search ASMR code deletion — keep code dormant, just stop scheduling it.

---

## Important constraint

Do NOT break the existing ASMR coloring lane. `generate-asmr-video.mjs` coloring renders (manual folder drop → `blank.png` + `colored.png`) are already live and validated. Any changes must leave coloring ASMR working.

Run after any changes to `generate-asmr-video.mjs`:
```
node --check scripts/generate-asmr-video.mjs
node --check scripts/render-video.mjs
```

---

## Verification render

After completing all three fixes, run:
```
node scripts/render-video.mjs --comp AsmrReveal --challenge output/challenge/generated-activity/ocean-animals-maze-post-medium --out output/videos/oc-014b-maze-asmr.mp4
```

Must exit 0. Thumbnail should show the maze blank state. Report should confirm path animation is active (path.json loaded, waypoints count > 0).

If `ocean-animals-maze-post-medium` does not exist, regenerate it first:
```
node scripts/generate-maze-assets.mjs --theme "Ocean Animals" --difficulty medium --slug ocean-animals-maze-post-medium
```

---

## Audit report

Write `docs/OPENCLAW_REPORT_2026-04-30_task-oc-014b.md` covering:
- Fix 1: where the `maze.png` → `blank.png` fallback was added (line numbers)
- Fix 2: which entry point accepts the generated folder, what props are built, render exit code + waypoints count
- Fix 3: new ASMR brief rotation after removing word-search/dotdot
- Whether coloring ASMR was left untouched (syntax check exit code)
- Any judgment calls or flags for Claude

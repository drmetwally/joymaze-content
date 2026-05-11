# OpenClaw Audit Report — OC-014B

Date: 2026-04-30
Status: Ready for Claude audit
Task brief: `docs/OPENCLAW_TASK_OC-014B.md`

## Scope completed

Implemented the three scoped OC-014B fixes only:
1. maze `blank.png` fallback support in the legacy ASMR generator
2. maze-first generated-folder bridge so `AsmrReveal` can render directly from `output/challenge/generated-activity/<slug>`
3. ASMR brief rotation cleanup so only `coloring` and `maze` remain active

### Files changed for this task
- `scripts/generate-asmr-video.mjs`
- `scripts/render-video.mjs`
- `scripts/generate-asmr-brief.mjs`
- `docs/AGENT_LOG.md`

## What changed

### Fix 1 — Maze filename normalization in `generate-asmr-video.mjs`
I added an async `fileExists()` helper plus `resolveRevealFiles(baseDir, revealType)` so the maze ASMR path now prefers `blank.png` and falls back to legacy `maze.png`. This was applied in all three places the reveal asset pair is resolved: the Remotion render path, the reveal input validation path, and the legacy frame-generation path. I also updated the `initAsmr()` maze instructions to advertise `blank.png` as the preferred blank maze filename while explicitly noting that old manual folders may still use `maze.png`.

### Fix 2 — Generated-folder bridge in `render-video.mjs`
I kept the bridge at the cleaner shared seam: `render-video.mjs`. `loadInputProps()` now routes `--challenge <generated-folder>` into `activityJsonToProps()` when `--comp AsmrReveal` is selected, instead of forcing the challenge-props path.

Inside `activityJsonToProps()` I extended the ASMR props loader so it can consume challenge activity metadata safely:
- derives `revealType` from `activity.revealType ?? activity.puzzleType ?? activity.type`
- resolves maze blank image as `blank.png` first, then legacy `maze.png`
- accepts challenge-folder `blankImage` / `solvedImage` fields directly
- reuses the existing ASMR prop shape (`blankImagePath`, `solvedImagePath`, `revealType`, `pathWaypoints`, etc.)
- reuses `path.json` loading so maze path animation stays active
- uses `countdownSec` as the fallback reveal duration when challenge folders do not provide a dedicated ASMR reveal duration

This means the maze generator output can now feed `AsmrReveal` directly with no copy step.

### Fix 3 — ASMR brief rotation cleanup
I changed `generate-asmr-brief.mjs` default rotation from:
- `['coloring', 'maze', 'coloring', 'wordsearch', 'dotdot', 'maze']`

to:
- `['coloring', 'maze', 'coloring', 'maze']`

This keeps word-search and dot-to-dot support dormant in code while removing them from active ASMR brief generation.

## Verification

### Syntax checks
Commands:
- `node --check scripts/generate-asmr-video.mjs`
- `node --check scripts/render-video.mjs`
- `node --check scripts/generate-asmr-brief.mjs`

Result:
- all three exited `0`

### Maze-first proof render
Command:
`node scripts/render-video.mjs --comp AsmrReveal --challenge output/challenge/generated-activity/ocean-animals-maze-post-medium --out output/videos/oc-014b-maze-asmr.mp4`

Result:
- exit code `0`
- output: `output/videos/oc-014b-maze-asmr.mp4`
- thumbnail: `output/videos/oc-014b-maze-asmr-thumb.jpg`
- path animation active: `52 waypoints (solver active)`
- resolved asset pair:
  - `Blank       : output/challenge/generated-activity/ocean-animals-maze-post-medium/blank.png`
  - `Solved      : output/challenge/generated-activity/ocean-animals-maze-post-medium/solved.png`

### What I could verify visually
From the generated thumbnail and render logs, I could verify:
- the ASMR lane really consumed the generated maze folder directly
- the blank maze image loaded from `blank.png`, not legacy `maze.png`
- the pencil/path animation was active because `path.json` loaded into `pathWaypoints`
- the render produced a valid output without touching the manual `output/asmr/...` folder path

## Coloring safety check
Coloring behavior was left intentionally unchanged:
- `generate-asmr-video.mjs` still uses `blank.png` + `colored.png` for coloring
- no coloring render logic was altered beyond shared helper extraction
- the task's coloring integration and contract cleanup remain deferred to OC-018

## Judgment calls / flags for Claude

1. I chose the bridge seam in `render-video.mjs`, not `generate-asmr-video.mjs`, because it reuses the existing shared Remotion entry point and lets `AsmrReveal` consume generated folders directly with less duplication.
2. For challenge-folder timing, I mapped missing `revealDurationSec` to `countdownSec` so generated maze folders render with a sensible nonzero reveal duration even though challenge activity metadata was authored for the challenge reel lane, not ASMR.
3. I also quietly fixed a real latent issue inside `activityJsonToProps()` by hoisting `VW` / `VH` to function scope, since the word-search and dot-to-dot branches referenced them outside the original path-loading block. This did not change the active OC-014B product path, but it prevents stale runtime errors in dormant ASMR branches.
4. Coloring naming still needs an eventual contract decision across the broader pipeline. This task kept the current `colored.png` behavior intact and did not try to unify coloring around `solved.png`.

## Overall assessment

OC-014B now proves the intended maze-first integration path: deterministic maze generator output can render directly through the ASMR Remotion lane, with path waypoints active and no manual asset-drop step. The ASMR brief system is also aligned back to the actual product priorities by rotating only maze and coloring.

# TASK-OC-007 — Deterministic Maze Asset Factory

## Goal

Replace reverse-extraction as the preferred maze asset path with first-party deterministic generation.

Build a generator that creates:
- solvable maze structure
- structured metadata
- render-ready blank/solved assets
- compatibility artifacts for current `ActivityChallenge` rendering

This is the first asset-factory task in the locked sequence:
1. Maze
2. Word Search
3. Matching
4. Find the Difference
5. Coloring
6. Tracing / Dot-to-Dot

---

## Why now

Challenge/ASMR puzzle lanes should not depend on AI image generation for the actual puzzle substrate. Maze is the best first target because the repo already has strong downstream support:
- `remotion/compositions/ActivityChallenge.jsx`
- `remotion/components/MazeSolverReveal.jsx`
- `scripts/extract-maze-path.mjs` (legacy/fallback reference)

The new preferred path should become:
1. generate maze structure first
2. render assets from that structure
3. animate from generated path metadata directly

---

## Key product constraints

### Solvability
- Every generated maze must have a valid entrance→exit solution.
- Solution path must be emitted directly from source structure, not reverse-extracted from raster output.

### Shapes
BookBolt-style shape variety matters.
Support must be designed in from the start.

Phase 1 implementation may begin with:
- `square`
- `rectangle`

But the contract must reserve first-class shape support for later:
- `circle`
- masked/custom shapes

### Quality
Use the maze reference library for visual benchmarking only:
- `D:\Books and Publishing\Mega Maze (5000 pages)-20240708T093655Z-001`

Reference dimensions to inspect:
- margin discipline
- line thickness
- path clarity
- branching density
- difficulty feel
- visual cleanliness at social-video scale

Do **not** make the reference library the production dependency.

---

## Deliverables

Create a new script:
- `scripts/generate-maze-assets.mjs`

Add npm scripts:
- `maze:generate`
- `maze:generate:dry`

Generator output should produce a render-ready folder, ideally under:
- `output/challenge/generated-activity/<slug>/`

Minimum output files:
- `activity.json`
- `maze.json`
- `path.json`
- `blank.svg`
- `solved.svg`
- `blank.png`
- `solved.png`

---

## Required output contracts

### `maze.json`
Must contain enough source-of-truth structure to regenerate or inspect the maze.
At minimum:
- `seed`
- `shape`
- `difficulty`
- `rows`
- `cols`
- `entrance`
- `exit`
- wall / adjacency representation
- full ordered solution path
- optional quality metrics like path length / dead-end count

### `path.json`
Compatibility artifact for current reveal pipeline.
Should contain ordered waypoints suitable for `MazeSolverReveal` / `ActivityChallenge`.

### `activity.json`
Must be compatible with the current challenge pipeline and should point at generated assets without manual editing.

---

## Implementation guidance

### Preferred architecture
- deterministic maze generation in code
- SVG as the drawing/render format where useful
- PNG exports for existing pipeline compatibility
- keep existing extraction scripts untouched as fallback utilities

### Phase 1 scope
- rectangular/square maze generation
- single clean visual style
- one render-ready export path
- one end-to-end validation through current challenge renderer

### Phase 2 scope
- circular/shaped mazes
- more styling variants
- scheduler/brief integration if desired

---

## Validation

Success criterion for Phase 1:
- a freshly generated maze folder renders through the existing challenge reel pipeline
- no manual art editing required
- no reverse extraction required
- generated `path.json` drives maze reveal correctly

Suggested validation path:
1. generate maze assets
2. feed folder into existing challenge render path
3. render `ActivityChallenge`
4. confirm blank/solved/path alignment visually

---

## Notes for future agents

- Keep `scripts/extract-maze-path.mjs` as a fallback and debugging reference.
- Do not refactor cross-file puzzle renderers unnecessarily in this first pass.
- Minimize blast radius: improve asset generation first, not the whole challenge system at once.
- If a later shaped-maze implementation needs a different topology model, preserve `maze.json` contract stability as much as possible.

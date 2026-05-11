# Puzzle Asset Factory Plan — 2026-04-29

## Why this exists

JoyMaze challenge and ASMR lanes need scalable asset production, but AI image generation is not reliable for solvable puzzle substrates like mazes, word-searches, matching boards, tracing paths, or find-the-difference masters. The right direction is deterministic puzzle generation first, then rendering/export.

This document captures the agreed plan so Claude, OpenClaw, Codex, or future agents can continue without reopening the strategy debate.

---

## Locked strategic decision

For puzzle-driven lanes, **do not rely on Imagen/Gemini-style image generation for the actual puzzle substrate**.

Use:
- deterministic generator logic for puzzle structure
- structured asset contracts (JSON + SVG/PNG exports)
- existing Remotion renderers for reveal animation
- AI only for optional decoration, framing, wrappers, or non-functional art

This applies especially to:
- Maze
- Word Search
- Matching
- Find the Difference
- Coloring
- Tracing
- Dot-to-Dot

Story and animal lanes remain valid AI-assisted lanes. Challenge and ASMR should become deterministic asset-factory lanes.

---

## Agreed build order

Build asset factories in this sequence:

1. Maze
2. Word Search
3. Matching
4. Find the Difference
5. Coloring
6. Tracing / Dot-to-Dot

Rationale:
- Maze has the cleanest solvability contract and strongest current renderer support.
- Word Search already has a reveal path and clear metadata contract.
- Matching and Find the Difference are adjacent structured-visual puzzle types.
- Coloring, Tracing, and Dot-to-Dot can then reuse lessons from SVG/line-art pipeline work.

---

## Existing repo seams we should build on

Current repo already has good downstream reveal/render infrastructure:

### Extraction utilities
- `scripts/extract-maze-path.mjs`
- `scripts/extract-wordsearch-path.mjs`
- `scripts/extract-dotdot-path.mjs`

### Render / reveal components
- `remotion/compositions/ActivityChallenge.jsx`
- `remotion/components/MazeSolverReveal.jsx`
- `remotion/components/WordSearchReveal.jsx`
- `remotion/components/DotToDoReveal.jsx`
- `remotion/compositions/AsmrReveal.jsx`

### Current direction to preserve
Today the system often works as:
1. make images externally
2. reverse-extract structure from images
3. animate solution

Target direction:
1. generate structure first
2. render images from structure
3. animate from the original structure directly

Reverse-extraction scripts should remain as fallback / legacy compatibility tools, not the preferred production path.

---

## Clarifying the SVG point

SVG does **not** make a puzzle solvable by itself.

Solvability comes from deterministic puzzle logic.

Correct mental model:
1. generate puzzle structure in code
2. save structure as JSON / internal data
3. render that structure to SVG
4. export PNGs from the SVG when needed

So:
- deterministic generator = guarantees solvability
- SVG = crisp, scalable drawing format for that solvable structure

This means Option 1 (deterministic generation) is the real strategy, and SVG is a likely rendering format inside that strategy.

---

## Maze factory — first implementation target

### First concrete build
Create a first-party maze asset factory.

Suggested script:
- `scripts/generate-maze-assets.mjs`

### Proposed outputs
For each generated maze episode/folder, emit:
- `activity.json`
- `maze.json`
- `blank.svg`
- `solved.svg`
- `blank.png`
- `solved.png`
- `path.json`

### Suggested data responsibilities

#### `maze.json`
Should contain at minimum:
- seed
- shape
- difficulty
- rows / cols or equivalent topology params
- entrance
- exit
- wall / adjacency representation
- full ordered solution path
- optional metadata (dead-end count, path length, branching score)

#### `path.json`
Keep this as a compatibility artifact for current reveal components.
It should contain ordered waypoints suitable for `MazeSolverReveal` / `ActivityChallenge`.

#### `activity.json`
Should remain compatible with current challenge render flow.

---

## Shape requirement

Maze generation must support more than plain square grids.

User requirement: match the spirit of BookBolt-style variety, including shape flexibility such as:
- square
- rectangle
- circle / radial
- other shaped masks later

This means maze architecture should not hard-code only one grid family.

Recommended approach:
- Phase 1: rectangular / square mazes first for fast end-to-end integration
- Phase 2: add masked / shaped mazes (circle, custom silhouettes, etc.)

Design the contract now so shape is a first-class field from the start.

Example:
```json
{
  "shape": "rectangle"
}
```
Later values could include:
- `square`
- `rectangle`
- `circle`
- `mask:<name>`

---

## External reference source

There is a large maze reference library available here:
- `D:\Books and Publishing\Mega Maze (5000 pages)-20240708T093655Z-001`

Use cases:
- benchmark visual readability
- benchmark difficulty tiers
- inspect style/layout patterns
- inspect shape variety
- compare line weight, margins, path clarity, dead-end density

Important rule:
- use this library as **reference material and QA inspiration**, not as the long-term production dependency
- the production goal remains first-party generation, not manual extraction from 4000+ existing pages

That said, a small evaluator or reference sampler may be useful during Maze Phase 1.

---

## Practical implementation stance

### Keep
- current challenge renderer
- current reveal components
- current extraction scripts as fallback

### Build next
- first-party generator scripts that emit structured assets directly

### Avoid
- depending on AI image generation for maze / word-search substrate
- scaling manual Photoshop-like puzzle production
- deleting reverse-extraction before the new path is proven

---

## Immediate next task recommendation

### TASK-OC-007 — Deterministic Maze Asset Factory

Suggested scope:
- add `scripts/generate-maze-assets.mjs`
- support dry-run
- generate solvable rectangular maze from seed
- emit `maze.json`, `path.json`, `blank.svg`, `solved.svg`, `blank.png`, `solved.png`, `activity.json`
- verify outputs render in existing `ActivityChallenge` flow without custom patches
- add npm scripts for generation and dry-run
- document contract and folder layout

### Phase 1 success criterion
A fresh generated maze folder should render through the existing challenge reel pipeline with no manual asset editing and no reverse extraction.

---

## Follow-up order after Maze

1. Word Search asset factory
   - emit structured grid + placements + reveal rect metadata directly
2. Matching asset factory
3. Find the Difference asset factory
4. Coloring asset factory
5. Tracing / Dot-to-Dot asset factory

---

## Current status call

JoyMaze is no longer in basic feasibility mode for these lanes.

Current state:
- Story / animal: close to production scaling
- Challenge / ASMR: need deterministic asset-factory automation before scale

So the active phase for puzzle lanes is:
**production-readiness engineering / asset-factory buildout**

not:
- new speculative feature invention
- full-speed scale posting from fragile manual assets

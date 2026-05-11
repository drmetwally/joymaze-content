# Puzzle Challenge Reel Implementation Spec — 2026-04-23

Read-only implementation spec.
This document defines the recommended coding plan before any edits are made.

---

## 1. Objective

Implement the new **Puzzle Challenge Reel** format as the replacement for the current still-image puzzle/activity short video lane.

The reel should follow this structure:
1. puzzle visible immediately
2. title/hook visible at top center
3. digit countdown visible in the top UI strip
4. subtle challenge-phase push-in and suspense audio
5. title + countdown disappear together at zero
6. short transition cue signals answer start
7. ASMR-style solve begins

This format should become the reusable short-form building block for future puzzle compilation longform videos.

---

## 2. Main implementation strategy

### Recommended approach
**Move puzzle/activity short generation onto the Remotion composition lane** rather than extending the current FFmpeg static-frame pipeline.

### Why
Current audited state suggests:
- `scripts/generate-activity-video.mjs` is still built around a static image + FFmpeg assembly model
- that old model is too limited for:
  - countdown UI
n  - challenge-phase timing by puzzle type
  - subtle push-in
  - transition cue
  - more layered audio behavior
- the repo already has a Remotion-based rendering system that is better suited for this format

### Design implication
The new format should be implemented as a proper composition-driven render path, not as a patched static-image video script.

---

## 3. Scope boundaries

## In scope
- Puzzle Challenge Reel format implementation
- activity/puzzle short rendering flow
- title/countdown/challenge UI
- puzzle-type timing rules
- suspense/transition/solve audio behavior
- replacing the current still-image activity short output path

## Out of scope
- story reel changes
- ASMR reel redesign
- scheduler changes
- posting architecture changes
- intelligence engine refactor
- longform compilation implementation in this same pass

---

## 4. Likely file scope

## Primary files likely to change

### A. `remotion/compositions/ActivityChallenge.jsx`
**Role:** should become the canonical Puzzle Challenge Reel composition.

**Expected work:**
- define the final visual grammar for the challenge reel
- title top center
- countdown in top-left/top strip
- challenge window timing
- subtle push-in during challenge phase
- transition cue at countdown end
- solve-phase handoff to reveal logic
- audio layering by phase
- support different puzzle types

### B. `scripts/generate-activity-video.mjs`
**Role:** current activity short generator entrypoint

**Expected work:**
- stop treating activity videos as static FFmpeg image loops
- route rendering through Remotion composition render
- map queue/activity metadata into Puzzle Challenge Reel props
- assign timing defaults by puzzle type
- preserve output queue/write behavior where possible

### C. `remotion/index.jsx`
**Role:** composition registry

**Expected work:**
- likely minimal
- update schema/default props only if needed
- possibly ensure `ActivityChallenge` is registered with the right default prop shape

## Secondary files that may change

### D. `remotion/components/HookText.jsx`
Only if the current hook overlay component is close to the desired design and can be reused cleanly.
If not, avoid broad reuse and keep challenge-specific UI inside `ActivityChallenge.jsx`.

### E. `remotion/components/CaptionBar.jsx`
Only if already suitable for the top-strip challenge UI.
If not, avoid dragging it in just for reuse.

### F. reveal components such as:
- `WipeReveal.jsx`
- `MazeSolverReveal.jsx`
- `WordSearchReveal.jsx`
- `DotToDoReveal.jsx`

These should ideally be reused, not rewritten, unless the challenge reel exposes a real missing capability.

---

## 5. Current-state findings that affect implementation

## Finding 1
`generate-activity-video.mjs` is still documented and structured as a 15-second static-image video generator.

### Implication
Do not incrementally patch this as if it only needs a countdown overlay.
That would create an awkward hybrid and likely become harder to maintain.

## Finding 2
`ActivityChallenge.jsx` currently appears to be the right conceptual home for the new format.

### Implication
Use it as the main composition target for the new puzzle reel identity.

## Finding 3
The ASMR reveal lane already has useful solved/blank reveal behavior.

### Implication
The solve phase should reuse existing reveal language/components where possible.
Do not build a second solve engine unless necessary.

---

## 6. Proposed implementation phases

## Phase 1 — Composition contract

### Goal
Define the final prop contract for Puzzle Challenge Reel rendering.

### Expected prop categories
- puzzle image / blank image / solved image paths
- puzzle type
- title/hook text
- countdown duration
- solve duration
- transition duration
- challenge audio path / settings
- solve audio path / settings
- puzzle-specific reveal data where needed
  - maze path
  - word search rects
  - dot waypoints

### Key rule
Keep the contract explicit.
Do not rely on hidden inference inside the composition if it can be passed in clearly from the generator script.

---

## Phase 2 — Visual UI implementation

### Goal
Build the challenge-phase UI and motion.

### Must-have behaviors
- title at top center
- countdown digits in top-left area of the same strip
- challenge strip readable and clean
- puzzle remains dominant
- subtle push-in during countdown
- no overdesigned hook animation

### Transition behavior to implement
At zero:
- countdown shows 0 briefly
- title + countdown exit together
- ticking stops
- one short visual pulse on the puzzle
- reveal-start cue plays
- solve begins immediately

---

## Phase 3 — Timing model

### Goal
Implement puzzle-type timing defaults.

### Suggested v1 defaults
- Maze: 10s challenge
- Word search: 12s challenge
- Matching: 10s challenge
- Dot-to-dot: 8s challenge
- Quiz / tracing: 10s challenge

### Solve duration handling
Start with fixed per-type defaults or existing reveal durations, then tune after testing.
Do not overcomplicate timing logic in the first pass.

---

## Phase 4 — Audio implementation

### Goal
Support phase-based audio behavior.

### Challenge phase
- suspense bed
- soft ticking once per second
- optional slight ramp in final 3 seconds

### Transition
- ticking stops
- one short whoosh/chime/impact cue

### Solve phase
- pencil/sketch sound remains the main audio identity
- optional very low supporting bed if needed

### Important rule
Do not let audio complexity outrun format clarity.
The reel should still feel clean over repeated viewing.

---

## Phase 5 — Generator script integration

### Goal
Update `generate-activity-video.mjs` so it renders the new format reliably.

### Expected responsibilities
- determine which queue items/puzzle types are eligible
- map metadata into composition props
- render via Remotion instead of static FFmpeg looping
- write resulting output video to `output/videos/`
- preserve queue JSON generation/update logic for YouTube posting lane
- preserve Cloudinary upload behavior if currently needed

### Critical rule
Keep output behavior stable where possible.
The format changes, but the surrounding workflow should not break.

---

## Phase 6 — Validation pass

### Goal
Prove the format on real puzzle types before broad rollout.

### Minimum test matrix
- Maze
- Word search
- Matching or quiz
- Dot-to-dot if available

### What to review
- title readability
- countdown clarity
- pacing of challenge window
- transition cleanliness
- solve satisfaction
- comparison vs current still-image short behavior

### Outcome
Lock v1 defaults after this pass.
Do not chase endless polish before basic approval.

---

## 7. File-by-file expected changes

## `remotion/compositions/ActivityChallenge.jsx`
### Expected changes
- likely major rewrite or substantial expansion
- define structure:
  - challenge phase
  - transition phase
  - solve phase
- implement countdown UI
- implement title strip
- implement challenge-phase motion
- orchestrate reveal component by puzzle type
- orchestrate audio timing

### Constraint
Keep this file focused on format orchestration, not queue or filesystem logic.

---

## `scripts/generate-activity-video.mjs`
### Expected changes
- medium to major rewrite
- replace static FFmpeg frame-loop assumptions with Remotion render orchestration
- compute and pass puzzle-type durations
- preserve queue entry / output expectations as much as possible

### Constraint
Avoid expanding this script into a second composition layer.
Its job should be orchestration, not scene design.

---

## `remotion/index.jsx`
### Expected changes
- small
- update default prop shape if needed
- keep registration simple

---

## Optional helper components
If challenge-strip UI becomes bulky inside `ActivityChallenge.jsx`, it may be worth extracting:
- `PuzzleChallengeHeader.jsx`
- `PuzzleCountdown.jsx`

But this should happen only if it improves clarity.
Do not create extra files just for aesthetics.

---

## 8. Test sequence

## Test 1 — composition dry render sanity
- render one maze with default settings
- verify title + countdown + solve flow

## Test 2 — timing sanity by type
- render one word search
- render one matching/quiz type
- verify duration feels natural for each

## Test 3 — audio sanity
- challenge ticking not annoying
- transition cue not too dramatic
- solve audio remains satisfying

## Test 4 — workflow sanity
- generated output still lands in expected video/output path
- queue metadata remains usable
- no damage to daily production lane

---

## 9. What should stay untouched in the first coding pass

Do not touch unless truly required:
- `scripts/daily-scheduler.mjs`
- posting scripts
- intelligence scripts
- X generation flow
- longform compilation render path
- story reel flow
- ASMR pipeline behavior outside what is reused for the solve phase

This keeps the blast radius small.

---

## 10. Milestone definition

## Milestone 1
One puzzle type renders successfully in the new challenge format.

## Milestone 2
Three to four puzzle types render successfully with tuned challenge windows.

## Milestone 3
New challenge format is approved as the replacement for current still-image puzzle shorts.

## Milestone 4
Only after Milestone 3: use the new reel format as the chapter basis for puzzle compilation work.

---

## 11. Recommended first coding task

### Best first task
**Rewrite/expand `remotion/compositions/ActivityChallenge.jsx` into the final Puzzle Challenge Reel composition, then update `scripts/generate-activity-video.mjs` to render it.**

### Why this order
- strongest conceptual anchor
- smallest clean lane
- avoids hacking the old FFmpeg loop path first
- makes validation easier
- creates the reusable unit needed later for compilation

---

## 12. Bottom line

The clean implementation path is:
1. make the chapter unit strong,
2. validate it in short-form,
3. only then build compilation on top of it.

That means the first coding pass should stay tightly focused on the activity-video lane and the `ActivityChallenge` composition.

# Puzzle Compilation Readiness Checklist — 2026-04-23

Read-only planning checklist for the next intended build step:
create a ~60 minute YouTube longform compilation built from ASMR / puzzle shorts.

No code changes are proposed in this document.

---

## 1. Goal of this build

Build a longform YouTube video made from existing JoyMaze ASMR / puzzle assets.

Strategic reason:
- extends an already-valid content lane,
- builds on existing ASMR asset production,
- targets YouTube, the most stable cloud-owned posting lane,
- acts as the final major build push before shifting focus to quality + efficiency hardening.

---

## 2. Current status summary

### What already exists
- `scripts/generate-puzzle-compilation.mjs`
- `remotion/compositions/PuzzleCompilation.jsx`
- npm scripts in `package.json`:
  - `longform:puzzle:compile`
  - `longform:puzzle:render`
- puzzle compilation compositions registered in `remotion/index.jsx`:
  - `PuzzleCompilation`
  - `PuzzleCompilationH`

### What this means
The puzzle compilation lane is **started**, not fully finished.

### Important planning finding
The main renderer entrypoint (`scripts/render-story-longform.mjs`) allows `--format puzzle-compilation` in its CLI validation, but from the audited sections it does **not yet show a dedicated puzzle-compilation branch** equivalent to the implemented `story` and `animal` branches.

Planning interpretation:
- the lane is real,
- the pieces exist,
- but final render orchestration likely still needs finishing or verification before the first reliable live run.

---

## 3. Current asset readiness

### Current ASMR folder count found during audit
`output/asmr/` currently contains **3** directories:
- `coloring-forest-animals`
- `maze-garden-maze`
- `wordsearch-butterfly-garden`

### Why this matters
The current compilation planner defaults to:
- `DEFAULT_COUNT = 45`
- `DEFAULT_CHAPTER_DURATION_SEC = 75`
- target runtime roughly ~56 minutes

So right now, the planner logic is conceptually aimed at many chapters, but the currently visible asset pool is far below that target.

### Immediate conclusion
**Track C is not asset-ready yet for a true 60-minute compilation.**

At minimum, one of these must happen later:
1. produce many more ASMR/puzzle folders, or
2. intentionally redesign compilation structure to use fewer, longer chapters or repeated formats, or
3. accept a shorter first compilation as a pilot.

---

## 4. Build-readiness checklist

## A. Asset pool readiness

### Required questions
- [ ] How many valid ASMR/puzzle folders are required for v1?
- [ ] Is the first release truly required to hit ~60 minutes, or can it be a shorter proof-of-concept?
- [ ] Which activity types are allowed in the compilation?
  - coloring
  - maze
  - wordsearch
  - dot-to-dot
  - other puzzle types later
- [ ] Are repeated chapter structures acceptable, or should every chapter be unique?

### Minimum asset checks
Each included chapter folder should have:
- [ ] `activity.json`
- [ ] `blank.png`
- [ ] `solved.png`
- [ ] correct activity type metadata
- [ ] render-safe reveal path if needed for that puzzle type

### Current blocker
- [x] Asset shortage for a 60-minute target is a known blocker.

---

## B. Render path readiness

### Required checks before build work starts
- [ ] Confirm `scripts/render-story-longform.mjs` actually has a complete branch for `puzzle-compilation`
- [ ] Confirm it knows how to load `compilation.json`
- [ ] Confirm it routes to `PuzzleCompilation` / `PuzzleCompilationH`
- [ ] Confirm it computes compilation duration from chapter count
- [ ] Confirm it validates chapter assets before render
- [ ] Confirm output path conventions for `output/longform/puzzle-compilation/...`

### Current planning judgment
This is the **highest technical readiness question**.
The planner and composition exist, but render orchestration looks incomplete or at least not yet verified from the audited sections.

---

## C. Audio readiness

### Current design signals from the planner
`generate-puzzle-compilation.mjs` expects:
- one background music prompt from the Suno pool,
- `background.mp3` dropped into the compilation folder,
- chapter-based compilation structure.

### Questions to settle before building
- [ ] Is one 60-minute BGM track required, or can it loop safely?
- [ ] Should puzzle compilations use one continuous music bed, or chapter-level music variation?
- [ ] Should there be chapter intro stings, or only one unified ambience layer?
- [ ] Does the YouTube output need calmer background mix than short-form ASMR clips?

### Practical note
Longform listener fatigue matters more here than in shorts.
This is likely one of the biggest quality levers after render correctness.

---

## D. Format / experience readiness

### Key product questions
- [ ] Is the video meant to feel like a passive calming loop, or a chaptered “solve along” experience?
- [ ] Should chapter titles remain visible only on title cards, or return during each puzzle?
- [ ] Should compilation chapters include countdown/timer elements or just reveal flow?
- [ ] Should the longform output be horizontal-first for YouTube only, or also support vertical reuse?

### Current repo signal
YouTube is the most stable automation lane, so **horizontal-first** is likely the right default for this build.

---

## E. Production safety readiness

Before any build work starts:
- [ ] Do not change the daily generation lane to support compilation work unless necessary
- [ ] Do not destabilize active ASMR short generation while adding longform compilation support
- [ ] Treat compilation work as its own lane under `output/longform/puzzle-compilation/`
- [ ] Keep YouTube longform isolated from daily posting/manual warmup logic

This matters because the current workflow is working and improving, even if messy.
The compilation build should not disturb that.

---

## 5. Suggested planning decisions before coding

These are the highest-value decisions to make first.

### Decision 1
**Is the first target truly 60 minutes, or a pilot compilation?**

Recommendation:
- decide this explicitly before implementation.
- if asset volume is low, a pilot may be the smarter first landing.

### Decision 2
**Will compilation chapters be built only from fully completed ASMR folders?**

Recommendation:
- yes, keep the first version strict.
- avoid half-manual chapter assembly.

### Decision 3
**What is the success criterion for v1?**
Possible options:
- render completes end-to-end,
- music feels good over long duration,
- pacing feels non-repetitive,
- chapter transitions feel intentional,
- YouTube upload-ready with minimal manual cleanup.

Recommendation:
- define success as a production-ready YouTube asset, not just a successful render.

---

## 6. What is likely still needed after readiness is confirmed

Not code instructions, just planning expectations.

Likely implementation areas later:
- complete render-script support for `puzzle-compilation`
- compilation-specific validation logic
- duration calculation for compilation chapters
- output-folder conventions
- background audio handling for long duration
- chapter pacing / visual variation tuning

---

## 7. Risk map for this build

### Low risk
- planning the compilation lane
- documenting folder requirements
- documenting chapter structure
- deciding pilot vs full-length target

### Medium risk
- reusing existing ASMR assets for longform pacing
- music choice and fatigue across 60 minutes
- visual repetition if too few activity types are available

### High risk
- assuming the render path is already complete when it may not be
- trying to force a 60-minute output with too few usable folders
- changing the daily production flow to support compilation work

---

## 8. Readiness verdict as of 2026-04-23

### Strategic readiness
**Yes**
This is a sensible next build target.

### Asset readiness for a true 60-minute build
**No, not yet**
Current visible ASMR folder count is too low.

### Technical readiness
**Partial**
Planner + composition exist, but render-path completeness still needs confirmation/building.

### Workflow safety readiness
**Yes, if isolated**
This build can happen safely if it stays in its own lane and does not disturb daily production.

---

## 9. Recommended next move

Before coding the compilation lane, decide and document:
1. full 60-minute target vs pilot target,
2. minimum number of chapter-ready ASMR folders required,
3. whether render-path completion is the first coding task,
4. what “v1 done” actually means.

### Best planning sequence
1. settle target scope,
2. settle asset threshold,
3. confirm render-path gap,
4. build the missing compilation glue,
5. test with one isolated pilot render,
6. only then aim for the full production version.

---

## 10. Bottom line

Puzzle compilation is the right next major build lane.
But as of this audit:
- it is **not yet fully asset-ready** for a real 60-minute output,
- and it appears **not yet fully render-ready** from the main orchestration script.

So the correct stance is:
**promising and aligned, but not yet turnkey.**

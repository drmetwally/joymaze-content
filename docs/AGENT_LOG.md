---

### 2026-05-08 | OpenClaw | HANDOFF-PLAN | Tomorrow-start plan after Claude audit + Sea Otter validation

**Status:** READY FOR NEXT SESSION

**Agreed durable judgment:**
- `StoryReelV2` and `AnimalFactsSongShort` are ship-ready at the **engine** level for the current slice.
- Tomorrow should **not** start with broad renderer/composition rebuilding.
- Claude's main diagnosis stands: the highest-ROI next work is upstream generation quality, plus one narrow reliability guardrail so bad inputs do not masquerade as engine defects.

**Tomorrow-first priority order:**
1. **Animal brief quality pass**
   - Tighten `generate-animal-facts-brief` so opener and payoff do not routinely repeat the same core fact.
   - Preserve immediate animal naming in the opening lyric.
   - Keep final moments biased toward a concrete emotional/factual payoff, not a generic scenic return.
2. **Story Reel quality pass**
   - Improve source-bank / slide quality and image-prompt richness rather than changing reel architecture.
   - Use the renderer as validator, not the main invention surface.
3. **Reliability hardening**
   - Add a fail-loud or at least explicit warning path when Animal Facts has a partial `moment*.png` set and would silently fall back to `beat*.png` or legacy images.
   - Goal: avoid future false engine diagnoses like the `namereveal` confusion.
4. **Later format improvement, not morning task #1**
   - Standalone Animal Facts likely still wants a stronger hook/cold-open strategy, but only after the brief-quality and reliability passes above.

**Specific agreement with Claude's fixes:**
- Keep the StoryReelV2 hard-cut `imageSequence` change.
- Keep the Animal Facts `--episode` alias fix and current song-driven timing path.
- Do not spend the next pass activating inert psychology pulses or building broader animation complexity unless a concrete QC failure demands it.

**Stop-line for next session:**
- Preferred order is **brief quality -> reliability guardrail -> benchmark/QC**.
- Reopen engine architecture only if a new real render exposes a concrete defect.

---

### 2026-05-08 | Claude | AUDIT-001 | StoryReelV2 + AnimalFactsSongShort engine audit + fixes

**Status:** COMPLETE

**Audit findings:**

**AnimalFactsSongShort (score: 9/10 post-fixes)**
- Architecture: single-sequence wrapper, audio-driven timing via `music-metadata`, image fallback cascade (visualExpansionMoments → beat*.png → legacy namereveal+facts)
- `--episode` alias bug fixed in commit `8655c17` (by OpenClaw) — correctly guards alias to AnimalFactsSongShort comp only
- Badge alpha corrected: `rgba(255,210,0,0.9)` → `rgba(255,210,0,0.93)` — `AnimalSungRecap.jsx:166` — commit `4042f3e`
- Song recap display compliant: no karaoke sync, shows animal name + "♪ Fun Facts Song ♪" + 2 floating note particles
- `durationSec` rule not applicable here — engine uses actual audio file duration, no narration scenes
- **Known gaps:** no hook scene (cold start), `scenePlan` fallback gives equal weight to all scenes regardless of emotional value, partial `moment*.png` set falls back silently to beat/legacy images

**StoryReelV2 (score: 9/10 post-fixes)**
- Architecture: hook (`StoryHookScene`) + N act slides (`StoryActScene`), hard cuts throughout, background music loop at composition level
- All 6 SFX lanes present: homecoming, survival, loyalty, parent_bond, rescue, migration
- Yellow pill exact match: `rgba(255,210,0,0.93)`, `rx=22`, dark text — compliant
- No outro, no CTA, no fade — loop-clean hard cut on last frame — compliant
- `psychologyTrigger` was hardcoded by act number, ignoring `slide.psychologyTrigger` from story JSON — fixed: `render-video.mjs:458` — commit `4042f3e`
- Dead `backgroundMusicPath` prop removed from `StoryHookScene.jsx` — commit `4042f3e`
- **Grey area resolved:** `imageSequence` within-scene 12-frame crossfade removed — now hard cut — commit `1aa403f`. Note: Ken Burns resets at `sequenceIndex` switch; `imageSequence` is now functionally a hard-cut image swap mid-scene. Recommend removing `imageSequence` from story generator or wiring KB per segment.
- **Known gap:** `brightnessPulse` and `climaxPulse` both hardcoded to `1` in `StoryActScene.jsx` — psychology trigger color overlays are wired but visually inert (no-op)
- **Known gap:** No analytics hookback — arc selection is blind until Phase 2 story performance weights loop is built

**Content production verdict:**
- Both engines are ship-ready. The bottleneck is upstream content quality (brief quality, image prompt richness, story arc selection), not engine capability.
- StoryReelV2: SFX lane system is a genuine differentiator vs competitor reels. Engine amplifies story data quality.
- AnimalFactsSongShort: Works as companion to full episode; weaker as standalone post. Hook scene would dramatically improve retention.
- Highest-ROI next investment: tighten generation scripts (story JSON + animal brief), not more engine work.

**Commits this session:** `4042f3e` (4 fixes), `1aa403f` (imageSequence hard-cut)

---

### 2026-05-04 | OpenClaw | OC-030 | MatchingReveal fixes — timing, layering, ocean background

**Status:** LARGELY COMPLETE — minor timing edge cases remain (see below)

**Major fixes applied across session (oldest first):**

1. `isTopCard = pos < 6` — corrected 4→6 column detection in MatchingReveal.jsx
2. TitleStrip visible in P1 — removed gating that hid title during hook phase
3. P3 reveal mechanic rewrite — dropped connection lines, spring-in pairs left→right via `(k+1)/N` threshold
4. Ocean scene as `objectFit: cover` bottom layer — direct `Img` of ocean-animals-1.png fills full frame; BlankCardBacks opaque (hide ocean in card area); RevealedCard white (#FFFFFF)
5. MatchingStickerOverlay neutralized — `return null` for all phases since MatchingReveal owns all sticker rendering; was causing double-sticker in P1 via `gridIndex % 6` position-based pairing
6. `RevealedCard` white background — reverted from transparent to #FFFFFF per user feedback

**Timing applied:**
- P1 (hook): 5s (was 2.5s)
- P2 (countdown): 10s (was 15s)
- P3 (reveal): 12s (was 14s), 6 pairs × 2s each
- Transition: instant (no transitionFrames for matching)
- Total: 27s = 810 frames (was 31.5s = 945 frames)

**Files changed:**
- `remotion/components/MatchingReveal.jsx` — full rewrite of render logic + ocean background + timing
- `remotion/components/MatchingStickerOverlay.jsx` — null-return guard in all phases
- `remotion/compositions/ActivityChallenge.jsx` — `hookFrames` wired to `hookDurationSec` prop; matching computePath uses inputProps
- `scripts/generate-matching-assets.mjs` — COUNTDOWN_SEC=10, SOLVE_DURATION_SEC=12, hookDurationSec=5

**Commits (origin/main, newest first):**
- `f1bfbac` chore: matching timing — P1 5s, P2 10s, P3 12s
- `d4a555a` fix(MatchingReveal): revert RevealedCard background to #FFFFFF
- `9dc3792` fix(MatchingStickerOverlay): return null all phases
- `72ea381` fix(MatchingStickerOverlay): return null in P3+
- `c037f80` fix(MatchingReveal): ocean PNG objectFit:cover + BlankCardBacks opaque
- `6b1d47c` chore: extend holdAfterSec 12→14s
- `f249701` chore: remove deprecated sceneBackgroundPath comment

**Minor issues for later (not blocking):**
- Last pair reveal cut off at video end — P3 duration may need small increase or last pair reveal time slightly reduced
- Generator ENOENT on ocean PNG (~80% failure rate on Windows) — same PNG works in standalone Node; SVG/PNG output still correct via sharp compositing; sceneBgDataUrl already in memory before copy fails
- blank.svg not written by generator (ENOENT on write for SVG output); blank.png/solved.png still generated via sharp from SVG string

**QC builds:**
- v18: white card background confirmed ✓
- v19: timing — P1=5s/P2=10s/P3=12s, 27s total, instant transition

---

**Pending from audit (not yet started):**
1. Story reel V2 — Imagen endpoint `v1beta/models/imagen-4.0-generate-001:predict` returns 404; update endpoint/model ID
2. Animal facts brief — `validateBrief()` throws on Groq malformed output before folder created; needs tolerance or pre-save
3. 4AM GitHub Actions — `post-content.mjs --scheduled` crashes on empty queue + missing Cloudinary creds; needs graceful fallback

---

### 2026-05-05 | JoyMaze | Story Reel V2 | Story source bank + weekly intelligence seeding + 2-pass generator foundation

**Status:** FOUNDATION COMPLETE, BANK EXPANSION IN PROGRESS

**Completed before this log entry:**
- Added `config/story-source-bank.json` as a dedicated Story Reel V2 source bank.
- Extended `scripts/intelligence-refresh.mjs` so weekly intelligence can emit `new_story_source_seeds`.
- Extended `scripts/apply-intelligence.mjs` so the existing refresh/apply path merges story seeds into the source bank and ages them over time.
- Upgraded `scripts/generate-story-ideas.mjs` to a 2-pass flow:
  1. source-bank-aware outline generation
  2. final story generation from the locked outline spine
- Persisted source metadata into generated `story.json` via `storySourceBankId` and `storyLane`.
- Added parse/retry hardening after model output intermittently returned fenced JSON or failed weak image-prompt validation.
- Real generation through the new bank -> outline -> final-story path succeeded after hardening.
- Commit pushed: `a866bbd` — `feat: seed story bank from weekly intelligence`

**Durable diagnosis:**
- Main quality bottleneck is now story depth, not render plumbing.
- The bank needs stronger high-signal seeds, not just more seeds.
- Best bank additions should bias toward high-relatability, high-stakes, visually legible animal arcs: rescue, reunion, homecoming, migration, parent-young protection, and loyalty.

**Current next step requested by user:**
- Update memory and AGENT_LOG first.
- Then flesh out the story bank by searching for the most relevant / viral / emotionally engaging animal-story patterns first.
- After bank expansion, tighten the 2-pass step only where the richer bank materially improves selection and copy depth.

**Update after completing that pass:**
- Bank expanded from 10 -> 20 seeds.
- Added richer scoring metadata to seeds: `emotionalIntensity`, `relatability`, `virality`.
- `generate-story-ideas.mjs` now scores against those fields and diversifies the selected candidate set by lane before filling remaining top-scored entries.
- Final pass now receives the exact selected seed payload from pass 1, so it is less free to drift away from the chosen stakes/event.
- `intelligence-refresh.mjs` and `apply-intelligence.mjs` were updated so weekly-added seeds can carry the same richer metadata.
- Live generation validation succeeded after the bank expansion and selected the new swan/cygnet protection lane for the test story.
- Follow-up lane-bias testing also succeeded:
  - `--lane homecoming` selected the pigeon/window-light homecoming seed.
  - `--lane parent_bond` selected the swan/cygnet protection seed.
  - `--lane survival` selected the puffin/last-fish storm-return seed.
- This indicates the expanded bank plus lane bias is producing materially different emotional spines instead of collapsing into one repeated shape.

### 2026-05-05 | OpenClaw | Story Engine next-step lock + scheduler/model routing follow-up

**Status:** NEXT WORK DECIDED, ENVIRONMENT STABILIZED

**Story Engine next work locked:**
- Do not spend the next pass on additional plumbing or on matching-engine work.
- The next Story Reel V2 pass should focus on **quality validation**, not architecture.
- Priority order:
  1. Run focused lane-validation on the expanded **48-seed** bank for `homecoming`, `parent_bond`, `loyalty`, and `survival`.
  2. Tighten **cross-slide visual style consistency**. Species continuity is much better now; remaining weakness is style looseness between slides.
  3. Stop when fundamentals are boring: **3 consecutive clean runs**, **2 strong outputs per priority lane**, no major hero/species drift, and no broken handoff across `intelligence-refresh -> apply-intelligence -> story-source-bank -> generate-story-ideas -> generate-story-reel-images -> generate-story-reel-audio -> render-video`.

**Daily automation/environment decisions completed:**
- `npm run daily` is now the canonical full daily pipeline.
- `scripts/daily-scheduler.mjs` now acts as a thin timing wrapper around that same canonical flow.
- Windows scheduled task audit confirmed the live production trigger is `\Joymaze Daily` at **9:00 AM** running `scripts/daily-scheduler.mjs --now` from `D:\Joymaze-Content`.
- Duplicate-risk audit found the only real danger was a stray long-lived scheduler daemon. That stray process was killed, leaving one clean 9 AM trigger.

**OpenClaw model-routing decision completed:**
- User chose the safer direct API integration path, not Gemini CLI OAuth.
- Final desired order was applied as:
  - primary: `openai-codex/gpt-5.4`
  - fallback 1: `minimax/MiniMax-M2.7`
  - fallback 2: `google/gemini-2.5-pro-preview-05-06`
  - fallback 3: `google/gemini-2.5-flash-preview-04-17`
- Gemini 3 was investigated, but that lane depends on the separate `google-gemini-cli` OAuth provider and was intentionally not adopted.

### 2026-05-06 | OpenClaw | Roadmap lock after Story Reel

**Status:** PRODUCT SEQUENCE LOCKED

User clarified the intended build order after Story Reel V2 quality is strong enough:
1. Perfect Story Reel first.
2. Then build the Animal Facts short, using Story Reel as the structural reference.
   - Main difference: narration is a **song** generated via Suno or another music path, not standard spoken narration.
3. Then build/finish the Find-the-Difference challenge reel engine.
4. After those lanes are in a good state, stop major new building completely.
   - Focus shifts to posting, automation, polishing, and business/marketing KPIs.
   - Main targets: views, subscribers, and sales for books and app.

This means current Story Engine work should stay tightly focused on quality validation and style consistency, because it is now the reference structure for the next lane, not just another feature to finish.

### 2026-05-06 | JoyMaze | Story Reel stop-line reached for major rebuilding

**Status:** MAJOR REBUILDING NEARLY COMPLETE, SHIFT TO NARROW POLISH + OPERATIONS

**What landed in this pass:**
- Confirmed the existing Imagen-based reel quality gate is present in `scripts/generate-story-reel-images.mjs` and the upstream protagonist-first gate exists in `scripts/generate-story-ideas.mjs`.
- Tightened `scripts/generate-story-ideas.mjs` so every slide prompt carries a reusable style anchor and validation now fails if the style anchor drops out.
- Tightened `scripts/generate-story-reel-images.mjs` so the Imagen wrapper explicitly enforces:
  - same-medium / same-finish illustration consistency
  - no photoreal / no live-action / no glossy 3D drift
  - explicit animal-anatomy readability in close-ups
  - no human companion leakage
  - no split-panel / comic / collage layouts
- Regenerated the 4 priority lanes (`homecoming`, `parent_bond`, `loyalty`, `survival`) and did targeted retries on real failures instead of broad rewrites.

**Real failures observed and corrected:**
- human portrait substitution in close-up frames
- human side-character leakage
- split-panel/comic-style frame in the swan (`parent_bond`) set

**Lane outcomes after the pass:**
- `homecoming` — strongest lane, strong enough to use as a benchmark
- `survival` — also strong and stable
- `loyalty` — improved materially after adding lane-specific copy guidance around costly devotion / staying
- `parent_bond` — improved, but still the least settled of the top lanes

**Rendered QC outputs completed:**
- `StoryReelV2-1778058758388.mp4` — homecoming
- `StoryReelV2-1778058854166.mp4` — survival
- `StoryReelV2-1778060372026.mp4` — improved loyalty

**Important render-path diagnosis:**
- A temporary render failure on `ep22` was not a story bug; it came from invoking `render-video.mjs` with `--composition` instead of `--comp`, which fell back to `StoryEpisode` and tried to load missing non-reel slides (`02.png`, `04.png`, `06.png`).
- Re-running with `--comp StoryReelV2` confirmed the reel path renders cleanly.

**Current durable judgment:**
- The main remaining Story Reel risk is now **Imagen variance**, not missing story-system structure and not broken handoffs.
- This is the practical stop line for broad Story Reel engine rebuilding.
- Next work should be narrow only: light QC, posting selection, production reliability, and only lane-specific polish if a lane clearly lags enough to justify it.

**Commits from this pass:**
- `52ea525` — `fix: harden story reel style and anti-human guards`
- `4aef1a9` — `feat: sharpen loyalty lane story generation`

---

### 2026-05-07 | JoyMaze | Story Reel V2 | Final narrow polish pass on homecoming + survival benchmarks

**Status:** POLISH PASS COMPLETE, STOP-LINE HOLD

**Scope kept intentionally narrow:**
- audited the two latest benchmark renders only
- patched only the weak ending beats in `homecoming` and `survival`
- rerendered only those two reels
- avoided any broader lane expansion or system rewrite

**What changed locally in the reel artifacts:**
- `ep22-the-last-light-of-home`
  - tightened ending narration so the landing beat matches the image better
  - clarified the final rest beat from `Inside...` to `At the window...` after re-audit
  - regenerated ending art via safe direct Google image fallback after Imagen quota blocked the normal path
- `ep25-the-last-catch`
  - rewrote ending narration to bridge exterior return -> burrow payoff more cleanly
  - regenerated ending art via safe direct Google image fallback after Imagen quota blocked the normal path

**Important execution note:**
- Standard `scripts/generate-story-reel-images.mjs` hit the known Imagen quota wall again:
  - `Imagen error 429 ... limit: 70, model: imagen-4.0-generate`
- To finish the polish pass without reopening infrastructure scope, replacement ending images were generated through the safe direct Google image tool path and converted into the local story folders before render.

**Re-audit result:**
- `survival` ending now reads cleanly enough to stop, with stronger return-to-burrow continuity and no major remaining fix demanded.
- `homecoming` improved materially; only a small wording mismatch remained after the first rerender, then was corrected with one final line/audio rerender.
- Final judgment: this pass did **not** surface a new system defect. Remaining risk stays mostly in image-model variance, not in Story Reel V2 structure.

**Local polish renders produced:**
- `output/videos/StoryReelV2-homecoming-polish-20260507.mp4`
- `output/videos/StoryReelV2-homecoming-polish-20260507-thumb.jpg`
- `output/videos/StoryReelV2-survival-polish-20260507.mp4`
- `output/videos/StoryReelV2-survival-polish-20260507-thumb.jpg`

**Durable decision after this pass:**
- `survival` is approved to stop for this benchmark slice.
- `homecoming` is soft-approved after the final wording cleanup.
- Stay in render-and-polish mode only; no more lane/infrastructure expansion unless explicitly reopened.

**Follow-up logging state (2026-05-07 morning):**
- `docs/TASKS.md` was refreshed so the Story Reel immediate-next-phase tasks now match the real current state.
- `STORY-ENGINE-004` is now considered closed for the current slice: posting/benchmark selection locked to the polished `homecoming` and `survival` renders, with `loyalty` retained only as a fallback candidate and `parent_bond` held out unless a narrow lane-specific polish is explicitly chosen later.
- Active next task is `STORY-ENGINE-005` production reliability only.
- First reliability hardening landed immediately after that handoff: `scripts/render-video.mjs` now fails fast if an operator uses `--composition` instead of `--comp`, and it warns when a reel-style `story.json` appears to be routed through `StoryEpisode` rather than `StoryReelV2`.
- Live validation of the new Story Reel image fallback path also passed on 2026-05-07 using real forced single-slide runs on `ep22-the-last-light-of-home` and `ep25-the-last-catch` with `--fallback manual --continue-on-error`. Both completed cleanly and wrote the new richer `_reel-image-generation.json` logs. Daily operator docs were updated with the fallback runbook.

### 2026-05-07 | JoyMaze | Animal Facts short | Format reset and new canonical direction locked

**Status:** SPEC LOCKED, IMPLEMENTATION NEXT

**Durable product decision:**
- Reject the inherited longform-derived short structure (`hook -> reveal -> fact blocks -> sung summary -> CTA`) as the canonical future Animal Facts short lane.
- The strongest user-validated part of the prior experiments was the sung portion itself, so the new lane should make song the whole structure, not the ending gimmick.

**New canonical format locked with user:**
- **animal named immediately -> all-song from first line -> escalating fact wonder -> loop ending**
- No full CTA
- No formal reveal segment
- If a mystery-question opening is ever used, the name payoff must happen almost immediately inside the first lyric beat rather than as a standalone reveal scene

**Source-system decision:**
- Do **not** build a Story-Reel-style narrative seed bank for this lane.
- Build a lightweight **animal-song topic bank** instead, optimized for hook trait, singable fact beats, visual set pieces, loop ending ideas, and overall songability/replay value.

**Spec written:**
- `docs/ANIMAL_FACTS_SONG_SHORT_SPEC_2026-05-07.md`

**Implementation order now implied by the spec:**
1. topic bank design
2. brief generator refactor
3. short composition refactor
4. 2-4 benchmark episodes, then narrow polish

**Topic bank foundation completed immediately after spec lock:**
- Added `config/animal-song-topic-bank.json` as the first dedicated source layer for the new sung-first Animal Facts short lane.
- Added `docs/ANIMAL_SONG_TOPIC_BANK_NOTES_2026-05-07.md` to explain intent, scoring, and first-use guidance.
- This bank is explicitly not a story bank; it is a songability-first source bank keyed around hook trait, singable fact beats, visual set pieces, and loop ending ideas.
- Initial champion-tier animals seeded for first benchmarks:
  - Fennec Fox
  - Okapi
  - Puffin
  - Sea Otter
- Non-champion but useful supporting entries also seeded: Armadillo, Hedgehog.

### 2026-05-07 | JoyMaze | Animal Facts short | Brief generator + composition + render bridge validated

**Status:** END-TO-END STRUCTURE VALIDATED

**What was validated:**
- `scripts/generate-animal-facts-brief.mjs` now successfully emits the new sung-first contract using the animal-song topic bank.
- Shared virality rules for `animal_song_short` were rewritten to match the new format instead of the old mystery/reveal/CTA logic.
- `remotion/compositions/AnimalFactsSongShort.jsx` was refactored away from hook/reveal/outro sequencing and now plays as one continuous song-driven beat-image reel.
- `scripts/render-video.mjs` was updated so `AnimalFactsSongShort` accepts the new `beat1.png ... beatN.png` asset contract while still tolerating the legacy image set when present.
- A real saved episode folder (`output/longform/animal/ep07-puffin`) was used to validate the new path.

**Render proof:**
- After adding placeholder beat images and placeholder audio only for path validation, dry render completed successfully for:
  - `AnimalFactsSongShort`
  - duration: 825 frames / 27.5s
- This confirms the new lane is structurally wired end-to-end.

**Important scope note:**
- The validation placeholders were only for render-path proof, not creative approval.
- Remaining work after this checkpoint is real benchmark asset generation, song generation, pacing polish, and narrow quality iteration.
- Durable image-generation correction from the first real Puffin benchmark: Animal Facts beat images should be generated as **vertical portrait by default**, not horizontal landscape, because horizontal generations crop too aggressively inside the reel. The brief generator contract was updated accordingly so future image batches default to vertical framing with extra breathing room.
- Matching correction applied to Story Reel V2 image generation on 2026-05-07: `generate-story-reel-images.mjs` now defaults to vertical output sizing and stronger portrait-framing language so future story reel image patches are vertical by default too.
- Animal Facts timing rule changed on 2026-05-07 after auditing the first real Puffin benchmark: the selected song is now the timing source of truth for short-form animal reels. The render path no longer uses the stale hook/reveal/outro duration formula for this composition, and the short now expands into a song-led scene plan instead of evenly splitting a fixed short runtime across beat images.
- Animal Facts generator contract widened on 2026-05-07: the planner now distinguishes between `songBeats` (lyrical spine) and `visualExpansionMoments` (wider creative/image plan). This locks in the rule that longer songs should earn more creatives, not just longer holds on the same five images.

---

## TOMORROW'S TASKS — 2026-05-10

> These two tasks are for Gemini (or any capable coding assistant). Read each spec fully before touching any file. Both tasks are independent — they can be done in either order.

---

### TASK A — Wire all 5 puzzle types into the daily manifest so `npm run daily` auto-generates 5 puzzle posts

**Status:** READY TO IMPLEMENT

**Goal:** `npm run daily` should auto-generate a branded puzzle image post for all 5 ready puzzle types (maze, wordsearch, coloring, dottodot, matching), so the only manual image work each day is the 5 inspiration slots (Fact Card, Challenge, Quiet Moment, Printable Tease, Identity).

**Current state (before this task):**
- `npm run daily` calls `generate-challenge-brief.mjs` → writes `output/prompts/activity-manifest-YYYY-MM-DD.json`
- That manifest drives `generate-puzzle-image-post.mjs` for maze + wordsearch only (those two are wired into `daily-run.mjs`)
- Coloring, dottodot, matching are NOT called from `daily-run.mjs` — they have engines but are not wired in

**Key files to read first:**
- `scripts/daily-run.mjs` — the daily orchestrator; find where maze/wordsearch puzzle posts are called
- `scripts/generate-challenge-brief.mjs` — reads what puzzle types go into the manifest; check if it already plans all 5 types or only 2
- `scripts/generate-coloring-assets.mjs` — supports `--imagen` flag for Imagen-based generation
- `scripts/generate-imagen-dottodot-assets.mjs` — Imagen-based dottodot generator
- `scripts/generate-matching-assets.mjs` — matching generator
- `scripts/generate-puzzle-image-post.mjs` — the branded post wrapper; check it supports coloring, dottodot, matching types

**What to change:**

1. **`scripts/generate-challenge-brief.mjs`** — if the manifest only plans maze + wordsearch slots, extend it to plan 5 slots: maze, wordsearch, coloring, dottodot, matching. Each slot needs: `type`, `theme`, `difficulty`, `slug`. Themes should be drawn from `config/theme-pool-dynamic.json` (same source as existing slots). One slot per type per day.

2. **`scripts/daily-run.mjs`** — after the existing maze/wordsearch puzzle post generation block, add calls for coloring, dottodot, and matching:
   - Coloring: call `generate-coloring-assets.mjs --imagen --theme <theme> --difficulty <difficulty> --slug <slug> --force` → then call `generate-puzzle-image-post.mjs --type coloring --slug <slug>`
   - Dottodot: call `generate-imagen-dottodot-assets.mjs --theme <theme> --difficulty <difficulty> --slug <slug> --force` → then call `generate-puzzle-image-post.mjs --type dot-to-dot --slug <slug>`
   - Matching: call `generate-matching-assets.mjs --theme <theme> --difficulty <difficulty> --slug <slug> --force` → then call `generate-puzzle-image-post.mjs --type matching --slug <slug>`
   - Each call should be wrapped with the same try/catch + `--no-X` skip flag pattern already used for story-reel and animal-brief in `daily-run.mjs`

3. **Idempotency:** Each generator already checks if `puzzle.png` exists and skips unless `--force`. The daily runner should pass `--force` only if a `--force-puzzles` flag is given to `daily-run.mjs`. Default behavior: skip if already generated today.

4. **`--dry-run` support:** All three new calls must respect the existing `DRY_RUN` flag in `daily-run.mjs` — print the command but don't execute.

**Output locations (do not change these):**
- Coloring: `output/challenge/generated-activity/{slug}/` → branded post at `output/raw/coloring/{slug}-post.png` (or wherever puzzlepost writes its output — check the existing maze output path and mirror it)
- Dottodot: same pattern
- Matching: same pattern

**Validation (how to know it worked):**
```bash
node scripts/daily-run.mjs --dry-run
# Should print 5 puzzle generation commands (maze, ws, coloring, dottodot, matching) — not just 2
```

**Do NOT change:**
- The coloring/dottodot/matching generator scripts themselves (logic is correct)
- The puzzle post renderer
- Any existing maze/wordsearch wiring
- `generate-prompts.mjs` (inspiration image prompts stay as-is for now)

---

### TASK B — Auto-generate the 5 inspiration images via Imagen on `npm run daily`

**Status:** READY TO IMPLEMENT

**Goal:** `npm run daily` should call `generate-images-vertex.mjs` (Imagen) to generate the 5 inspiration image slots automatically, so the day starts with all 10 posts already generated — zero manual Gemini work for images.

**Current state (before this task):**
- `generate-prompts.mjs` already writes rich, intelligence-driven image prompts for all 10 slots to `output/prompts/prompts-YYYY-MM-DD.md`
- `generate-images-vertex.mjs` already exists and generates images via Imagen using prompts
- But `daily-run.mjs` does NOT call `generate-images-vertex.mjs` — inspiration images are generated manually in Gemini
- The 5 inspiration slots are: Fact Card, Challenge, Quiet Moment, Printable Tease, Identity

**Key files to read first:**
- `scripts/generate-images-vertex.mjs` — understand its input format: does it read from `prompts-YYYY-MM-DD.md` directly, or does it take `--prompt` flags? What flags does it support? What does it output and where?
- `scripts/generate-prompts.mjs` — confirm the prompts file format (especially the 5 inspiration slot prompts) so you know what `generate-images-vertex.mjs` needs to consume
- `scripts/daily-run.mjs` — find where to insert the new call (after prompts are generated, before the rest)

**What to change:**

1. **`scripts/generate-images-vertex.mjs`** — if it does not already support reading from `output/prompts/prompts-YYYY-MM-DD.md` and filtering by slot type (inspiration only, skipping puzzle slots), add that mode:
   - New flag: `--inspiration-only` — reads today's prompts file, extracts only the 5 inspiration slot prompts, generates one image per slot
   - Output: `output/raw/{slot-type}/{date}-{slug}.png` — same folder structure that `import:raw` already expects
   - If a slot's output file already exists: skip (idempotency)
   - If the prompts file doesn't exist yet: exit cleanly with a warning (daily-run.mjs calls prompts first, so this shouldn't happen)
   - Respect a `--dry-run` flag: print what would be generated, exit without API calls

2. **`scripts/daily-run.mjs`** — add a call to `generate-images-vertex.mjs --inspiration-only` immediately after `generate-prompts.mjs` completes:
   - Wrap with try/catch — if Imagen quota is hit or API fails, log a warning and continue (do not abort the whole daily run)
   - Add a `--no-inspiration-images` skip flag (same pattern as `--no-story-reel`, `--no-animal-brief`)
   - Respect `DRY_RUN` — print the command but don't execute

**Imagen prompt quality rules (critical — do not skip):**
- Each prompt sent to Imagen must be the full prompt text from `prompts-YYYY-MM-DD.md` for that slot — do NOT truncate or summarize
- Prompts already include vertical format language (1080×1500 or portrait framing) — preserve this
- Model to use: Imagen 4.0 (`imagen-4.0-generate-001`) — same as used for Story Reel V2 images. Check `generate-story-reel-images.mjs` for the exact API call pattern and mirror it
- Aspect ratio: `9:16` or `2:3` portrait — check what Story Reel V2 uses and use the same

**Output contract:**
```
output/raw/fact-card/fact-card-YYYY-MM-DD.png
output/raw/challenge/challenge-YYYY-MM-DD.png
output/raw/quiet/quiet-YYYY-MM-DD.png
output/raw/printable/printable-YYYY-MM-DD.png
output/raw/identity/identity-YYYY-MM-DD.png
```
These must land in the correct `output/raw/{slot}/` subfolder so `npm run import:raw` picks them up automatically on Step 5.

**Validation (how to know it worked):**
```bash
node scripts/daily-run.mjs --dry-run
# Should print the generate-images-vertex call with --inspiration-only

node scripts/generate-images-vertex.mjs --inspiration-only --dry-run
# Should print 5 slot names + prompt previews without making any API calls
```

**Do NOT change:**
- `generate-prompts.mjs` prompt logic
- `import:raw` — it already handles these folders
- Story Reel V2 image generation path
- Any existing Imagen usage in other scripts
- Puffin benchmark polish added a second durable rule on 2026-05-07: the final expanded Animal Facts moment should usually be a clear emotional/factual payoff image, not merely a generic return-flight or scenic hold. Future episodes should end on home/family/food-delivery resolve when the material supports it.

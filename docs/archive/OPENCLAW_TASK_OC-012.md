# OpenClaw Task — OC-012: Challenge Reel Visual Tuning

Date assigned: 2026-04-30
Depends on: OC-004 (`ActivityChallenge` composition + animated solve-reveal) — already complete
Audit required: Yes — write audit report at `docs/OPENCLAW_REPORT_2026-xx-xx_task-oc-012.md` when done

---

## Context

The `ActivityChallenge` Remotion composition renders a puzzle challenge reel. The animated solve-reveal was validated end-to-end and confirmed working (commit `solve-reveal`, render `ActivityChallenge-1777406858199.mp4`, 1500 frames, 50.0s @ 30fps).

The engine is structurally correct. This task is a **visual polish pass** — no architectural changes. The goal is to make the reel look production-quality at the Phase 0 posting standard (10 posts/day target).

---

## Files in scope

- `remotion/compositions/ActivityChallenge.jsx` — main composition
- `remotion/components/` — any sub-components used by ActivityChallenge (check imports)
- `scripts/generate-activity-video.mjs` — entry point that builds inputProps and calls render
- `config/` — any relevant theme or activity config consumed by the composition

Do NOT touch:
- `scripts/lib/puzzle-post-renderer.mjs` — puzzle image post pipeline (separate lane)
- `remotion/compositions/AsmrReveal.jsx` — ASMR lane (separate task OC-014)
- Any longform compositions (StoryLongFormEpisode, AnimalFactsEpisode, PuzzleCompilation)

---

## What to tune

Work through these in order. Each has a clear acceptance criterion.

### 1. Title size and weight
- Current state: unknown until you read the composition
- Target: title text should read clearly on a phone screen at full bleed. If it looks small or thin at 1080×1920, increase font size and/or font weight.
- Criterion: title is immediately readable without zooming

### 2. Countdown prominence
- The reel likely has a countdown (3-2-1 or similar) before the solve reveal
- Target: countdown numbers should feel energetic and large — they are the primary emotional hook before the solve
- Check: are they centered, large enough, and do they have enough contrast against the background?
- Criterion: countdown is unmissable; feels like a game show moment, not a subtitle

### 3. Transition cue feel
- The cut from the puzzle challenge display to the animated solve should feel intentional
- If there is a hard cut with no visual signal, add a brief flash, pulse, or scale pop to the transition moment (1–3 frames is enough)
- Do NOT add crossfade — hard cuts only (locked rule)
- Criterion: transition moment reads as a payoff beat, not an abrupt jump

### 4. Audio balance
- Check that the audio mix in `generate-activity-video.mjs` (or composition) is not too loud/soft
- The reel likely uses the shared `assets/audio/` pool — confirm the correct audio file is wired and the volume level is not jarring
- Criterion: audio feels energetic but not peaky; consistent with the ASMR lane volume conventions

### 5. Per-type pacing
- The `ActivityChallenge` composition should handle both maze and word-search types
- Verify the total duration feels right for each type: maze solve should feel like a satisfying path draw; word-search solve should feel like word-by-word reveals
- If the solve phase is too fast or too slow for one type, check if there is a per-type duration configuration and tune it
- Criterion: both types feel paced correctly — not rushed, not padded

---

## Verification

Run at minimum:
```
node scripts/generate-activity-video.mjs --theme "Ocean Animals" --difficulty medium --type maze
node scripts/generate-activity-video.mjs --theme "Dinosaurs" --difficulty easy --type wordsearch
```

Or equivalent render-video.mjs calls if generate-activity-video.mjs is not the entry point for challenge reels.

Both renders must exit 0 with a valid `.mp4` output.

---

## Audit report

Write `docs/OPENCLAW_REPORT_2026-xx-xx_task-oc-012.md` with:
- What you changed and why (one paragraph per tune item)
- What renders you ran and their exit codes
- Any limitations (things you could not visually verify in-session)
- Any flags for Claude (unresolved judgment calls or tradeoffs)

Claude will audit and stamp APPROVED / PARTIALLY APPROVED / REJECTED.

---

## Full roadmap reference

The complete sprint plan is in `docs/TASKS.md` under `## ACTIVE SPRINT — DUAL TRACK (2026-04-30)`.

Sprint 1 tasks in order: OC-012 (this task) → OC-013 (word-search solve validation) → OC-014 (ASMR live test) → OC-015 (reel wiring to daily scheduler).

Sprint 2 (next week): OC-016 matching generator, OC-017 find-the-difference generator, OC-018 coloring image post wrapper.

Sprint 3 (week 3): OC-019 tracing/dot-to-dot, OC-020 crossword, OC-021 theme-family centralization.

After Sprint 1 all 4 daily reel lanes will be live. After Sprint 3 all 6 puzzle types will be in the image post pipeline. That is the Phase 0 gate unlock condition.

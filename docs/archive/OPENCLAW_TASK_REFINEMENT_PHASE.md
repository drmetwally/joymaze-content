# OpenClaw Task — Refinement Phase (REF-001 through REF-004)

Date assigned: 2026-05-01
Build sprint: COMPLETE — all 6 generators live
Mode: Refinement, QC, automation wiring. No new generators.
Audit: Claude approves each REF before you proceed to the next.

---

## Execution order

```
REF-004 → REF-002 → REF-003 → REF-001
```

REF-004 first (one coding task), then validation and QC. Each task ends
with an AGENT_LOG entry. Claude stamps each one before you start the next.

---

## REF-004 — Wire deterministic coloring into ASMR bridge

**What:** The maze ASMR bridge (OC-014B) established a pattern: `render-video.mjs --comp AsmrReveal --challenge <generated-folder>` reads `activity.json`, resolves `blank.png` + reveal file, and renders the ASMR video without a manual copy step. Coloring generators produce `blank.png` + `colored.png` in the same contract. This task verifies the bridge works for coloring and fixes it if it doesn't.

**Step 1 — Test the bridge as-is:**
```
node scripts/render-video.mjs --comp AsmrReveal \
  --challenge output/challenge/generated-activity/oc-018-ocean-coloring-test \
  --out output/videos/ref-004-coloring-asmr-test.mp4
```

If this exits 0 and the thumbnail shows the coloring page — the bridge already works. Document the result.

**Step 2 — If it works:** No code changes needed. Add a note to `generate-asmr-brief.mjs` comment block that generated coloring folders can be rendered directly via `--comp AsmrReveal --challenge`. Done.

**Step 3 — If it fails:** Read the error. The likely cause is `activityJsonToProps()` in `render-video.mjs` not recognizing `puzzleType: 'coloring'` for `revealType`. Fix: in `activityJsonToProps()`, add coloring handling analogous to the maze case — `revealType: 'coloring'`, resolve `blank.png` + `colored.png`. Do NOT change the existing AI-ASMR path in `generate-asmr-video.mjs` — that path uses AI-generated assets and stays separate.

**Audit gate:** Claude reads `ref-004-coloring-asmr-test.mp4` exit code + thumbnail description in your report. If bridge works, REF-004 closes in one step.

**Output:** AGENT_LOG entry covering exit code, any fix applied or not, and the verified command.

---

## REF-002 — Daily scheduler validation

**What:** Confirm `daily-scheduler.mjs` correctly calls all generators, all referenced scripts exist, and the step chain runs without errors for a typical non-Monday run.

**Step 1 — Syntax check all scripts called by the scheduler:**
```bash
# Find every script the scheduler calls and check it
node --check scripts/daily-scheduler.mjs
node --check scripts/generate-prompts.mjs
node --check scripts/generate-story-ideas.mjs
node --check scripts/generate-asmr-brief.mjs
node --check scripts/generate-challenge-brief.mjs
node --check scripts/generate-x-posts.mjs
node --check scripts/archive-queue.mjs
node --check scripts/generate-maze-assets.mjs
node --check scripts/generate-wordsearch-assets.mjs
node --check scripts/generate-matching-assets.mjs
node --check scripts/generate-find-diff-assets.mjs
node --check scripts/generate-coloring-assets.mjs
node --check scripts/generate-dottodot-assets.mjs
node --check scripts/generate-puzzle-image-post.mjs
```

Report any syntax errors.

**Step 2 — Check puzzle-post manifest wiring:**
The scheduler calls `generate-puzzle-image-post.mjs` in manifest-driven mode. Confirm that:
- `matching`, `find-diff`, `coloring`, `dot-to-dot` are listed in `SUPPORTED_TYPES` (or equivalent) inside `generate-puzzle-image-post.mjs`
- All 6 puzzle types are callable via `--type <type>` without errors

Run dry-run for each new type:
```
node scripts/generate-puzzle-image-post.mjs --type matching --theme "Ocean Animals" --dry-run
node scripts/generate-puzzle-image-post.mjs --type find-diff --theme "Ocean Animals" --dry-run
node scripts/generate-puzzle-image-post.mjs --type coloring --theme "Ocean Animals" --dry-run
node scripts/generate-puzzle-image-post.mjs --type dot-to-dot --theme "Ocean Animals" --dry-run
```

If any of these error with "unsupported type" or similar — add the missing type to the supported list. Follow the existing pattern for `maze` and `wordsearch`.

**Step 3 — Run the scheduler with minimal steps:**
```
node scripts/daily-scheduler.mjs --now --no-story --no-story-reel --no-asmr --no-challenge --no-animal-brief
```

This should run: archive → prompts → x-posts. Confirm step count and exit 0.

**Audit gate:** Claude reviews your syntax check results + dry-run output. If all 6 types are callable and scheduler exits 0 on the minimal run, REF-002 is done.

**Output:** AGENT_LOG entry listing which types needed adding to `SUPPORTED_TYPES` (if any), dry-run results for all 6 types, and scheduler minimal run exit code.

---

## REF-003 — Image post quality pass

**What:** Generate `post.png` for all 6 puzzle types across 3 themes and report on visual quality. Claude reads all 18 images and flags any that need fixing.

**Step 1 — Generate the sample grid:**

Run each of the following. These are the 18 sample posts (6 types × 3 themes):
```bash
# Maze
node scripts/generate-puzzle-image-post.mjs --type maze --theme "Ocean Animals" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type maze --theme "Space" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type maze --theme "Dinosaurs" --difficulty medium

# Word search
node scripts/generate-puzzle-image-post.mjs --type wordsearch --theme "Ocean Animals" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type wordsearch --theme "Space" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type wordsearch --theme "Animals" --difficulty medium

# Matching
node scripts/generate-puzzle-image-post.mjs --type matching --theme "Ocean Animals" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type matching --theme "Space" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type matching --theme "Animals" --difficulty medium

# Find-diff
node scripts/generate-puzzle-image-post.mjs --type find-diff --theme "Ocean Animals" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type find-diff --theme "Space" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type find-diff --theme "Animals" --difficulty medium

# Coloring
node scripts/generate-puzzle-image-post.mjs --type coloring --theme "Ocean Animals" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type coloring --theme "Space" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type coloring --theme "Animals" --difficulty medium

# Dot-to-dot
node scripts/generate-puzzle-image-post.mjs --type dot-to-dot --theme "Ocean Animals" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type dot-to-dot --theme "Space" --difficulty medium
node scripts/generate-puzzle-image-post.mjs --type dot-to-dot --theme "Animals" --difficulty medium
```

**Step 2 — Collect output paths:**
Each run writes a `post.png` into its activity folder under `output/challenge/generated-activity/`. In your AGENT_LOG entry, list every output path so Claude can read them.

**Step 3 — Self-audit before logging:**
For each post.png, note:
- Does the title badge render? Is text truncated?
- Does the puzzle fill the canvas zone, or is there dead space?
- Any obvious rendering errors (white box, missing image)?

Flag anything that looks wrong before Claude's review.

**Audit gate:** Claude reads all 18 `post.png` files and stamps issues. OpenClaw fixes any flagged items, re-generates, re-submits. REF-003 closes when all 18 look production-ready.

**Output:** AGENT_LOG entry with all 18 output paths + self-audit notes.

---

## REF-001 — Challenge reel renders for all puzzle types

**What:** Render challenge reels for all 6 puzzle types so Ahmed can watch them before first production posting. Also catches any type-specific rendering bugs.

**Step 1 — Render all 6 types:**
```bash
# Use the test folders already generated; or generate fresh ones first

node scripts/render-video.mjs --comp ActivityChallenge \
  --challenge output/challenge/generated-activity/ocean-animals-maze-post-medium \
  --out output/videos/ref-001-maze-challenge.mp4

node scripts/render-video.mjs --comp ActivityChallenge \
  --challenge output/challenge/generated-activity/ocean-animals-wordsearch-post-medium \
  --out output/videos/ref-001-wordsearch-challenge.mp4

node scripts/render-video.mjs --comp ActivityChallenge \
  --challenge output/challenge/generated-activity/matching-round2-test \
  --out output/videos/ref-001-matching-challenge.mp4

node scripts/render-video.mjs --comp ActivityChallenge \
  --challenge output/challenge/generated-activity/find-diff-round2-test \
  --out output/videos/ref-001-finddiff-challenge.mp4

node scripts/render-video.mjs --comp ActivityChallenge \
  --challenge output/challenge/generated-activity/oc-018-ocean-coloring-test \
  --out output/videos/ref-001-coloring-challenge.mp4

node scripts/render-video.mjs --comp ActivityChallenge \
  --challenge output/challenge/generated-activity/oc-019-ocean-dottodot-test \
  --out output/videos/ref-001-dottodot-challenge.mp4
```

If any challenge folder doesn't exist, generate it first:
```
node scripts/generate-<type>-assets.mjs --theme "Ocean Animals" --difficulty medium
```

**Step 2 — Report exit codes and frame counts:**
For each render, report:
- Exit code (0 = pass)
- Duration (frames at 30fps = X seconds)
- Whether it's within the 25–35s locked band
- Any errors or warnings in the console

**Step 3 — Timing fix (if needed):**
If any type renders outside the 25–35s band, check the `countdownSec` in its `activity.json` and adjust. Do NOT change the Remotion compositions — adjust the generator's `countdownSec` value only.

**Audit gate:** Claude reviews exit codes + durations from your report. Ahmed must physically watch all 6 MP4s before the first production post of each type. Note which ones are Ahmed-pending in your log entry.

**Output:** AGENT_LOG entry with all 6 render results (exit code, duration, in-band Y/N). Thumbnail descriptions optional but helpful.

---

## Post-refinement cleanup (optional — do only if time allows)

**OC-021 — Theme-family centralization:**
`resolveThemeFamily()` is currently copy-pasted into `generate-matching-assets.mjs`, `generate-find-diff-assets.mjs`, `generate-coloring-assets.mjs`, and `generate-dottodot-assets.mjs`. Extract into `scripts/lib/theme-family.mjs` and import in all 4.

This is pure tech debt, no behavior changes. Only do it if all 4 REF tasks are closed. If you run out of time, leave it — it is not blocking anything.

---

## Audit report

Write `docs/OPENCLAW_REPORT_2026-05-01_refinement-phase.md` after all 4 REF tasks complete, covering:
- REF-004: coloring ASMR bridge — worked/fixed, command confirmed
- REF-002: which types were missing from `SUPPORTED_TYPES`, scheduler exit code
- REF-003: any post.png issues found + fixed, or "all 18 clean"
- REF-001: all 6 render exit codes + durations, Ahmed QC status
- OC-021: done or deferred

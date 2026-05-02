# OpenClaw Seam Map — OC-014B ASMR Generator Integration

Date: 2026-04-30
Status: Planning / handoff only
Owner intent: integrate the new puzzle-generator + art-layer pipeline into ASMR for the visually strong lanes, especially maze and coloring. De-prioritize word-search ASMR.

---

## Product direction locked from user clarification

1. **Coloring ASMR live test is already done** and the video was posted socially.
2. **Maze ASMR is already in a good state.**
3. **Word-search should be dropped as an ASMR priority** because challenge reels are the better home for word-search solving.
4. The real next move is **generator-to-ASMR integration**, not more ASMR validation.

This means OC-014 should now be treated as validated, and the practical follow-up is **OC-014B**.

---

## Current architecture, split by lane

### A. New deterministic puzzle pipeline
Current strong lane for maze and image posts.

**Maze generator**
- `scripts/generate-maze-assets.mjs`
- emits generated folders under `output/challenge/generated-activity/<slug>/`
- writes:
  - `activity.json`
  - `maze.json`
  - `path.json`
  - `blank.svg`
  - `blank.png`
  - `puzzle.png`
  - `solved.svg`
  - `solved.png`

**Image-post art layer**
- `scripts/generate-puzzle-image-post.mjs`
- `scripts/lib/puzzle-post-renderer.mjs`
- consumes generator output and builds polished social post wrappers

**Challenge reel lane**
- `scripts/render-video.mjs`
- `remotion/compositions/ActivityChallenge.jsx`
- already consumes the generated-activity contract cleanly

### B. Existing ASMR lane
Older manual-folder lane that still assumes assets are dropped into `output/asmr/<slug>/`.

**Brief generator**
- `scripts/generate-asmr-brief.mjs`
- still rotates `coloring`, `maze`, `wordsearch`, `dotdot`
- still creates manual `output/asmr/<type>-<slug>/` folders with `activity.json` + `brief.md`

**Video renderer**
- `scripts/generate-asmr-video.mjs`
- `scripts/render-video.mjs`
- `remotion/compositions/AsmrReveal.jsx`

**Current ASMR assumptions**
- maze expects manual image pair plus `path.json`
- coloring expects manual image pair only
- assets are still folder-first, not generator-first

---

## Important seam mismatches found

### 1. Folder model mismatch
The new puzzle generators write to:
- `output/challenge/generated-activity/...`

The ASMR lane expects:
- `output/asmr/...`

So there is no shared contract yet. Right now they are parallel systems.

### 2. Maze filename mismatch (added by Claude audit)

`generate-asmr-video.mjs` expects **`maze.png`** as the blank maze asset for ASMR (lines 1105, 1261, 1321 — the file pairs are `['blank.png', 'colored.png']` for coloring and `['maze.png', 'solved.png']` for maze).

The new deterministic maze generator writes **`blank.png`**, not `maze.png`.

This must be fixed in OC-014B before any maze bridge will work. Recommended approach: update the ASMR maze file resolution to accept `blank.png` (canonical new name) with `maze.png` as a legacy fallback.

### 3. Coloring filename mismatch
There is a real naming mismatch across the current ASMR lane:
- `generate-asmr-video.mjs` Remotion path expects **`blank.png` + `colored.png`** for coloring
- `scripts/render-video.mjs` generic `activityJsonToProps()` defaults to **`blank.png` + `solved.png`**
- some old ASMR brief text also refers to `solved.png` for coloring instead of `colored.png`

This needs to be normalized before integration work starts, or future agents will create the wrong files.

### 4. Word-search ASMR is stale product-wise
The code still supports word-search ASMR:
- `WordSearchReveal.jsx`
- `extract-wordsearch-path.mjs`
- `generate-asmr-brief.mjs` rotation includes `wordsearch`

But per the clarified product direction, this should no longer drive roadmap effort. It can stay in code for now, but should be treated as dormant and removed from active planning/rotation.

### 5. ASMR brief generator still reflects the old product mix
`generate-asmr-brief.mjs` still defaults to a rotation that includes word-search and dot-to-dot. The new direction is narrower: prioritize the visually satisfying lanes, especially maze and coloring.

---

## Recommended target contract for OC-014B

Do **not** try to make ASMR invent a separate asset language. Reuse the new puzzle pipeline contract wherever possible.

### Maze target contract
The ASMR lane should be able to render directly from a generated maze folder using:
- `activity.json`
- `blank.png`
- `solved.png`
- `path.json`

That means the best maze integration shape is probably one of:

#### Option A — direct generated-folder render
Teach the ASMR renderer to accept a generated maze folder directly.
Pros:
- least duplication
- one source of truth
- no copy step

Cons:
- requires a clean bridge between challenge-style activity metadata and ASMR-style props

#### Option B — bridge/copy step into `output/asmr/`
Add a small bridge script that materializes an ASMR-ready folder from generated maze output.
Pros:
- safer if ASMR still wants its own folder semantics
- easier rollout

Cons:
- duplicates files
- weaker long-term architecture

**Recommendation:** prefer **Option A** unless a hard blocker appears.

### Coloring target contract
Coloring is different because there is no deterministic coloring generator yet in the new puzzle factory.

So coloring integration should likely be **two-stage**:

#### Stage 1
Normalize the existing ASMR coloring folder contract so it is consistent and can also feed the image-post lane later.
Suggested minimum canonical pair:
- `blank.png`
- `colored.png`

#### Stage 2
When coloring generator work lands, align it to the same art-layer assumptions used by ASMR and the future coloring post wrapper.

This ties directly to:
- **OC-018** — coloring image-post wrapper

---

## Best implementation order

### Phase 1 — Maze bridge first
Why first:
- deterministic generator already exists
- ASMR maze is already visually good
- path extraction / solver behavior already exists
- this is the cleanest proof that generator → ASMR integration works

### Phase 2 — Coloring contract cleanup
Before deeper integration:
- pick one canonical solved filename, ideally `colored.png` for coloring
- fix any stale brief/doc references
- make ASMR and future post wrapper agree on the same coloring asset assumptions

### Phase 3 — Coloring art-layer integration
Once naming is clean:
- align coloring ASMR inputs with the same art-layer expectations that OC-018 will use
- optionally later add crayon/cursor logic, but that is polish, not the seam itself

### Explicit non-goal for this task
- do **not** spend more time on word-search ASMR

---

## Suggested concrete OC-014B implementation tasks

1. **Maze path, first pass**
   - add a direct generated-folder ASMR render path for maze
   - consume `blank.png`, `solved.png`, `path.json`, and the generated `activity.json`
   - prove with one render from `output/challenge/generated-activity/...`

2. **Coloring contract cleanup**
   - normalize `colored.png` vs `solved.png`
   - update stale brief text and any conflicting defaults

3. **Coloring integration seam**
   - define how coloring source assets will be shared between ASMR and OC-018 post wrapper
   - keep this contract simple and explicit

4. **Rotation/product cleanup**
   - remove word-search from active ASMR planning and default brief rotation
   - keep code dormant if deletion is not worth the churn yet

---

## Recommendation to the next agent

If starting implementation, do **maze-only first** in one scoped pass.
Do not combine maze integration, coloring filename cleanup, and coloring wrapper design in a single diff unless absolutely necessary.

The most leverage comes from proving:
- generated maze folder -> ASMR render

Once that is clean, coloring can follow with much less ambiguity.

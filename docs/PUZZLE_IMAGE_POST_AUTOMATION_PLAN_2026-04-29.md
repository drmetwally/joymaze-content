# Puzzle Image Post Automation Plan — 2026-04-29

## Goal

Turn the puzzle engines into a reliable daily image-post production lane.

Target output for each puzzle post:
- a **printable, solvable puzzle master**
- a **social-ready themed wrapper image** for engagement and downloads
- metadata that drops cleanly into the existing queue/import flow

This lane should become the production path for the 5 daily activity image posts.

---

## Locked direction

For puzzle image posts, keep responsibilities separated:

1. **Deterministic engine owns puzzle truth**
   - solvable structure
   - readability
   - difficulty
   - solution data

2. **Art layer owns polish only**
   - decorative frame
   - themed background motifs
   - characters / stickers / scene flavor
   - download / engagement wrapper treatment

3. **AI image generation must not own puzzle logic**
   - Imagen or similar can help with the wrapper
   - it should not invent the actual maze path, grid, or answer logic

---

## Why this is the right next move

Maze and word-search challenge reels are now mature enough to serve as the first production puzzle engines.

That means the highest-value next step is not another reel polish cycle. It is to convert those engines into the daily image-post lane, because:
- there are 5 daily activity image slots already in the system
- image-post automation is a major Phase 0 throughput win
- the same generator contracts can later feed reels, printables, lead magnets, and KDP workflows

---

## Image-post architecture

### Current manual image-post flow

Today the activity image lane is effectively:
1. `generate-prompts.mjs` decides the 5 activity slots and themes
2. Ahmed creates puzzle images manually into `output/raw/{type}/`
3. `import-raw.mjs` turns those images into queue metadata
4. queue posts flow through captions / posting / archive

### New target flow

1. `generate-prompts.mjs` still decides the 5 activity slots and themes
2. puzzle engine generates the **clean puzzle master**
3. wrapper stage generates the **social-ready post image**
4. export step writes files into the same downstream places the current pipeline already expects
5. `import-raw.mjs` continues to work with minimal disruption, or a small new import seam is added if cleaner

Principle: **replace manual puzzle image creation first, not the whole downstream posting system**.

---

## Required outputs per puzzle post

For each generated activity post, the system should emit at least:

### A. Puzzle master assets
- `puzzle.png`
- `blank.png` when relevant
- `solved.png` when relevant
- structure JSON (`maze.json`, `wordsearch.json`, etc.)
- `activity.json`

### B. Social wrapper assets
- `post.png` — final social-ready image for queue/import
- optional `post-alt.png` variants later for platform-specific sizing

### C. Queue/import metadata
- category (`activity-maze`, `activity-word-search`, etc.)
- theme
- title / hook candidate
- printable CTA metadata
- path back to the source generator folder

---

## Phase 1 scope — start with image posts

### First production types
1. Maze
2. Word Search

These are first because they already have the strongest engine maturity and the clearest solved/unsolved contracts.

### Phase 1 objective
Automate **2 of the 5 daily activity image posts** with quality high enough that manual creation is no longer preferred for those two types.

Success means:
- a daily theme can be selected automatically
- a printable puzzle is generated automatically
- a polished social wrapper image is generated automatically
- the result enters the existing queue flow without manual Photoshop/Gemini puzzle building

---

## Wrapper strategy

There are two acceptable wrapper modes.

### Mode A — internal wrapper first
Use deterministic composition only:
- puzzle page centered
- branded border/frame
- themed icon pack / decorative stickers
- CTA badge
- download/save framing

Pros:
- fully reliable
- fully automatable
- preserves puzzle readability

### Mode B — Imagen-assisted wrapper second
Use the deterministic puzzle page as fixed content, then add AI-assisted thematic polish around it.

Pros:
- stronger emotional appeal
- closer parity with image-post style system

Risk:
- can damage readability if AI touches the puzzle area itself

### Recommended order
Build **Mode A first**, then add **Mode B as an optional enhancement layer**.

That gives JoyMaze a production-safe lane before experimenting with prettier wrappers.

---

## Integration seam recommendation

The cleanest near-term seam is:

### Generator layer
- `scripts/generate-maze-assets.mjs`
- `scripts/generate-wordsearch-assets.mjs`

### New wrapper/export layer
Suggested new script family:
- `scripts/generate-puzzle-image-post.mjs`
- later maybe `scripts/lib/puzzle-post-wrapper.mjs`

Responsibilities:
- read the generated activity folder
- apply wrapper layout
- output final `post.png`
- write minimal metadata for import/queue

### Downstream handling
Two good options:

#### Option 1 — keep `import-raw.mjs` as the import seam
Write final post images into the folders it already expects:
- `output/raw/maze/`
- `output/raw/wordsearch/`

#### Option 2 — add a direct puzzle-post queue writer
Skip raw-image mimicry and write queue-ready metadata directly.

### Recommendation
Start with **Option 1**.

Reason:
- lower risk
- smaller code surface
- preserves the current queue/caption/posting chain while the new lane proves itself

---

## Image-post quality rules

The final post image should feel like JoyMaze content, not a sterile export.

Required:
- puzzle remains readable at social size
- wrapper supports the same theme family as the daily visual system
- printable/download value is obvious at a glance
- CTA framing is present but not spammy
- the puzzle itself occupies the visual center of value

Avoid:
- cluttered art that reduces solvability
- AI repainting over letters, paths, cells, or answer-critical lines
- making the wrapper louder than the puzzle itself

---

## Build order after Phase 1

Once maze + word-search image-post automation is stable:
1. Matching
2. Find the Difference
3. Coloring
4. Tracing / Dot-to-Dot

At that point, the 5 daily activity image slots can become mostly or fully automated from first-party puzzle engines.

---

## Immediate implementation plan

### Section 1 — Image-post workflow structure
- map current activity image-post contract
- define final export contract for puzzle posts
- choose wrapper seam
- preserve import/queue compatibility

### Section 2 — Maze image-post automation
- generate clean puzzle master
- compose social wrapper
- export into current raw/import path
- validate queue behavior

### Section 3 — Word-search image-post automation
- same as maze
- maintain readability and current reveal-compatible structure

### Section 4 — Remaining puzzle engines
- matching
- find-the-difference
- coloring
- tracing / dot-to-dot

---

## Immediate next task recommendation

### TASK-OC-008 — Puzzle Image Post Workflow Structure
Scope:
- document the exact contract for automated activity image posts
- define where puzzle masters live
- define where wrapped social posts land
- define how the current `generate-prompts -> import-raw -> queue` flow should be preserved
- choose the first implementation seam for maze + word-search

### TASK-OC-009 — Maze + Word Search Image Post Integration
Scope:
- implement the first automated image-post path for maze and word-search
- export final social-ready images into the current downstream flow
- prove one full daily-slot pass works without manual puzzle image creation

---

## Status call

The right priority is now:

**workflow structure first, then image-post automation, then the remaining puzzle engines**.

That sequence gives JoyMaze the biggest near-term production win without risking quality.

# JoyMaze Operating Map — 2026-04-23

Read-only planning map created from repo audit + user context.
No code changes are proposed in this document.

---

## 1. Purpose of the repo

JoyMaze-Content is a hybrid content engine for the JoyMaze kids activity brand.

Its real operating goal is:
- generate better content for the brand across multiple social channels,
- automate as much as is safe and worthwhile,
- keep quality high through human curation,
- improve outputs over time through intelligence, audits, and competitor/trend learning,
- stay within account limits, API access limits, and budget constraints.

This is not a pure full-auto engine.
It is a human-guided, machine-assisted production system.

---

## 2. Current strategic phase

### Locked reality
The system is currently in a transitional operating phase:
- quality-first creative workflow,
- partial automation,
- manual warmup for new/sensitive platforms,
- cloud posting only where platform/account state is stable enough,
- weekly intelligence feedback intended to improve daily generation.

### Current posting reality
- **YouTube:** cloud posting live
- **X:** manual warmup until 2026-04-26, automation intentionally disabled
- **Pinterest / Instagram / TikTok:** not fully cloud-owned yet due to account/API reality

### Current production reality
- daily ideas/prompts/briefs are generated automatically,
- Ahmed manually creates images/audio where quality matters,
- assets are dropped into the expected folders,
- queue/caption/push steps support manual posting and selective cloud posting,
- Monday intelligence refresh is intended to improve the engine each week.

---

## 3. The real workflow today

### Daily lane
1. `npm run daily`
   - archive prior queue state
   - generate prompts
   - generate story idea / ASMR brief / X text queue
   - Monday only: refresh intelligence + trends
2. Ahmed manually generates images/audio in Gemini/ChatGPT/Suno as needed
3. Assets dropped into `output/raw/`, `output/asmr/`, `output/stories/`, etc.
4. `npm run import:raw`
   - brand/export/queue creation
5. `npm run generate:captions`
   - queue metadata enriched with captions
6. `npm run brief`
   - manual posting helper during warmup/manual phase
7. Manual posting for most platforms
8. Push repo state where cloud jobs need queue/media metadata
9. YouTube cloud posting continues where enabled

### Weekly lane
Monday flow is intended to:
- collect intelligence/trends/competitor signals,
- update dynamic pools,
- feed those pools back into daily generation.

### Longform lane
Separate from daily production:
- story longform,
- animal facts,
- puzzle compilations.

Current next planned build direction from user:
- build a ~60 minute YouTube longform compilation from ASMR/puzzle shorts,
- then stop major building and shift focus to quality + efficiency improvement.

---

## 4. Core system lanes

The repo is easier to reason about as 7 parallel lanes:

1. **Daily generation lane**
   - prompts, briefs, X text generation
2. **Manual creative lane**
   - Gemini / ChatGPT / Suno / human curation
3. **Import + queue lane**
   - branded exports, queue objects, Cloudinary links
4. **Caption lane**
   - platform-tailored caption generation
5. **Posting lane**
   - manual warmup + selective cloud automation
6. **Weekly intelligence lane**
   - trends, competitor research, dynamic pool updates
7. **Longform lane**
   - story, animal facts, puzzle compilations

These lanes overlap, but they should not be treated as one single blob.

---

## 5. State ownership model

The most important planning insight is that the repo contains multiple kinds of state.
They should not all be judged by the same standard.

### A. Static source
Files that behave like source code or durable instructions.

Examples:
- `scripts/`
- `remotion/`
- `templates/`
- most `docs/`
- stable config like `config/platforms.json`, `config/hashtags.json`, `config/psychology-triggers.json`

Expected writer:
- humans / coding agents

Risk if changed carelessly:
- code breakage / workflow breakage

---

### B. Curated strategic memory
Files that are intentionally evolved by humans over time.

Examples:
- `MEMORY.md`
- `docs/TASKS.md`
- `docs/SESSION_LOG.md`
- `docs/CHAT_LOG.md`
- `CLAUDE.md`, `CODEX.md`, process docs

Expected writer:
- humans + agents, intentionally

Risk if changed carelessly:
- decision loss / confusion / drift in how agents operate

---

### C. Generated intelligence state
These are not plain config files.
They are evolving machine-assisted memory pools.

Examples:
- `config/content-intelligence.json`
- `config/competitor-intelligence.json`
- `config/hooks-library.json`
- `config/theme-pool-dynamic.json`
- `config/pattern-interrupt-dynamic.json`
- `config/trends-this-week.json`
- `config/x-post-topics-dynamic.json`
- `config/performance-weights.json`

Expected writer:
- intelligence scripts,
- sometimes humans/agents,
- effectively multiple brains on one project

Important note:
Current merge markers in some of these files should not be interpreted only as "bad conflicts".
They also indicate that these files are shared-write zones and need a clearer operating model.

Risk if changed carelessly:
- degraded prompt quality,
- stale or contradictory intelligence,
- parser/runtime failures,
- hard-to-trust weekly learning loop.

---

### D. Runtime / output state
Operational files produced and consumed by the workflow.

Examples:
- `output/queue/`
- `output/prompts/`
- `output/archive/`
- `output/videos/`
- `output/stories/`
- `output/asmr/`
- `output/daily-output-log.json`
- `output/posting-cooldown.json`

Expected writer:
- scripts + humans dropping creative assets

Risk if changed carelessly:
- operational confusion,
- broken posting flow,
- accidental reprocessing,
- loss of resume-safe state.

---

## 6. Shared-write zones that need organization

These areas are currently valid but fragile:

### Zone 1: Dynamic intelligence pools
Problem:
- multiple writers,
- versioned in git,
- partly generated, partly curated,
- easy to conflict,
- directly influence prompt/caption quality.

Planning interpretation:
- this zone needs an ownership model,
- not just blunt "resolve all conflicts" cleanup.

Questions for later planning:
- which files are replaceable snapshots?
- which are mergeable memory pools?
- which should only be updated by one script path?
- which should allow human review before promotion?

### Zone 2: Run ownership
Current target = 100% cloud posting ownership eventually.
Current reality = hybrid manual/cloud.

This is acceptable for now, but the system should clearly label:
- current owner,
- future owner,
- paused owner,
- fallback owner.

### Zone 3: Script side effects
Several scripts do more than their names suggest.
Examples:
- render scripts also mutate episode metadata
- posting scripts also mutate queue/post state
- intelligence scripts write directly into pools

This is workable, but must be understood before debugging or cleanup.

---

## 7. What is working well

1. The repo has a real pipeline architecture, not random scripts.
2. Documentation and memory discipline are strong.
3. The system is improving in quality over time through audits and human review.
4. The hybrid workflow is grounded in reality, not wishful automation.
5. Queue-based state makes the workflow inspectable.
6. Longform work is already separated enough to function as its own lane.
7. The operator has a clear north star: better content quality first, automation second.

---

## 8. What is fragile right now

1. Shared-write intelligence files are not clearly classified.
2. Some dynamic pool files currently contain merge markers and should be treated as sensitive planning/state territory.
3. Orchestration ownership is transitional, which can look like drift if not documented clearly.
4. Several core scripts are mutation-heavy, so broad debugging could accidentally rewrite live state.
5. Manual quality curation is currently essential; replacing it too early would hurt output quality.

---

## 9. Puzzle compilation lane, current status

### What exists now
The puzzle compilation path is already partially built:
- `scripts/generate-puzzle-compilation.mjs`
- `remotion/compositions/PuzzleCompilation.jsx`
- npm aliases already exist in `package.json`
- Task board shows Track C planned but blocked on enough ASMR folders/assets

### What the current planner does
`generate-puzzle-compilation.mjs`:
- scans `output/asmr/`
- looks for valid activity folders with `activity.json`, `blank.png`, `solved.png`
- picks a batch of activities
- creates `compilation.json`
- targets roughly 60 minutes using many short chapters

### What the current composition does
`PuzzleCompilation.jsx`:
- chapter title card
- then reuses `AsmrReveal`
- currently maps chapter activity folders into a long sequential render

### Planning implication
This is a valid next build target because:
- it extends an already-started lane,
- it uses existing ASMR assets and logic,
- it aligns with YouTube, the most stable cloud lane.

### Constraint
Track C depends on enough usable ASMR/puzzle folders existing first.

---

## 10. Recommended next planning sequence

### Step 1 — Finish planning artifact phase
Before debugging or cleanup, define:
- source vs generated-intelligence vs runtime state,
- which files are safe to regenerate,
- which files require review,
- which files are shared-write by design.

### Step 2 — Treat puzzle compilation as the last major build push
User-stated direction:
- build the ~60 minute YouTube longform compilation next,
- then stop building new major capabilities.

This is a good sequencing decision.
It avoids endless architecture churn.

### Step 3 — After puzzle compilation, shift to quality and efficiency mode
Focus areas after build phase should be:
- quality of prompts and captions,
- throughput efficiency,
- observability/run logging,
- safer intelligence state handling,
- cleaner manual/cloud handoff,
- fewer accidental state collisions.

---

## 11. Do-not-break-production planning rules

Until the build phase is intentionally paused, treat these as protected:

### Protected operational flows
- daily generation flow
- manual creative drop workflow
- queue metadata used for manual posting
- YouTube cloud posting lane
- current Monday intelligence refresh path

### Sensitive zones
- dynamic pool files in `config/`
- queue state in `output/queue/`
- cooldown files
- longform episode metadata used by active render paths

### Safe read-only planning work
- docs
- maps
- ownership classification
- runbooks
- audit reports
- identifying state boundaries

### Unsafe broad actions right now
- repo-wide cleanup without lane-by-lane review
- changing orchestration ownership mid-production
- changing intelligence writers before classification
- broad live debug runs that rewrite queue/config state

---

## 12. Recommended improvement themes after build freeze

After the puzzle compilation build, the highest-value non-breaking improvements are likely:

1. **State ownership clarification**
   - especially dynamic intelligence pools
2. **Observability**
   - run log, status visibility, freshness indicators
3. **Safer promotion model for intelligence outputs**
   - review/apply rather than ambiguous shared mutation
4. **Manual-to-cloud transition map**
   - what moves next, and what must stay manual until quality/account readiness improves
5. **Quality loops**
   - caption audits, prompt audits, output performance review
6. **Efficiency improvements**
   - less friction in manual asset drop and posting prep

---

## 13. Bottom line

The repo should be understood as:
- a hybrid human + automation production engine,
- in a transitional platform-ownership phase,
- with multiple valid writers in some parts of the system,
- already improving in quality,
- needing organization and guardrails more than it needs drastic rewrites.

The next smart move is:
- finish the puzzle compilation lane,
- then stop major feature building,
- then harden quality, observability, and state boundaries without breaking the working workflow.

# Session Log — Joymaze-Content

> Append-only. One entry per completed task.

---

## 2026-04-14 — [Agent: Claude] — Intelligence pipeline full-connect + X post engine overhaul + perf-weights fix

**Files changed:** `scripts/generate-x-posts.mjs`, `scripts/generate-captions.mjs`, `scripts/generate-story-ideas.mjs`, `scripts/generate-asmr-brief.mjs`, `scripts/generate-activity-video.mjs`, `scripts/apply-intelligence.mjs`, `scripts/intelligence-refresh.mjs`, `scripts/generate-prompts.mjs`, `config/x-post-topics-dynamic.json` (new), `output/queue/x-text-2026-04-14.json`, `output/prompts/prompts-2026-04-14.md`, memory files

- **Daily audit (2026-04-14):** X post 4 non-sequitur reply fixed. Prompt 9 post-Easter Easter theme caught and replaced with spring nature spot-the-difference.
- **Post-Easter staleness fix (generate-prompts.mjs):** Added `getEasterDate(year)` (Anonymous Gregorian algorithm). `seasonalNote` now switches to "Easter already passed" mode after Easter. New `post-easter` pre-check rule (penalty -4) fires when today > easter AND prompt contains `\beaster\b`.
- **X post topic pool created:** `config/x-post-topics-dynamic.json` — 10 hand-seeded entries (insight×4, identity×3, story×3). Full decay/eviction schema. Wired into full intelligence pipeline (refresh generates → apply manages → x-posts injects).
- **generate-x-posts.mjs:** Added `buildTopicSeeds()` (least-used per type), `buildCompetitorNotes()`. Both injected into prompt. Competitor intel now flows to X captions.
- **`buildPerfNotes()` bug fix:** Was reading `weights: {}` (wrong schema); weekly-scorecard writes `categories: []`. Fixed to read `categories[].tier/label/weight`. Was silently broken — always returned empty string.
- **generate-captions.mjs:** Added parallel load of trends, theme-pool, competitor-intel, perf-weights. Injects `## INTELLIGENCE SIGNALS` block into caption prompt. Competitor caption patterns + boost/reduce tiers now influence caption generation.
- **generate-story-ideas.mjs:** Added competitor-intel, hooks-library, theme-pool loads. Beat 1 hook now influenced by competitor scroll-stopper formulas and top intelligence hooks.
- **generate-asmr-brief.mjs:** Added competitor-intel, hooks-library, theme-pool, perf-weights loads. hookText and hookAlternatives now guided by intelligence hooks and competitor patterns.
- **generate-activity-video.mjs:** Static hooks replaced with dynamic `loadIntelligenceHooks()` — pulls challenge_hook/curiosity_gap/pattern_interrupt from hooks-library. Static fallback if <2 available.
- **apply-intelligence.mjs:** Added `applyNewXPostTopics()` function + x-post-topics-dynamic.json write. Topic pool now managed by intelligence cycle.
- **intelligence-refresh.mjs:** Added `new_x_post_topics` to Gemini schema (insight/identity/story types). Added x.engagement CTA generation instruction (CTA pool was empty for X).
- **Memory saved:** `feedback_puzzle_post_relevancy.md` — puzzle X posts: fun/value + kids connection is bar; activity relevancy not required. Argued twice, now locked.
- **Final coverage:** All 5 content-generating scripts (prompts, captions, x-posts, story-ideas, asmr-brief) now consume full intelligence suite (trends + perf-weights + competitor-intel + hooks-library + theme-pool).

---

## 2026-04-13 — [Agent: Claude] — Maze ASMR: skeleton path tracer + MazeSolverReveal + pencil cursor

**Files changed:** `scripts/extract-maze-path.mjs` (full rewrite), `scripts/render-video.mjs`, `remotion/compositions/AsmrReveal.jsx`, `remotion/components/MazeSolverReveal.jsx` (new), `remotion/components/MazeHandCursor.jsx` (kept but unused in maze path)

- **Problem:** Old LTR-wipe reveal for mazes looked wrong (path drawn all at once in corners). Replaced with true path-drawing animation.
- **extract-maze-path.mjs rewritten:** Scale image to 20% → diff mask → largest connected component → Zhang-Suen thinning (1px skeleton) → BFS walk from leftmost endpoint (direction-continuation at junctions, teleport on stuck) → smooth (moving-average) → arc-length subsample 400 waypoints → sample pathColor from highest-diff pixels. Saves `path.json` with `waypoints`, `width`, `height`, `pathColor`.
- **MazeSolverReveal.jsx (new):** Shows blank maze, draws SVG polyline growing from start to end (400 waypoints, green glow), pencil cursor (no hand) at the tip, cross-fades to solved image at 92% progress. Drawing starts at frame 0 (overlaps hook phase — no dead wait).
- **AsmrReveal.jsx:** Branches on `pathWaypoints + revealType !== ttb` → MazeSolverReveal (maze) vs WipeReveal (coloring). Coloring unchanged.
- **render-video.mjs:** AR-corrected coordinate mapping for waypoints (accounts for objectFit:contain letterboxing). Reads `pathColor` from path.json. New defaults: `revealDurationSec=26`, `holdDurationSec=1` → 30s total (was 34.5s).
- **Hand cursor removed from maze path.** PencilTip (pencil-only SVG) inlined in MazeSolverReveal — no hand.
- **Progress bar:** Black outline frame (`rgba(0,0,0,0.72)`), `top:261` (2px below hook text card), `left:48/width:calc(100%-96px)` (centred with margins), transparent track (no dark background).
- **Render confirmed:** maze-butterfly-garden → 30s, green path #14ae5c, pencil cursor, correct skeleton trace 521/554 pixels.

---

## 2026-04-11 — [Agent: Claude] — X suspension recovery + platform reset + daily brief built

**Files changed:** `scripts/generate-brief.mjs` (new), `package.json`, `.env`, memory files, `docs/TASKS.md`

- **X account suspended** (reason: spam + bulk posting + Premium subscription on day 1). Decision: no appeal. Repurposed clean 3-year-old fit-clinic account → `@playjoymaze`. New X Developer app created, API keys rotated in `.env` and GitHub Secrets.
- **Pinterest:** Old account abandoned. New account created via joymaze.pp@gmail.com. Business account (WY, USA). Instagram linked but auto-sync disabled — pipeline posts natively.
- **Task Scheduler cleanup:** All 4 local posting tasks disabled except `JoyMaze Daily` (generation only). GitHub Actions is sole posting owner.
- **ToS confirmed:** Automation via official APIs is explicitly allowed on all platforms. Violation was behavioral (bulk + spam patterns), not architectural.
- **Warmup protocol:** 2-week manual posting period for new accounts before re-enabling GitHub Actions.
- **`generate-brief.mjs` built:** `npm run brief` → `output/daily-brief-YYYY-MM-DD.html`. Reads all queue JSONs for today, renders each post as a click-to-copy card (caption, hashtags, media thumbnail, platform-per-section). Handles X text posts and media posts. Falls back to most recent date if today has no files.
- **Next:** Facebook Page → link Instagram → Meta Developer App → TikTok account → TikTok API → Pinterest OAuth refresh → full API credential update

---

## 2026-04-12 — [Agent: Claude] — Content audit + engine fixes + full Remotion engine build

**Files changed:** `scripts/generate-prompts.mjs`, `scripts/generate-x-posts.mjs`, `scripts/render-video.mjs`, `scripts/generate-story-video.mjs`, `remotion/index.jsx`, `remotion/compositions/{StoryEpisode,AsmrReveal,HookIntro,AnimatedFactCard}.jsx`, `remotion/components/{WipeReveal,FloatingParticles,HookText,JoyoWatermark,CaptionBar,BrandWatermark}.jsx`, `output/queue/x-text-2026-04-12.json`, `output/prompts/prompts-2026-04-12.md`, `.github/workflows/x-posts.yml`, `output/posting-cooldown.json`, `package.json`, memory files

**Morning audit + engine fixes:**
- Audited today's 10 prompts + X posts against scroll-stopper / fun-value criteria
- Fixed P6–P9: added named visual style directives (watercolor, Pixar 3D, storybook, ink-wash)
- Replaced P10 Autumn Leaves (wrong-season) with Spring Garden coloring page
- Fixed X puzzle post: replaced stale coin riddle with original crayon riddle; answer post scheduled 4h later
- Engine fix 1: `preCheckViolations()` in `generate-prompts.mjs` — autumn-in-spring check (months 3-5)
- Engine fix 2: activity prompt system + quality gate now enforces named art style (−1 penalty if missing)
- Engine fix 3: BANNED STALE RIDDLES blocklist added to `generate-x-posts.mjs` system prompt (coin, echo, shadow, clock, etc.)

**Warmup hold (confirmed + hardened):**
- `posting-cooldown.json` extended to 2026-04-26 (was expired/missing)
- `.github/workflows/x-posts.yml` — added `if: false` belt-and-suspenders stop
- Confirmed X API keys in GitHub Secrets (gh secret list showed update 2026-04-11 14:10 UTC)

**Full Remotion animation engine built (commit 86c0573):**
- `remotion/index.jsx` — registers StoryEpisode, AsmrReveal, HookIntro
- `StoryEpisode.jsx` — cross-fade slides, Ken Burns, music fade, Joyo, brand. TESTED: 6s, 11.4s render ✓
- `AsmrReveal.jsx` — LTR/TTB clip-path wipe, hook text, sparkle particles, ASMR audio. Dry-run ✓
- `HookIntro.jsx` — spring headline + delayed subline, gradient bg. TESTED: 4s, 6.7s render ✓
- Components: `WipeReveal`, `FloatingParticles` (golden angle deterministic), `HookText`, `JoyoWatermark`, `CaptionBar`, `BrandWatermark`
- `scripts/render-video.mjs` — `--comp`, `--story`, `--asmr`, `--props`, `--out`, `--dry-run`; bundle cache singleton; storyJsonToProps + activityJsonToProps

**AnimatedFactCard composition + story Remotion wiring (commit e97b8fb):**
- `AnimatedFactCard.jsx` — "Did You Know?" educational carousel; cards spring in from right sequentially; dot indicators; configurable facts/colors/duration. TESTED: 12.5s, 13.6s render ✓
- `render-video.mjs`: `storyJsonToProps` now accepts `slide.image` (current story.json schema) as fallback
- `generate-story-video.mjs`: `--remotion` flag → `renderWithRemotion()` bypasses frame-gen + FFmpeg, calls StoryEpisode via render-video.mjs; same queue metadata + Cloudinary upload
- npm scripts: `animate:factcard`, `animate:factcard:dry`, `generate:story:remotion`
- Next for Remotion: drop blank.png + solved.png → live AsmrReveal render; wire animate:asmr into ASMR pipeline

---

## 2026-04-09 — [Agent: Claude] — output/raw/ folder structure pruned + rebuilt

**Files changed:** `output/raw/` (filesystem only)

- **Retired folders deleted:** `pattern/`, `story/`, `story-marketing/` (all were empty)
- **New inspiration folders created:** `fact-card/`, `challenge/`, `quiet/`, `printable/`, `identity/`
- **Activity folders kept:** `maze/`, `wordsearch/`, `matching/`, `tracing/`, `quiz/`, `coloring/`, `dottodot/`, `sudoku/`
- **Coloring + dottodot + sudoku retained** — user confirmed these are core JoyMaze activities, not retired
- **import-raw.mjs already had all mappings** — no code changes needed; folder names map correctly to category types
- Updated memory (`project_content_slots.md`), SESSION_LOG, CHAT_LOG, DAILY_CHEATSHEET

---

## 2026-04-08 — [Agent: Claude] — X text post pipeline wired into scheduler

**Files changed:** `scripts/daily-scheduler.mjs`, `scripts/generate-x-posts.mjs`, `package.json`, `docs/TASKS.md`

- **Ambiguous Codex task resolved:** The blocked `daily-scheduler.mjs` task said "insert after caption generation" — but `generate-captions.mjs` is a manual step not in the scheduler. Clarified that `generate-x-posts.mjs` is a completely independent pipeline (text posts, not image captions) and needs no caption anchor.
- **Writing brain fix (`generate-x-posts.mjs`):** `config/writing-style.md` was injected as a prefix inside the `user` message. Split into proper `system` message (writing-style.md) + `user` message (generation task). LLMs weight system messages more authoritatively — ensures Halbert voice and brand rules govern all output.
- **Scheduler integration:** `generate-x-posts.mjs` added as unconditional step in `runDailyJob()` after ASMR brief, before analytics/posting. `totalSteps` base updated 2→3. 60s timeout.
- **npm scripts added:** `x:generate`, `x:generate:dry`, `x:text:post`, `x:text:post:dry`. Also added `generate-x-posts.mjs` to `npm run daily` chain.
- **Note for next agent:** `post-x-scheduled.mjs` is NOT in the daily scheduler — it runs hourly via Windows Task Scheduler and drips from `output/queue/x-text-YYYY-MM-DD.json`. The daily job only generates the queue file.

---

### 2026-04-07 — Self-learning intelligence system built + key fix

**Archive bug fix:**
- `archive-queue.mjs`: fixed `.json`-only extension filter (now includes `.md`); removed early `return` on empty queue so all sweep sections (prompts, ASMR, stories, videos) always run

**Theme repetition fix (`generate-prompts.mjs`):**
- `THEME_POOL` added as 61-entry JS array (was advisory text); theme selection moved entirely into code — LLM gets mandatory assignments, not free choice
- `pickActivityThemes()`: extended lookback 3→7 days, now scans `output/archive/prompts/` too
- `MERGED_THEME_POOL` pattern: 61 hardcoded + dynamic themes merged at startup
- `STORY_SETTINGS` pool added: 50 entries with location/timeOfDay/ambiance → injected per slot
- `ART_STYLES` expanded 14→28, `PATTERN_INTERRUPT_POOL` expanded 22→36
- Trend boost wired at code level: trending themes get up to 2 of 5 priority slots

**Self-learning intelligence system (full build):**
- `config/theme-pool-dynamic.json`, `hooks-library.json`, `cta-library.json`, `pattern-interrupt-dynamic.json`, `content-intelligence.json` — 5 new config files
- `scripts/apply-intelligence.mjs` — Levenshtein dedup, eviction scoring, aging pass, performance score rolling average
- `scripts/intelligence-refresh.mjs` — 6 Gemini search-grounded competitor queries, Gemini 2.5 Flash synthesis, dual-pass brand safety (blocklist + Groq SAFE/REVIEW/REJECT), entropy check (0-10)
- `generate-captions.mjs` updated: dynamic CTAs merged, top-10 dynamic hooks injected into style guide
- `generate-prompts.mjs` updated: `loadDynamicPools()`, hook examples in system prompt
- `daily-scheduler.mjs` updated: Monday intelligence refresh block (intelligence-refresh + apply-intelligence before prompt generation)
- `package.json`: 7 new `intelligence:*` npm scripts
- **API key fix:** `GOOGLE_AI_API_KEY` was suspended — all Gemini calls in `intelligence-refresh.mjs`, `generate-captions.mjs`, `generate-images.mjs` updated to use `VERTEX_API_KEY` as primary
- **Verified:** `intelligence-refresh.mjs --dry-run` successful — 5 themes, 7 hooks, 3 CTAs, 4 interrupts, entropy 2.0/10

---

### 2026-04-04 — Archetype 7 + Pattern Interrupt rotation fix
- Problem: Arch 7 always sent `{ type: 'subtle-marketing' }` with no scene info → LLM defaulted to "parent + tablet on couch" every day. Pattern Interrupt hardcoded `myth-bust` sub-type → "screen time + brain lightbulb" every day.
- Fix 1: Added 20-scene `ARCH7_SCENES` pool to `generate-prompts.mjs` — day-of-year cycling, 20-day rotation before any repeat
- Fix 2: Added 22-topic `PATTERN_INTERRUPT_POOL` (6 sub-types: myth-bust, did-you-know, surprising-stat, counterintuitive, seasonal-hook, edutainment) — 22-day rotation
- Fix 3: Rich slot descriptions now sent to LLM: "TODAY'S SCENE: Restaurant booth…" instead of just "subtle-marketing"
- Fix 4: `loadRecentThemes()` extended to track Arch 7 settings + pattern-interrupt topics in dedup
- Fix 5: System prompt updated: pattern-interrupt rule now references 6 rotating sub-types instead of static "myth-bust"
- Verified: dry run shows unique scene + topic per day for 7 consecutive days
- Session ended without logs being saved (quota exhausted)

---

### 2026-04-05 — ASMR video pipeline fixes + pencil animation
- Fixed hookText scope error (const inside if-block, referenced outside) — hoisted to let before block
- Fixed revealPx scope error (same pattern) — hoisted to let before if/else
- Fixed 7s gap + sketchy motion: replaced easeInOut with linear progress for reveal sweep
- Fixed video cut at 24s: removed -shortest FFmpeg flag, added aloop=-1 + -t ${totalDuration}
- Removed outro (JoyMaze logo branding screen) — not trendy for short-form video
- Reduced hold from 3s → 1.5s. New total: 31.5s
- Added Pinterest + X to ASMR queue metadata; added video support to postToPinterest
- Added pencil animation: analyzePathY() pre-scans solution image to find path Y per column, buildPencilSvg() composites pencil at reveal edge, tracks solution path height as it sweeps
- Maze reveal: left-to-right wipe kept (Ahmed prefers it over crossfade — more "flare")
- archive-queue.mjs: added ASMR + stories + videos sweep — all output types now auto-archived daily
- Manually archived: 8 ASMR briefs, 10 story episodes, 6 video files

---

### 2026-04-05 — Confirmed Monday pipeline timing
- Tomorrow (2026-04-06) is Monday — first full Monday run of npm run daily
- Will execute: archive → analytics:collect → trends → scorecard:save → generate:prompts → story:ideas → asmr:brief
- First time scorecard and trends will both run in sequence in production

---

### 2026-04-05 — Weekly Scorecard + performance-weights.json
- Built `scripts/weekly-scorecard.mjs` — reads queue + archive metadata, computes save rate per archetype category, ranks by save rate, assigns weights (×1.5 boost / ×1.0 neutral / ×0.6 reduce)
- Writes `config/performance-weights.json` — consumed by `loadPerformanceContext()` in `generate-prompts.mjs` on every run
- `--monday-only` flag: runs in `npm run daily` on Mondays only; other days silently skip
- Wired into `npm run daily`: order is archive → analytics:collect → trends (Mon) → scorecard:save (Mon) → generate:prompts → story:ideas → asmr:brief
- Added `npm run scorecard` and `npm run scorecard:save` standalone commands
- TASKS.md: Weekly Scorecard marked [x]

---

### 2026-04-05 — Quality Gate: post-generation prompt scoring
- Built `scorePrompts()` in `generate-prompts.mjs` — second Groq call using `llama-3.1-8b-instant` after generation
- Scoring rubric: 8 criteria mapped to conversion principles (sensory anchor, peak engagement, abandoned alternative, expression specificity, art style, dimensions, caption hook, puzzle spec)
- Thresholds: ≥7 = pass, 5-6 = flagged, <5 = rejected
- Console table printed after every generation run; score badges (`> ✓ / ⚠ / ✗`) injected into saved `.md` file per prompt
- File header gets score summary line: `# Quality Gate: avg X/10 · N pass · N flagged · N rejected`
- Safe fallback: if scoring API call fails, generation still saves unmodified
- TASKS.md: Quality Gate marked [x]

---

### 2026-04-05 — Prompt quality fixes + startup protocol overhaul
- Fixed Bug 1: Sunday within-day dedup — added MANDATORY WITHIN-DAY UNIQUENESS block to Sunday user prompt (different activity type, theme, art style, child age/gender per prompt). Root cause: Sunday prompt had no within-day dedup constraint, causing #1/#5 near-identical (word search + music repeated).
- Fixed Bug 2: Activity CTA repetition — added ACTIVITY CTA VARIETY IS MANDATORY rule to system prompt with 8 distinct CTA patterns. No more "find its way home" x3 in one day.
- Fixed Bug 3: Theme coherence — added rule: story setting and activity shown must match environmental mood.
- Updated CLAUDE.md startup protocol: now reads TASKS.md + MEMORY.md (relevant files) + CONTENT_ARCHETYPES.md lines 1-50+530-583 + SESSION_LOG (last 20 lines). Memory is now mandatory regardless of quota.
- Updated stale memories: project_vertex_api.md (Vertex not in use), project_asmr_plan.md (shelved), feedback_token_efficiency.md (4-file startup).

---

### 2026-04-04 — Fix archive sweep to include raw subfolders
- Bug: `archive-queue.mjs` raw sweep used flat `readdir(RAW_DIR)` — missed images in subfolders (story/, activity/, etc.)
- Fix: replaced flat readdir with `readdir(withFileTypes: true)`, iterates subdirectories one level deep, collects image candidates from each
- Archive destination unchanged: all raw files flatten to `archive/{date}/raw/`

---

### 2026-03-21 — Initial project scaffold
- Created full project directory structure
- Set up package.json with all dependencies
- Copied brand assets from JoyMaze app
- Created all documentation files (CLAUDE.md, AGENTS.md, CODEX.md, GEMINI.md, MEMORY.md, docs/*)
- Created .claude/agents/ for content automation agents
- Built generate-images.mjs and generate-captions.mjs pipelines
- Dry-run tested both pipelines: 3 images (12 platform-sized files) + captions for 5 platforms
- Created setup-check.mjs, post-content.mjs (placeholder), generate-videos.mjs (placeholder), content-calendar.mjs (placeholder)
- Created caption prompt templates for Pinterest, Instagram, X, TikTok, YouTube
- Initialized git repo, .gitignore correctly excludes .env/output/node_modules
- Steps 1+2+3 of implementation plan complete. Next: Step 4 (platform posting)

---

### 2026-03-21 — Step 4: Platform posting script
- Built full post-content.mjs with Pinterest (direct base64 upload) and Instagram (Graph API container flow) posting
- X/Twitter posting requires twitter-api-v2 package (OAuth 1.0a signing) — documented with ready-to-uncomment code
- Added --dry-run, --platform, --id, --limit CLI flags
- Tracks post status in queue metadata (pending/posted/failed with timestamps)
- Dry-run tested: 3 items x 2 platforms = 6 successful dry-run posts

---

### 2026-03-21 — Step 5: Video generation pipeline
- Built generate-videos.mjs with slideshow assembly from queue images
- Creates intro (brand splash) + content slides + outro (CTA) as frame sequences
- Resizes all frames to 1080x1920 (9:16 vertical) for Reels/TikTok/Shorts
- FFmpeg assembly step (requires FFmpeg in PATH — not currently installed)
- Dry-run tested: 3 slides, 450 frames, 15s video prepared successfully
- Next: Step 6 (n8n workflows)

---

### 2026-03-21 — Step 6: n8n workflow exports
- Created 3 n8n workflow JSON files in n8n/workflows/:
  - daily-content-generator.json — midnight trigger, generates 12 images + 2 videos + captions
  - scheduled-poster.json — every 2 hours, posts next 2 items to Pinterest + Instagram
  - analytics-collector.json — nightly stats collection, appends to analytics.jsonl
- Ready to import into n8n at localhost:5678

---

### 2026-03-21 — Step 7: Content calendar + optimization
- Built content-calendar.mjs with queue status, weekly plan, daily plan generation, stats views
- 10 content categories with daily rotation mix (12 images/day target)
- Optimal posting times per platform configured
- Dry-run tested: queue status, plan generation, statistics all working
- All 7 steps of the implementation plan complete

---

### 2026-03-21 — Dependencies installation
- Installed twitter-api-v2 (npm) — enabled X/Twitter posting in post-content.mjs
- Installed FFmpeg 8.1 via winget (binaries at D:/Dev/ffmpeg/) — video generation fully working
- Installed n8n 2.8.4 globally (npm install -g n8n)
- Tested generate-videos.mjs live: produced 2026-03-21-slideshow-00.mp4 (1080x1920, H.264, 15s)
- Updated post-content.mjs: X posting now uses twitter-api-v2 (was placeholder), all 3 platforms active
- Remaining manual setup: add FFmpeg to Windows PATH, add API keys to .env

---

### 2026-03-22 — Strategy decision: manual gen + Gemini free API
- Decided against using paid API keys for image generation (separate billing from Pro subs)
- Strategy: generate images manually via ChatGPT/Gemini chat UI ($0), automate everything else
- Captions will use Gemini free API tier ($0)
- Scale path: manual now → Gemini API image gen later once pipeline is proven
- Next session: build import-raw.mjs script, switch captions to Gemini, end-to-end test

---

### 2026-03-25 — Claude skills expansion + pipeline completion
- Created 15 new Claude agent skills covering full business: content (2), KDP (3), app (2), strategy (3), outreach (3), brand (2)
- Total agent count: 19 skills (4 existing + 15 new)
- Created docs/DAILY_WORKFLOW.md — daily/weekly/monthly business workflow using all skills with minimum quotas
- Built import-raw.mjs — imports manual images from output/raw/, applies branding, exports platform sizes, creates queue metadata
  - Supports: --dry-run, --category, --subject, --text, --file, --no-watermark, sidecar JSON metadata, auto-detect category
- Switched generate-captions.mjs from Claude to Gemini free API (Claude as fallback)
- Added npm run import:raw script to package.json
- Next: Ahmed manual setup (API keys, PATH), then end-to-end test with real content

---

### 2026-03-27 — Real Halbert content extracted and added (replaces placeholder)
- User created docx versions of the scanned PDFs — unlocked actual book content
- Extracted The Halbert Copywriting Method Part III (Bond Halbert) in full via Python/zipfile
- Replaced the 12 generic "Boron Letters knowledge" placeholder principles with the actual 4-stage editing formula from the book:
  - Stage 1 (Eye Relief): paragraph rules, break-at-and sentence technique, subheads as benefit bullets
  - Stage 2 (Greased Slide/Clarity): read-aloud rule, That hunt, pronoun hunt, big word hunt, repeat word hunt, transitions library
  - Stage 3 (Keep Reading): cliffhanger techniques, punch-at-end rule, anchor/hook promise technique
  - Stage 4 (Punch Up): So What? test with JoyMaze examples, words-people-hate swap table, qualifier hunt, adverb hunt, I→You formula, power word method, emphasis hierarchy, Because technique, but→yet swap
  - Added complete 15-point Halbert editing checklist
- 50 hooks docx confirmed identical to PDF — no new content
- Style guide: 561 → 670 lines; now has real extracted material from all 3 sources

---

### 2026-03-27 — Writing style guide: Gary Halbert + 50 hooks added
- Installed PyMuPDF (python -m pip) to extract PDF text — resolved the scan blocker
- 50 Hooks PDF (One Peak Creative): fully extracted — 19 hook templates translated to JoyMaze parent audience examples (controversy, exclusion, myth buster, hack, identity, exclusivity, nobody talking, diagnosis, emotional relief, experiment, regret, warning, pattern interrupt, mistake prevention, lazy win, speed, skeptic, proof, transformation)
- Halbert Copywriting Method PDF: 125-page scanned image — zero extractable text. Principles incorporated from The Boron Letters and Gary Halbert newsletter (well-documented source material): 12 principles with JoyMaze translations (hungry crowd, A-pile/B-pile, So What? test, slippery slide, specificity = credibility, because principle, desire before belief, P.S. as second hook, etc.)
- Sales Letters PDF (555 pages): B2B template collection — limited social media value. Extracted Booher's 3-part intro structure (arouse interest → explain benefit → name next step) and added to Halbert section
- Style guide: 383 → 561 lines. Now covers Vitale (18 modules) + Halbert method + 50 native social hooks

---

### 2026-03-27 — Writing style guide expanded: full 18-module synthesis
- Read and extracted all 18 Hypnotic Writing modules (docx text extraction via PowerShell)
- Modules covered: Mindset, Language Techniques, Psychology & Persuasion, Sentence Structures, Storytelling, Headlines & Hooks, Writing Formula, Editing System, Sales Page Architecture, Email Sequences, Ads, Product Descriptions, Social Content, Funnels, Objection Handling, VEO3, Advanced Editing, Viral Refinement Engine
- Gary Halbert PDF was a scanned image — no text extractable; core Halbert principles incorporated from knowledge
- config/writing-style.md expanded from 120 → 383 lines:
  - Added 8 named hook patterns with JoyMaze examples
  - Added 3 primary buying motivators (Relief / Transformation / Inspiration)
  - Added VAK sensory template, desire amplification, identity mirror, risk removal, future self templates
  - Added micro-story structure, rhythm formula, transitions, openings library
  - Added expanded CTA library with rewrite examples
  - Added viral hook engineering: 5 hook types + memory anchors
  - Added objection handling patterns + reassurance phrases
  - Added hypnotic editing rules: 8 laws + fog word list
- Committed: 318 insertions, 54 deletions
- Every AI caption call now has the complete persuasion system injected as context

---

### 2026-03-27 — Hypnotic Writing framework: images, videos, calendar pipeline
- Updated generate-images.mjs: all 10 category prompts rewritten with emotional/sensory scene direction; replaced single static textOverlay per category with rotating `textOverlays` array of 2-4 hypnotic micro-phrases picked randomly each run
- Updated generate-videos.mjs: intro tagline changed to "Screen time that feels like a gift."; outro CTA changed to "When you're ready, JoyMaze is waiting." / "Free on iOS & Android"; added SLIDE_OVERLAYS map (per category pool of hypnotic overlay text) + pickSlideOverlay() function wired into prepareSlideFrame()
- Updated content-calendar.mjs: added `hypnoticAngle` (emotional strategy) and `hook` (opening line) to all 10 DAILY_MIX categories; generatePlan() now prints both fields per content piece
- Updated all 4 agent skills: caption-writer, content-strategist, image-generator, video-producer — all rewritten with Hypnotic Writing formulas
- Committed as single commit: "Apply Hypnotic Writing framework to image, video, and calendar pipelines" (7 files, 362 insertions, 164 deletions)
- Hypnotic Writing framework now COMPLETE across all pipeline steps

---

### 2026-03-27 — API keys live + Groq + Ollama fallback chain
- Set valid GOOGLE_AI_API_KEY in .env (Gemini confirmed working briefly)
- Gemini account suspended by Google fraud detection after billing was added
- Submitted formal 500-char appeal to Google Cloud Trust & Safety
- Added Groq as fallback 1 (llama-3.3-70b-versatile, 14,400 req/day free) — LIVE and tested
- Added Ollama as fallback 2 (llama3.2:3b, fully local, zero cost) — LIVE and tested
- Both use existing openai package (OpenAI-compatible APIs), no new dependencies
- Updated model in generate-captions.mjs: gemini-2.0-flash → gemini-2.5-flash
- Caption chain: Gemini → Groq → Ollama → default
- Freed 3.73 GB on C: drive (npm cache 4.72GB cleared, temp cleared)
- Moved npm cache permanently to D:\npm-cache
- Set OLLAMA_MODELS=D:\Ollama\models (user env var) — models land on D: not C:
- Ollama installed, llama3.2:3b (2GB) downloaded to D:\Ollama\models
- Full end-to-end test: import-raw → Groq captions → all 5 platforms — SUCCESS

---

### 2026-03-28 — Pipeline test + caption quality fixes
- Verified end-to-end: import-raw, generate-captions (dry-run + live), post-content dry-run, calendar — all working
- Confirmed Groq is live and producing Hypnotic Writing quality captions (tested Archetype 1 story item — output verified)
- Root cause of bad existing captions: all 7 queue items had fallback default captions from a previous session when Groq/Gemini were unavailable
- Added --force flag to generate-captions.mjs: re-runs captions on already-captioned items
- Added Groq 429 retry-with-backoff: waits 65s and retries up to 2 times on rate limit (30 req/min free tier)
- Added 2.5s delay after each successful Groq call: paces requests to stay under rate limit during normal daily runs
- Fixed Ollama fallback: now uses short prompt (template only, not full 670-line style guide) — llama3.2:3b context limit was causing silent failures
- Regenerated all 7 queue items with --force (Groq rate-limited from test runs today → fell to Ollama; quality acceptable, not ideal)
- Normal daily flow (10 new items) will use Groq cleanly — rate limit only triggered from bulk test runs

---

### 2026-03-27 — Story-First Content Architecture implemented
- Created docs/CONTENT_ARCHETYPES.md — 8 story archetypes with 3-beat structure, full example executions, CTA rules, weekly rotation guide, and Joyo's Story Corner video archetype
- Added STORY-FIRST CONTENT ARCHITECTURE section to config/writing-style.md (670 → 730 lines): archetype cheat sheet, 3-beat structure, daily mix rules, CTA placement, Arch 8 video guidelines
- Refactored content-calendar.mjs DAILY_MIX: replaced topic-based categories (coloring-preview, parent-tips, etc.) with story-archetype-based mix — 6 pure story archetypes + 2 Arch 7 subtle + 1 myth-bust + 1 marketing anchor = 10 posts/day
- Added VIDEO_PLAN constant for Archetype 8 (Kids Story Video — Joyo's Story Corner, 45-60s, zero CTA)
- generatePlan() and showWeekPlan() now output archetype names, marketing level, hook, angle, and CTA placement per slot
- Daily target confirmed: 10 image posts + 1 short video (if ready)

---

### 2026-03-28 — First live Pinterest posts + prompt generator
- Set up Pinterest Business account (Publisher/media, Education focus)
- Created privacy policy page at joymaze.com/privacy (Puzz Publishing LLC ownership noted)
- Created Pinterest Developer app (ID: 1556985), completed OAuth flow for write-scoped token
- Built generate-prompts.mjs: AI-powered image prompt generator fed by full writing-style.md + CONTENT_ARCHETYPES.md
  - Uses Groq (primary) + Ollama (fallback), outputs archetype-specific prompts with emotional beats, art direction, caption hooks
  - Added npm run generate:prompts command
- Generated 7 images via Gemini using archetype-informed prompts
- Imported all 7 → 28 platform-sized branded images via import-raw
- Generated captions for all 7 via Ollama (Groq rate-limited from batch volume)
- Fixed post-content.mjs: added sharp JPEG compression, sandbox API routing, image_url upload via temp hosting (sandbox base64 bug workaround)
- Posted 6 of 7 pins to Pinterest sandbox (1 failed due to Pinterest 500 — their bug)
- Full pipeline proven end-to-end: prompt gen → image creation → brand compositing → caption gen → API posting
- Blocker for public pins: need Standard API access (requires demo video submission)

---

### 2026-03-25 — Setup test + API key discovery
- Ran full end-to-end test: import-raw.mjs produced 4 platform-sized branded images from test image
- Caption generation tested live: GOOGLE_AI_API_KEY and ANTHROPIC_API_KEY both return invalid errors
- Keys exist in .env but contain bad/placeholder values
- Confirmed Anthropic key is NOT needed (Gemini-only strategy, $0 cost)
- Only blocker: need valid GOOGLE_AI_API_KEY from Google AI Studio
- Decision: create dedicated JoyMaze Google account (joymaze.app@gmail.com or similar) for all business services
- Recommended account structure: JoyMaze Google account owns YouTube, Google Play, Gemini API, Google Ads; KDP stays on personal Amazon account
- Next: Ahmed creates JoyMaze Google account, gets Gemini API key, then re-run end-to-end test

---

### 2026-03-29 — Queue archive + Story video pipeline + Analytics pipeline
- Built archive-queue.mjs: moves old queue items + images to output/archive/{date}/
- Added `npm run daily` = archive + generate:prompts (clean daily workflow)
- Built generate-story-video.mjs: full Archetype 8 "Joyo's Story Corner" video pipeline
  - Ken Burns zoom/pan, 0.5s crossfade transitions, narration text overlays
  - Joyo mascot intro/outro, optional background music (faded, 30% volume)
  - `--init` scaffolds story folder + story.json template
  - Tested end-to-end: 7 slides → 1560 frames → 52s MP4 via FFmpeg
- Built collect-analytics.mjs: Pinterest pin analytics (impressions, saves, clicks, outbound clicks)
  - Sandbox detection, 24h-old pin skip, token refresh on 401, rate limiting
- Built analytics-report.mjs: top performers, category breakdown, hook analysis, save rate
- Modified generate-prompts.mjs: auto-injects performance data into Groq prompts (feedback loop)
- Fixed pre-existing Sunday rotation bug (Sunday returns archetypes, not slots)
- Added 6 npm scripts: archive, daily, generate:story, analytics:collect, analytics:report, analytics

### 2026-03-29 (session 2) — Activity/Puzzle Content Strategy (5+5 daily mix)
- Strategic shift: 10 daily posts = 5 story + 5 activity (actual puzzles/printables)
- Added 5 activity archetypes (A1-A5): maze, word search, matching, tracing, quiz
- Updated CONTENT_ARCHETYPES.md with full activity archetype definitions + updated daily mix table
- Updated writing-style.md with activity copywriting section (hooks, voice shift, platform rules)
- Updated hashtags.json: added tracing + quiz pools
- Restructured content-calendar.mjs: 5 story + 5 activity slots, difficulty rotation (Easy/Med/Hard by day)
- Updated generate-prompts.mjs: separate story vs activity prompt generation, activity-specific rules
- Updated import-raw.mjs: 5 new activity categories with auto-detection from filenames
- Created 5 activity caption templates (pinterest/instagram/x/tiktok/youtube-activity.txt)
- Updated generate-captions.mjs: activity template routing + activity-specific template variables

---

### 2026-03-29 (session 3) — Slideshow video pump upgrade + X/Instagram posting live
- Rewrote generate-videos.mjs from basic static slideshow to production video pump:
  - Ken Burns effect (zoom-in, pan-right, pan-left, pan-down) with 10% overscan
  - 0.5s crossfade transitions between all slides (ported from generate-story-video.mjs)
  - Fade-in from black on intro, fade-out to black on outro
  - Text overlay with fade-in animation per slide (category-specific hypnotic phrases)
  - Optional background music with fade in/out, 30% volume (auto-discovers from assets/audio/)
  - Activity category overlays added (maze, word search, matching, tracing, quiz)
  - New CLI flags: --music, --no-music, --category (activity|story|specific)
  - Frame-by-frame generation (not static duplication) — every frame is unique
  - Tested: 3 slides → 420 frames → 14s MP4 (1080x1920, H.264, 30fps)
- Fixed Instagram posting: replaced broken _publicImageUrl requirement with temp URL upload (same as Pinterest)
- Verified X/Twitter posting: twitter-api-v2 code works, connects and authenticates (401 = invalid token, not code bug)
- Added npm scripts: generate:video, post:x, post:instagram, post:pinterest
- All 3 platforms (Pinterest, Instagram, X) now code-complete for image posting

---

### 2026-03-31 — Story video polish: sync fix, cinematic intro/outro, TTS speed control, dimension fix
- Sync fixed: audio now drives slide timing bidirectionally — `max(3.0, spoken + 0.5s)` replaces `max(slide.duration, spoken + 0.5s)`. Fast VO shortens scenes; slow VO extends them. Scenes never run out of sync.
- Intro redesigned: black screen, "EPISODE N" spaced caps + title in white, cinematic fade in/out. VO narrates title; intro duration stretches to match.
- Outro redesigned: black screen, "The End" + dim title + JoyMaze logo + joymaze.com. No gradient, no mascot, no "See you next time!"
- TTS speed control: `--speed` flag (default 0.9). OpenAI uses native API `speed` param; Edge TTS uses FFmpeg `atempo` post-process.
- Landscape dimension fix: `smartResize()` added to both `import-raw.mjs` and `generate-story-video.mjs`. Landscape images → portrait/square canvases now use blur-background letterbox instead of harsh center-crop. Applies universally to all platform exports.
- Video filename collision fixed: TTS provider appended to filename (`ep01-openai.mp4`, `ep01-edge.mp4`, `ep01.mp4`).
- OpenAI API key configured and validated in .env (sk-proj-...).
- DAILY_CHEATSHEET.md updated with full story video workflow, TTS commands, speed flag, troubleshooting rows.

### 2026-03-30 — ASMR video pipeline + prompt diversity + activity pool expansion + story TTS comparison
- Added generate-asmr-video.mjs: ASMR activity video format (Archetype 9) — AI progression sequences, no VO, slow Ken Burns (6%), 1s crossfades, MUSIC_VOLUME=0.15, minimal intro/outro
- Added 5 ASMR caption templates (instagram/tiktok/youtube/pinterest/x-asmr.txt) — calm, meditative tone
- Added Archetype 9 to CONTENT_ARCHETYPES.md and hashtags.json (15 ASMR hashtag pool)
- Added 3-day theme dedup to generate-prompts.mjs: scans recent prompt files, blocks repeated activity themes, story scenes, art styles
- Expanded activity pool from 5 to 8 types (added dot-to-dot, sudoku, coloring from app)
- CTA routing: app+books categories vs books-only categories — fix for CTA mismatch
- Added raw file archiving to archive-queue.mjs (mtime-based sweep) — prevents double-import
- Gemini permanently suspended (Google Cloud) — made Groq direct primary, Gemini last resort
- Fixed DAILY_CHEATSHEET.md with full filename-to-category mapping table
- Slideshow coherence: thematic grouping by category + --slides manual override flag (generate-videos.mjs)
- Story video Ep01 scaffolded: "The Fox and the Frozen River" — 7 slides, full narration written
- Added TTS voiceover support to generate-story-video.mjs:
  - `--tts openai`: OpenAI tts-1, voice nova (~$0.01/story)
  - `--tts edge`: Microsoft Edge TTS, voice JennyNeural (free, no key)
  - Per-slide audio padded to slide duration → concatenated with intro silence → mixed with music at 12% ducked
  - npm run generate:story:openai / generate:story:edge for comparison runs
  - Installed msedge-tts npm package

### 2026-03-29 (session 4) — First production run + video posting automation
- First full production run: 10 posts (5 story + 5 activity) posted to X/Twitter
  - Images generated in Gemini, imported via import:raw, captioned via Groq, posted via post:x
  - Fixed generic "General" category issue: filenames without keywords default to general; manually patched queue metadata with proper categories/subjects for this run
  - All 10 posted successfully, $0.10 in X credits
- Added video posting to post-content.mjs:
  - X: chunked MP4 upload via twitter-api-v2 (EUploadMimeType.Mp4, 5MB chunks)
  - Instagram: Reels support via Graph API (media_type: 'REELS', video_url)
  - Auto-detects video vs image queue items — same `npm run post:x` command handles both
  - Tested: generated 14s slideshow → captioned → posted to X as video tweet
- Added --force-full flag to generate-prompts.mjs (bypasses Sunday "best-of repost" mode)
- Updated prompt generator: art style must always be specified explicitly and varied across prompts
- Updated DAILY_CHEATSHEET.md with video posting workflow
- Lesson learned: name raw files with keywords (maze-ocean.png, story-coloring.png) for auto-detection

### 2026-03-31 (session 2) — Story video audio fix + pipeline hardening + ASMR plan
- Completed lossless WAV audio chain fix in generate-story-video.mjs:
  - All intermediate TTS files (raw, padded, silence, concat) now use pcm_s16le WAV instead of MP3
  - Encoding chain: TTS → WAV → pad WAV → concat WAV → AAC (1 lossy step, down from 4)
  - OpenAI TTS response_format changed from 'mp3' to 'wav'; Edge TTS atempo output changed to pcm_s16le WAV
  - Shaky VO root cause eliminated (was: MP3 encoder-delay artifacts at segment boundaries)
  - ep01 re-rendered: 43.4s MP4, lossless narration confirmed in output log
- Added --voice flag to generate-story-video.mjs (OpenAI voices: nova, fable, shimmer, alloy, echo, onyx)
- Fixed import-raw.mjs detectCategory() bug: split-by-hyphen keyword matching caused "story-dot castle" to detect as activity-dot-to-dot. Replaced with explicit CATEGORY_KEYWORDS map — requires full keyword match (dot-to-dot, not dot).
- 11 posts published to X: 9 activity + 1 pattern-interrupt + 1 story video (ep01)
- Story idea generator upgraded (generate-story-ideas.mjs):
  - Added --slides N flag for variable slide count (tested: 10-slide generation)
  - Added `character` field to JSON output — consistent physical description of main character
  - Rewrote IMAGE PROMPT RULES section with full cinematography spec: required camera framing, time-of-day progression, character design consistency, foreground/background depth, bad/good example baked in from ep02 rewrite
  - Added npm run generate:story:idea:long (10-slide shortcut)
  - Validation now checks against SLIDE_COUNT, not hardcoded 7
- ep02 scaffolded: "The Little Luminous Leafwing" (10 slides) — all 10 image-prompts manually rewritten with proper cinematography (6 distinct camera framings, full light progression golden hour → dusk → night → pre-dawn → dawn)
- Gold standard maze prompt added to generate-prompts.mjs (Example C) — AI now uses proven simple maze format instead of over-specified layout descriptions
- Mindstorm: ASMR video production options documented (see ACTIVE_SPRINT.md Next Session)

### 2026-04-01 — Full pipeline automation + TikTok/YouTube + ASMR brief generator

- Added TikTok (Content Posting API v2) and YouTube Shorts (Data API v3) posting functions to post-content.mjs
- Added `npm run post:tiktok`, `npm run post:youtube`
- Daily scheduler updated: auto-posts to all 4 platforms (Pinterest + TikTok + YouTube + X) every morning
- Added `npm run publish` = generate:captions + post (single command for end of creative session)
- Created scripts/generate-asmr-brief.mjs — daily ASMR brief generator using Groq + style guide + analytics
  - Picks type (coloring/maze) by day rotation, generates image prompts + hook text in one Groq call
  - Creates output/asmr/[type]-[slug]/activity.json + brief.md ready for Ahmed to drop images into
- Daily scheduler: story brief + ASMR brief now run by default every morning (--no-story / --no-asmr to skip)
- Story TTS: default speed changed 0.9 → 0.75 (slowest natural). Voice cycles per episode (nova→shimmer→fable→alloy→echo→onyx)
- Image prompt generator: fixed activity prompts missing dimension rules (root cause: examples B+C lacked the field — model follows examples over templates)
- Maze prompt: added explicit fill-in-the-blank template + warning not to use narrative style from Example B
- Fixed today's prompts manually: maze rebuilt to golden standard, dot-to-dot replaced with Gemini enhancement prompt
- Windows Task Scheduler configured: daily job runs at 9 AM (--now flag, "run only when logged on")
- First successful automated daily run confirmed via scheduler.log
- First image posts published today (2026-04-01) via npm run publish

---

### 2026-04-02 -- Competitive intelligence report
- Researched top kids activity brands on Pinterest and Instagram (Busy Toddler, Kids Activities Blog, Fantastic Fun and Learning, TheDadLab, Raising Superstars, Planning Playtime, 3Dinosaurs)
- Analyzed Pinterest 2026 algorithm changes: Idea Pins get 9x more saves than standard pins
- Documented Pinterest Parenting Trend Report 2026 data: screen-free +200%, educational activities +280%, sensory play +1070%
- Analyzed Instagram format benchmarks: carousels 0.55% > reels 0.52% > single image
- Identified 8 content gaps: educational/developmental framing, seasonal content, screen-free positioning, Idea Pins, lead magnet freebie, UGC, comparison content, parent tips
- Created prioritized action plan: 15 items across immediate/short/medium/long term
- Output: docs/COMPETITIVE_INTELLIGENCE.md

### 2026-04-02 — Vertex AI integration, prompt system upgrade, competitor-driven marketing overhaul
- Fixed generate-prompts.mjs crash: unescaped backticks in template literal (line 287-289)
- Tested Vertex AI Express API key: Imagen 4.0, Veo 3.0, Gemini 2.5/3.x all accessible
- Built generate-images-vertex.mjs: separate Imagen 4.0 track for story posts, safety rewrite via Gemini 2.5 Flash
- Imagen child safety: prompts with children return empty {}; Gemini rewrites to hands/POV/environment composition
- Prompt cleaning: strips dimensions, aspect ratios, age refs, whitespace instructions before sending to Imagen
- Major system prompt upgrade in generate-prompts.mjs: Imagen-compatible composition, 8 hook types rotation, developmental skill framing, screen-free positioning, seasonal awareness, 25+ theme pool
- Competitor analysis: Busy Toddler, Kids Activities Blog, TheDadLab, Fantastic Fun and Learning, Raising Superstars
- Hashtag expansion: 4 new pools (screenfree, printables, developmental, quiettime), Pinterest/Instagram defaults updated
- "FREE Printable" badge: green overlay on all activity posts via import-raw.mjs
- Decision: activity posts stay manual (ChatGPT/Gemini UI), Imagen only for story posts
- Decision: puzzle algorithm generators NOT worth building for content pipeline (ROI too low vs visual quality)
- Added ASMR brief generation to daily pipeline (npm run daily now runs 4 steps)
- Hook text overlays on image posts: Halbert-style scroll-stoppers auto-added during import:raw
  - Story posts: curiosity/emotional hooks (20 templates)
  - Activity posts: challenge hooks (18 templates, 3 support {theme} personalization)
  - Pattern-interrupt posts: 6 dedicated templates
  - Bottom-center dark bar, white bold text, font scales for landscape
  - Override via sidecar JSON or --no-hooks flag
- Video hook intro: replaced black title card with 2-phase intro (first image + hook text 2.5s → title card 2s)
- Video CTA outro: replaced "The End" with emotional echo on last image (2.5s) → soft CTA card with logo + invitation (3.5s)
- All copy follows Gary Halbert greased slide principles: punch at the end, curiosity loops, soft invitations
- Dot-to-dot gold standard prompt (EXAMPLE D): large bold numbered dots, black line art, pastel bg, decorative corners, difficulty tiers (15-70 dots)
- Fixed category misdetection: "story-doing a maze activity" was matching 'maze' before 'story'. Now checks filename-start first, contains second.
- Built folder-based category system: output/raw/story/, output/raw/maze/, etc. Folder overrides filename detection. Name files anything.
- Cleaned stale queue files from misdetected run, reimported + regenerated all 10 captions correctly

---

### 2026-04-03 — Vertex parser fix, raw subfolders, dot-to-dot enforcement
- Created all 11 category subfolders under output/raw/ (story, maze, wordsearch, etc.) so Ahmed can drop images by folder
- Fixed Vertex Imagen script: prompt parser expected `1. **[STORY]` format but prompts file uses `### 1. [STORY]` markdown headings. Updated regexes to handle both formats.
- Reinforced dot-to-dot enforced template: LLM was ignoring Example D template in system prompt. Added explicit reminder in user prompt's MANDATORY activity section referencing both maze (Example C) and dot-to-dot (Example D) templates.

---

### 2026-04-04 (session 2) — Full caption template rewrite: Vitale + Halbert enforcement

- Rewrote all 14 caption templates (5 story + 5 activity + 4 ASMR) to enforce Hypnotic Writing + Halbert standards
- **All templates now include:** style guide injection line at top, HALBERT FINAL PASS block (4 rules), strong/weak examples
- **ASMR templates (4 complete rewrites):**
  - instagram-asmr.txt: 3-beat formula (Sensory Transport → Insight Line → Identity+Save), 350-600 chars
  - tiktok-asmr.txt: 3 hypnotic patterns (Sensory Anchor / Identity Quiet / Curiosity Pause), <180 chars, banned POV format
  - x-asmr.txt: 2 patterns (Atmospheric / Insight Line), <220 chars, every word load-bearing
  - youtube-asmr.txt: Sensory Title Line + Sensory Scene + Brand Close, SEO keyword embedded in feeling not bolted on
- **Activity templates (5 complete rewrites):**
  - pinterest-activity.txt: Formula A (Challenge) + Formula B (Micro-Story), 200-380 chars
  - instagram-activity.txt: Formula A (Challenge) + Formula B (Mirror/Micro-Story), 400-700 chars
  - tiktok-activity.txt: 3 patterns (Challenge Interrupt / Identity Hook / Micro-Story Flash), banned POV format
  - x-activity.txt: 3 patterns (Halbert Punch / Micro Curiosity / Identity+Insight), <220 chars
  - youtube-activity.txt: Transformation Hook + Micro-Story+Skill + Identity+CTA, 250-450 chars
- **Story templates (5 micro-fixes):** Added style guide injection + Halbert final-pass block to pinterest, instagram, x, tiktok, youtube
- All fog word bans now explicit: beautiful, wonderful, amazing, great, really, very, perfect, incredible

---

### 2026-04-05 — Prompt generation: Sunday structure fix + within-day uniqueness

**Problems diagnosed:**
- Sunday `getTodaysMix()` returned no slots — just `archetypes: [1..6]` and `isRepost: true`. `buildUserPrompt` sent a freeform instruction to the LLM with zero structure → 10 story posts, 0 activity posts, hallucinated archetypes ("The Parent Who Chose"), duplicate settings (two prompts in "cozy living room", two at "desk in bedroom"), repeated art styles (watercolor x2), same age/gender repeated 3× in one batch.
- Root cause: Sunday had a special freeform path that bypassed all slot-level constraints weekdays use.

**Fixes applied to `scripts/generate-prompts.mjs`:**
1. **Sunday slots structure:** Sunday now returns proper slots — 5 story (Arch 1-6, 5 rotating weekly via `weekNum % 6`) + 5 activity (same `pickTodaysActivities()` as weekdays). `isRepost: true` kept as flag only.
2. **Child profiles pre-assigned:** Added `CHILD_PROFILES` array (4F, 6M, 5F, 7M, 8F) + `getChildProfilesForToday()` rotating by day-of-year. Each story slot (all days, not just Sunday) now has `childProfile` injected into the slot description. LLM cannot default to same age/gender repeatedly.
3. **Setting uniqueness mandate:** Added "SETTING UNIQUENESS" rule to MANDATORY section in `buildUserPrompt` — explicit list of varied locations, no two prompts may share same room.
4. **Sunday `isRepost` freeform branch removed** from `buildUserPrompt`. Sunday now flows through the same structured slot path as weekdays. Only a header note remains ("no Arch 7, no Pattern Interrupt, no tablet/phone").
5. **Art style collision:** Pre-assigned via `getArtStylesForToday()` per slot (was already in weekday path, now Sunday uses it too) — 14-style pool, offset by day-of-year × 7, all 5 slots get distinct styles.

**Files changed:** `scripts/generate-prompts.mjs`
**Verified:** `--dry-run` shows correct structure: 5 story with beats/styles/child profiles, 5 activity slots.

---

### 2026-04-05 — Prompt output format fix (slot echo + missing dimensions)

**Problem:** LLM was echoing slot instruction text into output headers (e.g., "1. [STORY] Archetype 2 (pure-story). Freeze this beat: Beat 1...") instead of generating clean structured output. Also omitting dimensions and Hook type field from image prompts.

**Root cause:** Slot descriptions were single-line runs that visually resembled output headers. No explicit "do not echo" instruction. Dimensions mandate was in system prompt but not reinforced in user prompt output rules.

**Fixes in `scripts/generate-prompts.mjs`:**
- Slot descriptions restructured to multi-line labeled blocks (`Slot N: Archetype X — pure-story\n  Beat: ...\n  Art style: ...\n  Child: ...`) — clearly instruction format, not output format
- Added `━━━ INPUT INSTRUCTIONS — do NOT copy these into your output ━━━` divider with explicit mandate
- Added `━━━ OUTPUT RULES ━━━` section reinforcing all required fields including: dimensions at end of every story prompt, dimensions + watermark space at end of every activity prompt
- Seasonal note per slot is now inline in the slot block (not appended to the single line)

---

### 2026-04-05 — Trend signal pipeline built (collect-trends.mjs)

**What was built:**
- `scripts/collect-trends.mjs` — weekly trend signal collector
  - Source 1: Google Trends (`google-trends-api`) — rising related queries for 8 target keywords, mapped to internal theme labels
  - Source 2: Rich seasonal calendar — all parenting-relevant moments (holidays, school breaks, national activity days) with urgency scoring (days_away → boost weight)
  - Easter computed dynamically via Meeus/Jones/Butcher algorithm
  - Output: `config/trends-this-week.json` — boost_themes, rising_searches, upcoming_moments, caption_keywords
  - Stale after 8 days — prompts warn if expired
  - `--dry-run` flag for preview; `--monday-only` flag for daily automation
- `scripts/generate-prompts.mjs` — added `loadTrendSignals()` function
  - Reads `config/trends-this-week.json`, injects TREND SIGNALS block into user prompt
  - Tells LLM: trending themes, upcoming moments with urgency, rising search queries to weave into captions
  - Silent fallback if no file exists — never blocks generation
- `package.json` — added `npm run trends`, `npm run trends:dry`
- `npm run daily` — `collect-trends.mjs --monday-only` injected between archive and generate-prompts
- `google-trends-api` installed as dependency

**Verified:** Dry-run confirmed Easter (TODAY) + Spring Break (TODAY) + Earth Day (17 days) detected. Google Trends returned real rising queries. Trend block flows correctly into generate-prompts user prompt.

---

### 2026-04-06 — Content quality + story system overhaul

**What was built:**

**Prompt quality gate hardened:**
- `scripts/generate-prompts.mjs` — added coloring correctness (−5) and dot-to-dot correctness (−5) rules to scorer; added explicit warning when scorer returns no output (was silently failing); added `regeneratePrompt()` function + auto-regen loop (up to 2 rounds for score <5 prompts)
- Fixed root cause of today's bad prompts: coloring page said "colored with bright pastel colors"; dot-to-dot said "thick outlines". Both now instant-fail the scorer and trigger regen.
- Added Example E (coloring page template) and fixed Example D (dot-to-dot — removed pre-drawn outline instruction) in the system prompt

**Archive pipeline:**
- `scripts/archive-queue.mjs` — added `output/prompts/` sweep; daily prompts now archived to `output/archive/prompts/` alongside other assets

**ASMR brief generator hardened:**
- `scripts/generate-asmr-brief.mjs` — added `trends-this-week.json` injection into prompt; rewrote blank image description to be explicit (ZERO color, black+white only); added per-type critical rule with explicit anti-patterns for coloring blank

**Story generator overhauled:**
- `scripts/generate-story-ideas.mjs`:
  - Default slides: 7 → 8
  - 3-act structure replaced with 8-beat viral arc (The Grab / Stakes / Attempt / Deepening / Break / Turn / Resolution / Echo)
  - Added HOOK-FIRST architecture rule (Beat 1 = one sentence, drop into action)
  - Added SHARE TRIGGER section (Beat 8 = one sentence, three proven techniques)
  - Added CHARACTER REPETITION rule to image prompt spec (full description inline every slide)
  - Added `trends-this-week.json` injection into user prompt
  - Added `performance-weights.json` injection (graceful if missing)
  - max_tokens: 2500 → 5000
  - Removed "leave bottom 10% blank" from story image prompts (compositor handles watermarks)

**Story ep01 image prompts rewritten manually:**
- `output/stories/ep01-.../image-prompts.md` — all 7 slides rewritten with full character description inline, distinct lighting progression, named foreground elements, specific posture/expression, no bottom-10% instruction

**Memory:**
- Added `project_story_phase2.md` — Phase 2 plan locked: story-level analytics → story-performance-weights.json → auto-weighted arc selection. Trigger: 8+ published episodes with analytics data.

---

### 2026-04-06 (continued) — Pinterest video posting fix

**Problem:** ASMR and story videos failing to post to Pinterest with 400 error. Root cause: code was uploading video to catbox.moe then passing `source_type: 'video_url'` — that source type does not exist in Pinterest's API.

**Fix (`scripts/post-content.mjs`):**
- Replaced catbox video upload + `video_url` approach with Pinterest's mandatory 3-step video flow:
  1. `POST /v5/media` → get `media_id` + S3 presigned `upload_url` + `upload_parameters`
  2. Upload mp4 directly to S3 presigned URL (multipart form with all upload_parameters)
  3. Poll `GET /v5/media/{media_id}` every 5s until `status: succeeded` (max 30 attempts / ~2.5 min)
  4. Create pin with `source_type: video_id` + `media_id`
- Hoisted `apiBase` const to top of `postToPinterest()` so it's available for both media register and pin create calls
- Removed duplicate `apiBase` declaration

**Note:** If sandbox API doesn't support video uploads, switch `PINTEREST_API_BASE` to `https://api.pinterest.com` (production) to test.

---

## 2026-04-07 — Pipeline fixes: Pinterest cover image, X threads, story video pacing

**Files changed:** `scripts/post-content.mjs`, `scripts/generate-captions.mjs`, `scripts/generate-story-video.mjs`, `docs/TASKS.md`

### Pinterest cover image
- Added `extractVideoThumbnail(videoPath)` — extracts frame at 1s via FFmpeg, saves to OS temp dir
- After video upload + media_id confirmed, extracts thumbnail → uploads via `uploadTempImage()` → passes `cover_image_url` in pin body
- Added `import { execSync } from 'child_process'` and `import { tmpdir } from 'os'`

### X thread format
- Added `generateXThreadReply(mainCaption, metadata)` in `generate-captions.mjs` — one Groq call, returns reply tweet ≤280 chars
- 3 reply types: activity (score/result + "drop it below"), story (resolution, no CTA), default (insight or "which one does your kid love?")
- After X caption is generated, thread reply is auto-generated and stored as `captions.x.thread = { tweet1, reply1 }`
- `postToX()` in `post-content.mjs`: if `caption.thread.reply1` exists, posts it as reply using `in_reply_to_tweet_id` via Twitter API v2
- Image posts unaffected — thread is additive, not a replacement

### Story video pacing
- Removed CTA outro entirely — `OUTRO_CTA_DURATION` and `OUTRO_ECHO_DURATION` constants removed
- `OUTRO_DURATION = 1.5s` — just a clean fade-to-black on last story image
- `MAX_SCENE_DURATION = 4.5s` — non-TTS slides clamped; TTS path logs a warning if exceeded (can't cap TTS without cutting audio)
- `createOutroFrames()` rewritten: no text, no CTA, just hold + fade to black over 1.5s
- Default story template updated: 9 slides at 3-4s each, 1-sentence narration per slide
- Slide count validation updated: 6-15 (was 3-12)

**Pending (Codex tasks):** `x-thread-story.txt` and `x-thread-puzzle.txt` templates with JSON output format for smarter per-type thread generation.

---

## 2026-04-07 — [Agent: Claude] — Story video outro: loop-friendly clean cut + AGENTS.md protocol

**Files changed:** `scripts/generate-story-video.mjs`, `docs/AGENTS.md`, `docs/TASKS.md`

### Story video outro revision
- Revised from fade-to-black (1.5s) to zero outro — `OUTRO_DURATION = 0`
- `createOutroFrames()` call removed entirely from main loop
- Outro silence segment removed from narration track (`buildNarrationTrack`) — `allSegments` now only `[introPaddedPath, ...paddedClips]`
- `totalNarration` log line fixed: removed `outroBuf` reference
- Result: video ends cleanly on last Ken Burns frame — platform loops naturally back to hook

### AGENTS.md multi-agent protocol
- Added full shared communication protocol: what both agents read at session start, what both write at session end (TASKS.md → SESSION_LOG.md → CHAT_LOG.md order)
- Added "Rules That Protect Both Agents" table (no cross-file renames, no TASKS.md reformatting, always --dry-run, npm script pairs)
- Added handoff signals: Codex leaves `[CODEX DONE — needs Claude review]` when judgment needed
- Updated JoyMaze context block with 3 new file pointers
- Codex prompt pattern now includes end-of-task logging instruction

### X text post scheduler
- Full Codex spec written into TASKS.md: 3 tasks (`generate-x-posts.mjs`, `post-x-scheduled.mjs`, `daily-scheduler.mjs` patch)
- Confirmed X text posts and X image posts are completely separate pipelines

---

## 2026-04-07 — [Agent: Codex] — X thread templates + X text scheduler build

**Files changed:** `templates/captions/x-thread-story.txt`, `templates/captions/x-thread-puzzle.txt`, `scripts/generate-x-posts.mjs`, `scripts/post-x-scheduled.mjs`, `docs/TASKS.md`, `docs/AGENTS.md`

- Added `templates/captions/x-thread-story.txt` and `templates/captions/x-thread-puzzle.txt` as strict JSON prompt templates for story and puzzle X threads.
- Built `scripts/generate-x-posts.mjs` to generate daily standalone X text posts from writing style + optional trends/hooks inputs, save them to `output/queue/x-text-YYYY-MM-DD.json`, and support `--dry-run`.
- Extended story text posts beyond the original single-reply spec: story hooks now allow stronger scene-based hooks, up to 280 chars per tweet, and multi-reply threads via `replies[]`; `reply1` is still written as the first reply for backward compatibility.
- Built `scripts/post-x-scheduled.mjs` to post due X text posts by hour, chain the full `replies[]` thread, and persist `tweetId` + `replyIds` incrementally so retries do not duplicate the root tweet.
- Verified `node scripts/post-x-scheduled.mjs --dry-run` against today's queue file.
- Remaining ambiguity: `docs/TASKS.md` says to add `generate-x-posts.mjs` after `generate-captions.mjs` in `daily-scheduler.mjs`, but the current scheduler does not run `generate-captions.mjs` at all. [CODEX DONE — needs Claude review]

---

## 2026-04-07 — [Agent: Codex] — Coordination docs sync + CODEX startup refresh

**Files changed:** `docs/TASKS.md`, `docs/AGENTS.md`, `docs/CHAT_LOG.md`, `CODEX.md`

- Synced the task board to mark completed Codex X-thread/X-scheduler work done and marked the `daily-scheduler.mjs` patch as blocked pending clarification.
- Added a current handoff note in `docs/AGENTS.md` so the unresolved scheduler insertion point is visible at session start.
- Read the full `docs/` set and rewrote `CODEX.md` to use the live startup read order (`AGENTS.md` → `docs/TASKS.md` → `MEMORY.md` → `docs/AGENTS.md` → latest `docs/SESSION_LOG.md`) instead of the stale `ACTIVE_SPRINT.md` flow.
- Added durable project context to `CODEX.md`: Phase 0 constraints, platform roles, story/activity operating model, hybrid manual+automation workflow, AI stack, and the current blocked scheduler note.

---

## 2026-04-08 — [Claude] — YouTube OAuth + 4am auto-post scheduler

**Files changed:** `scripts/get-youtube-token.mjs` (used + can delete), `scripts/daily-scheduler.mjs`, `scripts/setup-post-task.ps1`, `package.json`

- YouTube OAuth completed: ran get-youtube-token.mjs, exchanged auth code, YOUTUBE_REFRESH_TOKEN written to .env. YouTube posting now live.
- Added 4am Cairo auto-post cron to daily-scheduler.mjs: posts queued images + videos to Pinterest/TikTok/YouTube/X at 4:00 AM Africa/Cairo (= 6 PM Pacific peak window). Separate from 9am generation job.
- New --post-now flag + npm run scheduler:post-now for manual trigger of posting-only job.
- Created scripts/setup-post-task.ps1 + ran it as Administrator: Windows Task Scheduler task "JoyMaze 4am Post" created, StartWhenAvailable=true (runs on next login if PC was off at 4am).
- Confirmed existing tasks: "Joymaze Daily" (9am, last ran today) + "JoyMaze X Posts" (hourly drip) both live.

---

## 2026-04-08 — [Claude] — Maze gold standard + template update

**Files changed:** `scripts/generate-prompts.mjs`

- Added Example E (Ancient Egypt Hard maze) to gold standard pool — confirmed by Ahmed to produce a perfect maze in Gemini.
- Key new structural element: explicit corner decoration instruction ("Add small decorative elements, such as X and Y, to the corners of the page") — not in Example C, now folded into all maze prompts.
- Updated master maze fill-in-the-blank template to include corner decoration line. Removed "solvable in under X minutes" line (Egypt prompt proved it unnecessary).
- Note on the original Example C template: "solvable in X minutes" removed from canonical template going forward.

---

## 2026-04-09 — [Claude] — GitHub Actions cloud posting pipeline

**Files changed:** `scripts/upload-cloud.mjs` (new), `scripts/generate-images.mjs`, `scripts/import-raw.mjs`, `scripts/generate-asmr-video.mjs`, `scripts/generate-story-video.mjs`, `scripts/generate-activity-video.mjs`, `scripts/post-content.mjs`, `scripts/generate-x-posts.mjs`, `scripts/post-x-scheduled.mjs`, `.github/workflows/x-posts.yml` (new), `.github/workflows/post-media.yml` (new), `.github/workflows/weekly.yml` (new), `.gitignore`, `package.json`, `docs/DAILY_CHEATSHEET.md`

- GitHub repo created and pushed (drmetwally/joymaze-content, public). 17 GitHub Secrets configured via gh CLI.
- Built `scripts/upload-cloud.mjs`: shared Cloudinary upload utility, pure fetch multipart, no npm dep. Cloudinary account: dm9eqz4ex.
- Hooked upload into all 5 generation scripts: generate-images, import-raw, generate-asmr-video, generate-story-video, generate-activity-video. Each uploads after render and stores `cloudUrls`/`cloudUrl` in queue JSON.
- Updated `post-content.mjs`: added `resolveMedia()` — downloads from Cloudinary when local file missing. Enables GitHub Actions posting.
- Built 3 GitHub Actions workflows: x-posts.yml (hourly X text drip), post-media.yml (2:00 UTC / 4AM Cairo media posting), weekly.yml (Monday maintenance).
- Fixed UTC scheduling bug: `scheduledHour` was local Cairo time — broke in GitHub Actions. Both X scripts now use `getUTCHours()` and UTC date.
- Optimised X post times: research-based UTC [13,17,21,23] = 8AM/12PM/4PM/6PM EST for North American parents.
- Race condition fix: deleted local "JoyMaze X Posts" Task Scheduler job. GitHub Actions is sole X text post owner.
- Cooldown fix: `output/posting-cooldown.json` now tracked in git (restructured .gitignore from `output/` to `output/*`). Pushed cooldown active until 2026-04-12.
- Rewrote DAILY_CHEATSHEET.md for cloud architecture: architecture table, file location table, Step 8 git push, updated cooldown section, Actions manual trigger guide.
- New daily rule: `git push` after `generate:captions` = new "post" button. PC can be off after push.

---

## 2026-04-09 — [Claude] — Activity videos, Pinterest demo, story narration fix

**Files changed:** `scripts/generate-activity-video.mjs` (new), `scripts/get-pinterest-token.mjs` (new), `docs/PINTEREST_DEMO_GUIDE.md` (new), `scripts/generate-story-ideas.mjs`, `docs/DAILY_CHEATSHEET.md`, `package.json`

- Built `generate-activity-video.mjs`: converts maze/matching/quiz/tracing/dot-to-dot queue items into 15s YouTube Shorts. Hook text from queue JSON overlays full duration (no fade, no CTA). Uses -tt.png variant directly (already 1080x1920). crayon.mp3 audio. Outputs *-yt-short.mp4 + new queue JSON (type: youtube). npm scripts: `generate:activity:video` + `generate:activity:video:dry`. Dry run confirmed 4/5 items eligible (coloring correctly skipped).
- Built `scripts/get-pinterest-token.mjs`: full OAuth authorization_code flow demo script (mirrors get-youtube-token.mjs pattern). Shows Pinterest auth screen → user approves → code exchanged → tokens received → live pin created. Built for second Standard API demo submission. Saved recording guide to `docs/PINTEREST_DEMO_GUIDE.md`.
- Fixed story narration word count: `generate-story-ideas.mjs` prompt now enforces **15 words max per slide** (was unbounded). First story had 7–10s TTS per slide vs 3–4s target — root cause was no word count ceiling, not slide count. Added beat-by-beat examples proving 15 words is sufficient for full story quality. Testing over next few days.
- Updated DAILY_CHEATSHEET.md: added automated 4am posting section, STEP 4B (activity puzzle videos), YouTube to Step 8, new troubleshooting rows.

---

## 2026-04-10 — [Claude] — Pipeline status command

**Files changed:** `scripts/status.mjs` (new), `package.json`

- Built `scripts/status.mjs`: single-command pipeline snapshot — cooldown status, today's X text queue with per-post state (posted/pending/due/failed/partial), tweet IDs + timestamps for posted entries, past-day failure surfacing.
- Added `npm run status` to package.json.

---

## 2026-04-10 — [Claude] — Status command expanded to full pipeline

**Files changed:** `scripts/status.mjs`

- Rewrote status.mjs to cover the full workflow: Generation state (prompts, images in queue, story episodes, ASMR briefs, rendered videos), Recent Archive (last 5 days, per-platform posted/failed counts), X text posts (today's queue). Single command gives complete pipeline snapshot.

---

## 2026-04-10 — [Claude] — X post generator full rewrite: style injection + scoring + feedback loop

**Files changed:** `scripts/generate-x-posts.mjs`

**Root causes fixed:**
1. `buildSystemPrompt()` was dumping all 796 lines of writing-style.md verbatim — context-flooded the model, causing generic fallback patterns
2. User prompt hardcoded banned CTAs ("which resonates with you?", "save this for when you need it") as type requirements — overrode style guide
3. Puzzle type had no constraint against image references — generated broken "find eggs in this picture" text posts
4. theme-pool-dynamic.json, cta-library.json (x.engagement), performance-weights.json — none were read
5. No deduplication against previous 7 days
6. No scoring gate — posts saved regardless of quality

**Changes:**
- `extractStyleSections()`: pulls only 10 relevant ## sections from writing-style.md (~200 lines vs 796)
- `buildSystemPrompt()`: extracted sections + hard BANNED PATTERNS block (openers, phrases, puzzle image-ref rule)
- `buildUserPrompt()`: all context injected (themes, CTAs, perf weights, dedup fingerprints); type rules rewritten; no hardcoded CTAs
- `scorePost()`: rule-based 5-dimension scorer (scroll-stop, relevancy, non-promo, engagement, clarity) with per-post reasons
- `loadRecentFingerprints()`: dedup against last 7 days of x-text-*.json
- Retry logic: 1 retry pass for failing slots, spliced back by position
- Scores saved to output/scores/x-text-scores-YYYY-MM-DD.json for feedback loop
- All context loaded in parallel (Promise.all)
- Dry-run confirmed: all 4 posts pass threshold, no banned phrases, puzzle is a self-contained riddle

---

## 2026-04-10 — [Claude] — Puzzle delayed-answer engagement loop + intelligence first run

**Files changed:** `scripts/generate-x-posts.mjs`, `scripts/post-x-scheduled.mjs`

**Puzzle structure change:**
- Removed immediate answer from puzzle replies
- reply1 = engagement/hint line ("drop your guess 👇 — answer drops in a few hours")
- New `answer_tweet` field = delayed answer, posted as a reply to original puzzle tweet
- `answer_scheduledHour` = next SCHEDULED_HOURS_UTC slot after puzzle (e.g. puzzle@17 → answer@21)
- post-x-scheduled.mjs: added `getDueAnswers()` + separate posting loop for answer replies
- Also fixed latent bug: `formatDateLocal` (undefined) → `formatDateUTC` on line 140

**Intelligence system first run:**
- Ran: `npm run intelligence:refresh --skip-competitor` → `npm run intelligence:apply`
- 4 themes added: Earth Day Conservation, Community Helpers, Fantasy Creatures, Inventors & Inventions
- 6 hooks generated but brand_safe=null (validation bug — Groq validator didn't set field) → 0 applied
- 3 CTAs rejected (false positive "competitor mentions" — no actual competitor in text) → 0 applied
- 3 pattern interrupts added (surprising-stat, myth-bust, did-you-know)
- Key insight: "hook gap = hooks framing screen time as intentional good choice"; focus shift = address parental guilt directly
- Bug to fix: brand safety validator not setting brand_safe=true on hooks/CTAs that pass (leaves null → apply skips them)

---

## 2026-04-10 — [Claude] — 3 fixes: brand safety validator, X image sizing, overlay removal

**Files changed:** `scripts/intelligence-refresh.mjs`, `scripts/import-raw.mjs`

**Fix 1 — Brand safety null bug (intelligence-refresh.mjs):**
- Root cause: pass 2 (Groq 8b model) set REVIEW entries to `brand_safe: null` and only set SAFE/REJECT — never explicitly set `true` for entries that passed
- Groq 8b was over-triggering REVIEW on clearly safe hooks (e.g. "The silence isn't empty. It's full of focus.")
- Fix: after pass 2 verdict loop, normalise all `!== false` entries to `brand_safe = true`
- Pass 1 (hard blocklist) remains the real safety gate; REJECT from pass 2 still blocks
- Next intelligence run: all 6 hooks should now apply correctly

**Fix 2 — X image sizing (import-raw.mjs):**
- Was: 1200×675 (16:9 landscape) → portrait printables got blurred sides letterbox treatment
- Fix: 1080×1350 (4:5 portrait) — same as Instagram portrait, no blur, printable content fills frame
- `smartResize` now sees 0.67 (2:3 source) vs 0.80 (4:5 target) = diff 0.13 < 0.15 threshold → clean cover-crop, no blur

**Fix 3 — Overlay removal from ALL platforms (import-raw.mjs):**
- Removed: hook text overlay (orange bar), "FREE Printable" badge, joymaze.com watermark
- Kept: brand logo only (bottom-left, ~8% of image width)
- Rationale: overlays obscure printable content and read as promotional; hook/CTA/URL belong in the caption
- hookText and textOverlay still stored in metadata JSON so generate-captions.mjs can use them as caption context
- Also fixed latent bug in post-x-scheduled.mjs: `formatDateLocal` → `formatDateUTC` (undefined function, was crashing in non-cooldown live runs)

---

## 2026-04-10 — [Claude] — Platform image fixes: TikTok + instagram_square + carousel design

**Files changed:** `scripts/import-raw.mjs`

**Analysis — what was broken:**
- instagram_square (1:1): aspect diff 0.333 > threshold → triggered blurred-sides letterbox (same problem as X was)
- tiktok (9:16): aspect diff 0.104 < threshold → cover-crop, but clips ~8% from each side of printable content

**Fixes:**
- Added `fitMode` property to each PLATFORM_SIZES entry: 'auto' | 'cover' | 'contain-white'
- `smartResize()` now accepts fitMode as 4th arg: 'contain-white' = full image on white bg, no blur, no crop
- `compositeBrandElements()` threads fitMode through to smartResize
- TikTok: fitMode 'contain-white' → centered printable on white, no side-clipping
- instagram_square: fitMode 'contain-white' → full portrait image on white square bg
- Instagram metadata posting image: switched from instagram_square to instagram_portrait (4:5 portrait = primary Instagram feed format)
- X and Pinterest unaffected (already correct)
- Blurred-bg letterbox path still exists in 'auto' mode as fallback but is now rarely reached

**Carousel design recommendation (not yet implemented):**
- Instagram (4:5, up to 10 slides): Activity Collection first (groups existing images, zero new assets)
- TikTok Photo Mode (9:16, up to 35 photos): same activity-collection approach
- Build plan: sidecar JSON carousel grouping → carousel queue metadata → carousel posting flow
- Priority: Instagram carousel first (Graph API well-documented), TikTok second

---

## 2026-04-10 — [Claude] — Carousel posting pipeline complete

**Files changed:** `scripts/import-raw.mjs`, `scripts/post-content.mjs`

**What was done:**
- import-raw.mjs: Added `buildCarousels(results)` call at end of `main()` — carousel JSON files are now written to output/queue/ after every import run (skipped in dry-run)
- post-content.mjs: Fixed `imageKey: 'instagram_square'` → `'instagram_portrait'` in POSTERS config
- post-content.mjs: Added `postCarouselToInstagram(metadata)` — 3-step Graph API flow (per-slide item containers with is_carousel_item:true → carousel container with media_type:CAROUSEL and children list → publish)
- post-content.mjs: Added `postCarouselToTikTok(metadata)` — single PULL_FROM_URL call with photo_images array and photo_cover_index:0
- post-content.mjs: Added `postCarousel(metadata)` orchestrator with dry-run support, per-platform status tracking, and failure persistence
- post-content.mjs: Added carousel routing in `main()` — detects `metadata.type === 'carousel'` before the captions guard and routes to `postCarousel()` with continue; plain images/videos follow the existing `postContent()` path

**To test:**
- `node scripts/import-raw.mjs --dry-run` confirms no carousel files written in dry-run
- `node scripts/post-content.mjs --dry-run` will show carousel dry-run output for any carousel-*.json in queue
- Carousel triggered by adding `"carouselGroup": "my-group"` + `"slideIndex": 1` to image sidecar JSONs

---

## 2026-04-10 — [Claude] — Zero-friction carousel automation

**Files changed:** `scripts/generate-prompts.mjs`, `scripts/import-raw.mjs`, `docs/DAILY_CHEATSHEET.md`

**Problem solved:** Carousel group naming was manual — Ahmed had to invent a name, write sidecar JSONs per image, and track slideIndex himself. Friction = never gets used.

**Solution:**
- `generate-prompts.mjs`: every 3rd content day (`doy % CAROUSEL_PERIOD === 0`, CAROUSEL_PERIOD=3), automatically plans a carousel from today's 5 activity slots. Group name derived from dominant theme + date (e.g. `carousel-spring-flowers-2026-04-10`). Writes `carousel-plan-YYYY-MM-DD.json` + appends full drop instructions (folder path, filename examples) to the prompts `.md` file.
- `import-raw.mjs`: auto-detects any subfolder starting with `carousel-` in output/raw/. Files sorted alphabetically = slide order. No sidecar JSONs needed. `importImage()` accepts `carouselOverride` param (folder-based assignment takes priority over any sidecar).

**Ahmed's workflow on carousel day:**
1. Open prompts file — carousel instructions at the bottom
2. Create the folder it tells you (e.g. `output/raw/carousel-spring-flowers-2026-04-10/`)
3. Drop the 5 activity images in, name them `01-xxx.png`, `02-xxx.png`, etc.
4. `npm run import:raw` — carousel queue file built automatically

---

## 2026-04-10 — [Claude] — Carousel formats gap identified

**Finding:** Only Activity Collection carousel format is implemented (Format 1). Two formats discussed but not built:
- Format 2: Educational Facts carousel ("5 brain benefits of mazes" — one stat/fact per slide)
- Format 3: Age Progression carousel (same activity at Easy/Medium/Hard across age groups)

Both require changes to generate-prompts.mjs (new plan types) and import-raw.mjs (new folder prefix detection, e.g. `facts-carousel-*`). Logged in project_unimplemented_upgrades.md.

---

## 2026-04-11 — [Claude] — Carousel Formats 2 & 3 implemented

**Files changed:** `scripts/generate-prompts.mjs`, `scripts/import-raw.mjs`, `docs/TASKS.md`

**What was built:**
- **Format 2 (Educational Facts):** Triggers `doy%9===3` (next: 2026-04-12). Picks one activity from a 5-pool rotation (mazes/coloring/word-search/dot-to-dot/sudoku). Plans 5 slides: hook title card + 4 brain-benefit fact cards. Folder prefix: `facts-carousel-{activity}-{date}/`. Instructions appended to prompts .md file.
- **Format 3 (Activity Progression):** Triggers `doy%9===6` (next: 2026-04-15). Picks one activity from a 5-pool rotation. Plans 3 slides showing the satisfying completion journey: blank → 50% done → fully complete. Folder prefix: `progress-carousel-{activity}-{date}/`. Ahmed generates all 3 in same Gemini chat for visual consistency.

**Rotation schedule (9-day cycle):**
- `doy%9===0` → Format 1: Activity Collection
- `doy%9===3` → Format 2: Educational Facts
- `doy%9===6` → Format 3: Progression

**import-raw.mjs:** Extended folder detection to accept `carousel-*`, `facts-carousel-*`, and `progress-carousel-*` prefixes — all use the same zero-friction drop workflow.

---

## 2026-04-11 — [Claude] — Carousel intelligence + analytics self-learning

**Files changed:** `scripts/generate-prompts.mjs`

**What was added:**

1. **`loadActivityRanking()`** — scans queue + archive for Pinterest analytics, ranks activity types (mazes/coloring/word-search/dot-to-dot/sudoku) by save rate. Returns sorted key array. Falls back to empty array (doy rotation) if < 5 posts have analytics data.

2. **`scoreCarouselSlides(plan)`** — Groq `llama-3.1-8b-instant` scorer for carousel slide descriptions. Scores each slide 1–10 for visual specificity and distinctiveness. Logs a quality gate table to console (PASS/WEAK/FLAG). Same gating pattern as the existing 10-prompt quality gate.

3. **Intelligence wiring for Formats 2 & 3:**
   - Activity selection: analytics ranking → doy rotation fallback (self-corrects once posts accumulate impressions)
   - Format 2 (Facts): dynamic `did-you-know` / `surprising-stat` entries from `pattern-interrupt-dynamic.json` replace last 1–2 hardcoded facts when a keyword match to the chosen activity is found
   - Format 2 (Facts): top hook from `hooks-library.json` (already loaded by `loadDynamicPools`) informs the hook title slide style
   - Format 3 (Progression): `boost_themes` from `trends-this-week.json` trigger trend-aware activity selection before falling back to analytics ranking

4. **`intelligenceSignal` field** added to plan JSON (`analytics-ranked` / `trend-boost` / `doy-rotation`) — logged to console and stored in the plan file for traceability.

**Self-learning progression:**
- Week 1-4: `doy-rotation` (no data yet)
- Week 4+: `analytics-ranked` (save-rate winner gets more carousel exposure)
- Any time: `trend-boost` if a trending topic overlaps an activity type

---

## 2026-04-11 — [Claude] — Content quality system overhaul + competitor intelligence

**Session type:** Manual audit → system hardening

**What was audited:**
- `output/prompts/prompts-2026-04-11.md` — 10 image prompts
- `output/queue/x-text-2026-04-11.json` — 4 X text posts

**Critical failures found and fixed:**
1. Prompt 1 (FACT-CARD): fabricated 25% stat + text-in-image instruction → rewritten
2. Prompt 10 (Coloring): Christmas/Halloween theme in April → replaced with Easter/spring
3. X Post 2 (puzzle): clock riddle had 0.3 relevancy — system rule gap exposed

**Universal rule added (Fun OR Value):**
- Every post must deliver: FUN (makes them participate/feel/laugh) or VALUE (something to use/act on)
- Hardcoded into generate-prompts.mjs RULES + slot descriptions + scorePrompts()
- Hardcoded into generate-x-posts.mjs Universal Rules + type rules + scorePost()

**Scroll Stopper rule hardcoded** — same locations, mandatory on every prompt

**Audit learning system built:**
- `config/audit-learnings.json` — 5 lessons, machine-readable, auto-injected at generation + scoring
- Future audits: append an entry → next run picks it up automatically. Zero code changes needed.

**Competitor intelligence system built:**
- `intelligence-refresh.mjs --competitor-only` → `config/competitor-intelligence.json`
- 6 targeted Gemini web searches → structured into formats/hooks/themes/gaps/scroll-stoppers
- `npm run intelligence:competitor` | `npm run intelligence:competitor:dry`
- Injected into generate-prompts.mjs system prompt as COMPETITOR INTELLIGENCE block
- First live run: 2026-04-11. Top finding: "actual activity as visual hero" + "analog meets AI aesthetic"

**PATTERN_INTERRUPT_POOL cleaned:** 5 fabricated stats softened to observational language

**Files changed:** `scripts/generate-prompts.mjs`, `scripts/generate-x-posts.mjs`, `scripts/intelligence-refresh.mjs`, `config/audit-learnings.json` (new), `config/competitor-intelligence.json` (new), `package.json`, `output/prompts/prompts-2026-04-11.md`

**Next:** Build `scripts/health-check.mjs` — system index + connectivity validator

---

## Session 2026-04-11 (continued — context resumed)

**npm run daily audit:**
- Competitor intelligence auto-ran, propagated 3 hooks + 3 themes + 1 interrupt to dynamic pools
- 9/10 prompts PASS at 9.5 | Prompt 10 correctly FLAG at 6.5 (wrong-season: "Christmas trees" in April)
- stripRuleViolations() confirmed working: "boost fine motor skills by 30%" → stripped from saved file
- preCheckViolations() correctly fires only on Prompt 10 wrong-season; fabricated stat stripped before pre-check runs (correct flow)

**health-check.mjs built:**
- `npm run health-check` → terminal report across 5 sections: Environment, Platform Credentials, Config Files, Dynamic Pools, Pipeline Links, Output Dirs
- 41 ok · 3 warnings (all expected: Pinterest sandbox, X cooldown tomorrow, Phase 2 analytics not yet active)
- Checks: env vars per script, config file existence, pool entry counts, pool/intelligence freshness (days), GitHub Actions workflows, pipeline chain connectivity
- X cooldown detected from output/posting-cooldown.json (any active cooldown → warn, not just "suspended")

---

## Session 2026-04-11 — Account migration (retroactive log, missed in context compression)

**X account repurposed:**
- Old suspended account scrapped (automation/spam flag — not appealed)
- Repurposed clean 3-year-old fit-clinic account → @playjoymaze
- Handle: @playjoymaze | Account age: ~3 years (no violation history)
- New X Developer App created, API keys obtained, `.env` updated with new credentials
- GitHub Secrets NOT yet updated (pending — must update before re-enabling x-posts.yml)
- Status: 2-week manual warmup in progress. x-posts.yml should remain DISABLED.

**New platform accounts created (Ahmed confirmed — no new API keys yet):**
- Pinterest: new account under joymaze.pp@gmail.com — old API keys still in .env. Need new Developer App.
- Instagram: new account under joymaze.pp@gmail.com — no live API credentials
- TikTok: new account under joymaze.pp@gmail.com — no live API credentials
- YouTube: already set up under joymaze.pp@gmail.com — OAuth live, unchanged

**Memory updated:** project_warmup_pipeline.md + project_pipeline_status.md now have the full platform account/API status table.
**Feedback added:** feedback_log_account_changes.md — any future account/credential mention must be logged immediately.

---

## Session 2026-04-12 — Morning audit + engine hardening

**Audit of today's generation:**
- X posts: 4 posts reviewed. story-hook (13:00) PASS. identity (23:00) PASS. insight (21:00) BORDERLINE (passive hook, acceptable). puzzle (17:00) FAIL — "head/tail/no body = coin" is a cliché riddle every parent has seen.
- Prompts: 10 reviewed. Prompts 1-5 (story) PASS. Prompts 6-9 (activity) PASS on content but missing art style directives — generic output risk. Prompt 10 FAIL — "Autumn Leaves" coloring page in April = wrong season; quality gate missed it.

**Surgical fixes applied today:**
- `output/queue/x-text-2026-04-12.json`: Replaced coin riddle with crayon riddle ("I get shorter every time I'm used..."). No schedule change.
- `output/prompts/prompts-2026-04-12.md`: Added style directive to Prompts 6-9 (watercolor, Pixar, storybook, ink-and-wash). Replaced Prompt 10 Autumn Leaves → Spring Garden coloring page.

**Engine fixes applied:**
- `generate-x-posts.mjs`: Added BANNED STALE RIDDLES blocklist to PUZZLE section (coin, footsteps, echo, clock, piano, shadow, river, map). LLM now has explicit "treat as banned" instruction.
- `generate-prompts.mjs`: (1) Expanded wrong-season preCheckViolations to catch autumn/fall themes in spring months 3-5 (regex: autumn leaves|fall leaves|harvest moon|etc., penalty -3). (2) Added mandatory style directive to ACTIVITY prompts instruction block. (3) Added ART STYLE NAMED penalty (-1) to activity prompt quality gate scoring rubric.

---

## Session 2026-04-12 — Remotion animation engine

**Installed:** `remotion`, `@remotion/renderer`, `@remotion/bundler`, `react`, `react-dom`
Chrome Headless Shell auto-downloaded on first render (107.6MB, cached).

**Built:**
- `remotion/index.jsx` — composition registry, `registerRoot`
- `remotion/compositions/StoryEpisode.jsx` — multi-slide story video: cross-fade transitions, Ken Burns zoom, hook text, Joyo watermark, music with fade in/out
- `remotion/components/HookText.jsx` — spring-animated yellow banner (scale + opacity)
- `remotion/components/JoyoWatermark.jsx` — bounce-in + continuous float sine wave
- `remotion/components/CaptionBar.jsx` — slide-up caption bar per scene
- `scripts/render-video.mjs` — Node.js render API: --comp, --story (story.json), --props, --out, --dry-run, --verbose

**Test render:** 1080×1920 h264, 6s, 2.2MB, 11.4s render time. Confirmed working.

**npm scripts:** animate:story, animate:story:dry, animate:story:verbose, remotion:studio

**Architecture:** publicDir = project root → all assets/output files served via staticFile(). story.json → props auto-conversion built in. Duration computed from slide durationFrames sum.

**Next for Remotion:**
- Wire `--story` flag to a real story.json once slides have imagePaths
- Add `AsmrReveal` composition (wipe reveal in React instead of FFmpeg)
- Add `FloatingStars` / confetti component for ASMR overlay
- Remotion Studio: `npm run remotion:studio` for visual preview during development

---

## Session 2026-04-12 — Full Remotion engine structure

**New compositions:**
- `remotion/compositions/AsmrReveal.jsx` — ASMR wipe reveal: hook → wipe (ltr/ttb) → hold + sparkles + brand. Reads from activity.json via --asmr flag. 34.5s default (3+30+1.5).
- `remotion/compositions/HookIntro.jsx` — 4s punchy hook clip: spring headline + subline + Joyo + brand. For Reels/Shorts hooks or prepended to longer videos.

**New components:**
- `remotion/components/FloatingParticles.jsx` — deterministic sparkles (golden-angle distribution, no random()). count, emoji, startFrame props.
- `remotion/components/BrandWatermark.jsx` — "joymaze.com" text overlay, fades in after 0.8s. position: bottom-center/bottom-right/top-right.
- `remotion/components/WipeReveal.jsx` — reusable wipe core: blank + solved images, clip-path ltr/ttb, luminous edge glow line. Used by AsmrReveal.

**render-video.mjs upgraded:**
- `--asmr activity.json` flag: reads activity.json → AsmrReveal props auto-built
- `--story story.json` flag: existing, reads story.json → StoryEpisode props
- Bundle caching: `_cachedServeUrl` module singleton — bundle once, reuse in same process
- Duration auto-computed per composition type

**npm scripts added:** animate:asmr, animate:asmr:dry, animate:hook, animate:hook:dry

**Test renders confirmed:**
- StoryEpisode: 6s, 1080×1920, 11.4s render ✓
- HookIntro: 4s, 1080×1920, 6.7s render ✓
- AsmrReveal: dry-run ✓ (needs blank.png + solved.png images to do live render)

**Next for Remotion:**
- Drop blank.png + solved.png into output/asmr/coloring-spring-flowers/ → run live AsmrReveal render
- Wire animate:asmr into daily pipeline (replace generate-asmr-video.mjs or run in parallel)
- Wire animate:story into story generation pipeline (replace FFmpeg slideshow)
- Remotion Studio: npm run remotion:studio for visual preview
- Future: AnimatedFactCard composition for carousel-style educational posts

---

## 2026-04-12 (session 2) — Daily output log + series naming + AsmrReveal wiring

**Files changed:** `scripts/track-output.mjs` (new), `scripts/generate-prompts.mjs`, `scripts/generate-asmr-video.mjs`, `package.json`, `docs/TASKS.md`

**Task 1 — Daily output log (Phase 0 gate dependency — DONE):**
- `scripts/track-output.mjs` → `output/daily-output-log.json` (append-only, 90-day window)
- Counts: image JSONs in archive/YYYY-MM-DD/, story-*.mp4 and asmr-*.mp4 in output/videos/
- Shows Phase 0 gate status per day + running 30-day streak count
- `npm run output:track` (write) + `npm run output:report` (read-only table view)
- Wired into `npm run daily` after archive step

**Task 2 — Series naming in generate-prompts.mjs (DONE):**
- `SERIES_NAMES = ['', 'Maze Monday', '', 'Puzzle Power Wednesday', '', 'Fine Motor Friday', '']`
- `seriesTag` added to `getTodaysMix()` return object
- `seriesNote` injected into `buildUserPrompt()` — tells LLM to weave the series name naturally into 1-2 caption hooks. Non-destructive (empty string = no-op on non-series days)

**Task 3 — AsmrReveal Remotion wiring (DONE):**
- `--remotion` flag added to `generate-asmr-video.mjs`
- When set for coloring/maze reveal types: calls `renderWithRemotion()` instead of FFmpeg pipeline
- `renderWithRemotion()` builds AsmrReveal inputProps from activity.json, calls render-video.mjs --comp AsmrReveal --props <json>, writes identical queue metadata JSON
- File naming handled: coloring → blank.png+colored.png, maze → maze.png+solved.png (passed as blankImagePath/solvedImagePath in props, bypassing render-video.mjs defaults)
- `npm run animate:asmr:remotion -- --asmr coloring-spring-flowers` for live render (needs images first)

**Note on "FREE Printable" overlay:** Decision to not add text directly over activity content (obscures the printable). Better approach deferred: small corner badge/ribbon on brand frame margin only. Revisit after Phase 0.

**Next:** Live AsmrReveal test — drop blank.png + colored.png into output/asmr/coloring-spring-flowers/ then run animate:asmr:remotion

---
**2026-04-12 s3 — Caption CTA audit + generate-prompts.mjs overhaul**

Trigger: Ahmed audited prompt2 (Easter maze Challenge Hook) — identified 3 compounding problems: (1) joymaze.com URL in every caption = bot fingerprint + intent mismatch; (2) pipe ( | ) separator = AI content tell; (3) scoring rubric was rewarding the wrong things (9.5 scores with fundamental issues).

Root cause: project_caption_cta_strategy.md had a "always include joymaze.com" rule that conflicted with the newer anti-spam rules (post-shadowban) and the agreed "let value drive people to link in bio" philosophy.

Changes made to generate-prompts.mjs:
- Story caption template: removed pipe + URL, hook stands alone
- Activity caption template: challenge hook + "Save this for later", no URL
- Gold Standard example A caption: stripped to the bare hook line
- Output rules (lines ~1691/1696): explicit prohibition on pipe and URL
- Scoring rubric (story + activity): pipe present = −2, URL present = −2/−3; rewrites what "good caption" means

Memory updated: project_caption_cta_strategy.md — full reversal of old rule with reasoning documented.

---
**2026-04-12 s4 — Intelligence engine run + final prompt audit**

Ran `npm run weekly` (full intelligence loop): trends collected (Spring Break today, Earth Day +10d, Mother's Day +29d), 4 new themes added (Snack Time, Acts of Kindness, Library Adventures, Summer Bucket List), 7 new hooks added, competitor-only second pass failed (VERTEX_API_KEY issue).

Generated prompts post-intelligence. Key wins:
- Garden/Flowers trend boost produced best caption of session: "Can your kid solve this flower maze before the petals fall?"
- Snack Time theme appeared for first time (P6 coloring page)
- Zero pipes, zero URLs, zero fake stats across all 10 prompts post-regen
- Gate: 10 pass, 0 flagged, 0 rejected, avg 8.9/10

Residual minor gap: coloring-style-conflict regex misses "Activity type: Coloring" (catches "Coloring Page" only). One-word gap, non-urgent.

---
**2026-04-13 s1 — Universal memory consolidation + Phase 0 gate update**

Files changed: `MEMORY.md` (full rewrite — canonical project memory), `scripts/track-output.mjs`, `CLAUDE.md`

**Task 1 — Universal MEMORY.md:**
Created `D:\Joymaze-Content\MEMORY.md` as single source of truth for all project state. Consolidates all 30+ memory files from `C:\Users\BESOO\.claude\projects\D--Joymaze-Content\memory\` into one local file. Covers: Ahmed profile, growth strategy, platform account status, anti-spam rules, caption strategy, content strategy, posting architecture, key scripts, intelligence/quality systems, video pipelines, API keys, geo strategy, pending items, multi-agent protocol, session hygiene. Mandatory read instruction at top for all agents.

**Task 2 — Phase 0 gate updated (track-output.mjs):**
Old gate: images≥10 AND storyVideos≥10 AND asmrVideos≥10
New gate: images≥10 AND asmrVideos≥1 AND storyVideos≥1 AND xTextPosts≥4
Added `countXTextPosts()` — reads `output/queue/x-text-YYYY-MM-DD.json`, counts total entries (covers manual warmup + automation). Report table now shows X Posts column. Gate description printed in report. Tested: today shows 4/4 X posts OK.

**Task 3 — CLAUDE.md startup updated:**
Step 1 now reads `MEMORY.md` (local) instead of `memory/MEMORY.md` (non-existent path). Daily targets updated to reflect new Phase 0 gate numbers.

**Root cause of memory drift:** CLAUDE.md was pointing to `memory/MEMORY.md` (project-local, does not exist) at startup. Auto-memory system writes to `C:\Users\BESOO\.claude\...`. Different sessions resolved the path differently. Fix: one canonical local file, all agents read it first.

**Note:** Yesterday's session not found in SESSION_LOG or CHAT_LOG — the end-of-session ritual was not completed. Context about new X account and manual posting start was lost. Memory file now has explicit warnings about skipping the ritual.

---
**2026-04-13 s2 — Remotion animation engine: Layer 2–4 build**

Files changed:
- `remotion/compositions/AsmrReveal.jsx` — progress bar added (fills with wipe, JoyMaze orange)
- `remotion/compositions/ActivityChallenge.jsx` — NEW composition: hook screen → puzzle + MM:SS timer → CTA screen
- `remotion/components/TypewriterCaption.jsx` — NEW component: word-by-word caption reveal, drop-in for CaptionBar
- `remotion/compositions/StoryEpisode.jsx` — `typewriterCaptions` prop added (default false, backward-compatible)
- `remotion/index.jsx` — ActivityChallenge registered (1950 frames default)
- `scripts/render-video.mjs` — ActivityChallenge computeDuration added
- `scripts/render-batch.mjs` — NEW: batch renderer, scans stories/ + asmr/ for pending folders, renders all
- `scripts/prepend-hook.mjs` — NEW: HookIntro prepend + FFmpeg concat for any existing video
- `package.json` — animate:challenge, generate:videos, prepend:hook scripts added
- `MEMORY.md` — §10 Remotion Engine table updated with new compositions + components
- `C:\Users\BESOO\...\memory\*.md` — all 39 old memory files stamped STALE with redirect to MEMORY.md

**What works (dry-run verified):**
- `npm run animate:challenge:dry` → 1950 frames (65.0s @ 30fps) OK
- `npm run generate:videos:dry` → correctly detects missing images, skips with explanation
- AsmrReveal + StoryEpisode dry-runs clean

**What's still blocked on images:**
- `ep01-the-firefly-who-remembered-the-stars` — needs 01.png … NN.png
- `maze-butterfly-garden` — needs maze.png + solved.png
- AsmrReveal live render — needs blank.png + colored.png in any asmr/ folder

**Remaining tasks:**
- L2a: AsmrReveal live test (images only — no code)
- L4b: Audio auto-selection
- L5a: Auto-thumbnail extraction
- L5b: Preview mode flag

---
**2026-04-13 s3 — Remotion L4b + L5a + L5b: audio auto-select, thumbnail, preview mode**

Files changed: `scripts/render-video.mjs` (3 features added)

**L4b — Audio auto-selection:**
`AUDIO_MAP` lookup in render-video.mjs. If story.json/activity.json has no `musicPath`/`audioPath`, auto-picks:
- coloring/maze → `assets/audio/crayon.mp3`
- story → `assets/audio/Twinkle - The Grey Room _ Density & Time.mp3`
Both `storyJsonToProps` and `activityJsonToProps` made async to support the `resolveAudio()` await.

**L5a — Auto-thumbnail:**
After every full render, calls `renderStill` at frame 90 (3s) → `*-thumb.jpg` alongside the mp4.
Skipped in `--preview` mode. Failure is non-fatal (warns, continues).

**L5b — Preview mode:**
`--preview` flag caps duration at 90 frames (3s) and sets `scale: 0.5` on renderMedia → 540×960 output.
Output filename gets `-preview` suffix. Available as `npm run animate:preview -- --comp X`.

All dry-runs pass: ActivityChallenge (65s), HookIntro preview (3s @ 540×960), AsmrReveal (34.5s).

**All Remotion layers now complete.** Next: drop images into output/stories/ and output/asmr/ and run `npm run generate:videos` for first live renders.

---
**2026-04-13 s3 addendum — Push complete, conflicts resolved**

Remote had updated config/ files from Monday intelligence run (GitHub Actions). Resolved by accepting remote versions for all 6 config JSON files (intelligence data — not code). Local code changes pushed clean. Commit: a284e5a.

Stash dropped. Working tree clean except: CLAUDE.md (unstaged), config/ (unstaged intelligence data), scripts/track-output.mjs (unstaged), config/performance-weights.json (untracked), output/queue/x-text-2026-04-13.json (untracked).

Next: test AsmrReveal live render. Drop blank.png + colored.png into output/asmr/ folder, run npm run generate:videos.

---
**2026-04-13 s4 — AsmrReveal: 6 improvements + audio loop + lean publicDir**

**What shipped:**

1. **Hand + pencil cursor** — `MazeHandCursor.jsx` (new Remotion component). SVG hand ported from FFmpeg pipeline. Follows actual maze solution path via precomputed waypoints.
2. **Path extraction** — `scripts/extract-maze-path.mjs` (new). Diffs blank vs solved pixel-by-pixel, extracts Y centroid per X column, smooths, samples 200 waypoints → `path.json`. Added `npm run extract:path`.
3. **Progress bar** — height 7px → 14px.
4. **No side-crop** — `objectFit: cover` → `contain` in WipeReveal.jsx. Both images now fully visible.
5. **joymaze.com removed** — BrandWatermark dropped from AsmrReveal. Link in bio only.
6. **Hook text persistent** — removed `<Sequence durationInFrames={hookFrames}>` cap; text stays full video.
7. **Audio loops** — added `loop` prop to `<Audio>` — no more silence mid-video.
8. **Lean publicDir** — render-video.mjs now pre-copies only `assets/` + `output/asmr/` + `output/stories/` (~14MB) to `.remotion-public/` before bundling. Bundle time: 1.5s (was 66s). Fixes ENOSPC from `node_modules`/archive being bundled.

**Files changed:** `remotion/compositions/AsmrReveal.jsx`, `remotion/components/WipeReveal.jsx`, `remotion/components/HookText.jsx`, `scripts/render-video.mjs`, `package.json`, `.gitignore`, `.remotionignore`

**Files created:** `remotion/components/MazeHandCursor.jsx`, `scripts/extract-maze-path.mjs`, `.remotion-public/` (gitignored)

**Live render confirmed:** `output/videos/AsmrReveal-1776077723900.mp4` (34.5s, thumbnail extracted)

**Workflow for new maze ASMR slugs:**
```bash
npm run extract:path -- output/asmr/[slug]/activity.json
npm run animate:asmr -- --asmr output/asmr/[slug]/activity.json
```

---
**2026-04-13 s4 addendum — auto-cleanup of Remotion temp bundles**

Added post-render cleanup to `render-video.mjs`: after every successful render, scans `%TEMP%` for `remotion-webpack-bundle-*` dirs and deletes all except the current one. Prevents disk exhaustion across sessions (each bundle was ~14MB lean but stale ones accumulate). Cleanup line printed to console on each invocation that removes bundles. Non-fatal — wrapped in try/catch.

Also confirmed: `ProtocolError: Target closed` at ~93% is non-fatal (Chrome closes tab after work is done); render completes to 100% and output is valid.

---

## 2026-04-14 — [Agent: Claude] — Animation engine expansion: Countdown Challenge + Word Search ASMR + Remotion story migration

**Files changed:** `scripts/generate-challenge-brief.mjs` (new), `scripts/extract-wordsearch-path.mjs` (new), `remotion/components/WordSearchReveal.jsx` (new), `remotion/compositions/AsmrReveal.jsx`, `remotion/compositions/StoryEpisode.jsx`, `scripts/render-video.mjs`, `scripts/generate-asmr-brief.mjs`, `scripts/track-output.mjs`, `package.json`, memory files

- **Strategy:** Competitor analysis + trend data identified 3 high-impact engine upgrades. Earth Day (Apr 21) + "Can your kid?" challenge hook formula + word search as underserved content gap.

- **Countdown Challenge format (Task 1):** `ActivityChallenge.jsx` composition was already built + `animate:challenge` already existed. Added: `generate-challenge-brief.mjs` — Groq brief generator for challenge videos (maze/word-search/dot-to-dot puzzles, single image, hook = "Can your kid solve this?", CTA = time drop comment bait). Added `--challenge` flag + `challengeJsonToProps()` to `render-video.mjs`. Auto-sets `ActivityChallenge` comp when `--challenge` passed without `--comp`. `output/challenge/` folder added to Remotion publicDir copy. `brief:challenge` + `brief:challenge:dry` npm scripts. Challenge folder type rotation: maze/word-search/dot-to-dot/maze/word-search by day.

- **Word Search Highlight Reveal ASMR (Task 2):** New 3rd ASMR type. `extract-wordsearch-path.mjs` — diff blank/solved → dilate (radius 3) to merge word pixels → BFS connected components → bounding box per word → filter noise (MIN_PIXELS=25, MAX_PIXELS_PCT=8%) → normalize → sort top-to-bottom → sample highlight color → save `wordsearch.json`. `WordSearchReveal.jsx` — SVG rect per word, horizontal wipe expand (14 frames/word), glow filter, cross-fade to solved at 92%. AR-corrected coordinate mapping added to `render-video.mjs` (same letterboxing logic as maze path). `AsmrReveal.jsx` now branches: wordsearch → WordSearchReveal, maze → MazeSolverReveal, coloring → WipeReveal. ASMR type rotation updated: coloring/maze/coloring/wordsearch/maze. `extract:wordsearch` npm script. Brief generator updated: wordsearch `blankDesc`/`coloredDesc`/CRITICAL RULES. Brief markdown now conditionally shows `extract:path` or `extract:wordsearch` step. `brief:asmr*` family of npm shortcuts added.

- **Remotion story migration (Task 3):** `storyJsonToProps` now passes `typewriterCaptions: true` (default on), `peakSlideIndex` (defaults to 2nd-to-last slide — resolution beat). `StoryEpisode.jsx` updated: imports `FloatingParticles`, `peakSlideIndex` prop added, FloatingParticles fires at the peak slide (35% into the scene, 2.5s duration). The `--remotion` flag was already wired to call `renderWithRemotion()` which calls `render-video.mjs --comp StoryEpisode`. Now each story rendered via `--remotion` gets: word-by-word typewriter captions, sparkle particles on the emotional high point.

- **Daily workflow integration (Task 4):** `generate-challenge-brief.mjs --save` added to `daily` npm script (additive — challenge brief now generates daily alongside ASMR brief). `track-output.mjs`: `challengeVideos` counter added (videos/*.mp4 matching 'challenge' keyword), report table updated with Challenge column, archive counter excludes '-challenge-' pattern. Phase 0 gate unchanged (challenge is bonus metric).

- **Earth Day push:** To be done as content (no code needed) — use `brief:asmr:coloring` with Garden/Flowers/Bugs themes, April 19-21.

---

## 2026-04-14 — [Agent: Claude] — Seamless loop + hook fix for ASMR engine

**Files changed:** `remotion/compositions/AsmrReveal.jsx`, `scripts/render-video.mjs`

- **Seamless loop (new):** Added `loopDurationSec: 2.0` phase to AsmrReveal. After hold ends, blank image fades in (opacity 0→1) over 2s on top of the completed reveal. Last frame = blank = first frame → near-seamless platform loop. Duration updated in both AsmrReveal schema and render-video.mjs `computeDuration` + `activityJsonToProps`. Per-activity override available via `loopDurationSec` in activity.json. Audio already fades at `durationInFrames - 1s`, now falls inside loop phase — dies as image returns to blank.

- **Hook pause fix (pre-existing bug):** Maze + word search were already starting at frame 0. Coloring (WipeReveal) was incorrectly pausing on a static blank screen for 3s before the wipe began — `drawStart` was `revealStart` (hookFrames) instead of 0. Fixed: `drawStart = 0` unconditionally for all types. Hook is a persistent text+audio overlay, not a timed pause. `revealStart` is now dead code — will clean at dot-to-dot.

- **hookDurationSec: 3 retained** — now acts as a slow-start buffer (coloring wipe draws over 29s instead of 26s), better for ASMR pacing. Can be set to 0 in schema if tighter reveal preferred.

- **Earth Day briefs:** 3 coloring ASMR folders created manually: `coloring-garden-flowers` (Apr 19), `coloring-bugs-insects` (Apr 20), `coloring-forest-animals` (Apr 21). Each has `activity.json` + `brief.md` with full Gemini prompts.

**Next:** Dot-to-dot progressive reveal (new ASMR type). Clean up `revealStart` dead code during that pass.

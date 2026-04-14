# Chat Log — Joymaze-Content

> Append-only. Date, topics discussed, decisions, pending items. No raw code.

---

### 2026-04-14 — Intelligence pipeline full-connect + perf-weights fix + X topic engine

- **Daily audit:** X post 4 (identity/reply) was a non-sequitur — fixed to quiet-morning parenting hook. Prompt 9 was Easter-themed post-Easter — replaced with spring nature.
- **Post-Easter fix (systemic):** `getEasterDate(year)` function added to generate-prompts.mjs. `seasonalNote` switches modes after Easter. New `post-easter` penalty rule in pre-check layer. Self-maintaining across all future years.
- **X post topic pool:** `x-post-topics-dynamic.json` created with 10 seeds (insight/identity/story types). Fully wired: intelligence-refresh generates → apply-intelligence manages decay/eviction → generate-x-posts injects least-used seeds per type. 7-day dedup on content; pool prevents angle repeats across weeks.
- **Competitor intel gap closed:** Captions and X posts were not receiving competitor intelligence. Both now load competitor-intelligence.json and inject winning hook patterns, scroll-stopper formulas, caption patterns.
- **perf-weights schema bug:** `buildPerfNotes()` in generate-x-posts.mjs was reading `weights: {}` (wrong) — weekly-scorecard actually writes `categories: []`. Fixed. Was silently returning empty string.
- **Full intelligence coverage achieved:** All 5 content-generating scripts now consume trends + perf-weights + competitor-intel + hooks-library + theme-pool. Assembler scripts (story-video, asmr-video) correctly remain dumb.
- **Memory locked:** Puzzle X posts — fun/value + kids connection is the bar; activity-topic relevancy is NOT required. Argued twice, saved to memory.

---

### 2026-04-13 — Maze ASMR path-drawing engine complete

- **Core change:** Replaced LTR wipe with true path-drawing animation for maze ASMR. Kids complained wipe revealed path "all at once at corners." Now a pencil draws the actual solution line from start to finish.
- **extract-maze-path.mjs rebuilt:** Zhang-Suen skeleton thinning + BFS walk. Handles vertical segments, U-turns, junctions. Auto-detects path color from highest-diff pixels in solved image. Outputs 400 waypoints + pathColor to path.json.
- **MazeSolverReveal.jsx (new component):** SVG polyline grows waypoint-by-waypoint, pencil rides the tip, cross-fades to solved image at end. Starts at frame 0 (no dead hook wait).
- **Hand cursor removed** — too hard to get right in SVG. Pencil-only cursor looks clean and professional.
- **Video now 30s** (was 34.5s): revealDurationSec=26 + holdDurationSec=1.
- **Progress bar:** Black outline frame, centred (48px margins), just below hook text.
- **Coloring ASMR:** Unchanged — still uses TTB wipe (works perfectly for coloring).

### 2026-04-11 — X suspension recovery + platform reset + daily brief

- **X suspended** for spam (bulk posting + Blue Premium on new account day 1). No appeal — repurposed clean 3-year-old fit-clinic account → `@playjoymaze`. New Developer app, all API keys rotated.
- **ToS research:** Automation via official APIs is explicitly allowed everywhere. Violation was behavioral. Pipeline architecture is sound — just enforce warmup + rate limits on new accounts.
- **Pinterest:** New account (joymaze.pp@gmail.com), Business/WY. Instagram auto-sync disabled — native posting only.
- **Task Scheduler:** All local posting tasks disabled. `JoyMaze Daily` (generation) kept. GitHub Actions is sole posting owner.
- **`npm run brief`:** New daily HTML brief built. Reads today's queue JSONs, renders copy-paste cards per post per platform. Feeds manual warmup posting.
- **Warmup protocol:** 2 weeks manual posting on all new accounts before automation resumes.
- **Pending next session:** Facebook Page + Meta Developer App → TikTok account + API → Pinterest OAuth refresh for new account → full credential update in .env + GitHub Secrets

---

### 2026-04-12 — Content audit + engine fixes + full Remotion engine

- **Morning audit:** 10 prompts + X posts scored. P6-P9 missing visual style directives → added (watercolor, Pixar 3D, storybook, ink-wash). P10 Autumn Leaves in April → replaced with Spring Garden. X puzzle = stale coin riddle → replaced with original crayon riddle.
- **Engine fixes:** (1) wrong-season penalty for autumn-in-spring in preCheckViolations; (2) named art style required in activity prompts + quality gate penalty; (3) BANNED STALE RIDDLES blocklist in X post system prompt.
- **Warmup hold hardened:** posting-cooldown.json extended to 2026-04-26 + `if: false` in x-posts.yml. X keys confirmed live in GitHub Secrets.
- **Remotion engine fully built:** StoryEpisode (tested), AsmrReveal (dry-run), HookIntro (tested), 6 components. render-video.mjs as single CLI. 3 npm script pairs.
- **AnimatedFactCard:** "Did You Know?" carousel — facts slide in from right, dot indicators, accent underline. Tested live: 12.5s, 13.6s render.
- **Story Remotion path:** `--remotion` flag on generate-story-video.mjs bypasses FFmpeg frame pipeline, calls Remotion StoryEpisode. storyJsonToProps accepts slide.image (schema fix).
- **Pending:** daily output log (Phase 0 gate dep), series naming, live AsmrReveal render (needs images from Ahmed), wire animate:asmr into ASMR pipeline

---

### 2026-04-09 — GitHub Actions cloud posting pipeline + X profile recovery

- **Topics:** X shadowban diagnosis, X Professional account setup, GitHub Actions pipeline, Cloudinary integration, UTC scheduling fix, cooldown architecture
- **X status:** Soft shadowban (temporary label, April 2). Search bans clear per shadowban.eu. Cooldown until April 12. Actions: converted to Professional account, added bio/category, mobile interaction advised daily.
- **GitHub repo:** drmetwally/joymaze-content (public) pushed. 17 secrets configured via `gh secret set`. Baseline commit + Actions pipeline commit.
- **Cloudinary:** dm9eqz4ex live. `scripts/upload-cloud.mjs` built (no npm dep). All 5 generation scripts upload on completion → `cloudUrls`/`cloudUrl` in queue JSON.
- **post-content.mjs:** `resolveMedia()` added — downloads from Cloudinary when local file missing (GitHub Actions environment).
- **3 workflows live:** `x-posts.yml` (hourly), `post-media.yml` (2:00 UTC / 4AM Cairo), `weekly.yml` (Monday 5:00 UTC)
- **UTC scheduling fix:** `scheduledHour` was local Cairo time = broke in GitHub Actions. Fixed to UTC in both generate-x-posts.mjs and post-x-scheduled.mjs.
- **X post times:** Research-based UTC hours [13,17,21,23] = 8AM/12PM/4PM/6PM EST for North American parents.
- **Race condition fixed:** Deleted local "JoyMaze X Posts" Task Scheduler job — GitHub Actions is sole X text post owner.
- **Cooldown fix:** `output/posting-cooldown.json` now tracked in git (gitignore restructured to `output/*`). Must push after setting for Actions to respect it.
- **New daily rule:** `git push` after `generate:captions` replaces `npm run post` as end-of-day action.
- **Cheatsheet:** Fully rewritten for cloud architecture — architecture table, file location table, Step 8 push, cooldown protocol, GitHub Actions manual trigger guide.

---

### 2026-04-09 — output/raw/ folder restructure + strategic cooldown plan
- **Topics:** Pruning old raw folders, confirming new slot structure, X shadowban recovery strategy
- **Folder changes:** Deleted `pattern/`, `story/`, `story-marketing/`. Created `fact-card/`, `challenge/`, `quiet/`, `printable/`, `identity/`. Kept `coloring/`, `dottodot/`, `sudoku/` — all confirmed JoyMaze core activities
- **import-raw.mjs:** Already had all mappings in place — no code change needed
- **Strategic decisions:** No X Premium yet (wait until post-cooldown with engaged audience). Full silence on X for 72h. Use cooldown for content backlog generation and other platform posting.
- **Cheatsheet:** Fully rewritten to reflect hourly drip architecture, new slot structure, anti-spam rules

---

### 2026-04-08 — X text post pipeline wired + writing brain fix
- **Topics:** Blocked Codex task clarification, generate-x-posts.mjs writing style injection, scheduler integration
- **Clarification:** `generate-x-posts.mjs` is independent of image captions — wrong anchor in Codex spec. Added directly to scheduler as its own unconditional step.
- **Writing fix:** `writing-style.md` moved from user message prefix → proper `system` message in Groq call. Halbert rules now govern the model as a persona constraint, not ambient context.
- **Scheduler:** Step added after ASMR brief. npm scripts: `x:generate`, `x:generate:dry`, `x:text:post`, `x:text:post:dry`. `npm run daily` chain updated.
- **Architecture note:** `post-x-scheduled.mjs` stays out of the daily scheduler — Windows Task Scheduler runs it hourly to drip posts across the day.

---

### 2026-04-07 — Self-learning intelligence system
- **Topics:** Archive bug, theme repetition (Music Instruments showing daily), story variety expansion, self-learning system design + build
- **Archive fix:** `.md` filter added, early `return` on empty queue removed — all sweeps now always run
- **Theme fix:** THEME_POOL moved to JS code (61 entries); theme selection code-enforced, not advisory; lookback extended to 7 days + archive scanning
- **Story variety:** 50-entry STORY_SETTINGS pool, ART_STYLES 14→28, PATTERN_INTERRUPT_POOL 22→36
- **Intelligence system:** Full self-learning pipeline built — weekly Monday cycle: 6 competitor web searches (Gemini search grounding) → Gemini 2.5 Flash synthesis → dual-pass brand safety → entropy check → dynamic pool files updated with aging + eviction
- **API key:** `GOOGLE_AI_API_KEY` suspended — all Gemini calls migrated to `VERTEX_API_KEY` as primary (tested working)
- **Verified:** `intelligence-refresh.mjs --dry-run` passes end-to-end: 5 themes, 7 hooks, 3 CTAs, 4 interrupts, entropy 2.0/10
- **Pending:** First real Monday run to confirm live synthesis writes to pool files correctly

---

### 2026-04-05 — ASMR pipeline fixes + archive sweep + pencil animation
- **Topics:** ASMR video bugs, archive gaps, Pinterest/X for video, pencil overlay
- **ASMR fixes:** linear reveal (no easing gap), FFmpeg -t instead of -shortest (no early cutoff), removed outro, 1.5s hold
- **Archive:** archive-queue.mjs now handles output/asmr/, output/stories/, output/videos/ — all auto-archived on npm run daily
- **Pencil animation:** path Y pre-analysis + SVG pencil composited at wipe edge per frame — tracks solution path height
- **Decision:** Keep left-to-right wipe for maze (not crossfade) — Ahmed confirmed the corner-reveal "flare" is a feature, not a bug
- **Pinterest/X:** ASMR videos now queue for all 5 platforms; postToPinterest extended to handle video_url uploads

---

### 2026-04-05 — Monday pipeline first run confirmed
- Tomorrow (2026-04-06) is the first Monday since trend + scorecard pipelines were wired in
- Ahmed confirmed timing — `npm run daily` will execute full Monday sequence for the first time

---

### 2026-04-05 — Weekly Scorecard: performance-weights.json feedback loop
- **Topic:** Step 3 — close the analytics → generation feedback loop with a weekly scorecard
- **Decision:** Scorecard runs Monday-only inside `npm run daily` alongside trends refresh — both are weekly signals
- **Architecture:** scorecard reads same analytics metadata as analytics-report.mjs, but outputs machine-readable weights file instead of human-readable report
- **Feedback loop:** analytics:collect → scorecard:save (writes weights) → generate:prompts (reads weights via loadPerformanceContext()) → better prompts → better posts → better analytics
- **Status:** Live. Requires Pinterest Standard API access to populate; graceful empty-state until data exists.

---

### 2026-04-05 — Quality Gate: prompt scoring pass
- **Topic:** Step 2 of trend/quality pipeline — post-generation scoring before save
- **Decision:** Use `llama-3.1-8b-instant` (cheap/fast) as the scorer — separate from 70b generation model
- **Rubric:** Story prompts scored on 7 criteria (sensory anchor, peak engagement, abandoned alternative, expression, art style, dimensions, caption hook). Activity prompts on 4 criteria.
- **Thresholds:** ≥7 pass, 5-6 flag (saved with review tag), <5 rejected (marked in file, re-run to fix)
- **Output:** Console table after every run + score badges in saved file + summary in file header
- **Status:** Live in generate-prompts.mjs. No new file — integrated into existing script.

---

### 2026-04-04 — Archetype 7 + Pattern Interrupt rotation fix
- **Topic:** Gemini producing identical images on consecutive days for Arch 7 (subtle-marketing) and Pattern Interrupt (myth-bust) slots
- **Root cause 1:** Arch 7 slot had zero scene variation — only 3 couch-scene examples in archetypes doc, no pool
- **Root cause 2:** Pattern Interrupt hardcoded `myth-bust` sub-type + no topic pool → LLM defaulted to "screen time myth + brain lightbulb"
- **Root cause 3:** `loadRecentThemes()` dedup didn't track Arch 7 settings or PI topics (both reported "None")
- **Fix:** 20-scene Arch 7 pool + 22-topic Pattern Interrupt pool (6 sub-types), day-of-year deterministic cycling, rich slot descriptions sent to LLM, dedup extended
- **Status:** Fixed. Session ended without log entries — quota exhausted.

---

### 2026-04-04 — Archive sweep bug fix
- **Topic:** Raw images in subfolders (`output/raw/story/`, `output/raw/activity/`, etc.) not being archived by daily scheduler
- **Root cause:** `archive-queue.mjs` sweep used flat `fs.readdir(RAW_DIR)` — only found files at root level, skipped subdirectory contents
- **Fix:** One-level deep scan using `withFileTypes: true`; subdirectory images collected into flat `archive/{date}/raw/` as before
- **Status:** Fixed, minimal diff

---

### 2026-03-31 — Story video: sync, intro/outro, speed, dimension fix
- **Topics:** VO sync broken (scenes fixed, audio variable); intro/outro visual feel; pacing control; landscape images cropping on all platforms
- **Decisions:**
  - Sync: audio drives timing in both directions. Scene = max(3s, spoken + 0.5s). Story.json durations are now just minimums, not hard targets.
  - Intro/outro: black screen is more cinematic and matches short-form video conventions (TikTok/Reels). Gradient bookends felt like an app promo, not a story.
  - Speed default: 0.9 (slightly slower than natural, feels like a read-aloud). User can override with `--speed`.
  - Dimensions: universal `smartResize()` applied everywhere. Gemini outputs landscape → platform exports get blur letterbox.
  - OpenAI key confirmed live and valid.
- **Completed:** sync fix, intro/outro rewrite, speed flag, dimension fix, filename dedup, cheatsheet updated
- **Status:** Story video pipeline is now production-ready. Ep01 images needed from Ahmed to do first public story post.

### 2026-03-30 — ASMR pipeline + story TTS comparison setup
- **Topics:** Groq usage cost concern (Ahmed reviewed $1 charge over 2 days); ASMR video format addition; 3-day prompt diversity; activity pool expansion; CTA routing fix; story video TTS voiceover
- **Decisions:**
  - Groq cost: $1/2 days is likely from bulk caption regen tests, not daily ops. Keep watching for 1 month.
  - ASMR videos: AI progression sequences (empty → partial → done), no VO, calm music, slow motion — proven format from competitor analysis
  - Prompt dedup: 3-day rolling block on recently used themes/scenes/art styles (not permanent)
  - Story vs activity prompts: separate dedup pools (story scenes vs activity themes vs art styles)
  - Raw file naming: keyword-based (maze-ocean.png, story-coloring.png), NOT emotion (story-emotion.png is too vague)
  - Activity pool: 8 types, pick 5/day. CTA routing: app activities → both; book-only → books
  - Voiceover: Add BOTH OpenAI TTS (nova, $0.01/story) and Edge TTS (JennyNeural, free) — compare then decide
  - Music ducked to 12% when narration is present (down from 30% music-only)
- **Completed:** Full session workstreams above + TTS comparison infrastructure ready
- **Pending:** Ahmed generates 7 images for Ep01 → `npm run generate:story:openai -- --story ep01-...` and `generate:story:edge` → compare and decide
- **Next:** TTS test comparison → pick provider → first story video with audio

### 2026-03-29 — Queue archive + Story video + Analytics feedback loop
- **Topics:** Daily flow explanation (why duplicate captions happened); queue lifecycle management; Archetype 8 story video pipeline; analytics collection → reporting → prompt optimization feedback loop
- **Decisions:**
  - New daily flow: `npm run daily` (archive old queue + generate fresh prompts) → manual images → import → captions → post
  - Story videos: dedicated script separate from slideshow generator; story.json + numbered images convention; no AI voiceover (text overlays instead, $0)
  - Analytics: Pinterest-first (only active platform), extensible adapter pattern for future platforms; performance data auto-injected into Groq prompts once enough data exists (3+ items minimum)
- **Completed:**
  - archive-queue.mjs + `npm run archive` / `npm run daily`
  - generate-story-video.mjs: Ken Burns, crossfades, narration overlays, Joyo bookends, music mixing. Tested end-to-end (52s MP4)
  - collect-analytics.mjs + analytics-report.mjs + generate-prompts.mjs feedback loop
  - Fixed Sunday rotation bug in generate-prompts.mjs
- **Blocker:** Pinterest Standard access still in review (submitted 2026-03-28). Analytics collection blocked until approved.
- **Next:** Wait for Standard access → first public pins → first analytics collection → first story video with real content

### 2026-03-29 (session 2) — Activity/Puzzle Posts Strategy Shift
- **Topics:** Competitor analysis showed puzzle/activity posts (mazes, word search, matching) vastly outperform story posts on Pinterest. Ahmed's insight: people want to interact, not just scroll. Planned a 5+5 split.
- **Decisions:**
  - 10 daily posts = 5 story (3 pure + 1 Arch 7 + 1 pattern interrupt) + 5 activity (actual puzzles)
  - Activity posts = REAL puzzles (not lifestyle photos) — maze images, word search grids, matching games, tracing sheets, visual quizzes
  - Branded JoyMaze watermark on all activity images + soft brand mention in caption
  - Difficulty rotation: Easy (Mon/Thu), Medium (Tue/Fri), Hard (Wed/Sat)
  - Removed: 2nd Archetype 7 slot and marketing anchor slot — replaced by 5 activity slots
- **Completed:** Full pipeline update across 10 files — archetypes, writing guide, calendar, prompts, import, captions (5 new templates), hashtags
- **Next:** Generate first batch of activity images in Gemini, test full pipeline end-to-end

### 2026-03-29 (session 3) — Slideshow Video Pump + Multi-Platform Posting
- **Topics:** Video pipeline assessment, slideshow script upgrade, X/Instagram posting activation
- **Decisions:**
  - generate-videos.mjs promoted from basic slideshow to production video pump (Ken Burns, crossfades, music, activity overlays)
  - Instagram posting switched to temp URL upload (same pattern as Pinterest) — no longer requires _publicImageUrl hack
  - X/Twitter is the first expansion platform (code ready, free tier = 500 posts/mo)
- **Completed:**
  - Rewrote generate-videos.mjs: Ken Burns + crossfades + fade in/out + music + activity categories + --category/--music flags
  - Fixed Instagram postToInstagram() to use uploadTempImage() instead of metadata._publicImageUrl
  - Verified X posting code works (twitter-api-v2 connects, proper 401 on invalid keys)
  - Added npm scripts: generate:video, post:x, post:instagram, post:pinterest
  - Tested end-to-end: 3 slides → 420 frames → 14s MP4 (1080x1920 H.264)
- **Blocker:** X API keys in .env are expired/invalid — Ahmed needs to regenerate from developer.x.com
- **Next:** Ahmed regenerates X API keys → first live X post; set up Instagram Business account + Meta developer app; generate first batch of activity content

### 2026-03-29 (session 4) — First Production Run + Video Posting
- **Topics:** X developer setup walkthrough, first production run, video posting automation, daily cheatsheet
- **Decisions:**
  - $5 X API credits purchased (~500 tweets, lasts 50 days at 10/day)
  - Art style in prompts: always specify explicitly, vary across prompts (user feedback)
  - File naming convention: use keywords for auto-category detection (maze-ocean.png, story-coloring.png)
- **Completed:**
  - X developer account created, app configured (Read+Write), OAuth 1.0a keys obtained
  - First test tweet posted successfully
  - First production run: 10 images (5 story + 5 activity) generated → imported → captioned → posted to X
  - Video posting added to post-content.mjs (X chunked MP4 + Instagram Reels)
  - First video posted to X: 14s slideshow (3 slides, Ken Burns + crossfades)
  - Created docs/DAILY_CHEATSHEET.md — step-by-step daily production workflow
  - Added --force-full flag to generate-prompts.mjs
- **Cost:** $0.11 total ($0.01 test tweet + $0.10 for 10 posts)
- **Next:** Name files with keywords for auto-detection; set up Instagram Business account; add background music to assets/audio/

---

### 2026-03-28 — First live Pinterest posts + prompt generator + Pinterest setup
- **Topics:** Pinterest Business account setup; privacy policy; OAuth token flow; image prompt generator; first live posts
- **Decisions:**
  - Groq confirmed as permanent primary caption engine (Google Cloud suspension ongoing)
  - Pinterest sandbox has base64 upload bug — use image_url via temp hosting as workaround
  - generate-prompts.mjs created: feeds full style guide + archetypes into Groq for image gen prompts
- **Completed:**
  - Pinterest Business account created (Publisher/media, Education)
  - Privacy policy live at joymaze.com/privacy (Puzz Publishing LLC)
  - Pinterest dev app (1556985) + OAuth write token obtained
  - 7 Gemini images → branded → captioned → 6/7 posted to Pinterest sandbox
  - Full end-to-end pipeline proven: prompts → images → branding → captions → API posting
- **Blocker:** Trial access = pins visible only to Ahmed. Need Standard access (demo video) for public pins.
- **Next:** Record demo video for Standard upgrade; then first public posts

---

### 2026-03-28 — Pipeline test + caption fixes + geo strategy
- **Topics:** End-to-end pipeline test; caption quality root cause (fallback defaults); Groq rate limiting; geo-targeting signals for social platforms; VPN question
- **Decisions:**
  - No VPN for API posting — account ban risk outweighs geo benefit
  - Content signals (English captions, US parent hashtags) are the primary geo lever — already handled by pipeline
  - Set target market explicitly in Pinterest + Instagram Business account settings before first post
  - Use US virtual number (Google Voice/TextNow) for any new social account creations
- **Fixes shipped:** --force flag, Groq 429 retry-with-backoff (65s, 2 retries), 2.5s call pacing, Ollama short-prompt fix
- **Caption quality:** Verified — Groq produces proper Hypnotic Writing copy. All 8 queue items regenerated.
- **Next:** Ahmed sets Pinterest API token → first live post

---

### 2026-03-27 — Story-First Content Strategy
- **Topics:** Content strategy for engagement and conversion; story as the primary pillar; Hormozi CTA placement philosophy; Archetype 8 (Kids Story Video) — pure entertainment for reach
- **Decisions:**
  - 80/20 rule: 6 pure story posts/day (no CTA) + 2 subtle marketing + 1 myth-bust + 1 direct marketing anchor
  - All CTAs moved out of post body: live in first comment (Arch 7 + marketing) and profile bio only
  - Kids Story Video (Arch 8): Joyo bookends, pure animal/creature stories, zero product mention, Joyo's Story Corner series mechanic
  - Daily target: 10 image posts + 1 video (if ready)
  - 8 story archetypes defined with 3-beat structure (Scene Drop → Emotional Tension → The Shift)
- **Files changed:** docs/CONTENT_ARCHETYPES.md (new), config/writing-style.md (+~60 lines), scripts/content-calendar.mjs (DAILY_MIX refactored)
- **Next:** Generate first batch of real images using the archetypes as briefs; first live Pinterest post

---

### 2026-03-21 — Project kickoff
- **Topics:** Full project scaffold, content automation architecture, image/caption pipeline design
- **Decisions:** sharp for compositing (ADR-001), ESM modules (ADR-002), JSON queue metadata (ADR-003)
- **Completed:** Steps 1-3 (scaffold + image pipeline + caption pipeline). All dry-run tests pass.
- **Pending:** Step 4 (platform API setup + posting), Step 5 (video pipeline), Step 6 (n8n), Step 7 (calendar/optimization)

---

### 2026-03-21 — Full implementation (Steps 4-7)
- **Topics:** Platform posting APIs, video generation, n8n workflows, content calendar
- **Completed:**
  - Step 4: post-content.mjs with Pinterest + Instagram posting (X needs twitter-api-v2 package)
  - Step 5: generate-videos.mjs with slideshow frame assembly (needs FFmpeg for final encode)
  - Step 6: 3 n8n workflow JSONs (daily generator, scheduled poster, analytics collector)
  - Step 7: content-calendar.mjs with queue status, weekly plans, daily plans, stats
- **All 7 implementation steps complete.**
- **To go live:** (1) Add API keys to .env, (2) Install FFmpeg for video encoding, (3) Install n8n and import workflows, (4) Optionally install twitter-api-v2 for X posting

---

### 2026-03-21 — Dependency installation session
- **Topics:** Installing all software dependencies, enabling X posting, FFmpeg video encoding
- **Installed:**
  - twitter-api-v2 (npm) — X posting now fully functional
  - FFmpeg 8.1 — binaries at D:/Dev/ffmpeg/, video generation tested and working (15s MP4 produced)
  - n8n 2.8.4 — globally installed, ready to start with `n8n start`
- **Remaining (user manual steps):**
  - Add D:\Dev\ffmpeg to Windows system PATH (so scripts find ffmpeg automatically)
  - Add API keys to .env for all platforms (see docs/PLATFORM_SETUP_GUIDE.md)
  - Start n8n (`n8n start`) and import workflows from n8n/workflows/

---

### 2026-03-22 — Strategy: manual gen + free automation
- **Topics:** API key billing (separate from Pro subs), cost analysis, workflow design
- **Key insight:** API keys are pay-per-use on top of subscription. No way to use Pro sub quota via API.
- **Decision:** Manual image generation via chat UIs + Gemini free API for captions. $0 extra cost.
- **Workflow:** Ahmed generates images in ChatGPT/Gemini → drops in output/raw/ → scripts brand, caption, and post automatically
- **Scale path:** Manual → Gemini API image gen once pipeline and content quality are proven
- **Next session tasks:**
  1. Build `import-raw.mjs` (brand compositing for manual images)
  2. Switch `generate-captions.mjs` to Gemini free tier
  3. End-to-end test with real content
  4. First live post to Pinterest

---

### 2026-03-25 — Claude skills expansion + pipeline sprint tasks
- **Topics:** Claude skills architecture, business workflow design, import-raw pipeline, Gemini caption switch
- **Created 15 new agent skills** covering all JoyMaze business areas:
  - Content: content-repurposer, content-calendar-manager
  - KDP: kdp-book-planner, kdp-listing-optimizer, kdp-interior-designer
  - App: app-aso-optimizer, app-review-responder
  - Strategy: strategy-market-researcher, strategy-competitor-analyst, strategy-report-generator
  - Outreach: outreach-email-marketer, outreach-influencer, outreach-ad-copywriter
  - Brand: brand-voice-guardian, brand-customer-support
- **Created docs/DAILY_WORKFLOW.md** — full daily/weekly/monthly workflow using the 1-to-5 efficiency rule (3 originals → 13+ posts)
- **Built import-raw.mjs** — manual image import with branding pipeline (sidecar metadata, category auto-detect)
- **Switched captions to Gemini free API** — $0 cost, Claude as fallback
- **Attempted Amazon author page fetch** — blocked by bot protection, skipped for now
- **Pending:** Ahmed manual setup (GOOGLE_AI_API_KEY, FFmpeg PATH, Pinterest API key), then end-to-end test

---

### 2026-03-27 — Real Halbert book extracted, placeholder replaced
- **Topics:** Extracting actual Halbert book content; user created docx versions of scanned PDFs
- **What happened:** Previous session used knowledge-based placeholder for Halbert. User created docx. Full content extracted via Python zipfile + XML parsing.
- **Book:** "The Halbert Copywriting Method Part III" by Bond Halbert (Gary's son). About editing copy for sales — the complete greased slide formula.
- **Key material added:**
  - The Greased Slide concept: every sentence must make the reader fall into the next
  - 4 editing stages: Eye Relief → Clarity → Keep Reading → Punch Up
  - So What? test: proved 4x sales lift in split test — cut everything a busy selfish reader would skip
  - Words people secretly hate: teach/learn/work/earn → show/discover/get — table with JoyMaze translations
  - 15-point editing checklist: That hunt, pronoun hunt, big word hunt, qualifier hunt, adverb hunt, I→You formula, punch-at-end rule, cliffhanger techniques
  - Read-aloud rule: if it doesn't flow spoken, it won't flow read
- **Style guide now at 670 lines** — all real extracted material: Vitale (18 modules) + Halbert (real book) + 50 hooks
- **Next:** Generate a real content piece to test output quality improvement

---

### 2026-03-27 — Gary Halbert method + 50 hooks added to style guide
- **Topics:** Extracting Gary Halbert and 50 hooks PDF content, translating into JoyMaze style guide
- **PDF extraction:** Installed PyMuPDF — finally solved the PDF reading problem
- **50 Hooks (One Peak Creative):** TikTok/Reels hook cheat sheet fully extracted. 19 hook categories translated to parent-audience JoyMaze copy with 2 ready examples each
- **Gary Halbert:** PDF is a 125-page scan with zero text. Principles incorporated from The Boron Letters + his newsletter — 12 core principles, all translated with JoyMaze parent examples
- **Sales Letters (Booher):** B2B letter templates, limited relevance. Extracted 3-part intro structure
- **Key Halbert principles added:** Hungry Crowd theory, A-pile/B-pile, "So What?" test, Slippery Slide, Specificity = Credibility, the "Because" principle, Desire Before Belief, P.S. as second hook
- **Style guide now covers:** Joe Vitale (Modules 1-18) + Gary Halbert method + 50 native social hooks = 561 lines, one injected file
- **Next:** Generate real content and review output quality improvement

---

### 2026-03-27 — Full 18-module Hypnotic Writing synthesis into style guide
- **Topics:** Deep study of all 18 Hypnotic Writing modules, expanding the master style guide
- **Source material studied:**
  - All docx modules from D:\Books and Publishing\Hypnotic writing GPT\ (Modules 1–18)
  - Gary Halbert PDF was scanned image — unreadable; principles incorporated from knowledge
  - 50 Hooks PDF also scanned — same limitation
- **What was extracted and added to config/writing-style.md:**
  - 8 hook patterns with JoyMaze-specific example lines
  - 3 buying motivators (Relief, Transformation, Inspiration) mapped to parent psychology
  - Full sensory template library (VAK + emotional)
  - 4 persuasion templates: desire amplification, identity mirror, risk removal, future self
  - Micro-story structure with JoyMaze scene examples
  - Hypnotic sentence rhythm + transitions + contradiction/mystery/story openings
  - Expanded CTA rewrite library (weak → hypnotic transformations)
  - Viral engineering section: 5 hook types + 5 memory anchors
  - Objection handling for 4 common parent objections
  - 8 hypnotic editing laws + fog word removal list
- **Style guide:** 120 lines → 383 lines; still a single injected context file
- **Impact:** All future AI caption calls automatically use the full persuasion system
- **Next:** Run generate-captions.mjs with real content to see new output quality

---

### 2026-03-27 — Hypnotic Writing framework: full pipeline implementation
- **Topics:** Applying Joe Vitale Hypnotic Writing to image prompts, video frames, content calendar, and agent skills
- **Completed:**
  - generate-images.mjs: all prompts now emotionally evocative (sensory scenes, identity-first); rotating hypnotic text overlay libraries per category
  - generate-videos.mjs: intro "Screen time that feels like a gift." | outro "When you're ready, JoyMaze is waiting." | per-category slide overlay pools
  - content-calendar.mjs: every DAILY_MIX category now has `hypnoticAngle` and `hook`; daily plan output surfaces both for every content piece
  - All 4 agent skills rewritten with hypnotic formulas (committed alongside scripts)
- **Framework status:** COMPLETE. Every generated output — captions, image overlays, video frames, content plans — now runs through the Hypnotic Writing system
- **Style entry point:** config/writing-style.md is injected as system context into every AI caption call; all other hypnotic elements are baked directly into prompts and templates
- **Next:** First live post — generate images manually, import + caption via Groq, push to Pinterest

---

### 2026-03-27 — API activation, Gemini suspension, Groq + Ollama fallback chain
- **Topics:** Gemini API key setup, Google account suspension, multi-provider fallback strategy, disk space management, Ollama local AI
- **Gemini API:** Key set and briefly confirmed working (listModels + generateContent both succeeded), then suspended after billing was enabled — Google fraud detection false positive
- **Appeal:** 500-char formal appeal drafted and submitted to Google Cloud Trust & Safety
- **Fallback strategy:** Groq (cloud, free, llama-3.3-70b) + Ollama (local, free, llama3.2:3b) added to caption pipeline
- **Caption chain now:** Gemini → Groq → Ollama → default (zero dependency on paid APIs)
- **Groq:** Live, 14,400 req/day free, tested successfully — full 5-platform caption generation confirmed
- **Ollama:** Installed, llama3.2:3b downloaded (2GB to D:\Ollama\models), local inference tested and working
- **Disk cleanup:** Recovered 3.73 GB on C: drive — npm cache (4.72GB) cleared, npm cache permanently moved to D:\npm-cache, OLLAMA_MODELS set to D:\Ollama\models
- **Device specs confirmed:** i7-9750H, GTX 1650 (4GB VRAM), 24GB RAM — compatible with 3B models on GPU, 7B with CPU offload
- **End-to-end test:** import-raw → Groq captions → all 5 platforms — full SUCCESS
- **Pending:** Google suspension appeal resolution, Pinterest API key setup, first live post

---

### 2026-03-25 — Setup test + account strategy
- **Topics:** End-to-end pipeline test, API key validation, Google account strategy
- **Tested full pipeline** with synthetic image:
  - import-raw.mjs: 1 image → 4 platform-sized branded files + queue metadata (works)
  - generate-captions.mjs: Gemini + Claude both fail (invalid keys), falls back to defaults gracefully (works)
- **Key finding:** Both GOOGLE_AI_API_KEY and ANTHROPIC_API_KEY in .env are invalid/placeholder values
- **Decision:** Anthropic API key is NOT needed — removed from requirements (ADR-004 confirmed: Gemini-only for captions)
- **Decision:** Create a dedicated JoyMaze Google account for all business services before getting Gemini API key
- **Recommended account ownership:**
  - JoyMaze Google account: YouTube, Google Play, Gemini API, Google Ads, social media business profiles
  - Personal Amazon account: KDP (publishing business)
- **Blocker:** Ahmed needs to create JoyMaze Google account → get Gemini API key → update .env → re-test
- **Next session:** Re-run end-to-end test with valid Gemini key, first live post to Pinterest

### 2026-03-31 (session 2) — Audio fix, story upgrades, ASMR plan
- **Topics:** Shaky VO root cause; story idea generator quality; ASMR video production options; import-raw category detection bug
- **Decisions:**
  - Audio chain: all intermediates → WAV (pcm_s16le). Only 1 lossy encode (final AAC mux). MP3 at any intermediate stage is banned.
  - ASMR strategy: progressive reveal (coloring page fills in over time, maze path draws itself) is the best bang for effort — $0, uses existing sharp pipeline, distinctive content. Build next session.
  - Story image prompts: generator now enforces camera framing + time-of-day progression + character design field. Bad/good example baked into system prompt from ep02 audit.
  - import-raw category detection: keyword splitting was too loose. Explicit keyword map now required — "dot-to-dot" only matches full string, not any file containing "dot".
  - --voice flag added: voice will vary per episode for character differentiation (nova=default, fable=British, shimmer=bright, echo/onyx=male)
- **Completed:** lossless audio chain, ep01 re-render, 11 posts to X, detectCategory fix, story generator upgrade, ep02 scaffolded, ASMR plan documented
- **Next session:** Build ASMR progressive reveal — coloring page color-fill animation + maze path-draw animation, synced to ASMR audio events from Freesound.org packs

### 2026-04-01 — Pipeline automation, TikTok/YouTube, ASMR brief, prompt fixes

- **Topics:** TikTok + YouTube posting, daily workflow streamlining, ASMR brief automation, video vertical-first strategy, story TTS voice cycling, prompt dimension rules, maze golden standard, dot-to-dot Gemini enhancement
- **Decisions:**
  - All videos 9:16 vertical until 2min+ long-form YouTube content (no shared constants file — premature abstraction)
  - `npm run publish` = captions + post. Single command after all creative work (images and videos)
  - ASMR brief generated daily by scheduler (Groq + style guide + analytics) — creates folder + brief.md + activity.json
  - Story brief runs daily by default (was opt-in with --with-story)
  - TTS speed 0.75 permanent default. Voice cycles per episode number automatically.
  - Activity prompt dimension fix: root cause was examples B+C not demonstrating the field — model ignores format templates when examples contradict them
  - Maze prompts: fill-in-the-blank template added with hard warning. Narrative style explicitly banned.
  - Dot-to-dot from scratch unreliable in Gemini — use enhancement prompt on existing puzzle assets instead
- **Completed:** All of the above. First automated daily run verified. First image posts published.
- **Pending:**
  - Instagram: finish Facebook Page + Meta Developer App setup → INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID
  - TikTok: developers.tiktok.com OAuth → TIKTOK_ACCESS_TOKEN
  - YouTube: Google Cloud → YouTube Data API v3 OAuth → 3 env vars
  - ASMR test run: drop blank.png + colored.png → npm run generate:asmr -- --asmr [folder] → npm run publish
  - ASMR audio: crayon.mp3 + pencil.mp3 from Freesound.org → assets/audio/asmr/
  - Pinterest Standard API: waiting for approval (submitted 2026-03-28)
  - ep02 "The Little Luminous Leafwing": 10 images needed at 9:16

### 2026-04-02 -- Competitive intelligence deep dive
- **Topics:** Top kids activity brands analysis, Pinterest/Instagram format benchmarks, content gap identification, Pinterest 2026 algorithm and parenting trends
- **Decisions:**
  - Idea Pins are the single biggest gap -- 9x save rate vs standard pins. Must adopt immediately once Standard API is approved (or post manually).
  - All activity pin titles/descriptions must add: "screen-free," "printable," developmental skill keywords (fine motor, problem-solving, spatial reasoning, focus).
  - Seasonal content calendar needed -- pin holiday content 6 weeks ahead. Start with spring/Easter NOW.
  - Instagram strategy should prioritize carousels (0.55% engagement) for educational/tip content, not just single images.
  - Lead magnet freebie (5-page PDF activity pack) should be created to build email list via Pinterest traffic.
- **Completed:** Full competitive intelligence report with 8 brands analyzed, 8 content gaps identified, 15 prioritized action items
- **Output:** docs/COMPETITIVE_INTELLIGENCE.md
- **Pending:**
  - Implement "screen-free" + skill keyword language in pin templates/descriptions
  - Create seasonal content calendar document
  - Design first Instagram carousel (educational: "5 Skills Mazes Build")
  - Create free activity pack PDF for lead magnet
  - Start posting Idea Pins (manual or API)

### 2026-04-02 — Vertex AI, marketing-driven prompt overhaul, competitor analysis
- **Topics:** Vertex AI 90-day trial setup, Imagen 4.0 testing, child safety filters, prompt quality for AI generation, competitor analysis, content strategy gaps, printable badge
- **Decisions:**
  - Vertex AI Express key works (project hip-voyager-408609). Imagen 4.0 for story posts, ~$0.04/image, $300 credit lasts ~2 years at current volume.
  - Activity posts stay manual — AI generators can't produce correct puzzles. Algorithmic puzzle generation rejected as over-engineering for content pipeline.
  - Story prompts rewritten for Imagen: hands/POV/environment, never children. ~60% success rate (stacked child indicators still trip safety).
  - Competitor analysis identified 5 key gaps: screen-free positioning, developmental skill framing, SAVE CTAs, seasonal content, hook diversity.
  - All 5 gaps implemented in prompt system + hashtags + printable badge.
- **Files changed:** generate-prompts.mjs (system prompt overhaul), generate-images-vertex.mjs (new), import-raw.mjs (printable badge), hashtags.json (4 new pools), package.json (generate:vertex script), .env (VERTEX_API_KEY)
- **Pending:**
  - Instagram Business account setup (code ready, needs credentials)
  - Pinterest Standard API (in review since 2026-03-28)
  - Educational tip / "Did You Know?" post type (new content category, not yet built)
  - Idea Pins (needs Standard API)
  - Instagram carousel support

### 2026-04-02 (session 2) — Hook overlays, video CTA, folder-based import
- **Topics:** Halbert-style text hooks on images, video intro hooks, video CTA outro, dot-to-dot gold standard prompt, category misdetection bug, folder-based import system
- **Decisions:**
  - Image hooks: bottom-center dark bar, story=curiosity hooks (20), activity=challenge hooks (18), pattern-interrupt=6 hooks. Auto-added at import. Override via sidecar or --no-hooks.
  - Video intro: replaced black title card with first-image + hook text (2.5s) → title card (2s). Scroll-stopper for TikTok/Reels.
  - Video outro: replaced "The End" with emotional echo on last image (2.5s) → CTA card with logo + "Free on iOS & Android" (3.5s). Total 6s.
  - Dot-to-dot EXAMPLE D added to generate-prompts.mjs as gold standard (matching maze template structure).
  - Folder-based import replaces fragile filename detection. Drop into output/raw/story/, output/raw/maze/, etc. Name files anything.
- **Files changed:** import-raw.mjs (hooks + folder detection + category fix), generate-story-video.mjs (intro hooks + CTA outro), generate-prompts.mjs (dot-to-dot template), generate-story-ideas.mjs (hook/outroEcho fields), DAILY_CHEATSHEET.md
- **Pending:**
  - Instagram Business account setup
  - Pinterest Standard API (in review)
  - Educational tip / "Did You Know?" post type
  - Idea Pins, carousels (needs Standard API / carousel support)
  - ASMR progressive reveal video (coloring fill + maze draw)

### 2026-04-03 — Vertex parser fix, raw subfolders, dot-to-dot prompt enforcement
- **Topics:** Empty raw subfolders question; Vertex `--story-count 2` failing with "No prompts found"; dot-to-dot prompt ignoring enforced template; bottom 10% whitespace for story prompts
- **Decisions:**
  - Raw subfolders: Ahmed creates them manually (now pre-created). Folder-based categorization is primary method, keyword filenames are fallback.
  - Vertex parser: regex mismatch — prompts file uses `### N.` heading format, parser expected `N. **[`. Fixed to handle both.
  - Bottom 10% whitespace: NOT added to story prompts — story images are atmospheric/lifestyle scenes where whitespace looks awkward. Pipeline overlays watermark on top of image. Activity posts keep it because they're printable puzzles.
  - Dot-to-dot enforcement: added explicit MANDATORY reminder in user prompt section referencing Example D template, since LLM was ignoring the system prompt's `⚠️ NO EXCEPTIONS` directive.
- **Completed:** All 3 fixes applied
- **Pending:** Same as previous session

---

### 2026-04-04 (session 2) — Full caption template rewrite: Vitale + Halbert enforcement
- **Topics:** Caption quality audit; all 14 templates rewritten to enforce Hypnotic Writing + Halbert standards
- **Decisions:**
  - Every template must include: style guide injection reference, STRONG/WEAK examples, explicit HALBERT FINAL PASS block (4 rules)
  - ASMR captions use Vitale sensory transport (not ASMR content description) + insight line + identity save prompt
  - Activity captions get 2-formula options: Challenge (dare/specific claim) or Micro-Story (sensory/mirror) — LLM picks based on topic
  - TikTok templates: POV format banned across both ASMR and activity; replaced with 3 hypnotic patterns each
  - Fog word ban now explicit across all 14 templates: beautiful, wonderful, amazing, great, really, very, perfect, incredible
- **Files changed:** all 14 templates in `templates/captions/`
- **Completed:** All templates done. Caption quality gap from session audit is now closed at the template level.
- **Pending:** Week 1 caption audit (after first 7 days of posting); monthly analytics audit once Pinterest is live

---

### 2026-04-05 — Prompt generation structure fix

**Topics:** Sunday prompt generation bug, within-day uniqueness, 5+5 post structure
**Root cause:** Sunday had a freeform LLM path (no slots) → 10 story / 0 activity, hallucinated archetypes, duplicate settings, repeated ages
**Decisions:**
- Sunday must always generate 5 story + 5 activity (same as every other day)
- Story slots pre-assign: archetype, beat, art style, child age/gender — nothing left to LLM discretion
- Child profiles (age/gender) now pre-assigned per slot on ALL days, rotating daily
- Setting uniqueness enforced via MANDATORY rule in user prompt
- Sunday freeform branch removed; Sunday uses same structured slot path as weekdays
**Files changed:** `scripts/generate-prompts.mjs`
**Pending:** Regenerate today's prompts (`npm run generate:prompts`), review, then generate images

---

### 2026-04-05 — Prompt format fix + marketing deep dive

**Topics:** Prompt output format, AI Marketing Skills repo (Single Brain), trend pipeline vision
**Format fix:** Slot descriptions restructured to labeled instruction blocks — LLM was echoing slot text as headers, missing dimensions
**Marketing analysis:** Discussed full trend-signal pipeline vision (trends → ideas → prompts → images → captions → posts). Single Brain repo evaluated — concepts useful (Trend Scout, Quality Gate, Weekly Scorecard), but B2B implementations wrong for our use case. Build purpose-built versions natively.
**Decisions:** Phase 1 = perfect existing pipeline; trend injection + quality gate are next logical additions before any expansion

---

### 2026-04-05 — Trend pipeline + Monday automation

**Topics:** collect-trends.mjs build, Google Trends integration, seasonal calendar, daily automation
**Built:** Full trend signal pipeline — Google Trends + seasonal calendar → trends-this-week.json → injected into generate-prompts.mjs user prompt
**Decision:** Refresh trends every Monday via --monday-only flag in npm run daily. Force refresh anytime with npm run trends.
**Next:** Quality Gate (Step 2) — score generated prompts 0-10 before saving, reject below threshold

---

### 2026-04-06
- Fixed prompt archiving: `archive-queue.mjs` now sweeps `output/prompts/`
- Fixed ASMR hand/pencil: replaced bare SVG pencil with hand+pencil SVG (palm, fingers, thumb, skin gradient) + organic motion jitter (3-wave noise for Y and angle — different every run)
- Fixed story image prompts: audited ep01, rewrote all 7 slides with character consistency, lighting progression, named scene elements. Updated `generate-story-ideas.mjs` system prompt with character repetition rule, removed bottom-10% instruction, max_tokens 2500→5000
- Fixed prompt scorer: added coloring/dot-to-dot correctness rules (−5 instant fail), added auto-regen loop for rejected prompts (up to 2 rounds), added explicit warning when scorer doesn't fire
- Story generator overhauled: 7→8 slides, 3-act→8-beat viral arc, hook-first + share-trigger rules, trends + performance weights injected
- ASMR brief hardened: trends injected, blank image rules explicit with anti-patterns
- Phase 2 plan locked in memory: story analytics tracking → story-performance-weights.json, trigger at 8+ published episodes

- Fixed Pinterest video posting: replaced nonexistent `video_url` source type with proper 3-step Pinterest media upload flow (register → S3 upload → poll → pin with video_id)

- Fixed 3 pipeline issues: Pinterest video cover image (FFmpeg thumbnail → cover_image_url), X thread format (reply tweet auto-generated + posted via in_reply_to_tweet_id), story video pacing (removed CTA outro → 1.5s fade-to-black, MAX_SCENE_DURATION=4.5s cap, template updated to 9 short scenes)
- [Claude] Story video outro revised: fade-to-black → zero outro, clean loop-friendly cut on last frame
- [Claude] AGENTS.md expanded: full multi-agent communication protocol (read/write conventions, handoff signals, protection rules)
- [Claude] X text post scheduler: Codex specs written for generate-x-posts.mjs + post-x-scheduled.mjs + daily-scheduler patch (7-10 text posts/day, hourly Windows Task Scheduler)
- [Codex] X text post scheduler build — added x-thread templates, generate-x-posts.mjs, post-x-scheduled.mjs; daily-scheduler patch blocked pending caption-step clarification
- [Codex] Coordination docs sync — TASKS/AGENTS updated, full docs pass completed, CODEX.md refreshed with live startup order and current project context

- [Claude 2026-04-08] YouTube OAuth + 4am auto-post scheduler: YouTube refresh token obtained and written to .env. Added 4am Cairo posting cron to daily-scheduler.mjs (hits 6-11pm Pacific peak). Windows Task Scheduler task "JoyMaze 4am Post" created with StartWhenAvailable — fires on login if PC was off. Scheduler now has 2 jobs: 4am post + 9am generate.

- [Claude 2026-04-08] Maze gold standard update: added Example E (Ancient Egypt Hard) to generate-prompts.mjs gold standard pool. Corner decoration instruction identified as the structural upgrade; folded into master maze template. All future maze prompts will include corner decorations.

- [Claude 2026-04-09] Activity puzzle video pipeline: built generate-activity-video.mjs — converts maze/matching/quiz/tracing/dot-to-dot images into 15s YouTube Shorts with persistent hook text overlay, no CTA. Dry run confirmed 4 eligible items. npm run generate:activity:video.

- [Claude 2026-04-09] Pinterest second demo prep: built get-pinterest-token.mjs (full OAuth flow + live pin creation for demo recording). Saved step-by-step recording guide to docs/PINTEREST_DEMO_GUIDE.md. First submission rejected for missing OAuth flow and integration proof.

- [Claude 2026-04-09] Story narration fix: enforced 15-word max per slide in generate-story-ideas.mjs. First story had 7–10s TTS per slide (target: 3–4s) — root cause was no word count ceiling. 15 words × 8 slides ≈ 23–30s total audio. Testing for a few days.

- [Claude 2026-04-09] Daily cheatsheet updated: 4am auto-post scheduler documented, STEP 4B added for activity videos, YouTube marked live in Step 8, 6 new troubleshooting rows.

- [Claude 2026-04-10] Pipeline status command: built scripts/status.mjs + npm run status. Shows UTC time, cooldown state, today's X text queue with per-post status (posted/pending/due/failed), tweet IDs, and past-day failures. Confirmed: 4 queued X text posts for today, all pending due to active cooldown until 2026-04-12.

- [Claude 2026-04-10] Status command expanded: scripts/status.mjs now covers full pipeline — generation state (prompts/images/stories/ASMR/videos), recent archive with per-platform post counts, X text queue. Revealed: Pinterest had 12 failures on 04-08, Instagram 0 posts across all days (token issue). Single npm run status = full pipeline health check.

- [Claude 2026-04-10] X post generator full rewrite (generate-x-posts.mjs): fixed 7 root causes — style guide was context-flooding model (796 lines dumped raw), user prompt hardcoded bad CTAs, puzzle type generated image-hunt posts. Rewrite: extractStyleSections() for focused system prompt, rule-based post scorer (5 dimensions), retry logic, dedup against 7 days, themes/CTAs/perf-weights all injected. Dry-run confirmed: all 4 posts pass, puzzle is self-contained riddle, no banned phrases.

- [Claude 2026-04-10] Carousel pipeline complete: import-raw.mjs now calls buildCarousels() at end of main() to write carousel-*.json queue files; post-content.mjs has full carousel routing — postCarouselToInstagram (3-step Graph API: item containers → carousel container → publish), postCarouselToTikTok (PULL_FROM_URL photo_images array), postCarousel orchestrator, and carousel routing in main() before the captions guard. Also fixed POSTERS imageKey instagram_square → instagram_portrait. Carousel triggered via sidecar JSON with carouselGroup + slideIndex fields.

- [Claude 2026-04-10] Zero-friction carousel automation: generate-prompts.mjs now plans carousel batches every 3rd content day — derives group name from dominant theme+date, appends folder drop instructions to prompts .md, writes carousel-plan JSON. import-raw.mjs auto-detects carousel-* subfolders, sorts files alphabetically for slide order, no sidecar JSONs ever needed. Ahmed's only action on carousel day: create the folder the prompt file specifies and name images 01-xx.png etc.

- [Claude 2026-04-10] Carousel gap identified: only Activity Collection format (Format 1) was implemented. Educational Facts carousel (one stat/fact per slide, e.g. "5 brain benefits of mazes") and Age Progression carousel (same activity at Easy/Medium/Hard by age) are NOT built. Logged in unimplemented_upgrades memory.

- [Claude 2026-04-11] Carousel Formats 2 & 3 built: generate-prompts.mjs now rotates 3 carousel formats on a 9-day doy cycle (0=Activity Collection, 3=Facts, 6=Progression). Facts format: 5 slides (hook + 4 brain-benefit facts), 5-activity pool rotating by doy, folder prefix facts-carousel-*. Progression format: 3 slides (01-blank/02-half/03-done), same Gemini chat for visual consistency, folder prefix progress-carousel-*. import-raw.mjs extended to detect all 3 prefixes. Memory + cheatsheet + TASKS updated.

- [Claude 2026-04-11] Carousel intelligence self-learning: added loadActivityRanking() (analytics-ranked activity selection for Formats 2+3), dynamic fact injection from pattern-interrupt-dynamic.json (replaces last 1-2 hardcoded facts when keyword match found), hooks-library top hook informs Format 2 title slide style, boost_themes from trends-this-week.json bias Format 3 activity selection. Added scoreCarouselSlides() Groq scorer (llama-3.1-8b-instant) with PASS/WEAK/FLAG gate table. intelligenceSignal field logged + saved in plan JSON.

- [Claude 2026-04-11] System hardening session (continued): 7 subagent changes verified via npm run daily. Fabricated stat strip confirmed working (saved file clean). Pre-check catches wrong-season → Prompt 10 flagged at 6.5. Built scripts/health-check.mjs (npm run health-check) — 5 sections, 41 ok · 3 expected warnings. X cooldown, Pinterest sandbox, Phase 2 analytics all correctly detected as known gaps. intelligence:competitor propagation live (3 hooks + 3 themes + 1 interrupt added to dynamic pools on today's run).

- [Claude 2026-04-11] Account migration logged (retroactive): @playjoymaze (repurposed fit-clinic, API keys updated in .env). New accounts created for Pinterest/Instagram/TikTok under joymaze.pp@gmail.com — NO new API keys yet for those platforms. GitHub Secrets not yet updated for X. x-posts.yml should stay disabled during warmup. Memory files corrected: project_warmup_pipeline.md + project_pipeline_status.md now have full platform status table. feedback_log_account_changes.md added to prevent future context-compression loss of credential changes.

- [Claude 2026-04-12 s2] Daily output tracker: built scripts/track-output.mjs — counts images/story/ASMR per day, appends to output/daily-output-log.json with Phase 0 gate status and 30-day streak. Wired into npm run daily.

- [Claude 2026-04-12 s2] Series naming live: SERIES_NAMES constant in generate-prompts.mjs injects "Maze Monday" (Mon) / "Puzzle Power Wednesday" (Wed) / "Fine Motor Friday" (Fri) as seriesTag into LLM prompt. Non-destructive — empty string on off days. Builds series anticipation in caption hooks.

- [Claude 2026-04-12 s2] AsmrReveal Remotion wiring: --remotion flag on generate-asmr-video.mjs now bypasses FFmpeg frame pipeline entirely → calls renderWithRemotion() → builds AsmrReveal props from activity.json → delegates to render-video.mjs. Handles coloring (blank.png+colored.png) and maze (maze.png+solved.png) file naming correctly. npm run animate:asmr:remotion -- --asmr [folder].

- [Claude 2026-04-12 s2] Memory + cheatsheet + feedback loop all updated. Intelligence loop diagram added to DAILY_CHEATSHEET.md. project_remotion_engine.md and project_daily_output_tracking.md created in memory. FREE Printable badge decision documented: overlay on activity content is wrong — correct approach is corner badge in brand frame margin only (deferred).

- [Claude 2026-04-12 s3] Caption CTA overhaul: removed "screen-free printable at joymaze.com" mandate and pipe ( | ) separators from ALL caption templates and scoring rubric in generate-prompts.mjs. Story captions now standalone emotional hooks; activity captions end with "Save this for later." Scoring now penalizes URL (−2/−3) and pipe (−2) instead of rewarding them. Memory updated: project_caption_cta_strategy.md reflects full philosophy reversal.

- [Claude 2026-04-12 s4] Weekly intelligence engine ran: 4 themes + 7 hooks added, Garden/Flowers + Snack Time boosted. Final prompts: 10/10 pass, avg 8.9/10. Best caption: "Can your kid solve this flower maze before the petals fall?" — seasonal intelligence working.

- [Claude 2026-04-13 s1] Universal MEMORY.md created at project root — consolidates all 30+ scattered memory files into one canonical source for all agents. Phase 0 gate updated: images≥10 + ASMR≥1 + story≥1 + X text≥4 (was images/stories/ASMR all ≥10). track-output.mjs now counts X text queue entries. CLAUDE.md startup updated to read local MEMORY.md first.
2026-04-13 s2 — Remotion L2–4: ActivityChallenge comp, TypewriterCaption, AsmrReveal progress bar, batch renderer (render-batch.mjs), hook prepend (prepend-hook.mjs). 39 stale memory files redirected to MEMORY.md.
2026-04-13 s3 — render-video.mjs: --preview flag (3s @ 0.5×), auto-thumbnail (renderStill → *-thumb.jpg), audio auto-selection (AUDIO_MAP). All 9 Remotion tasks done.
2026-04-13 s3 addendum — pushed a284e5a. Config conflicts resolved (accepted remote intelligence data). /clear incoming, next: AsmrReveal live test.

- [Claude 2026-04-13 s4] AsmrReveal 6-improvement pass: hand+pencil cursor (MazeHandCursor.jsx, follows actual solution path via path.json), progress bar 7→14px, objectFit contain (no side-crop), removed joymaze.com watermark, hook text persistent full-video, audio loops. Plus extract-maze-path.mjs script + npm run extract:path. publicDir lean copy (~14MB) cuts bundle from 66s→1.5s, fixes ENOSPC. Live render confirmed 34.5s. Cheatsheet + memory updated.

- [Claude 2026-04-13 s4 addendum] Post-render Remotion bundle auto-cleanup: render-video.mjs now purges all stale remotion-webpack-bundle-* dirs from %TEMP% after each render. Prevents ENOSPC recurrence. ProtocolError at 93% confirmed non-fatal.

---

## 2026-04-14 — Animation engine expansion

**Session:** Animation engine expansion — Countdown Challenge, Word Search ASMR, Remotion story migration.

**Work done:**
1. **Countdown Challenge**: `generate-challenge-brief.mjs` + `--challenge` loader in `render-video.mjs`. `ActivityChallenge.jsx` was already built. `brief:challenge` npm script. "Can your kid solve this?" viral mechanic. maze/word-search/dot-to-dot rotation.
2. **Word Search Reveal ASMR**: `extract-wordsearch-path.mjs` (diff → dilate → BFS components → bounding boxes → normalize) + `WordSearchReveal.jsx` (SVG rects, horizontal wipe per word, glow) + wired into `AsmrReveal.jsx` as `revealType='wordsearch'`. `extract:wordsearch` script. Brief generator updated with wordsearch prompts + instructions.
3. **Remotion story migration**: `StoryEpisode.jsx` now has `FloatingParticles` on `peakSlideIndex` (defaults to 2nd-to-last slide). `storyJsonToProps` passes `typewriterCaptions: true` + `peakSlideIndex`. `--remotion` flag was already wired end-to-end.
4. **Daily workflow**: `brief:challenge` added to `daily` npm script. `track-output.mjs` tracks `challengeVideos` as bonus metric.
5. **Memory**: `project_animation_engine_expansion.md` created + MEMORY.md indexed.

**Next:** Earth Day content push (April 19-21) using `brief:asmr:coloring` with Garden/Flowers/Bugs themes. No code needed.

---

**2026-04-14 — Session N+1 — Seamless loop + ASMR hook fix**

1. Earth Day ASMR briefs created (zero code): `coloring-garden-flowers`, `coloring-bugs-insects`, `coloring-forest-animals` for Apr 19-21.
2. Engine improvement discussion: hook overlay already existed; screen-free badge rejected (video IS screen time); confirmed dot-to-dot, loop, sudoku as next targets.
3. **Seamless loop built:** `loopDurationSec: 2.0` phase in AsmrReveal — blank fades back in at end, last frame ≈ first frame. Duration wired in render-video.mjs.
4. **Hook pause bug fixed:** Coloring was sitting on blank screen for 3s before wipe. Unified all types to `drawStart = 0`. `revealStart` dead code flagged for cleanup at dot-to-dot.

**Next:** Dot-to-dot progressive reveal (new ASMR type + extraction script).

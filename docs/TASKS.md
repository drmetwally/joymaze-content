# JoyMaze — Persistent Task Board
Last updated: 2026-04-27

> This file is the single source of truth for in-progress and queued work.
> Claude reads this at session start and updates status as tasks complete.
> Statuses: [ ] = queued | [~] = in progress | [x] = done | [!] = blocked

---

## STRATEGY DECISION (locked 2026-04-04)

**Organic Pipeline Priority:**
Focus all development effort on hitting 10 images + 10 story videos + 10 ASMR videos/day
using the EXISTING pipeline before adding any new video generation technology.
No new pipelines until this threshold is hit consistently for 30 days.

**Growth Phases:**
- Phase 0 (now → 6 weeks): Stable daily output, all 5 platforms live
- Phase 1 (6 weeks → 4 months): Pinterest saves growth, TikTok traction
- Phase 2 (4-8 months): Double down on top performers
- Phase 3 (8+ months): Revenue-funded expansion (Seedance, paid ads, KDP series)

**KPI Gates:**
- Phase 0 → 1: 30 consecutive days hitting **10 images + 4 X posts + 1 ASMR + 1 story video + 1 activity challenge reel/day** (updated 2026-04-27 — reel added after ActivityChallenge pipeline polished)
- Phase 1 → 2: Pinterest 75K+ impressions/mo AND installs ≥100/mo or KDP ≥20 units/mo
- Phase 2 → 3: Installs ≥1,000/mo OR KDP ≥150 units/mo for 2 consecutive months

**North Star Metric:** Pinterest monthly saves (leading indicator for all downstream conversion)

---

## ACCOUNT RESET — X SUSPENSION (2026-04-11)

X account permanently suspended for spam. Decision: do NOT appeal. Start fresh.

- [x] **Create new X account** — @playjoymaze (repurposed fit-clinic). API keys live. Manual warmup until 2026-04-26.
- [x] **Apply for X Developer access** — done. Keys in .env + GitHub Secrets.
- [~] **2-week manual warmup** — in progress. Cooldown until 2026-04-26. Post via `npm run brief`.
- [x] **Create new Pinterest account** — joymaze.pp@gmail.com. Manual posting only. No API yet.
- [x] **Disable `x-posts.yml` GitHub Actions workflow** — `if: false` set + pushed.
- [x] **Create Instagram account** — joymaze.pp@gmail.com. Manual posting only. No API yet.
- [ ] **Update GitHub Secrets** — replace X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET with new account credentials after developer access approved
- [ ] **Build warmup pipeline** — read-only display layer over `output/queue/`; shows caption + hook + CTA + image URL per post, copy-paste ready; includes warmup timer flag (same pattern as posting-cooldown.json); activates automation when timer expires

> **ToS note (confirmed):** Automation via official APIs is explicitly allowed on all platforms. Our pipeline is within ToS. The violation was behavioral (bulk + spam patterns). Do not let this incident make us over-correct away from automation — just enforce warmup period + rate limits on new accounts.

---

## NEXT SESSION — FIRST THING (2026-04-12+)

- [x] **Carousel Format 2 — Educational Facts carousel** — DONE (2026-04-11). `facts-carousel-*` folder prefix auto-detected by import-raw.mjs. generate-prompts.mjs triggers on doy%9===3 (next: 2026-04-12). 5 slides: hook + 4 facts. 5 activity pools (mazes, coloring, word-search, dot-to-dot, sudoku) rotate by doy.

- [x] **Carousel Format 3 — Activity Progression carousel** — DONE (2026-04-11). `progress-carousel-*` folder prefix auto-detected by import-raw.mjs. generate-prompts.mjs triggers on doy%9===6 (next: 2026-04-15). 3 slides: 01-blank.png → 02-half.png → 03-done.png. Ahmed generates all 3 in same Gemini chat for visual consistency.

---

## NEXT SESSION — START HERE (2026-04-24)

- [x] **Puzzle Challenge Reel video testing** — animated solve-reveal end-to-end tested 2026-04-28. Created `activity.json` for maze test folder; dry-run confirmed blank.png + solved.png + 400-waypoint path.json all auto-resolved; full render completed: `ActivityChallenge-1777406858199.mp4` (1500 frames, 50.0s @ 30fps). Animated maze solve fully working.
- [ ] **Tune Puzzle Challenge Reel based on render review** — likely focus areas: title size/weight, countdown prominence, transition cue feel, audio balance, and per-type pacing.
- [ ] **True word-search solve validation** — run once a sample exists with real `solved.png` and `wordsearch.json` so the solve phase can be fully tested, not just fallback static solve.
- [~] **Puzzle asset factory program** — active direction locked 2026-04-29. See `docs/PUZZLE_ASSET_FACTORY_PLAN_2026-04-29.md` and `docs/PUZZLE_IMAGE_POST_AUTOMATION_PLAN_2026-04-29.md`. Build order: Maze → Word Search → Matching → Find the Difference → Coloring → Tracing/Dot-to-Dot.
- [~] **TASK-OC-007 — Deterministic Maze Asset Factory** — Phase 1 started 2026-04-29. `scripts/generate-maze-assets.mjs` now generates first-party rectangular maze assets (`maze.json`, `path.json`, `blank.svg`, `solved.svg`, `blank.png`, `solved.png`, `activity.json`) and a fresh generated folder already dry-loads plus preview-renders through `ActivityChallenge` with solver waypoints active. Remaining work: inspect visual quality against benchmark references, tune line/margin/difficulty feel, add npm scripts + docs closure review, then expand shape support beyond rectangular/square while keeping `shape` first-class in the contract.
- [x] **TASK-OC-008 — Puzzle image-post workflow structure** — DONE 2026-04-29. Contract mapped, manifest seam defined and live, Phase 1 integration complete. Art wrapper rebuilt with modular Sharp layers (corner decor, margin motifs, start/goal markers, title system). All 3 Claude-audit bugs fixed. Two visual gaps remain for next wrapper pass: (1) no footer CTA band — 260px dead space below puzzle, (2) finish marker clips at right edge (left=910, marker=150px wide, canvas=1000px). Theme families partial: 5 of 10 done (ocean, space, animals, colors/shapes, workshop) — missing dinosaurs, jungle/safari, fairy/princess, vehicles, food/kitchen. Sharp decision gate (A8) pending comparison pack generation (A7).
- [x] **TASK-OC-009 — Maze + Word Search image-post integration** — started 2026-04-29, finished first Phase 1 implementation on 2026-04-29. `scripts/generate-puzzle-image-post.mjs` now supports direct generation and manifest-driven generation, builds a polished wrapped `post.png`, copies it into `output/raw/{maze|wordsearch}/`, writes import sidecars, and can target all supported daily slots from `activity-manifest-YYYY-MM-DD.json`. `import-raw.mjs` preserves richer sidecar metadata (`difficulty`, `theme`, `sourceFolder`, `puzzleType`, `titleText`, `ctaText`). Validation completed through `generate-prompts --save` -> manifest-driven puzzle-post generation -> `import-raw` -> `generate-captions --dry-run` for both a maze slot and a word-search slot.

## ACTIVE SPRINT — DUAL TRACK (2026-04-30)

> Track 1: daily posting running now (npm run daily + npm run brief).
> Track 2: build sprint below. OpenClaw executes, Claude audits each task before marking done.
> Phase 0 gate target: ~3-4 weeks once all puzzle + reel lanes live.

### Sprint 1 — Reel Completion (this week)
- [x] **OC-012** — Challenge reel visual tuning: title size/weight, countdown prominence, transition cue feel, audio balance. APPROVED 2026-04-30. Ahmed must watch both renders (29.5s maze + 34.5s word-search) before first production post — motion+audio QC not verifiable in-session.
- [x] **OC-013** — Challenge reel stickers + word-search footer fix. APPROVED 2026-04-30. Maze reel START/FINISH badges geometry-anchored via maze.json fractions ✅. Word-search footer stripped from SVG, re-homed to post renderer ✅. Word-search theme emoji badge ✅. Ahmed must watch both renders before first production post.
- [x] **OC-014** — ASMR live coloring test. Clarified 2026-04-30 from user memory correction: coloring ASMR swipe-reveal was already tested successfully and the video was posted socially, so this lane is considered validated. Maze ASMR is also considered in a good state.
- [ ] **OC-014B** — ASMR generator integration: connect the new puzzle-generator + art-layer pipeline into the ASMR lane for the visually strong reveal types, especially maze and coloring. Explicitly de-prioritize word-search ASMR, which is better kept in the challenge-reel lane.
- [ ] **OC-015** — Wire Story Reel V2 + Animal Song Short to `daily-scheduler.mjs` (compositions built + audited, only scheduler trigger wiring remains).

### Sprint 2 — Puzzle Engine Expansion (next week)
- [ ] **OC-016** — Matching puzzle generator: `scripts/generate-matching-assets.mjs` (pairs, blank/solved SVG, activity.json, layout.json). Follows same contract as maze generator. Claude audit required.
- [ ] **OC-017** — Find the Difference generator: `scripts/generate-find-diff-assets.mjs` (two near-identical images, diff markers, JSON contract). Claude audit required.
- [ ] **OC-018** — Coloring page image post: extend `generate-puzzle-image-post.mjs` to support `--type coloring`, wrapping existing ASMR coloring assets through the Puppeteer renderer. Claude audit required. This should stay aligned with OC-014B so the same art-layer assumptions can feed both post and ASMR lanes.

### Sprint 3 — Remaining Puzzle Engines (week 3)
- [ ] **OC-019** — Tracing/Dot-to-Dot generator: numbered dot sequence, SVG path, activity.json contract. Claude audit required.
- [ ] **OC-020** — Crossword generator: grid-filling algorithm + Groq clue generation. Most complex — spec review with Claude before OpenClaw starts.
- [ ] **OC-021** — Theme-family detection centralization: extract shared utility from renderer + word-search generator (OC-013 tech debt). Low priority, defer until Sprint 2 complete.

---

## NEXT SESSION — REELS POLISH SPRINT (2026-04-28)

- [x] **TASK-OC-005 — Daily scheduler challenge brief parity** — add the missing challenge-brief block to `scripts/daily-scheduler.mjs` using `generate-challenge-brief.mjs`, and update `totalSteps` so scheduler behavior matches the existing `npm run daily` chain. DONE 2026-04-28.
- [~] **Story Reel V2** — REELS-001 through REELS-006 audits APPROVED 2026-04-28. `StoryReelV2.jsx` live, `reel-image-prompts.md` emitted, 5-beat slide cut validated with snail preview. Pending: wire into `daily-scheduler.mjs` (see "Daily automation follow-up" task below).
- [~] **Animal Facts Song Short** — REELS-001 + REELS-005-FOLLOWUP audits APPROVED 2026-04-28. `AnimalFactsSongShort.jsx` live, real sung-recap duration probed and persisted. Pending: wire into `daily-scheduler.mjs` (see "Daily automation follow-up" task below).
- [x] **Daily automation follow-up after reel builds pass review** — DONE 2026-04-28. Both lanes wired into `daily-scheduler.mjs`:
  - Story Reel V2: `generate-story-reel-images.mjs` → `render-video.mjs --comp StoryReelV2` fires after story idea step (WITH_STORY_REEL flag, default on)
  - Animal Song Short: `generate-animal-facts-brief.mjs --save` fires as a dedicated step (WITH_ANIMAL_BRIEF flag, default on); render is manual after Gemini images + Suno audio drops
  - totalSteps updated (8 steps non-Monday, 11 Monday); both lanes wired to full intelligence apparatus

## PHASE 0 — PIPELINE STABILIZATION

### Pipeline Improvement Plan (logged 2026-04-08) — work through in order

**Blockers — must fix to hit Phase 0 gate:**
- [x] **1. Refresh Pinterest OAuth** — `scripts/refresh-pinterest-token.mjs` built. Runs every Monday in scheduler (before intelligence refresh). npm scripts: `pinterest:refresh`, `pinterest:refresh:dry`. Writes new access + refresh tokens back to .env automatically.
- [x] **2. Set up Windows Task Scheduler for `post-x-scheduled.mjs`** — Task "JoyMaze X Posts" created, runs hourly from 07:00. Drips x-text-YYYY-MM-DD.json posts throughout the day.
- [~] **3. Configure Instagram, TikTok, YouTube credentials** — YouTube OAuth done (2026-04-08): YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN all set in .env via get-youtube-token.mjs. Instagram + TikTok credentials still pending.
- [x] **4. Build daily output log** — DONE 2026-04-12. `scripts/track-output.mjs` → `output/daily-output-log.json`. npm: `output:track`, `output:report`. Auto-runs in `npm run daily` (after archive). Shows Phase 0 gate status + 30-day streak.

**Quick wins — low effort, real impact:**
- [ ] **5. Run Level 1 caption audit** — open 5 random queue JSONs, score captions against the 5-question protocol in CAPTION AUDIT PROTOCOL section. 10 minutes, catches weak templates before they ship at scale.
- [ ] **6. Trigger first live Monday intelligence run** — built + dry-run verified. Has never run live. Dynamic pools are empty until it does.
- [x] **7. Series naming in prompt rotation** — DONE 2026-04-12. `SERIES_NAMES` constant + `seriesTag` in `getTodaysMix()` + `seriesNote` injected into `buildUserPrompt`. Mon=Maze Monday, Wed=Puzzle Power Wednesday, Fri=Fine Motor Friday. Zero API cost.
- [ ] **8. Age-specific caption variants** — same image, two captions: ages 4-5 and ages 6-8. Caption template change only. Doubles Pinterest reach per post.
- [~] **9. "Did You Know?" educational post type** — **Video version DONE 2026-04-12** (`AnimatedFactCard` Remotion composition, tested 12.5s render). Sharp static infographic version still pending — text + layout + icon, no AI image needed. High save rate.

### Pipeline Throughput

- [ ] Clarify daily video target: 10 unique story videos/day vs 10 total video posts (story + ASMR combined)
- [ ] Audit current ASMR pipeline — confirm it can run daily without manual intervention
- [ ] Confirm all 5 platforms are receiving posts (Pinterest, Instagram, X, TikTok, YouTube Shorts)
- [ ] Set up a simple daily output log (date → image count, story video count, ASMR count)

### Pipeline Bug Fixes (session 2026-04-07 #2) — DONE

- [x] Pinterest video posting: add FFmpeg cover thumbnail extraction + `cover_image_url` in pin body (`post-content.mjs`)
- [x] X thread format: `generateXThreadReply()` in `generate-captions.mjs` → stores `caption.x.thread.{ tweet1, reply1 }` → `postToX()` posts reply after main tweet
- [x] Story video outro: removed entirely — clean cut on last frame for platform loop (`OUTRO_DURATION = 0`)
- [x] Story video scene duration: `MAX_SCENE_DURATION = 4.5s` cap + warning for TTS overruns + template updated to 9 slides at 3-4s each
- [x] **Codex task:** Write `templates/captions/x-thread-story.txt` — completed. Added strict JSON story thread template with hook/payoff split for `tweet1` + `reply1`.
- [x] **Codex task:** Write `templates/captions/x-thread-puzzle.txt` — completed. Added strict JSON puzzle/activity thread template with challenge hook + hint/reveal reply.
### X Text Post Scheduler (Codex build — 2 scripts)

- [x] **Codex task — `scripts/generate-x-posts.mjs`:** Generate 7-10 standalone X text posts for the day.
  - Reads `config/writing-style.md`, `config/trends-this-week.json` (if exists), `config/hooks-library.json` (if exists)
  - Uses Groq (`llama-3.3-70b-versatile`) to generate posts — env: `GROQ_API_KEY`
  - Rotating mix of 4 types (distribute evenly across 7-10 posts):
    - `story-hook`: short cliffhanger story setup, cuts before resolution — reply = resolution
    - `puzzle`: riddle or challenge question — reply = answer/hint + "drop your answer below 👇"
    - `insight`: one surprising parenting/kids education fact — reply = practical tip or "which resonates with you?"
    - `identity`: speaks to the parent they want to be — reply = deeper story or "save this for when you need it"
  - Built shape: `{ type, tweet1, reply1, replies, scheduledHour }` — `replies[]` is canonical, `reply1` kept for backward compatibility; story threads can span multiple replies
  - Output: saves array to `output/queue/x-text-YYYY-MM-DD.json` (date = today)
  - CLI: `node scripts/generate-x-posts.mjs` — no flags needed; `--dry-run` prints without saving
  - ESM module (`.mjs`), no external deps beyond `dotenv`, `node-fetch` or built-in `fetch`

- [x] **Codex task — `scripts/post-x-scheduled.mjs`:** Post any X text posts whose `scheduledHour` has arrived.
  - Reads `output/queue/x-text-YYYY-MM-DD.json` for today's date
  - For each entry where `scheduledHour <= currentHour` and `posted !== true`:
    - Posts `tweet1` as a tweet (text only, no media) using `twitter-api-v2` (same client as `post-content.mjs`)
    - Posts `replies[]` in sequence as reply chain using `in_reply_to_tweet_id` (falls back to `reply1` if needed)
    - Marks entry `posted: true`, `postedAt: ISO timestamp`, `tweetId: id`, `replyIds: []` — writes file back incrementally for resume-safe retries
  - Dry-run flag: `--dry-run` prints what would be posted without calling API
  - ESM module, env: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`
  - **Windows Task Scheduler setup** (run once after script is built):
    ```
    schtasks /create /tn "JoyMaze X Posts" /tr "node D:\Joymaze-Content\scripts\post-x-scheduled.mjs" /sc HOURLY /st 07:00
    ```

- [x] **Codex task — add to `daily-scheduler.mjs`:** Resolved. `generate-x-posts.mjs` is independent of captions (different content type entirely — text posts, not image captions). Added as its own unconditional step after ASMR brief, before analytics/posting. `totalSteps` base updated 2→3. npm scripts added: `x:generate`, `x:generate:dry`, `x:text:post`, `x:text:post:dry`. Also added to `npm run daily` chain.

- [x] After build: test `post-x-scheduled.mjs --dry-run` — confirmed due posts are selected correctly from today's queue file
- [ ] Test Pinterest video post end-to-end — confirm cover thumbnail uploads and `cover_image_url` resolves in pin creation response
- [ ] Test X thread — confirm reply posts immediately after main tweet with correct `in_reply_to_tweet_id`
- [ ] Rebuid any existing story videos that have 7s+ scenes — re-author story.json with 1 sentence narration per slide

### Intelligence System (from session 2026-04-07)

- [x] Build `scripts/intelligence-refresh.mjs` — 6 Gemini web searches + synthesis + brand safety + entropy check → `config/content-intelligence.json`
- [x] Build `scripts/apply-intelligence.mjs` — dedup, eviction, aging pass → 4 dynamic pool files
- [x] Wire dynamic pools into `generate-prompts.mjs` (MERGED_THEME_POOL, hook examples, pattern interrupts)
- [x] Wire dynamic CTAs + hooks into `generate-captions.mjs`
- [x] Add Monday intelligence block to `daily-scheduler.mjs`
- [x] Add 7 `intelligence:*` npm scripts to `package.json`
- [x] Migrate all Gemini calls from suspended `GOOGLE_AI_API_KEY` → `VERTEX_API_KEY`
- [x] Dry-run verified end-to-end (5 themes, 7 hooks, 3 CTAs, 4 interrupts, entropy 2.0/10)
- [ ] First live Monday run — confirm `content-intelligence.json` status → `applied`, all 4 pool files populated
- [ ] After 4+ weeks: check `performance_score` updates are flowing (archive metadata → rolling average in apply-intelligence)
- [ ] After 8 weeks: review decay/eviction behavior — are low performers pruned, high performers protected?

### Trend Pipeline (from session 2026-04-05)

- [x] Build `scripts/collect-trends.mjs` — Google Trends + seasonal calendar → `config/trends-this-week.json`
- [x] Update `generate-prompts.mjs` to inject trend signals into user prompt via `loadTrendSignals()`
- [x] Add `npm run trends` + `npm run trends:dry` scripts
- [x] Quality Gate: post-generation prompt scoring (score 0-10) — llama-3.1-8b-instant, ≥7 pass / 5-6 flag / <5 reject, scores annotated in saved file
- [x] Weekly Scorecard: `scripts/weekly-scorecard.mjs` — save rate by archetype/theme → `config/performance-weights.json` (Monday-only in npm run daily)

### Content Quality (from session 2026-04-04)

- [x] Fix Archetype 7 repetition — 20-scene rotation pool added to generate-prompts.mjs
- [x] Fix Pattern Interrupt repetition — 22-topic rotation pool (6 sub-types) added
- [x] Fix Arch 1-6 art style collapse — 14-style pool, per-slot beat + style assignment
- [x] Fix seasonal context bleed — slot 3 gets NO seasonal context instruction
- [x] Fix generate-images-vertex.mjs parser bug (image prompt same-line format)
- [x] Remove Imagen safety restrictions from story prompts (full scene depiction)

### Joyo Pose Library

- [ ] Generate 15 Joyo poses in Seedance (prompts written 2026-04-04)
- [ ] Import poses to assets/mascot/ with descriptive names (joyo_thinking.png, joyo_jumping.png, etc.)
- [ ] Update generate-story-video.mjs to use expanded pose library for bookend slides

### ASMR Pipeline

- [x] **Wire AsmrReveal Remotion renderer into generate-asmr-video.mjs** — DONE 2026-04-12. `--remotion` flag skips FFmpeg frame pipeline, calls render-video.mjs `--comp AsmrReveal` with inputProps built from activity.json. npm: `animate:asmr:remotion`, `animate:asmr:remotion:dry`. Requires blank.png + colored.png (coloring) or maze.png + solved.png (maze) in the ASMR folder.
- [ ] **Live AsmrReveal test** — drop blank.png + colored.png into `output/asmr/coloring-spring-flowers/` → `npm run animate:asmr:remotion -- --asmr coloring-spring-flowers`
- [ ] Run ASMR pipeline for all 6 activity types (coloring, maze, dot-to-dot, tracing, matching, word-search)
- [ ] Confirm audio chain is lossless end-to-end (flagged fixed in prior session — verify)
- [ ] Schedule ASMR generation as part of daily-scheduler.mjs

---

## CAPTION AUDIT PROTOCOL (recurring — not phase-gated)

### Level 1 — Weekly Qualitative Audit (10 min every Monday)
Open 5 random JSON files from `output/queue/` or `output/archive/`. Read the `rawCaption` field
for pinterest and instagram. Score each 1–5 against these questions:
1. Does the first line stop the scroll? Would YOU pause for it?
2. Is there a specific number, name, or sensory detail — or is it vague?
3. Does every sentence pass the "So What?" test?
4. Does the last line land as a feeling, not a thought?
5. Would a parent save or share this to another parent?
Flag any scoring ≤3. Note which template produced it. Fix the template, not just the caption.

### Level 2 — Analytics Audit (monthly, once Pinterest + Instagram are live)
Track in a simple weekly log (copy this table into SESSION_LOG.md after each check):
```
Week of [date] | category | saves | impressions | save_rate%
```
When a category consistently shows save rate <1% (Pinterest) or watch rate <30% (TikTok)
for 2+ weeks → open that category's template and revise the formula.
Signal meaning: pattern-interrupt outperforms story → expand educational insight formula to more slots.

### Level 3 — Quarterly Trend Refresh (1 hour, every 3 months)
1. Pinterest Trends (trends.pinterest.com) — search "kids activities," "printables for kids"
   → note rising keywords → update hashtag pools + theme pool in generate-prompts.mjs
2. TikTok search autocomplete — type "kids coloring" → note autofill → update hook library
3. Competitor caption scan — top 5 posts from 2-3 competitor accounts → note structure + tone
4. Pattern interrupt pool — archive bottom 5 topics, add 5 new ones based on current research
5. Update writing-style.md Power Words list with any new emotional vocabulary that's resonating

### Audit tasks:
- [ ] Week 1: Run Level 1 audit after first 7 days of posting. Log findings in SESSION_LOG.md
- [ ] Month 1: Set up the weekly save-rate tracking table once Pinterest is live
- [ ] Month 3: First quarterly trend refresh — update hashtag pools + pattern interrupt topics

---

---

## LONG-FORM VIDEO ENGINE (approved 2026-04-16 — parallel track, does not block Phase 0)

> Full spec at `docs/LONGFORM_SPEC.md`. Claude architects, Codex implements.
> 3 tracks: Story (~5-7 min) → Animal Facts (~3-5 min) → Puzzle Compilations (~60 min)
> Tool stack: Remotion + Coqui TTS (local) + Stable Video Diffusion (local) + Suno AI (manual drop-in)

### ✅ Phases 1–3 + 5–6 — ALL CODEX BUILD PHASES COMPLETE (2026-04-16)
All 12 spec phases done. 9 Remotion compositions registered. Bundle validated.
See codex-log.md (Steps 1–65) for full audit trail.

### Phase 4 — FIRST E2E TEST

> No coding required. This is a manual + pipeline test run.
> Active episode: `output/longform/story/ep02-bennys-big-spring-help`
> Brief at: `output/longform/story/ep02-bennys-big-spring-help/brief.md`

**Step 1 — Generate episode plan** ✅ DONE (2026-04-17)
- [x] Run `npm run longform:story:plan:save`
- [x] Confirm episode.json + brief.md created — ep02-bennys-big-spring-help
- [x] brief.md has full 40-60 word Gemini prompts per scene + art style + protagonist at top

**Step 2 — Generate scene images in Gemini (manual)** ✅ DONE (2026-04-17)
- [x] 12 images generated in Gemini, named 01.png–12.png, dropped into ep02 folder

**Step 3 — Expand Suno pool first**
- [ ] Run `npm run suno:pool:expand` — fills all 5 pool types with 5 prompts each
- [ ] Check `config/suno-prompt-pool.json` — confirm story_background_ambient has entries

**Step 4 — Generate Suno tracks (manual drop-in)** ✅ DONE (2026-04-17)
- [x] background.mp3 + hook-jingle.mp3 + outro-jingle.mp3 dropped into ep02 folder

**Step 5 — Generate narration** ✅ DONE (2026-04-17)
- [x] Run `npm run longform:story:narrate -- --episode output/longform/story/ep02-bennys-big-spring-help`
- [x] 12 `narration-scene-*.mp3` files created (edge-tts, not Coqui — durationSec auto-set from audio)
- NOTE: TTS tool is now edge-tts (`python -m edge_tts`). Coqui not used. OpenAI TTS switch planned after animation phase.

**Step 6 — Animate scenes** ✅ DONE (2026-04-17)
- [x] Skipped GPU SVD — Ken Burns 6-direction fallback active in StoryActScene.jsx

**Step 7 — Render** ✅ DONE (2026-04-18 ep03 v3 APPROVED)
- [x] ep03-lilys-little-garden_h.mp4 — 6441 frames, 3.6 min. Ahmed: "perfect, perfect, perfect."
- [x] Render is programmatic API (not CLI) — EPERM-safe on Windows
- [ ] Upload ep03 to YouTube as unlisted → check quality

### Phase 4.6 — Brief Generator: 24 scenes + storyboard directives — DONE (2026-04-18)
- [x] Scene count: 12 → 24 (8 scenes per act)
- [x] 3 new fields per scene in episode.json + brief.md: `shotType`, `compositionNote`, `psychologyBeat`
- [x] shotType rules enforced in prompt: ESTABLISHING | MEDIUM | CLOSE-UP | ACTION | POV; no 2 consecutive same type; Act 1 scene 1 = ESTABLISHING; scene 24 = CLOSE-UP
- [x] compositionNote: 1-sentence artist framing direction (foreground, background, lighting, posture)
- [x] psychologyBeat: 3-6 word emotional label per scene tied to act trigger
- [x] brief.md shows all 3 fields before each image prompt — Ahmed pastes into Gemini with full context
- [x] GROQ_MAX_TOKENS raised 3500 → 5500
- [x] validateBrief and buildEpisodeJson updated to use SCENES_PER_ACT / TOTAL_SCENES constants
- NOTE: ep03 will be first episode with 24 scenes. ep02 stays at 12 scenes (already rendered).

### Phase 4.5 — Animation Quality Build (Codex — spec at docs/CODEX_ANIMATION_BRIEF.md)

> Video rules locked: 4s per image window (retention-optimized — faster cuts = better watch time); narration can be longer (7-8-10s); images cycle automatically from episode pool; no manual episode.json edits needed.
> Build in 2 tiers. Discuss before starting.

**Animation + engine — ALL LOCKED (2026-04-18, ep03 v3 approved):**
- [x] Hard cut transitions (no cross-dissolve — removed after causing image flash artifacts)
- [x] Ken Burns over full scene duration (no image cycling — removed, caused 2-image flash on cut)
- [x] Typewriter caption at 5 fps/word (cumulative reveal)
- [x] Music ducking: 0.22 → 0.06 during narration
- [x] Psychology overlays: NOSTALGIA/IDENTITY_MIRROR/COMPLETION_SATISFACTION all live
- [x] Flash-forward hook fills full 7s (Ken Burns pull-in, typewriter hook question, no Joyo)
- [x] Heartbeat pulse on Act 3 climax (0.02 amplitude — subtle)
- [x] Horizontal blurred background for vertical images in 1920×1080 render
- [x] Shared audio pool from assets/audio/ (no per-episode copies needed)
- [x] OpenAI TTS: `shimmer` voice, `tts-1-hd` model, min 7s scenes

**ep02 re-narration: SKIPPED (2026-04-18 — Ahmed decision, not worth the effort)**

---

## LONGFORM E2E TESTING — ALL 3 TRACKS (active sprint as of 2026-04-18)

> Engine is fully built. Goal: validate Track B + Track C work end-to-end the same way Track A (story) was validated.
> Track A Story is the proven baseline. Fix any bugs found in B + C before producing real content.

### Track A — Story Long-Form ✅ VALIDATED
- [x] ep03 approved ("perfect, perfect, perfect") — engine locked, production-ready
- [x] ep04 planned for next content session (2026-04-19+)

### Track B — Animal Facts (~3-5 min) [~] IN PROGRESS
> ep02-sea-otter is the test episode (ep01-african-lion deleted — generated with old weak brief, no images)
> Engine complete as of 2026-04-19: render + narration + art style pool all built

- [x] Brief generator upgraded: psychology, storyboarding, 50-70 word image prompts, GROQ_MAX_TOKENS 4000
- [x] `ANIMAL_ART_STYLES` pool (12 styles) added — deterministic per episode, injected into Groq + brief.md
- [x] Animal render engine built: `render-story-longform.mjs --format animal` → `AnimalFactsEpisodeH`
- [x] `generate-animal-narration.mjs` built: Groq copy + OpenAI TTS shimmer, full intelligence stack
- [x] Both brief generators (story + animal) updated to horizontal 1920×1080 image prompts
- [x] ep02 brief.md updated: art style header + horizontal prompts
- [~] ep02-sea-otter brief EXISTS but uses OLD 3-segment format (habitat/diet/funfact) — do NOT use as template or E2E test
- [x] **E2E TEST: Generate ep03 brief** → `npm run longform:animal:plan:save` — ep03-hedgehog generated (2026-04-20)
- [x] **Brief generator upgraded (2026-04-21):** content-intelligence.json + pattern-interrupt-dynamic.json wired into loadContext() + buildPrompt(). imagePromptHint word count validation added to validateBrief() (min 40 words — rejects lazy ~20w Groq outputs that produce identical images).
- [~] **Generate 6 images in Gemini** — ep03 brief prompts rewritten (2026-04-21): all 6 now 50-70w with distinct framing, lighting, and psychology color cues. Ahmed generating now. Drop: namereveal.png, fact1.png–fact5.png
- [~] **Drop audio** into ep03 folder: background.mp3 (Suno ambient), sung-recap.mp3 (Suno sung recap). Ahmed generating now.
- [x] `npm run longform:animal:narrate -- --episode output/longform/animal/ep03-hedgehog` → narrate (2026-04-22)
- [x] `npm run longform:animal:render -- --episode output/longform/animal/ep03-hedgehog` → render (2026-04-22) — 230MB, 3.0 min, exit 0. Bug found+fixed: Pexels 4K clips → Remotion timeout; fixed by FFmpeg transcode to 1920×1080 before render. download-broll.mjs patched to auto-transcode.
- [x] Ahmed reviewed ep03-hedgehog_h.mp4 (2026-04-22) — accepted as the new baseline. Current quality is roughly 8/10, with transitions and song called out as standout strengths. Future gains are from richer scenes, better hook-specific creative, and more runtime/variety, not rescue fixes.

### Track C — Puzzle Compilations (~60 min) [ ] BLOCKED
**Blocker:** Needs at least 5 ASMR folders each containing `blank.png` + `solved.png` (or `maze.png` + `solved.png`).
These come from the ASMR pipeline — Track C cannot be tested until ASMR live test runs first.
- [ ] **Prerequisite:** Complete ASMR live test (see ASMR Pipeline section above)
- [ ] `npm run longform:puzzle:compile -- --save` → generates compilation.json, confirm chapter list
- [ ] Drop `background.mp3` → `npm run longform:puzzle:render` → render
- [ ] Review output — flag any bugs in PuzzleCompilation.jsx

---

## Phase 4B — Animal Facts Structural Redesign (competitor-data-driven, execute 2026-04-20)

> Source: competitor analysis (SciShow Kids, Nat Geo Kids, FreeSchool, FactPaw) run 2026-04-19.
> Root problem: current engine is 1:18 vs. 3:30-4:00 target. 3 segments vs. 5 facts. Script is dreamy, not clear.
> Do NOT touch AnimalFactsEpisode.jsx frame constants until brief + narration redesign is validated first.

### 1. Brief Generator (`generate-animal-facts-brief.mjs`) ✅ DONE (2026-04-20)
- [x] Replace 3 category segments (habitat/diet/funFact) with **5 numbered facts** (fact1–fact5)
- [x] Each fact: **4-sentence structure** (expanded 2026-04-20 to hit 3:30-4:00 target) — (1) Fact 12-15w, (2) Explanation 14-18w, (3) Specific detail/stat 10-13w, (4) Comparison to child's world 10-13w. ~48-55 words per fact = projected 3:46 runtime.
- [x] Hook: direct open with animal name — "Sea otters hold hands while sleeping — here's why."
- [x] `comparisonAnchor` field per fact
- [x] `numberLabel` field: "FACT 1" … "FACT 5"
- [x] outroCta: "Ask a grown-up to help you write your answer in the comments!"
- [x] Runtime validator: warns if projected narration < 200s (3:20)

### 2. Narration Script (`generate-animal-narration.mjs`) ✅ DONE (updated 2026-04-22)
- [x] SEGMENTS array: fact1–fact5 replacing habitat/diet/funFact
- [x] **4-beat spoken formula** enforced in Groq prompt: surprise line → why/how → vivid real detail/stat → child-world landing
- [x] TTS speed tuned for energy: hook/nameReveal = 1.18, facts = 1.05, outro = 1.08
- [x] OpenAI animal-facts voice switched to `nova`
- [x] durationSec now tuned around tighter audio-led pacing instead of the older long silent tail behavior
- [x] Fabricated/ellipsis stat behavior removed from prompt

### 3. Fact Title Card Component ✅ DONE (2026-04-20)
- [x] `AnimalFactTitleCard.jsx` created — 45 frames (1.5s), yellow pill, spring pop-in

### 4. Composition Update (`AnimalFactsEpisode.jsx`) ✅ DONE (2026-04-20)
- [x] fact1–fact5 flatMap loop + title card between each
- [x] segFrames fallback: 12s → 16s
- [x] Label uses `episode[factKey].numberLabel`

### 5. Image Specs ✅ DONE (2026-04-20)
- [x] 6 images: namereveal.png + fact1.png–fact5.png
- [x] 3-second visual rule added to prompt
- [x] comparisonAnchor injected into imagePromptHint instructions

### 6. Target Runtime ✅ DONE (2026-04-20)
- [x] segFrames fallback updated to 16s; runtime validator in validateBrief — formula fixed to match render-time durationSec: max(wc/2.3+7, wc/1.5)
- [x] **VALIDATED** (2026-04-20): Brief generator runs clean, 4-sentence output, no runtime warning, projected 3:46

---

## Phase 4D — B-Roll Automation (Pexels API) ✅ DONE (2026-04-20, later deprioritized 2026-04-22)

> Agreed 2026-04-19 after ep02 render passed. Context expired before build. Recovered from chat log 2026-04-20.
> Data: YouTube kids content cuts every 3-8s; 1 image per 32s fact scene = retention cliff.
> **Update 2026-04-22:** default animal-facts direction is now still-image motion + light motion graphics + captions. Stock B-roll remains available, but is no longer the preferred visual strategy.

- [x] `scripts/download-broll.mjs` — Groq generates keywords per fact → Pexels search → HD clip downloaded
- [x] `AnimalFactScene.jsx` — 3s illustrated image (Ken Burns) → hard cut to B-roll (looped, muted)
- [x] `AnimalFactsEpisode.jsx` — fixed stale `funfact.png` reference → `namereveal.png` in outro
- [x] `package.json` — `longform:animal:broll` + `longform:animal:broll:dry` aliases added
- [x] `.env` — `PEXELS_API_KEY` added
- [x] **LIVE TESTED** — ep03-hedgehog: 5/5 clips downloaded (24s–97s, 3840–4096px 4K sources)
- [x] `render-story-longform.mjs` — B-roll auto-wired: spawns download-broll.mjs automatically if `episode.brollClips` empty; reloads episode.json after download
- [x] `render-story-longform.mjs` — fixed stale animal constants: ANIMAL_IMAGES/NARRATION updated to fact1-5 keys; calculateTotalFramesAnimal updated to fact1-5 + TITLE_CARD_FRAMES; segFrames fallback 12→16s

Updated workflow:
```
npm run longform:animal:plan:save
[manual: 6 Gemini images]
[manual: background.mp3 + sung-recap.mp3]
npm run longform:animal:narrate -- --episode output/longform/animal/ep03-...
npm run longform:animal:broll  -- --episode output/longform/animal/ep03-...
npm run longform:animal:render -- --episode output/longform/animal/ep03-...
```

**NEXT**: Use the locked animal-facts engine on the next episode and focus on richer scene count, stronger hook-specific creative, and longer/more varied fact coverage.

---

## Phase 4C — Story Engine Structural Alignment (competitor-data-driven, execute 2026-04-20)

> Source: competitor analysis (Bluey, StoryBots, CoComelon, Little Angel) run 2026-04-19.
> Current engine: approved and production-ready. These are targeted upgrades, not rebuilds.
> Priority order: (1) repeatable phrase, (2) brief generator dual-layer, (3) CTA frame for YouTube.

### 1. Repeatable Phrase Per Episode ✅ DONE (2026-04-20)
- [x] `episodeCatchphrase` + `catchphraseScenes: [N, M]` added to Groq prompt schema and hard rules
- [x] `catchphrase` + `catchphraseScenes` + `parentLayer` written to episode.json via `buildEpisodeJson()`
- [x] brief.md displays catchphrase + parent layer above the visual style section

### 2. Brief Generator — Dual-Layer Writing ✅ DONE (2026-04-20)
- [x] `parentLayer` field added to Groq schema + hard rule
- [x] Written to episode.json, displayed in brief.md

### 3. CTA Frame for YouTube Long-Form ✅ DONE (2026-04-20)
- [x] `StoryCtaScene.jsx` created — Joyo left, app icon right, narration pill at 5s, hard cut
- [x] `includeCta: false` default in `buildEpisodeJson()` — manual opt-in per episode
- [x] `StoryLongFormEpisode.jsx` wired: CTA_FRAMES=600, optional Sequence after outro
- [x] `render-story-longform.mjs` updated: CTA_FRAMES added to total calculation
- [ ] **NEXT**: Set `includeCta: true` in an episode.json to test the full YouTube CTA render

### 4. Scene Length — CONFIRMED (2026-04-20)
- [x] 7s minimum, 12-18 word narration = correct (Bluey: 7-12s average). No change needed.

### 5. Hook Validation — CONFIRMED (2026-04-20)
- [x] Flash-forward 7s with typewriter hook = structurally correct for format. No change needed.

---

## PHASE 1 — QUEUED (do not start until Phase 0 gate is cleared)

- [ ] Pinterest analytics: set up weekly saves tracking in a simple log
- [ ] Identify top 3 performing post categories by save rate (after 30 days of data)
- [ ] Add "best-of" repost logic for Sunday slot (pull top-saved posts from prior week)
- [ ] Evaluate Seedance 1.5 Pro trial results — decide if worth $118/year subscription

### Pipeline Hardening (sourced from planning review 2026-04-21)

- [ ] **Run logger utility** — `scripts/run-logger.mjs`: shared `logRun(stepName, fn)` wrapper used by every daily step. Appends to `output/run-log.json` with `{ step, status, duration_ms, timestamp, error }`. Failed steps log error and continue — pipeline never throws. Keep last 30 days of entries.
- [ ] **Harden daily orchestrator** — rewrite `daily-scheduler.mjs` to wrap every step with `logRun()`. Print a summary at the end: `Daily run complete: 12/13 steps succeeded. 1 failed: collect-trends. See output/run-log.json.`
- [ ] **Status command upgrade** — extend `scripts/status.mjs` to show: last daily run timestamp + step pass rate, cooldown state, queue depth, last post per platform, analytics freshness, longform queue depth. All data sourced from existing output files — no new API calls.
- [ ] **Queue review gate** — add `--review` flag to `post-content.mjs`: prints `output/queue-preview.json` listing what would be posted (platform, type, caption preview), then prompts `Post this content? (y/n)`. Only proceeds on `y`. Remove prompt once warmup ends.
- [ ] **Health check improvements** — upgrade `scripts/health-check.mjs`: test each API key with a lightweight call, verify FFmpeg is available, check output dirs are writable, check disk space (warn if <2GB free), check platform token expiry. Exit codes: 0 = healthy, 1 = degraded, 2 = broken.
- [ ] **Auto-cooldown on platform errors** — if a platform returns an auth error or 429 three times in a row, auto-set a platform-specific cooldown. Auto-clear after the specified time without manual intervention. Log all cooldown events to `output/cooldown-history.json`.
- [ ] **Post history tracking** — add posted URL/ID to `output/post-history.json` for every successful post. Include: platform, content type, post ID/URL, timestamp. Currently only queue files track this — centralized history enables de-dup and analytics.
- [ ] **Caption de-dup** — maintain `output/caption-history.json`. Before saving a generated caption, check for ≥80% similarity against recent entries. Reject + regenerate if too similar. Prevents repetitive captions accumulating in queue over weeks.

---

## PHASE 2 — BACKLOG (do not start until Phase 1 gate is cleared)

- [ ] Seedance API integration (when 2.0 API launches) — upgrade story videos from slideshow to AI video
- [ ] KDP book #2 planning — based on top-performing activity type data
- [ ] Paid ads pilot — $50 test budget on Pinterest Promoted Pins to top save performer
- [ ] Influencer outreach — 5 parenting micro-influencers (10K-50K followers)

---

## DECISIONS LOG

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-04 | Hold existing pipeline, no new video tech | Optimize to Phase 0 gate first (updated 2026-04-27: 10 images + 4 X posts + 1 ASMR + 1 story/day) |
| 2026-04-04 | Adopt tasks.md as persistent session anchor | Eliminate cold-start context waste per session |
| 2026-04-04 | Skip spec-kit tool install | Already have equivalent docs; only gap was tasks.md |
| 2026-04-04 | Seedance sub on hold | Test free tier first; evaluate after Joyo pose test |
| 2026-04-04 | Remove Imagen safety rewrites | Full scene depiction → better quality, manual Gemini use |

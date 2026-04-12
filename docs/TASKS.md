# JoyMaze — Persistent Task Board
Last updated: 2026-04-05

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
- Phase 0 → 1: 30 consecutive days ≥10 posts/day
- Phase 1 → 2: Pinterest 75K+ impressions/mo AND installs ≥100/mo or KDP ≥20 units/mo
- Phase 2 → 3: Installs ≥1,000/mo OR KDP ≥150 units/mo for 2 consecutive months

**North Star Metric:** Pinterest monthly saves (leading indicator for all downstream conversion)

---

## ACCOUNT RESET — X SUSPENSION (2026-04-11)

X account permanently suspended for spam. Decision: do NOT appeal. Start fresh.

- [ ] **Create new X account** — use joymaze.pp@gmail.com, sign up on mobile data (not home WiFi)
- [ ] **Apply for X Developer access** on new account — needed before automation can resume
- [ ] **2-week manual warmup** — post 2-3 times/day manually using warmup pipeline output; no automation
- [ ] **Create new Pinterest account** — use joymaze.pp@gmail.com
- [ ] **Disable `x-posts.yml` GitHub Actions workflow** — comment out or set `if: false` until new credentials are ready
- [ ] **Update GitHub Secrets** — replace X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET with new account credentials after developer access approved
- [ ] **Build warmup pipeline** — read-only display layer over `output/queue/`; shows caption + hook + CTA + image URL per post, copy-paste ready; includes warmup timer flag (same pattern as posting-cooldown.json); activates automation when timer expires

> **ToS note (confirmed):** Automation via official APIs is explicitly allowed on all platforms. Our pipeline is within ToS. The violation was behavioral (bulk + spam patterns). Do not let this incident make us over-correct away from automation — just enforce warmup period + rate limits on new accounts.

---

## NEXT SESSION — FIRST THING (2026-04-12+)

- [x] **Carousel Format 2 — Educational Facts carousel** — DONE (2026-04-11). `facts-carousel-*` folder prefix auto-detected by import-raw.mjs. generate-prompts.mjs triggers on doy%9===3 (next: 2026-04-12). 5 slides: hook + 4 facts. 5 activity pools (mazes, coloring, word-search, dot-to-dot, sudoku) rotate by doy.

- [x] **Carousel Format 3 — Activity Progression carousel** — DONE (2026-04-11). `progress-carousel-*` folder prefix auto-detected by import-raw.mjs. generate-prompts.mjs triggers on doy%9===6 (next: 2026-04-15). 3 slides: 01-blank.png → 02-half.png → 03-done.png. Ahmed generates all 3 in same Gemini chat for visual consistency.

---

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

## PHASE 1 — QUEUED (do not start until Phase 0 gate is cleared)

- [ ] Pinterest analytics: set up weekly saves tracking in a simple log
- [ ] Identify top 3 performing post categories by save rate (after 30 days of data)
- [ ] Add "best-of" repost logic for Sunday slot (pull top-saved posts from prior week)
- [ ] Evaluate Seedance 1.5 Pro trial results — decide if worth $118/year subscription

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
| 2026-04-04 | Hold existing pipeline, no new video tech | Optimize to 10+10+10 threshold first |
| 2026-04-04 | Adopt tasks.md as persistent session anchor | Eliminate cold-start context waste per session |
| 2026-04-04 | Skip spec-kit tool install | Already have equivalent docs; only gap was tasks.md |
| 2026-04-04 | Seedance sub on hold | Test free tier first; evaluate after Joyo pose test |
| 2026-04-04 | Remove Imagen safety rewrites | Full scene depiction → better quality, manual Gemini use |

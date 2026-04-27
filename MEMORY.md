# JoyMaze — Universal Project Memory

> **MANDATORY FOR ALL AI AGENTS (Claude, Codex, Gemini, GPT, any future agent)**
>
> READ THIS FILE AT THE START OF EVERY SESSION — BEFORE TOUCHING ANY CODE.
> This file is the single source of truth for all project decisions, account state,
> platform rules, pipeline architecture, and locked strategies.
> It lives at: `D:\Joymaze-Content\MEMORY.md`
>
> After reading, also check:
> - `docs/TASKS.md` — current in-progress tasks and blockers
> - Last 20 lines of `docs/SESSION_LOG.md` — what changed in the previous session
>
> Do NOT re-debate any decision marked **LOCKED**.
> Do NOT suggest approaches already tried and discarded.
> Trust this file over your priors.

---

## 1. WHO IS AHMED

Ahmed is the sole operator of JoyMaze — a kids activity app + Amazon KDP activity book business.
- Targets parents of kids ages 4–8
- Uses ChatGPT Pro and Gemini Pro subscriptions for **manual** image generation (no Imagen API in daily workflow)
- Strongly prefers $0-cost automation (free API tiers, existing subscriptions)
- Builds on Windows 11, Node.js/ESM, bash terminal
- Amazon author page: https://www.amazon.com/author/joymaze
- Business Google account: joymaze.pp@gmail.com

---

## 2. GROWTH STRATEGY (LOCKED 2026-04-04)

**Hold existing pipeline. No new video generation technology until Phase 0 gate is cleared.**

### Phase 0 Gate (current phase — updated 2026-04-27)
30 consecutive days meeting ALL of:
- ≥10 image posts generated
- ≥1 ASMR video generated
- ≥1 story video generated
- ≥4 X text posts in queue (generated — warmup-manual or posted)

Tracked by: `scripts/track-output.mjs` → `output/daily-output-log.json`
Report: `npm run output:report`

> Previous "10+10+10" shorthand retired 2026-04-27 — it implied 10 story + 10 ASMR which the current pipeline cannot produce daily. Gate above is the authoritative definition.

### Phase Roadmap
| Phase | Duration | Gate to next |
|-------|----------|-------------|
| 0 | Now → 6 weeks | 30 consecutive gate days |
| 1 | 6 weeks → 4 months | Pinterest 75K+ impressions/mo AND (installs ≥100/mo OR KDP ≥20 units/mo) |
| 2 | 4–8 months | Installs ≥1,000/mo OR KDP ≥150 units/mo for 2 consecutive months |
| 3 | 8+ months | Revenue-funded: Seedance, paid ads, KDP series, influencer outreach |

**North star KPI:** Pinterest monthly saves (leading indicator for all downstream conversion)

---

## 2.5 LONGFORM ANIMAL FACTS FORMAT (LOCKED 2026-04-22)

**Track B direction updated:** animal facts episodes should feel like lively kids edutainment, not mini documentaries.

### Visual rules
- Hook = mystery question only, no animal name spoken or shown before reveal.
- Hook visual should use silhouette-style treatment before the name reveal payoff.
- Fact scenes should default to still-image motion + light sketch/motion-graphics overlays + visible captions, not depend on generic stock B-roll.
- Sung recap is a format strength. Keep it, cycle episode images during the song, and show lyric captions on screen.
- Cleaner fact scenes beat clutter. Avoid unnecessary top tags on the fact visuals.

### VO rules
- Animal facts narration should sound like an excited kids-video host, not a classroom teacher.
- Permanent 4-beat spoken structure: surprise line → why/how → vivid real detail/stat → child-world comparison/payoff.
- Prefer lively, performable spoken copy over rigid textbook phrasing.
- OpenAI default voice for animal facts: `nova`.
- `shimmer` remains better suited for softer story narration, not the animal-facts format.

### Future direction
- Level 1 and Level 2 motion graphics are the default build direction for animal facts now.
- Level 3 character animation should be saved for Joyo as a future unified narrator/brand-mascot layer.
- Hedgehog (ep03) was accepted on 2026-04-22 as the new Track B baseline after multiple rerender passes. Remaining gains are mostly in content richness: more scenes, better hook-specific art, and longer/more varied fact coverage.

---

## 2.6 PUZZLE CHALLENGE REEL FORMAT (LOCKED 2026-04-23)

**Do not build puzzle longform from the old still-image activity short lane.**
First replace that lane with a stronger repeatable short-form unit: the **Puzzle Challenge Reel**.

### Format rules
- Puzzle is visible immediately.
- Title or hook sits top-center in a dark strip above the main puzzle viewing area.
- Countdown is digit-based and sits on the left side of the same strip.
- Title stays visible until solve starts.
- Title and countdown disappear together.
- Transition should be brief and functional: countdown ends, UI exits, short pulse or glow or zoom cue, then solve begins.
- Use subtle push-in during the challenge window, not dramatic camera motion.
- Timing should vary by puzzle type rather than forcing one universal duration.

### Strategic role
- This new reel format is the correct building block for future puzzle compilation longform.
- Do **not** try to stitch the previous static 15-second puzzle shorts into a 1-hour YouTube video.
- First prove the challenge reel in short-form, then use it as the chapter unit for compilation.

### Implementation state as of 2026-04-23
- `remotion/compositions/ActivityChallenge.jsx` was rebuilt toward the challenge-to-solve format.
- `scripts/generate-activity-video.mjs` was rewritten to render activity videos through Remotion instead of the old static FFmpeg overlay path.
- Optional solver sidecars can now be staged and consumed when present (`path.json`, `wordsearch.json`, `dots.json`).
- Real archive-backed validation succeeded for a maze sample (`maze-butterfly-garden`) with live solver data.
- Word-search was validated only at the challenge-lane / fallback-solve level because archive data did not include `solved.png` or `wordsearch.json`.
- Important Windows rule: large Remotion prop payloads must be passed by file, not giant inline CLI JSON. `render-video.mjs` now supports `--props-file` for this reason.

## 2.7 SHORT-FORM REELS ROADMAP (LOCKED 2026-04-27)

**Near-term production goal:** get four short-form lanes genuinely ready to generate every day: **ASMR, Puzzle Challenge, Story, and Animal Facts**.

### What stays stable
- ASMR short lane stays on the current reveal engine unless a real render exposes a blocker.
- Puzzle Challenge remains the active puzzle reel format. Keep polishing this lane rather than reviving the old static puzzle short.

### Story reel direction
- Do **not** keep polishing `remotion/compositions/StoryEpisode.jsx` as the primary story short format.
- The next story short should inherit the **grammar** of the longform story engine: flash-forward hook, stronger hook scene, better scene motion, better caption treatment, music ducking under narration, and a cleaner emotional landing.
- Preferred implementation direction: build a dedicated story reel composition derived from the longform components and keep the older simple story composition as legacy/fallback until the new reel passes review.

### Animal facts short direction
- Do **not** ship animal shorts as crude trims of the existing longform episode.
- The right short-form version is a **song-led vertical short** that reuses the longform animal rules: mystery hook first, no early animal-name reveal, lively kids-edutainment tone, and visual rhythm driven by the strongest longform component, the sung recap.
- Treat the song / lyric structure as the primary narration spine for the short, not as an afterthought layered onto spoken narration.

### Scheduler / daily automation note
- `package.json` already includes `generate-challenge-brief.mjs --save` in `npm run daily`.
- `scripts/daily-scheduler.mjs` does **not** yet mirror that challenge brief step, so scheduler parity is now a queued task: **TASK-OC-005**.
- After the new story reel and animal short formats are built and accepted, wire their planning/generation steps into the daily automation flow as a follow-up rather than guessing the integration path in advance.

## 3. PLATFORM ACCOUNT STATUS (last updated: 2026-04-13)

| Platform | Account | Handle | API in .env | GitHub Secrets | Status |
|----------|---------|--------|-------------|----------------|--------|
| X | @playjoymaze (repurposed fit-clinic, ~3yr old account) | @playjoymaze | ✓ New keys | ✓ Pushed 2026-04-11 | **Cooldown extended to 2026-05-07** (no activity Apr 17–27 due to personal reasons — extended warmup). x-posts.yml disabled (if:false). Resume manual posting from queue JSON. |
| Pinterest | New account | joymaze.pp@gmail.com | ✗ Old keys | ✗ Old keys | **Paused.** No new Developer App yet. |
| Instagram | New account | joymaze.pp@gmail.com | ✗ None | ✗ | **Paused.** No API credentials. |
| TikTok | Not created yet | — | ✗ | ✗ | **Not started.** |
| YouTube | joymaze.pp@gmail.com | — | ✓ | ✓ | **Live.** Fully operational. |

**Previous X account permanently suspended 2026-04-11 for spam/automation.** Decision: do NOT appeal.
**Warmup protocol:** Post manually for 2 weeks minimum before enabling automation on any new account.

**To re-enable X automation (2026-05-07+):**
1. Remove `if: false` from `.github/workflows/x-posts.yml`
2. `npm run cooldown:clear`
3. `git add . && git commit && git push`

**Credential gaps to close (in order):**
1. Pinterest — new Developer App under joymaze.pp@gmail.com → update .env + GitHub Secrets
2. Instagram — new Meta Developer App → update .env + GitHub Secrets
3. TikTok — create account first, then Developer App

---

## 4. ANTI-SPAM RULES (LOCKED — all platforms)

Triggered by X shadowban 2026-04-09 and account suspension 2026-04-11.
**These apply to every platform going forward, not just X.**

1. **No bulk posting** — Pinterest ≤5/run, TikTok ≤3/run, YouTube ≤3/run, X ≤4 text posts/day
2. **Soft CTAs only** — "link in bio", NOT "Download JoyMaze free on iOS and Android!"
3. **No brand name on X** — "JoyMaze" must not appear in X post body text
4. **No hashtags on X** — `config/hashtags.json` X count=0. Hashtags flag automation.
5. **X text posts = 4/day max**
6. **2-week manual warmup** on all new accounts before enabling automation

ToS clarification: automated API posting is **explicitly allowed** on all platforms. The violation was behavioral (bulk + spam patterns). Our pipeline is legal when using official APIs + rate limits.

---

## 5. CAPTION & CTA STRATEGY (LOCKED 2026-04-12)

**Old rule REVERSED:** joymaze.com URL and pipe ( | ) separators are BANNED from all captions.

| Caption type | Rule |
|---|---|
| Story / Inspiration | Emotional hook only, 1–2 sentences, standalone. No URL, no pipe. |
| Activity | Challenge hook + ONE save-bait phrase from 7-item rotation pool. No URL, no pipe. |
| SEO keywords | Can appear naturally woven in ("screen-free", "printable for kids"). Never as a stamped suffix. |
| "Link in bio" | Acceptable soft CTA on activity posts where something real links. |

**Why the reversal:** Same URL in every post = bot fingerprint. Pipe = AI content tell. Story + sales CTA = breaks emotional frame. joymaze.com in caption body adds zero Pinterest SEO value.

**"1 in 5 kids" / fraction phrases in activity hooks are ALLOWED** — they are challenge framing, not fabricated stats. Do not flag them. Do not extend the fabricated-stat regex to catch them.

---

## 6. CONTENT STRATEGY

### Daily Mix (post-2026-04-09 — story archetypes retired)

**Inspiration Slots (generate in Gemini, trend-driven):**
| # | Type | Folder |
|---|------|--------|
| 1 | `fact-card` | `output/raw/fact-card/` |
| 2 | `activity-challenge` | `output/raw/challenge/` |
| 3 | `quiet-moment` | `output/raw/quiet/` |
| 4 | `printable-tease` | `output/raw/printable/` |
| 5 | `identity` | `output/raw/identity/` |

**Activity Slots (puzzle/page images, generate in Gemini):**
| # | Type | Folder |
|---|------|--------|
| 6 | maze | `output/raw/maze/` |
| 7 | word-search | `output/raw/wordsearch/` |
| 8 | matching | `output/raw/matching/` |
| 9 | tracing | `output/raw/tracing/` |
| 10 | quiz | `output/raw/quiz/` |
| 11 | coloring | `output/raw/coloring/` |
| 12 | dot-to-dot | `output/raw/dottodot/` |
| 13 | sudoku | `output/raw/sudoku/` |

### Series Naming (LIVE 2026-04-12, injected via generate-prompts.mjs)
- Monday = "Maze Monday"
- Wednesday = "Puzzle Power Wednesday"
- Friday = "Fine Motor Friday"

### Carousel Formats (all LIVE as of 2026-04-11)
- **Format 1** (Activity Collection) — prefix: `carousel-{theme}-{date}/` — doy%9===0
- **Format 2** (Educational Facts, 5 slides) — prefix: `facts-carousel-{activity}-{date}/` — doy%9===3
- **Format 3** (Activity Progression, 3 slides) — prefix: `progress-carousel-{activity}-{date}/` — doy%9===6

### X Text Post Types (4/day, UTC scheduling)
- `story-hook` → 13:00 UTC (8 AM EST)
- `puzzle` → 17:00 UTC (12 PM EST); answer tweet → 21:00 UTC
- `insight` → 21:00 UTC (4 PM EST)
- `identity` → 23:00 UTC (6 PM EST)

---

## 7. POSTING ARCHITECTURE

### GitHub Actions (cloud, PC-off safe — primary posting engine)
- `x-posts.yml` — **DISABLED** (if:false). Hourly when enabled. Re-enable 2026-04-26.
- `post-media.yml` — 2:00 UTC daily. Image/video posting via Cloudinary URLs.
- `weekly.yml` — Monday 5:00 UTC. Pinterest token refresh + intelligence + trends.

**Key daily rule:** After `npm run generate:captions`, run:
```
git add output/queue/ && git commit -m "chore: queue [date]" && git push
```
GitHub Actions reads queue from repo — no push = no 4AM posting.

### Local Task Scheduler
- "JoyMaze Daily" (9AM): generation only — prompts, briefs, X text, ASMR, stories
- All posting tasks: **DISABLED permanently.** GitHub Actions owns all posting.

### Cloudinary
- Account: `dm9eqz4ex`
- Images: `joymaze/images/`, Videos: `joymaze/videos/`
- Upload utility: `scripts/upload-cloud.mjs`

### Cooldown
- `output/posting-cooldown.json` tracked in git. Must push after setting for Actions to respect it.
- Current cooldown: until **2026-05-07** (X manual warmup extended after inactivity gap)
- `npm run cooldown:clear` auto-pushes removal

---

## 8. KEY SCRIPTS

| Script | npm command | Purpose |
|--------|------------|---------|
| `generate-prompts.mjs` | `npm run generate:prompts` | Daily image prompt generation + quality gate |
| `generate-x-posts.mjs` | `npm run x:generate` | 4 X text posts/day |
| `post-x-scheduled.mjs` | `npm run x:text:post` | Post due X texts (Actions job) |
| `track-output.mjs` | `npm run output:track` | Phase 0 gate counter |
| `status.mjs` | `npm run status` | Full pipeline health check |
| `intelligence-refresh.mjs` | `npm run intelligence:full` | Weekly competitor + trend synthesis |
| `collect-trends.mjs` | `npm run trends` | Google Trends + seasonal signals |
| `generate-asmr-brief.mjs` | (auto in daily) | ASMR brief + Gemini image prompts |
| `generate-story-ideas.mjs` | (auto in daily) | Story script generation |
| `import-raw.mjs` | `npm run import` | Import generated images → branded composites |
| `archive-queue.mjs` | (auto in daily) | Move queue → archive after posting |

---

## 9. INTELLIGENCE & QUALITY SYSTEMS

### Prompt Quality Gate (LIVE 2026-04-12 — do not re-implement or debate)
**Layer 1 — Deterministic pre-checks (in generate-prompts.mjs):**
- `text-in-image` (−4): image prompt renders text/stats
- `fabricated-stat` (−4): percentage claim (%) in image prompt
- `wrong-season` (−3): Christmas/Halloween in spring, etc.
- `pipe-in-caption` (−3): pipe ( | ) in any caption hook idea line
- `illustration-on-story` (−3): watercolor/anime/editorial on non-fact-card story prompt
- `coloring-style-conflict` (−4): watercolor/ink-and-wash/pastel on Coloring Page activity
- `system-instruction-leak` (−3): internal rule text copied into output

Known minor gap: coloring-style-conflict catches "Coloring Page" but misses "Coloring" alone. Low priority.

**Layer 2 — LLM scorer:** llama-3.1-8b-instant via Groq. Scores 0–10. Rubber-stamps 9.5 frequently — rely on pre-checks for hard rules.

**Layer 3 — Auto-regen:** <5 score OR pre-check violation → regen (up to 2 attempts) with SLOT_TYPE_RULES injected per slot type.

### Intelligence System (LIVE 2026-04-07)
Weekly Monday pipeline: Gemini competitor searches → synthesis → brand safety (blocklist + Groq) → entropy check → writes `config/content-intelligence.json` → `apply-intelligence.mjs` updates 4 dynamic pool files.

Dynamic pools: `config/theme-pool-dynamic.json`, `config/hooks-library.json`, `config/cta-library.json`, `config/pattern-interrupt-dynamic.json`

Commands: `npm run intelligence:full` | `npm run intelligence:refresh:dry` | `npm run intelligence:apply:force`

### Trend Pipeline (LIVE 2026-04-05)
`collect-trends.mjs` → `config/trends-this-week.json` — refreshes every Monday.
Sources: Google Trends (8 target keywords) + seasonal calendar with urgency scoring.
Injected into `generate-prompts.mjs` at generation time.

---

## 10. VIDEO PIPELINES

### ASMR (LIVE 2026-04-05)
- `--type coloring`: top-to-bottom color sweep, 30s reveal
- `--type maze`: left-to-right path draw, 30s reveal + pencil animation
- **Corner "flare" on maze wipe is intentional — do NOT change to crossfade**
- 1.5s hold after reveal, then clean end (no outro)
- Run flow: generate images → drop into `output/asmr/[folder]/` → `npm run generate:asmr -- --asmr [folder]`
- FFmpeg path: expects `blank.png` + `colored.png` (coloring) or `maze.png` + `solved.png` (maze)
- Remotion path: `npm run animate:asmr:remotion -- --asmr [folder]` (cleaner wipe, preferred)

### Story Video (LOCKED design rules)
- **No outro, no CTA, no fade-to-black.** Clean cut on last frame (loop-friendly for TikTok/Reels/Shorts)
- Scene duration: 3–4s target, 4.5s hard cap
- Narration: 1 sentence ≤15 words/slide
- 8–10 slides per episode (valid range: 6–15)
- Story archetypes RETIRED — all new story content is activity-adjacent

### Remotion Engine (updated 2026-04-13)
| Composition | npm script | Status | Notes |
|-------------|-----------|--------|-------|
| StoryEpisode | `npm run animate:story` | Tested (11.4s render) | `typewriterCaptions: true` prop enables word-by-word caption |
| AsmrReveal | `npm run animate:asmr:remotion` | Wired — needs real images | Progress bar added (orange, fills with wipe). `--remotion` flag preferred. |
| HookIntro | `npm run animate:hook` | Tested (6.7s render) | Prepend to stories (no auto-concat yet — L2c pending) |
| AnimatedFactCard | `npm run animate:factcard` | Tested (12.5s / 13.6s render) | |
| ActivityChallenge | `npm run animate:challenge` | Built 2026-04-13, dry-run OK | Hook → puzzle + MM:SS timer → CTA. `imagePath`, `activityLabel`, `countdownSec` props. |

**Components available:**
- `TypewriterCaption` — word-by-word reveal, drop-in for CaptionBar. Enable via `typewriterCaptions: true` on StoryEpisode.
- `WipeReveal`, `CaptionBar`, `HookText`, `JoyoWatermark`, `BrandWatermark`, `FloatingParticles` — all in `remotion/components/`

**render-video.mjs features (updated 2026-04-13):**
- `--preview` flag: renders first 3s at 0.5× resolution (540×960). Fast visual check. Output named `*-preview.mp4`.
- Auto-thumbnail: after every full render, extracts frame 3s as `*-thumb.jpg` via `renderStill`. Skipped in preview mode.
- Audio auto-selection: if `audioPath`/`musicPath` not set in source JSON, auto-picks from `AUDIO_MAP` (coloring/maze → `crayon.mp3`, story → Twinkle track). Add more files to `assets/audio/` and update `AUDIO_MAP` to expand.

**Batch + hook pipeline (all in scripts/):**
- `render-batch.mjs` (`npm run generate:videos`) — scans stories/ + asmr/, renders all pending. Skip logic: if any .mp4 in output/videos/ contains the folder slug, skip.
- `prepend-hook.mjs` (`npm run prepend:hook`) — renders HookIntro, FFmpeg-concats to front of any video. Auto-extracts headline from queue JSON if not provided.

First render: ~54–60s cold bundle. Subsequent renders in same process: instant.

---

## 11. API KEYS & CREDENTIALS

**Gemini:** `VERTEX_API_KEY` is the ONLY working key. `GOOGLE_AI_API_KEY` is suspended (403 PERMISSION_DENIED).
- Pattern for all new Gemini scripts: `process.env.VERTEX_API_KEY || process.env.GOOGLE_AI_API_KEY`
- Never use `GOOGLE_AI_API_KEY` alone.

**Anthropic API:** NOT NEEDED. Gemini-only strategy. Do not suggest Anthropic API integration.

**Groq:** ~$15/mo acceptable. Monitor — optimize if >$30/mo.
- Scorer model: `llama-3.1-8b-instant`
- Generation model: `llama-3.3-70b-versatile`

**Writing style injection rule:** `config/writing-style.md` must go in the `system` message role, NOT prepended to the user message. Applies to ALL new Groq/LLM scripts.

**GitHub:** 17 secrets configured in `drmetwally/joymaze-content` (public repo). Never put keys in code files.

---

## 12. GEO STRATEGY (LOCKED)

- Target: US/UK/CA/AU/NZ English-speaking parents (primarily US)
- **No VPN for API posting** — platforms detect datacenter/VPN IPs as account takeover signal
- Real geo levers: English content + US-parent-targeted keywords + Platform Business settings (declare US/UK as target market in Pinterest + Instagram dashboards)
- New account creation: use US virtual number (Google Voice or TextNow) for SMS verification

---

## 13. PENDING — IN PRIORITY ORDER

### Agent Tasks (OpenClaw — queued, specs in docs/tasks/)
- [ ] **TASK-OC-001** — Fix pool file corruption in `intelligence-refresh.mjs` — atomic writes in `applyCompetitorFindings()`
- [ ] **TASK-OC-002** — Wire full intelligence stack into `generate-activity-video.mjs` (currently only reads competitor-intel)
- [ ] **TASK-OC-003** — Replace Edge TTS with Kokoro-82M as fallback in `generate-story-video.mjs` + `generate-animal-narration.mjs`

### Blockers (must close to enable posting)
- [ ] Pinterest — new Developer App under joymaze.pp@gmail.com → update .env + GitHub Secrets
- [ ] Instagram — new Meta Developer App → update .env + GitHub Secrets
- [ ] TikTok — create account, then Developer App
- [ ] X — re-enable 2026-05-07: remove `if:false` from x-posts.yml + `npm run cooldown:clear` + push

### Content Quick Wins (next slow session)
- [ ] "FREE Printable" badge — small corner ribbon in brand frame margin only (NOT over activity content — that was tried and rejected 2026-04-12). Sharp composite, no AI.
- [ ] Age-specific caption variants — same image, two captions (ages 4–5 and 6–8). Caption template change only.
- [ ] Static "Did You Know?" infographic — sharp-rendered text + icon. (Video version AnimatedFactCard is already done.)

### Future / Lower Priority
- [ ] Warmup display script — read-only UI over `output/queue/` for copy-paste manual posting
- [ ] PostBridge refactor — platform-isolated try/catch in post-content.mjs. Build after Instagram/TikTok/Pinterest all live.
- [ ] Post failure queue — `output/queue/failed/` + `npm run post:retry`. After PostBridge.
- [ ] Joyo daily video — blocked on 15–20 Joyo pose library (only joyo_waving.png exists)
- [ ] Story Phase 2 — story analytics → story-performance-weights.json. Trigger: 8+ published episodes with analytics data
- [ ] Pinterest Idea Pins — 4–9x more saves. Needs Standard API approval.

---

## 14. MULTI-AGENT PROTOCOL

All agents (Claude, Codex, OpenClaw, any future agent) MUST complete the **end-of-session ritual** before closing:
1. Mark `[x]` in `docs/TASKS.md` on completed tasks
2. **Append structured entry to `docs/AGENT_LOG.md`** — this is the primary supervisor audit trail (NEW 2026-04-27)
3. Append structured entry to `docs/SESSION_LOG.md`
4. Append one line to `docs/CHAT_LOG.md`
5. If architecture decision made: append to `docs/DECISIONS.md`

**Skipping this ritual = next session starts cold with wrong context.**

**`docs/AGENT_LOG.md`** — collaborative log where every agent records completed work. Claude reads this to audit all agent output before marking tasks verified. Template and format are inside that file.

Handoff signals:
- Any agent → Claude: `[NEEDS CLAUDE REVIEW]` in AGENT_LOG entry review status field
- Claude → agent: full spec in `docs/tasks/TASK-XX-NNN-name.md` (file paths, I/O contracts, exact line numbers)
- Claude verifies: marks AGENT_LOG entry as `VERIFIED by Claude [date]` or `REJECTED — [reason]`

Protection rules:
- Never rename a function used in more than 1 file (cross-file refactor → route to Claude)
- Every new script must have `--dry-run` support
- New npm scripts always have a `:dry` variant

---

## 15. SESSION HYGIENE (for Claude Code)

- **Read at startup (3 files only):** this file (`MEMORY.md`) + `docs/TASKS.md` + last 20 lines of `docs/SESSION_LOG.md`
- Do NOT read `docs/ACTIVE_SPRINT.md` — stale. TASKS.md is the live anchor.
- Do NOT re-read the conversation for context — structured files ARE the context
- Run `/mcp` at session start — disable Gmail/Calendar MCP servers if not needed (each costs ~7K tokens/turn)
- `/compact` after every completed task
- Use subagent for any task requiring 3+ file reads — keep main context clean
- Read memory before EVERY decision — reopening settled debates costs quota and frustrates Ahmed

---

*Last updated: 2026-04-27 — Phase 0 gate updated, X cooldown extended to 2026-05-07, AGENT_LOG.md introduced, 3 OpenClaw tasks queued (OC-001/002/003), pool file corruption root-caused and specced for fix.*

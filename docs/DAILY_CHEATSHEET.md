# JoyMaze Daily Production Cheatsheet

> Print this. Follow it top to bottom. Every day. No thinking needed.

Last updated: 2026-04-12

---

## The Intelligence Feedback Loop (how everything connects)

```
MONDAY AUTOMATIC (npm run daily + GitHub Actions):
  collect-analytics.mjs   → output/analytics/YYYY-MM-DD.json
  weekly-scorecard.mjs    → config/performance-weights.json    (save-rate by archetype/category)
  collect-trends.mjs      → config/trends-this-week.json       (Google Trends + seasonal calendar)
  intelligence-refresh.mjs→ config/content-intelligence.json   (Gemini competitor web search)
  apply-intelligence.mjs  → 4 dynamic pool files:
                              config/theme-pool-dynamic.json    (trending topics)
                              config/hooks-library.json         (proven hook patterns)
                              config/cta-pool-dynamic.json      (high-CTR CTAs)
                              config/pattern-interrupt-dynamic.json (did-you-know facts)

DAILY (generate-prompts.mjs reads everything above):
  themes         ← trending themes (boost_themes) + analytics ranking
  hook examples  ← hooks-library top performers
  fact cards     ← pattern-interrupt-dynamic keyword-matched to today's activity
  carousel pick  ← analytics activityRanking (save-rate winner drives Format 2+3)
  series naming  ← SERIES_NAMES[day]: Mon=Maze Monday, Wed=Puzzle Power Wednesday, Fri=Fine Motor Friday

DAILY (generate-captions.mjs):
  CTAs + hooks   ← cta-pool-dynamic + hooks-library

POSTED CONTENT → collect-analytics.mjs (next day) → feeds back into rankings
TRACK GATE     → track-output.mjs → output/daily-output-log.json (Phase 0: 30 days ≥ 10/10/10)
```

**The loop is automatic after git push. Your job: generate content and push the queue.**

---

## Architecture — What Runs Where

| Layer | What it does | Needs PC on? |
|-------|-------------|--------------|
| **Local — you** | Generate images in Gemini, import, caption | Yes |
| **Local — npm run daily** | 9 AM daily generation (prompts, briefs, X posts, output tracking) | Yes (at 9 AM) |
| **GitHub Actions — hourly** | X text post drip (generate if needed + post due entries) | No |
| **GitHub Actions — 4 AM Cairo** | Post all pending media to Pinterest/YouTube/X/TikTok | No |
| **GitHub Actions — Monday 7 AM** | Pinterest token refresh + intelligence + trends | No |

**Key rule:** After you import and caption content, `git push` before going to sleep. Actions reads the queue from the repo — if you don't push, nothing posts at 4 AM.

**Where files live:**

| File type | Location | In GitHub? | In Cloudinary? |
|-----------|----------|------------|----------------|
| Prompts, story/ASMR briefs | `output/prompts/`, `output/stories/`, `output/asmr/` | No — local only | No |
| Raw images (from Gemini) | `output/raw/` | No — local only | No |
| Branded images + videos | `output/images/`, `output/videos/` | No — local only | **Yes** (auto-uploaded) |
| Queue metadata (JSON) | `output/queue/` | **Yes** (committed + pushed) | No |
| Archive | `output/archive/` | No — local only | No |
| Analytics | `output/analytics/` | No — local only | No |
| Config pools (intelligence) | `config/` | **Yes** (Actions commits back) | No |
| Daily output log | `output/daily-output-log.json` | No — local only | No |

---

## Before You Start

Open a terminal in `D:\Joymaze-Content\`

Check pipeline health (30 seconds):
```bash
npm run health-check     # API keys, config files, queue state
npm run status           # X queue + cooldown + recent posts
npm run output:report    # Phase 0 gate — last 7 days
```

---

## STEP 1 — Clean Yesterday + Get Today's Prompts (2 min)

```bash
npm run daily
```

This does automatically, in order:
1. Archives yesterday's queue → `output/archive/YYYY-MM-DD/`
2. Counts today's output → `output/daily-output-log.json` (Phase 0 gate tracking)
3. Collects analytics data (Monday only)
4. Refreshes trend signals (Monday only)
5. Runs intelligence loop (Monday only)
6. Generates 10 fresh AI image prompts → `output/prompts/prompts-YYYY-MM-DD.md`
7. Generates story idea → `output/stories/`
8. Generates ASMR brief → `output/asmr/`
9. Generates 4 X text posts → `output/queue/x-text-YYYY-MM-DD.json`

**Check today's prompts:** Open `output/prompts/prompts-YYYY-MM-DD.md`

**Series naming (automatic):**
- **Monday → Maze Monday** — caption hooks for maze/activity slots include "Maze Monday"
- **Wednesday → Puzzle Power Wednesday** — hooks reference the series
- **Friday → Fine Motor Friday** — hooks reference the series
- Other days: no series tag, normal hooks

**Carousel day (every ~3 days):** Check the `## CAROUSEL DAY` or `## FACTS CAROUSEL DAY` or `## PROGRESSION CAROUSEL DAY` block at the bottom of the prompts file. Follow it exactly.

---

## STEP 2 — Generate ALL Images in Gemini (30–40 min)

Open Gemini. Keep it open. Generate everything in one sitting.

### 2A — Inspiration Post Images (5 images)

Copy each inspiration prompt (items 1–5) into Gemini. Save to matching subfolder:

| Slot | Folder | What to generate |
|------|--------|-----------------|
| Fact Card | `output/raw/fact-card/` | Bold educational poster + stat overlay |
| Challenge | `output/raw/challenge/` | Child at peak engagement with a printable activity |
| Quiet Moment | `output/raw/quiet/` | Child absorbed in activity, no screens, warm light |
| Printable Tease | `output/raw/printable/` | Beautiful flat-lay close-up of printed activity sheet |
| Identity | `output/raw/identity/` | Parent identity scene or bold text design |

**Naming:** `fact-dinosaurs.png`, `challenge-ocean.png`, `quiet-rainy-day.png`, `printable-matching.png`, `identity-screen-free.png`

### 2B — Activity Post Images (5 images)

Copy each activity prompt (items 6–10) into Gemini. Iterate until the puzzle looks correct.

| Type | Folder | Name pattern |
|------|--------|-------------|
| Maze | `output/raw/maze/` | `maze-{theme}.png` |
| Word Search | `output/raw/wordsearch/` | `wordsearch-{theme}.png` |
| Matching | `output/raw/matching/` | `matching-{theme}.png` |
| Tracing | `output/raw/tracing/` | `tracing-{theme}.png` |
| Quiz | `output/raw/quiz/` | `quiz-{theme}.png` |
| Coloring | `output/raw/coloring/` | `coloring-{theme}.png` |
| Dot-to-Dot | `output/raw/dottodot/` | `dottodot-{theme}.png` |
| Sudoku | `output/raw/sudoku/` | `sudoku-{theme}.png` |

### 2C — ASMR Video Images (2 images)

> Goes into its own folder, NOT output/raw/

1. Open: `output/asmr/[type]-[theme]/brief.md` (or check prompts file for ASMR brief)
2. Generate in Gemini — **same chat for both images for visual consistency**:
   - **Image 1 (blank):** empty activity, line art, white background
   - **Image 2 (solved/colored):** same activity fully completed
3. Save:
   ```
   output/asmr/[type]-[theme]/blank.png      ← coloring: blank line art
   output/asmr/[type]-[theme]/colored.png    ← coloring: fully colored
   ```
   *(For mazes: `maze.png` and `solved.png`)*

### 2D — Story Video Images (7 images, optional)

> Goes into its own folder, NOT output/raw/

1. Open: `output/stories/epNN-[title]/image-prompts.md`
2. Generate each slide image in Gemini (keep same chat for visual consistency)
3. Save as `01.png` through `07.png` in the story folder

---

## STEP 3 — Assemble ASMR Video (1 min)

**Option A — Remotion (recommended, cleaner result):**
```bash
npm run animate:asmr:remotion -- --asmr coloring-spring-flowers
```

**Option B — FFmpeg (fallback):**
```bash
npm run generate:asmr -- --asmr coloring-spring-flowers
```

Replace folder name with your folder from `output/asmr/`.

**Remotion dry-run (check before committing):**
```bash
npm run animate:asmr:remotion:dry -- --asmr coloring-spring-flowers
```

---

## STEP 4 — Assemble Story Video (optional, 1 min)

**Option A — Remotion (recommended, animated):**
```bash
# Remotion path — fully animated slides with spring transitions
npm run generate:story:remotion -- --story epNN-[title]
```

**Option B — Edge TTS + FFmpeg (free, fast):**
```bash
npm run generate:story:edge -- --story epNN-[title]
```

**Option C — OpenAI TTS + FFmpeg (~$0.01, better voice):**
```bash
npm run generate:story:openai -- --story epNN-[title]
```

**Remotion standalone compositions (for advanced use):**
```bash
npm run animate:factcard        # AnimatedFactCard educational carousel video
npm run animate:hook            # HookIntro 4s hook clip
npm run remotion:studio         # Visual preview + scrubbing
```

---

## STEP 5 — Activity Puzzle Videos (1 min)

```bash
npm run generate:activity:video
```

Converts maze, matching, quiz, tracing, dot-to-dot images into 15-second YouTube Shorts.
Output: `output/videos/*-yt-short.mp4`

---

## STEP 6 — Import + Brand Images (1 min)

```bash
npm run import:raw
```

Takes everything in `output/raw/` and:
- Adds **JoyMaze logo only** (no text overlays — hook text goes in the caption, not burned on the image)
- Resizes cleanly for each platform (no blur, no cropping of printables)
- Assigns `scheduledHour` (spread 6 AM–9 PM)
- Uploads all variants to Cloudinary (for 4 AM cloud posting)
- Creates queue metadata in `output/queue/`
- **If any images have carousel sidecar JSONs → also creates a carousel queue file** (see Carousel section below)

**Check:** 10 items processed, ~40 platform-sized images in `output/images/`

### Carousel Posts (Instagram + TikTok)

**Fully automatic — no manual steps.** Carousels rotate on a 9-day cycle — one format every ~3 days.

**3 formats, all zero-friction:**

| Format | Trigger | Slides | Folder prefix | Intelligence signal |
|--------|---------|--------|---------------|---------------------|
| **1 — Activity Collection** | `doy%9===0` | 5 activity images | `carousel-{theme}-{date}/` | trending theme drives topic |
| **2 — Educational Facts** | `doy%9===3` | 5 (hook + 4 brain-benefit facts) | `facts-carousel-{activity}-{date}/` | analytics ranking picks activity; dynamic facts injected from pattern-interrupt pool |
| **3 — Activity Progression** | `doy%9===6` | 3 (blank → half → done) | `progress-carousel-{activity}-{date}/` | boost_themes override → analytics ranking → doy fallback |

**Your only action on carousel day:**
1. Check the carousel instructions block at the bottom of the prompts file
2. Create the folder it specifies inside `output/raw/`
3. Drop your images in, named `01-xxx.png`, `02-xxx.png`, etc.
4. Run `npm run import:raw` — carousel queue file built automatically

**Notes:**
- `import-raw.mjs` detects `carousel-*`, `facts-carousel-*`, and `progress-carousel-*` subfolders automatically
- Files sorted alphabetically = slide order
- Format 2: prompts file includes exact fact copy for each slide — render as infographic card in Gemini
- Format 3: generate all 3 slides in the **same Gemini chat** for visual consistency
- The `intelligenceSignal` field in `carousel-plan-{date}.json` shows what drove the pick: `analytics-ranked` / `trend-boost` / `doy-rotation`

---

## STEP 7 — Generate Captions (2–3 min)

```bash
npm run generate:captions
```

AI writes platform-specific captions for all image posts.
**Rules enforced:** Soft CTAs only, no brand name on X, 0 hashtags on X.

---

## STEP 8 — Push Queue to GitHub ⚠️ REQUIRED

```bash
git add output/queue/
git commit -m "queue: $(date +%Y-%m-%d)"
git push
```

**Why this matters:** GitHub Actions reads the queue from the repo. If you don't push, the 4 AM posting job has nothing to work with. Your images are already on Cloudinary — this just tells Actions what to post.

---

## STEP 9 — Done. Cloud handles the rest.

- **Hourly (GitHub Actions):** X text posts drip throughout the day
- **4:00 AM Cairo (GitHub Actions):** All pending images/videos post to Pinterest, YouTube, X
- **PC can be off** — posting is fully cloud-based after your push

**To verify the queue:**
```bash
npm run calendar
```

**To dry-run posting locally:**
```bash
npm run post:scheduled:dry
```

---

## Daily Summary

| Step | What | Time | Command |
|------|------|------|---------|
| 1 | Archive + generate all briefs + output log | 2 min | `npm run daily` |
| 2A | Inspiration images (5) | 10–15 min | Gemini → `output/raw/<slot>/` |
| 2B | Activity puzzle images (5) | 15–20 min | Gemini → `output/raw/<type>/` |
| 2C | ASMR images (2) | 5 min | Gemini → `output/asmr/[folder]/` |
| 2D | Story slides (7, optional) | 10 min | Gemini → `output/stories/[folder]/` |
| 3 | Assemble ASMR video | 1 min | `npm run animate:asmr:remotion -- --asmr [folder]` |
| 4 | Assemble story video (optional) | 1 min | `npm run generate:story:edge -- --story [folder]` |
| 5 | Activity puzzle videos | 1 min | `npm run generate:activity:video` |
| 6 | Import + brand images | 1 min | `npm run import:raw` |
| 7 | AI captions | 2–3 min | `npm run generate:captions` |
| 8 | Push queue to GitHub ⚠️ | 1 min | `git add output/queue/ && git commit -m "queue: date" && git push` |
| 9 | Done — cloud posts at 4 AM | auto | GitHub Actions |

**Total active time: ~40–45 min/day**

---

## Phase 0 Gate Tracking

**Target:** 30 consecutive days with images ≥ 10, story videos ≥ 10, ASMR videos ≥ 10

```bash
npm run output:report    # Table: last 7 days + streak count
npm run output:track     # Manually log today's count (auto-runs in npm run daily)
```

Gate is logged to `output/daily-output-log.json` — one entry per day, 90-day rolling window.

**Phase roadmap:**
- Phase 0 → 1: 30 consecutive gate days
- Phase 1 → 2: Pinterest 75K+ impressions/mo AND installs ≥100/mo or KDP ≥20 units/mo
- Phase 2 → 3: Installs ≥1,000/mo OR KDP ≥150 units/mo for 2 consecutive months

---

## Anti-Spam Rules (ALL platforms)

- **No bulk posting** — hourly drip only, max 2 creative posts per hour
- **X captions:** 0 hashtags, no brand name ("JoyMaze"), soft CTAs only
- **All platforms:** No hard-sell CTAs, no identical captions across days
- **X text posts:** 4/day max, staggered hourly

---

## Platform Status (as of 2026-04-12)

| Platform | Account | Status | Posting |
|----------|---------|--------|---------|
| X | @playjoymaze | Active — 2-week manual warmup (ends ~2026-04-26) | Manual only |
| Pinterest | joymaze.pp@gmail.com | New account — NO API keys yet | Paused |
| Instagram | joymaze.pp@gmail.com | New account — NO API keys yet | Paused |
| TikTok | joymaze.pp@gmail.com | New account — NO API keys yet | Paused |
| YouTube | joymaze.pp@gmail.com | Live | Active (4 AM Actions) |

**Warmup resume date (X): 2026-04-26**
- Re-enable x-posts.yml: remove `if: false` from workflow
- `npm run cooldown:clear` + push

---

## Cooldown Management

```bash
npm run cooldown:status                          # Check if posting is paused
npm run cooldown:clear                           # Resume posting + push to GitHub
```

To pause posting (stops BOTH local and GitHub Actions):
```bash
npm run cooldown:set 2026-04-26 "X warmup resume"
git add output/posting-cooldown.json && git commit -m "cooldown: active" && git push
```

**Important:** Always push after setting a cooldown — GitHub Actions ignores a local-only cooldown file.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm run daily` fails | Check if `output/queue/` exists. First run: `npm run generate:prompts -- --save` |
| Captions say "using default" | Groq rate limited. Wait 60s and rerun, or check GROQ_API_KEY in .env |
| `npm run post:x` gives 402 | X credits depleted. Buy more at console.x.com |
| `npm run post:x` gives 429 | Rate limited. Wait 15 min and retry |
| Images not importing | Check files are in `output/raw/<subfolder>/` and are .png or .jpg |
| Wrong category detected | Use correct folder name — folder → category mapping is in import-raw.mjs |
| Want to redo captions | `npm run generate:captions -- --force` |
| Want to post 1 specific item | `npm run post:x -- --id 2026-03-29-maze-ocean-00` |
| Cloudinary upload fails | Check CLOUDINARY_* keys in .env. Media still works locally. |
| 4 AM posting didn't happen | Check GitHub Actions tab → post-media.yml. Did you push queue first? |
| Actions posting fails | Check GitHub Secrets — may have expired token (Pinterest/YouTube) |
| X text posts not dripping | Check GitHub Actions tab → x-posts.yml logs |
| Queue JSON not on GitHub | Run `git add output/queue/ && git commit && git push` |
| Vertex key expired / 403 | Check console.cloud.google.com — 90-day trial |
| Story VO not playing | Check OPENAI_API_KEY in .env. Or switch to Edge TTS (free): `--tts edge` |
| Activity video skips all items | Only maze/matching/quiz/tracing/dottodot are eligible |
| YouTube post fails | Re-run `node scripts/get-youtube-token.mjs` if refresh token expired |
| ASMR Remotion fails | Confirm `blank.png` + `colored.png` exist in the asmr folder |
| ASMR FFmpeg fails | Confirm `blank.png` + `colored.png` exist AND FFmpeg is on PATH |
| Story video not generating | Confirm `01.png` through `07.png` all exist in the story folder |
| Remotion bundle takes 60s | Normal on first run — cached for subsequent renders in same process |
| Output log shows 0 images | Archive is done by npm run daily — if you haven't archived yet, count is 0 |
| Series name not in prompts | Series tags are Mon/Wed/Fri only. Other days: none (by design) |
| Intelligence pools empty | First live Monday run still needed. Run `npm run intelligence:full` |
| ASMR Remotion: missing images | Drop blank.png + colored.png into output/asmr/[folder]/ first |

---

## Manual Extras (any time)

```bash
# Extra story idea
npm run generate:story:idea
npm run generate:story:ideas -- --theme "lost penguin"

# Extra ASMR brief
npm run generate:asmr:brief
npm run generate:asmr:brief -- --type maze

# Force analytics run
npm run analytics

# Weekly scorecard
npm run scorecard

# Manual X text generation
npm run x:generate
npm run x:generate:dry

# Manually track today's output
npm run output:track

# View Phase 0 gate history
npm run output:report

# Full pipeline health check
npm run health-check

# Trigger Actions workflows manually
# → Go to github.com/drmetwally/joymaze-content → Actions tab → pick workflow → Run workflow
```

---

## Weekly Routine (Monday — 15 min)

Monday's `npm run daily` + GitHub Actions automatically:
1. Refreshes Pinterest OAuth token (cloud)
2. Runs analytics + weekly scorecard → `config/performance-weights.json`
3. Collects fresh trends → `config/trends-this-week.json`
4. Runs intelligence refresh → `config/content-intelligence.json`
5. Applies intelligence → updates 4 dynamic pool files
6. Today's prompts use all fresh data (themes, hooks, CTAs, facts)
7. Carousel activity selection biased toward analytics top performer

**Monday caption audit (10 min):**
Open 5 random files from `output/archive/`. Read `rawCaption` for pinterest and instagram. Score 1–5:
1. Does the first line stop the scroll?
2. Is there a specific number, name, or sensory detail?
3. Does every sentence pass the "So What?" test?
4. Does the last line land as a feeling?
5. Would a parent save or share this?

**Score ≤3 → flag in TASKS.md. That template needs fixing.**

---

## GitHub Actions — Manual Triggers

Go to: `github.com/drmetwally/joymaze-content` → **Actions** tab

| Workflow | When to trigger manually |
|----------|--------------------------|
| X Text Posts | Test X posting anytime |
| Post Media | Force a posting run before 4 AM |
| Weekly Maintenance | Force intelligence refresh |

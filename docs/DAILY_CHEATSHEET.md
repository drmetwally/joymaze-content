# JoyMaze Daily Production Cheatsheet

> Print this. Follow it top to bottom. Every day. No thinking needed.

---

## Architecture — What Runs Where

| Layer | What it does | Needs PC on? |
|-------|-------------|--------------|
| **Local — you** | Generate images in Gemini, import, caption | Yes |
| **Local — Task Scheduler** | 9 AM daily generation (prompts, briefs, X posts) | Yes (at 9 AM) |
| **GitHub Actions — hourly** | X text post drip (generate if needed + post due entries) | No |
| **GitHub Actions — 4 AM Cairo** | Post all pending media to Pinterest/YouTube/X/TikTok | No |
| **GitHub Actions — Monday 7 AM** | Pinterest token refresh + intelligence + trends | No |

**Key rule:** After you import and caption content, you must `git push` before going to sleep. GitHub Actions reads the queue from the repo — if you don't push, it can't post at 4 AM.

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

---

## Before You Start

Open a terminal in `D:\Joymaze-Content\`

---

## STEP 1 — Clean Yesterday + Get Today's Prompts (2 min)

```bash
npm run daily
```

This does automatically:
1. Archives yesterday's queue to `output/archive/`
2. Generates 10 fresh AI image prompts → `output/prompts/`
3. Generates today's X text posts (4 posts, staggered hourly)
4. Generates ASMR brief → `output/asmr/`
5. Generates story idea → `output/stories/`

**Open `output/prompts/prompts-YYYY-MM-DD.md` and read today's prompts before continuing.**

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

> These go into their own folder, NOT output/raw/

1. Open: `output/asmr/[type]-[theme]/brief.md`
2. Generate in Gemini:
   - **Image 1:** blank/empty activity
   - **Image 2:** completed version
3. Save:
   ```
   output/asmr/[type]-[theme]/blank.png      ← blank/empty
   output/asmr/[type]-[theme]/colored.png    ← completed/solved
   ```
   *(For mazes: `maze.png` and `solved.png`)*

### 2D — Story Video Images (7 images, optional)

> These go into their own folder, NOT output/raw/

1. Open: `output/stories/epNN-[title]/image-prompts.md`
2. Generate each of the 7 slide images in Gemini
3. Save as `01.png` through `07.png`

---

## STEP 3 — Assemble ASMR Video (1 min)

```bash
npm run generate:asmr -- --asmr coloring-ocean-animals
```
Replace with your folder name from `output/asmr/`.

---

## STEP 4 — Assemble Story Video (optional, 1 min)

```bash
# Free (Edge TTS):
npm run generate:story:edge -- --story ep04-the-starlight-weaver

# Better voice (~$0.01):
npm run generate:story:openai -- --story ep04-the-starlight-weaver
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
- Resizes cleanly for each platform (no blur, no cropping of printables):
  - Pinterest: 1000×1500 portrait
  - Instagram: 1080×1350 portrait (4:5)
  - X: 1080×1350 portrait (4:5)
  - TikTok: 1080×1920 portrait (9:16, white-padded so printable is never cropped)
- Assigns `scheduledHour` (spread 6 AM–9 PM)
- Uploads all variants to Cloudinary (for 4 AM cloud posting)
- Creates queue metadata in `output/queue/`
- **If any images have carousel sidecar JSONs → also creates a carousel queue file** (see Carousel section below)

**Check:** 10 items processed, ~40 platform-sized images in `output/images/`

### Carousel Posts (Instagram + TikTok)

**Fully automatic — no manual steps.** Carousels rotate on a 9-day cycle — one format every ~3 days. Check the bottom of today's prompts file for instructions.

**3 formats, all zero-friction:**

| Format | Trigger | Slides | Folder prefix |
|--------|---------|--------|---------------|
| **1 — Activity Collection** | `doy%9===0` | 5 activity images | `carousel-{theme}-{date}/` |
| **2 — Educational Facts** | `doy%9===3` | 5 (hook + 4 brain-benefit facts) | `facts-carousel-{activity}-{date}/` |
| **3 — Activity Progression** | `doy%9===6` | 3 (blank → half → done) | `progress-carousel-{activity}-{date}/` |

**Your only action on carousel day:**
1. Check the `## CAROUSEL DAY` block at the bottom of the prompts file
2. Create the folder it specifies inside `output/raw/`
3. Drop your images in, named `01-xxx.png`, `02-xxx.png`, etc.
4. Run `npm run import:raw` — carousel queue file built automatically

Notes:
- `import-raw.mjs` detects `carousel-*`, `facts-carousel-*`, and `progress-carousel-*` subfolders
- Files sorted alphabetically = slide order
- **Format 2** (Facts): prompts file includes the exact fact copy for each slide — just make Gemini render it as an infographic card
- **Format 3** (Progression): generate all 3 slides in the **same Gemini chat** for visual consistency
- **The 5 inspiration slot images** always go in their normal category subfolders, not the carousel folder

**Self-learning (automatic — no action needed):**
- Activity type is picked by analytics (Pinterest save-rate winner among 5 activity types)
- Falls back to day-of-year rotation until 5+ posts have impressions
- Format 2: dynamic `did-you-know` facts from the intelligence pool replace the last 1-2 slides when keyword-matched
- Format 3: trend `boost_themes` override analytics ranking when a trending topic overlaps an activity type
- The `intelligenceSignal` field in `carousel-plan-{date}.json` shows what drove the pick: `analytics-ranked` / `trend-boost` / `doy-rotation`
- Slide descriptions scored by Groq at generation time — score table logged to console (PASS/WEAK/FLAG)

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
| 1 | Archive + generate all briefs | 2 min | `npm run daily` |
| 2A | Inspiration images (5) | 10–15 min | Gemini → `output/raw/<slot>/` |
| 2B | Activity puzzle images (5) | 15–20 min | Gemini → `output/raw/<type>/` |
| 2C | ASMR images (2) | 5 min | Gemini → `output/asmr/[folder]/` |
| 2D | Story slides (7, optional) | 10 min | Gemini → `output/stories/[folder]/` |
| 3 | Assemble ASMR video | 1 min | `npm run generate:asmr -- --asmr [folder]` |
| 4 | Assemble story video (optional) | 1 min | `npm run generate:story:edge -- --story [folder]` |
| 5 | Activity puzzle videos | 1 min | `npm run generate:activity:video` |
| 6 | Import + brand images | 1 min | `npm run import:raw` |
| 7 | AI captions | 2–3 min | `npm run generate:captions` |
| 8 | Push queue to GitHub ⚠️ | 1 min | `git add output/queue/ && git commit -m "queue: date" && git push` |
| 9 | Done — cloud posts at 4 AM | auto | GitHub Actions |

**Total active time: ~40–45 min/day**

---

## Anti-Spam Rules (ALL platforms)

- **No bulk posting** — hourly drip only, max 2 creative posts per hour
- **X captions:** 0 hashtags, no brand name ("JoyMaze"), soft CTAs only
- **All platforms:** No hard-sell CTAs, no identical captions across days
- **X text posts:** 4/day max, staggered hourly

---

## Cooldown Management

```bash
npm run cooldown:status                          # Check if posting is paused
npm run cooldown:clear                           # Resume posting + push to GitHub
```

To pause posting (stops BOTH local and GitHub Actions):
```bash
npm run cooldown:set 2026-04-12 "shadowban recovery"
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
| No "FREE Printable" badge | File must be in activity folder (maze/, wordsearch/, etc.) |
| Cloudinary upload fails | Check CLOUDINARY_* keys in .env. Media still works locally. |
| 4 AM posting didn't happen | Check GitHub Actions tab → post-media.yml. Did you push queue first? |
| Actions posting fails | Check GitHub Secrets — may have expired token (Pinterest/YouTube) |
| X text posts not dripping | Check GitHub Actions tab → x-posts.yml logs. Also check local Task Scheduler as backup. |
| Queue JSON not on GitHub | Run `git add output/queue/ && git commit && git push` |
| Vertex key expired / 403 | Check console.cloud.google.com — 90-day trial |
| Story VO not playing | Check OPENAI_API_KEY in .env. Or switch to Edge TTS (free): `--tts edge` |
| Activity video skips all items | Only maze/matching/quiz/tracing/dottodot are eligible |
| YouTube post fails | Re-run `node scripts/get-youtube-token.mjs` if refresh token expired |
| Story narration out of sync | Try `--speed 0.85` to slow VO |
| ASMR video not generating | Confirm `blank.png` and `colored.png` exist in the asmr folder |
| Story video not generating | Confirm `01.png` through `07.png` all exist in the story folder |

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

# Trigger Actions workflows manually
# → Go to github.com/drmetwally/joymaze-content → Actions tab → pick workflow → Run workflow
```

---

## Weekly Routine (Monday — 15 min)

Monday's `npm run daily` + GitHub Actions automatically:
1. Refreshes Pinterest OAuth token (cloud)
2. Runs analytics + weekly scorecard (local)
3. Collects fresh trends — Google Trends, Pinterest (cloud)
4. Runs intelligence refresh → updates dynamic theme/hook/CTA pools (cloud, committed back)
5. Applies intelligence → today's prompts use fresh data

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

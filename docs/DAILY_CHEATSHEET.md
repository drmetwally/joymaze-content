# JoyMaze Daily Production Cheatsheet

> Print this. Follow it top to bottom. Every day. No thinking needed.

---

## How Posting Works (Architecture)

Two Windows Task Scheduler jobs run every hour automatically:

| Job | Script | Time |
|-----|--------|------|
| Creative posts | `post-content.mjs --scheduled --limit 2` | Every hour from 6 AM |
| X text posts | `post-x-scheduled.mjs` | Every hour from 7 AM |

**You never manually post.** Your job is to generate content, import it, and caption it. The scheduler drips it throughout the day.

**Cooldown check:** If `output/posting-cooldown.json` exists and today is before the `until` date, all posting pauses automatically. Clear with `npm run cooldown:clear`.

---

## Automated Morning Generation (9:00 AM Riyadh — runs while you sleep)

The daily scheduler runs at 9 AM and prepares everything before you open your laptop.

**One-time setup** (run once, keep terminal open or register via Task Scheduler):
```bash
node scripts/daily-scheduler.mjs
```

**To trigger immediately (test / manual):**
```bash
npm run scheduler:now
```

By 9 AM, ready for you:
- `output/prompts/` — today's image prompts (5 inspiration + 5 activity)
- `output/queue/x-text-YYYY-MM-DD.json` — 4 X text posts queued with hourly schedule
- `output/stories/` — story idea scaffold (if --with-story)
- `output/asmr/` — ASMR brief (if --with-asmr)

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
2. Generates 10 fresh AI image prompts saved to `output/prompts/`
3. Generates today's X text posts (4 posts, staggered hourly)
4. Generates ASMR brief → `output/asmr/`
5. Generates story idea → `output/stories/`

**Open `output/prompts/prompts-YYYY-MM-DD.md` and read today's prompts before continuing.**

---

## STEP 2 — Generate ALL Images (30-40 min total)

Open Gemini. Keep it open. Generate everything in one sitting.

---

### 2A — Inspiration Post Images (5 images) — Gemini

Copy each inspiration prompt (items 1–5) from the prompts file into Gemini.
Save to the matching subfolder:

| Slot | Folder | What to generate |
|------|--------|-----------------|
| Fact Card | `output/raw/fact-card/` | Bold educational poster + stat overlay |
| Challenge | `output/raw/challenge/` | Child at peak engagement with a printable activity |
| Quiet Moment | `output/raw/quiet/` | Child absorbed in activity, no screens, warm light |
| Printable Tease | `output/raw/printable/` | Beautiful flat-lay close-up of printed activity sheet |
| Identity | `output/raw/identity/` | Parent identity scene or bold text design |

**Naming:** `fact-dinosaurs.png`, `challenge-ocean.png`, `quiet-rainy-day.png`, `printable-matching.png`, `identity-screen-free.png`

---

### 2B — Activity Post Images (5 images) — Gemini

Copy each activity prompt (items 6–10) from the prompts file into Gemini.
Iterate until the puzzle looks correct and usable.

Save to the matching subfolder:

| Type | Folder | Name pattern | Example |
|------|--------|-------------|---------|
| Maze | `output/raw/maze/` | `maze-{theme}.png` | `maze-dinosaur.png` |
| Word Search | `output/raw/wordsearch/` | `wordsearch-{theme}.png` | `wordsearch-jungle.png` |
| Matching | `output/raw/matching/` | `matching-{theme}.png` | `matching-vehicles.png` |
| Tracing | `output/raw/tracing/` | `tracing-{theme}.png` | `tracing-butterfly.png` |
| Quiz | `output/raw/quiz/` | `quiz-{theme}.png` | `quiz-arctic.png` |
| Coloring | `output/raw/coloring/` | `coloring-{theme}.png` | `coloring-ocean.png` |
| Dot-to-Dot | `output/raw/dottodot/` | `dottodot-{theme}.png` | `dottodot-rocket.png` |
| Sudoku | `output/raw/sudoku/` | `sudoku-{theme}.png` | `sudoku-easy.png` |

---

### 2C — ASMR Video Images (2 images) — Gemini

> These go into their own folder, NOT output/raw/

1. Open today's brief: `output/asmr/[type]-[theme]/brief.md`
   It tells you exactly what to generate. Only **2 images needed**.

2. Generate in Gemini:
   - **Image 1:** blank/empty activity (blank coloring page, empty maze, etc.)
   - **Image 2:** completed version (fully colored, solved maze, etc.)

3. Save:
   ```
   output/asmr/[type]-[theme]/blank.png     ← blank/empty
   output/asmr/[type]-[theme]/colored.png   ← completed/solved
   ```
   *(For mazes: `maze.png` and `solved.png`)*

---

### 2D — Story Video Images (7 images) — Gemini (optional)

> These go into their own folder, NOT output/raw/

1. Open: `output/stories/epNN-[title]/image-prompts.md`
2. Generate each of the 7 slide images in Gemini
3. Save as numbered files: `01.png` through `07.png`

---

## STEP 3 — Assemble ASMR Video (1 min)

```bash
npm run generate:asmr -- --asmr coloring-ocean-animals
```
Replace with your folder name from `output/asmr/`.

**Output:** Video in `output/videos/`

---

## STEP 4 — Assemble Story Video (optional, 1 min)

```bash
# Free (Edge TTS):
npm run generate:story:edge -- --story ep04-the-starlight-weaver

# Better voice (~$0.01, OpenAI TTS):
npm run generate:story:openai -- --story ep04-the-starlight-weaver

# Slow down if rushed:
npm run generate:story:openai -- --story ep04-the-starlight-weaver --speed 0.85
```

---

## STEP 4B — Generate Activity Puzzle Videos (1 min)

```bash
npm run generate:activity:video
```

Converts maze, matching, quiz, tracing, and dot-to-dot images into 15-second YouTube Shorts.
Skips coloring (no puzzle element). Output: `output/videos/*-yt-short.mp4`

---

## STEP 5 — Import + Brand Images (1 min)

```bash
npm run import:raw
```

Takes everything in `output/raw/` and:
- Adds JoyMaze logo watermark
- Adds **"FREE Printable" badge** on activity posts
- Adds Halbert-style hook text overlay
- Resizes for each platform
- Assigns `scheduledHour` (spread 6 AM–9 PM)
- Creates queue metadata in `output/queue/`

**Check:** 10 items processed, ~40 platform-sized images in `output/images/`

---

## STEP 6 — Generate Captions (2-3 min)

```bash
npm run generate:captions
```

AI writes platform-specific captions for all image posts.
**Rules enforced:** Soft CTAs only, no brand name on X, 0 hashtags on X.

---

## STEP 7 — Done. Hourly runner handles the rest.

No manual posting needed. The Task Scheduler drips content from 6 AM onward, max 2 per hour, respecting each item's `scheduledHour`.

**To verify the queue:**
```bash
npm run calendar
```

**To dry-run posting (no actual posts):**
```bash
npm run post:scheduled:dry
```

---

## Daily Summary

| Step | What | Time | Command |
|------|------|------|---------|
| 1 | Archive + generate all briefs | 2 min | `npm run daily` |
| 2A | Inspiration images (5) | 10-15 min | Gemini → `output/raw/<slot>/` |
| 2B | Activity puzzle images (5) | 15-20 min | Gemini → `output/raw/<type>/` |
| 2C | ASMR images (2) | 5 min | Gemini → `output/asmr/[folder]/` |
| 2D | Story slides (7, optional) | 10 min | Gemini → `output/stories/[folder]/` |
| 3 | Assemble ASMR video | 1 min | `npm run generate:asmr -- --asmr [folder]` |
| 4 | Assemble story video (optional) | 1 min | `npm run generate:story:edge -- --story [folder]` |
| 4B | Activity puzzle videos | 1 min | `npm run generate:activity:video` |
| 5 | Import + brand images | 1 min | `npm run import:raw` |
| 6 | AI captions | 2-3 min | `npm run generate:captions` |
| 7 | Done — hourly runner posts | auto | Task Scheduler (6 AM onward) |

**Total active time: ~40-45 min/day**
**Auto-posted hourly:** Pinterest, TikTok, YouTube, X images (max 2/hour, respects scheduledHour)

---

## Anti-Spam Rules (ALL platforms — post-shadowban 2026-04-09)

- **No bulk posting** — hourly drip only, max 2 creative posts per hour
- **X captions:** 0 hashtags, no brand name ("JoyMaze"), soft CTAs only ("link in bio")
- **All platforms:** No hard-sell CTAs, no identical captions across days
- **X text posts:** 4/day max (down from 8), staggered hourly

---

## Cooldown Management

```bash
npm run cooldown:status     # Check if posting is paused
npm run cooldown:clear      # Resume posting immediately
```

To pause posting (e.g., shadowban recovery):
```bash
echo '{"until":"2026-04-12","reason":"shadowban recovery"}' > output/posting-cooldown.json
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm run daily` fails | Check if `output/queue/` exists. First run? `npm run generate:prompts -- --save` |
| Captions say "using default" | Groq rate limited. Wait 60s and rerun, or check GROQ_API_KEY in .env |
| `npm run post:x` gives 402 | X credits depleted. Buy more at console.x.com |
| `npm run post:x` gives 429 | Rate limited. Wait 15 min and retry |
| Images not importing | Check files are in `output/raw/<subfolder>/` and are .png or .jpg |
| Wrong category detected | Use correct folder name — folder → category mapping is in import-raw.mjs |
| Want to redo captions | `npm run generate:captions -- --force` |
| Want to post 1 specific item | `npm run post:x -- --id 2026-03-29-maze-ocean-00` |
| Hourly runner not posting | Check cooldown: `npm run cooldown:status`. Check Task Scheduler jobs exist. |
| X text posts not dripping | Check "JoyMaze Hourly X Text Post" in Task Scheduler — runs every hour from 7 AM |
| Creative posts not dripping | Check "JoyMaze Hourly Creative Post" in Task Scheduler — runs every hour from 6 AM |
| No "FREE Printable" badge | File must be in activity folder (maze/, wordsearch/, etc.) |
| Vertex stories fail | Safety filter or prompt issue. Rerun or generate manually in Gemini |
| Vertex key expired / 403 | Check console.cloud.google.com — 90-day trial |
| Story VO not playing | Check OPENAI_API_KEY in .env. Or switch to Edge TTS (free) |
| Activity video skips all items | Only maze/matching/quiz/tracing/dottodot are eligible for puzzle video |
| YouTube post fails | Re-run `node scripts/get-youtube-token.mjs` if YOUTUBE_REFRESH_TOKEN expired |
| Story narration out of sync | Try `--speed 0.85` to slow VO |
| ASMR video not generating | Confirm `blank.png` and `colored.png` exist in the asmr folder |
| Story video not generating | Confirm `01.png` through `07.png` all exist in the story folder |
| Not sure of folder name | Run `ls output/asmr/` or `ls output/stories/` |
| Hook text not showing | File must be in correct category subfolder under output/raw/ |
| Want images without hooks | `npm run import:raw -- --no-hooks` |

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

# X text post generation (manual)
npm run x:generate
npm run x:generate:dry
```

---

## Weekly Routine (Monday — 15 min)

Monday's `npm run daily` automatically:
1. Refreshes Pinterest OAuth token
2. Runs analytics + weekly scorecard
3. Collects fresh trends (Google Trends, Pinterest)
4. Runs intelligence refresh → updates dynamic theme/hook/CTA pools
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

## File Locations

| What | Where |
|------|-------|
| Inspiration images (you save here) | `output/raw/fact-card/`, `challenge/`, `quiet/`, `printable/`, `identity/` |
| Activity puzzle images (you save here) | `output/raw/maze/`, `wordsearch/`, `matching/`, `tracing/`, `quiz/`, `coloring/`, `dottodot/`, `sudoku/` |
| ASMR images (you save here) | `output/asmr/[folder]/` |
| Story video slides (you save here) | `output/stories/[folder]/` |
| Branded post images (auto) | `output/images/` |
| Videos (auto) | `output/videos/` |
| Queue metadata | `output/queue/` |
| Today's prompts | `output/prompts/` |
| Archive | `output/archive/` |
| Posting cooldown | `output/posting-cooldown.json` |
| Scheduler state | `output/scheduler-state.json` |
| API keys | `.env` |
| Style guide | `config/writing-style.md` |

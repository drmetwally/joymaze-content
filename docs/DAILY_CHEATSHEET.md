# JoyMaze Daily Production Cheatsheet

> Follow top to bottom. Every day.

Last updated: 2026-04-16

---

## Quick Summary

| Step | What | Time | Command |
|------|------|------|---------|
| 1 | Archive yesterday + generate today's briefs | 2 min | `npm run daily` |
| 2A | Inspiration images (5) | 10–15 min | Gemini → `output/raw/<slot>/` |
| 2B | Activity puzzle images (5) | 15–20 min | Gemini → `output/raw/<type>/` |
| 2C | ASMR images (2) | 5 min | Gemini → `output/asmr/[folder]/` |
| 2D | Challenge image (1) | 2 min | Gemini → `output/challenge/[folder]/puzzle.png` |
| 2E | Story slides (7, optional) | 10 min | Gemini → `output/stories/[folder]/` |
| 3 | ASMR video | 1–2 min | Coloring: 1 cmd · Maze/Wordsearch/Dot-to-dot: 2 cmds |
| 3B | Challenge video | 1 min | `npm run animate:challenge` |
| 4 | Story video (optional) | 1 min | `npm run generate:story:remotion` |
| 5 | Import + brand images | 1 min | `npm run import:raw` |
| 6 | Activity puzzle videos | 1 min | `npm run generate:activity:video` (runs after import) |
| 7 | AI captions | 2–3 min | `npm run generate:captions` |
| 8 | Push queue ⚠️ | 1 min | `git add output/queue/ && git commit -m "queue: date" && git push` |

**Total: ~42–48 min/day**

---

## Before You Start

```bash
npm run health-check     # API keys, config, queue state
npm run status           # X queue + cooldown
npm run output:report    # Phase 0 gate — last 7 days
```

---

## STEP 1 — Clean + Plan (2 min)

```bash
npm run daily
```

Automatically:
1. Archives yesterday's queue → `output/archive/YYYY-MM-DD/`
2. Tracks today's output count (Phase 0 gate)
3. Generates 10 image prompts → `output/prompts/prompts-YYYY-MM-DD.md`
4. Generates story idea → `output/stories/`
5. Generates ASMR brief → `output/asmr/` (rotation: coloring → maze → coloring → wordsearch → dotdot → maze)
6. Generates challenge brief → `output/challenge/`
7. Generates 4 X text posts → `output/queue/x-text-YYYY-MM-DD.json`
8. **Monday only:** collects trends, runs intelligence refresh, updates all 5 dynamic pools

**Check:** Open `output/prompts/prompts-YYYY-MM-DD.md`

**Series days:** Mon = Maze Monday · Wed = Puzzle Power Wednesday · Fri = Fine Motor Friday (auto-injected into prompts)

---

## STEP 2 — Generate Images in Gemini (30–40 min)

### 2A — Inspiration Images (5)

| Slot | Folder | What to generate |
|------|--------|-----------------|
| Fact Card | `output/raw/fact-card/` | Bold educational poster + stat overlay |
| Challenge | `output/raw/challenge/` | Child engaged with a printable activity |
| Quiet Moment | `output/raw/quiet/` | Child absorbed in activity, warm light |
| Printable Tease | `output/raw/printable/` | Flat-lay close-up of a printed activity sheet |
| Identity | `output/raw/identity/` | Parent identity scene or bold text design |

Naming: `fact-dinosaurs.png`, `challenge-ocean.png`, `quiet-rainy-day.png`, etc.

### 2B — Activity Puzzle Images (5)

| Type | Folder | Name pattern |
|------|--------|-------------|
| Maze | `output/raw/maze/` | `maze-{theme}.png` |
| Word Search | `output/raw/wordsearch/` | `wordsearch-{theme}.png` |
| Matching | `output/raw/matching/` | `matching-{theme}.png` |
| Tracing | `output/raw/tracing/` | `tracing-{theme}.png` |
| Coloring | `output/raw/coloring/` | `coloring-{theme}.png` |
| Dot-to-Dot | `output/raw/dottodot/` | `dottodot-{theme}.png` |

### 2C — ASMR Images (2)

1. Open `output/asmr/[type]-[theme]/brief.md`
2. Generate **both images in the same Gemini chat** for visual consistency:

| Type | blank.png | solved.png |
|------|-----------|-----------|
| Coloring | Empty line art, white background | Fully colored version |
| Maze | Empty maze | Same maze with solution path drawn |
| Word Search | Grid, no highlights | Same grid with words highlighted in color |
| Dot-to-Dot | Numbered dots, no connecting lines | Clean connected line art of the subject |

> Dot-to-dot tip: for purchased assets, copy your existing blank/solved pair directly — no Gemini needed.

3. Save to `output/asmr/[type]-[theme]/blank.png` + `solved.png`

### 2D — Challenge Image (1)

1. Open `output/challenge/[type]-[theme]/brief.md`
2. Generate one puzzle image (blank/unsolved, no answers)
3. Save to `output/challenge/[type]-[theme]/puzzle.png`

### 2E — Story Slides (7, optional)

1. Open `output/stories/epNN-[title]/image-prompts.md`
2. Generate each slide in Gemini (same chat)
3. Save as `01.png` through `07.png` in the story folder

### Carousel Days

Carousels are automatic via `import:raw` — no extra commands.

Check the **CAROUSEL DAY block at the bottom of the prompts file** (appears every ~3 days). It tells you:
- What folder to create inside `output/raw/`
- What images to generate, named `01-xxx.png`, `02-xxx.png`, etc.

That's it. Run `import:raw` as normal — it detects and builds the carousel queue automatically.

---

## STEP 3 — ASMR Video (1–2 min)

**Coloring — 1 step:**
```bash
npm run animate:asmr -- --asmr output/asmr/[folder]/
```

**Maze, Word Search, Dot-to-Dot — 2 steps (extract first, then animate):**
```bash
# Maze:
npm run extract:path -- --asmr output/asmr/[folder]/
npm run animate:asmr -- --asmr output/asmr/[folder]/

# Word Search:
npm run extract:wordsearch -- --asmr output/asmr/[folder]/
npm run animate:asmr -- --asmr output/asmr/[folder]/

# Dot-to-Dot:
npm run extract:dotdot -- --asmr output/asmr/[folder]/
npm run animate:asmr -- --asmr output/asmr/[folder]/
```

The extract step creates a data file (`path.json` / `wordsearch.json` / `dots.json`) that drives the animation. Without it, the animation falls back to a plain wipe.

**Check extract output:**
- Maze: `Raw path length: NNN pixels` — expect > 50
- Word search: word count in log — expect 6–8
- Dot-to-dot: `Detected dots: N` — expect 20–70. If low, lower `DARK_THRESH` in extract-dotdot-path.mjs

**Dry-run (verify props without rendering):**
```bash
npm run animate:asmr:dry -- --asmr output/asmr/[folder]/
```

**Seamless loop:** Last 2s of every video, blank image fades back in → invisible platform loop. Built-in, no action needed.

---

## STEP 3B — Challenge Video (1 min)

```bash
npm run animate:challenge -- --challenge output/challenge/[folder]/
```

**Dry-run:**
```bash
npm run animate:challenge:dry -- --challenge output/challenge/[folder]/
```

---

## STEP 4 — Story Video (optional, 1 min)

```bash
npm run generate:story:remotion -- --story epNN-[title]
```

Other options:
```bash
npm run generate:story:edge   -- --story epNN-[title]   # free, Edge TTS
npm run generate:story:openai -- --story epNN-[title]   # ~$0.01, better voice
```

---

## STEP 5 — Import + Brand Images (1 min)

```bash
npm run import:raw
```

- Adds JoyMaze logo, resizes for all platforms
- Assigns `scheduledHour` (spread 6 AM–9 PM)
- Uploads to Cloudinary
- Creates queue metadata in `output/queue/`
- Detects `carousel-*` / `facts-carousel-*` / `progress-carousel-*` subfolders → builds carousel queue

**Check:** 10 items processed, ~40 images in `output/images/`

---

## STEP 6 — Activity Puzzle Videos (1 min)

> Run AFTER `import:raw` — reads from the queue.

```bash
npm run generate:activity:video
```

Eligible types: maze, matching, tracing, dot-to-dot. Creates 15-second YouTube Shorts in `output/videos/`.

---

## STEP 7 — AI Captions (2–3 min)

```bash
npm run generate:captions
```

---

## STEP 8 — Push Queue to GitHub

**Push is required** — YouTube is live and posts at 4 AM Cairo via GitHub Actions. If you don't push, nothing posts.

```bash
git add output/queue/
git commit -m "queue: $(date +%Y-%m-%d)"
git push
```

> X text posts are generated and queued but **won't fire until you add API credits** at console.x.com. Queue them now — they'll post automatically once credits are loaded.

---

## Manual Posting (X warmup)

```bash
npm run brief
# → opens output/daily-brief-YYYY-MM-DD.html
# All captions, hashtags, and X text posts in one page — copy-paste to post manually
```

---

## STEP 9 — Done. Cloud handles the rest.

- **Hourly:** X text posts drip throughout the day
- **4:00 AM Cairo:** All pending media posts to active platforms
- **PC can be off**

```bash
npm run calendar         # View queue
npm run post:scheduled:dry   # Dry-run posting locally
```

---

## Platform Status

| Platform | Account | Status | Posting |
|----------|---------|--------|---------|
| X | @playjoymaze | Active — no API credits | Posts queued, won't fire until credits added at console.x.com |
| Pinterest | joymaze.pp@gmail.com | New — no API keys yet | Paused |
| Instagram | joymaze.pp@gmail.com | New — no API keys yet | Paused |
| TikTok | joymaze.pp@gmail.com | New — no API keys yet | Paused |
| YouTube | joymaze.pp@gmail.com | Live | Active (4 AM Actions) |

**To resume X posting:** Add credits at console.x.com — no code changes needed, queued posts will fire automatically.

---

## Phase 0 Gate

**Target:** 30 consecutive days ≥ 10 images + 1 story video + 1 ASMR video + 4 X text posts

```bash
npm run output:report    # Last 7 days + streak
npm run output:track     # Manual log (auto-runs in npm run daily)

# Log a day you posted manually (files not on this machine):
node scripts/track-output.mjs --backfill 2026-04-15 --images 10 --x 4
node scripts/track-output.mjs --backfill 2026-04-15 --images 10 --story 1 --asmr 1 --x 4 --note "Pinterest only"
```

**Phases:**
- Phase 0 → 1: 30 consecutive gate days
- Phase 1 → 2: Pinterest 75K+ impressions/mo AND installs ≥100/mo or KDP ≥20 units/mo
- Phase 2 → 3: Installs ≥1,000/mo OR KDP ≥150 units/mo × 2 months

---

## Anti-Spam Rules

- **X:** 0 hashtags, no "JoyMaze", soft CTAs only, 4 text posts/day max
- **All platforms:** No bulk posting, no identical captions across days

---

## Cooldown Management

```bash
npm run cooldown:status
npm run cooldown:clear           # Resume + push
npm run cooldown:set 2026-04-26 "X warmup resume"
git add output/posting-cooldown.json && git commit -m "cooldown: active" && git push
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm run daily` fails | Check `output/queue/` exists. First run: `npm run generate:prompts -- --save` |
| Captions say "using default" | Groq rate limited — wait 60s and rerun |
| `npm run post:x` gives 402 | X credits depleted — buy at console.x.com |
| `npm run post:x` gives 429 | Rate limited — wait 15 min |
| Images not importing | Files must be in `output/raw/<subfolder>/` as .png or .jpg |
| Want to redo captions | `npm run generate:captions -- --force` |
| Cloudinary upload fails | Check CLOUDINARY_* keys in .env |
| 4 AM posting didn't happen | Check post-media.yml in Actions tab. Did you push queue? |
| post-media exits code 128 | Already fixed (2026-04-16) — was bash glob on empty queue |
| Queue JSON not on GitHub | `git add output/queue/ && git commit && git push` |
| Activity video: no items found | Run `import:raw` first — activity video reads from the queue |
| Activity video skips all items | Only maze/matching/tracing/dottodot are eligible types |
| Vertex key expired / 403 | Check console.cloud.google.com — 90-day trial |
| ASMR images not found | Confirm `blank.png` + `solved.png` exist in `output/asmr/[folder]/` |
| ASMR maze: no path drawn | Run `extract:path` first — generates `path.json` |
| ASMR wordsearch: 0 word regions | Regenerate solved with bright highlight colors (yellow/orange/green) |
| ASMR dots: < 10 detected | Lower `DARK_THRESH` (try 130–150) in extract-dotdot-path.mjs |
| ASMR render fails with ENOSPC | `rm -rf /c/Users/BESOO/AppData/Local/Temp/remotion-webpack-bundle-*` |
| ProtocolError at ~93% | Non-fatal Chrome race condition — render still completes, ignore |
| Challenge video: image not found | Confirm `puzzle.png` in `output/challenge/[folder]/` |
| Story video not generating | Confirm `01.png` through `07.png` all exist in the story folder |
| Intelligence pools empty | Run `npm run intelligence:full` |
| YouTube token expired | `node scripts/get-youtube-token.mjs` |

---

## Manual Extras

```bash
npm run brief:asmr                          # Extra ASMR brief (auto-rotates type)
npm run brief:asmr:coloring / :maze / :wordsearch / :dotdot
npm run brief:challenge
npm run brief:challenge -- --type word-search
npm run generate:story:idea
npm run x:generate
npm run analytics
npm run scorecard
npm run health-check
npm run remotion:studio                     # Visual preview + scrubbing\nnpm run generate:longform                   # Plan long-form episode (episode.json)\nnpm run render:longform -- --episode ep01-slug  # Render ~8min video\nnpm run render:longform:dry -- --episode ep01-slug  # Dry-run (check props only)
```

---

## Monday Routine (15 min)

`npm run daily` on Monday automatically: refreshes Pinterest token (cloud), runs analytics + scorecard, refreshes trends, runs intelligence loop, updates all 5 dynamic pools.

**Caption audit (10 min):** Open 5 random files from `output/archive/`. For each caption score 1–5:
1. Does the first line stop the scroll?
2. Is there a specific number, name, or sensory detail?
3. Does every sentence pass the "So What?" test?
4. Does the last line land as a feeling?
5. Would a parent save or share this?

Score ≤ 3 → flag in TASKS.md.

---

## Appendix — How Everything Connects

```
MONDAY AUTOMATIC (npm run daily + GitHub Actions):
  collect-analytics.mjs    → output/analytics/YYYY-MM-DD.json
  weekly-scorecard.mjs     → config/performance-weights.json
  collect-trends.mjs       → config/trends-this-week.json
  intelligence-refresh.mjs → config/content-intelligence.json
  apply-intelligence.mjs   → 5 dynamic pools:
    config/theme-pool-dynamic.json
    config/hooks-library.json
    config/cta-library.json
    config/pattern-interrupt-dynamic.json
    config/x-post-topics-dynamic.json

DAILY (generate-prompts.mjs reads all of the above):
  themes     ← trending themes + analytics ranking
  hooks      ← hooks-library top performers
  facts      ← pattern-interrupt-dynamic
  carousel   ← analytics activityRanking
  series tag ← Mon/Wed/Fri names

POSTED CONTENT → collect-analytics.mjs (next Monday) → feeds back into rankings
```

**Where files live:**

| File type | Location | GitHub? | Cloudinary? |
|-----------|----------|---------|-------------|
| Prompts, briefs | `output/prompts/`, `output/asmr/`, `output/stories/` | No | No |
| Raw images | `output/raw/` | No | No |
| Branded images + videos | `output/images/`, `output/videos/` | No | Yes |
| Queue metadata | `output/queue/` | **Yes** | No |
| Config pools | `config/` | **Yes** | No |

**What runs where:**

| Layer | What | Needs PC? |
|-------|------|-----------|
| Local — you | Generate + import + caption | Yes |
| Local — npm run daily | 9 AM: prompts + briefs + tracking | Yes (at 9 AM) |
| GitHub Actions — hourly | X text post drip | No |
| GitHub Actions — 4 AM Cairo | Post all pending media | No |
| GitHub Actions — Monday 7 AM | Token refresh + intelligence | No |

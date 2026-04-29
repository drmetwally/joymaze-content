# JoyMaze Daily Production Cheatsheet

> Follow top to bottom. Every day.

Last updated: 2026-04-29

---

## Quick Summary

| Step | What | Time | Command |
|------|------|------|---------|
| 1 | Archive + briefs + Story Reel V2 auto-render | 3–5 min | `npm run daily` |
| 2A | Inspiration images (5) | 10–15 min | Gemini → `output/raw/<slot>/` |
| 2B | Activity puzzle images (remaining manual only) | 10–15 min | Gemini → `output/raw/<type>/` |
| 2C | ASMR images (2) | 5 min | Gemini → `output/asmr/[folder]/` |
| 2D | Challenge image (1) | 2 min | Gemini → `output/challenge/[folder]/puzzle.png` |
| 2E | Story slides (7, optional) | 10 min | Gemini → `output/stories/[folder]/` |
| 2F | Animal song: 6 Gemini images | 10 min | Gemini → `output/longform/animal/[folder]/` |
| 3 | ASMR video | 1–2 min | Coloring: 1 cmd · Maze/Wordsearch/Dot-to-dot: 2 cmds |
| 3B | Challenge video | 1 min | `npm run animate:challenge` |
| 3C | Story Reel V2 | **auto** | Auto-rendered by Step 1 — review `output/videos/` |
| 3D | Animal Song Short | 3 min | Drop Suno audio → narrate → render (see below) |
| 4 | Story video (optional longform) | 1 min | `npm run generate:story:remotion` |
| 5 | Import + brand images | 1 min | `npm run import:raw` |
| 6 | Activity puzzle videos | 1 min | `npm run generate:activity:video` (runs after import) |
| 7 | AI captions | 2–3 min | `npm run generate:captions` |
| 8 | Push queue ⚠️ | 1 min | `git add output/queue/ && git commit -m "queue: date" && git push` |

**Total: ~55–65 min/day**

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
4. Generates story idea → `output/stories/` (intelligence: trends + hooks + themes + virality contract)
5. **Generates Story Reel V2** → Imagen images + Remotion render → `output/videos/StoryReelV2-*.mp4` (skip with `--no-story-reel`)
6. Generates ASMR brief → `output/asmr/` (rotation: coloring → maze → coloring → wordsearch → dotdot → maze)
7. Generates challenge brief → `output/challenge/`
8. **Generates animal facts brief** → `output/longform/animal/` (intelligence: all 9 config files + virality contract) (skip with `--no-animal-brief`)
9. Generates 4 X text posts → `output/queue/x-text-YYYY-MM-DD.json`
10. **Generates deterministic puzzle image posts from the daily activity manifest** for supported slots (currently maze + word-search) → wrapped `post.png` + raw import assets
11. **Monday only:** collects trends, runs intelligence refresh, updates all 5 dynamic pools

**Check:** Open `output/prompts/prompts-YYYY-MM-DD.md` · Check `output/videos/` for new Story Reel V2 · Check `output/longform/animal/` for new animal brief

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

### 2B — Activity Puzzle Images (remaining manual only)

**Now automated by default after `npm run daily`:**
- Maze
- Word Search

Those two supported deterministic puzzle lanes are generated from `output/prompts/activity-manifest-YYYY-MM-DD.json` and exported into:
- `output/raw/maze/`
- `output/raw/wordsearch/`

**Still manual for now:**

| Type | Folder | Name pattern |
|------|--------|-------------|
| Matching | `output/raw/matching/` | `matching-{theme}.png` |
| Tracing | `output/raw/tracing/` | `tracing-{theme}.png` |
| Coloring | `output/raw/coloring/` | `coloring-{theme}.png` |
| Dot-to-Dot | `output/raw/dottodot/` | `dottodot-{theme}.png` |

**Manual puzzle-post commands (if you want to run them yourself):**
```bash
# Direct one-off generation
npm run puzzlepost:generate -- --type maze --theme "Ocean Animals" --difficulty medium
npm run puzzlepost:generate -- --type wordsearch --theme "Toy Workshop" --difficulty hard

# From the saved daily manifest
npm run puzzlepost:generate -- --manifest output/prompts/activity-manifest-YYYY-MM-DD.json --all-supported
```

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

### 2D — Challenge Images (1–3)

1. Open `output/challenge/[type]-[theme]/brief.md`
2. Generate images **in the same Gemini chat** for visual consistency:

| What | Filename | Required? |
|------|----------|-----------|
| Blank/unsolved puzzle | `puzzle.png` | **Always** |
| Clean unsolved (for reveal start) | `blank.png` | Maze + Word Search only |
| Solved (path drawn / words highlighted) | `solved.png` | Maze + Word Search only |

> `puzzle.png` and `blank.png` can be the same image — generate once, copy + rename.
> Without `blank.png` + `solved.png`, the solve phase shows a static image (still valid for posting).

### 2E — Story Slides (7, optional — longform only)

1. Open `output/stories/epNN-[title]/image-prompts.md`
2. Generate each slide in Gemini (same chat)
3. Save as `01.png` through `07.png` in the story folder

> **Story Reel V2 images are auto-generated** by `npm run daily` via Imagen (5 slides only, from `reel-image-prompts.md`). Only do 2E if you need the full longform story video.

### 2F — Animal Song Short: 6 Images

> Done after Step 1 generates today's animal brief. The brief in `output/longform/animal/[folder]/brief.md` has the 6 Gemini prompts.

1. Open `output/longform/animal/[folder]/brief.md`
2. Generate all 6 images **in the same Gemini chat** for art-style consistency
3. Save to the episode folder:

| File | What |
|------|------|
| `namereveal.png` | Mystery reveal image + animal name styled text |
| `fact1.png` | Scene for Fact 1 |
| `fact2.png` | Scene for Fact 2 |
| `fact3.png` | Scene for Fact 3 |
| `fact4.png` | Scene for Fact 4 |
| `fact5.png` | Scene for Fact 5 |

4. Also drop Suno audio into the same folder:
   - `background.mp3` — ambient loop (30–60s)
   - `sung-recap.mp3` — sung facts recap (20–35s)

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

## STEP 3B — Challenge Video (1–2 min)

**All types — basic render (puzzle.png only, static solve):**
```bash
npm run animate:challenge -- --challenge output/challenge/[folder]/
```

**Maze — animated solve reveal (requires blank.png + solved.png):**
```bash
npm run extract:path -- --asmr output/challenge/[folder]/
npm run animate:challenge -- --challenge output/challenge/[folder]/
```

**Word Search — animated solve reveal (requires blank.png + solved.png):**
```bash
npm run extract:wordsearch -- --asmr output/challenge/[folder]/
npm run animate:challenge -- --challenge output/challenge/[folder]/
```

**Dot-to-Dot — animated solve reveal:**
```bash
npm run extract:dotdot -- --asmr output/challenge/[folder]/
npm run animate:challenge -- --challenge output/challenge/[folder]/
```

**Audio is automatic** — SFX wired by puzzle type:
- Maze: playful music bed + soft tick + success chime + Twinkle solve
- Word Search: search groove bed + soft tick + shimmer cue + Twinkle solve
- Other types: Twinkle bed + soft tick + brand hit

**Dry-run (verify props + audio paths without rendering):**
```bash
npm run animate:challenge:dry -- --challenge output/challenge/[folder]/
```

---

## STEP 3C — Story Reel V2 (auto — review + post)

Story Reel V2 is **automatically rendered** by `npm run daily` (Step 1). Nothing to run.

**To review:** Check `output/videos/` for `StoryReelV2-*.mp4` + thumbnail.

**To regenerate manually** (e.g. after changing images):
```bash
npm run generate:story:reel-images -- --story output/stories/epNN-[title]
node scripts/render-video.mjs --comp StoryReelV2 --story output/stories/epNN-[title]
```

**To force-regenerate images** (overwrites existing):
```bash
npm run generate:story:reel-images -- --story output/stories/epNN-[title] --force
```

---

## STEP 3D — Animal Song Short (3 min, after 2F)

> Requires all 6 images + both Suno audio files to be in the episode folder first (Step 2F).

```bash
# 1. Generate all narration files (hook, name reveal, facts, outro CTA short)
npm run longform:animal:narrate -- --episode output/longform/animal/[folder]

# 2. Render the song short
node scripts/render-video.mjs --comp AnimalFactsSongShort --animal-episode output/longform/animal/[folder]
```

Output: `output/videos/AnimalFactsSongShort-*.mp4` + thumbnail

**Dry-run first** to confirm assets resolve:
```bash
node scripts/render-video.mjs --comp AnimalFactsSongShort --animal-episode output/longform/animal/[folder] --dry-run --verbose
```

---

## STEP 4 — Story Video (optional longform, 1 min)

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

If you only want to validate the deterministic puzzle posts first:
```bash
node scripts/import-raw.mjs --file maze/maze-YYYY-MM-DD-slot01-theme.png
node scripts/import-raw.mjs --file wordsearch/wordsearch-YYYY-MM-DD-slot02-theme.png
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

**Target:** 30 consecutive days ≥ 10 images + 1 ASMR video + 1 story video + 1 challenge reel + 4 X text posts

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
| Challenge solve phase is static | Add `blank.png` + `solved.png` then run `extract:path` / `extract:wordsearch` first |
| Challenge audio is silent | Run dry-run — look for `[sfx] not found` warnings; check file names match exactly |
| Challenge: no path drawn in solve | `extract:path` not run yet, or `blank.png` missing |
| Challenge: no word highlights in solve | `extract:wordsearch` not run yet, or `solved.png` has low-contrast highlights |
| Story Reel V2 not rendered after Step 1 | Check scheduler log — Imagen may have failed. Run manually: `npm run generate:story:reel-images -- --story <folder>` |
| Story Reel V2: images look identical | Use `--force` to regenerate; check `reel-image-prompts.md` prompts are ≥40 words |
| Story Reel V2: missing image error | Reel-image-prompts.md prompts matched wrong slide numbers — check `reelSlideOrder` in `story.json` |
| Animal Song Short: narration dry-run OK but render fails | Confirm `narration-hook.mp3`, `narration-namereveal.mp3`, `narration-outro-cta-short.mp3` exist in episode folder |
| Animal Song Short: song recap too short / wrong length | Re-run narration script — it probes `sung-recap.mp3` and writes `sungRecapShortDurationSec` to `episode.json` |
| Animal Song Short: outro CTA audio missing | Narration script generates `narration-outro-cta-short.mp3` automatically — re-run `npm run longform:animal:narrate` |
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
npm run generate:story:idea                 # Generate story idea only (no reel images)
npm run generate:story:reel-images:dry -- --story output/stories/epNN-slug   # Dry-run reel image gen
npm run generate:story:reel-images -- --story output/stories/epNN-slug        # Generate reel images
npm run longform:animal:plan:save           # Generate animal facts brief (new episode)
npm run longform:animal:narrate -- --episode output/longform/animal/epNN-slug # Generate narration
node scripts/render-video.mjs --comp StoryReelV2 --story output/stories/epNN-slug          # Render story reel
node scripts/render-video.mjs --comp AnimalFactsSongShort --animal-episode output/longform/animal/epNN-slug  # Render animal song short
npm run x:generate
npm run analytics
npm run scorecard
npm run health-check
npm run remotion:studio                     # Visual preview + scrubbing
npm run generate:longform                   # Plan long-form episode (episode.json)
npm run render:longform -- --episode ep01-slug   # Render ~8min longform video
npm run render:longform:dry -- --episode ep01-slug  # Dry-run (check props only)
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

DAILY (all 4 reel lanes run through intelligence):
  Image prompts  ← generate-prompts.mjs (themes + hooks + pattern-interrupts + series tag)
  Puzzle posts   ← activity-manifest-YYYY-MM-DD.json → generate-puzzle-image-post.mjs (maze + word-search only for now)
  Story Reel V2  ← generate-story-ideas.mjs (trends + perf-weights + competitor + hooks + virality)
                 → generate-story-reel-images.mjs (Imagen) → render-video.mjs StoryReelV2
  Animal Song    ← generate-animal-facts-brief.mjs (all 9 config files + virality)
                 → [manual: Gemini images + Suno audio] → narrate → render AnimalFactsSongShort
  ASMR           ← generate-asmr-brief.mjs (hooks + competitor + virality)
  Challenge      ← generate-challenge-brief.mjs (trends + perf-weights + psych-trigger + virality)

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
| Local — you | Generate + import + caption + animal song short | Yes |
| Local — npm run daily | 9 AM: prompts + all 4 briefs + Story Reel V2 render + tracking | Yes (at 9 AM) |
| GitHub Actions — hourly | X text post drip | No |
| GitHub Actions — 4 AM Cairo | Post all pending media | No |
| GitHub Actions — Monday 7 AM | Token refresh + intelligence | No |

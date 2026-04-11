# JoyMaze System Index

Live map of every pipeline component: what it does, what it reads, what it writes, and how it connects. Run `npm run health-check` to validate all links at runtime.

---

## Daily Flow (what runs each day)

```
[Manual — Ahmed]                    [GitHub Actions — Cloud]
  Generate prompts                    post-media.yml @ 2am UTC
    npm run generate:prompts            → post-content.mjs (images/videos)
  Generate X posts                    x-posts.yml @ every hour UTC
    npm run x:generate                  → post-x-scheduled.mjs
  Generate stories/ASMR (manual)    weekly.yml @ Monday 5am UTC
    npm run generate:story              → intelligence-refresh.mjs
    npm run generate:asmr               → apply-intelligence.mjs
  Import images                       → collect-trends.mjs
    npm run import:raw                  → refresh-pinterest-token.mjs
  Check system health
    npm run health-check
  Status snapshot
    npm run status
```

---

## Scripts

### Generation

| Script | Command | Reads | Writes |
|--------|---------|-------|--------|
| `generate-prompts.mjs` | `npm run generate:prompts` | `config/writing-style.md`, `docs/CONTENT_ARCHETYPES.md`, `config/theme-pool-dynamic.json`, `config/pattern-interrupt-dynamic.json`, `config/hooks-library.json`, `config/audit-learnings.json`, `config/competitor-intelligence.json`, `config/trends-this-week.json` | `output/prompts/prompts-YYYY-MM-DD.md`, `output/prompts/carousel-plan-*.json` |
| `generate-x-posts.mjs` | `npm run x:generate` | `config/writing-style.md`, `config/hooks-library.json`, recent `output/queue/x-text-*.json` (7 days dedup) | `output/queue/x-text-YYYY-MM-DD.json`, `output/scores/x-text-scores-*.json` |
| `generate-images.mjs` | `npm run generate:images` | `output/queue/*.json` (pending items), `assets/` | `output/raw/` |
| `generate-captions.mjs` | `npm run generate:captions` | `output/queue/*.json`, `config/hashtags.json`, `config/cta-library.json` | `output/queue/*.json` (captions added in-place) |
| `generate-story-ideas.mjs` | `npm run generate:story:idea` | `config/writing-style.md`, `config/trends-this-week.json` | `output/stories/ep##-*/story.json`, `output/stories/ep##-*/image-prompts.md` |
| `generate-story-video.mjs` | `npm run generate:story` | `output/stories/ep##-*/story.json`, `output/stories/ep##-*/*.png` | `output/queue/story-*.json`, `output/videos/*.mp4` |
| `generate-asmr-brief.mjs` | `npm run generate:asmr:brief` | `config/writing-style.md`, recent ASMR themes | `output/asmr/<name>/brief.md`, `output/asmr/<name>/activity.json` |
| `generate-asmr-video.mjs` | `npm run generate:asmr` | `output/asmr/<name>/activity.json`, `output/asmr/<name>/*.png`, audio from Freesound | `output/queue/asmr-*.json`, `output/videos/*.mp4` |
| `generate-activity-video.mjs` | `npm run generate:activity:video` | `output/queue/*.json` (maze/matching items) | `output/videos/activity-*.mp4` |
| `generate-brief.mjs` | `npm run brief` | `output/prompts/prompts-YYYY-MM-DD.md`, `output/queue/x-text-*.json` | stdout (session brief) |

### Import & Queue

| Script | Command | Reads | Writes |
|--------|---------|-------|--------|
| `import-raw.mjs` | `npm run import:raw` | `output/raw/**` (dropped images), `config/platforms.json` | `output/queue/*.json` (new queue items with metadata), detects carousel subfolders |

### Posting

| Script | Command | Platform | Trigger |
|--------|---------|----------|---------|
| `post-content.mjs` | `npm run post` | Pinterest, Instagram, YouTube | `post-media.yml` @ 2am UTC daily |
| `post-x-scheduled.mjs` | `npm run x:text:post` | X (Twitter) | `x-posts.yml` @ every hour UTC |

### Intelligence & Learning Loop

| Script | Command | Reads | Writes |
|--------|---------|-------|--------|
| `intelligence-refresh.mjs` | `npm run intelligence:refresh` | Gemini web search (6 competitor queries + content-intelligence queries) | `config/content-intelligence.json`, `config/competitor-intelligence.json` |
| `apply-intelligence.mjs` | `npm run intelligence:apply` | `config/content-intelligence.json` | `config/theme-pool-dynamic.json`, `config/pattern-interrupt-dynamic.json`, `config/hooks-library.json` |
| `collect-trends.mjs` | `npm run trends` | Google Trends API | `config/trends-this-week.json` |
| `collect-analytics.mjs` | `npm run analytics:collect` | Pinterest API, output/queue + archive | `output/analytics/analytics-YYYY-MM-DD.json` |
| `analytics-report.mjs` | `npm run analytics:report` | `output/analytics/*.json` | stdout |
| `weekly-scorecard.mjs` | `npm run scorecard` | `output/analytics/*.json` | `output/scorecard-*.json` (optional --save) |

### Maintenance

| Script | Command | Purpose |
|--------|---------|---------|
| `archive-queue.mjs` | `npm run archive` | Moves yesterday's queue items to `output/archive/` |
| `health-check.mjs` | `npm run health-check` | Validates env vars, configs, pools, pipeline links. 41-check report. |
| `status.mjs` | `npm run status` | Live X queue state, cooldown status, pipeline snapshot |
| `setup-check.mjs` | `npm run setup:check` | Validates API keys and platform credentials on first setup |
| `refresh-pinterest-token.mjs` | `npm run pinterest:refresh` | Refreshes Pinterest OAuth token (runs weekly via GitHub Actions) |
| `daily-scheduler.mjs` | `npm run scheduler` | Local cron scheduler (legacy — superseded by GitHub Actions) |

---

## Config Files

| File | Written by | Read by | Purpose |
|------|-----------|---------|---------|
| `config/writing-style.md` | Manual | `generate-prompts`, `generate-x-posts` | Brand voice, tone rules |
| `docs/CONTENT_ARCHETYPES.md` | Manual | `generate-prompts` | Slot definitions, rotation rules, caption formulas |
| `config/audit-learnings.json` | Manual | `generate-prompts`, `generate-x-posts` | Hard rules injected into generation + scorer; append new lessons here |
| `config/competitor-intelligence.json` | `intelligence-refresh --competitor-only` | `generate-prompts` | Fresh competitor hooks/themes/gaps; refreshed weekly |
| `config/content-intelligence.json` | `intelligence-refresh` | `apply-intelligence` | Full weekly niche intelligence before pool propagation |
| `config/theme-pool-dynamic.json` | `apply-intelligence`, `intelligence-refresh --competitor-only` | `generate-prompts` | Dynamic theme pool; grows weekly from intelligence |
| `config/pattern-interrupt-dynamic.json` | `apply-intelligence`, `intelligence-refresh --competitor-only` | `generate-prompts` | Dynamic pattern interrupt pool; growing weekly |
| `config/hooks-library.json` | `apply-intelligence`, `intelligence-refresh --competitor-only` | `generate-prompts`, `generate-x-posts` | Dynamic hook library; growing weekly |
| `config/cta-library.json` | Manual (structured) | `generate-captions` | CTAs per platform + type |
| `config/hashtags.json` | Manual | `generate-captions` | Hashtag pools per platform + niche |
| `config/platforms.json` | Manual | `import-raw`, `post-content` | Platform specs (dimensions, limits, API endpoints) |
| `config/trends-this-week.json` | `collect-trends` | `generate-prompts`, `generate-story-ideas` | Weekly Google Trends for theme boosting |

---

## Dynamic Pool Propagation Chain

```
Gemini web search (6 competitor queries)
  └─► intelligence-refresh.mjs --competitor-only
        └─► config/competitor-intelligence.json
              └─► generate-prompts.mjs (injected as COMPETITOR INTELLIGENCE block)
              └─► applyCompetitorFindings() → write directly to dynamic pools ↓

Gemini web search (niche intelligence queries)
  └─► intelligence-refresh.mjs
        └─► config/content-intelligence.json
              └─► apply-intelligence.mjs
                    └─► config/theme-pool-dynamic.json      (themes array grows)
                    └─► config/pattern-interrupt-dynamic.json (interrupts array grows)
                    └─► config/hooks-library.json            (hooks array grows)
                          └─► generate-prompts.mjs (all 3 pools injected at generation)
                          └─► generate-x-posts.mjs (hooks injected)

Google Trends API
  └─► collect-trends.mjs
        └─► config/trends-this-week.json
              └─► generate-prompts.mjs (boost_themes → theme priority)
              └─► generate-story-ideas.mjs (theme context)
```

---

## Weekly Automation (GitHub Actions)

```
Monday 5am UTC — weekly.yml
  1. refresh-pinterest-token.mjs      Pinterest OAuth token stays fresh
  2. intelligence-refresh.mjs         Full niche intelligence refresh
  3. apply-intelligence.mjs           Propagate to dynamic pools
  4. collect-trends.mjs               Google Trends for the week

Daily 2am UTC — post-media.yml
  post-content.mjs --scheduled --limit 5    Posts queued images/videos

Every hour UTC — x-posts.yml
  post-x-scheduled.mjs               Posts scheduled X text posts at right hour
```

---

## Quality Gate Chain

```
generate-prompts.mjs generation flow:
  1. LLM generates 10 prompts (Groq llama-3.3-70b-versatile)
  2. stripRuleViolations()             Regex-strip fabricated stats + text-in-image fragments
  3. preCheckViolations()              Deterministic JS checks → returns penalty map
  4. scorePrompts()                    LLM scorer (Groq llama-3.1-8b-instant) → scores 1-10
  5. Apply pre-check penalties         Code overrides LLM score for rule violations
  6. PASS ≥7 | FLAG 5-6.9 | REJECT <5
  7. Auto-regenerate rejected prompts  Up to 2 retry attempts

generate-x-posts.mjs scoring:
  1. LLM generates 4 posts (Groq llama-3.3-70b-versatile)
  2. scorePost()                       Rule-based scorer (scroll 25%, relevance 20%, promo 20%, engagement 25%, clarity 10%)
  3. Type-specific penalties           Identity poster language, puzzle too long, story cliché replies
  4. Semantic dedup                    Puzzle answer + noun fingerprinting (7-day lookback)
  5. PASS ≥0.60 threshold
```

---

## Output Directory Layout

```
output/
  queue/              Active items ready to post (JSON per item or batch)
    x-text-YYYY-MM-DD.json    Today's X text posts (4/day)
    *.json                    Image/video items from import-raw
  archive/            Posted items (moved by archive-queue.mjs daily)
    YYYY-MM-DD/       Dated subdirs
  raw/                Drop images here → npm run import:raw picks them up
    category/         Optional subfolders for organization
    carousel-name/    Carousel slides (01.png, 02.png…) → auto-grouped
    facts-carousel-*/  Educational fact carousels (Format 2)
    progress-carousel-*/ Age progression carousels (Format 3)
  prompts/            Daily prompt files
    prompts-YYYY-MM-DD.md
    carousel-plan-YYYY-MM-DD.json
  stories/            Story episode folders
    ep##-slug/        story.json + image-prompts.md + 01.png...
  asmr/               ASMR video folders
    maze-slug/        activity.json + brief.md + blank.png + finished.png
  videos/             Rendered .mp4 files (stories, ASMR, activity)
  scores/             Quality gate scores
    x-text-scores-YYYY-MM-DD.json
  analytics/          Platform analytics (when Pinterest exits sandbox)
  posting-cooldown.json   Active cooldown (read by health-check + post scripts)
```

---

## Phase Roadmap (what's not yet connected)

| Phase | Feature | Status | Trigger |
|-------|---------|--------|---------|
| 1 | Trend → prompt injection | Live | `collect-trends.mjs` → `trends-this-week.json` → `generate-prompts` |
| 1 | Competitor intelligence → pools | Live | `intelligence-refresh --competitor-only` → dynamic pools |
| 1 | Audit learnings → generation | Live | `config/audit-learnings.json` → system prompt |
| 2 | Story performance weights | Pending | Need 8+ published episodes with analytics data |
| 2 | Instagram/TikTok posting | Pending | Credentials set, posting code exists, needs testing |
| 2 | Pinterest Standard API | Pending | Awaiting approval (currently sandbox) |
| 3 | Analytics → theme optimization | Future | After Pinterest Standard — analytics data feeds back into pool weights |
| 3 | Post Bridge pattern | Future | Per `project_moneyprinter_learnings` memory |

# Active Sprint — Joymaze-Content
Last updated: 2026-03-27

## Sprint Goal
End-to-end test with real content. First live post.

## Strategy Decision (2026-03-22)
- **Image generation:** Manual via ChatGPT/Gemini Pro chat UIs (uses existing subscriptions, $0 extra)
- **Captions:** Gemini free API tier (automated, $0)
- **Branding/posting:** Fully automated via scripts
- **Scale path:** Manual now → Gemini API image gen later once pipeline is proven

## Completed

- [x] Project scaffolding + all documentation
- [x] generate-images.mjs (AI image gen + brand compositing)
- [x] generate-captions.mjs (AI captions, 5 platforms)
- [x] post-content.mjs (Pinterest, Instagram, X/Twitter)
- [x] generate-videos.mjs (FFmpeg slideshow assembly)
- [x] content-calendar.mjs (queue status, plans, stats)
- [x] 3 n8n workflow JSONs
- [x] All dependencies installed (twitter-api-v2, FFmpeg 8.1, n8n 2.8.4)
- [x] import-raw.mjs (brand compositing for manual images, sidecar metadata, auto-detect category)
- [x] Switched generate-captions.mjs to Gemini free API (Claude as fallback)
- [x] 19 Claude skills covering all business areas (content, KDP, app, strategy, outreach, brand)
- [x] Daily workflow document (docs/DAILY_WORKFLOW.md)
- [x] Groq + Ollama fallback chain (caption pipeline fully operational at $0)
- [x] Hypnotic Writing framework applied to ALL pipeline steps:
      generate-images.mjs, generate-videos.mjs, content-calendar.mjs,
      all 5 caption templates, all 4 agent skills
- [x] config/writing-style.md — 670-line master style bible injected into every AI call
      Sources: Joe Vitale (18 modules) + Bond Halbert (real extracted book) + 50 social hooks

## Tested This Session
- [x] import-raw.mjs end-to-end: test image → 4 branded platform images + queue metadata
- [x] generate-captions.mjs: Gemini/Claude fallback chain works (keys invalid, defaults used gracefully)
- [x] FFmpeg at D:/Dev/ffmpeg/ confirmed working (not in system PATH yet)

## Completed This Session (2026-03-28)
- [x] Story-First Content Architecture: 8 archetypes, CONTENT_ARCHETYPES.md, writing-style.md updated
- [x] content-calendar.mjs: DAILY_MIX refactored to story archetypes (10 posts + 1 video/day)
- [x] Caption quality verified: Groq + style guide produces publishable Hypnotic Writing copy
- [x] generate-captions.mjs: --force flag, Groq retry-with-backoff (429), 2.5s pacing, Ollama short-prompt fix
- [x] All 8 queue items regenerated with proper captions
- [x] Geo/audience strategy decided: no VPN, content signals + platform Business settings
- [x] Pinterest Business account created (Publisher/media, Education)
- [x] Privacy policy live at joymaze.com/privacy
- [x] Pinterest dev app + OAuth write token (30-day expiry, refresh token saved)
- [x] generate-prompts.mjs: AI prompt generator fed by style guide + archetypes (npm run generate:prompts)
- [x] 7 images generated via Gemini, branded, captioned, 6/7 posted to Pinterest sandbox
- [x] Full end-to-end pipeline proven: prompt gen → image → branding → captions → API post
- [x] Groq confirmed as permanent primary (Google Cloud suspension stands)

## Completed This Session (2026-03-31)
- [x] Landscape dimension fix: smartResize() (blur letterbox) in import-raw.mjs + generate-story-video.mjs
- [x] Story video sync: audio drives timing bidirectionally — max(3s, spoken+0.5s)
- [x] Cinematic intro: black screen, episode/title text, VO narrates title, dynamic duration
- [x] Cinematic outro: black screen, "The End", JoyMaze logo + joymaze.com
- [x] TTS speed flag: --speed (default 0.9); OpenAI native param + Edge FFmpeg atempo
- [x] Video filename dedup: provider appended (ep01-openai.mp4, ep01-edge.mp4)
- [x] OpenAI API key live and validated
- [x] DAILY_CHEATSHEET.md updated with all story video commands + troubleshooting

## Completed This Session (2026-03-30)
- [x] Slideshow video coherence: thematic grouping + --slides flag (generate-videos.mjs)
- [x] ASMR video pipeline: generate-asmr-video.mjs, 5 caption templates, Archetype 9, hashtags
- [x] Prompt diversity: 3-day dedup (themes + scenes + art styles), gold standard examples
- [x] Activity pool expanded: 8 types (+ dot-to-dot, sudoku, coloring), daily random-pick-5
- [x] CTA routing: app+books vs books-only per activity category
- [x] Raw file archiving: archive-queue.mjs now cleans output/raw/ by file mtime
- [x] Gemini removed as caption primary — Groq is now direct primary (no wasted calls)
- [x] File naming cheatsheet updated with full table
- [x] Daily posting: X posts live

## Completed This Session (2026-03-29)
- [x] archive-queue.mjs: moves old queue items + images to output/archive/{date}/ (`npm run archive`)
- [x] `npm run daily` command: archive → generate:prompts in one step
- [x] generate-story-video.mjs: full Archetype 8 "Joyo's Story Corner" video pipeline
      Ken Burns zoom/pan, crossfade transitions, narration text overlays, Joyo intro/outro, optional music
      `--init` scaffolds story folder, `--story` generates video. Tested: 52s MP4 from 7 slides.
- [x] collect-analytics.mjs: fetches Pinterest pin analytics (impressions, saves, clicks)
      Stores data in metadata JSON + output/analytics.jsonl. Handles sandbox detection, token refresh.
- [x] analytics-report.mjs: generates performance reports (top performers, category breakdown, hook analysis)
- [x] generate-prompts.mjs: analytics feedback loop — injects performance data into Groq prompts
- [x] Fixed Sunday rotation bug in generate-prompts.mjs (Sunday has archetypes, not slots)
- [x] New npm scripts: archive, daily, generate:story, analytics:collect, analytics:report, analytics

## Completed This Session (2026-03-31 cont.)
- [x] ep01 story video final test: PASSED — 42.5s MP4, openai TTS, cinematic intro/outro, music
- [x] generate-story-ideas.mjs: AI generates complete Archetype 8 concept (title + 7-slide narration + image prompts)
      Uses Groq + style guide + archetypes. Outputs story.json + image-prompts.md. npm run generate:story:idea
- [x] daily-scheduler.mjs: cron job at 9:00 AM (Asia/Riyadh) — archive + generate prompts automatically
      npm run scheduler (persistent) or npm run scheduler:now (immediate test)
      --with-story flag also generates a story idea each morning
- [x] DAILY_CHEATSHEET.md updated: scheduler setup, story idea generator commands
- [x] Instagram confirmed: posting code already implemented, needs credentials only

## Completed This Session (2026-03-31 session 2)
- [x] Lossless WAV audio chain: all TTS intermediates now pcm_s16le WAV (was MP3 × 4 re-encodes)
      Raw clips, padded clips, intro pad, outro silence, concat output — all WAV. Final AAC mux is the only lossy step.
- [x] --voice flag: OpenAI TTS voice selectable per render (nova/fable/shimmer/alloy/echo/onyx)
- [x] ep01 re-rendered with lossless audio: 43.4s MP4, confirmed clean in output
- [x] 11 posts live on X: 9 activity + 1 pattern-interrupt + 1 story video (ep01)
- [x] import-raw.mjs detectCategory() bug fixed: explicit CATEGORY_KEYWORDS map replaces split-by-hyphen matching
      "story-dot castle" no longer misdetects as activity-dot-to-dot
- [x] generate-story-ideas.mjs upgraded: --slides N flag, character design field, full cinematography spec in IMAGE PROMPT RULES
      Bad/good prompt example from ep02 audit baked into system prompt
- [x] ep02 scaffolded: "The Little Luminous Leafwing" (10 slides) — all 10 image prompts manually rewritten
- [x] Gold standard maze prompt added to generate-prompts.mjs (Example C)
- [x] ASMR video production options mindstormed and documented — decision: progressive reveal

## Next Session Priorities (in order)

### 1. ASMR Progressive Reveal — Build Plan (next session)

**Decision:** Build progressive reveal animation using existing sharp + FFmpeg pipeline. $0, full control, distinctive content.

**Two reveal types to build:**

#### Type A — Coloring Page Fill
- Input: a coloring page image (line art, white background)
- Animation: color gradually "fills in" across the page over 25-35s
- Technique: use sharp to composite a color layer masked by the line art, expanding the mask frame-by-frame (flood fill simulation or radial expand from center)
- Sync: each 1-2s audio event (crayon stroke sound from Freesound pack) = a visible burst of color added
- Output: 750-1050 frames → assembled by FFmpeg

#### Type B — Maze Path Draw
- Input: a maze image with known start/end
- Animation: a colored path line draws itself through the solved route over 20-30s
- Technique: sharp overlays a thin path drawn progressively (SVG path → rasterized frames)
- Sync: pencil scratch sounds play as the path advances
- Output: same FFmpeg assembly

**Audio:**
- Source: Freesound.org — download these packs before next session:
  - Crayon/colored pencil on paper (ASMR, close mic)
  - Pencil scratching on paper (slow rhythm)
  - Page turn / paper rustle
  - Soft "done" chime or tap
- Save to: `assets/audio/asmr/` as `crayon.mp3`, `pencil.mp3`, `page-turn.mp3`, `done.mp3`

**Script to build:** `scripts/generate-asmr-video.mjs` (already exists — extend it, don't replace)
- Add `--type coloring` → Type A reveal
- Add `--type maze` → Type B reveal
- Keep existing Ken Burns as `--type slideshow` (default fallback)

**Structure per video:**
1. Intro (3s): blank activity page appears, soft paper tap sound
2. Reveal sequence (25-35s): progressive fill/draw, ASMR audio synced to visual events
3. Completion (3s): full colored/solved image held, soft "done" sound
4. Outro (3s): JoyMaze branding

**Files to prepare before building:**
- [ ] Download ASMR audio packs from Freesound.org → `assets/audio/asmr/`
- [ ] Have 1 coloring page image ready for Type A test
- [ ] Have 1 maze image ready for Type B test

### 2. Pinterest Standard API access (in review)
- [x] Demo video recorded and submitted (2026-03-28)
- [ ] Wait for approval (usually 1-3 business days)
- [ ] Once approved: switch PINTEREST_API_BASE to https://api.pinterest.com in .env
- [ ] Run `npm run analytics:collect` to start gathering engagement data

### 2. Instagram setup (next priority — code is ready)
- [ ] Create Instagram Business account (or convert existing personal to Professional → Creator/Business)
- [ ] Connect to a Facebook Page (required by Meta Graph API)
- [ ] Create Meta Developer App → Instagram Graph API → generate long-lived token
- [ ] Add INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID to .env
- [ ] Test: `npm run post:instagram`

### 4. First real story video (Joyo's Story Corner Ep 1)
- [x] Run `npm run generate:story -- --init "The Fox and the Frozen River" --episode 1`
- [x] Edit story.json with real narration text (7 slides, 51s story)
- [x] TTS voiceover added: `--tts openai` (nova, ~$0.01) and `--tts edge` (JennyNeural, free)
- [x] TTS comparison done — both providers work, sync fixed, cinematic intro/outro added
- [x] Final video generated: 2026-03-31-story-ep01-openai.mp4 (42.5s, PASSED)
- [ ] Generate 7 story images in Gemini (01.png–07.png) → drop in output/stories/ep01-the-fox-and-the-frozen-river/ (currently placeholder images)
- [ ] Regenerate with real images: `npm run generate:story:openai -- --story ep01-the-fox-and-the-frozen-river`
- [ ] Post to Instagram Reels / TikTok / YouTube Shorts when accounts ready

### 3. Daily content workflow (ongoing once Standard is live)
- [ ] `npm run daily` → generate images in Gemini → drop in output/raw/
- [ ] `npm run import:raw` → `npm run generate:captions` → `npm run post`
- [ ] Target: 7-10 pins/day + 1 story video/day

### 4. Analytics feedback loop (once ~20 pins have 48h+ of data)
- [ ] Run `npm run analytics` to collect + report
- [ ] Review report: which archetypes/hooks perform best
- [ ] Run `npm run daily` — performance data auto-injected into prompt generation

### 5. Future
- [ ] Add FFmpeg to Windows system PATH (D:\Dev\ffmpeg)
- [ ] Set up Instagram + X API keys
- [ ] Pinterest token refresh script (current token expires ~2026-04-27)
- [ ] Gemini API image generation (fully automated pipeline, $0 manual time)
- [ ] Add Instagram/X analytics adapters to collect-analytics.mjs

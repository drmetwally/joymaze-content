# Session Log — Joymaze-Content

> Append-only. One entry per completed task.

---

### 2026-03-21 — Initial project scaffold
- Created full project directory structure
- Set up package.json with all dependencies
- Copied brand assets from JoyMaze app
- Created all documentation files (CLAUDE.md, AGENTS.md, CODEX.md, GEMINI.md, MEMORY.md, docs/*)
- Created .claude/agents/ for content automation agents
- Built generate-images.mjs and generate-captions.mjs pipelines
- Dry-run tested both pipelines: 3 images (12 platform-sized files) + captions for 5 platforms
- Created setup-check.mjs, post-content.mjs (placeholder), generate-videos.mjs (placeholder), content-calendar.mjs (placeholder)
- Created caption prompt templates for Pinterest, Instagram, X, TikTok, YouTube
- Initialized git repo, .gitignore correctly excludes .env/output/node_modules
- Steps 1+2+3 of implementation plan complete. Next: Step 4 (platform posting)

---

### 2026-03-21 — Step 4: Platform posting script
- Built full post-content.mjs with Pinterest (direct base64 upload) and Instagram (Graph API container flow) posting
- X/Twitter posting requires twitter-api-v2 package (OAuth 1.0a signing) — documented with ready-to-uncomment code
- Added --dry-run, --platform, --id, --limit CLI flags
- Tracks post status in queue metadata (pending/posted/failed with timestamps)
- Dry-run tested: 3 items x 2 platforms = 6 successful dry-run posts

---

### 2026-03-21 — Step 5: Video generation pipeline
- Built generate-videos.mjs with slideshow assembly from queue images
- Creates intro (brand splash) + content slides + outro (CTA) as frame sequences
- Resizes all frames to 1080x1920 (9:16 vertical) for Reels/TikTok/Shorts
- FFmpeg assembly step (requires FFmpeg in PATH — not currently installed)
- Dry-run tested: 3 slides, 450 frames, 15s video prepared successfully
- Next: Step 6 (n8n workflows)

---

### 2026-03-21 — Step 6: n8n workflow exports
- Created 3 n8n workflow JSON files in n8n/workflows/:
  - daily-content-generator.json — midnight trigger, generates 12 images + 2 videos + captions
  - scheduled-poster.json — every 2 hours, posts next 2 items to Pinterest + Instagram
  - analytics-collector.json — nightly stats collection, appends to analytics.jsonl
- Ready to import into n8n at localhost:5678

---

### 2026-03-21 — Step 7: Content calendar + optimization
- Built content-calendar.mjs with queue status, weekly plan, daily plan generation, stats views
- 10 content categories with daily rotation mix (12 images/day target)
- Optimal posting times per platform configured
- Dry-run tested: queue status, plan generation, statistics all working
- All 7 steps of the implementation plan complete

---

### 2026-03-21 — Dependencies installation
- Installed twitter-api-v2 (npm) — enabled X/Twitter posting in post-content.mjs
- Installed FFmpeg 8.1 via winget (binaries at D:/Dev/ffmpeg/) — video generation fully working
- Installed n8n 2.8.4 globally (npm install -g n8n)
- Tested generate-videos.mjs live: produced 2026-03-21-slideshow-00.mp4 (1080x1920, H.264, 15s)
- Updated post-content.mjs: X posting now uses twitter-api-v2 (was placeholder), all 3 platforms active
- Remaining manual setup: add FFmpeg to Windows PATH, add API keys to .env

---

### 2026-03-22 — Strategy decision: manual gen + Gemini free API
- Decided against using paid API keys for image generation (separate billing from Pro subs)
- Strategy: generate images manually via ChatGPT/Gemini chat UI ($0), automate everything else
- Captions will use Gemini free API tier ($0)
- Scale path: manual now → Gemini API image gen later once pipeline is proven
- Next session: build import-raw.mjs script, switch captions to Gemini, end-to-end test

---

### 2026-03-25 — Claude skills expansion + pipeline completion
- Created 15 new Claude agent skills covering full business: content (2), KDP (3), app (2), strategy (3), outreach (3), brand (2)
- Total agent count: 19 skills (4 existing + 15 new)
- Created docs/DAILY_WORKFLOW.md — daily/weekly/monthly business workflow using all skills with minimum quotas
- Built import-raw.mjs — imports manual images from output/raw/, applies branding, exports platform sizes, creates queue metadata
  - Supports: --dry-run, --category, --subject, --text, --file, --no-watermark, sidecar JSON metadata, auto-detect category
- Switched generate-captions.mjs from Claude to Gemini free API (Claude as fallback)
- Added npm run import:raw script to package.json
- Next: Ahmed manual setup (API keys, PATH), then end-to-end test with real content

---

### 2026-03-27 — Hypnotic Writing framework: images, videos, calendar pipeline
- Updated generate-images.mjs: all 10 category prompts rewritten with emotional/sensory scene direction; replaced single static textOverlay per category with rotating `textOverlays` array of 2-4 hypnotic micro-phrases picked randomly each run
- Updated generate-videos.mjs: intro tagline changed to "Screen time that feels like a gift."; outro CTA changed to "When you're ready, JoyMaze is waiting." / "Free on iOS & Android"; added SLIDE_OVERLAYS map (per category pool of hypnotic overlay text) + pickSlideOverlay() function wired into prepareSlideFrame()
- Updated content-calendar.mjs: added `hypnoticAngle` (emotional strategy) and `hook` (opening line) to all 10 DAILY_MIX categories; generatePlan() now prints both fields per content piece
- Updated all 4 agent skills: caption-writer, content-strategist, image-generator, video-producer — all rewritten with Hypnotic Writing formulas
- Committed as single commit: "Apply Hypnotic Writing framework to image, video, and calendar pipelines" (7 files, 362 insertions, 164 deletions)
- Hypnotic Writing framework now COMPLETE across all pipeline steps

---

### 2026-03-27 — API keys live + Groq + Ollama fallback chain
- Set valid GOOGLE_AI_API_KEY in .env (Gemini confirmed working briefly)
- Gemini account suspended by Google fraud detection after billing was added
- Submitted formal 500-char appeal to Google Cloud Trust & Safety
- Added Groq as fallback 1 (llama-3.3-70b-versatile, 14,400 req/day free) — LIVE and tested
- Added Ollama as fallback 2 (llama3.2:3b, fully local, zero cost) — LIVE and tested
- Both use existing openai package (OpenAI-compatible APIs), no new dependencies
- Updated model in generate-captions.mjs: gemini-2.0-flash → gemini-2.5-flash
- Caption chain: Gemini → Groq → Ollama → default
- Freed 3.73 GB on C: drive (npm cache 4.72GB cleared, temp cleared)
- Moved npm cache permanently to D:\npm-cache
- Set OLLAMA_MODELS=D:\Ollama\models (user env var) — models land on D: not C:
- Ollama installed, llama3.2:3b (2GB) downloaded to D:\Ollama\models
- Full end-to-end test: import-raw → Groq captions → all 5 platforms — SUCCESS

---

### 2026-03-25 — Setup test + API key discovery
- Ran full end-to-end test: import-raw.mjs produced 4 platform-sized branded images from test image
- Caption generation tested live: GOOGLE_AI_API_KEY and ANTHROPIC_API_KEY both return invalid errors
- Keys exist in .env but contain bad/placeholder values
- Confirmed Anthropic key is NOT needed (Gemini-only strategy, $0 cost)
- Only blocker: need valid GOOGLE_AI_API_KEY from Google AI Studio
- Decision: create dedicated JoyMaze Google account (joymaze.app@gmail.com or similar) for all business services
- Recommended account structure: JoyMaze Google account owns YouTube, Google Play, Gemini API, Google Ads; KDP stays on personal Amazon account
- Next: Ahmed creates JoyMaze Google account, gets Gemini API key, then re-run end-to-end test

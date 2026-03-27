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

## Next Session Priorities (in order)

### 1. Resolve Google Cloud suspension (in progress)
- [x] Set GOOGLE_AI_API_KEY in .env
- [x] Submitted 500-char appeal to Google Cloud Trust & Safety
- [ ] Await Google response and reinstate Gemini API

### 2. Caption pipeline — FULLY OPERATIONAL via Groq + Ollama
- [x] Groq API live (llama-3.3-70b, 14,400 req/day free)
- [x] Ollama local AI live (llama3.2:3b, 2GB on D:, zero cost)
- [x] Full end-to-end test: import-raw → captions → 5 platforms — SUCCESS
- [x] Disk: npm cache → D:\npm-cache, Ollama models → D:\Ollama\models

### 3. First live post — NEXT PRIORITY
- [ ] Generate 3-5 real images manually in ChatGPT/Gemini Pro chat UI
- [ ] Drop images into output/raw/, run: `npm run import:raw`
- [ ] Run: `npm run generate:captions` (will use Groq — confirmed working)
- [ ] Set up Pinterest Business API key (see docs/PLATFORM_SETUP_GUIDE.md)
- [ ] Run: `node scripts/post-content.mjs --platform pinterest --dry-run` first
- [ ] Post 1 real image to Pinterest (first live post)

### 4. Resolve Google Cloud suspension
- [ ] Await Google Trust & Safety response to submitted appeal
- [ ] If reinstated: update GOOGLE_AI_API_KEY, test Gemini captions
- [ ] If denied: Groq is permanent primary (14,400 req/day free — sufficient)

### 5. Future
- [ ] Add FFmpeg to Windows system PATH (D:\Dev\ffmpeg)
- [ ] Set up Instagram + X API keys
- [ ] Review caption output quality now that full Hypnotic Writing style guide is active
- [ ] Gemini API image generation (once pipeline and content strategy proven)

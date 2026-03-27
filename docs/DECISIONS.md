# Architecture Decisions

> ADR-lite format. Append new decisions at the bottom.

## Entry Format

```
### ADR-NNN: [Title]
- **Date:** YYYY-MM-DD
- **Status:** accepted / superseded / rejected
- **Context:** [why this decision was needed]
- **Decision:** [what was decided]
- **Consequences:** [trade-offs, what changes]
```

---

### ADR-001: Use sharp for image compositing instead of canvas/puppeteer
- **Date:** 2026-03-21
- **Status:** accepted
- **Context:** Need to composite brand elements (logo, watermark, CTA text) onto AI-generated images. Options: node-canvas, puppeteer screenshot, sharp.
- **Decision:** Use sharp for all image compositing. It's fast, lightweight, and doesn't require system dependencies like Cairo (canvas) or Chrome (puppeteer).
- **Consequences:** Text rendering is limited (sharp uses SVG text overlay). Complex layouts may need pre-rendered SVG templates. Trade-off is acceptable for our use case of simple watermarks and CTAs.

### ADR-002: ESM modules (.mjs) for all scripts
- **Date:** 2026-03-21
- **Status:** accepted
- **Context:** Need to choose between CommonJS and ESM for Node.js scripts.
- **Decision:** Use ESM (.mjs files) with `"type": "module"` in package.json. All AI SDK packages support ESM natively.
- **Consequences:** Consistent with modern Node.js practices. All imports use `import` syntax. Compatible with top-level await.

### ADR-003: JSON metadata files for content queue
- **Date:** 2026-03-21
- **Status:** accepted
- **Context:** Need a way to track generated content status (pending, posted, failed) and metadata (captions, hashtags, target platforms).
- **Decision:** Each generated content piece gets a JSON sidecar file in `output/queue/` with metadata. Simple, no database needed.
- **Consequences:** Easy to inspect, debug, and process. Can be migrated to SQLite later if needed. n8n can read these files directly.

### ADR-004: Manual image generation + Gemini free API for captions
- **Date:** 2026-03-22
- **Status:** accepted
- **Context:** AI API keys are billed separately from Pro subscriptions (pay-per-use). DALL-E costs $0.04-0.08/image. At 12 images/day, that's $30-120/mo before any revenue.
- **Decision:** Generate images manually via ChatGPT/Gemini Pro chat UIs (covered by existing subs). Use Gemini free API tier for automated captions. Build an `import-raw.mjs` script to bridge manual images into the automated pipeline.
- **Consequences:** $0 extra cost. Higher image quality (human-curated). ~10-15 min/day manual work. Scale path: switch to Gemini API image gen once pipeline and content strategy are validated.

### ADR-005: Dedicated JoyMaze Google account for business services
- **Date:** 2026-03-25
- **Status:** accepted
- **Context:** Need a Google account for Gemini API key, YouTube channel, Google Play console, and Google Ads. Could use Ahmed's personal account or create a dedicated business account.
- **Decision:** Create a dedicated JoyMaze Google account (e.g., joymaze.app@gmail.com). Use it for all Google services, Gemini API, YouTube, Play console, and as the owner account for social media business profiles. Keep Amazon KDP on Ahmed's personal account.
- **Consequences:** Clean separation of personal and business. Easier to add team members later. If personal account is ever locked, business continues. One account to manage all JoyMaze platform access.

### ADR-006: Anthropic API key not required
- **Date:** 2026-03-25
- **Status:** accepted
- **Context:** Tested end-to-end pipeline. Both GOOGLE_AI_API_KEY and ANTHROPIC_API_KEY in .env were invalid. Confirmed ADR-004 strategy: Gemini free tier is the primary (and only needed) API for captions.
- **Decision:** Anthropic API key is kept as optional fallback in code but NOT required for setup. Only GOOGLE_AI_API_KEY is a blocker. This keeps the $0 cost strategy intact.
- **Consequences:** One fewer API key to manage. If Gemini free tier hits rate limits, captions fall back to defaults (still usable, just not AI-optimized). Claude API can be added later if needed.

# Joymaze-Content Project Context (Gemini Agent)

## What we are building

Joymaze-Content = content automation engine for the JoyMaze kids activity app.
Generates branded social media content (images + captions) and publishes to Pinterest, Instagram, X, TikTok, YouTube Shorts.

## Tech stack

- Node.js (ESM, .mjs files)
- sharp (image compositing)
- fluent-ffmpeg (video assembly)
- @anthropic-ai/sdk, openai, @google/generative-ai (AI generation)
- dotenv (env management)
- n8n (workflow automation)

## Non-negotiable rules

- Minimal diff only. Change ONLY what the task requires.
- NO refactors, NO renames, NO cleanup, NO "while I'm here".
- Keep existing behavior unless explicitly asked to change it.
- Never hardcode API keys. Always use process.env.
- After edits, scripts must run without errors: `node scripts/<script>.mjs --dry-run`

## Key architecture decisions

- All scripts are ESM (.mjs) with named exports for testability.
- Brand compositing uses sharp (not canvas/puppeteer) for performance.
- Content queue uses JSON metadata files alongside media files in output/queue/.
- Platform-specific settings centralized in config/platforms.json.
- Hashtag rotation managed via config/hashtags.json to avoid shadowbans.

## Important files

- scripts/generate-images.mjs — image generation pipeline
- scripts/generate-captions.mjs — caption generation pipeline
- config/platforms.json — platform settings
- config/hashtags.json — hashtag pools

## Testing commands

- node scripts/generate-images.mjs --dry-run
- node scripts/generate-captions.mjs --dry-run
- node scripts/setup-check.mjs

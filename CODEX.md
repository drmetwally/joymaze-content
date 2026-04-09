# CODEX.md — Joymaze-Content Agent Contract (OpenAI Codex)

## Required Startup Read Order
Read these files in this exact order before any task work:
1. `AGENTS.md`
2. `docs/TASKS.md`
3. `MEMORY.md`
4. `docs/AGENTS.md`
5. Last entry of `docs/SESSION_LOG.md`

If the task touches strategy, content formulas, or operations, then also read the relevant source docs:
- `docs/CONTENT_ARCHETYPES.md` for content mix and CTA rules
- `docs/DAILY_CHEATSHEET.md` for the live daily operating workflow
- `docs/COMPETITIVE_INTELLIGENCE.md` for platform priorities and positioning

Do not rely on `docs/ACTIVE_SPRINT.md` as the live source of truth. `docs/TASKS.md` is the active board.

## Project Context
- This is a Node.js (ESM) content automation engine for the JoyMaze kids app.
- It generates branded social media content for a kids activity app + KDP brand.
- Scripts are in `scripts/` as `.mjs` files.
- Brand assets are in `assets/` — never modify or delete brand assets.
- Generated content goes to `output/` — this directory is gitignored.
- Queue state lives in JSON files under `output/queue/`; this is the canonical machine-readable state.

## Operating Reality
- Phase 0 is locked: stabilize the existing pipeline before adding new generation tech.
- Daily production target is 10 image posts + 10 story videos + 10 ASMR videos/day.
- North star metric is Pinterest monthly saves.
- Platform roles:
  - Pinterest = primary discovery engine
  - TikTok / Reels = reach engine
  - Instagram = trust builder
  - X = low-cost hook/copy testing and lightweight distribution
  - YouTube Shorts = longer-tail SEO/discovery
- The content system is story-first:
  - 5 story image posts + 5 activity/puzzle posts per day
  - Archetypes 1-8 + ASMR Archetype 9 are defined in `docs/CONTENT_ARCHETYPES.md`
  - CTA discipline matters: pure story posts do not get CTAs; marketing is selective
- The current production workflow is hybrid:
  - Scheduler generates prompts/briefs
  - Ahmed manually creates most images in Gemini/ChatGPT
  - `import-raw.mjs` brands and queues them
  - captioning/posting scripts automate the rest

## Execution Rules
- One task only per session.
- Explicit file boundaries are required before making edits.
- No speculative refactors, cleanup, or unrelated formatting changes.
- Preserve all API credential handling patterns (dotenv + .env).
- Do not hardcode API keys or secrets anywhere.
- Follow `docs/AGENTS.md` end-of-task protocol: update `docs/TASKS.md`, then `docs/SESSION_LOG.md`, then `docs/CHAT_LOG.md`.

## Technical Context
- Text generation stack is Groq-first in current workflows; some scripts also use Vertex/Gemini.
- `VERTEX_API_KEY` replaced the suspended `GOOGLE_AI_API_KEY` in active Gemini-based scripts.
- `config/writing-style.md` is the master brand voice system (Joe Vitale + Bond Halbert + hook library).
- Activity posts are high-utility printable/puzzle content; story posts build trust and emotion.
- Manual image generation is still the default for many assets because puzzle quality matters and full automation is not yet reliable.

## Mandatory Output Format
Every completed task response must include:
1. exact edits
2. why smallest safe diff
3. test steps
4. stop

## End-of-Task Logging
- Append a concise entry to `docs/SESSION_LOG.md` at the end of each completed task.
- Append to `docs/DECISIONS.md` only when a real architecture or product decision is made.
- Append one line to `docs/CHAT_LOG.md`.

## Current Cross-Session Note
- As of 2026-04-07, Codex completed the X text scheduler build:
  - `templates/captions/x-thread-story.txt`
  - `templates/captions/x-thread-puzzle.txt`
  - `scripts/generate-x-posts.mjs`
  - `scripts/post-x-scheduled.mjs`
- The next queued scheduler task is blocked pending clarification: `docs/TASKS.md` says to add `generate-x-posts.mjs` after `generate-captions.mjs` in `scripts/daily-scheduler.mjs`, but that scheduler currently has no caption-generation step.

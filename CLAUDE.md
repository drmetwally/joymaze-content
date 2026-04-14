# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Joymaze-Content is the content automation engine for the JoyMaze kids activity app. It generates and publishes AI-powered social media content across Pinterest, Instagram, X, TikTok, and YouTube Shorts.

**Goal:** Drive app installs and Amazon KDP book sales through high-volume, branded social media content.

**Daily targets:** 10 image posts + 1 ASMR video + 1 story video + 4 X text posts (Phase 0 gate — see MEMORY.md §2)

## Tech Stack

- **Node.js** (ESM modules, .mjs files)
- **sharp** — image compositing, resizing, format conversion
- **fluent-ffmpeg** — video assembly, transitions, text overlays
- **@anthropic-ai/sdk** — Claude API for text generation
- **openai** — GPT + DALL-E for image generation
- **@google/generative-ai** — Gemini for text + image generation
- **n8n** — self-hosted workflow automation (localhost:5678)
- **dotenv** — environment variable management

## Development Commands

```bash
npm run generate:images       # Generate branded images (AI + compositing)
npm run generate:captions     # Generate platform-specific captions
npm run generate:all          # Run both pipelines
npm run dry-run               # Test both pipelines without API calls
npm run setup:check           # Validate all API keys and permissions
npm run post                  # Post queued content to platforms
npm run calendar              # Manage content calendar
```

## Architecture

### Content Pipeline

1. **Plan** — AI generates daily content plan (topics, visuals, text)
2. **Generate** — AI creates images + composites brand elements via sharp
3. **Caption** — AI writes platform-optimized captions with hashtags + CTAs
4. **Queue** — Content stored in `output/queue/` with metadata JSON
5. **Post** — Scripts or n8n workflows publish to all platforms
6. **Track** — Analytics collected for optimization

### Key Directories

- `scripts/` — Node.js automation scripts (ESM)
- `templates/` — Brand templates (images, videos, captions)
- `assets/` — Brand assets (logos, mascot Joyo, fonts, backgrounds)
- `config/` — API keys (.env), platform settings, hashtag pools
- `output/` — Generated content (gitignored)
- `n8n/workflows/` — Exported n8n workflow JSON files

### Brand Elements

- **App name:** JoyMaze
- **Mascot:** Joyo (joyo_waving.png)
- **Website:** joymaze.com
- **Activities:** Coloring, Mazes, Word Search, Sudoku, Dot-to-Dot, Crosswords, Matching
- **Audience:** Parents of kids ages 4-8
- **Tone:** Warm, fun, educational, encouraging

### Platform Targets

| Platform | Image Size | Notes |
|----------|-----------|-------|
| Pinterest | 1000x1500 (2:3) | Link to app/books |
| Instagram | 1080x1080 or 1080x1350 | Business account required |
| X | 1200x675 (16:9) | Free tier: 50 posts/day |
| TikTok | 1080x1920 (9:16) | Video only |
| YouTube | 1080x1920 (9:16) | Shorts < 60s |

## Token Efficiency Rules (CRITICAL — read first)

Every tool call and every line of conversation context costs quota. Follow these rules strictly:

### Startup (do this ONCE per session, not per task)
1. Read `MEMORY.md` — the universal project memory. Single source of truth. **ALL agents read this first.**
2. Read `docs/TASKS.md` — current work and blockers
3. Read the **last entry only** of `docs/SESSION_LOG.md` (last ~20 lines) — recent context
4. For content tasks only: Read `docs/CONTENT_ARCHETYPES.md` lines 1–50 + 530–583 — slot rules, CTA rules, daily mix
5. **Stop. Do NOT read** `AGENTS.md`, `docs/ACTIVE_SPRINT.md`, or `docs/BUG_BOARD.md` unless the task explicitly requires one
6. Ask: **"What is the single task? What are the exact files?"** — then go straight to those files

### During work
- **Never re-read the conversation** for context — the structured files ARE the context
- **Never search for files** unless you know you need a specific one — ask Ahmed if unsure
- **Never re-read a file** you already read in this session — trust what you read
- Read only the lines you need (use `offset` + `limit`) — never read an entire large file when only a section is needed
- Run multiple independent tool calls in parallel (one message, multiple calls)
- Do not do exploratory reads "to understand the codebase" — read only what the task requires
- **Use a subagent for any task requiring 3+ file reads** — intermediate noise stays in subagent context; only summary returns
- **When building a new script or debugging pipeline connectivity**: read `docs/SYSTEM_INDEX.md` first — it maps every script's inputs/outputs, config ownership, and the full data-flow chain. Replaces ad-hoc Grep/Glob for "what reads this file?" questions.

### After every task
- **Compact the conversation immediately** — type `/compact` after logging
- Append one short entry to `docs/SESSION_LOG.md`
- Append a summary entry to `docs/CHAT_LOG.md`
- If any architecture decision was made, append to `docs/DECISIONS.md`
- Mark tasks done in `docs/TASKS.md`

### Multi-agent routing (read docs/AGENTS.md when quota feels tight)
- New isolated script or single-file rewrite with a clear spec → **Codex** (no Claude quota)
- Keep Claude for: architecture, multi-file logic, judgment calls, debugging

### What NOT to do
- Do not read 5 files at session start — 2 files maximum (TASKS.md + last SESSION_LOG entry)
- Do not read ACTIVE_SPRINT.md — it is stale; TASKS.md is the live anchor
- Do not wander with Grep/Glob to understand the repo — read `docs/SYSTEM_INDEX.md` instead
- Do not re-read files to verify edits — trust that Edit/Write succeeded
- Do not add exploratory tool calls before you know what you need

### Ahmed: session hygiene reminders
- Run `/mcp` at session start — disable Gmail/Calendar MCP servers if not needed that session (each costs ~7K tokens/turn)
- Run `/context` if quota feels tight — it shows a breakdown of where tokens are going
- Phrase tasks specifically: "in `scripts/X.mjs`, do Y" — not "fix the pipeline" (vague = broad file scanning)

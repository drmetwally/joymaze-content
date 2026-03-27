# CODEX.md — Joymaze-Content Agent Contract (OpenAI Codex)

## Required Startup Read Order
Read these files in this exact order before any task work:
1. `AGENTS.md`
2. `MEMORY.md`
3. `docs/ACTIVE_SPRINT.md`
4. `docs/BUG_BOARD.md`
5. `docs/HANDOFF_TEMPLATE.md`

## Project Context
- This is a Node.js (ESM) content automation engine for the JoyMaze kids app.
- It generates branded social media images and captions using AI APIs.
- Scripts are in `scripts/` as `.mjs` files.
- Brand assets are in `assets/` — never modify or delete brand assets.
- Generated content goes to `output/` — this directory is gitignored.

## Execution Rules
- One task only per session.
- Explicit file boundaries are required before making edits.
- No speculative refactors, cleanup, or unrelated formatting changes.
- Preserve all API credential handling patterns (dotenv + .env).
- Do not hardcode API keys or secrets anywhere.

## Mandatory Output Format
Every completed task response must include:
1. exact edits
2. why smallest safe diff
3. test steps
4. stop

## End-of-Task Logging
- Append a concise entry to `docs/SESSION_LOG.md` at the end of each completed task.
- Append to `docs/DECISIONS.md` only when a real architecture or product decision is made.

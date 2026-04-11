# AGENTS.md — Multi-Agent Workflow Guide

> Shared protocol for Claude and Codex so both agents stay in sync without breaking each other's work.

---

## The Split

| Task type | Agent |
|-----------|-------|
| Architecture, multi-file logic, debugging, judgment calls | **Claude** |
| New isolated script with a clear spec | **Codex** |
| Single-file rewrite where spec is fully defined | **Codex** |
| Cross-file refactor (3+ interdependent files) | **Claude** |
| Adding a function with a known signature + return type | **Codex** |
| Brand safety, strategy, trade-off analysis | **Claude** |
| Data transformation (JSON reshaping, format conversion) | **Codex** |
| Debugging complex async / pipeline errors | **Claude** |
| Writing a new template file (`.txt`) | **Codex** |

---

## Shared Communication Protocol

Both agents write to the same files. Follow this protocol exactly so neither breaks the other's context.

### What to read at session start (both agents)

1. `docs/TASKS.md` — current work board, locked decisions, what's queued vs done
2. `memory/MEMORY.md` — cross-session decisions; follow any relevant pointers before acting
3. Last entry of `docs/SESSION_LOG.md` — what was just completed and by whom

Do NOT read `docs/ACTIVE_SPRINT.md` — stale. `docs/TASKS.md` is the live anchor.

**Codex only:** Read `docs/SYSTEM_INDEX.md` before starting any new script — it maps every existing script's inputs/outputs and config ownership so you don't duplicate or conflict with live pipelines.

### What to write at session end (both agents)

After completing any task, in this order:

**1. Mark task done in `docs/TASKS.md`**
- Change `[ ]` → `[x]` for completed items
- Add a one-line note if something important was discovered or changed during the build
- Do NOT reformat sections you didn't work on — append/edit only your task's lines

**2. Append to `docs/SESSION_LOG.md`**

Use this exact format:
```
---

## YYYY-MM-DD — [Agent: Claude | Codex] — Short task title

**Files changed:** list of files

- What was built / changed and why
- Any deviations from the spec (and why)
- Anything the next agent needs to know
```

**3. Append one line to `docs/CHAT_LOG.md`**

One line only. Format: `- [Agent] Task title — brief outcome`

Example: `- [Codex] generate-x-posts.mjs — built, 7-10 posts per day, Groq, scheduledHour spread`

**4. If you created or changed a new config schema, document it**
- Add a comment block at the top of the JSON file describing the schema
- Do NOT change existing field names or types without flagging it in SESSION_LOG

---

## Rules That Protect Both Agents

| Rule | Why |
|------|-----|
| Never reformat or reorder `TASKS.md` sections you didn't work on | Claude uses section structure as a mental anchor |
| Never change `.env.example` without SESSION_LOG note | Both agents rely on knowing which keys exist |
| Never rename a function used in more than one file | That's a cross-file refactor — route to Claude |
| If a spec says "see `scripts/X.mjs` for pattern" — read it, don't guess | Consistency beats cleverness |
| Write `--dry-run` support into every new script | The pipeline always runs dry-run before live |
| New npm scripts go into `package.json` `scripts` block with a `name:dry` variant | e.g. `x:generate` + `x:generate:dry` |

---

## Handoff Signals

When Codex finishes and hands back to Claude:
- Leave a `[CODEX DONE — needs Claude review]` comment in SESSION_LOG if the output needs judgment (brand check, architecture decision, wiring into existing pipeline)
- Leave nothing if the task was self-contained and verified

When Claude scopes a task for Codex:
- Claude writes the spec into `docs/TASKS.md` under the agent's section with full file paths, input/output contracts, env vars, and any "see X for pattern" pointers
- No spec = don't start. Ask Ahmed to route back to Claude if spec is incomplete.

---

## Handing Off to Codex

**Install:**
```bash
npm install -g @openai/codex
```

**Start:**
```bash
codex
```

**JoyMaze context block — paste at the top of every Codex session:**
```
Node.js ESM project (.mjs files), path: D:\Joymaze-Content\
Kids activity app content automation engine.
Key files:
  scripts/generate-prompts.mjs       — daily image prompt generator
  scripts/generate-captions.mjs      — caption generator (Groq → Vertex → Ollama)
  scripts/post-content.mjs           — platform posting (Pinterest, Instagram, X, TikTok, YouTube)
  scripts/daily-scheduler.mjs        — full daily pipeline orchestrator
  scripts/intelligence-refresh.mjs   — weekly self-learning loop
  config/content-intelligence.json   — weekly intelligence output
  config/writing-style.md            — brand voice + Halbert copywriting rules
  docs/TASKS.md                      — current work board (read this first)
  docs/AGENTS.md                     — this protocol file
  docs/SYSTEM_INDEX.md               — full pipeline map: every script's inputs/outputs, config ownership, data-flow chain (read before building any new script)
```

**Good prompt pattern:**
```
File: scripts/my-script.mjs
Task: Add a function `summarizeWeeklyThemes(archivePath)` that reads all JSON files
in the archive for the past 7 days and returns a count of how many times each theme appeared.
Return format: [{ theme: "Ocean Animals", count: 4 }, ...] sorted by count desc.
ESM module, no external deps beyond fs/path, async/await.
When done: mark task [x] in docs/TASKS.md, append to docs/SESSION_LOG.md and docs/CHAT_LOG.md.
```

---

## Protecting Claude Quota

- Phrase tasks specifically: "In `scripts/X.mjs`, in function `foo()`, do Y" — not "fix the pipeline"
- Use `offset` + `limit` on file reads — never read a full large file for 10 lines
- `/compact` after every task
- Run `/mcp` at session start — disable Gmail/Calendar MCP if not needed (~7K tokens/turn each)
- If a task needs 3+ file reads with no judgment → route to Codex

---

## Current Handoff Notes

- 2026-04-07: Codex completed `templates/captions/x-thread-story.txt`, `templates/captions/x-thread-puzzle.txt`, `scripts/generate-x-posts.mjs`, and `scripts/post-x-scheduled.mjs`.
- The next queued Codex task is blocked as written: `scripts/daily-scheduler.mjs` has no `generate-captions.mjs` step, so "insert `generate-x-posts.mjs` after caption generation" needs clarification before editing.

---

*Last updated: 2026-04-07*

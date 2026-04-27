# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Joymaze-Content is the content automation engine for the JoyMaze kids activity app. It generates and publishes AI-powered social media content across Pinterest, Instagram, X, TikTok, and YouTube Shorts.

**Goal:** Drive app installs and Amazon KDP book sales through high-volume, branded social media content.

**Daily targets:** 10 image posts + 1 ASMR video + 1 story video + 1 activity challenge reel + 4 X text posts (Phase 0 gate — see MEMORY.md §2)

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

---

## Locked Technical Decisions — Do Not Revisit

These decisions were made after deliberation or painful iteration. They are closed. Do NOT suggest alternatives, debate, or "just try" anything on this list. If a genuinely new constraint changes the picture, state it explicitly and ask Ahmed before reconsidering.

| System | Locked Rule | Reason |
|--------|------------|--------|
| Story engine transitions | Hard cuts only — no crossfade, no dissolve | Cross-dissolve caused image flash artifacts (ep03 v1) |
| Scene animation | Ken Burns permanent default — no SVD, AnimateDiff, or Seedance | GTX 1650 (4GB VRAM) cannot run SVD-XT (14GB) or AnimateDiff (6GB) |
| Video overlays | Yellow pill `rgba(255,210,0,0.93)`, rx=22, dark text, y=48 — never white floating text | Brand standard locked after ep03 approval |
| Story video structure | No outro, no CTA, no fade — loop-clean hard cut on last frame | Outro = dead air on short-form; platform loop requires clean cut |
| TTS fallback | Kokoro-82M (`kokoro-js`, `af_bella` voice) replaces Edge TTS as non-OpenAI fallback — Edge TTS remains in code as last resort only | Edge TTS quality rejected for production 2026-04-27 |
| `writing-style.md` placement | System message only — never user message prefix | User message prefix was ignored in testing; all LLM scripts must follow this |
| Gemini API key | `VERTEX_API_KEY` is the working key — `GOOGLE_AI_API_KEY` is suspended | Suspended by Google; all Gemini scripts already updated |
| API key routing | Gemini images = `VERTEX_API_KEY`; text = `GROQ_API_KEY`; TTS = `OPENAI_API_KEY` (`shimmer`, `tts-1-hd`) | No Anthropic key in use; routing locked to minimize cost |
| Narration scene length | Minimum 7s per scene; 12–18 word narration target | Shorter scenes = jarring pacing; confirmed in ep02 testing |
| HOOK_FRAMES | 210 frames (7s) — do not adjust without approval | Iterated 450→270→210; 210 confirmed clean in ep03 v3 |
| OUTRO_FRAMES | 240 frames (8s) — do not adjust without approval | Locked alongside hook after ep03 v3 approval |
| Phase 0 constraint | No new platforms, no new video tech, no new pipelines until gate clears: 10 images + 4 X posts + 1 ASMR + 1 story video + 1 activity challenge reel/day for 30 consecutive days | Updated 2026-04-27 (reel added 2026-04-27) — pipeline now covers images, X posts, ASMR, story, and activity challenge reels daily |
| Caption body | No `joymaze.com` URL, no pipe separators — ever | Reversed 2026-04-12 after caption quality review |
| X posts | 0 hashtags, no brand name, soft CTAs only, 4 text posts/day max | Post-shadowban anti-spam rules; violations = account suspension |
| Longform image naming | `01.png`, `02.png` … `NN.png` dropped directly into episode folder | `autoFillImagePaths()` scans for this pattern; `scene-01.png` = legacy fallback only |
| ASMR maze transition | Left-to-right wipe only — no crossfade | Corner artifact is intentional "flare"; crossfade removes it |
| Script idempotency | All generator scripts must check if today's output file exists before any API call — skip unless `--force` | `generate-x-posts.mjs` was burning Groq credits on duplicate runs; fixed 2026-04-19 |
| Day-gate flags | `--monday-only` applies to ALL modes of a script (full + `--competitor-only`) — never bypass the gate based on mode flags | Competitor intelligence was running daily; `!COMPETITOR_ONLY` in the gate condition was the bug; fixed 2026-04-19 |
| Archive x-text files | `archive-queue.mjs` must skip `x-text-*.json` files before JSON parsing — they are arrays, not standard queue objects | Caused `Skip: undefined (today — unknown)` log noise; also masked old x-text files from ever archiving; fixed 2026-04-19 |
| Animal facts imagePromptHint | All 6 `imagePromptHint` fields in animal facts brief must be 40+ words (target 50-70). `validateBrief()` enforces this — short prompts produce near-identical images (Groq collapses to ~20w template outputs when unconstrained) | ep03-hedgehog: nameReveal + fact1 + fact2 looked 90% identical; root cause was ~20w prompts + both ESTABLISHING shots; fixed 2026-04-21 |
| Animal facts brief generator intelligence | `generate-animal-facts-brief.mjs` must load all 9 config files: writing-style.md + trends + competitor + hooks + themes + perf-weights + psych-triggers + content-intelligence + pattern-interrupts. Missing configs = animal/theme selection ignores weekly signals | content-intelligence.json + pattern-interrupt-dynamic.json were unwired until 2026-04-21 |
| B-roll clips for Remotion render | Pexels clips must be transcoded to 1920×1080 H.264 (CRF 23) before render — raw 4K downloads (43–107MB) cause Remotion headless browser timeout at ~frame 3500. `download-broll.mjs` now auto-transcodes on download. Do NOT feed raw Pexels clips to the renderer. | ep03-hedgehog: first render failed at frame 3668 with 33s timeout; fixed by FFmpeg transcode; fixed 2026-04-22 |
| B-roll transcode must be 30fps CFR | `download-broll.mjs` transcode command must include `-r 30` — Pexels/Pixabay VFR clips cause frame mapping jitter in Remotion's browser canvas renderer | ep03-hedgehog: all B-roll clips appeared jittery; root cause VFR; fixed 2026-04-22 |
| Animal facts hookFact format | `hookFact` in the brief MUST be a mystery question with NO animal name — "What animal holds hands while sleeping?" style. The name reveal is the payoff. Putting the animal name in the hook kills the reveal and creates two conflicting openers. | ep03-hedgehog: "Hedgehogs can sleep all winter — here's why." then Name Reveal: "Hedgehog!!" — incoherent; brief prompt fixed 2026-04-22 |
| Animal facts narration durationSec buffer | `generate-animal-narration.mjs` must use `dur + 1.5` (not `dur + 7.0`) for `durationSec`. The +7s buffer was creating 7 seconds of dead air silence after every narration — the #1 retention killer. | ep03-hedgehog 2/10 review; fixed 2026-04-22 |
| Animal facts HOOK/OUTRO frame counts | HOOK_FRAMES and OUTRO_FRAMES in `AnimalFactsEpisode.jsx` must be audio-driven from `episode.hookNarrationDurationSec` and `episode.outroCtaDurationSec`. Fixed values caused hook ≥3s dead air and CTA narration cut off mid-sentence. | ep03-hedgehog 2/10 review; narration script now writes both fields; composition reads them with 6s/8s floors |
| Animal facts B-roll source | `download-broll.mjs` uses Pixabay (cartoon/animated, `video_type=animation`) as primary source and Pexels as fallback. Pexels-only = wrong animals (squirrels/rabbits for hedgehog queries). PIXABAY_API_KEY required in `.env`. | ep03-hedgehog: all 5 B-roll clips showed wrong animals; Pexels has near-zero specialist wildlife clips |
| Animal facts visual rhythm | `AnimalFactScene` cuts its visual layer every 4.5s (CUT_INTERVAL=135 frames) independent of VO narration. Narration audio plays straight through; only the image/clip layer switches. AnimalFactTitleCard (1.5s black screen) eliminated — it was dead air breaking rhythm. | ep03-hedgehog 2/10 review; rhythm-cut design implemented 2026-04-22 |
| Animal facts stats fabrication | `generate-animal-narration.mjs` MUST NOT instruct the model to use ellipsis-stats like "200... times... per second!" — this causes Groq to fabricate nonsensical numbers. Rule: only use statistics that appear verbatim in the rough description. | ep03-hedgehog fact3: "Hedgehogs climb 200 times per second" — hallucinated stat from ellipsis instruction; removed 2026-04-22 |
| Animal facts song recap display | `AnimalSungRecap` must NOT attempt karaoke lyric sync — Suno audio lyrics differ from the episode.json text. Component shows animal name + "♪ Fun Facts Song ♪" + floating note particles. | ep03-hedgehog: lyrics showed completely wrong text while song played; redesigned 2026-04-22 |
| B-roll FFmpeg transcode command | `download-broll.mjs` must try `-c:v copy -an` first (fast, no filter needed for already-H.264 clips), then fall back to `-vf "scale=1920:1080" -r 30 -c:v libx264 -crf 23 -preset fast -an`. Remotion's bundled FFmpeg has `pad` and `force_original_aspect_ratio` disabled — the old `scale=W:H:force_original_aspect_ratio=decrease,pad=...` command always fails. | ep03-hedgehog: all 5 Pixabay clips failed transcode with "Error parsing filterchain"; fixed 2026-04-22 |
| Animal facts narration durationSec readGuard | `generate-animal-narration.mjs` must use `dur + 1.5` ONLY for `durationSec` — no `readGuard = wordCount / 1.5` floor. TTS actual speed is ~2.5 wps; the 1.5 wps guard always overrides audio duration and adds 5-10s of dead air per fact. | ep03-hedgehog: fact1 got durationSec=22.7s from 34-word guard instead of 17.0s from actual audio; fixed 2026-04-22 |

---

## Pre-Task Checklists

Run the relevant checklist **before writing any code or making any edit**. These prevent the class of mistakes where implementation starts before the constraint that makes the approach wrong has been read.

### Before any video engine change (Remotion / FFmpeg):
1. State in one sentence: what changes, why, and expected outcome — before touching any file
2. Check the Locked Technical Decisions table above — does the change conflict with any locked rule?
3. Do not adjust HOOK_FRAMES, OUTRO_FRAMES, or transition type without explicit approval
4. Do not increase frame counts or add new animation layers without approval
5. After change: state exactly which composition(s) are affected and what to re-render to verify

### Before any new LLM or API script:
1. Confirm API key routing: Gemini=`VERTEX_API_KEY`, text=`GROQ_API_KEY`, TTS=`OPENAI_API_KEY`
2. `writing-style.md` goes in the **system message** — not user message, not a string prefix
3. All scripts are ESM (`.mjs`) — no CommonJS `require()`
4. Implement `--dry-run` flag before the script touches any output file

### Before any caption or prompt work:
1. No `joymaze.com` URL in caption body
2. No pipe separators in captions
3. Check `BANNED_PHRASES` in `generate-captions.mjs` — do not introduce phrases that match the pattern
4. Pinterest format = 4 fields: Title (SEO, no brand) / Description / Link / Tags (plain keywords, no `#`, max 10)
5. X posts: 0 hashtags, soft CTAs only, no brand name

### Before suggesting any new tech, tool, or platform:
1. Check Phase 0 constraint — new tech is blocked until Phase 0 gate clears (10 images + 4 X posts + 1 ASMR + 1 story + 1 activity challenge reel/day for 30 days)
2. Check if it conflicts with any locked decision (GPU requirements, API key strategy, etc.)
3. If it genuinely unblocks a blocker, state the case and wait for explicit approval

---

## Mistake → Rule Protocol (Self-Improvement Loop)

When a mistake is identified and fixed in a session, it MUST be converted to a permanent rule before the session ends. "We'll remember this" without writing it down is not acceptable.

**Process — 4 steps, mandatory:**

1. **Name the mistake** — one sentence: what was wrong and what symptom it caused
2. **State the fix** — one sentence: what the correct approach is
3. **Write the rule** — pick the right bucket:
   - Affects Codex, survives compression, or is a hard technical constraint → **add row to Locked Technical Decisions table above**
   - Claude-behavior-specific (tone, reading order, task approach) → **add memory file + update MEMORY.md index**
   - Both → both
4. **Verify** — confirm the rule is not already violated in the current session before moving on

**Rule quality bar:** A good rule is specific enough that a cold-start Claude with no conversation history would not make the same mistake. "Be careful with video" = bad. "Never use crossfade in StoryActScene.jsx — hard cuts only, reason: flash artifacts" = good.

---

## Mandatory Post-Task Update Protocol

After EVERY completed task (not just at session end), run this update sequence. Skipping it means the learning is lost to context compression.

**Sequence — run in order after every task:**
1. **TASKS.md** — mark the task `[x]` immediately; do not batch
2. **Memory** — update the relevant memory file if any of the following changed:
   - Account credentials, API keys, or platform status
   - Pipeline state (new script live, new composition, new output format)
   - A locked decision was made or confirmed
   - A mistake was found and fixed (→ also triggers Mistake → Rule Protocol above)
3. **SESSION_LOG.md** — append 3–5 lines: what was done, what was found, what's next
4. **CLAUDE.md Locked Decisions** — if a new technical constraint was confirmed this task, add it to the table now, not later

**Triggers for a memory update (not exhaustive):**
- New account or API key created or changed
- A script went live for the first time
- A render setting confirmed correct after iteration (Ahmed: "perfect" / "yes exactly")
- A platform behavior discovered (posting limit, format constraint, API quirk)
- A mistake was fixed — the fix must be recorded before moving to the next task

**Does NOT need a memory update:**
- Routine content generation with no new state changed
- Bug fixes already captured in code
- Exploratory reads or research with no decision made

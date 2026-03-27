# JOYMAZE-CONTENT MEMORY (Canonical)
Last updated: 2026-03-25
Owner: Ahmed
Phase: Setup & First Live Post (pipeline complete, awaiting valid API keys)

---

## 1) Product Identity
- **Name:** JoyMaze (app), Joymaze-Content (this engine)
- **Positioning:** AI-powered content automation for kids activity app marketing
- **Parent product:** JoyMaze kids activity app (coloring, mazes, word search, sudoku, dot-to-dot, crosswords, matching)
- **Mascot:** Joyo
- **Website:** joymaze.com (lead capture landing page)
- **Revenue channels:** App installs, Amazon KDP activity book sales
- **Target audience for content:** Parents of kids ages 4-8

---

## 2) Non-Negotiable Constraints
- Minimal patch only.
- No refactor unless explicitly requested.
- No unrelated file changes.
- One task per session.
- Never hardcode API keys — always use .env + dotenv.
- Brand consistency: every image must include JoyMaze logo/watermark + joymaze.com URL.
- Content must be kid-friendly and parent-appealing.

---

## 3) Daily Content Targets
- 10+ branded images across Pinterest, Instagram, X
- 1-2 short-form videos for TikTok, YouTube Shorts, Instagram Reels
- Platform-specific captions with hashtags and CTAs
- Rotating content categories to keep feeds fresh

---

## 4) Available AI Tools
- Gemini free API (@google/generative-ai) — primary for captions ($0 cost)
- Claude (@anthropic-ai/sdk) — fallback only, NOT required
- Manual image gen via ChatGPT/Gemini Pro chat UIs ($0 extra, covered by existing subs)
- n8n (self-hosted) — workflow automation, scheduling
- 19 Claude Code agent skills covering: content, KDP, app growth, strategy, outreach, brand

---

## 5) Platform Constraints
| Platform | Daily Limit | Image Size | Notes |
|----------|------------|-----------|-------|
| Pinterest | Unlimited | 1000x1500 | Pins with links |
| Instagram | ~25 posts | 1080x1080/1350 | Business account required |
| X | 50/day (free) | 1200x675 | 1500 tweets/month |
| TikTok | ~50/day | 1080x1920 | Video only |
| YouTube | ~100/day | 1080x1920 | Shorts < 60s |

---

## 6) Current Sprint Focus
Phase 2: First Live Post
- All scripts built and tested: import-raw, generate-images, generate-captions, post-content, generate-videos, content-calendar
- 19 Claude agent skills covering full business
- BLOCKER: Need valid GOOGLE_AI_API_KEY (create JoyMaze Google account first)
- Anthropic API key NOT needed (Gemini-only strategy)
- Next: Valid Gemini key → live caption test → first Pinterest post

---

## 7) Agent Execution Contract
All coding agents must:
1. Read: `AGENTS.md` -> `MEMORY.md` -> `docs/ACTIVE_SPRINT.md` -> `docs/BUG_BOARD.md`
2. Execute one bounded task only.
3. Touch only approved files.
4. Output: exact edits, why smallest safe diff, test steps, stop.
5. Append `docs/SESSION_LOG.md` after task completion.

---

## 8) Scaling Strategy
- Start with manual script runs, validate output quality.
- Add n8n automation once content quality is proven.
- Add analytics tracking to optimize content types.
- Scale up posting frequency based on engagement data.

---

## 9) Account Strategy (decided 2026-03-25)
- Create dedicated JoyMaze Google account for all business services
- JoyMaze Google account owns: YouTube, Google Play, Gemini API, Google Ads, social media business profiles
- Amazon KDP stays on Ahmed's personal Amazon account
- All social platform business accounts use JoyMaze email

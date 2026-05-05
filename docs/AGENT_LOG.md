---

### 2026-05-04 | OpenClaw | OC-030 | MatchingReveal fixes — timing, layering, ocean background

**Status:** LARGELY COMPLETE — minor timing edge cases remain (see below)

**Major fixes applied across session (oldest first):**

1. `isTopCard = pos < 6` — corrected 4→6 column detection in MatchingReveal.jsx
2. TitleStrip visible in P1 — removed gating that hid title during hook phase
3. P3 reveal mechanic rewrite — dropped connection lines, spring-in pairs left→right via `(k+1)/N` threshold
4. Ocean scene as `objectFit: cover` bottom layer — direct `Img` of ocean-animals-1.png fills full frame; BlankCardBacks opaque (hide ocean in card area); RevealedCard white (#FFFFFF)
5. MatchingStickerOverlay neutralized — `return null` for all phases since MatchingReveal owns all sticker rendering; was causing double-sticker in P1 via `gridIndex % 6` position-based pairing
6. `RevealedCard` white background — reverted from transparent to #FFFFFF per user feedback

**Timing applied:**
- P1 (hook): 5s (was 2.5s)
- P2 (countdown): 10s (was 15s)
- P3 (reveal): 12s (was 14s), 6 pairs × 2s each
- Transition: instant (no transitionFrames for matching)
- Total: 27s = 810 frames (was 31.5s = 945 frames)

**Files changed:**
- `remotion/components/MatchingReveal.jsx` — full rewrite of render logic + ocean background + timing
- `remotion/components/MatchingStickerOverlay.jsx` — null-return guard in all phases
- `remotion/compositions/ActivityChallenge.jsx` — `hookFrames` wired to `hookDurationSec` prop; matching computePath uses inputProps
- `scripts/generate-matching-assets.mjs` — COUNTDOWN_SEC=10, SOLVE_DURATION_SEC=12, hookDurationSec=5

**Commits (origin/main, newest first):**
- `f1bfbac` chore: matching timing — P1 5s, P2 10s, P3 12s
- `d4a555a` fix(MatchingReveal): revert RevealedCard background to #FFFFFF
- `9dc3792` fix(MatchingStickerOverlay): return null all phases
- `72ea381` fix(MatchingStickerOverlay): return null in P3+
- `c037f80` fix(MatchingReveal): ocean PNG objectFit:cover + BlankCardBacks opaque
- `6b1d47c` chore: extend holdAfterSec 12→14s
- `f249701` chore: remove deprecated sceneBackgroundPath comment

**Minor issues for later (not blocking):**
- Last pair reveal cut off at video end — P3 duration may need small increase or last pair reveal time slightly reduced
- Generator ENOENT on ocean PNG (~80% failure rate on Windows) — same PNG works in standalone Node; SVG/PNG output still correct via sharp compositing; sceneBgDataUrl already in memory before copy fails
- blank.svg not written by generator (ENOENT on write for SVG output); blank.png/solved.png still generated via sharp from SVG string

**QC builds:**
- v18: white card background confirmed ✓
- v19: timing — P1=5s/P2=10s/P3=12s, 27s total, instant transition

---

**Pending from audit (not yet started):**
1. Story reel V2 — Imagen endpoint `v1beta/models/imagen-4.0-generate-001:predict` returns 404; update endpoint/model ID
2. Animal facts brief — `validateBrief()` throws on Groq malformed output before folder created; needs tolerance or pre-save
3. 4AM GitHub Actions — `post-content.mjs --scheduled` crashes on empty queue + missing Cloudinary creds; needs graceful fallback

# OpenClaw Audit Report — OC-022 (2026-05-01)

## Changes committed: `a40386f`

---

## Step 0 — Audit

### Matching generator bug (empty cards)
`buildBlankSvg()` only drew a cardback pattern — a cream rectangle with dot texture. The `selectedPairs` labels (PUPPY, PURRING, etc.) were never used to render anything on the cards. The SVG was too large (base64 data URI images) for sharp to parse, causing buffer overflow at write time.

### PuzzleJoyoLayer gap
`puzzleType === 'matching'` was not handled. The only non-maze path was `nonMazeCelebOpacity` (celebrating at solve end only) — no Joyo at all during challenge phase.

### matching.json contract
No `matchRects` field. Pair positions are in `pairs[].positions` as grid indices, but pixel coords are only in `connections[]`. WipeReveal is the correct fallback — per-card flip requires re-contracting the generator.

---

## Step 1 — Sticker library wired

**`generate-matching-assets.mjs`:**
- Added `loadStickerIndex()` — reads `assets/stickers/matching/index.json` at startup
- Added `resolveStickerAssignments(selectedPairs, grid, stickerTheme, rng)` — shuffles sticker names and maps pair index → base64-encoded PNG data
- Added `buildMatchingPuzzleImage()` — uses sharp composite API instead of SVG-to-sharp (avoids the buffer overflow from embedded images in SVG)
- Cards rendered via `sharp.create()` canvas with per-card SVG cardbacks + sticker PNG composites
- Sticker images embedded as base64 data URIs, decoded and composited via sharp
- Graceful fallback: if a sticker PNG is missing, card renders with the cardback texture only

**Fix summary:** The `blank.png` is now built with sharp instead of SVG+sharp. `solved.png` uses the existing SVG path (colored cards + text labels). `blank.svg` is a minimal reference file (no embedded images).

---

## Step 2 — Joyo thinking wired

**`ActivityChallenge.jsx` — PuzzleJoyoLayer:**
- Added `isMatching` branch alongside `isMaze` and `isWordSearch`
- **Matching challenge phase:** `joyo_thinking.png` at lower-right of puzzle area, idle bob animation
- **All puzzle types (including matching):** `joyo_celebrating.png` at bottom-center in last 1.8s of solve

**Asset path used:** `staticFile('assets/mascot/joyo_thinking.png')` ✅

---

## Test run

```bash
node scripts/generate-matching-assets.mjs --theme "Animals" --title "Animals Match" --slug "test-matching-sticker-wiring"
# Output: stickerTheme: animals (12 cards wired)

node scripts/generate-activity-video.mjs --id 2026-05-01-activity-matching-test-01
# Output: Hook "Tag a kid with an AMAZING memory 🌟" (from matching pool, playful style)
# Render: 29.0s → 618 frames @ 30fps
```

### Output files
| File | Size |
|------|------|
| `blank.png` | 942 KB (has sticker images) |
| `solved.png` | 64 KB (colored cards + text) |
| `blank.svg` | 2 KB (reference only) |
| `2026-05-01-activity-matching-test-01-yt-short-thumb.jpg` | 185 KB |

### Video render confirmed
- Hook pulled from `hooks-activity.json` matching pool ✅
- `matching` type recognized by generator ✅
- `blank.png` used as puzzle source image ✅
- No crash, no corner watermark ✅

---

## Files changed

| File | Change |
|------|--------|
| `scripts/generate-matching-assets.mjs` | Sticker wiring, sharp-based PNG builder, `resolveStickerTheme()` |
| `remotion/compositions/ActivityChallenge.jsx` | Matching branch in PuzzleJoyoLayer, joyo_thinking |
| `output/queue/2026-05-01-activity-matching-test-01.json` | Test queue item |

---

## Follow-up note (out of scope for OC-022)
`matching.json` lacks `matchRects` — per-card flip reveal cannot be implemented without a generator contract change. WipeReveal is the correct current behavior. A future OC should add `matchRects: [{gridIndex, pixelX, pixelY, width, height}]` to the contract and build `MatchingReveal`.

---

**Status: OC-022 COMPLETE**
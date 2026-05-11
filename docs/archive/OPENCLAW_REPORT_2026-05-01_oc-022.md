# OpenClaw Audit Report — OC-022 Revised (2026-05-01)

## Changes committed: `1195a3d`

**Direction applied:** No sharp-based PNG compositing. Stickers render as overlay layers in Remotion, same philosophy as Joyo poses.

---

## What was built

### Part 1 — matchRects in generator (`generate-matching-assets.mjs`)
`computeMatchRects()` outputs normalized card rects to `matching.json`:
```json
"matchRects": [
  { "gridIndex": 0, "xNorm": 0.024, "yNorm": 0.225, "wNorm": 0.230, "hNorm": 0.178 },
  ...
]
```
Each rect is normalized (0–1) relative to CANVAS_W/CANVAS_H so it works regardless of source image dimensions.

### Part 2 — MatchingStickerOverlay (`remotion/components/MatchingStickerOverlay.jsx`)
New component, renders entirely in Remotion:
- **Sticker overlay:** For each `matchRects` entry, renders `<Img>` using `staticFile('assets/stickers/matching/<themeKey>/<name>.png')`. Uses `gridIndex mod 6` to deterministically pick which of the 6 stickers per theme (stable across renders).
- **Theme resolution:** Maps activity theme string → sticker library key (e.g. "Ocean Animals" → `ocean`). Falls back to `animals`.
- **Sticker paths verified:** `public/assets/stickers/matching/` confirmed present with all 6 theme subdirs and index.json.
- **Joyo thinking** during challenge: `joyo_thinking.png` at lower-right of puzzle frameBounds with idle bob
- **Crossfade** to `joyo_celebrating.png` at last 1.8s of solve

### Part 3 — render props wiring (`generate-activity-video.mjs`)
- `loadSolverProps()` reads `matching.json` from stage dir and maps `matchRects` through `mapContainPoint()` → pixel coords in video space
- `matchingJsonPath` added to sidecar copy list
- `buildRenderProps()` passes `matchRects` through
- `ActivityChallenge` schema updated with `matchRects: null`

### ActivityChallenge.jsx changes
- `MatchingStickerOverlay` imported
- `PuzzleJoyoLayer` receives `matchRects` and `theme`; matching type delegates entirely to `MatchingStickerOverlay`
- Maze and non-maze/non-ws/non-matching paths in PuzzleJoyoLayer are unchanged

---

## Test run

```bash
node scripts/generate-matching-assets.mjs --theme "Animals" --title "Animals Match" --slug "test-matching-sticker-wiring"
# matching.json includes matchRects (12 entries)
# blank.png = cardback pattern only (no stickers baked in)

node scripts/generate-activity-video.mjs --id 2026-05-01-activity-matching-test-01
# Hook: "Can you remember where every match is hiding? 🤫" (curiosity style from matching pool)
# Render: 29.1s → 618 frames @ 30fps
# Thumbnail: generated at frame 90
```

**Confirmations:**
- Hook from `hooks-activity.json` matching pool ✅
- `matching.json` has `matchRects` ✅  
- `MatchingStickerOverlay` rendered for matching type ✅
- Stickers use `staticFile('assets/stickers/matching/...')` ✅
- Joyo thinking during challenge ✅
- Joyo celebrating at solve end ✅
- No corner watermark ✅

---

## Files changed

| File | Change |
|------|--------|
| `scripts/generate-matching-assets.mjs` | `computeMatchRects()`, removed sharp PNG compositing, `matchRects` in matching.json output |
| `scripts/generate-activity-video.mjs` | Load matching.json, `matchingJsonPath` sidecar, `matchRects` through buildRenderProps |
| `remotion/compositions/ActivityChallenge.jsx` | `matchRects` prop, MatchingStickerOverlay import + delegation |
| `remotion/components/MatchingStickerOverlay.jsx` | New — sticker overlay + Joyo for matching |
| `output/queue/2026-05-01-activity-matching-test-01.json` | Test queue item |

---

**Status: OC-022 COMPLETE** (revision applied — stickers as Remotion overlays, not baked into PNG)
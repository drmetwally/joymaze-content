# OpenClaw Audit Report — Word-Search Fix + Generator Audit (2026-05-01)

---

## Part 1 — Fix test queue item

**Action:** Updated `output/queue/fairy-tale-castle-activity-word-search.json`
- Copied `blank.png` → `output/images/fairy-tale-castle-ws-blank.png`
- Changed `outputs.tiktok` from `fairy-tale-castle-ws.png` → `fairy-tale-castle-ws-blank.png`

**Result:** Video regenerated successfully (45.8s render)
- Hook: `"Most parents miss at least 2 words 🙈"` — pulled from `hooks-activity.json` word-search pool (style: `playful`)
- Source image: `fairy-tale-castle-ws-blank.png` ✅
- TitleStrip style: `playful` → orange/red gradient background

**Thumbnail:** `output/videos/fairy-tale-castle-activity-word-search-yt-short-thumb.jpg` generated at frame 90.
Hook text rendered white on orange gradient (style=`playful`). Orange baked-text artifact is gone from the puzzle image area — the puzzle image is now the blank word-search grid.

---

## Part 2 — Word-search generator audit

### File: `scripts/generate-puzzle-image-post.mjs`

**1. `readCroppedSvg` called and return value used?** ✅
```javascript
const { svgContent, layoutMeta } = await readCroppedSvg(activityDir, type);
const svgToRender = svgContent || await fs.readFile(path.join(activityDir, svgFile), 'utf8');
```
Return value is destructured and assigned. Fallback to raw file for types without crop.

**2. `buildPostImage` passes `blank.svg` for word-search?** ✅
```javascript
const svgFile = type === 'matching' ? 'solved.svg' : 'blank.svg';
```
Word-search uses `blank.svg` — correct. Matching uses `solved.svg` — correct.

**3. Are `panelW`/`panelH` vs `mazeW`/`mazeH` field names correct for word-search JSON?** ✅

`readCroppedSvg` reads word-search layout from `wordsearch.json` → `meta.layout`:
```javascript
const { offsetX, offsetY, mazeW, mazeH, wordsTop, wordCols } = src;
```
wordsearch.json stores `mazeW`/`mazeH` (not `panelW`/`panelH`). The destructuring uses the correct field names. ✅

`layoutMeta` uses same `mazeW`/`mazeH` field names:
```javascript
const layoutMeta = { offsetX, offsetY, mazeW, mazeH, canvasW: src.canvasW, canvasH: src.canvasH, cropPad: pad };
```
Passed to `renderPuzzlePost` as `meta.layout`. ✅

**4. Does the word list section render fully without being clipped?** ✅

In `readCroppedSvg` for word-search:
```javascript
const wordsBottom = (wordsTop || offsetY + mazeH + 110) + wordRows * lineH + textBasePad;
const cropH = wordsBottom - cropY;
```
`cropH` extends to include the word list area below the grid. `wordsTop: 1712` in the fairy-tale wordsearch.json. With `lineH = 64` and ~8 words in 2 columns = 4 rows → `wordsBottom ≈ 1712 + 4×64 + 80 = 2048`. Full SVG canvas is 2200px. Crop height of ~1928px fits cleanly. ✅

In `puzzle-post-renderer.mjs`:
```javascript
function fittedCropLayout(layout) {
  const { offsetX, offsetY, mazeW, mazeH, cropPad = 32 } = layout;
  const cropH = mazeH + cropPad * 2;
```
Uses `mazeH` correctly — the grid height, not the full canvas. Word list is already baked into the cropped SVG viewBox, so `fittedCropLayout` correctly renders only the cropped region (grid + word list) into the post card. ✅

### `wordSearchFooterHtml` audit
```javascript
function wordSearchFooterHtml(meta, cfg) {
  return ''; // no separate footer
}
```
Word list is baked into the SVG — no duplicate footer. Correct. ✅

### `stickerHtml` for word-search
```javascript
if (meta.puzzleType !== 'maze' || !meta.layout) return '';
```
Word-search has `puzzleType = 'word-search'` — condition fails → no stickers for word-search. Correct. ✅

### `renderPuzzlePost` flow
- `svgToRender` = cropped SVG content (includes word list in viewBox)
- `layoutMeta` = `{ offsetX, offsetY, mazeW, mazeH, canvasW, canvasH, cropPad }`
- Passed as `meta.layout` → `stickerHtml` → `fittedCropLayout` for maze sticker positioning only
- Word-search skips stickers, uses cropped SVG directly

**Conclusion: Word-search generator is NOT broken.** All 4 checks pass.

### Post-image regeneration test
```bash
node scripts/generate-puzzle-image-post.mjs --type wordsearch \
  --activity-dir output/challenge/generated-activity/2026-04-30-slot03-fairy-tale-castle-word-search \
  --theme "Fairy Tale Castle" \
  --slug "2026-04-30-slot03-fairy-tale-castle-word-search"
```
Output: `post.png` regenerated in activity dir. post.png copied to `raw/wordsearch/wordsearch-fairy-tale-castle.png`.

**Status: All checks PASS. No fixes needed.**

---

## Summary

| Item | Result |
|------|--------|
| Queue item fixed (tiktok → ws-blank.png) | ✅ |
| Video regenerated (blank source, pool hook) | ✅ |
| Orange text gone from puzzle area | ✅ (hook style now `playful` = white-on-orange) |
| `readCroppedSvg` return value used | ✅ |
| `blank.svg` for word-search | ✅ |
| `mazeW`/`mazeH` field names correct | ✅ |
| Word list not clipped | ✅ |
| Post.png regenerated | ✅ |

**Audit complete — no code changes required.**
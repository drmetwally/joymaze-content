# OpenClaw Task — OC-021: Word Search Joyo Integration

Date assigned: 2026-05-01
Depends on: OC-020 ✅ (hook system + hookStyle prop must be merged first)
Priority: HIGH — needed for word search reel launch
Audit required: Yes — write report at `docs/OPENCLAW_REPORT_2026-05-01_oc-021.md` when done

---

## What this task does

Word search reels are structurally sound but visually sterile. The puzzle grid works, word highlighting works, but there is zero personality. This task adds Joyo as an active participant in the word search — he watches the grid, reacts every time a word is found, and celebrates at the end.

Secondary: word list area gets theme decoration so the words don't sit on a plain white background.

---

## Files to change

| File | Change |
|------|--------|
| `remotion/compositions/ActivityChallenge.jsx` | Add `WordSearchJoyoOverlay` for word-search type |
| `remotion/components/WordSearchReveal.jsx` | Add sparkle burst per found word, expose current word index via callback or frame calc |

**Do NOT touch:** `scripts/generate-activity-video.mjs`, `scripts/generate-wordsearch-assets.mjs`, `remotion/compositions/AsmrReveal.jsx`, anything maze-related

---

## Data available

`wordsearch.json` (in the puzzle folder, passed as `wordRects` to the composition) contains:
- `rects` — array of `{ x1, y1, x2, y2 }` in **normalized 0–1** coordinates relative to source image size. One rect per word, in the SAME ORDER as `words`.
- `words` — array of word strings in the same order as rects
- `width`, `height` — source image dimensions

`wordRects` in `ActivityChallenge.jsx` are already coordinate-mapped to video pixel space (the `mapContainPoint` transform in `generate-activity-video.mjs` converts them). So `wordRects[i]` = `{ x1, y1, x2, y2 }` in video pixel coordinates, ready to use.

The `WordSearchReveal` component reveals one word per `Math.round(fps * 1.2)` frames (sequential, starting from frame 0 of the reveal). So at frame F within the reveal, the word index being revealed is `Math.floor(F / Math.round(fps * 1.2))`.

---

## Part 1 — WordSearchJoyoOverlay component

Create `remotion/components/WordSearchJoyoOverlay.jsx`.

Props:
```js
{
  frameBounds,        // { x, y, width, height } — where puzzle image renders in video
  wordRects,          // array of { x1, y1, x2, y2 } in video pixels
  challengeFrames,    // int — frame count of countdown phase
  solveStart,         // int — frame at which word reveal begins
  solveFrames,        // int — total frames in solve phase
}
```

### Joyo position

Fixed anchor: right side of the puzzle area, lower third.
```js
const joyoX = frameBounds.x + frameBounds.width - 55;  // slightly inside right edge
const joyoY = frameBounds.y + frameBounds.height * 0.72;
```
Size: 100px × 100px. Transform origin: bottom center.

### Challenge phase (frame < challengeFrames)

Render `joyo_magnifying.png`.
- Spring bounce-in: scale 0 → 1 over first 14 frames (`stiffness: 260, damping: 14`)
- Continuous idle bob: `translateY(Math.sin(frame / fps * Math.PI * 2 / 2.0) * 6)` (±6px, ~2s period)
- Slight tilt: `rotate(Math.sin(frame / fps * Math.PI * 2 / 3.2) * 4)deg` (±4°, ~3.2s period) — gives a "scanning" feel

### Solve phase (frame >= solveStart)

Compute within-solve frame: `const solveFrame = frame - solveStart;`
Compute current word index: `const wordIdx = Math.floor(solveFrame / Math.round(fps * 1.2));`
Compute capped revealed count: `const revealedCount = Math.min(wordIdx, wordRects.length);`

Joyo still at same position, still `joyo_magnifying.png`.

**Per-word reaction bounce:** When a new word becomes revealed (i.e., `wordIdx` just incremented), Joyo does a quick pop:
```js
// frames since last word was revealed
const framesIntoWord = solveFrame % Math.round(fps * 1.2);
const reactionProgress = Math.min(framesIntoWord / 8, 1);
const reactionScale = 1 + spring({ frame: framesIntoWord, fps, config: { stiffness: 400, damping: 8, mass: 0.5 } }) * 0.18;
```
Apply `scale(reactionScale)` to Joyo for the first 8 frames after each word reveal.

**Switch to celebrating:** At `solveStart + solveFrames - Math.round(fps * 2)` (2s before end):
- Cross-fade `joyo_magnifying.png` out → `joyo_celebrating.png` in over 14 frames
- `joyo_celebrating.png` at same position, scale springs from 0.7 → 1 on entry (`stiffness: 300, damping: 10`)

### Sparkle burst per found word

When word `i` is first revealed, emit a sparkle burst at the center of `wordRects[i]`:
```js
const rectCenterX = (wordRects[i].x1 + wordRects[i].x2) / 2;
const rectCenterY = (wordRects[i].y1 + wordRects[i].y2) / 2;
```

Sparkle = 6 star/dot particles radiating outward. Pure JSX/CSS — no external assets.

Each particle:
- Small circle or star shape, 8-12px, color: pick from `['#FFD700', '#FF6B35', '#4ECDC4', '#FF69B4', '#A78BFA']` by index % 5
- Starts at rect center, moves outward at 6 different angles (0°, 60°, 120°, 180°, 240°, 300°)
- Animation: appears at word reveal frame, travels 30-40px outward over 18 frames, fades out
- Use `interpolate` for translate distance and opacity — no external animation library

Show sparkle only for the most recently revealed word (not all previous). Once a word is more than 22 frames old, its sparkle is gone.

---

## Part 2 — Wire into ActivityChallenge.jsx

In `ActivityChallenge.jsx`, replace the corner `JoyoWatermark` for word-search type (this was already removed in OC-020 for all types). Add:

```jsx
{normalizedType === 'word-search' && showJoyo && wordRects?.length > 0 ? (
  <WordSearchJoyoOverlay
    frameBounds={frameBounds}
    wordRects={wordRects}
    challengeFrames={challengeFrames}
    solveStart={solveStart}
    solveFrames={solveFrames}
  />
) : null}
```

Place this AFTER the `<SolveReveal>` sequence block (so it renders above the puzzle image layer).

Also replace the generic end-of-solve `joyo_celebrating` that OC-020 added for "all other types" — for word-search, the celebrating Joyo is already handled inside `WordSearchJoyoOverlay`, so skip the generic layer when `normalizedType === 'word-search'`.

---

## Test

Render a word search challenge reel:
```bash
node scripts/generate-activity-video.mjs --id dinosaurs-wordsearch-post-medium --force
```

Verify:
1. During countdown: Joyo with magnifying glass visible at lower-right of puzzle area, bobbing and tilting gently
2. During word reveal: Joyo reacts (quick pop) each time a new word highlights
3. Sparkle burst appears at the center of each highlighted word when it's first revealed
4. At ~2s before end: Joyo switches to celebrating pose, springs in
5. No corner watermark anywhere
6. Re-render with `dinosaurs-wordsearch-post-easy` — confirm behavior with different word count

Report result in `docs/OPENCLAW_REPORT_2026-05-01_oc-021.md`.

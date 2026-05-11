# Fix Brief — OC-016 Matching + OC-017 Find-Diff Image Logic

Date: 2026-04-30
Priority: BLOCKING — do not move to OC-018 until both pass visual re-review
Audit: Claude will re-read generated PNGs after each fix and stamp APPROVED

---

## MATCHING generator — `scripts/generate-matching-assets.mjs`

Three bugs, all must be fixed together before regenerating.

---

### Bug 1 — CRITICAL: Pairs always placed at adjacent sequential grid positions

**Root cause:**
```javascript
function buildMatchingPairs(pairs, grid) {
  return pairs.map((label, i) => {
    const a = grid[i * 2];      // always sequential positions
    const b = grid[i * 2 + 1];  // always adjacent to a
```
`grid` is ordered by (row, col). Pair 0 always gets cells (r0c0, r0c1). Pair 1 gets (r0c2, r0c3). Etc. All pairs end up side-by-side regardless of the `cardLabels` shuffle. The puzzle is trivially solved at a glance.

**Fix:**
Create a position index array `[0, 1, 2, ..., totalCards-1]`, shuffle it with the seeded RNG, then assign pair `i` to `shuffledPositions[i]` and `shuffledPositions[PAIRS + i]`. This separates the two cards of each pair across the grid.

```javascript
// After building the grid, create shuffled position assignments
const positionIndices = Array.from({ length: totalCards }, (_, i) => i);
shuffleInPlace(positionIndices, rng);

const pairs = selectedPairs.map((label, i) => {
  const posA = positionIndices[i];
  const posB = positionIndices[PAIRS + i];
  const cellA = grid[posA];
  const cellB = grid[posB];
  return {
    id: i,
    label,
    positions: [cellA.index, cellB.index],
  };
});
```

Do NOT use `buildMatchingPairs()` with the old sequential-index logic. Replace it entirely with the above.

---

### Bug 2 — CRITICAL: Canvas-to-content ratio leaves 70%+ empty space

**Root cause:**
`CANVAS_W = 1700`, `CANVAS_H = 2200`, `cardSize = 148`, `offsetY = 300` hardcoded.
Content (medium: 4×3 at 148px cards) is ~650×480px crammed into the top of a 1700×2200 canvas.

**Fix — two-part:**

**Part A — Scale cards to fill the canvas width:**
Compute `cardSize` dynamically from canvas width instead of hardcoding 148:
```javascript
const MARGIN = 80; // total horizontal margin (left + right)
const cardSize = Math.floor((CANVAS_W - MARGIN - (cols - 1) * gap) / cols);
```
With CANVAS_W=1700, MARGIN=80, gap=18, cols=4: cardSize = (1700 - 80 - 54) / 4 = **391px**.
This fills the full canvas width and makes cards large and readable.

**Part B — Center the grid vertically:**
Replace hardcoded `offsetY = 300` with:
```javascript
const totalH = rows * cardSize + (rows - 1) * gap;
const offsetY = Math.round((CANVAS_H - totalH) / 2);
```
This centers the grid in the canvas regardless of difficulty tier.

---

### Bug 3 — IMPORTANT: No visual differentiation between pairs in solved state

**Root cause:**
All solved cards use the same `CARD_COLOR = '#F0EFE8'`. There is no way to tell which cards belong to the same pair without reading the text and following the connection lines.

**Fix:**
Assign each pair a unique background color from a palette. Define:
```javascript
const PAIR_COLORS = [
  '#FFD6D6', // soft red
  '#D6EAFF', // soft blue
  '#D6FFE4', // soft green
  '#FFF4D6', // soft amber
  '#EDD6FF', // soft lavender
  '#D6FFF9', // soft teal
  '#FFE8D6', // soft orange
  '#F0FFD6', // soft lime
  '#FFD6F4', // soft pink
  '#D6D6FF', // soft indigo
  '#FFFFD6', // soft yellow
  '#D6F4FF', // soft sky
];
```

In `buildSolvedSvg`, render each card with its pair's color:
```javascript
// Map each grid position to its pair color
const positionToColor = {};
pairs.forEach((pair, i) => {
  const color = PAIR_COLORS[i % PAIR_COLORS.length];
  pair.positions.forEach(pos => { positionToColor[pos] = color; });
});

const cards = grid.map((cell) => {
  const fill = positionToColor[cell.index] ?? CARD_COLOR;
  return `  <rect x="${x}" y="${y}" width="${cardSize}" height="${cardSize}" rx="14" fill="${fill}" stroke="${CARD_BORDER}" stroke-width="3"/>`;
});
```

The blank state (all face-down) stays visually identical — no color hints. The solved state makes it immediately clear which cards are paired.

---

### Verification for matching

After all three fixes, regenerate and read the output PNGs:
```
node scripts/generate-matching-assets.mjs --theme "Ocean Animals" --difficulty medium --slug matching-fix-test --seed 42
```

**Blank must show:** 12 identical face-down cards filling most of the canvas, roughly centered.
**Solved must show:** 12 cards each colored by their pair (6 distinct colors), pairs scattered non-adjacently across the grid, visible connection lines crossing between non-adjacent cards.

Also test hard difficulty to confirm scaling works:
```
node scripts/generate-matching-assets.mjs --theme "Space" --difficulty hard --slug matching-fix-hard
```

---

## FIND-DIFF generator — `scripts/generate-find-diff-assets.mjs`

Two critical bugs. Both must be fixed before the bottom panel will render.

---

### Bug 1 — CRITICAL: Coordinate transform is exactly backwards

**Root cause:**
Slots are built with `cy = TOP_Y + row * SLOT_H + SLOT_H/2` — these are **top-panel-space** coordinates.

Then in the build step:
```javascript
// WRONG — subtracting offset puts cy negative (off canvas)
const topScene = buildScene(slots.map(s => ({ ...s, cy: s.cy - (BOTTOM_Y - TOP_Y) })), ...);

// WRONG — using top-panel cy in bottom panel position renders objects in top panel
const bottomScene = buildScene(slots, ...);
```

With TOP_Y=80 and BOTTOM_Y=820, `(BOTTOM_Y - TOP_Y) = 740`.
- topScene: row 0 cy = ~187 - 740 = **-553** → off canvas, nothing renders
- bottomScene: uses cy ~187-613 (top panel space) → renders inside TOP panel accidentally

**Fix — swap the transform:**
```javascript
// topScene: use slots as-is (already in top-panel space)
const topScene = buildScene(originalSlots, palette, factories, seed);

// bottomScene: shift cy DOWN by panel offset to place in bottom panel
const bottomScene = buildScene(
  modifiedSlots.map(s => ({ ...s, cy: s.cy + (BOTTOM_Y - TOP_Y) })),
  palette, factories, seed
);
```

---

### Bug 2 — CRITICAL: Both scenes use post-diff slots (original scene has differences too)

**Root cause:**
The diff loop does `slots[si] = diffedSlot` in-place. By the time `buildScene` is called, the `slots` array already has all differences applied. Both `topScene` and `bottomScene` get the same modified slots — so the top panel also shows the differences.

**Fix — snapshot original before diff loop:**
```javascript
// BEFORE the diff loop:
const originalSlots = slots.map(s => ({ ...s })); // deep copy

// ... diff loop runs, modifying slots in-place ...

// AFTER the diff loop:
const topScene = buildScene(originalSlots, palette, factories, seed);
const bottomScene = buildScene(
  slots.map(s => ({ ...s, cy: s.cy + (BOTTOM_Y - TOP_Y) })),
  palette, factories, seed
);
```

`originalSlots` holds the unmodified scene. `slots` holds the scene with N differences. Top panel shows original. Bottom panel shows modified (shifted down).

---

### Bug 3 — IMPORTANT: All objects use the same color (palette[0] only)

**Root cause:**
```javascript
slots.push({ ..., color: palette[0], ... }); // always index 0
```
Every object in the scene is the same color. This makes the scene look monochromatic and makes color_change differences impossible to see clearly.

**Fix:**
Assign colors by rotating through the palette:
```javascript
slots.push({ ..., color: palette[i % palette.length], ... });
```

Also ensure `color_change` diffs pick a color that is visually distinct from the original:
```javascript
// In applyDiff for 'color_change':
const otherColors = palette.filter(c => c !== slot.color);
const newColor = otherColors[randInt(rng, otherColors.length)] ?? palette[(palette.indexOf(slot.color) + 1) % palette.length];
```

---

### Also check: diff circle y-coordinates

The diffs array sets:
```javascript
y: slot.cy + (BOTTOM_Y - TOP_Y), // canvas-absolute: shifted to bottom panel
```

After Bug 1 is fixed (bottomScene shifted down), `slot.cy` is still in top-panel space before the shift. So the diff circle y = `slot.cy + (BOTTOM_Y - TOP_Y)` correctly maps to the bottom panel canvas position. **This calculation is already correct — do not change it.**

---

### Verification for find-diff

After fixes, regenerate:
```
node scripts/generate-find-diff-assets.mjs --theme "Ocean Animals" --difficulty medium --slug find-diff-fix-test --seed 42
```

**blank.png must show:**
- Top panel: full scene of themed objects, colors distributed across palette
- Bottom panel: same objects, same layout — visually nearly identical to top panel

**solved.png must show:**
- Top panel: same as blank top panel (original scene, no circles)
- Bottom panel: same scene but with N visible differences; red circles drawn around each difference location on the bottom panel only

If blank top and bottom panels look identical at first glance and you can find the differences on the solved bottom panel — the fix is correct.

---

## Commit and report

One commit per generator fix is fine, or batch both into one commit.

Write `docs/OPENCLAW_REPORT_2026-04-30_fix-oc-016-017.md` covering:
- Which exact lines changed in each file
- Regenerated blank + solved PNG description (what you see in each panel)
- Matching: confirm pairs are non-adjacent in solved state
- Find-diff: confirm bottom panel is not empty
- Any edge cases or flags for Claude

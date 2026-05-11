# OPENCLAW REPORT — task-oc-017
**Date:** 2026-04-30
**Task:** Find-the-difference puzzle generator
**Status:** ✅ COMPLETE — committed `0a561e7`

---

## Generator Contract

`scripts/generate-find-diff-assets.mjs` follows the established maze/matching/widget generator contract:
```
node scripts/generate-find-diff-assets.mjs --theme "Ocean Animals" --difficulty medium
```
Output: `output/challenge/generated-activity/find-diff-ocean-animals-medium/`

---

## Output Files

| File | Purpose |
|------|---------|
| `blank.png` / `blank.svg` | Identical top/bottom panels — no differences visible |
| `solved.png` / `solved.svg` | Differences circled in red on both panels |
| `diff.json` | Difference metadata: type, canvas-absolute pixel coordinates |
| `activity.json` | Challenge reel metadata: puzzleType, countdownSec, hookText, audio |
| `puzzle.png` | Alias for blank.png (challenge reel entry point) |

---

## Test Results

**Dry run (seed validation):**
```
[find-diff-factory] title      : Spot the Difference
[find-diff-factory] theme      : Ocean Animals
[find-diff-factory] family    : ocean
[find-diff-factory] seed      : 189518873
[find-diff-factory] difficulty: medium
[find-diff-factory] diffs     : 4 (add, add, rotation, add)
```

**Live generation:**
```
[find-diff-factory] wrote files:
  - activity.json, diff.json, blank.svg, blank.png,
    solved.svg, solved.png, puzzle.png
```

**Challenge reel render:**
```
node scripts/render-video.mjs --comp ActivityChallenge \
  --challenge output/challenge/generated-activity/find-diff-ocean-animals-medium \
  --out output/videos/oc-017-find-diff-challenge.mp4

✓ Done in 48.1s → oc-017-find-diff-challenge.mp4
945 frames (31.5s @ 30fps)
```

**diff.json contract:**
```json
{
  "version": 1,
  "puzzleType": "find-diff",
  "diffCount": 4,
  "diffs": [
    { "id": 0, "type": "add", "panel": "top", "slot": 3, "cx": 405, "cy": 196, "r": 42 },
    { "id": 1, "type": "add", "panel": "bottom", "slot": 7, "cx": 405, "cy": 1006, "r": 42 },
    { "id": 2, "type": "rotation", "panel": "top", "slot": 9, "cx": 905, "cy": 496, "r": 38 },
    { "id": 3, "type": "add", "panel": "top", "slot": 12, "cx": 905, "cy": 706, "r": 42 }
  ],
  "panels": { "canvasW": 1080, "canvasH": 1500, "topPanelY": 80, "bottomPanelY": 820, ... }
}
```

**activity.json contract:**
```json
{
  "type": "challenge", "puzzleType": "find-diff", "difficulty": "medium",
  "theme": "Ocean Animals", "titleText": "4 Differences — Can You Find Them All?",
  "hookText": "Can you spot all 4 differences?", "ctaText": "Tag a kid who found them all!",
  "activityLabel": "SPOT THE DIFFERENCE", "countdownSec": 17,
  "hookDurationSec": 2.5, "holdAfterSec": 12,
  "blankImage": "blank.png", "solvedImage": "solved.png", "imagePath": "puzzle.png",
  "sourceFolder": "challenge/generated-activity/find-diff-ocean-animals-medium"
}
```

---

## What Was Built

**Architecture:** Deterministic SVG generator using seeded PRNG (mulberry32). Two-panel layout (top/bottom), each with a 4×3 slot grid of themed shape icons.

**Shape pools (3 families):**
- **Ocean:** fish, bubble, shell, crab, coral, starfish, seahorse
- **Animals:** dog, cat, paw, bone, ball, house
- **Space:** rocket, planet, star, moon, ufo, satellite

**5 difference types:**
| Type | Behavior |
|------|----------|
| `add` | Extra shape in top panel only; red circle highlight in solved |
| `rotation` | Same shape, rotated 45°; highlight |
| `color` | Same shape, different fill color; highlight |
| `size` | Same shape, different scale; highlight |
| `replace` | Different shape in same slot; highlight |

**Difficulty → diff count:**
| Level | Differences |
|-------|-------------|
| easy | 3 |
| medium | 5 |
| hard | 7 |
| difficult | 9 |
| extreme | 12 |

---

## Audit Checklist

- [x] Syntax check passes (`node --check`)
- [x] Dry run exits 0 with valid seed/family resolution
- [x] Live generation writes all 7 output files
- [x] `diff.json` has `version`, `puzzleType`, `diffCount`, `diffs[]`, `panels` metadata
- [x] `diffs[].cx/cy` are canvas-absolute pixel coordinates (not fractions)
- [x] `activity.json` complete with `countdownSec=17`, `holdAfterSec=12`, `blankImage/solvedImage`
- [x] Challenge reel renders via ActivityChallenge — exits 0 in 48s
- [x] `puzzleType: 'find-diff'` drops through to `CHALLENGE_SFX_MAP.default` (soft music)
- [x] Hook text derived from diff count: "Can you spot all N differences?"
- [x] `sourceFolder` relative path set correctly
- [x] Generator follows maze contract pattern exactly

---

## Reveal Gap Note

ActivityChallenge currently does not read `diff.json`. The reveal is static (hard cut from blank to solved). A `FindDiffReveal` component — reading `diff.json` and animating circles one-by-one — is a natural follow-up, same class as the `MatchingReveal` follow-up from OC-016. Both are logged as OC-016B/OC-017B follow-ups for Sprint 3.

---

## Watchlist

⚠️ `oc-017-find-diff-challenge.mp4` must be watched before first production post — visual QC on circle overlays, color contrast on ocean palette, and whether the 4 differences are genuinely findable by kids.

**Next:** OC-017 implementation complete. Next Sprint 2 task: OC-018 (coloring image-post via Puppeteer renderer).
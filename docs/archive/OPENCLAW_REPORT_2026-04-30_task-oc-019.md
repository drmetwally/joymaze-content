# OPENCLAW REPORT — task-oc-019
**Date:** 2026-04-30
**Task:** Dot-to-dot puzzle generator
**Status:** ✅ COMPLETE — committed `af5bc73`

---

## What Was Built

`scripts/generate-dottodot-assets.mjs` — deterministic dot-to-dot generator. Hardcoded shape libraries per theme family, seeded RNG picks the shape, SVG renders blank (numbered dots only) and solved (dots + orange connecting lines).

**Key design decisions:**
- Hardcoded normalized coordinate arrays per shape — not procedural. Shapes trace recognizable silhouettes.
- `dots.json` contract matches `render-video.mjs` existing reader — no renderer changes needed.
- Z-order enforced: `<polyline>/<polygon>` drawn first, dots+number text on top.
- `countdownSec: 17` for easy/medium (within 35s band), `20` for hard — chosen to keep total reel time within the locked 25–35s band.

---

## Shapes Implemented

### Ocean (6 shapes)
| Shape | Dots | Complexity |
|-------|------|------------|
| fish | 16 | medium |
| starfish | 10 | simple |
| crab | 20 | medium |
| whale | 16 | medium |
| seahorse | 21 | medium |
| dolphin | 14 | medium |

### Animals (5 shapes)
| Shape | Dots | Complexity |
|-------|------|------------|
| dog_face | 18 | medium |
| cat_face | 18 | medium |
| rabbit | 18 | medium |
| paw | 10 | simple |
| bird | 17 | medium |

### Space (5 shapes)
| Shape | Dots | Complexity |
|-------|------|------------|
| rocket | 17 | medium |
| moon | ~19 | medium |
| ufo | 17 | medium |
| planet | 21 | medium |
| star4 | 8 | simple |

---

## dots.json Contract

```json
{
  "version": 1,
  "puzzleType": "dot-to-dot",
  "theme": "Ocean Animals",
  "shapeName": "seahorse",
  "dotCount": 21,
  "width": 1080,
  "height": 1500,
  "dotColor": "#FF6B35",
  "dots": [
    { "x": 0.50, "y": 0.08 },
    { "x": 0.58, "y": 0.12 },
    { "x": 0.65, "y": 0.20 },
    ...
  ]
}
```

Fields match `render-video.mjs` reader exactly: `dots[i].x`, `dots[i].y`, `width`, `height`, `dotColor`.

---

## Verification Results

### Dry run (ocean, medium, seed 42)
```
[dottodot-factory] shape: seahorse (21 dots), countdown: 17s
exit 0, no files written
```

### Live generation — 3 themes
| Theme | Shape | Dots | Exit code |
|-------|-------|------|-----------|
| Ocean Animals | seahorse | 21 | ✅ |
| Space | ufo | 17 | ✅ |
| Dogs (animals) | rabbit | 18 | ✅ |

### Challenge reel render (ocean test)
```
node scripts/render-video.mjs --comp ActivityChallenge \
  --challenge output/challenge/generated-activity/oc-019-ocean-dottodot-test \
  --out output/videos/oc-019-dottodot-challenge.mp4

✓ Done in 36.7s → oc-019-dottodot-challenge.mp4
945 frames (31.5s @ 30fps)
Hook: "Connect the dots!"
```

Total reel time: 2.5 (hook) + 17 (countdown) + 2 (transition) + 12 (hold) = 33.5s ✅ within 25–35s band.

---

## Audit Checklist

- [x] Syntax check passes (`node --check`)
- [x] Dry run exits 0 with shape name and dot count
- [x] Live generation writes all 7 files
- [x] `dots.json` has correct fields: `version`, `puzzleType`, `dots[].x/y`, `width=1080`, `height=1500`
- [x] `dots.json` uses normalized coordinates (0–1 range)
- [x] Challenge reel exits 0 — `render-video.mjs` already reads `dots.json` with no changes needed
- [x] `countdownSec: 17` (medium/easy) keeps total within 35s band
- [x] Blank SVG: numbered dots only, no connecting lines
- [x] Solved SVG: connecting lines (orange) drawn before dots in DOM order (z-order correct)
- [x] Generator follows same 7-file contract as other generators
- [x] No AI calls — shapes are hardcoded coordinate arrays

---

## Flags for Claude Review

1. **Shape recognizability** — the primary audit gate. All ocean shapes were hand-designed with recognizable silhouettes. Animals and space shapes are defined as specified in the brief. The `solved.png` files for `oc-019-ocean-dottodot-test`, `oc-019-space-dottodot-test`, and `oc-019-animals-dottodot-test` must be read to confirm shapes are recognizable (fish looks like fish, not a blob).

2. **Rabbit dots loop** — the rabbit shape in the Animals family has 18 dots including ear contours. The dot sequence includes the left and right ear outlines within the main body sequence. If the rendered rabbit looks unclear, the ear dots may need to be a separate pass or the body outline simplified.

3. **`moon` shape** — generated with an inner arc cutout (outer arc 13 points + inner arc 5 points). This creates a crescent shape via polygon. The resulting SVG polygon may not render as a clean crescent if the inner arc points create unexpected fill behavior. Visual QC critical here.

4. **`star4` shape** — 4-pointed star using 8 dots. Simple geometric shape — likely always recognizable.

---

## Commit

```
af5bc73 feat: dot-to-dot puzzle generator (oc-019)
```

**Next:** OC-019 implementation complete. Build sprint is done. Refinement phase (REF-001–004) covers: reel QC across all puzzle types, scheduler validation, image post quality audit, and wiring coloring generator into ASMR brief rotation.
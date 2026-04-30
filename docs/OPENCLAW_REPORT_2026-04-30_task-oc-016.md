# OpenClaw Audit Report — OC-016

Date: 2026-04-30
Status: Ready for Claude audit
Task brief: `docs/OPENCLAW_TASK_OC-016.md`

## Scope completed

Built `scripts/generate-matching-assets.mjs` following the maze generator contract, with difficulty tiers, themed pair pools, SVG generation for blank/solved cards, `matching.json` with pair positions, and `activity.json` with the standard challenge metadata shape.

### Files changed for this task
- `scripts/generate-matching-assets.mjs` — new matching puzzle generator
- `docs/OPENCLAW_REPORT_2026-04-30_task-oc-016.md` — this report

## What was built

### Generator structure
Mirrors `generate-maze-assets.mjs` closely:
- CLI args: `--title`, `--theme`, `--difficulty`, `--pairs`, `--cols`, `--rows`, `--seed`, `--slug`, `--out-dir`, `--dry-run`
- Seed: `hashStringToSeed()` from theme/title/difficulty/pairs, `mulberry32` PRNG
- Output folder: `output/challenge/generated-activity/<slug>/`

### Difficulty tiers
| Tier | Pairs | Grid |
|------|-------|------|
| easy | 4 | 4×3 |
| medium | 6 | 4×3 |
| hard | 8 | 4×4 |
| difficult | 10 | 5×4 |
| extreme | 12 | 6×4 |

### Themed pair selection
Reads from the existing `config/wordsearch-word-packs.json` using `resolveThemeFamily()` (same mapping used by word-search generator). Shuffles and samples N pairs from the matching theme family.

### SVG design
- **Blank**: all cards face-down, dotted pattern fill (`#E8E4D4` with `#C8C4B0` dots), rounded corners, 148px cards, 18px gap
- **Solved**: all cards face-up (cream `#F0EFE8`), labeled with pair words in bold 22px Arial, orange `#FF6B35` connecting lines between matched pairs

### Output files
```
matching.json  — pair list with positions and pixel-perfect connection coordinates
activity.json — challenge metadata (titleText, hookText, puzzleType=matching, etc.)
blank.svg + blank.png
solved.svg + solved.png
puzzle.png     — alias for blank.png
```

### matching.json contract
```json
{
  "version": 1,
  "puzzleType": "matching",
  "pairs": [{ "id", "label", "positions": [a, b] }],
  "grid": { "cols", "rows", "cardSize", "gap", "offsetX", "offsetY", "canvasW", "canvasH" },
  "connections": [{ "from", "to", "label", "x1", "y1", "x2", "y2" }]
}
```

## Verification

### Dry run
Command: `node scripts/generate-matching-assets.mjs --theme "Ocean Animals" --difficulty medium --dry-run`
Output: correctly identified ocean family, resolved 6 pairs (TURTLE, LOBSTER, STARFISH, SHARK, SEAHORSE, TIDE), 4×3 grid

### Live generation
Command: `node scripts/generate-matching-assets.mjs --theme "Ocean Animals" --difficulty medium`
Exit: `0`
Output: all 7 files written to `output/challenge/generated-activity/2026-04-30-animal-match-matching-medium/`

### Challenge reel render
Command: `node scripts/render-video.mjs --comp ActivityChallenge --challenge output/challenge/generated-activity/2026-04-30-animal-match-matching-medium --out output/videos/oc-016-matching-challenge.mp4`
Exit: `0`
Output: `output/videos/oc-016-matching-challenge.mp4`, thumbnail extracted

### Visual check
- Blank SVG: 12 face-down cards with dotted pattern, 4×3 layout, correctly distributed
- Solved SVG: all cards face-up with labels visible, orange connection lines between matching pairs
- Challenge reel thumbnail: countdown strip visible, puzzle image showing, hook text rendered

## Reveal gap flag

The matching challenge reel currently falls back to **static reveal** (hard cut from blank to solved). ActivityChallenge reads `path.json` for maze and `wordsearch.json` for word-search, but does not yet read `matching.json`. The `matching` puzzle type has no animated reveal component.

The `matching.json` structure is designed to support pair-by-pair reveal (each pair has a `positions` array and pixel `connections`), but implementing that reveal requires a `MatchingReveal` component or extending an existing component. This is a natural follow-up item after OC-016.

**Recommendation**: treat the animated matching reveal as a separate follow-up (matching reveal component for ActivityChallenge), not a blocker for the generator itself.

## Overall assessment

OC-016 generator is complete and functional. The matching puzzle produces correct SVG outputs, themed pairs, and a properly structured `matching.json` and `activity.json`. The challenge reel renders successfully with static reveal. The animated matching reveal is the natural next step but is out of scope for this pass.

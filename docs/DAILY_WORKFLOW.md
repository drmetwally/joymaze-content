# JoyMaze Daily Workflow

Updated: 2026-04-29

This is the current real workflow, matching the repo automation.

---

## Daily Run Order

### 1. Run the daily planner
```bash
npm run daily
```

This now does all of this automatically:
- archives yesterday's queue
- generates today's prompt file
- writes `output/prompts/activity-manifest-YYYY-MM-DD.json`
- generates supported deterministic puzzle posts from that manifest
  - currently: **maze** and **word-search** only
- generates story idea + Story Reel V2 render
- generates ASMR brief
- generates challenge brief
- generates animal facts brief
- generates X text posts
- runs Monday intelligence refresh steps when applicable

---

## What is now automatic vs manual

### Automatic now
- maze image-post generation
- word-search image-post generation
- wrapped `post.png` creation for those two puzzle types
- export into `output/raw/maze/` and `output/raw/wordsearch/`
- sidecar metadata creation for `import-raw.mjs`

### Still manual
- matching
- tracing
- coloring
- dot-to-dot
- manual Gemini inspiration images
- ASMR source images
- challenge source images
- animal image/audio asset drops

---

## Deterministic puzzle-post flow

### Source of truth
`generate-prompts.mjs --save` writes:
```text
output/prompts/activity-manifest-YYYY-MM-DD.json
```

That manifest contains the daily activity slots, including:
- `category`
- `label`
- `difficulty`
- `source`
- `skill`
- `theme`

### Puzzle-post generator
Run all supported daily deterministic puzzle slots from the manifest:
```bash
npm run puzzlepost:generate -- --manifest output/prompts/activity-manifest-YYYY-MM-DD.json --all-supported
```

Run a single one-off direct puzzle post:
```bash
npm run puzzlepost:generate -- --type maze --theme "Ocean Animals" --difficulty medium
npm run puzzlepost:generate -- --type wordsearch --theme "Toy Workshop" --difficulty hard
```

Outputs:
- generator-owned folder in `output/challenge/generated-activity/<slug>/`
- wrapped social image: `post.png`
- raw import image in `output/raw/maze/` or `output/raw/wordsearch/`
- sidecar JSON beside the raw image

---

## Import + queue flow

Full import:
```bash
npm run import:raw
```

Single-file validation imports:
```bash
node scripts/import-raw.mjs --file maze/maze-YYYY-MM-DD-slot01-theme.png
node scripts/import-raw.mjs --file wordsearch/wordsearch-YYYY-MM-DD-slot02-theme.png
```

`import-raw.mjs` now preserves puzzle-generator metadata including:
- `difficulty`
- `theme`
- `sourceFolder`
- `puzzleType`
- `titleText`
- `ctaText`

---

## Caption step

Dry-run for a specific queue item:
```bash
node scripts/generate-captions.mjs --dry-run --id 2026-04-29-activity-maze-00
node scripts/generate-captions.mjs --dry-run --id 2026-04-29-activity-word-search-00
```

Full run:
```bash
npm run generate:captions
```

---

## Current Phase 1 definition

Phase 1 is complete when the system can:
1. assign daily puzzle themes in prompts
2. emit a machine-readable manifest
3. generate deterministic maze + word-search posts from that manifest
4. export them into the existing raw/import seam
5. queue them through `import-raw`
6. pass caption generation checks

That is now implemented.

---

## Current limitations

Still not automated yet:
- matching
- find-the-difference / matching hybrid lane
- coloring
- tracing
- dot-to-dot

Wrapper quality is now solid for Phase 1, but still open to further art-direction polish.

---

## Recommended operator flow each day

1. `npm run daily`
2. verify `output/prompts/` and the auto-generated maze/word-search puzzle posts
3. create remaining manual images in Gemini
4. `npm run import:raw`
5. `npm run generate:captions`
6. review queue
7. push queue metadata

```bash
git add output/queue/
git commit -m "queue: YYYY-MM-DD"
git push
```

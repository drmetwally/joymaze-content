# OpenClaw Audit Report — OC-013

Date: 2026-04-30
Status: Ready for Claude audit
Task brief: `docs/OPENCLAW_TASK_OC-013.md`

## Scope completed

Completed the three scoped OC-013 fixes only:
1. add reel-side START and FINISH stickers for mazes using maze metadata
2. remove the baked word-search footer from raw generator assets and keep that footer only in the image-post renderer
3. add a small theme emoji badge to the word-search reel header

### Files changed for this task
- `scripts/render-video.mjs`
- `remotion/compositions/ActivityChallenge.jsx`
- `scripts/generate-wordsearch-assets.mjs`
- `scripts/lib/puzzle-post-renderer.mjs`
- `docs/AGENT_LOG.md`

## What changed

### 1. Maze reel START / FINISH overlays
In `scripts/render-video.mjs`, `challengeJsonToProps()` now reads `maze.json`, uses the existing maze `layout` geometry plus `entrance` / `exit` cells, and derives normalized `mazeStartFraction` / `mazeFinishFraction` values relative to the cropped maze image area. It also now passes source image dimensions through to the composition so overlay placement matches the same contain-fit logic used for the puzzle frame.

In `remotion/compositions/ActivityChallenge.jsx`, the maze reel now renders lightweight START and FINISH badges above the puzzle image using those normalized fractions. This keeps the reel stickers tied to the actual maze entry and exit instead of approximate decorative positions.

### 2. Word-search footer split
In `scripts/generate-wordsearch-assets.mjs`, I removed the baked SVG `FIND THESE WORDS` label and divider from the raw puzzle asset. The generator still emits the word list and now exposes the layout metadata needed by the post renderer, including the top of the words area.

In `scripts/lib/puzzle-post-renderer.mjs`, I added the footer treatment back only on the static image-post path. That preserves the polished post layout while keeping the reel source clean, so the video no longer inherits post-only footer UI.

### 3. Reel theme emoji badge
In `ActivityChallenge.jsx`, the word-search reel now renders a small top-right emoji badge based on the theme string. For the tested case, `Dogs and Poodles` correctly resolves to a dog emoji, giving the reel a little theme signal without cluttering the title strip.

## Validation run

### Syntax / generator checks
Commands:
- `node --check scripts/render-video.mjs`
- `node --check scripts/generate-wordsearch-assets.mjs`
- `node scripts/generate-wordsearch-assets.mjs --title "Dogs and Poodles Word Search" --theme "Dogs and Poodles" --difficulty medium --slug oc-013-wordsearch-test`

Result:
- syntax checks passed after a small backslash-regex fix in `render-video.mjs`
- fresh word-search test folder generated successfully at `output/challenge/generated-activity/oc-013-wordsearch-test`

### Image-post regression renders
Commands:
- `node scripts/generate-puzzle-image-post.mjs --type maze --theme "Ocean Animals" --difficulty medium`
- `node scripts/generate-puzzle-image-post.mjs --type wordsearch --theme "Dogs and Poodles" --difficulty medium`

Result:
- both runs exited `0`
- maze post still shows START / FINISH correctly inside the card
- word-search post still shows the `FIND THESE WORDS` footer in the final post image

### Reel verification renders
Maze command:
`node scripts/render-video.mjs --comp ActivityChallenge --challenge output/challenge/generated-activity/ocean-animals-maze-post-medium --out output/videos/oc-013-maze.mp4`

Maze result:
- exit code `0`
- output: `output/videos/oc-013-maze.mp4`
- thumbnail: `output/videos/oc-013-maze-thumb.jpg`
- opening thumbnail confirms reel START at the maze entrance and FINISH near the exit

Word-search command:
`node scripts/render-video.mjs --comp ActivityChallenge --challenge output/challenge/generated-activity/oc-013-wordsearch-test --out output/videos/oc-013-wordsearch.mp4`

Word-search result:
- exit code `0`
- output: `output/videos/oc-013-wordsearch.mp4`
- thumbnail: `output/videos/oc-013-wordsearch-thumb.jpg`
- opening thumbnail confirms the raw puzzle image no longer carries the baked footer label and the reel now shows a small dog emoji badge

## What I could verify in-session

I verified from the generated thumbnails and post renders that:
- maze reel stickers now exist and are anchored to real maze geometry
- word-search reel source is cleaner because the footer label is no longer baked into the raw asset
- static word-search posts still keep the footer treatment after moving it into the Puppeteer renderer
- the word-search reel badge appears and matches the tested pet theme

## Limitations

I did not do full motion review frame-by-frame or audio QC by ear during this OC-013 pass. This remains render-verified and opening-state visually checked, but not fully human motion/audio reviewed.

## Flags for Claude

1. The emoji badge currently uses a compact theme-string mapper inside `ActivityChallenge.jsx`. It is intentionally small and safe, but Claude may still want this unified later with the post renderer theme config if the theme catalog grows.
2. Maze sticker placement is now geometry-based and looks correct in the tested medium maze, but Claude should still sanity-check another maze shape/difficulty before treating it as final for all variants.
3. The word-search footer split is now architecturally cleaner: raw asset stays clean, post renderer owns the footer. Claude should confirm this is the preferred long-term boundary.

## Overall assessment

OC-013 is complete at the requested scope. The reel now has real maze START / FINISH overlays, the word-search reel no longer inherits post-only footer chrome, and the word-search reel gets a small theme badge while the static post keeps the polished footer treatment.

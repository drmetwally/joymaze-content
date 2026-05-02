# OpenClaw Audit Report — OC-020 (2026-05-01)

## Changes committed: `c5a9eaa`

### Changes summary

**`scripts/generate-activity-video.mjs`**
- `hooksPoolData` loaded at startup alongside other intelligence files — reads `config/hooks-activity.json`
- `pickHook(activityType)` now returns `{ text, style }` (was: plain string)
- Falls back to `STATIC_DEFAULT_HOOKS` with style when no pool match
- `buildRenderProps()` now receives `hookStyle` and passes it through to render props
- `activityChallengeSchema` default now includes `hookStyle: 'challenge'`

**`remotion/compositions/ActivityChallenge.jsx`**
- `ActivityChallenge` now accepts `hookStyle` prop
- `TitleStrip` now accepts `hookStyle` prop with 5 variants:
  - `challenge` — dark navy/gold glow
  - `urgent` — dark red/orange glow
  - `playful` — orange/red/yellow glow
  - `curiosity` — deep purple/cyan glow
  - `bold` — solid black, title 72px (vs 60px)
- `JoyoWatermark` import removed; `showJoyo` now renders `PuzzleJoyoLayer` instead
- `PuzzleJoyoLayer` (inline):
  - **Maze challenge**: Joyo running springs in at START, trophy pulses at FINISH
  - **Maze solve**: crossfades running→celebrating 1.8s before end, celebrating at bottom-center
  - **All other types**: celebrating Joyo appears only at last 1.8s of solve

### Verification

```bash
node scripts/generate-activity-video.mjs --id 2026-04-23-activity-maze-archive-test --dry-run
```
Run 3× — observed different hooks from pool each run, all maze-styled:
- "Only 1 in 5 kids escape this maze first try 🏆" (challenge)
- "Drop a ⭐ if your kid solves it first!" (challenge)
- "Most adults quit before the timer ends 😅" (bold)

`hookStyle` flows from `pickHook` → `buildRenderProps` → `ActivityChallenge` → `TitleStrip` correctly.

### Files not touched (per spec)
- `scripts/render-video.mjs`
- `scripts/generate-maze-assets.mjs`
- `remotion/components/MazeSolverReveal.jsx`
- `remotion/components/WordSearchReveal.jsx`
- `remotion/compositions/AsmrReveal.jsx`
- `remotion/compositions/StoryEpisode.jsx`

### Status
**OC-020 COMPLETE** — ready for OC-021 (WordSearchJoyoOverlay)
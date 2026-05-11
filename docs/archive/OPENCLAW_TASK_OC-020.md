# OpenClaw Task — OC-020: Maze Visual Polish + Hook System

Date assigned: 2026-05-01
Priority: HIGH — blocks daily reel output
Audit required: Yes — write report at `docs/OPENCLAW_REPORT_2026-05-01_oc-020.md` when done

---

## What this task does

Two tightly coupled changes that both land in the maze challenge reel:

1. **Joyo replaces the corner watermark** — Joyo appears contextually in each puzzle type, not as a brand sticker in the corner. Maze is first.
2. **Hook system becomes type-aware** — hooks are no longer static strings. They come from a typed pool in `config/hooks-activity.json`, carry a visual style, and the TitleStrip renders that style.

---

## Files to change

| File | Change |
|------|--------|
| `remotion/compositions/ActivityChallenge.jsx` | Maze Joyo integration + TitleStrip style variants |
| `remotion/components/JoyoWatermark.jsx` | No change — just stop using it in ActivityChallenge |
| `scripts/generate-activity-video.mjs` | Update `pickHook()` to read hooks-activity.json + return style |

**Do NOT touch:** `scripts/render-video.mjs`, `scripts/generate-maze-assets.mjs`, `remotion/components/MazeSolverReveal.jsx`, `remotion/components/WordSearchReveal.jsx`, `remotion/compositions/AsmrReveal.jsx`, `remotion/compositions/StoryEpisode.jsx`

---

## Part 1 — Hook system

### `config/hooks-activity.json`
Already seeded at `config/hooks-activity.json`. Do not modify this file. OC only reads it.

### `scripts/generate-activity-video.mjs` — update `pickHook()`

Current signature: `pickHook(activityType)` returns a string.
New signature: `pickHook(activityType)` returns `{ text: string, style: string }`.

New logic:
1. Read `config/hooks-activity.json` at startup (alongside the other intelligence files in `loadActivityIntelligence()`)
2. Filter hooks by `puzzle_type === activityType` AND `performance_score >= 0`
3. If matching hooks exist: pick randomly (all scores are 0 at start, so uniform random)
4. If no match: fall back to `{ text: STATIC_DEFAULT_HOOKS[activityType], style: 'challenge' }`
5. Return `{ text, style }`

Update `buildRenderProps()` to include `hookStyle: hook.style` in the returned props object.

Update the `activityChallengeSchema` default: add `hookStyle: 'challenge'`.

The `ActivityChallenge` composition already receives all renderProps — `hookStyle` will flow through automatically.

---

## Part 2 — TitleStrip style variants

`TitleStrip` currently has one fixed dark style. Add a `hookStyle` prop with 5 variants:

| hookStyle | Background | Text color | Glow / accent |
|-----------|-----------|------------|---------------|
| `challenge` | `linear-gradient(180deg, rgba(14,20,38,0.95) 0%, rgba(22,30,52,0.90) 100%)` | `#FFFFFF` | gold `rgba(255,215,70,0.28)` box-shadow |
| `urgent` | `linear-gradient(180deg, rgba(28,8,8,0.96) 0%, rgba(44,12,8,0.92) 100%)` | `#FFFFFF` | red-orange `rgba(255,80,40,0.30)` box-shadow |
| `playful` | `linear-gradient(180deg, rgba(220,70,30,0.92) 0%, rgba(240,100,40,0.88) 100%)` | `#FFFFFF` | yellow `rgba(255,220,50,0.25)` box-shadow |
| `curiosity` | `linear-gradient(180deg, rgba(18,8,40,0.95) 0%, rgba(28,12,60,0.92) 100%)` | `#FFFFFF` | cyan `rgba(50,240,220,0.22)` box-shadow |
| `bold` | `#000000` | `#FFFFFF` | none — increase title fontSize from 60 to 72 |

The countdown number column keeps its existing style (radial yellow glow background) in all variants — only the outer strip background changes.

---

## Part 3 — Maze Joyo integration

### Remove JoyoWatermark from maze (and all puzzle types)

In `ActivityChallenge.jsx`, the `{showJoyo ? <JoyoWatermark visible /> : null}` line renders Joyo in the corner for all types. **Replace this** with a new `<PuzzleJoyoLayer>` component that is type-aware (see below). Keep `showJoyo` prop to allow disabling entirely, but when enabled, Joyo is now contextual, not a corner watermark.

### New component: `PuzzleJoyoLayer` (inline in ActivityChallenge.jsx, no new file)

Props it receives from `ActivityChallenge`:
- `puzzleType` — which type is rendering
- `frameBounds` — `{ x, y, width, height }` where the puzzle image renders in the 1080×1920 video
- `frame` — current frame
- `fps`
- `challengeFrames` — frame count for countdown phase
- `solveStart` — frame at which solve reveal begins
- `solveFrames` — duration of solve phase
- `mazeStartFraction` — `{ x, y }` normalized, or null
- `mazeFinishFraction` — `{ x, y }` normalized, or null

### Maze-specific behavior (puzzleType === 'maze')

**During challenge phase (frame < solveStart):**

START marker — render `joyo_running.png`:
- If `mazeStartFraction` is provided: position at `frameBounds.x + mazeStartFraction.x * frameBounds.width`, `frameBounds.y + mazeStartFraction.y * frameBounds.height`
- If null: position at `frameBounds.x + 12`, `frameBounds.y + 12` (top-left of puzzle area)
- Size: 90px × 90px
- Spring bounce-in: enters from scale 0 → 1 over first 12 frames using `spring({ stiffness: 300, damping: 12 })`
- Continuous idle: gentle bob — `translateY(Math.sin(frame / fps * Math.PI * 2 / 1.4) * 5)` (±5px, ~1.4s period)
- Transform origin: bottom center

FINISH marker — pure JSX trophy (no external file):
```jsx
const TrophyMarker = ({ x, y }) => (
  <div style={{
    position: 'absolute', left: x, top: y,
    transform: 'translate(-50%, -50%)',
    width: 72, height: 72,
    borderRadius: '50%',
    background: 'radial-gradient(circle, #FFE066 0%, #FFB800 60%, #CC8800 100%)',
    border: '3px solid rgba(255,255,255,0.7)',
    boxShadow: '0 0 18px rgba(255,200,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 38, zIndex: 8,
  }}>🏆</div>
);
```
- Position: `mazeFinishFraction` coordinates (same mapping as START), or bottom-right of puzzle area if null
- Pulse: `scale(1 + Math.sin(frame / fps * Math.PI * 2 / 1.2) * 0.06)` — slow breathe

**During solve phase (frame >= solveStart):**
- Joyo running + trophy both stay visible during the solve reveal
- At `solveStart + solveFrames - fps * 1.8` (1.8s before end): `joyo_running.png` cross-fades out (opacity 1→0 over 12 frames) and `joyo_celebrating.png` cross-fades in (opacity 0→1 over 12 frames)
- `joyo_celebrating.png` position: horizontally centered within `frameBounds`, vertically at `frameBounds.y + frameBounds.height - 100` (just inside bottom of puzzle area)
- Size: 110px × 110px
- Entry spring: scale 0 → 1 over 10 frames, `stiffness: 320, damping: 10`

### All other puzzle types (non-maze) — default Joyo behavior

Keep `joyo_celebrating.png` appearing in the last 1.8s of every solve phase at the same bottom-center position. This ensures every reel ends with Joyo celebrating regardless of type. No other Joyo presence during challenge or solve for non-maze types yet (Word Search gets its own treatment in OC-021).

---

## Test

Render a maze challenge reel:
```bash
node scripts/generate-activity-video.mjs --id 2026-04-30-slot01-forest-animals-maze --force
```

Verify:
1. Hook text comes from `hooks-activity.json` maze pool (not the static default)
2. TitleStrip style matches the selected hook's `style` field (e.g. `bold` = black bg + bigger font)
3. Joyo running visible at maze start corner — springs in, bobs gently
4. Trophy visible at maze finish corner — pulses with glow
5. At ~1.8s before video end: Joyo switches from running → celebrating
6. No Joyo watermark in the corner
7. Re-run 3× — observe different hooks and different TitleStrip colors across runs

Report result in `docs/OPENCLAW_REPORT_2026-05-01_oc-020.md`.

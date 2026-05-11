# CODEX ANIMATION BRIEF — JoyMaze Longform Story Engine

> This document gives Codex everything needed to build the animation improvements
> to the longform story Remotion pipeline. Read this entire file before writing any code.
> Build Tier 1 first. Do NOT start Tier 2 until Tier 1 is confirmed working.

---

## 1. Project Context (read this once)

**JoyMaze** is a kids activity app (ages 4–8). The longform story engine produces
5–7 minute YouTube videos and short TikTok clips. The audience is PARENTS who watch
with their children or share the video. Every animation decision must serve one of the
7 psychological triggers below — this is not decoration, it is the mechanism.

**Writing voice:** Warm, hypnotic, emotionally resonant. Full guide at
`config/writing-style.md` — read it if you write any copy (caption, narration instruction,
overlay text). The 4 pillars: ATTENTION, EMOTION, IMAGERY, RHYTHM.

**Intelligence engine:** Dynamic content pools live in:
- `config/content-intelligence.json` — themes, hooks
- `config/hooks-library.json` — scroll-stopper patterns
- `config/cta-library.json` — call-to-action formulas
- `config/psychology-triggers.json` — **authoritative trigger definitions** (read below)

---

## 2. Psychology Trigger Map (non-negotiable)

Every episode carries a `psychologyMap` field in `episode.json`:
```json
"psychologyMap": {
  "hook":     "CURIOSITY_GAP",
  "act1":     "NOSTALGIA",
  "act2":     "IDENTITY_MIRROR",
  "act3":     "COMPLETION_SATISFACTION",
  "activity": "CHALLENGE",
  "outro":    "SCREEN_RELIEF"
}
```

These map to triggers defined in `config/psychology-triggers.json`. The trigger is NOT
a label — it defines the *visual treatment* for that segment of video.

| Trigger | Visual Meaning |
|---------|---------------|
| CURIOSITY_GAP | Incomplete information, visual withholding — never resolve too early |
| NOSTALGIA | Warm, analog, golden-hour warmth. Soft. Like something that has always existed. |
| IDENTITY_MIRROR | Parent-adjacent framing. Quiet pride. The choice already made. |
| COMPLETION_SATISFACTION | Reveal arc. Witnessing something become complete. |
| CHALLENGE | Peak engagement. Tension. Brow furrowed. Nothing finished yet. |
| SCREEN_RELIEF | Relief. The discarded screen visible. Something better has replaced it. |

**Rule:** If an animation decision does not serve the trigger assigned to that act,
do not add it. Ask: "Does this make a parent FEEL the trigger from the visuals alone?"

---

## 3. Current File Map — What Exists, What to Touch

### Files you WILL modify:
```
remotion/components/longform/story/StoryActScene.jsx     ← primary target
remotion/compositions/StoryLongFormEpisode.jsx           ← Series-level transitions
remotion/components/longform/story/StoryHookScene.jsx    ← Tier 2 only
```

### Files you WILL NOT touch unless explicitly listed:
```
scripts/generate-story-longform-brief.mjs   ← brief generator (separate task)
scripts/generate-narration.mjs              ← TTS engine (separate task)
scripts/render-story-longform.mjs           ← render script (do not touch)
remotion/index.jsx                          ← composition registry (do not touch)
remotion/compositions/AnimalFactsEpisode.jsx
remotion/compositions/PuzzleCompilation.jsx
remotion/components/longform/animal/*
config/*                                    ← all config files (read only)
scripts/*                                   ← all scripts (do not touch)
```

### Current StoryActScene.jsx state (as of 2026-04-17):
- Ken Burns: 6 directional patterns in `KB_MOVES[]`, cycling by `sceneIndex % 6`
- Scale: 1.0→1.16 or 1.18 depending on direction
- Background music: `<Audio volume={0.22} />`
- Caption: `PillCaption` — word-by-word typewriter at rate `floor(frame/4)+1`
- No scene entrance animation
- No cross-fade between scenes (hard cut)
- No music ducking

### Current StoryLongFormEpisode.jsx state:
- `Series` with `Series.Sequence` per scene
- `durationInFrames = getSceneFrames(scene)` = `scene.durationSec * 30`
- Passes `narrationPath`, `backgroundMusicPath`, `scene` to each `StoryActScene`

---

## 4. TIER 1 — Core Animation Build

Build these 5 items IN THIS ORDER. Each is independent enough to test separately.
**4.3 first** — biggest visible quality jump per line of code.

---

### 4.1 Scene Entrance Animation

**File:** `remotion/components/longform/story/StoryActScene.jsx`

**Change:** Add entrance scale + opacity on the image container for the first 12 frames.

```
frame 0–12:  scale = interpolate(frame, [0, 12], [0.96, 1.0])
             opacity = interpolate(frame, [0, 10], [0, 1])
```

Apply this to the SAME `AbsoluteFill` that wraps the Ken Burns image container.
Stack this multiplicatively with Ken Burns scale: `totalScale = entranceScale * kbScale`.

**Do NOT apply entrance to:** the `PillCaption` component (it has its own opacity fade).
**Do NOT apply entrance to:** `<Video>` clips (animatedClip path) — they self-start.

---

### 4.2 Music Ducking

**File:** `remotion/components/longform/story/StoryActScene.jsx`

**Change:** When a narration audio exists, lower background music volume during narration.

Assume narration ends at `durationInFrames - 60` (2s tail at 30fps = 60 frames).

```js
const musicVolume = narrationPath
  ? interpolate(
      frame,
      [0, 8, durationInFrames - 60, durationInFrames - 30],
      [0.22, 0.06, 0.06, 0.22],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    )
  : 0.22;
```

Pass `volume={musicVolume}` to the background music `<Audio>` element.

---

### 4.3 Phrase-Sync Caption ← START HERE (biggest quality jump)

**File:** `remotion/components/longform/story/StoryActScene.jsx` — `PillCaption` component

**Change:** Replace the word-by-word drip (`floor(frame/4)+1`) with phrase-pop timing.

Split `text` on `. `, `, `, `? `, `! ` into phrases. Show one phrase at a time.
Each phrase displays for `Math.floor(durationInFrames / phrases.length)` frames.

```js
const phrases = text
  ? text.split(/(?<=[.!?,])\s+/).filter(Boolean)
  : [text || ''];

const phraseIndex = Math.min(
  Math.floor(frame / Math.max(1, Math.floor(durationInFrames / phrases.length))),
  phrases.length - 1
);
const displayText = phrases[phraseIndex];
```

Keep the existing opacity fade-in/fade-out envelope (`interpolate` on opacity).
Keep the `translateY` slide-in on first appearance.
Remove the word-drip logic entirely — show the full current phrase immediately.

---

### 4.4 Image Cycling (max 5s per image window)

**Files:** `remotion/compositions/StoryLongFormEpisode.jsx` + `remotion/components/longform/story/StoryActScene.jsx`

**Why:** Video rule: max 5s per image/illustration. Narration can be 7–10s.
Images cycle automatically — no manual episode.json edits, no imagePool field needed.

**Approach:** Collect ALL scene images across all 3 acts into a single flat array.
Pass it to every `StoryActScene` as `allEpisodeImages`. When a scene lasts longer than 5s,
the component advances through that array starting at the current scene's position.

**StoryLongFormEpisode.jsx change:**

```js
// Collect ALL resolved image paths for the episode (all 3 acts, in scene order)
const allEpisodeImages = [0, 1, 2]
  .flatMap((actIdx) => getActScenes(episode, actIdx))
  .sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0))
  .map((s) => (s.imagePath ? resolveEpisodeAsset(episodeFolder, s.imagePath) : ''))
  .filter(Boolean);
```

Pass it to each `StoryActScene`:
```jsx
<StoryActScene
  scene={{ ...scene, imagePath: resolveEpisodeAsset(episodeFolder, scene?.imagePath || '') }}
  allEpisodeImages={allEpisodeImages}
  narrationPath={...}
  backgroundMusicPath={...}
  actNumber={actIndex + 1}
/>
```

**StoryActScene.jsx props change:**

```jsx
export const StoryActScene = ({
  scene = {},
  narrationPath = '',
  backgroundMusicPath = '',
  allEpisodeImages = [],   // ← NEW — flat array of all resolved image paths
}) => {
```

**Cycling logic inside StoryActScene:**

```js
const WINDOW_FRAMES = 4 * 30; // 120 frames = 4 seconds per image window (retention-optimized)
const windowIndex = Math.floor(frame / WINDOW_FRAMES);
const frameInWindow = frame % WINDOW_FRAMES;

// Start cycling from this scene's own image; advance through the episode pool
const startIndex = allEpisodeImages.indexOf(imageSrc);
const poolStart = startIndex >= 0 ? startIndex : 0;
const activeImageSrc = allEpisodeImages.length > 1
  ? allEpisodeImages[(poolStart + windowIndex) % allEpisodeImages.length]
  : imageSrc;
```

Use `activeImageSrc` in the `<Img>` element instead of `imageSrc`.

**KB direction per window** (different direction each time image changes):
```js
const kbIndex = ((scene.sceneIndex ?? 1) + windowIndex) % KB_MOVES.length;
const kb = KB_MOVES[kbIndex];
const kbProgress = interpolate(frameInWindow, [0, WINDOW_FRAMES], [0, 1], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
});
const scale = kb.startS + (kb.endS - kb.startS) * kbProgress;
const x = kb.startX + (kb.endX - kb.startX) * kbProgress;
const y = kb.startY + (kb.endY - kb.startY) * kbProgress;
```

(Remove the existing `const progress` + Ken Burns math — replace with `kbProgress` above.)

**Window cross-fade** (6-frame soft cut when image changes):
```js
const windowFadeOpacity = interpolate(frameInWindow, [0, 6], [0, 1], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
});
```

Apply `windowFadeOpacity` on the image `<AbsoluteFill>` container (multiply with entrance opacity only on `windowIndex === 0`).

If `allEpisodeImages` is empty, fall back to `imageSrc` with no cycling. Fully backwards compatible.

---

### 4.5 Cross-Fade Transitions Between Scenes

**File:** `remotion/compositions/StoryLongFormEpisode.jsx`

**Why:** Hard cuts between scenes feel jarring. 12-frame (0.4s) dissolve between each act scene.

**Approach:** `@remotion/transitions` is NOT installed. Use manual opacity fade.

Add `sceneFadeOpacity` in `StoryActScene.jsx`:

```js
const FADE_FRAMES = 12;
const sceneFadeOpacity = interpolate(
  frame,
  [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
  [0, 1, 1, 0],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
);
```

Apply to the root `<AbsoluteFill style={{ opacity: sceneFadeOpacity }}>`.
As Scene A fades out and Scene B fades in simultaneously, this creates a dissolve.

Remove the opacity fade from `PillCaption` (to avoid double-fade on caption text).
The root AbsoluteFill opacity now controls the full scene fade envelope.

No changes needed in `StoryLongFormEpisode.jsx` for this — the dissolve is implicit
from each component's own fade-in + fade-out envelopes overlapping in the Series timeline.

**IMPORTANT:** Do NOT add transition between Hook and Act 1, or between Act 3 and Bridge/Outro.
Those are intentional hard cuts (act boundary = intentional rhythm break).
Transitions only between consecutive scenes within the same act block.

---

## 5. TIER 2 — Psychology + Hook

> Build only after Tier 1 is confirmed working on a real render.

---

### 5.1 Per-Act Psychology Color Treatments

**File:** `remotion/components/longform/story/StoryActScene.jsx`

Add an optional `psychologyTrigger` prop. Apply a color overlay as `AbsoluteFill` with
`pointerEvents: 'none'` and `mixBlendMode`.

```jsx
export const StoryActScene = ({
  ...
  psychologyTrigger = '',  // ← NEW
}) => {
```

Overlay treatments:

| Trigger | Color | Opacity | Blend |
|---------|-------|---------|-------|
| NOSTALGIA | `rgba(255, 200, 100, 1)` | 0.08 | `multiply` |
| IDENTITY_MIRROR | Vignette (radial gradient black edges) | 0.12 at edges | `normal` |
| COMPLETION_SATISFACTION | none by default; brightness pulse on last 30 frames | — | — |
| CURIOSITY_GAP | Slight desaturation + cool blue tint `rgba(100,120,255,1)` | 0.05 | `screen` |

For COMPLETION_SATISFACTION brightness pulse:
```js
const brightnessPulse = trigger === 'COMPLETION_SATISFACTION'
  ? interpolate(frame, [durationInFrames - 30, durationInFrames - 15, durationInFrames], [1, 1.08, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })
  : 1;
// Apply as: style={{ filter: `brightness(${brightnessPulse})` }} on image container
```

**StoryLongFormEpisode.jsx** — pass trigger per act:
```jsx
const ACT_TRIGGERS = ['NOSTALGIA', 'IDENTITY_MIRROR', 'COMPLETION_SATISFACTION'];

<StoryActScene
  ...
  psychologyTrigger={episode.psychologyMap?.[`act${actIndex + 1}`] || ACT_TRIGGERS[actIndex] || ''}
/>
```

---

### 5.2 Flash-Forward Hook Redesign

**File:** `remotion/components/longform/story/StoryHookScene.jsx`

**Why:** Current hook shows Joyo waving for 20s. This is weak. The CURIOSITY_GAP trigger
requires showing the climax moment briefly before withholding it.

**Change:** At frame 30, show the Act 3 climax image for 9 frames (0.3s) as a flash overlay,
then cut back to hook. This creates the "I need to see how this ends" open loop.

**New prop:** `flashForwardSrc` (string) — path to Act 3 climax scene image.

```jsx
export const StoryHookScene = ({
  hookQuestion,
  jinglePath,
  joyo_png_path,
  durationSec,
  flashForwardSrc = '',   // ← NEW
}) => {
```

Flash implementation:
```jsx
const flashOpacity = flashForwardSrc
  ? interpolate(frame, [30, 33, 38, 42], [0, 1, 1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })
  : 0;
```

Add an `<Img>` overlay with `position: absolute`, full cover, and `opacity: flashOpacity`.

**StoryLongFormEpisode.jsx** — derive the Act 3 climax image path:
```jsx
const act3Scenes = getActScenes(episode, 2);
const climaxScene = act3Scenes[act3Scenes.length - 1]; // last scene of Act 3
const flashForwardSrc = climaxScene?.imagePath
  ? resolveEpisodeAsset(episodeFolder, climaxScene.imagePath)
  : '';

<StoryHookScene
  ...
  flashForwardSrc={flashForwardSrc}
/>
```

---

### 5.3 Heartbeat Pulse on Act 3 Climax Scene

**File:** `remotion/components/longform/story/StoryActScene.jsx`

**When:** `psychologyTrigger === 'COMPLETION_SATISFACTION'` AND this is the last scene of Act 3
(determined by a new `isClimaxScene` prop from StoryLongFormEpisode.jsx).

```jsx
// Add to props:
isClimaxScene = false,

// In render:
const climaxPulse = isClimaxScene && trigger === 'COMPLETION_SATISFACTION'
  ? 1 + 0.03 * Math.sin((frame / 30) * 2 * Math.PI * 1.1)  // 1.1 beats/sec
  : 1;

// Apply as additional scale multiplier on image container
```

---

## 6. Testing Protocol

After each tier item, render ep02 and check:

**Tier 1 checklist:**
- [ ] 4.1: First 12 frames of each scene scale in smoothly. No pop.
- [ ] 4.2: Background music noticeably quieter when narration plays. Rises at end.
- [ ] 4.3: Captions appear as phrases, not word-by-word drip. One phrase visible at a time.
- [ ] 4.4: Any scene with durationSec > 5 shows 2+ different images. Each window has different KB direction.
- [ ] 4.5: Smooth dissolve between consecutive act scenes. Hard cuts at Hook→Act1 and Act3→Bridge.

**Render command:**
```bash
node scripts/render-story-longform.mjs --episode output/longform/story/ep02-bennys-big-spring-help --orientation horizontal
```

**Dry run first:**
```bash
node scripts/render-story-longform.mjs --episode output/longform/story/ep02-bennys-big-spring-help --dry-run
```

---

## 7. What NOT to Build

- Do NOT add any new npm scripts (Ahmed manages package.json separately)
- Do NOT modify `scripts/generate-story-longform-brief.mjs` (brief engine is a separate task)
- Do NOT modify `scripts/generate-narration.mjs` (TTS switch is a separate task)
- Do NOT add episode.json auto-generation logic (the render/brief scripts handle that)
- Do NOT add a progress bar or time indicator to scene videos
- Do NOT redesign the Hook from scratch (only add flash-forward in Tier 2)
- Do NOT touch Animal Facts or Puzzle Compilation compositions
- Do NOT add Joyo mascot to act scenes (no branding during story scenes)
- Do NOT add outro or CTA overlay to any act scene (video rules: clean loop)
- Do NOT add any new third-party npm packages without confirming with Ahmed first
  - Exception: `@remotion/transitions` if already in package.json

---

## 8. Open Questions (resolve before starting Tier 2)

1. **imagePool population:** Should the brief generator auto-assign `imagePool` to long-narration scenes, or should Ahmed manually add `imagePool` to episode.json? (Tier 1 works without this — it just uses same image with different KB direction.)
2. **OpenAI TTS switch timing:** Will happen after Tier 1. New narration will change durationSec values — rerun `npm run longform:story:narrate` after switch to refresh episode.json timing.

# Long-Form Video Engine — Codex Implementation Spec
Last updated: 2026-04-16
Status: Approved for build — Claude architects, Codex implements

> **STRICT RULES FOR CODEX:**
> 1. ESM modules only (.mjs scripts, .jsx components)
> 2. Never modify existing scripts, components, or config files
> 3. Only two existing files may be touched: `package.json` (add scripts only) and `remotion/index.jsx` (add registrations only)
> 4. Follow existing patterns exactly — config loading, Groq call, Remotion structure — documented below
> 5. If a pattern is unclear, read the reference file listed, do not invent
> 6. Yellow pill overlay style on all video text: `rgba(255,210,0,0.93)`, borderRadius `rx=22`, dark text (#1a1a1a)

---

## Build Phases — Execute in Order

```
Phase 1: generate-story-longform-brief.mjs     ← Planning layer (Groq)
Phase 2: generate-suno-pool.mjs                ← Suno prompt pool (Groq)
Phase 3: generate-narration.mjs                ← TTS narration (Coqui)
Phase 4: animate-scenes.mjs                    ← Image animation (SVD / RunwayML fallback)
Phase 5: Remotion components (story format)    ← 5 new components
Phase 6: StoryLongFormEpisode.jsx              ← Master composition
Phase 7: render-story-longform.mjs             ← Render orchestrator
Phase 8: generate-animal-facts-brief.mjs       ← Animal facts planning (Groq)
Phase 9: Animal facts Remotion components      ← 5 new components
Phase 10: AnimalFactsEpisode.jsx               ← Animal facts composition
Phase 11: generate-puzzle-compilation.mjs      ← Puzzle compilation planner
Phase 12: PuzzleCompilation.jsx                ← Puzzle compilation composition
Phase 13: setup/install-coqui.sh               ← One-time Coqui setup script
```

---

## Existing Pattern References

Before writing any new file, read the reference file for the pattern:

| Pattern | Reference file |
|---------|---------------|
| Config loading (try/catch null defaults) | `scripts/generate-asmr-brief.mjs` → `loadContext()` |
| Groq API call (json_object response) | `scripts/generate-asmr-brief.mjs` → `callGroq()` |
| Remotion functional component | `remotion/components/AsmrReveal/ColoringReveal.jsx` |
| Remotion composition registration | `remotion/index.jsx` |
| Output folder creation + JSON write | `scripts/generate-asmr-brief.mjs` → `main()` save block |
| Psychology trigger injection in prompt | `scripts/generate-challenge-brief.mjs` → `buildPrompt()` |
| npm script pattern | `package.json` → existing `animate:asmr:*` scripts |

---

## Phase 1 — `scripts/generate-story-longform-brief.mjs`

### Purpose
Groq-powered planner. Scans `output/longform/story/` for next episode number. Calls Groq to generate a full episode plan. Writes `output/longform/story/ep{N}-{slug}/episode.json`.

### CLI
```
node scripts/generate-story-longform-brief.mjs              # Preview
node scripts/generate-story-longform-brief.mjs --save       # Write episode.json
node scripts/generate-story-longform-brief.mjs --dry-run    # Print prompt, no API call
```

### Imports
```javascript
import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
```

### Constants
```javascript
const ROOT = path.resolve(__dirname, '..');
const STORY_LONGFORM_DIR = path.join(ROOT, 'output', 'longform', 'story');
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_MAX_TOKENS = 1200;
```

### `async function loadContext()`
Load all config files. EVERY load is wrapped in try/catch — null if missing. Never throw.
```javascript
// Load these (same pattern as generate-asmr-brief.mjs loadContext):
// - config/writing-style.md           → styleGuide (string)
// - config/trends-this-week.json      → trends (object | null)
// - config/competitor-intelligence.json → competitor (object | null)
// - config/hooks-library.json         → hooksData (object | null)
// - config/theme-pool-dynamic.json    → dynamicThemes (object | null)
// - config/performance-weights.json   → perfWeights (object | null)
// - config/psychology-triggers.json   → psychTriggers (object | null)
// - config/suno-prompt-pool.json      → sunoPool (object | null)

// Scan output/longform/story/ for existing episodes — extract episode numbers
// recentEpisodes: string[] of folder names, last 5
// nextEpisodeNumber: highest N + 1, default 1 if empty

return { styleGuide, trends, competitor, hooksData, dynamicThemes, perfWeights, psychTriggers, sunoPool, recentEpisodes, nextEpisodeNumber };
```

### `function buildPrompt(context)`
Returns a single string (system + user in one block — same as generate-asmr-brief.mjs pattern).

Required output fields from Groq (JSON):
```javascript
{
  title: string,           // "The Brave Little Turtle"
  slug: string,            // "brave-little-turtle"
  theme: string,           // "ocean-adventure"
  hookQuestion: string,    // The CURIOSITY_GAP question — answered only in Act 3
  acts: [                  // Always exactly 3 acts
    {
      actNumber: 1 | 2 | 3,
      triggerNote: string, // Which trigger + why (for audit)
      scenes: [            // Always exactly 4 scenes per act
        {
          sceneIndex: number,    // 1-12 globally
          narration: string,     // 1 sentence, ≤18 words, sensory/specific
          imagePromptHint: string // Brief hint for Gemini image generation
        }
      ]
    }
  ],
  ctaText: string,         // 4-8 word activity CTA
  sunoBackground: string   // Ambient music prompt — select from sunoPool.pools.story_background_ambient if available, else generate fresh
}
```

Psychology trigger instructions must be injected if `psychTriggers` is not null:
- Act 1 → NOSTALGIA: first scene narration must open in a sensory moment
- Act 2 → IDENTITY_MIRROR: resolution NOT shown here; hero faces problem
- Act 3 → COMPLETION_SATISFACTION: hero wins through ONE specific virtuous action (not named)
- Hook → CURIOSITY_GAP: question never answered in hookQuestion field itself

### `function buildEpisodeJson(brief, context)`
Returns the full episode.json object. See schema section below.

### `function buildBriefMd(brief, episodeDir)`
Returns markdown string. Same format as generate-asmr-brief.mjs `buildBriefMd`. Sections:
- Episode metadata
- Step 1: Generate 12 scene images in Gemini (list imagePromptHint per scene)
- Step 2: Drop background.mp3 (Suno prompt provided)
- Step 3: Run narration generation
- Step 4: Run scene animation
- Step 5: Run render

### `async function main()`
1. Load context
2. If DRY_RUN: print prompt, exit
3. Call Groq
4. Print preview (title, hook, act summaries)
5. If not SAVE: print "Run with --save"
6. If SAVE: create folder, write episode.json + brief.md

---

## episode.json Schema (canonical — all phases must use this exact structure)

```json
{
  "format": "story-longform",
  "episodeNumber": 1,
  "title": "The Brave Little Turtle",
  "slug": "brave-little-turtle",
  "theme": "ocean-adventure",
  "date": "2026-04-16",
  "psychologyMap": {
    "hook": "CURIOSITY_GAP",
    "act1": "NOSTALGIA",
    "act2": "IDENTITY_MIRROR",
    "act3": "COMPLETION_SATISFACTION",
    "activity": "CHALLENGE",
    "outro": "SCREEN_RELIEF"
  },
  "hookQuestion": "What would you do if you were lost in the deep, deep ocean?",
  "acts": [
    {
      "actNumber": 1,
      "triggerNote": "NOSTALGIA — sensory grounding",
      "scenes": [
        {
          "sceneIndex": 1,
          "narration": "The sun was warm on the sand that morning, and the little turtle's shell was still cool from the night.",
          "imagePromptHint": "baby sea turtle on warm sandy beach, golden morning light, close-up",
          "imagePath": "scene-01.png",
          "animatedClip": "scene-01.mp4",
          "durationSec": 15,
          "narrationFile": "narration-scene-01.wav"
        }
      ]
    }
  ],
  "hookJingleKey": "hook_jingle_01",
  "outroJingleKey": "outro_jingle_01",
  "activityFolder": "output/asmr/maze-ocean-animals",
  "sunoPrompts": {
    "background": "gentle ocean waves, soft piano melody, warm, children's educational, no lyrics, 3 minutes",
    "backgroundDropPath": "background.mp3"
  },
  "jingleDropPaths": {
    "hook": "hook-jingle.mp3",
    "bridge": "bridge-jingle.mp3",
    "outro": "outro-jingle.mp3"
  },
  "totalDurationSec": 325,
  "rendered": false
}
```

**Key rules:**
- `imagePath` and `animatedClip` start empty string `""` — filled by animate-scenes.mjs after generation
- `narrationFile` starts empty string `""` — filled by generate-narration.mjs
- `jingleDropPaths` reference files the user drops manually — render script checks existence
- `activityFolder` — optional, can be empty string if no activity segment

---

## Phase 2 — `scripts/generate-suno-pool.mjs`

### Purpose
Groq-powered Suno prompt generator. Appends new prompts to `config/suno-prompt-pool.json`. Run to expand pool over time.

### CLI
```
node scripts/generate-suno-pool.mjs                        # Generate 5 prompts per pool type
node scripts/generate-suno-pool.mjs --type story_background # One pool type only
node scripts/generate-suno-pool.mjs --count 10             # Custom count
node scripts/generate-suno-pool.mjs --dry-run              # Print, don't save
```

### Pool types (always maintain all 5):
```javascript
const POOL_TYPES = [
  'story_background_ambient',   // Acts 1-3 ambient music for story episodes
  'hook_jingle',                // Recurring Joyo hook intro (rotate per episode)
  'outro_jingle',               // Recurring Joyo outro (rotate per episode)
  'animal_background_ambient',  // Ambient for animal facts episodes
  'puzzle_compilation_bgm',     // Background music for 1-hour puzzle compilations
];
```

### `config/suno-prompt-pool.json` schema
```json
{
  "version": "1.0",
  "lastExpanded": "2026-04-16",
  "pools": {
    "story_background_ambient": [
      {
        "id": "sbg_001",
        "prompt": "gentle forest ambiance, soft piano melody, warm and whimsical, children's educational video background, no lyrics, 3 minutes",
        "style": "ambient",
        "mood": "warm",
        "themeHint": "nature",
        "usedCount": 0
      }
    ],
    "hook_jingle": [],
    "outro_jingle": [],
    "animal_background_ambient": [],
    "puzzle_compilation_bgm": []
  }
}
```

### Selection logic in `generate-story-longform-brief.mjs`
When `sunoPool` is not null and pool has entries:
- Pick the entry with lowest `usedCount` from the matching pool type
- Increment `usedCount` and write pool back to disk
- If pool is empty, generate a fresh prompt via Groq inline

---

## Phase 3 — `scripts/generate-narration.mjs`

### Purpose
Reads episode.json. Generates one WAV file per scene narration via Coqui TTS (local). Writes WAV files to episode folder. Updates episode.json with `narrationFile` paths.

### CLI
```
node scripts/generate-narration.mjs --episode output/longform/story/ep01-slug
node scripts/generate-narration.mjs --episode output/longform/story/ep01-slug --dry-run
```

### Coqui TTS call (shell out via child_process.execSync)
```javascript
// Command pattern:
// python -m TTS --text "{narration}" --model_name "tts_models/en/vctk/vits" --speaker_idx p225 --out_path "{outputPath}"
// Speaker p225 = warm female voice in VCTK VITS model
// Model: tts_models/en/vctk/vits (specified in spec — do not deviate)
```

### Behavior
- For each scene in episode.json (all 12 scenes across 3 acts):
  - If `narrationFile` already exists and WAV file exists on disk: skip (idempotent)
  - Generate WAV via Coqui shell command
  - Update `scene.narrationFile` = relative path from episode folder
- Write updated episode.json back to disk
- Print progress: "Scene 01/12: [narration text]"

---

## Phase 4 — `scripts/animate-scenes.mjs`

### Purpose
Reads episode.json. For each scene: if `animatedClip` is empty and `imagePath` PNG exists on disk, animate using SVD (local) with RunwayML Gen-3 as fallback. Writes MP4 per scene. Updates episode.json with `animatedClip` paths.

### CLI
```
node scripts/animate-scenes.mjs --episode output/longform/story/ep01-slug
node scripts/animate-scenes.mjs --episode output/longform/story/ep01-slug --dry-run
node scripts/animate-scenes.mjs --episode output/longform/story/ep01-slug --backend runway
```

### SVD call (shell out — primary)
```javascript
// Shell command pattern:
// python scripts/setup/run-svd.py --input "{imagePath}" --output "{outputPath}" --frames 30 --fps 8
// run-svd.py must be written in Phase 13 (setup scripts)
// Output: 4-second MP4 at 8fps (=32 frames SVD standard)
```

### RunwayML fallback
```javascript
// Use RUNWAY_API_KEY from .env (may not exist — check before calling)
// If RUNWAY_API_KEY is missing and SVD fails: log warning, skip scene, set animatedClip = ""
// Do NOT throw — partial animation is better than full failure
// Runway endpoint: https://api.dev.runwayml.com/v1/image_to_video (Gen-3 Alpha)
// Duration: 5s, ratio: "768:1344" (portrait 9:16)
```

### Behavior
- Idempotent: skip scenes where `animatedClip` is already set and file exists
- Update episode.json after each successful scene (write incrementally — not all at end)

---

## Phase 5 — Remotion Components (Story Format)

**Directory:** `remotion/components/longform/story/`

All components are functional React (.jsx). Use Remotion hooks: `useCurrentFrame`, `useVideoConfig`, `interpolate`, `spring`. Import from `'remotion'`.

**Visual constants (copy exactly — do not deviate):**
```javascript
const PILL_BG = 'rgba(255,210,0,0.93)';
const PILL_TEXT = '#1a1a1a';
const PILL_RX = 22;
const FONT_FAMILY = 'Nunito, Fredoka One, sans-serif';
```

---

### `remotion/components/longform/story/StoryHookScene.jsx`

**Props:** `{ hookQuestion, jinglePath, joyo_png_path, durationSec }`

**Behavior:**
- Full-screen dark gradient background (deep ocean blue → black)
- Joyo PNG centered, scale-in animation (spring, 0→1 in first 15 frames)
- hookQuestion text animates in word-by-word (typewriter style, 1 word per 4 frames)
- Yellow pill wraps hookQuestion text
- Audio: `<Audio src={jinglePath} />` — plays from frame 0

---

### `remotion/components/longform/story/StoryActScene.jsx`

**Props:** `{ scene: SceneObject, narrationPath, backgroundMusicPath, actNumber }`

`SceneObject` = one scene entry from episode.json `acts[n].scenes[n]`

**Behavior:**
- If `animatedClip` exists and file is present: render as `<Video src={animatedClip} />`
- Else: Ken Burns on `imagePath` (same pattern as existing SlideScene)
- Caption bar at bottom: yellow pill, narration text, typewriter animation
- `<Audio src={narrationPath} />` — narration audio
- `<Audio src={backgroundMusicPath} volume={0.3} />` — background music at 30% volume
- Act number badge: top-left corner, small yellow pill "ACT 1 / 2 / 3"

---

### `remotion/components/longform/story/StoryBridgeCard.jsx`

**Props:** `{ joyo_png_path, ctaText, durationSec }`

**Behavior:**
- Full-screen warm yellow background
- Joyo PNG center, bounce animation (spring, repeating subtle scale)
- Large text: "Now it's your turn!" — dark, bold
- ctaText below in smaller text
- Duration: 15s (450 frames at 30fps)

---

### `remotion/components/longform/story/StoryActivityScene.jsx`

**Props:** `{ activityFolder, countdownSec, hookText }`

**Behavior:**
- Reuse existing `ActivityChallenge` composition logic — do NOT copy its code
- Import and wrap: `import { ActivityChallenge } from '../../ActivityChallenge/ActivityChallenge.jsx'`
- If `activityFolder` is empty string: render placeholder card "Activity coming soon"
- If activityFolder is provided: read `activity.json` from that folder, pass props to ActivityChallenge wrapper

---

### `remotion/components/longform/story/StoryOutroScene.jsx`

**Props:** `{ joyo_png_path, outroJinglePath, nextEpisodeTeaser, durationSec }`

**Behavior:**
- Full-screen dark warm background (dark purple/navy)
- Joyo PNG: wave animation (rotate -10° → +10° → -10°, loop, spring)
- "New episode every week!" text — yellow pill
- nextEpisodeTeaser text below — smaller, white
- Audio: `<Audio src={outroJinglePath} />`
- Fade to black: last 30 frames (1s), interpolate opacity 1→0

---

## Phase 6 — `remotion/compositions/StoryLongFormEpisode.jsx`

### Purpose
Master composition. Uses Remotion `<Series>` to chain all segments. Registered in `remotion/index.jsx`.

### Props (from episode.json)
```javascript
{
  episodeFolder: string,   // path to episode folder — used to resolve all asset paths
  episode: object,         // full episode.json object
}
```

### Segment sequence
```
StoryHookScene           hookDuration = 20s (600 frames)
StoryActScene × 4        act1 scenes, each durationSec from episode.json
StoryActScene × 4        act2 scenes
StoryActScene × 4        act3 scenes
StoryBridgeCard          15s (450 frames) — only if activityFolder is set
StoryActivityScene       90s (2700 frames) — only if activityFolder is set
StoryOutroScene          20s (600 frames)
```

### Registration in `remotion/index.jsx` (add, do not replace):
```jsx
<Composition
  id="StoryLongFormEpisode"
  component={StoryLongFormEpisode}
  width={1080}
  height={1920}
  fps={30}
  durationInFrames={totalFrames}   // calculate from episode.json or default 9750 (325s)
  defaultProps={{ episodeFolder: '', episode: {} }}
/>
```

---

## Phase 7 — `scripts/render-story-longform.mjs`

### Purpose
Validates all assets in episode.json. Calculates total frames. Runs `npx remotion render StoryLongFormEpisode`.

### CLI
```
node scripts/render-story-longform.mjs --episode output/longform/story/ep01-slug
node scripts/render-story-longform.mjs --episode output/longform/story/ep01-slug --dry-run
```

### Validation (before render)
Check each item — if missing, print warning and ask user to confirm proceed:
- All 12 `imagePath` PNGs exist (warn if animated MP4s also missing — will fall back to Ken Burns)
- All 12 `narrationFile` WAVs exist
- `background.mp3` exists in episode folder
- `hook-jingle.mp3` exists in episode folder
- `outro-jingle.mp3` exists in episode folder

### Render command
```javascript
const cmd = `npx remotion render StoryLongFormEpisode --props='${JSON.stringify(inputProps)}' --output=output/longform/story/${episodeSlug}/${episodeSlug}.mp4`;
```

After successful render: update `episode.json` → `rendered: true`, `renderedAt: ISO timestamp`.

---

## Phase 8 — `scripts/generate-animal-facts-brief.mjs`

### Purpose
Same pattern as Phase 1 but for animal facts format. Output: `output/longform/animal/ep{N}-{slug}/episode.json`.

### episode.json format field: `"animal-facts"`

### Groq output fields:
```json
{
  "animalName": "African Lion",
  "slug": "african-lion",
  "hookFact": "A lion's roar can be heard 8 kilometres away.",
  "habitat": { "description": "...", "imagePromptHint": "..." },
  "diet": { "description": "...", "imagePromptHint": "..." },
  "funFact": { "description": "...", "imagePromptHint": "..." },
  "sungRecapLyrics": "The lion lives on the golden savanna...\nIt eats zebras and wildebeest...\nIts roar shakes the whole wide world!",
  "sungRecapSunoPrompt": "upbeat children's educational song, Baby Shark cadence, fun and memorable, about African lions, 30 seconds",
  "backgroundSunoPrompt": "warm African savanna ambiance, light percussion, children's educational, no lyrics, 3 minutes",
  "activityFolder": ""
}
```

### Psychology map (hardcoded for animal format):
```javascript
{ hook: 'CURIOSITY_GAP', nameReveal: 'COMPLETION_SATISFACTION', habitat: 'NOSTALGIA', diet: 'CURIOSITY_GAP', funFact: 'COMPLETION_SATISFACTION', sungRecap: 'NOSTALGIA', activity: 'CHALLENGE', outro: 'SCREEN_RELIEF' }
```

---

## Phase 9 — Remotion Components (Animal Facts Format)

**Directory:** `remotion/components/longform/animal/`

Same visual constants (PILL_BG, PILL_TEXT, etc.) as story components.

| Component | Props | Key behavior |
|-----------|-------|-------------|
| `AnimalHookScene.jsx` | `{ hookFact, joyo_png_path }` | Joyo poses question, hookFact animates in, curiosity gap — answer NOT shown |
| `AnimalNameReveal.jsx` | `{ animalName, imagePath }` | Large bold name, scale-in from small, image Ken Burns behind |
| `AnimalFactScene.jsx` | `{ label, description, imagePath, animatedClip, narrationPath, backgroundMusicPath }` | label = "WHERE IT LIVES" / "WHAT IT EATS" / "FUN FACT" — yellow pill label top, animated image, narration caption bar bottom |
| `AnimalSungRecap.jsx` | `{ lyrics, sungAudioPath }` | Lyrics display word-by-word in sync with sung audio, warm gradient background, musical note particles |
| `AnimalActivityScene.jsx` | Same as StoryActivityScene | Identical — reuse same component |
| `AnimalOutroScene.jsx` | Same as StoryOutroScene | Identical — reuse same component |

---

## Phase 10 — `remotion/compositions/AnimalFactsEpisode.jsx`

Segment sequence:
```
AnimalHookScene          10s
AnimalNameReveal         15s
AnimalFactScene (habitat) 30s
AnimalFactScene (diet)    30s
AnimalFactScene (funFact) 20s
AnimalSungRecap          30s
AnimalActivityScene      30s (only if activityFolder set)
AnimalOutroScene         15s
```

Register in `remotion/index.jsx`:
```jsx
<Composition id="AnimalFactsEpisode" component={AnimalFactsEpisode}
  width={1080} height={1920} fps={30} durationInFrames={5400}
  defaultProps={{ episodeFolder: '', episode: {} }} />
```

---

## Phase 11 — `scripts/generate-puzzle-compilation.mjs`

### Purpose
Chains existing ASMR activity folders into a 60-min puzzle compilation plan.

### CLI
```
node scripts/generate-puzzle-compilation.mjs --count 45     # 45 puzzles (~60 min)
node scripts/generate-puzzle-compilation.mjs --type maze    # Only maze type
node scripts/generate-puzzle-compilation.mjs --dry-run
```

### Behavior
- Scan `output/asmr/` — find folders with both blank.png + solved.png (or maze.png + solved.png)
- Shuffle, pick N, group by type (mix types)
- Write `output/longform/puzzle-compilation/{slug}/compilation.json`

### `compilation.json` schema
```json
{
  "format": "puzzle-compilation",
  "title": "1 Hour of Mazes for Kids",
  "slug": "1-hour-mazes-2026-04-16",
  "date": "2026-04-16",
  "backgroundMusicSunoPrompt": "calm playful children's background music, loop-friendly, no lyrics, 60 minutes",
  "backgroundMusicDropPath": "background.mp3",
  "chapters": [
    {
      "chapterNumber": 1,
      "activityFolder": "output/asmr/maze-ocean-animals",
      "activityType": "maze",
      "chapterTitle": "Ocean Maze",
      "durationSec": 75
    }
  ],
  "totalDurationSec": 3600,
  "rendered": false
}
```

---

## Phase 12 — `remotion/compositions/PuzzleCompilation.jsx`

### Segment sequence (per chapter, repeated N times)
```
ChapterTitleCard         5s  — yellow pill with chapter number + title
[ActivityReveal]         70s — import from existing AsmrReveal components
```

Between all chapters: no gap (seamless cut).

### Reuse existing ASMR reveal components exactly:
```javascript
import { ColoringReveal } from '../components/AsmrReveal/ColoringReveal.jsx';
import { MazeSolverReveal } from '../components/AsmrReveal/MazeSolverReveal.jsx';
import { WordSearchReveal } from '../components/AsmrReveal/WordSearchReveal.jsx';
// etc.
```

Registration:
```jsx
<Composition id="PuzzleCompilation" component={PuzzleCompilation}
  width={1080} height={1920} fps={30} durationInFrames={108000}
  defaultProps={{ compilationFolder: '' }} />
```

---

## Phase 13 — Setup Scripts

### `scripts/setup/install-coqui.sh`
```bash
#!/bin/bash
# Installs Coqui TTS with warm female voice model
pip install TTS
# Download voice model (warm female — VCTK VITS speaker p225)
python -c "from TTS.api import TTS; TTS('tts_models/en/vctk/vits')"
echo "Coqui TTS installed. Test: python -m TTS --text 'Hello!' --model_name tts_models/en/vctk/vits --speaker_idx p225 --out_path /tmp/test.wav"
```

### `scripts/setup/run-svd.py`
Python wrapper for Stable Video Diffusion via diffusers:
```python
# CLI: python scripts/setup/run-svd.py --input {path} --output {path} --frames 25 --fps 8
# Uses: diffusers StableVideoDiffusionPipeline
# Model: stabilityai/stable-video-diffusion-img2vid-xt
# Fallback: if CUDA unavailable, warn and exit with code 1 (animate-scenes.mjs catches this)
# Output: MP4 at specified fps
```

---

## npm Scripts to Add to `package.json`

Add under `"scripts"` — do not modify any existing scripts:

```json
"longform:story:plan":       "node scripts/generate-story-longform-brief.mjs",
"longform:story:plan:save":  "node scripts/generate-story-longform-brief.mjs --save",
"longform:story:plan:dry":   "node scripts/generate-story-longform-brief.mjs --dry-run",
"longform:story:narrate":    "node scripts/generate-narration.mjs",
"longform:story:animate":    "node scripts/animate-scenes.mjs",
"longform:story:render":     "node scripts/render-story-longform.mjs",
"longform:story:render:dry": "node scripts/render-story-longform.mjs --dry-run",
"longform:animal:plan":      "node scripts/generate-animal-facts-brief.mjs",
"longform:animal:plan:save": "node scripts/generate-animal-facts-brief.mjs --save",
"longform:animal:render":    "node scripts/render-story-longform.mjs --format animal",
"longform:puzzle:compile":   "node scripts/generate-puzzle-compilation.mjs",
"longform:puzzle:render":    "node scripts/render-story-longform.mjs --format puzzle-compilation",
"suno:pool:expand":          "node scripts/generate-suno-pool.mjs",
"suno:pool:expand:dry":      "node scripts/generate-suno-pool.mjs --dry-run",
"longform:setup":            "bash scripts/setup/install-coqui.sh"
```

---

## Output Folder Structure

```
output/longform/
  story/
    ep01-brave-little-turtle/
      episode.json
      brief.md
      scene-01.png .. scene-12.png      ← user generates in Gemini
      scene-01.mp4 .. scene-12.mp4      ← animate-scenes.mjs generates
      narration-scene-01.wav .. -12.wav ← generate-narration.mjs generates
      background.mp3                    ← user drops (Suno)
      hook-jingle.mp3                   ← user drops (Suno, reuse across episodes)
      bridge-jingle.mp3                 ← user drops (Suno, reuse across episodes)
      outro-jingle.mp3                  ← user drops (Suno, reuse across episodes)
      ep01-brave-little-turtle.mp4      ← render output
  animal/
    ep01-african-lion/
      episode.json
      brief.md
      habitat.png, diet.png, funfact.png, namereveal.png
      habitat.mp4, diet.mp4, funfact.mp4
      narration-*.wav
      background.mp3                    ← user drops (Suno)
      sung-recap.mp3                    ← user drops (Suno, per-episode)
      ep01-african-lion.mp4
  puzzle-compilation/
    1-hour-mazes-2026-04-16/
      compilation.json
      background.mp3                    ← user drops (Suno, long loop)
      1-hour-mazes-2026-04-16.mp4

config/
  suno-prompt-pool.json    ← generate-suno-pool.mjs creates + expands
```

---

## Codex Handoff Checklist

Before marking any phase done:
- [ ] Script runs without error with `--dry-run`
- [ ] Script produces expected output structure
- [ ] episode.json is valid JSON (no trailing commas, no undefined values)
- [ ] Remotion component renders without error in Remotion Studio (`npx remotion studio`)
- [ ] npm scripts added to package.json without modifying existing scripts
- [ ] No new npm dependencies added without noting them here

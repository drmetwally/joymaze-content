# Daily Automation Completion Spec
**Target:** `npm run daily` fully unattended — all 5 content types rendered to `output/` with no manual steps  
**Date:** 2026-05-09  
**Author:** Claude (supervisor)  
**Implementer:** Gemini (OpenClaw)

---

## Context

`scripts/daily-run.mjs` already runs end-to-end for:
- Images + captions
- Story Reel V2 (brief → Imagen → audio → Remotion render)
- ASMR (brief → engine → extract → Remotion render)
- X text posts

**Two pipelines still need full wiring:**
1. Challenge video — brief runs but puzzle.png is never generated; render is never called
2. Animal Facts video — brief runs but narration, song, moment images, B-roll, and render are never called

---

## Part 1 — Challenge Pipeline Automation

### Problem
`generate-challenge-brief.mjs --save` writes:
- `output/challenge/[type]-[slug]/activity.json` — has `imagePath: 'puzzle.png'`
- `output/challenge/[type]-[slug]/brief.md` — has `imagePrompt` as text

`activity.json` does NOT currently include `imagePrompt`, so automation cannot read the Imagen prompt from it.  
`puzzle.png` is never generated automatically — it is currently a manual step.

### Required Changes

#### Change 1 — `scripts/generate-challenge-brief.mjs`

In `buildActivityJson()` (line ~248), add `imagePrompt` to the returned object:

```js
function buildActivityJson(type, brief) {
  return {
    type:           'challenge',
    puzzleType:     type,
    theme:          brief.theme,
    hookText:       brief.hookText,
    hookAlternatives: brief.hookAlternatives,
    ctaText:        brief.ctaText,
    activityLabel:  ACTIVITY_LABEL_MAP[type] ?? type.toUpperCase(),
    countdownSec:   COUNTDOWN_MAP[type] ?? 60,
    hookDurationSec: 2.5,
    holdAfterSec:   2.5,
    imagePath:      'puzzle.png',
    imagePrompt:    brief.imagePrompt,   // ← ADD THIS
    showJoyo:       true,
  };
}
```

#### Change 2 — NEW `scripts/generate-challenge-puzzle.mjs`

New script. Generates `puzzle.png` from `activity.json.imagePrompt` via Imagen.

**Interface:**
```
node scripts/generate-challenge-puzzle.mjs --challenge output/challenge/maze-slug
node scripts/generate-challenge-puzzle.mjs --challenge output/challenge/maze-slug --force
```

**Behavior:**
- Reads `activity.json` from the challenge folder
- If `puzzle.png` already exists AND no `--force`, logs `SKIP` and exits 0
- Calls Imagen `imagen-4.0-generate-001` with `activity.imagePrompt` + appended text: `"Portrait orientation, 9:16 aspect ratio (1080x1920 pixels). White background."`
- API key: `process.env.VERTEX_API_KEY`
- API URL: `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`
- Request body: `{ instances: [{ prompt }], parameters: { sampleCount: 1 } }`
- Response field: `data.predictions?.[0]?.bytesBase64Encoded || data.generatedImages?.[0]?.image?.imageBytes`
- Saves `puzzle.png` to the challenge folder (same dir as `activity.json`)
- Exits 0 on success, non-zero on failure

**Pattern to follow:** `scripts/generate-matching-stickers.mjs` — same Imagen call + base64 decode + `fs.writeFile`.  
**ESM module** (`.mjs`), `import 'dotenv/config'`.

#### Change 3 — `scripts/daily-run.mjs`

**3a. Add `getLatestChallengeFolder()` helper** after `getLatestAsmrFolder()`:

```js
async function getLatestChallengeFolder() {
  const challengeDir = path.join(ROOT, 'output', 'challenge');
  try {
    const entries = await fs.readdir(challengeDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    if (dirs.length === 0) return null;
    const withMtime = await Promise.all(
      dirs.map(async (d) => {
        const full = path.join(challengeDir, d.name);
        const stat = await fs.stat(full).catch(() => null);
        return stat ? { full, name: d.name, mtime: stat.mtimeMs } : null;
      })
    );
    const sorted = withMtime.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
    return sorted[0] ? { full: sorted[0].full, name: sorted[0].name } : null;
  } catch {
    return null;
  }
}
```

**3b. Extend the `WITH_CHALLENGE` block** (currently lines ~441–452).

Replace the current block:
```js
if (WITH_CHALLENGE) {
  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Generating today's challenge brief...`);
  const challengeOk = await runScript('generate-challenge-brief.mjs', ['--save']);
  if (challengeOk) {
    log('Challenge brief ready in output/challenge/');
    await appendLog('Challenge brief generated OK');
  } else {
    log('Challenge brief failed, run manually: npm run brief:challenge');
    await appendLog('Challenge brief FAILED');
  }
}
```

With the extended version:
```js
if (WITH_CHALLENGE) {
  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Generating today's challenge brief + video...`);
  const challengeOk = await runScript('generate-challenge-brief.mjs', ['--save']);
  if (challengeOk) {
    log('Challenge brief ready in output/challenge/');
    await appendLog('Challenge brief generated OK');

    const challengeFolder = await getLatestChallengeFolder();
    if (challengeFolder) {
      log(`Challenge: folder identified -> ${challengeFolder.name}`);
      log('Challenge: generating puzzle.png via Imagen...');
      const puzzleOk = await runScript('generate-challenge-puzzle.mjs', ['--challenge', challengeFolder.full], 120_000);
      if (puzzleOk) {
        log('Challenge: puzzle.png generated OK');
        log('Challenge: rendering video...');
        const challengeFolderRel = path.relative(ROOT, challengeFolder.full).replace(/\\/g, '/');
        const renderOk = await runScript('render-video.mjs', ['--comp', 'ActivityChallenge', '--challenge', challengeFolderRel], 180_000);
        if (renderOk) {
          log('Challenge video rendered OK');
          await appendLog(`Challenge pipeline OK (${challengeFolder.name})`);
        } else {
          log(`Challenge render failed — run manually: node scripts/render-video.mjs --comp ActivityChallenge --challenge ${challengeFolderRel}`);
          await appendLog('Challenge render FAILED');
        }
      } else {
        log('Challenge: puzzle.png generation failed');
        await appendLog('Challenge puzzle FAILED');
      }
    } else {
      log('Challenge: no folder found after brief, skipping render');
    }
  } else {
    log('Challenge brief failed, run manually: npm run brief:challenge');
    await appendLog('Challenge brief FAILED');
  }
}
```

---

## Part 2 — Animal Facts Pipeline Automation

### Problem
`generate-animal-facts-brief.mjs --save` writes `output/longform/animal/ep##-slug/episode.json`.  
The following steps are all currently manual:
1. TTS narration
2. Suno song (async, ~2-4 min)
3. Moment images (Imagen, 10-12 images)
4. B-roll download
5. Remotion render

`qc-animal-imagen-slice.mjs` only generates a QC subset to `qc-imagen-slice/qc-*.png` — these are NOT production files and are NOT what the renderer reads. The renderer looks for `moment1.png`, `moment2.png` etc. directly in the episode folder. There is currently no script that generates all production moment images.

### Required Changes

#### Change 4 — NEW `scripts/generate-animal-moments.mjs`

New script. Generates ALL `visualExpansionMoments` images to the episode folder.

**Interface:**
```
node scripts/generate-animal-moments.mjs --episode output/longform/animal/ep03-hedgehog
node scripts/generate-animal-moments.mjs --episode output/longform/animal/ep03-hedgehog --force
node scripts/generate-animal-moments.mjs --episode output/longform/animal/ep03-hedgehog --dry-run
```

**Behavior:**
- Reads `episode.json` from episode folder
- Iterates `episode.visualExpansionMoments` array (typically 10-12 items)
- For each moment `i` (0-indexed):
  - `asset = moment.imageAsset || \`moment${i + 1}.png\``
  - `outPath = path.join(episodeDir, asset)`
  - If file exists and no `--force`: log `SKIP moment${i+1}.png` and continue
  - Builds Imagen prompt using same assembly as `qc-animal-imagen-slice.mjs`:
    ```
    Children's wildlife illustration of ${episode.animalName}.
    No text, no logos, no watermark.
    Keep the subject unmistakably ${episode.animalName} in every frame, with accurate animal anatomy and species-defining features.
    Use a single full-frame illustration only, not a collage or split panel.
    Keep the image child-friendly, instantly readable, and visually clear within 2 to 3 seconds.
    Preserve one consistent illustration treatment across the set: ${episode.artStyle}.
    ${moment.imagePromptHint}
    ```
  - Calls Imagen API, saves PNG directly to `episodeDir/moment${i+1}.png`
  - Rate limit: `await sleep(2000)` between each call (same delay as `generate-matching-stickers.mjs`)
  - Every 5 generations: `await sleep(4000)` (double pause for rate limit)

**API details:**
- Key: `process.env.VERTEX_API_KEY`
- Model: `imagen-4.0-generate-001`
- URL: `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`
- Body: `{ instances: [{ prompt }], parameters: { sampleCount: 1 } }`
- Response: `data.predictions?.[0]?.bytesBase64Encoded || data.generatedImages?.[0]?.image?.imageBytes`

**Pattern to follow:** `scripts/qc-animal-imagen-slice.mjs` for prompt assembly; `scripts/generate-matching-stickers.mjs` for Imagen call + rate limiting.  
**ESM module** (`.mjs`), `import 'dotenv/config'`.  
**Output summary:** `Done. X generated, Y skipped, Z failed / N total`

#### Change 5 — `scripts/daily-run.mjs`

**5a. Add `getLatestAnimalFolder()` helper** after `getLatestChallengeFolder()`:

```js
async function getLatestAnimalFolder() {
  const animalDir = path.join(ROOT, 'output', 'longform', 'animal');
  try {
    const entries = await fs.readdir(animalDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && /^ep\d+/.test(e.name));
    if (dirs.length === 0) return null;
    const withMtime = await Promise.all(
      dirs.map(async (d) => {
        const full = path.join(animalDir, d.name);
        const stat = await fs.stat(full).catch(() => null);
        return stat ? { full, name: d.name, mtime: stat.mtimeMs } : null;
      })
    );
    const sorted = withMtime.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
    return sorted[0] ? { full: sorted[0].full, name: sorted[0].name } : null;
  } catch {
    return null;
  }
}
```

**5b. Add `WITH_ANIMAL_REEL` flag** at the top of daily-run.mjs where the other flags are defined (around line 30-40):

```js
const WITH_ANIMAL_REEL   = !args.includes('--no-animal-reel');
```

Also increment `totalSteps` calculation — add `+ (WITH_ANIMAL_REEL ? 1 : 0)` to the totalSteps expression (find the block near line 190-200 that sums all conditional steps).

**5c. Extend the `WITH_ANIMAL_BRIEF` block** (currently lines ~454–465).

Replace the current block:
```js
if (WITH_ANIMAL_BRIEF) {
  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Generating animal facts brief for next song short...`);
  const animalBriefOk = await runScript('generate-animal-facts-brief.mjs', ['--save'], 120_000);
  if (animalBriefOk) {
    log('Animal brief ready in output/longform/animal/');
    await appendLog('Animal facts brief generated OK');
  } else {
    log('Animal brief failed, run manually: npm run longform:animal:plan:save');
    await appendLog('Animal facts brief FAILED');
  }
}
```

With the extended version:
```js
if (WITH_ANIMAL_BRIEF) {
  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Generating animal facts brief...`);
  const animalBriefOk = await runScript('generate-animal-facts-brief.mjs', ['--save'], 120_000);
  if (animalBriefOk) {
    log('Animal brief ready in output/longform/animal/');
    await appendLog('Animal facts brief generated OK');
  } else {
    log('Animal brief failed, run manually: npm run longform:animal:plan:save');
    await appendLog('Animal facts brief FAILED');
  }
}

if (WITH_ANIMAL_BRIEF && WITH_ANIMAL_REEL) {
  const animalFolder = await getLatestAnimalFolder();
  if (animalFolder && await pathExists(path.join(animalFolder.full, 'episode.json'))) {
    stepNum++;
    log(`Step ${stepNum}/${totalSteps}: Generating Animal Facts Song Short (full pipeline)...`);
    log(`  Episode: ${animalFolder.name}`);

    // Step A — TTS narration
    log('Animal: generating narration audio...');
    const narrationOk = await runScript('generate-animal-narration.mjs', ['--episode', animalFolder.full], 90_000);
    if (!narrationOk) {
      log('Animal: narration failed — run manually: npm run longform:animal:narrate -- --episode ' + path.relative(ROOT, animalFolder.full));
      await appendLog('Animal narration FAILED');
    } else {
      log('Animal: narration OK');
    }

    // Step B — Suno song (async, up to 4 min internal timeout)
    log('Animal: submitting Suno song...');
    const songOk = await runScript('generate-animal-song-sunoapi.mjs', ['--episode', animalFolder.full, '--kind', 'song', '--command', 'all'], 300_000);
    if (!songOk) {
      log('Animal: Suno song failed — run manually: node scripts/generate-animal-song-sunoapi.mjs --episode ' + path.relative(ROOT, animalFolder.full) + ' --kind song --command all');
      await appendLog('Animal Suno song FAILED');
    } else {
      log('Animal: Suno song OK');
    }

    // Step C — Suno background music (async, up to 4 min)
    log('Animal: submitting Suno background...');
    const bgOk = await runScript('generate-animal-song-sunoapi.mjs', ['--episode', animalFolder.full, '--kind', 'background', '--command', 'all'], 300_000);
    if (!bgOk) {
      log('Animal: Suno background failed — run manually: node scripts/generate-animal-song-sunoapi.mjs --episode ' + path.relative(ROOT, animalFolder.full) + ' --kind background --command all');
      await appendLog('Animal Suno background FAILED');
    } else {
      log('Animal: Suno background OK');
    }

    // Step D — Generate all moment images via Imagen
    log('Animal: generating moment images (Imagen)...');
    const momentsOk = await runScript('generate-animal-moments.mjs', ['--episode', animalFolder.full], 300_000);
    if (!momentsOk) {
      log('Animal: moment image gen failed — run manually: node scripts/generate-animal-moments.mjs --episode ' + path.relative(ROOT, animalFolder.full));
      await appendLog('Animal moments FAILED');
    } else {
      log('Animal: moments OK');
    }

    // Step E — B-roll download + transcode
    log('Animal: downloading B-roll...');
    const brollOk = await runScript('download-broll.mjs', ['--episode', animalFolder.full], 120_000);
    if (!brollOk) {
      log('Animal: B-roll download failed — run manually: npm run longform:animal:broll -- --episode ' + path.relative(ROOT, animalFolder.full));
      await appendLog('Animal B-roll FAILED');
    } else {
      log('Animal: B-roll OK');
    }

    // Step F — Remotion render
    log('Animal: rendering video...');
    const animalEpisodeRel = path.relative(ROOT, animalFolder.full).replace(/\\/g, '/');
    const renderOk = await runScript('render-video.mjs', ['--comp', 'AnimalFactsSongShort', '--episode', animalEpisodeRel], 300_000);
    if (renderOk) {
      log('Animal Facts video rendered OK');
      await appendLog(`Animal pipeline OK (${animalFolder.name})`);
    } else {
      log(`Animal render failed — run manually: node scripts/render-video.mjs --comp AnimalFactsSongShort --episode ${animalEpisodeRel}`);
      await appendLog('Animal render FAILED');
    }
  } else {
    log('Animal Reel: no episode folder found, skipping');
  }
}
```

---

## Summary of All Files to Modify/Create

| File | Action | Description |
|---|---|---|
| `scripts/generate-challenge-brief.mjs` | Edit | Add `imagePrompt` field to `buildActivityJson()` return |
| `scripts/generate-challenge-puzzle.mjs` | Create | New: generates `puzzle.png` via Imagen from `activity.imagePrompt` |
| `scripts/generate-animal-moments.mjs` | Create | New: generates all `moment*.png` production images to episode folder |
| `scripts/daily-run.mjs` | Edit | Add 3 helpers + extend challenge block + extend animal block + new WITH_ANIMAL_REEL flag |

---

## Constraints to Follow (from CLAUDE.md)

- All new scripts: ESM (`.mjs`), `import 'dotenv/config'`, no CommonJS `require()`
- Gemini images: `VERTEX_API_KEY` (not `GOOGLE_AI_API_KEY` — suspended)
- Text generation: `GROQ_API_KEY` — not needed for these scripts
- TTS: `OPENAI_API_KEY` — not needed for these scripts
- `writing-style.md` in system message only (not applicable — no LLM text calls in new scripts)
- All scripts idempotent: skip existing files unless `--force`
- No `--dry-run` is required for these new scripts (they're called from orchestrator, not directly by user typically) — but add it if trivial
- Suno `--command all` has internal 240s poll timeout — outer runScript timeout MUST be `300_000` (not 180_000)
- Render timeout for AnimalFactsSongShort: `300_000` (not 180_000 — animal render is longer than story reel)

---

## Verification Checklist (Gemini: confirm each after implementation)

- [ ] `buildActivityJson()` in `generate-challenge-brief.mjs` now includes `imagePrompt` field
- [ ] `generate-challenge-puzzle.mjs` skips if `puzzle.png` exists; exits 0; saves to challenge folder (not a subdir)
- [ ] `generate-challenge-puzzle.mjs` appends portrait suffix to the prompt before sending to Imagen
- [ ] `generate-animal-moments.mjs` saves to `episodeDir/moment1.png` (NOT `qc-imagen-slice/`)
- [ ] `generate-animal-moments.mjs` uses `moment.imageAsset || \`moment${i+1}.png\`` as the filename (respect custom asset names)
- [ ] Both new scripts use `VERTEX_API_KEY`
- [ ] `WITH_ANIMAL_REEL` flag added to daily-run.mjs flag list
- [ ] `totalSteps` in daily-run.mjs updated to include the new animal reel step
- [ ] All runScript timeouts match spec: Suno=300_000, animal render=300_000, puzzle=120_000, challenge render=180_000, narration=90_000, moments=300_000, broll=120_000
- [ ] Each step logs a recovery command on failure (for manual fallback)
- [ ] `getLatestChallengeFolder()` and `getLatestAnimalFolder()` added as async helpers alongside the existing two

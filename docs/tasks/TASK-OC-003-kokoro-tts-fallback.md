# TASK-OC-003 — Replace Edge TTS with Kokoro-82M as the free TTS fallback

**Agent:** OpenClaw  
**Supervisor:** Claude  
**Priority:** High — Edge TTS quality is unacceptable for published content  
**Scope:** `scripts/generate-story-video.mjs`, `scripts/generate-animal-narration.mjs`, `package.json`

---

## Context

Current TTS stack:
- Primary: OpenAI `tts-1` / `tts-1-hd` (shimmer/nova) — good quality, costs ~$0.01/story
- Fallback: Microsoft Edge TTS (`msedge-tts`, JennyNeural) — free, but robotic quality, rejected for production use

Goal: Replace Edge TTS with **Kokoro-82M** as the free fallback. Kokoro is a local ONNX-based model with near-human quality, zero API cost, and a Node.js package available on npm.

Locked decisions that MUST NOT change:
- Primary TTS remains OpenAI (`tts-1` for story, `tts-1-hd` for animal facts) 
- `shimmer` voice for story narration, `nova` for animal facts
- Edge TTS code can be removed or left disabled — do NOT delete the `msedge-tts` dependency in case it's used elsewhere

---

## Step 1 — Install kokoro-js

```bash
npm install kokoro-js
```

`kokoro-js` is a Node.js port of Kokoro-82M using ONNX Runtime. It downloads the model (~1.6 GB) on first use to `~/.cache/kokoro/`. This is a one-time download.

**If `kokoro-js` fails to install or errors on import on Windows**, use the HuggingFace Inference API fallback instead:
```bash
npm install @huggingface/inference
```
And use the Kokoro model endpoint: `hexgrad/Kokoro-82M` with voice `af_bella` (American female, warm) or `af_sky` (American female, clear). Add `HUGGINGFACE_TOKEN` to `.env` (free account token works for inference).

Implement whichever of the two approaches installs and imports cleanly on Windows without errors. Test with a 5-word sentence before wiring it in.

---

## Step 2 — Add `generateKokoroTTS()` in `generate-story-video.mjs`

Add the new function alongside the existing `generateOpenAITTS()` (line ~676) and `generateEdgeTTS()` (line ~694):

### Option A (kokoro-js local ONNX):
```js
async function generateKokoroTTS(text, outputPath, speed = 1.0) {
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0', {
    dtype: 'q8', // 8-bit quantized — runs on CPU, ~300MB
  });
  const voice = 'af_bella'; // American female, warm — closest to shimmer quality
  const audio = await tts.generate(text, { voice, speed });
  await audio.save(outputPath);
}
```

### Option B (HuggingFace Inference API):
```js
async function generateKokoroTTS(text, outputPath, speed = 1.0) {
  const { HfInference } = await import('@huggingface/inference');
  const hf = new HfInference(process.env.HUGGINGFACE_TOKEN);
  const audioBlob = await hf.textToSpeech({
    model: 'hexgrad/Kokoro-82M',
    inputs: text,
  });
  const buffer = Buffer.from(await audioBlob.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}
```

Use whichever option works cleanly.

---

## Step 3 — Wire `--tts kokoro` in `generate-story-video.mjs`

Find `buildNarrationTrack()` (line ~757). Currently:
```js
const generateFn = provider === 'openai'
  ? (t, p) => generateOpenAITTS(t, p, TTS_SPEED, activeVoice)
  : (t, p) => generateEdgeTTS(t, p, TTS_SPEED);
```

Replace with:
```js
const generateFn = provider === 'openai'
  ? (t, p) => generateOpenAITTS(t, p, TTS_SPEED, activeVoice)
  : provider === 'kokoro'
  ? (t, p) => generateKokoroTTS(t, p, TTS_SPEED)
  : (t, p) => generateEdgeTTS(t, p, TTS_SPEED); // kept as last-resort fallback
const providerLabel = provider === 'openai'
  ? `OpenAI TTS (${activeVoice}, speed ${TTS_SPEED})`
  : provider === 'kokoro'
  ? `Kokoro TTS (af_bella, speed ${TTS_SPEED})`
  : `Edge TTS (JennyNeural, speed ${TTS_SPEED})`;
```

---

## Step 4 — Add `generateKokoroTTS()` in `generate-animal-narration.mjs`

Find `generateTTS()` (line ~179). It currently only supports OpenAI. Add a Kokoro path:

```js
async function generateTTS(text, outputPath, openai, speed = 1.0, provider = 'openai') {
  if (provider === 'kokoro') {
    return generateKokoroTTS(text, outputPath, speed);
  }
  // existing OpenAI code unchanged below
  const response = await openai.audio.speech.create({ ... });
}
```

Wire this via a `--tts kokoro` flag (same pattern as generate-story-video.mjs). Default remains `openai`.

---

## Step 5 — Add npm scripts to `package.json`

```json
"generate:story:kokoro": "node scripts/generate-story-video.mjs --tts kokoro",
"generate:story:kokoro:ws": "node scripts/generate-story-video.mjs --tts kokoro --word-sync",
```

---

## Step 6 — Update the Locked Decisions table in `CLAUDE.md`

Find the row:
```
| Story video structure | No outro, no CTA, no fade ...
```

Add a NEW row:
```
| TTS fallback | Kokoro-82M (kokoro-js, af_bella voice) replaces Edge TTS as non-OpenAI fallback — Edge TTS remains in code as last resort only | Edge TTS quality rejected for production 2026-04-27 |
```

---

## Test

```bash
# Test Kokoro generates a valid audio file
node -e "
import('kokoro-js').then(async ({ KokoroTTS }) => {
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0', { dtype: 'q8' });
  const audio = await tts.generate('Hello, this is a test of the Kokoro voice.', { voice: 'af_bella' });
  await audio.save('test-kokoro.wav');
  console.log('Saved test-kokoro.wav');
}).catch(e => console.error('FAILED:', e.message));
"

# Then test in story pipeline
node scripts/generate-story-video.mjs --story ep05-the-robin-who-guided-the-spring-migration --tts kokoro --dry-run
```

Listen to `test-kokoro.wav` and confirm quality is clearly better than Edge TTS.

---

## Do NOT change
- OpenAI TTS code — it remains primary, unchanged
- `msedge-tts` dependency — leave it in package.json
- Animal facts default voice (nova) or story default voice (shimmer) — these are locked
- Any Remotion composition files

---

## Log entry

After completing, append to `docs/AGENT_LOG.md` using the standard template. Include which Kokoro option (A or B) you used and whether the test WAV sounded clean.

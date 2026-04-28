# TASK-OC-002 — Wire full intelligence stack into generate-activity-video.mjs

**Agent:** OpenClaw  
**Supervisor:** Claude  
**Priority:** Medium — improves challenge reel quality; doesn't block daily pipeline  
**Scope:** `scripts/generate-activity-video.mjs` only

---

## Problem

`generate-activity-video.mjs` currently reads only `config/competitor-intelligence.json`.
Every other brief generator (ASMR, story, challenge, prompts) also reads:
- `config/trends-this-week.json` — weekly trend signals (what parents are searching)
- `config/hooks-library.json` — curated high-performing hook bank
- `config/theme-pool-dynamic.json` — weekly-updated theme pool with intelligence scores
- `config/performance-weights.json` — what content type performs best

This means the Puzzle Challenge Reel's hook text and CTA are not updated by the weekly intelligence refresh. Every other content type improves week-over-week; activity videos don't.

---

## Fix

### Step 1 — Load the missing config files

Find the section where `generate-activity-video.mjs` currently loads `competitor-intelligence.json` (near the top of the generation function). Add reads for the four missing files using the same graceful pattern all other scripts use (catch silently if missing):

```js
// Add these alongside the existing competitor-intelligence load
let trends = null, hooksData = null, dynamicThemes = null, perfWeights = null;

try {
  trends = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8'));
} catch {}
try {
  hooksData = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'hooks-library.json'), 'utf-8'));
} catch {}
try {
  dynamicThemes = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'theme-pool-dynamic.json'), 'utf-8'));
} catch {}
try {
  perfWeights = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'performance-weights.json'), 'utf-8'));
} catch {}
```

### Step 2 — Inject into the Gemini/Groq prompt

Find where the script builds its prompt for hook text / CTA generation. Inject a compact context block before the main instruction, following the same pattern as `generate-asmr-brief.mjs`:

```js
const intelligenceContext = [
  trends?.boost_themes?.length
    ? `Trending themes this week: ${trends.boost_themes.slice(0, 3).join(', ')}.`
    : '',
  trends?.rising_searches?.length
    ? `Rising parent searches: ${trends.rising_searches.slice(0, 3).join(', ')}.`
    : '',
  hooksData?.hooks?.length
    ? `Top hooks in pool: ${hooksData.hooks.filter(h => h.brand_safe).slice(0, 3).map(h => `"${h.text}"`).join(' | ')}.`
    : '',
  dynamicThemes?.themes?.length
    ? `Active dynamic themes: ${dynamicThemes.themes.slice(0, 3).map(t => t.name).join(', ')}.`
    : '',
].filter(Boolean).join('\n');
```

Prepend `intelligenceContext` to the user message (not the system message — `writing-style.md` owns the system message).

### Step 3 — Add --dry-run output line

In dry-run mode, print: `Intelligence context: [X trends, Y hooks, Z themes loaded]`

---

## Do NOT change
- The Remotion render pipeline or `render-video.mjs`
- The `ActivityChallenge.jsx` composition
- The `--props-file` mechanism
- Any other script

---

## Test

```bash
node scripts/generate-activity-video.mjs --dry-run
```

Verify the dry-run output includes a line showing intelligence was loaded (trends, hooks, themes counts). Then confirm no errors on a live run:

```bash
node scripts/generate-activity-video.mjs --dry-run --activity maze
```

---

## Log entry

After completing, append to `docs/AGENT_LOG.md` following the standard template.

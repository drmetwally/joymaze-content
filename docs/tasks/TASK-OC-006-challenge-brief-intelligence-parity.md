# TASK-OC-006 — Wire missing intelligence signals into generate-challenge-brief.mjs

**Agent:** OpenClaw
**Supervisor:** Claude
**Priority:** Medium — challenge brief is the only daily generator missing full intelligence coverage
**Scope:** `scripts/generate-challenge-brief.mjs` only

---

## Problem

`generate-challenge-brief.mjs` loads only 3 of the 6 intelligence inputs that every other daily
generator loads. It has competitor + hooks + themes, but is missing:

- `config/trends-this-week.json` — trending themes and upcoming seasonal moments
- `config/performance-weights.json` — which activity types are resonating this week
- `config/psychology-triggers.json` — viral psychology triggers

These three are already loaded and injected in `generate-asmr-brief.mjs`, which is the reference
implementation to follow exactly.

---

## Reference implementation

Open `scripts/generate-asmr-brief.mjs` and study:

1. **`loadContext()`** — how it reads the three missing files (lines ~83–113)
2. **`buildPrompt()`** — how it builds `trendsStr`, `perfStr`, and the psychology trigger block
   and injects them into the prompt string

Your job is to replicate the same pattern in `generate-challenge-brief.mjs`.

---

## What to change

### 1. `loadContext()` — add three reads

Find the existing reads for `hooksData` and `dynamicThemes`. After the last existing read in
`loadContext()`, add the three missing reads in the same `try/catch` pattern:

```js
let trends = null;
try {
  trends = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8'));
} catch {}

let perfWeights = null;
try {
  perfWeights = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'performance-weights.json'), 'utf-8'));
} catch {}

let psychTriggers = null;
try {
  psychTriggers = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'psychology-triggers.json'), 'utf-8'));
} catch {}
```

Add `trends`, `perfWeights`, `psychTriggers` to the return object.

### 2. `buildPrompt()` — destructure and inject

In the destructure at the top of `buildPrompt()`, add the three new fields from the context object.

Then build and inject the three signal strings into the prompt, copying the exact logic from
`generate-asmr-brief.mjs`:

- **`trendsStr`** — trending themes (top 5 with scores) + upcoming moments within 21 days.
  Inject with label: `TRENDING THIS WEEK — bias your theme toward one of these if it fits naturally`

- **`perfStr`** — top 2 high-resonance activity types where `weight > 1.0`.
  Inject with label: `High-resonance activity types this week (prefer if choosing between options)`

- **Psychology trigger block** — the challenge format's core viral mechanic is
  `CHALLENGE_HOOK` (not `COMPLETION_SATISFACTION` which is ASMR-specific). Inject only when
  `psychTriggers` is non-null, with this copy:

```
## PSYCHOLOGY TRIGGER — CHALLENGE_HOOK
This challenge brief's viral mechanic is the trigger: pose a challenge the viewer believes
their child can beat.
- hookText must activate competitive curiosity — the viewer should feel the itch to try.
- Hook style: imply a skill gap or surprising difficulty ("Most kids miss this", "Can you beat the clock?")
- Puzzle difficulty and visual complexity must feel achievable, not frustrating.
- Caption writers will get this trigger context separately — your job is to encode it into hookText.
```

Inject all three strings into the final prompt template string in the same positions they appear
in `generate-asmr-brief.mjs` (after active themes, before the JSON schema instruction).

---

## What NOT to change

- The JSON output schema (fields returned by Groq)
- The `--save` / `--dry-run` / `--type` flag handling
- The folder creation and file-write logic
- Any other script

---

## Test

```bash
node scripts/generate-challenge-brief.mjs --dry-run
```

The dry-run prints the full system prompt. Confirm that the output contains:

- `TRENDING THIS WEEK` section (or is absent cleanly if `trends-this-week.json` doesn't exist)
- `High-resonance activity types` line (or absent cleanly if `performance-weights.json` doesn't exist)
- `PSYCHOLOGY TRIGGER — CHALLENGE_HOOK` block

Then run live to confirm it still generates a valid brief:

```bash
node scripts/generate-challenge-brief.mjs
```

No errors, valid JSON returned, hook and theme look on-brand.

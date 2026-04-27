# TASK-OC-005 — Add challenge brief step to daily-scheduler.mjs

**Agent:** OpenClaw  
**Supervisor:** Claude  
**Priority:** Low-medium — not blocking challenge rendering, but required for scheduler parity and Phase 0 consistency  
**Scope:** `scripts/daily-scheduler.mjs` only

---

## Problem

The repo already generates the challenge brief in the package-level daily chain:

```json
"daily": "... node scripts/generate-challenge-brief.mjs --save ..."
```

But `scripts/daily-scheduler.mjs` still only includes archive + prompts + story + ASMR + X-post generation in its normal non-Monday flow. That means the Task Scheduler path is missing the challenge brief even though `npm run daily` already includes it.

---

## What to change

In `daily-scheduler.mjs`, find the ASMR brief block. Directly after it, add the mirrored challenge-brief block below:

```js
// Step N: Generate challenge brief (default on; skip with --no-challenge)
if (!args.includes('--no-challenge')) {
  stepNum++;
  log(`Step ${stepNum}/${totalSteps}: Generating today's challenge brief...`);
  const challengeOk = await runScript('generate-challenge-brief.mjs', ['--save']);
  if (challengeOk) {
    log('Challenge brief ready in output/challenge/ — open brief.md then drop in puzzle.png');
  } else {
    log('Challenge brief failed — run manually: npm run brief:challenge');
  }
}
```

Also increment the default `totalSteps` base count by **1** so the scheduler’s normal path reflects:
- archive
- prompts
- X text posts
- challenge brief

Keep the story / ASMR / analytics / Monday-condition logic intact — only add the new default challenge step and the matching base-step count.

---

## Important verification

Use the same script file that `npm run brief:challenge` calls in `package.json`:

- `brief:challenge` ? `node scripts/generate-challenge-brief.mjs --save`

So the `runScript()` filename must be:

- `generate-challenge-brief.mjs`

Do **not** invent `generate-activity-brief.mjs` if it does not exist.

---

## Test

Run:

```bash
node scripts/daily-scheduler.mjs --dry-run
```

Verify that the step sequence now includes:

```text
Generating today's challenge brief...
```

and that step numbering remains consistent.

---

## Do NOT change

- `package.json` daily chain (it already includes the challenge brief)
- Any non-scheduler file
- The Monday intelligence block
- Posting behavior

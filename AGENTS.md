# AGENTS.md — Joymaze-Content Hard Rules (All Agents)

**Every AI agent working on this codebase MUST follow these rules without exception.**

## 1. Minimal Diff Only

- Touch only the files explicitly requested.
- Change only the lines required to complete the single task.
- No drive-by refactors, no "while I'm here" cleanups.
- No adding comments, docstrings, or type annotations to unchanged code.
- No renaming, reordering imports, or reformatting untouched lines.

## 2. One Task at a Time

- Accept exactly one task per session.
- If the task is ambiguous, ask before writing code.
- Do not bundle unrelated fixes into one patch.

## 3. Touch Only Requested Files

- If the task says "fix X in file Y", only edit file Y.
- If a fix requires changes in other files, list them and wait for approval.
- Never modify automation scripts when the task is documentation-only.

## 4. Preserve Invariants

- Do NOT break: API credential handling, content queue format, platform posting logic, brand asset references.
- Do NOT remove or rename exported functions without confirming zero external references.
- Do NOT change output directory structure without updating all consumers.
- Do NOT modify .env keys without updating setup-check.mjs and PLATFORM_SETUP_GUIDE.md.

## 5. Required Output Format

Every task response MUST end with exactly this structure:

```
### Edits
<list of files changed and what changed in each>

### Why Smallest Safe Diff
<1-2 sentences explaining why no smaller patch exists>

### Test Steps
<numbered manual QA steps to verify the change>

### Stop
Task complete. Waiting for next instruction.
```

## 6. When in Doubt

- Ask. Do not guess.
- If you cannot complete the task without violating a rule above, say so and stop.

## 7. Learning from Mistakes

Every time the user corrects a mistake, reflect on what you did wrong and come up with a plan to never make the same mistake again.

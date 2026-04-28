# TASK-OC-001 — Fix pool file corruption in intelligence-refresh.mjs

**Agent:** OpenClaw  
**Supervisor:** Claude  
**Priority:** High — blocks reliable Monday intelligence refreshes  
**Scope:** `scripts/intelligence-refresh.mjs` only — function `applyCompetitorFindings()` (lines ~509–607)

---

## Problem

Every Monday, `intelligence-refresh.mjs` calls `applyCompetitorFindings()` twice within the same run:
1. After main competitor web searches (~line 1027)
2. After competitor top-post analysis (~line 1084)

Each call reads the pool files, merges new entries from Gemini's raw response, and writes back. On 2026-04-27 all three pool files were corrupted after the second call:

```
Hooks apply failed: Expected property name or '}' at position 21382 (line 707 col 1)
Themes apply failed: Expected property name or '}' at position 1648 (line 47 col 1)
Interrupts apply failed: Expected property name or '}' at position 3613 (line 67 col 1)
```

Root cause: Gemini's competitor response can contain strings with raw control characters, unescaped quotes, or other characters that — when added to the pool object and serialized — produce subtly malformed JSON. The first `applyCompetitorFindings` call writes a corrupted file; the second call then fails to read it. Because both calls are wrapped in `try/catch` the corruption is silent (only logged as "Hooks apply failed") and the bad file persists to the next run.

---

## Fix

Replace the `fs.writeFile(POOL_FILE, ...)` pattern inside `applyCompetitorFindings()` with an **atomic write** pattern for all three pool files:

```
write to POOL_FILE.tmp  →  JSON.parse(readFile(POOL_FILE.tmp)) validates cleanly  →  fs.rename(POOL_FILE.tmp, POOL_FILE)
```

If validation fails, delete the `.tmp` file and log a warning — never touch the live pool file.

### Exact changes — one helper, three call sites

**Step 1** — Add a helper function above `applyCompetitorFindings`:

```js
async function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp';
  const serialized = JSON.stringify(data, null, 2) + '\n';
  // Validate round-trip before touching the real file
  JSON.parse(serialized); // throws if serialization produced invalid JSON
  await fs.writeFile(tmp, serialized, 'utf-8');
  // Verify the written file reads back cleanly
  const readBack = await fs.readFile(tmp, 'utf-8');
  JSON.parse(readBack); // throws if disk write was corrupted
  await fs.rename(tmp, filePath);
}
```

**Step 2** — Replace the three `fs.writeFile` calls inside `applyCompetitorFindings`:

| Old | New |
|-----|-----|
| `await fs.writeFile(HOOKS_FILE, JSON.stringify(lib, null, 2) + '\n', 'utf-8')` | `await atomicWriteJson(HOOKS_FILE, lib)` |
| `await fs.writeFile(THEMES_DYNAMIC_FILE, JSON.stringify(pool, null, 2) + '\n', 'utf-8')` | `await atomicWriteJson(THEMES_DYNAMIC_FILE, pool)` |
| `await fs.writeFile(INTERRUPTS_DYNAMIC_FILE, JSON.stringify(pool, null, 2) + '\n', 'utf-8')` | `await atomicWriteJson(INTERRUPTS_DYNAMIC_FILE, pool)` |

The surrounding `try/catch` blocks already handle thrown errors — no other changes needed.

**Step 3** — Also clean up any leftover `.tmp` files at the start of `applyCompetitorFindings`:

```js
// Clean up any leftover temp files from previous failed runs
for (const f of [HOOKS_FILE, THEMES_DYNAMIC_FILE, INTERRUPTS_DYNAMIC_FILE]) {
  await fs.rm(f + '.tmp', { force: true });
}
```

---

## Test

After the fix, run:
```
node scripts/intelligence-refresh.mjs --dry-run
```
Verify: no `.tmp` files left behind, no "apply failed" messages, all three pool files still parse cleanly after the run.

Then run once live:
```
node scripts/intelligence-refresh.mjs --skip-competitor
```
(Skip competitor to save API quota — just tests the write path.)

---

## Do NOT change
- The logic of what gets added/filtered (brand safety, dedup, similarity checks)
- Any other function in the file
- Any other file

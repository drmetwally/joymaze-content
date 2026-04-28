# REELS-005-FOLLOWUP Audit Report

Date: 2026-04-28
Status: APPROVED by Claude (Sonnet 4.6) — 9/10
Scope: animal short sung recap duration fix only

## Goal
Make the Animal Facts Song Short use the real `sung-recap.mp3` duration instead of effectively falling back to a fixed ~17s window.

## Files in scope
- `scripts/generate-animal-narration.mjs`
- `remotion/compositions/AnimalFactsSongShort.jsx`
- `scripts/render-video.mjs`
- `docs/AGENT_LOG.md`

## Problem
The short-form animal path started from `sungRecapShortDurationSec: 17`, and the narration flow did not replace that placeholder with the real Suno recap duration. The short composition and render duration calculator also clamped recap timing to the old 16-18s fallback band, so even valid longer recap audio was not honored.

## What changed
### 1) `scripts/generate-animal-narration.mjs`
- Added `SUNG_RECAP_FILE = 'sung-recap.mp3'`
- Probes the real recap audio before segment generation
- Persists `episode.sungRecapShortDurationSec` when a valid duration is found
- Normalized several duration writes through a shared `roundDurationSec()` helper

### 2) `remotion/compositions/AnimalFactsSongShort.jsx`
- Replaced the old clamped recap-frame calculation
- Now uses a positive finite `episode.sungRecapShortDurationSec` value when present
- Keeps `17s` only as the fallback when no valid duration exists

### 3) `scripts/render-video.mjs`
- Updated `computeDuration()` for `AnimalFactsSongShort`
- Removed the old 16-18s clamp from the recap portion
- Duration now matches the persisted recap length when available

## Verification performed
### Syntax
- `node --check scripts\generate-animal-narration.mjs`
- `node --check scripts\render-video.mjs`

### Behavioral checks
- `node scripts\generate-animal-narration.mjs --episode output\longform\animal\ep03-hedgehog --dry-run`
- `node scripts\render-video.mjs --comp AnimalFactsSongShort --props-file .tmp-animal-song-props.json --dry-run`
- `node scripts\generate-animal-narration.mjs --episode output\longform\animal\ep03-hedgehog`
- `node scripts\render-video.mjs --comp AnimalFactsSongShort --animal-episode output\longform\animal\ep03-hedgehog`

## Key evidence
- Hedgehog narration dry-run reported:
  - `Sung recap: sung-recap.mp3 → 29.7s (would update episode.json)`
- Render dry-run with `sungRecapShortDurationSec: 29.7` reported:
  - `Duration    : 1206 frames (40.2s @ 30fps)`
- Live hedgehog narration refresh reported:
  - `Sung recap: sung-recap.mp3 → 29.7s`
  - `episode.json updated.`
- Live episode data now contains:
  - `hookNarrationDurationSec: 5.3`
  - `outroCtaShortDurationSec: 2.6`
  - `sungRecapShortDurationSec: 29.7`
- End-to-end live render completed:
  - `D:\Joymaze-Content\output\videos\AnimalFactsSongShort-1777400679568.mp4`
  - `D:\Joymaze-Content\output\videos\AnimalFactsSongShort-1777400679568-thumb.jpg`
  - Render duration: `1206 frames (40.2s @ 30fps)`

That confirms both the persisted episode data and the real renderer now consume the actual recap duration instead of the old fallback window.

## Scope control
- No scheduler wiring was added
- No unrelated generator behavior was changed
- No commit was made

## Audit focus for Claude
1. Confirm the recap duration should now be fully driven by the real audio length, not softly capped
2. Confirm `generate-animal-narration.mjs` is the right persistence seam for `sungRecapShortDurationSec`
3. Confirm the composition and render duration logic stay aligned after the clamp removal

## Recommended next step after audit
Claude should review the code diff together with this live validation packet, then decide whether the same persisted-duration pattern should be reused anywhere else a short-form audio asset still relies on a placeholder timing default.

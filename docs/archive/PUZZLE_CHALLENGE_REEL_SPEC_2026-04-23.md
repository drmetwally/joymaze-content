# Puzzle Challenge Reel Spec — 2026-04-23

Read-only format spec for the new JoyMaze puzzle reel type.
No code changes are included in this document.

---

## 1. Purpose

This format replaces the current still-image puzzle/activity short video style with a stronger interactive structure.

Instead of:
- static puzzle shown as a short video,

The new format becomes:
- challenge first,
- viewer solve window,
- short transition cue,
- ASMR-style answer reveal.

This format is intended to:
- improve short-form retention,
- create a stronger repeatable puzzle chapter unit,
- provide a better source unit for future longform compilation videos,
- clearly separate puzzle challenge reels from pure ASMR reels.

---

## 2. Format identity

### Name
**Puzzle Challenge Reel**

### Core loop
1. viewer sees puzzle immediately
2. viewer gets a clear challenge prompt
3. countdown creates urgency
4. timer ends
5. short visual/audio cue signals the answer is starting
6. ASMR-style solve begins

### Emotional target
- clear
- suspenseful
- interactive
- satisfying
- kid-safe
- repeatable across many puzzle types

---

## 3. What this format is not

This format is **not**:
- a pure ASMR calming reveal,
- a story reel,
- a static still-image video,
- a flashy effects-heavy motion design piece.

The puzzle remains the hero.
The challenge UI exists to create urgency and clarity, not to steal attention.

---

## 4. Visual structure

## A. Puzzle image
- The puzzle image is visible from frame 1.
- The puzzle is the main visual focus throughout the challenge phase.
- During the countdown phase, the puzzle should remain fully readable.

## B. Title / hook
- Placement: **top center**
- Should sit above the main viewing square / safe puzzle area for reels
- Style: bold, large, very readable, but not so dominant that it competes with the puzzle itself
- Recommended maximum: 1 line preferred, 2 lines max
- The title stays visible for the **entire challenge phase**
- The title disappears when the solve begins

### Hook style rules
Hooks should be immediate and direct, not theatrical.
Avoid fade-reveal or mystery-text treatment.

Good examples:
- Can you solve this maze in 10 seconds?
- Can you find all the words before time runs out?
- Can you spot the match in 8 seconds?
- Can your child solve this before the countdown ends?

## C. Countdown
- Style: **large digits**
- Countdown is the central motion element during the challenge phase
- Primary placement: **top-left area of the same title band / UI strip**
- Default rule: keep countdown in the top challenge strip for consistency
- The countdown disappears together with the title

### Countdown design rules
- use clear numbers only
- no radial timer
- no progress ring
- no decorative clock UI
- keep the digits bold and instantly readable

---

## 5. Layout rules

### Default v1 layout
- top strip / dark overlay band
- countdown on the left side of the strip
- title centered in the strip
- puzzle below, fully readable

### Alternate layout
If a puzzle image leaves strong left/right dead space due to crop or framing, countdown may move to a side position **only if readability clearly improves**.

Default remains the top strip.

Reason:
- format consistency,
- faster audience recognition,
- cleaner repeated experience across many reels.

---

## 6. Motion rules

## A. Challenge phase motion
The puzzle should not be completely dead still.
Use a **very subtle push-in** during the challenge phase.

### Recommended amount
- scale roughly from `1.00` to `1.03`
- smooth and almost invisible
- should create tension, not obvious camera movement

## B. Transition motion
At countdown end, use one very short emphasis pulse.

Recommended options:
- slight glow pulse
- micro zoom pulse
- slight brightness lift on the puzzle

### Recommended amount
- brief jump to around `1.04` or `1.05`
- under 1 second total

## C. Solve phase motion
Once the ASMR solve starts:
- keep the frame mostly stable
- let the reveal animation and pencil movement do the work
- avoid stacking more camera motion on top of the reveal unless needed for clarity

---

## 7. Audio structure

## A. Challenge phase
Audio stack:
- soft suspense bed
- gentle tick once per second
- optional very low pulse underneath

### Audio rules
- do not use a harsh literal clock sound
- keep it kid-safe and not anxiety-inducing
- ticking should create urgency without becoming annoying
- challenge audio must be sustainable across repeated use in future compilations

## B. Final 3-second ramp
Recommended enhancement:
- digits or tick feel slightly more pronounced during `3`, `2`, `1`
- small intensity lift only
- do not overdramatize

## C. Transition cue
At countdown end:
- ticking stops
- one short reveal-start cue plays

Good cue types:
- soft whoosh
- small chime hit
- short light impact

Keep this brief and functional.

## D. Solve phase
Audio stack:
- pencil/sketch sound as the main layer
- optional very soft background bed if needed
- keep the solve audio satisfying and clean

---

## 8. Transition rule

This is the locked transition logic for v1:

### Countdown-end sequence
1. countdown hits `0`
2. title and countdown disappear together
3. ticking stops
4. puzzle gets one short glow / zoom pulse
5. short reveal-start cue plays
6. ASMR solve begins immediately

### Design principle
The transition should be a **state change**, not a mini-scene.
It should clearly communicate:
**time is up, answer starts now.**

---

## 9. Timing model

The format uses two timing values:
1. **challenge window**
2. **solve window**

These should vary by puzzle type.
Do not force one universal duration on every reel.

## Recommended v1 challenge timings

### Maze
- challenge: **8–10 sec**
- solve: **10–14 sec**

### Word search
- challenge: **10–14 sec**
- solve: **12–18 sec**

### Matching / spot-the-difference
- challenge: **8–12 sec**
- solve: **8–12 sec**

### Dot-to-dot
- challenge: **6–8 sec**
- solve: **12–18 sec**

### Tracing
- challenge: **6–8 sec**
- solve: **8–12 sec**

### Quiz / visual puzzle
- challenge: **8–12 sec**
- solve: **8–12 sec**

## Suggested simple v1 defaults
If a single clean first pass is needed:
- Maze = `10s`
- Word search = `12s`
- Matching = `10s`
- Dot-to-dot = `8s`
- Quiz / tracing = `10s`

These are viewer-experience benchmarks, not academic solve benchmarks.
They should be tuned for perceived challenge and retention.

---

## 10. Format rules to lock

The following are treated as the working v1 rules:

1. title stays visible until solve begins
2. countdown is always present in the challenge window
3. countdown uses bold digits, not radial/progress UI
4. title and countdown disappear together
5. transition is brief and functional
6. solve uses the existing ASMR reveal language
7. challenge window timing varies by puzzle type
8. puzzle challenge reels replace the current still-image puzzle video lane

---

## 11. Why this format matters strategically

This is not just a better short.
It also creates a better longform building block.

A future compilation built from these units becomes:
- challenge,
- viewer attempt,
- payoff,
- repeat.

That is much stronger for longform YouTube than simply stitching together passive solve reels or static 15-second puzzle videos.

---

## 12. v1 success criteria

The format is successful when:
- the challenge is understandable immediately,
- the countdown increases suspense without clutter,
- the transition feels clean,
- the solve payoff is satisfying,
- the reel feels stronger than the current still-image puzzle videos,
- the format can later scale into compilation chapters without feeling repetitive too quickly.

---

## 13. Bottom line

Puzzle Challenge Reel v1 should feel like:
- a clean challenge prompt,
- a clear timer-driven attempt window,
- a short answer-start cue,
- and a satisfying ASMR solve.

The puzzle remains the hero.
The UI creates urgency.
The reveal delivers payoff.

# Animal Facts Song Short Spec

Date: 2026-05-07
Status: direction locked, implementation spec

## Product decision

The previous inherited short structure from longform animal facts is rejected for the new build lane.

Do **not** use this as the canonical short format anymore:
- hook
- reveal
- fact blocks
- sung summary
- CTA

Reason:
- the sung portion is the part that felt strongest and got the best feedback
- the older structure feels like chopped longform rather than a native repeatable short
- the new lane should optimize for replay, loopability, fun, and musical retention rather than teacher/explainer structure

## Canonical new format

### Core structure

**Animal named immediately -> all-song from first line -> escalating fact wonder -> loop ending**

This is now the default target structure for Animal Facts short-form.

## Format rules

### 1. Sung from start to finish
- The reel starts with sung narration immediately.
- No dead intro.
- No spoken setup before the song.
- No separate sung-summary segment at the end because the whole format is now the sung segment.
- The selected song becomes the timing source of truth for the final reel. Do not force a strong song back into a fixed short runtime.

### 2. Animal named immediately
- The animal should usually be named in the first line or first beat.
- Exception: a mystery-question opening is allowed only if the name payoff happens almost immediately inside the first lyric beat.
- There should be no standalone reveal scene.

### 3. Escalating fact wonder
- The middle beats should increase delight, surprise, cuteness, weirdness, or visual spectacle.
- Facts should not feel like numbered school facts.
- Each beat should feel like a lyric-worthy visual idea.

### 4. No CTA
- No explicit end CTA.
- No “what was your favorite fact?”
- No “follow for more” inside the format itself.
- If platform posting later needs CTA support, keep it outside the reel or in caption strategy.

### 5. Loop ending
- Ending should flow naturally back toward the opening line, image, or rhythm.
- Final beat should feel rewatchable, not conclusive.
- Ideal end state: viewer can loop back to the first frame/song phrase with no emotional drop.

## Intended feel

The format should feel like:
- an earworm animal short
- a delightful musical fact loop
- a replayable kid-safe wonder clip
- visual-first, lyric-first, retention-first

It should **not** feel like:
- a teacher explainer
- a quiz show
- a documentary summary
- a reveal gimmick
- a CTA funnel

## Structural beat model

Recommended baseline:

1. **Beat 1: opening hook lyric**
   - names the animal immediately
   - strongest instantly-graspable trait or contrast
   - must work in under ~3 seconds

2. **Beat 2: fact wonder beat**
   - remarkable trait in action
   - visual proof or behavior cue

3. **Beat 3: stronger / stranger / cuter fact beat**
   - deepen surprise
   - avoid repetition of the same type of fact

4. **Beat 4: payoff beat**
   - strongest image-friendly or emotionally lovable fact
   - often the beat most likely to trigger replay or delight

5. **Beat 5: loop beat**
   - ties back to beat 1 verbally, rhythmically, or visually
   - should feel like the song could restart cleanly

Notes:
- 4-beat and 6-beat variants are allowed if they preserve the same shape
- do not force five beats if the animal only supports four truly strong songable ideas
- stronger songs may justify longer reels with richer copy, as long as the structure stays musical, visual, and replayable

## Image design rules

Each visual beat must pass this test:

**Can a child understand the core idea in 2 to 3 seconds without audio?**

If not, the beat is too abstract, too dense, or poorly chosen.

### Visual requirements
- strong single-subject readability
- animal-first framing
- each beat should show a distinct visual action, trait, or environment cue
- image prompts should be written for immediate legibility, not just beauty
- maintain one consistent illustration medium and character design across the whole reel
- avoid collage, split-panel, or cluttered educational infographic energy

## Song-writing rules

### Lyric requirements
- short, sticky, repeatable lines
- rhythmic enough for real replay value
- child-friendly wording without sounding babyish
- facts must survive simplification without becoming false
- each line should land one clear idea only

### Avoid
- dense explanatory prose
- four-sentence fact blocks
- “did you know” classroom tone
- generic filler rhymes that weaken factual clarity
- overlong intro naming before the actual interesting part starts

## Source system decision

## No narrative seed bank

Do **not** build a Story-Reel-style narrative seed bank for this lane.

Reason:
- this format is not plot-driven
- the main selection problem is not emotional arc variety
- the main quality challenge is fit between animal, fact, lyric, and visual beat

## Build a lightweight animal-song topic bank instead

This is the recommended source layer.

### Proposed schema

Each topic entry should capture:
- `animalName`
- `slug`
- `category` (bird, mammal, sea life, insect, reptile, etc.)
- `habitat`
- `kidFamiliarityScore`
- `visualDistinctivenessScore`
- `surpriseScore`
- `cutenessScore`
- `songabilityScore`
- `sceneVarietyScore`
- `signatureHookTrait`
- `factBeats` (3-6 candidate facts, already filtered for short-form songability)
- `visualSetPieces` (strong image ideas)
- `loopEndingIdea`
- `avoidNotes` (things that confuse visuals or drag pacing)

### Purpose of the topic bank
- choose stronger animals on purpose
- avoid weak or repetitive animals
- ensure each episode starts from songable material, not generic encyclopedia facts
- preserve variation without needing a full story bank system

## Implementation phases

### Phase 1 — format lock
- lock the new sung-first structure in docs and task board
- stop inheriting the old longform-derived short contract

### Phase 2 — topic bank
- create the first curated animal-song topic bank
- start quality-first, not scale-first
- small champion set is better than large weak pool

### Phase 3 — brief generator refactor
Refactor the generator so it outputs the new short-native contract, roughly:
- opening hook lyric
- immediate animal naming line
- 3-5 escalating lyric fact beats
- loop ending line
- image prompts per beat
- Suno song prompt aligned to this format

Remove or de-emphasize from the old contract:
- standalone reveal block
- long prose fact descriptions
- explicit outro CTA block
- separate sung recap section as the “special ending”

### Phase 4 — composition refactor
Refactor the short composition to match the new structure.
Likely simpler than the current format.

Target scenes should be closer to:
- song beat 1
- song beat 2
- song beat 3
- song beat 4
- loop beat

not:
- hook scene
- reveal scene
- sung recap scene
- outro CTA scene

New timing rule:
- the composition follows the selected song duration, not a fixed reel duration target
- scene count may exceed beat count when a strong song needs more visual moments
- each beat can expand into multiple scene slices with different framing or camera motion while keeping the same lyric line active

### Phase 5 — benchmark set
Create 2-4 benchmark animals and iterate narrowly.
Recommended benchmark qualities:
- one cute/familiar animal
- one visually strange animal
- one behavior-rich animal
- one highly replayable/catchy candidate

## Quality gates

Before considering the lane stable, validate:
- immediate first-second hook strength
- no dead or weak non-song segments
- each beat readable fast without explanation
- song remains catchy across repeat listens
- ending loops naturally
- no obvious CTA energy
- visual consistency across all beat images

## Current recommendation

Proceed with:
1. topic bank design
2. brief-generator refactor
3. composition refactor
4. benchmark episodes

Avoid reopening any old longform-structure assumptions during this lane unless a specific problem forces it.

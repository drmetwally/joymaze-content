# JoyMaze Viral Psychology Framework
Last updated: 2026-04-16

> **Single source of truth for WHY content gets saved, shared, and clicked.**
> Every script reads `config/psychology-triggers.json`. This document explains the reasoning.

---

## The Research Foundation

Three findings from the literature shape everything:

1. **72% of shares are emotional, not logical** (Journal of Consumer Psychology, 2024)
   — Content is not shared because it is useful. It is shared because it makes someone *feel* something specific.

2. **Pinterest >2% 24hr save rate = viral.** Saves today = traffic in 2-3 months.
   — The save is the conversion event, not the click. Pinterest is a "planning" platform — people save for deferred use.

3. **Multiple emotional peaks outperform a single emotional climax.**
   — Videos and posts that deliver 2-3 emotional beats retain longer and share more than content with one big moment.

---

## The 5-Beat Viral Arc

Every piece of content that goes viral in this niche follows this arc. Not all 5 beats need to be explicit — but they must all be PRESENT.

```
INTERRUPT → TENSION → RECOGNITION → RESOLUTION → ACTION IMPULSE
```

| Beat | What it does | JoyMaze execution |
|------|-------------|-------------------|
| **INTERRUPT** | Stops the scroll before the brain engages | Sensory detail, identity call-out, or surprising visual |
| **TENSION** | Creates an unresolved feeling | Child mid-puzzle, screen face-down, partial completion visible |
| **RECOGNITION** | "That's me / my kid / my afternoon" | Real, specific moment — not a stock photo moment |
| **RESOLUTION** | The shift, the exhale, the completion | The quiet room, the finished puzzle, the child absorbed |
| **ACTION IMPULSE** | The reflex: save/share/comment | Automatic — triggered by the trigger, not manufactured by a CTA |

**The CTA paradox:** The best content never asks for the save. The save happens because the content delivered the full arc. A CTA on great content is redundant. A CTA on weak content doesn't save it.

---

## The 7 Triggers

Each piece of content targets **exactly one primary trigger**. Mixed triggers dilute both.

### 1. IDENTITY_MIRROR — "I am this kind of parent"
**Activation:** Content reflects who the parent IS or aspires to be. The share is a public identity assertion.
**Image requirement:** Parent visible at the scene's edge — not directing, just watching. The quiet pride of someone who already made the right choice.
**Caption arc:** Recognition → Affirmation
**Best platforms:** Instagram, Pinterest
**Slot assignments:** ARCHETYPE 2, ARCHETYPE 7, IDENTITY posts

---

### 2. SCREEN_RELIEF — "The guilt didn't come"
**Activation:** Names the screen-time anxiety first (without moralizing), then resolves it with a specific, real moment.
**Image requirement:** Abandoned device visible (tablet face-down, remote pushed aside). Child absorbed in printed activity. The discarded screen IS the message — no copy needed.
**Caption arc:** Tension acknowledgment → Relief arrival
**Best platforms:** TikTok, Instagram, Pinterest
**Slot assignments:** ARCHETYPE 1, ARCHETYPE 4, QUIET-MOMENT

---

### 3. CURIOSITY_GAP — "I need to know how this ends"
**Activation:** Visual or textual incompleteness that the brain cannot tolerate. The viewer is physiologically compelled to resolve it.
**Image requirement:** Activity at 30-60% completion. The shape is emerging, the path half-traced. Incompleteness IS the visual trigger.
**Caption arc:** Surprising premise → Withheld resolution
**Best platforms:** TikTok, X, YouTube
**Slot assignments:** Dot-to-dot, Matching, PRINTABLE-TEASE

---

### 4. CHALLENGE — "My kid can beat this"
**Activation:** Competitive ego in parent and child simultaneously. Comment bait is organic — everyone wants to prove their kid is smart.
**Image requirement:** Child at PEAK ENGAGEMENT — brow furrowed, leaning in, pencil active. Never a finished puzzle. The challenge must be LIVE.
**Caption arc:** Challenge invitation → Difficulty signal → Implicit comment bait
**Best platforms:** TikTok, Instagram, X
**Slot assignments:** Maze, Word Search, Sudoku, ACTIVITY-CHALLENGE

---

### 5. NOSTALGIA — "I remember this feeling"
**Activation:** A specific sensory fragment from childhood that parents (ages 25-40) recognize immediately.
**Image requirement:** Warm, imperfect, analog-feeling. NOT Instagram-polished. The activity should look like it has always existed.
**Caption arc:** Childhood memory fragment → Present moment echo
**Best platforms:** Pinterest, Instagram
**Slot assignments:** ARCHETYPE 3, ARCHETYPE 1

---

### 6. DEV_FOMO — "I need to save this for this weekend"
**Activation:** Fear of missing a developmental window. The save is deferred intent — "I will do this with my kid."
**Image requirement:** The activity IS the visual hero — well-lit, beautiful, clearly usable. Should look like something worth printing TODAY.
**Caption arc:** Skill connection → Deferred value statement → Save invitation
**Best platforms:** Pinterest, YouTube, Instagram
**Slot assignments:** ARCHETYPE 6, FACT-CARD, PRINTABLE-TEASE, Tracing

---

### 7. COMPLETION_SATISFACTION — "I need to watch this finish"
**Activation:** Mirror neurons fire watching something become complete. No cognitive effort. The dopamine is visceral and immediate.
**Image requirement:** 80-90% complete state for static images. For video: the reveal IS the content. The brain crosses the finish line automatically.
**Caption arc:** State before → Transformation hint → Satisfaction invitation
**Best platforms:** TikTok, YouTube, Instagram
**Slot assignments:** ARCHETYPE 5, ASMR videos, Coloring activities

---

## Platform Strategy: One Trigger Per Platform

Each platform has a primary emotional currency. Lead with that trigger for the platform's native content.

| Platform | Primary Trigger | Why |
|----------|----------------|-----|
| Pinterest | DEV_FOMO | Saves = future use. "I'll do this with my kid." Educational + deferred value wins. |
| Instagram | IDENTITY_MIRROR | Identity performance. Shares = "look at the parent I am." |
| TikTok | COMPLETION_SATISFACTION | Completion rate = viral metric. Watch till the end = algorithm push. |
| YouTube | CHALLENGE | Watch time. Challenge format keeps kids watching to see if they can beat it. |
| X | CURIOSITY_GAP | Thread-friendly. The unresolved hook drives reply + retweet. |

---

## Hook → Trigger Mapping

The hooks library (`config/hooks-library.json`) now tags every hook with its primary trigger. Use these as starting points — not verbatim.

| Trigger | Proven opener patterns |
|---------|----------------------|
| IDENTITY_MIRROR | "This is what it looks like when..." / "Some parents [old behavior]. She..." |
| SCREEN_RELIEF | "X minutes passed. She never looked up." / "The screen is right there. She hasn't touched it." |
| CURIOSITY_GAP | "He figured it out before I did. I'm still thinking about why." / "This stumped 3/4 adults." |
| CHALLENGE | "Can your kid solve this in under 2 minutes?" / "1 in 5 kids gets this right." |
| NOSTALGIA | "Somewhere in your memory, there's a quiet Saturday morning." / "Remember when..." |
| DEV_FOMO | "The 10-minute activity that builds the skill [experts] actually recommend." |
| COMPLETION_SATISFACTION | "Blank page. Pencil in hand. Twenty minutes later — something that was nothing." |

---

## What Changed in the System (2026-04-16)

1. **`config/psychology-triggers.json`** — Single source of truth. All scripts read from here.
2. **`generate-prompts.mjs`** — Now requires `**Primary trigger:**` field in every prompt output. System prompt includes the full trigger → slot map and activation rules.
3. **`generate-captions.mjs`** — Now injects trigger-specific opener guidance into every caption prompt, keyed by content category/slot.
4. **`config/hooks-library.json`** — Added 7 psychologically-engineered hooks, one per trigger type.
5. **`remotion/compositions/LongFormEpisode.jsx`** — New long-form video engine (see below).

---

## Long-Form Content Engine

**Target:** 7.5-8 minute videos. YouTube Shorts are 60s max — this is for YouTube (standard) + TikTok series format.

### Why long-form works for this niche

- Kids activity videos retain through completion when: (a) there's a story, (b) there's a challenge, or (c) there's a satisfying series of completions
- Parent-saving behavior: longer format videos are bookmarked for "rainy afternoon" use → higher intent
- YouTube algorithm rewards watch time, not just views — 8 min of retained engagement outperforms 100 views of a 60s Short that gets skipped

### The 3 Formats

**Format 1: Adventure + Activities (Flagship)**
```
[0:00-0:20] Intro — Episode hook + title card
[0:20-2:20] Story Arc — 8 slides × 15s (Joyo story, the adventure)
[2:20-2:25] Transition — "Now it's your turn!"
[2:25-7:05] Activity Pack — 4 activities × 70s each
[7:05-7:35] Outro — Celebration + save hook + next episode preview
≈ 7.5 min
```

**Format 2: ASMR Activity Pack (Calm/Sensory)**
```
[0:00-0:20] Intro hook
[0:20-6:40] 5 ASMR reveals × 76s each (coloring, maze, word search, dot-to-dot, tracing)
[6:40-7:20] Outro
≈ 7.5 min
```

**Format 3: Challenge Ladder (Gamification)**
```
[0:00-0:20] Hook — "4 challenges. Can you beat them all?"
[0:20-5:40] 4 difficulty levels × 80s each (Easy → Medium → Hard → Extreme)
[5:40-7:00] Champion outro + save bait
≈ 7 min
```

### How to produce one

1. `npm run generate:longform` — Generates episode.json (story + 4 activity briefs)
2. Generate images per the brief (Gemini)
3. Run extract scripts for maze/wordsearch/dotdot (same as ASMR workflow)
4. `npm run render:longform -- --episode ep01-title` — Renders the full video

### Where output lives

- Brief: `output/longform/ep{N}-{title}/episode.json`
- Images: referenced from story + asmr folders
- Video: `output/videos/longform-{date}-ep{N}.mp4`

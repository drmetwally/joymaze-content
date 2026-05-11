# Animal Song Topic Bank Notes

Date: 2026-05-07
Status: initial champion source layer created

## Purpose

`config/animal-song-topic-bank.json` is the curated source bank for the new Animal Facts Song Short lane.

This is **not** a story bank.
It exists to help the generator choose animals and fact beats that already fit the new format:
- animal named immediately
- all-song from first line
- escalating fact wonder
- loop ending

## Why this exists

The main risk in this lane is not weak plot.
The main risk is weak fit between:
- animal choice
- hook trait
- fact beat quality
- visual readability
- songability
- loop-ending potential

The topic bank is meant to improve that fit before generation even starts.

## Current champion set

Champion-tier entries were chosen for strongest initial benchmark potential:
- Fennec Fox
- Okapi
- Puffin
- Sea Otter

These were selected because they combine:
- immediate naming value
- strong silhouette or visual weirdness
- multiple lyric-friendly fact beats
- better replay potential than generic animal picks

## Scoring intent

Scores are intentionally subjective but operationally useful.
They should help ranking and filtering, not pretend to be scientific truth.

Most important for early generation:
1. `songabilityScore`
2. `visualDistinctivenessScore`
3. `surpriseScore`
4. `sceneVarietyScore`

## How to use the bank

For the first implementation pass:
- prefer `championTier: true`
- choose one animal whose hook trait is obvious in under 3 seconds
- use only 3-5 fact beats that are already singable without heavy rewriting
- preserve the `loopEndingIdea` in the generator contract

## What to avoid

Do not use the bank like a giant encyclopedia dump.
A weak but famous animal is still weaker than a strong, visually weird, highly songable one.

Do not reward animals just for having many facts.
Reward animals whose facts convert into:
- catchy lines
- visually different scenes
- memorable repetition

## Next use

This bank should feed the next generator refactor.
The refactor should stop asking for long prose fact descriptions and instead ask for:
- opening hook lyric
- immediate animal naming line
- 3-5 escalating lyric fact beats
- loop ending lyric
- image prompts per beat
- Suno prompt aligned to the same beat flow

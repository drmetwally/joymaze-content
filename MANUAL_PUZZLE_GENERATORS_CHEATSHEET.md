# Manual Puzzle Generators Cheatsheet

Small quickstart for running the built-in puzzle generators without the full pipeline.

## Where to run

```powershell
cd D:\Joymaze-Content
```

## Dry run first

Use the `:dry` script first when testing flags.

```powershell
npm run wordsearch:generate:dry -- --title "Dogs 01" --theme "dogs" --difficulty easy --words "POODLE,BARK,TAIL,LEASH"
```

---

## 1) Word Search

```powershell
npm run wordsearch:generate -- --title "Dogs 01" --theme "dogs and poodles" --difficulty easy --slug dogs-01 --words "POODLE,BARK,TAIL,LEASH"
```

### Useful flags
- `--title` visible puzzle title
- `--theme` theme label / hook input
- `--difficulty easy|medium|hard|difficult|extreme`
- `--slug` output folder name
- `--words` comma-separated custom words
- `--countdown` challenge video timer value
- `--seed` deterministic rerun
- `--out-dir` custom output folder

### Notes
- `--words` is sanitized to A-Z only
- use single words, comma-separated
- `easy` is best when you want fewer clue words and simpler grids

---

## 2) Maze

```powershell
npm run maze:generate -- --title "Dog Maze 01" --theme "dogs and poodles" --difficulty easy --slug dog-maze-01 --shape rectangle
```

### Useful flags
- `--title`
- `--theme`
- `--difficulty`
- `--slug`
- `--shape` currently use `rectangle`
- `--rows` and `--cols` to override size
- `--cell-size` to force layout size
- `--path-color` solution path color
- `--countdown`
- `--seed`
- `--out-dir`

---

## 3) Matching

```powershell
npm run matching:generate -- --title "Dog Match 01" --theme "animals" --difficulty easy --slug dog-match-01
```

### Useful flags
- `--title`
- `--theme`
- `--difficulty`
- `--slug`
- `--countdown`
- `--seed`
- `--out-dir`

### Notes
- matching pulls character stickers from the universal asset library (`assets/library/index.json`)
- supported themes: `animals`, `ocean`, `space`, `dinosaurs`, `farm`, `vehicles`

---

## Output files

All generators write to:

```text
output/challenge/generated-activity/<slug>/
```

Typical files:
- `activity.json`
- `puzzle.json`
- `blank.png`
- `solved.png`
- `puzzle.png`
- SVG source files
- generator-specific data like `wordsearch.json` or `path.json`

## Best reuse pattern

1. do a dry run
2. run real generation
3. inspect `blank.png` for the puzzle page
4. inspect `solved.png` for the answer page
5. reuse the same `--seed` if you want the exact same puzzle again


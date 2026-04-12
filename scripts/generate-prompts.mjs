#!/usr/bin/env node

/**
 * JoyMaze Content — Image Prompt Generator
 *
 * Generates rich, story-driven image generation prompts informed by the full
 * JoyMaze writing style guide, content archetypes, and brand strategy.
 * Output prompts are designed for manual use in ChatGPT/Gemini image generation.
 *
 * Usage:
 *   node scripts/generate-prompts.mjs                    # Generate today's batch (10 prompts)
 *   node scripts/generate-prompts.mjs --count 3          # Generate 3 prompts
 *   node scripts/generate-prompts.mjs --archetype 1      # Specific archetype only
 *   node scripts/generate-prompts.mjs --dry-run           # Preview system prompt, no API call
 *   node scripts/generate-prompts.mjs --save              # Save output to output/prompts/
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output', 'prompts');

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SAVE = args.includes('--save');
const FORCE_FULL = args.includes('--force-full');
const countIdx = args.indexOf('--count');
const PROMPT_COUNT = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 10;
const archIdx = args.indexOf('--archetype');
const FILTER_ARCHETYPE = archIdx !== -1 ? parseInt(args[archIdx + 1], 10) : null;

// Load the full writing style guide and content archetypes
async function loadStrategyContext() {
  const [styleGuide, archetypes] = await Promise.all([
    fs.readFile(path.join(ROOT, 'config', 'writing-style.md'), 'utf-8'),
    fs.readFile(path.join(ROOT, 'docs', 'CONTENT_ARCHETYPES.md'), 'utf-8'),
  ]);
  return { styleGuide, archetypes };
}

// Difficulty rotation: Easy on Mon/Thu, Medium on Tue/Fri, Hard on Wed/Sat
const DIFFICULTY_BY_DAY = ['easy', 'easy', 'medium', 'hard', 'easy', 'medium', 'hard'];

// Series naming — day-specific labels that build recurring audience anticipation.
// Empty string = no series that day. Caption generator should weave the series name naturally
// into maze/activity slots (not forced into every slot — just where it fits).
const SERIES_NAMES = ['', 'Maze Monday', '', 'Puzzle Power Wednesday', '', 'Fine Motor Friday', ''];

// Full activity pool — 8 types covering JoyMaze app + KDP activity books
// App: maze, word-search, matching, dot-to-dot, sudoku, coloring
// Books: tracing, quiz (+ above)
const ACTIVITY_POOL = [
  { category: 'activity-maze',        label: 'Maze Puzzle',            skill: 'Problem-solving, spatial reasoning', source: 'both' },
  { category: 'activity-word-search', label: 'Word Search',            skill: 'Vocabulary, letter recognition',    source: 'both' },
  { category: 'activity-matching',    label: 'Matching / Spot-the-Difference', skill: 'Observation, memory',      source: 'both' },
  { category: 'activity-dot-to-dot',  label: 'Dot-to-Dot',            skill: 'Number sequencing, fine motor',     source: 'both' },
  { category: 'activity-sudoku',      label: 'Kids Sudoku',            skill: 'Logic, number patterns',           source: 'both' },
  { category: 'activity-coloring',    label: 'Coloring Page',          skill: 'Creativity, color recognition',    source: 'both' },
  { category: 'activity-tracing',     label: 'Tracing / Drawing',      skill: 'Fine motor skills, pre-writing',   source: 'books' },
  { category: 'activity-quiz',        label: 'Quiz / Visual Puzzle',   skill: 'Logic, pattern recognition',       source: 'books' },
];

// ── Activity theme pool ──
// Themes are pre-assigned in code — the LLM never picks them freely.
// Normalized names (no slashes) so string comparison is reliable across pool + LLM output.
const THEME_POOL = [
  // Nature & Animals
  'Ocean Animals', 'Space and Planets', 'Forest Animals', 'Safari and Jungle',
  'Dinosaurs', 'Farm Animals', 'Bugs and Insects', 'Arctic Animals', 'Birds',
  'Desert Animals', 'Pets and Cats', 'Dogs and Puppies', 'Butterflies', 'Sea Turtles',
  // Fantasy & Adventure
  'Pirates and Treasure', 'Fairy Tale Castle', 'Dragons and Fantasy', 'Superheroes',
  'Mermaids', 'Knights and Armor', 'Wizards and Magic', 'Unicorns',
  // Transport & Tech
  'Vehicles and Trains', 'Rockets and Spaceships', 'Robots and Technology',
  'Fire Trucks', 'Airplanes', 'Submarines',
  // Everyday Life & Seasons
  'Food and Cooking', 'Weather and Seasons', 'Garden and Flowers', 'Camping Outdoors',
  'Circus and Carnival', 'Sports and Games', 'Construction and Building',
  'Music Instruments', 'Holidays and Celebrations', 'Birthday Party',
  'Rainy Day Indoors', 'Snowy Winter', 'Spring Flowers', 'Autumn Leaves',
  // Learning & School
  'Numbers and Math', 'Alphabet Letters', 'Colors and Shapes', 'Science Experiments',
  'Maps and Geography', 'Ancient Egypt', 'Under the Sea',
  // Fun & Quirky
  'Candy Land', 'Bakery and Pastries', 'Jungle Explorer', 'Treasure Map',
  'Safari Adventure', 'Underwater Cave', 'Volcano Island', 'Rainbow World',
  'Toy Workshop', 'Snack Time', 'Funny Monsters', 'Baby Animals',
];

// Merged pool: hardcoded + dynamic (populated in main() after loadDynamicPools())
let MERGED_THEME_POOL = [...THEME_POOL];

/**
 * Load competitor intelligence from config/competitor-intelligence.json.
 * Returns structured data or null if file doesn't exist yet.
 */
async function loadCompetitorIntelligence() {
  try {
    const data = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'competitor-intelligence.json'), 'utf-8'));
    // Only use if generated within the last 14 days
    const age = Date.now() - new Date(data.generated_at || 0).getTime();
    if (age > 14 * 24 * 60 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

/**
 * Load audit learnings from config/audit-learnings.json.
 * Returns critical + high severity lessons. Silent fallback if file missing.
 */
async function loadAuditLearnings() {
  try {
    const data = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'audit-learnings.json'), 'utf-8'));
    return (data.lessons || []).filter(l => l.severity === 'critical' || l.severity === 'high');
  } catch {
    return [];
  }
}

/**
 * Load dynamic pools from config files (silent fallback if files don't exist yet).
 */
async function loadDynamicPools() {
  const result = { themes: [], patternInterrupts: [], hookExamples: [] };
  const CONFIG = path.join(ROOT, 'config');

  // Dynamic themes
  try {
    const data = JSON.parse(await fs.readFile(path.join(CONFIG, 'theme-pool-dynamic.json'), 'utf-8'));
    result.themes = (data.themes || [])
      .filter(t => t.brand_safe === true && (t.confidence ?? 1) >= 0.5)
      .map(t => t.name);
  } catch {}

  // Dynamic pattern interrupts
  try {
    const data = JSON.parse(await fs.readFile(path.join(CONFIG, 'pattern-interrupt-dynamic.json'), 'utf-8'));
    result.patternInterrupts = (data.interrupts || [])
      .filter(p => p.brand_safe === true && (p.confidence ?? 1) >= 0.5);
  } catch {}

  // Top hooks for system prompt injection (performance_score >= 0.7, or brand_safe if no score yet after first week)
  try {
    const data = JSON.parse(await fs.readFile(path.join(CONFIG, 'hooks-library.json'), 'utf-8'));
    const hooks = (data.hooks || []).filter(h => h.brand_safe === true);
    // Split into scored and unscored; show scored (>=0.7) + top unscored as preview
    const scored   = hooks.filter(h => typeof h.performance_score === 'number' && h.performance_score >= 0.7);
    const unscored = hooks.filter(h => h.performance_score === null).slice(0, 4);
    result.hookExamples = [...scored, ...unscored].slice(0, 16);
  } catch {}

  return result;
}

/**
 * Pre-assign themes for today's activity slots in code.
 * Excludes themes used in the last `daysBack` days so the LLM never has to decide.
 * Returns an array of theme strings (one per activity slot).
 */
function pickActivityThemes(count, usedThemes, daysBack = 7, boostThemes = []) {
  // Normalize for comparison: lowercase, strip slashes + extra spaces
  const normalize = s => s.toLowerCase().replace(/[/\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const usedNorm = new Set([...usedThemes].map(normalize));
  const boostNorm = new Set(boostThemes.map(normalize));

  const available = MERGED_THEME_POOL.filter(t => !usedNorm.has(normalize(t)));

  // Partition: trending themes that are available get priority slots
  const trending = available.filter(t => boostNorm.has(normalize(t)));
  const rest = available.filter(t => !boostNorm.has(normalize(t)));

  // Deterministic seed: day-of-year so re-runs today get same themes but tomorrow differs
  const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const shuffle = arr => [...arr].sort((a, b) => {
    const ha = (THEME_POOL.indexOf(a) * 2654435761 + doy * 40503) >>> 0;
    const hb = (THEME_POOL.indexOf(b) * 2654435761 + doy * 40503) >>> 0;
    return ha - hb;
  });

  // Give trending themes up to 2 of the 5 slots (don't flood every slot with trends)
  const trendingSlots = Math.min(trending.length, Math.min(2, Math.floor(count / 2)));
  const trendingPicks = shuffle(trending).slice(0, trendingSlots);
  const restPicks = shuffle(rest).slice(0, count - trendingPicks.length);
  const picks = [...trendingPicks, ...restPicks];

  // Fallback: if pool exhausted, refill from full pool
  if (picks.length < count) {
    const fallback = THEME_POOL.filter(t => !picks.includes(t));
    return [...picks, ...shuffle(fallback)].slice(0, count);
  }
  return picks;
}

// Pick 5 activity types for today — random selection from the pool of 8
// This creates natural daily rotation without any extra logic
function pickTodaysActivities() {
  return [...ACTIVITY_POOL].sort(() => Math.random() - 0.5).slice(0, 5);
}

// ── Art style rotation pool ──
// 28 styles → at 5 per day, each style appears roughly once every 5-6 days before repeating.
// Day-of-year + slot-index offset produces distinct styles across all 5 story slots each day.
const ART_STYLES = [
  'soft-focus photorealistic, warm golden tones, shallow depth of field',
  'warm watercolor illustration, wet-on-wet edges, visible paper grain',
  '3D Pixar-style render, subsurface skin scatter, soft rim light',
  'paper cutout collage, layered textures, flat color silhouettes',
  'crayon-on-paper children\'s drawing, thick waxy strokes, slight smudging',
  'oil painting with thick impasto brushstrokes, warm amber palette',
  'anime-inspired flat linework, bold outlines, vibrant saturated fills',
  'flat vector cartoon, clean geometry, bright primary colors',
  'soft pastel children\'s book illustration, gouache texture',
  'claymation-style 3D, matte clay surfaces, soft studio lighting',
  'vintage storybook illustration, crosshatching, muted earthy tones',
  'ink-and-wash, bold black lines with loose watercolor fill',
  'linocut print style, high-contrast black/white with one accent color',
  'digital painterly, Concept Art House style, cinematic lighting',
  // Extended pool — reduces repetition from ~3 days to ~6 days
  'mixed-media collage, torn magazine paper, painted brush marks, textured background',
  'golden-hour photography style, lens flare, bokeh leaves, warm orange cast',
  'Japanese woodblock print style, flat areas of color, bold outlines, decorative borders',
  'soft felt-craft aesthetic, wool textures, hand-stitched outlines, muted palette',
  'children\'s editorial illustration, clean ink lines, limited 3-color palette, white space',
  'gouache on toned paper, opaque highlights, muted mid-century palette',
  'risograph print style, two-color overlapping halftone dots, slight misregistration',
  'pencil sketch with selective watercolor wash, loose gestural lines',
  'retro 1970s children\'s book illustration, earthy tones, rounded shapes, grain texture',
  'moody blue-hour photography, long shadows, cool tones, window light glow',
  'stained glass window style, bold black lead lines, jewel-toned color fills',
  'loose impressionist brushwork, dappled light, soft edges, garden palette',
  'bold graphic novel style, thick black outlines, flat cel shading, dynamic angles',
  'folk art / naive style, flat perspective, hand-painted look, folk pattern borders',
];

function getArtStylesForToday(date, count) {
  const base = dayOfYear(date) * 7; // offset changes each day
  return Array.from({ length: count }, (_, i) => ART_STYLES[(base + i) % ART_STYLES.length]);
}

// ── Child profiles — 5 distinct age/gender combos, rotated daily ──
// Pre-assigning per slot prevents LLM from defaulting to the same age/gender repeatedly.
const CHILD_PROFILES = [
  { age: 4, gender: 'girl' },
  { age: 6, gender: 'boy' },
  { age: 5, gender: 'girl' },
  { age: 7, gender: 'boy' },
  { age: 8, gender: 'girl' },
];

function getChildProfilesForToday(date) {
  const offset = dayOfYear(date) % 5;
  return Array.from({ length: 5 }, (_, i) => CHILD_PROFILES[(i + offset) % 5]);
}

// ── Archetype 7 scene rotation pool ──
// Each entry is a distinct scene/setting so "parent + tablet on couch" doesn't repeat daily.
// Day-of-year mod picks the scene — guarantees 20+ day rotation before any repeat.
const ARCH7_SCENES = [
  { setting: 'Kitchen table, morning light', activity: 'Parent scrolling JoyMaze mazes on a tablet while child eats breakfast', detail: 'cereal bowl, morning sun through window, tablet propped against a milk carton' },
  { setting: 'Car backseat, road trip', activity: 'Child using JoyMaze coloring on a phone in a car seat', detail: 'window showing blurred highway trees, snack wrappers, headphones dangling' },
  { setting: 'Waiting room, doctor\'s office', activity: 'Child doing a JoyMaze word search on a tablet in a waiting room', detail: 'plastic chairs, magazines on side table, fish tank in blurred background' },
  { setting: 'Backyard picnic blanket', activity: 'Tablet showing JoyMaze dot-to-dot lying on a picnic blanket beside crayons', detail: 'grass peeking through blanket edges, juice box, ants on a cracker' },
  { setting: 'Grandparent\'s living room', activity: 'Grandparent and child looking at JoyMaze puzzles on a tablet together', detail: 'old armchair, reading glasses on side table, family photos on wall' },
  { setting: 'Rainy window seat', activity: 'Child curled up with a tablet showing JoyMaze mazes by a rain-streaked window', detail: 'rain droplets on glass, cozy blanket, stuffed animal beside them' },
  { setting: 'Airport gate, travel day', activity: 'Parent handing child a tablet with JoyMaze open at a busy gate', detail: 'boarding passes, carry-on bags, planes visible through terminal windows' },
  { setting: 'Bedtime routine, dim bedroom', activity: 'Tablet glowing softly on a bed showing a JoyMaze coloring page', detail: 'nightlight glow, pajamas visible, storybook on nightstand' },
  { setting: 'Park bench, playground', activity: 'Parent on a park bench, tablet showing JoyMaze while child plays nearby', detail: 'playground equipment in background, fallen leaves, coffee thermos' },
  { setting: 'Sibling sharing on the floor', activity: 'Two pairs of hands pointing at a JoyMaze puzzle on a shared tablet', detail: 'living room carpet, scattered LEGO pieces, afternoon light from doorway' },
  { setting: 'Bath time wind-down', activity: 'Tablet on a bathroom counter showing JoyMaze, towel and rubber duck nearby', detail: 'steam on mirror, toothbrush holder, bath crayons on tub edge' },
  { setting: 'Camping tent, flashlight glow', activity: 'Tablet showing JoyMaze mazes inside a tent lit by flashlight', detail: 'sleeping bag, flashlight casting shadows, zipper half-open showing stars' },
  { setting: 'Library quiet corner', activity: 'Child with headphones doing JoyMaze sudoku on a tablet at a library table', detail: 'stacked picture books, library card, soft overhead light' },
  { setting: 'Sunday morning bed', activity: 'Parent and child in bed, tablet between them showing JoyMaze tracing', detail: 'messy sheets, coffee mug on nightstand, sun through curtains' },
  { setting: 'Restaurant booth, waiting for food', activity: 'Child using JoyMaze matching game on a phone at a restaurant', detail: 'crayons from kids menu scattered, water glass with straw, menu propped up' },
  { setting: 'Cozy fort made of blankets', activity: 'Tablet glowing inside a blanket fort showing JoyMaze puzzles', detail: 'fairy lights, pillow walls, flashlight, stuffed animals guarding entrance' },
  { setting: 'After-school kitchen counter', activity: 'Tablet on kitchen counter with JoyMaze open, backpack dropped on floor', detail: 'apple slices on plate, homework folder, fridge magnets' },
  { setting: 'Ferry or boat ride', activity: 'Child on a ferry bench focused on JoyMaze on a tablet', detail: 'water visible through window, life jacket on wall, seagulls outside' },
  { setting: 'Laundry room, parent multitasking', activity: 'Tablet balanced on dryer showing JoyMaze while parent folds clothes', detail: 'warm laundry pile, detergent bottle, child sitting on floor nearby' },
  { setting: 'Treehouse / balcony', activity: 'Tablet on a wooden railing showing JoyMaze with trees in background', detail: 'tree branches, bird feeder, child\'s sneakers kicked off beside tablet' },
];

// ── Pattern Interrupt rotation pool ──
// Rotates sub-types (myth-bust, did-you-know, surprising stat, counterintuitive, seasonal hook)
// and specific TOPICS so the LLM doesn't default to "screen time myth + brain lightbulb" every day.
const PATTERN_INTERRUPT_POOL = [
  { subtype: 'myth-bust', topic: 'Coloring inside the lines is NOT more important than free coloring — messy coloring builds creativity faster', visual: 'Split image: neat coloring vs wild colorful scribbles — the messy side is labeled "creativity"' },
  { subtype: 'myth-bust', topic: 'Kids don\'t need less screen time — they need BETTER screen time (active vs passive)', visual: 'Two tablets side by side: one playing a video (passive), one showing a maze being solved (active)' },
  { subtype: 'myth-bust', topic: 'Boredom is not the enemy — bored kids invent, create, and problem-solve', visual: 'Child\'s hands building something out of random household items — tape, boxes, string' },
  { subtype: 'myth-bust', topic: 'Puzzle difficulty should NOT match age exactly — slight frustration builds grit', visual: 'Close-up of a pencil eraser with eraser marks on a maze — evidence of trying, failing, trying again' },
  { subtype: 'did-you-know', topic: 'Mazes activate the same brain region as chess — spatial reasoning and planning', visual: 'Side-by-side: a maze puzzle and a chess board, connected by glowing neural pathways' },
  { subtype: 'did-you-know', topic: 'Kids who practice puzzles regularly show measurable improvements in spatial reasoning — the same skill needed for math and reading', visual: 'Infographic-style: puzzle pieces forming an upward graph arrow' },
  { subtype: 'did-you-know', topic: 'Coloring reduces cortisol (stress hormone) in children just like meditation does', visual: 'Calm watercolor wash with a half-colored mandala and a small heart-rate line going smooth' },
  { subtype: 'did-you-know', topic: 'Word searches build the same scanning skills kids need for reading fluency', visual: 'A word search grid morphing into an open book — letters becoming words becoming sentences' },
  { subtype: 'surprising-stat', topic: 'Parents consistently report their kids reach for activity books over tablets when both are available', visual: 'Bold "vs" graphic: a pencil and activity book on one side, a tablet face-down on the other' },
  { subtype: 'surprising-stat', topic: 'The average 5-year-old can solve a maze faster than most adults think', visual: 'Stopwatch showing 2:30 next to a completed maze — "Your kid is faster than you think"' },
  { subtype: 'counterintuitive', topic: 'The WORST time to give a kid a puzzle is when they\'re calm — give it when they\'re restless', visual: 'Before/after: restless scattered toys → focused hands on a maze, same room' },
  { subtype: 'counterintuitive', topic: 'Printing a coloring page is more engaging than a coloring app — the paper matters', visual: 'Hands holding a printed coloring page with real crayons vs a tablet coloring app — the paper version is more lived-in' },
  { subtype: 'counterintuitive', topic: 'Kids learn more from activities they CHOOSE than ones assigned to them', visual: 'Two hands: one being handed a worksheet (flat expression), one reaching for a puzzle book (eager grip)' },
  { subtype: 'counterintuitive', topic: 'Dot-to-dot is stealth math — kids practice number sequencing without realizing it', visual: 'Dot-to-dot page where the numbers are highlighted, revealing it\'s actually a counting lesson' },
  { subtype: 'seasonal-hook', topic: 'Spring break doesn\'t have to mean screen overload — 5 printable activities for the car ride', visual: 'Car window view of spring landscape + printed activity pages on the backseat' },
  { subtype: 'seasonal-hook', topic: 'Rainy day survival kit: 3 puzzles that buy you 45 minutes of quiet', visual: 'Window with rain streaks + a stack of printed mazes, word searches, and coloring pages on a table' },
  { subtype: 'seasonal-hook', topic: 'Summer slide is real — keep their brain sharp with 10 minutes of puzzles a day', visual: 'Calendar showing summer months with small puzzle icons on each day' },
  { subtype: 'seasonal-hook', topic: 'Back-to-school prep starts with fine motor skills — tracing and coloring are homework warmups', visual: 'Backpack with school supplies + a completed tracing sheet tucked between notebooks' },
  { subtype: 'edutainment', topic: 'The 5 skills every kindergarten teacher wishes kids practiced at home', visual: 'Five icons in a row: scissors (fine motor), magnifying glass (observation), puzzle piece (logic), pencil (writing), book (reading)' },
  { subtype: 'edutainment', topic: 'How to tell if your kid is a visual learner, kinesthetic learner, or both', visual: 'Three paths diverging: one with eyes/colors, one with hands/movement, one merging both' },
  { subtype: 'edutainment', topic: 'What happens in a child\'s brain during a maze — the science of problem-solving', visual: 'Transparent brain outline with glowing pathways lighting up as a maze is being solved below it' },
  { subtype: 'edutainment', topic: 'Why kids who trace before they write have neater handwriting — the motor memory connection', visual: 'Split: dotted tracing lines on left, neat handwriting on right, arrow connecting them' },
  // Extended pool — adds ~15 more days of variety before any topic repeats
  { subtype: 'myth-bust', topic: 'Quiet kids aren\'t bored — they\'re processing. Silence is a sign of deep focus, not disengagement', visual: 'Child\'s face close-up: eyes slightly unfocused, pencil still, very clearly thinking hard' },
  { subtype: 'myth-bust', topic: 'Coloring books don\'t limit creativity — they train it. Constraint is the mother of invention', visual: 'Half-filled coloring page on left, abstract painting by same child on right' },
  { subtype: 'myth-bust', topic: 'Kids who struggle with mazes aren\'t "bad at puzzles" — they\'re building persistence', visual: 'Three attempts at the same maze, each one getting closer to the exit' },
  { subtype: 'did-you-know', topic: 'Dot-to-dot counting prepares kids for multiplication more than flash cards do', visual: 'Dot-to-dot 1-to-50 page on left, multiplication grid on right — same neural pathway highlighted' },
  { subtype: 'did-you-know', topic: 'Left-handed kids who use activity books develop better bilateral coordination than those who only type', visual: 'Left hand gripping a pencil, completing a maze, brain hemisphere diagram in corner' },
  { subtype: 'did-you-know', topic: 'A child who colors for 20 minutes shows the same calm EEG pattern as an adult after yoga', visual: 'EEG wave going from jagged to smooth, child with crayons at the center' },
  { subtype: 'surprising-stat', topic: 'Kids complete significantly more of an activity when a parent sits nearby — even when the parent isn\'t helping at all', visual: 'Two pie charts: completion rate alone vs. with parent in the room' },
  { subtype: 'surprising-stat', topic: 'Printable activities get used far more often when stored in a visible spot — out of sight really is out of mind', visual: 'Open folder of colorful activity pages on a counter vs. closed drawer — same pages' },
  { subtype: 'surprising-stat', topic: 'Children who practice mazes regularly tend to hit mastery milestones months ahead of peers who don\'t', visual: 'Two paths diverging on a timeline: one reaching the finish line earlier from consistent practice' },
  { subtype: 'counterintuitive', topic: 'The messier the coloring, the more confident the child — perfectionists color less freely', visual: 'Two coloring pages: one perfectly inside lines, one bold and expressive — same drawing, different child' },
  { subtype: 'counterintuitive', topic: 'Giving a child the WRONG answer first actually teaches them to think harder', visual: 'Parent pointing to wrong path in a maze — child\'s expression: skeptical, then determined' },
  { subtype: 'counterintuitive', topic: 'Screen-free activities don\'t need to compete with screens — they win by being tactile, not by banning tech', visual: 'Tablet face-down on table. Child\'s hands with pencil on a printed maze. Both visible.' },
  { subtype: 'seasonal-hook', topic: 'Road trip season is coming — the one printable pack that survived 6 hours with a 5-year-old', visual: 'Car seat tray with printed activity pages, small pencil pouch, snack wrappers — lived-in road trip energy' },
  { subtype: 'seasonal-hook', topic: 'The 10-minute morning routine that sets kids up for a focused school day', visual: 'Kitchen table: cereal, a glass of OJ, and one completed tracing sheet — morning ritual' },
  { subtype: 'edutainment', topic: 'The 3 types of puzzles every pediatric OT recommends — and why each one matters differently', visual: 'Three items on a table: a maze (spatial), a word search (language), a dot-to-dot (motor) — each labeled' },
];

// ── Story setting pool ──
// Pre-assigned per slot so the LLM doesn't default to the same domestic scenes daily.
// Each entry: { location, timeOfDay, ambiance } — enough to anchor the scene without over-scripting.
// 50 entries → at 3 pure-story slots per day, each setting appears ~once every 16 days.
const STORY_SETTINGS = [
  // Indoors — home
  { location: 'kitchen table, morning light streaming through window', timeOfDay: 'morning', ambiance: 'cereal bowl in foreground, backpack by door, unhurried weekend feeling' },
  { location: 'child\'s bedroom floor, toys scattered around', timeOfDay: 'afternoon', ambiance: 'sunlight stripe across carpet, stuffed animals watching, total absorption' },
  { location: 'living room couch, rainy afternoon', timeOfDay: 'afternoon', ambiance: 'rain on window glass, blanket pulled over knees, warm lamp glow' },
  { location: 'dining room table after dinner, plates cleared', timeOfDay: 'evening', ambiance: 'one lamp on, quiet house, leftovers still on counter, dog under chair' },
  { location: 'home library or reading nook, floor cushions', timeOfDay: 'afternoon', ambiance: 'bookshelves visible, natural light from skylight, total silence except pencil on paper' },
  { location: 'kitchen counter while parent cooks nearby', timeOfDay: 'afternoon', ambiance: 'cutting board and vegetables in background, sizzle implied, child focused at end of counter' },
  { location: 'child\'s desk, homework station', timeOfDay: 'after school', ambiance: 'backpack dropped on floor, pencil cup visible, homework folder pushed aside' },
  { location: 'living room floor, sibling sitting nearby', timeOfDay: 'morning', ambiance: 'sibling doing something different, companionable quiet, no screens visible' },
  { location: 'basement playroom, soft rug, toy storage shelves', timeOfDay: 'afternoon', ambiance: 'colorful bins behind them, one toy tipped over, cozy low light' },
  { location: 'hallway floor, leaning against the wall', timeOfDay: 'afternoon', ambiance: 'coat hooks visible, shoes scattered, completely unbothered by surroundings' },
  // Indoors — other
  { location: 'grandparent\'s kitchen table, old farmhouse style', timeOfDay: 'morning', ambiance: 'floral tablecloth, fruit bowl, grandparent\'s coffee cup, slow Saturday energy' },
  { location: 'waiting room with plastic chairs', timeOfDay: 'midday', ambiance: 'magazines on a side table, fish tank in blurred background, other adults waiting' },
  { location: 'restaurant booth, kids menu pushed aside', timeOfDay: 'lunch', ambiance: 'crayons scattered, water glass with straw, food not yet arrived' },
  { location: 'library kids\' section, small table', timeOfDay: 'afternoon', ambiance: 'picture books on nearby shelves, carpet square seating, librarian visible in background' },
  { location: 'inside a cozy blanket fort', timeOfDay: 'afternoon', ambiance: 'fairy lights taped to sheet walls, flashlight, stuffed animals as door guards' },
  { location: 'hotel room bed, travel day winding down', timeOfDay: 'evening', ambiance: 'suitcase open on floor, blackout curtains cracked, room service tray visible' },
  // Outdoors
  { location: 'back porch steps, late afternoon sun', timeOfDay: 'late afternoon', ambiance: 'golden light on wooden planks, garden in soft focus behind, dog napping nearby' },
  { location: 'backyard picnic blanket under a tree', timeOfDay: 'afternoon', ambiance: 'dappled shade, juice box and apple slices nearby, breeze implied by paper corner lifted' },
  { location: 'front porch with a wooden rocking chair nearby', timeOfDay: 'morning', ambiance: 'neighborhood street blurred in background, bird sounds implied, barefoot on warm wood' },
  { location: 'park bench, playground in background', timeOfDay: 'afternoon', ambiance: 'other children playing behind, coffee thermos beside parent, fallen leaves on bench' },
  { location: 'blanket spread on grass at a community park', timeOfDay: 'morning', ambiance: 'shoes kicked off nearby, basket with snacks, wide open sky above' },
  { location: 'treehouse, small wooden platform with railing', timeOfDay: 'afternoon', ambiance: 'tree branches framing the view, bird feeder visible, wind in leaves' },
  { location: 'back of a pickup truck bed with blankets', timeOfDay: 'late afternoon', ambiance: 'tailgate open, country road in distance, golden hour light, thermos and snacks' },
  { location: 'camping site picnic table, morning', timeOfDay: 'morning', ambiance: 'tent visible behind, dew on grass, campfire ashes still warm, birds nearby' },
  { location: 'beach towel at the shore, off-season quiet beach', timeOfDay: 'morning', ambiance: 'no crowds, shells scattered, waves blurred in background, light sea breeze' },
  // Transport / travel
  { location: 'car backseat during a long drive', timeOfDay: 'midday', ambiance: 'highway scenery blurred through window, snack bag open, sun visor down' },
  { location: 'airplane seat, window view of clouds', timeOfDay: 'daytime', ambiance: 'tray table down, headphones on armrest, seatbelt buckled, quiet hum of cabin' },
  { location: 'train window seat, countryside rolling past', timeOfDay: 'afternoon', ambiance: 'ticket stub on windowsill, jacket folded on seat, rhythmic motion implied' },
  { location: 'ferry or boat cabin bench', timeOfDay: 'morning', ambiance: 'life jackets on wall, seagulls through the porthole, coffee in a paper cup' },
  { location: 'airport gate seating area', timeOfDay: 'morning', ambiance: 'rolling suitcase, boarding passes, planes visible through floor-to-ceiling windows' },
  // Seasonal / special
  { location: 'screened-in porch, summer evening', timeOfDay: 'evening', ambiance: 'string lights on, fireflies beyond the screen, iced drinks on the table' },
  { location: 'living room floor, winter snow outside the window', timeOfDay: 'afternoon', ambiance: 'snow visible on window ledge, hot chocolate mug, socks on, total coziness' },
  { location: 'autumn backyard, leaves covering the ground', timeOfDay: 'afternoon', ambiance: 'rake leaned against fence, pile of leaves nearby, sweater weather energy' },
  { location: 'spring backyard, new flowers blooming', timeOfDay: 'morning', ambiance: 'fresh green grass, birds at feeder, child sitting among new flowers' },
  { location: 'garage workshop corner, child at small table', timeOfDay: 'afternoon', ambiance: 'tools hanging on pegboard, workbench behind, sawdust smell implied' },
  // Quiet / focus scenes
  { location: 'sunlit window seat with cushions', timeOfDay: 'morning', ambiance: 'books piled beside them, cat asleep nearby, street quiet below, soft light' },
  { location: 'home office floor while parent works at desk nearby', timeOfDay: 'afternoon', ambiance: 'parent visibly present but working, keyboard sounds implied, companionable quiet' },
  { location: 'pediatric office exam table waiting for doctor', timeOfDay: 'midday', ambiance: 'crinkle paper on table, anatomy posters on wall, paper cup of crayons' },
  { location: 'laundry room floor while parent folds clothes', timeOfDay: 'afternoon', ambiance: 'warm dryer hum implied, laundry basket, clean clothes smell, cozy domestic moment' },
  { location: 'under a loft bed, small private cave space', timeOfDay: 'afternoon', ambiance: 'low ceiling, fairy lights, totally hidden from the world, child\'s own territory' },
  // Cultural / community
  { location: 'community center kids\' table at an event', timeOfDay: 'afternoon', ambiance: 'other families blurred in background, folding chairs, poster on wall behind' },
  { location: 'church pew, before or after service, quiet', timeOfDay: 'morning', ambiance: 'hymn books on rack, stained light from windows, quiet reverent atmosphere' },
  { location: 'hair salon kids\' chair waiting for haircut', timeOfDay: 'midday', ambiance: 'mirror visible, cape draped, salon sounds in background, calm distraction' },
  { location: 'bookstore kids\' section, small chair', timeOfDay: 'afternoon', ambiance: 'picture books face-out on low shelves, bean bag nearby, afternoon foot traffic' },
  // Sibling / family dynamics
  { location: 'bunk bed bottom bunk, private world', timeOfDay: 'evening', ambiance: 'curtain half-drawn, stuffed animals, nightlight, top bunk feet hanging down' },
  { location: 'kitchen floor while baby sibling plays nearby', timeOfDay: 'morning', ambiance: 'baby toys scattered, toddler babble implied, older child focused, parallel play' },
  { location: 'two kids at a shared homework table, different activities', timeOfDay: 'afternoon', ambiance: 'elbows almost touching, one doing homework one doing puzzles, quiet competition' },
  { location: 'car garage waiting for parent to load bags', timeOfDay: 'morning', ambiance: 'travel bags by door, car keys on hook, trip excitement in the air' },
  { location: 'garden shed converted to kids\' art space', timeOfDay: 'afternoon', ambiance: 'paint smears on wall, potting shelves behind, mismatched chairs, creative chaos' },
  { location: 'rooftop deck or apartment balcony, city view', timeOfDay: 'late afternoon', ambiance: 'city skyline soft focus, potted plants, bistro table, urban cozy' },
];

/**
 * Pre-assign story settings for today's pure-story slots in code.
 * Excludes settings that appeared in recent prompt files to prevent scene repetition.
 */
function pickStorySettings(count, usedScenes, date) {
  const doy = dayOfYear(date);
  // Rotate start index by day-of-year so we cycle through the pool across weeks
  const available = STORY_SETTINGS.filter((s, idx) => {
    const key = s.location.split(',')[0].toLowerCase();
    return ![...usedScenes].some(u => u.toLowerCase().includes(key));
  });
  const pool = available.length >= count ? available : STORY_SETTINGS;
  // Deterministic shuffle seeded by day-of-year
  const shuffled = [...pool].sort((a, b) => {
    const ha = (pool.indexOf(a) * 2654435761 + doy * 40503) >>> 0;
    const hb = (pool.indexOf(b) * 2654435761 + doy * 40503) >>> 0;
    return ha - hb;
  });
  return shuffled.slice(0, count);
}

// Deterministic daily pick using day-of-year
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

// ── Identity angles — 10 rotating, speak to the parent they want to be ──
const IDENTITY_ANGLES = [
  'For the parent who wants screen time to actually build something',
  'The mindful morning — before the chaos starts',
  'Screen time that doesn\'t feel like a compromise',
  'For the parent who chooses what their kid does, not just how long',
  'The Saturday morning that goes exactly like you hoped',
  'For parents who want more from free time',
  'What intentional parenting looks like at 4 PM',
  'For the mom (or dad) who needs the house quiet for 30 minutes',
  'The kind of focus you can\'t buy — only create the conditions for',
  'For parents who think about what sticks',
];

// ── Quiet-moment scenes — simple, single-child, absorbed in activity ──
// No complex story arc needed. Just: child + activity + peace.
const QUIET_MOMENT_SCENES = [
  { setting: 'kitchen table, morning light', activity: 'coloring page', detail: 'pencil in hand, cereal bowl pushed aside, totally focused' },
  { setting: 'bedroom floor, afternoon sun stripe', activity: 'maze puzzle printable', detail: 'lying on stomach, bare feet up, tongue slightly out in concentration' },
  { setting: 'cozy window seat, rainy day', activity: 'word search printable', detail: 'knees drawn up, rain on glass behind, warm lamplight' },
  { setting: 'living room rug, sunlight patch', activity: 'dot-to-dot printable', detail: 'seated cross-legged, pencil moving carefully, no distractions nearby' },
  { setting: 'backyard table, late afternoon', activity: 'coloring page', detail: 'dappled leaf shadow, colored pencils scattered, totally absorbed' },
  { setting: 'dining table, weekend morning', activity: 'kids sudoku printable', detail: 'eraser marks, serious expression, older sibling visible but not helping' },
  { setting: 'soft bedroom rug, lamp on', activity: 'tracing activity printable', detail: 'small hand tracing carefully, tongue out, quiet concentration' },
  { setting: 'coffee table, couch in background', activity: 'matching puzzle printable', detail: 'child on tummy, feet in the air, paper covered in small marks' },
];

function pickArch7Scene(date) {
  return ARCH7_SCENES[dayOfYear(date) % ARCH7_SCENES.length];
}

// ── Carousel planning ──────────────────────────────────────────────────────
// Three formats on a 9-day rotation (by day-of-year):
//   doy % 9 === 0 → Format 1: Activity Collection  (5 activity images as a swipeable album)
//   doy % 9 === 3 → Format 2: Educational Facts    (5 brain-benefit fact cards for one activity)
//   doy % 9 === 6 → Format 3: Activity Progression (blank → half-done → complete, 3 slides)

function getCarouselFormat(date) {
  const d = dayOfYear(date);
  if (d % 9 === 0) return 'activity-collection';
  if (d % 9 === 3) return 'facts';
  if (d % 9 === 6) return 'progression';
  return null;
}

// ── Format 1: Activity Collection ──
function buildCarouselPlan(assignedThemes, date) {
  const dateStr = date.toISOString().slice(0, 10);
  const dominant = (assignedThemes[0] || 'activities')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const carouselGroup = `carousel-${dominant}-${dateStr}`;
  return {
    format: 'activity-collection',
    carouselGroup,
    suggestedFolder: `output/raw/${carouselGroup}`,
    date: dateStr,
    totalSlides: assignedThemes.length,
    slides: assignedThemes.map((theme, i) => ({ slideIndex: i + 1, theme })),
  };
}

// ── Format 2: Educational Facts ──
const FACTS_CAROUSEL_ACTIVITIES = [
  { key: 'mazes', label: 'Mazes', skill: 'problem-solving & spatial reasoning',
    facts: [
      'Mazes teach kids to plan ahead — every wrong path is a choice they learn from, not a failure',
      'Spatial reasoning grows with every maze solved — the same mental skill behind math, engineering, and reading maps',
      'Every dead end teaches resilience — "try again" builds grit that no worksheet can replicate',
      'A maze has a visible finish line — that keeps kids focused longer than open-ended activities because the goal is always clear',
    ],
  },
  { key: 'coloring', label: 'Coloring', skill: 'creativity & fine motor control',
    facts: [
      'Coloring demands two things at once: discipline to stay in lines + freedom to choose colors — that tension is exactly what grows the brain',
      'The grip, pressure, and precision of coloring build the same fine motor strength needed for confident handwriting',
      'Choosing colors is a real decision — kids as young as 2 are practicing self-expression and preference every time they pick up a crayon',
      'Coloring is one of the few screen-free activities that genuinely calms an overstimulated child — focused hands = quieter mind',
    ],
  },
  { key: 'word-search', label: 'Word Search', skill: 'vocabulary & visual focus',
    facts: [
      'Word searches train kids to find signal in noise — a skill that transfers directly to reading, math, and focus in a busy classroom',
      'Kids encounter words they\'ve never read before in every grid — recognition before definition is how reading vocabulary actually expands',
      'The left-to-right, top-to-bottom scan pattern of word searches is the same eye movement that builds reading fluency',
      'Ten minutes of word search builds the visual "spot the difference" skill that makes reading faster and more automatic',
    ],
  },
  { key: 'dot-to-dot', label: 'Dot-to-Dot', skill: 'number sequencing & fine motor',
    facts: [
      'Dot-to-dot teaches number sequencing while kids think they\'re just drawing — the best learning happens when it doesn\'t feel like learning',
      'The hidden picture is a built-in finish line — kids stay focused because they genuinely want to see what it becomes',
      'The fine motor precision of connecting dots builds the same pencil control needed for confident, legible handwriting',
      'The reveal at the end associates counting and number order with reward — kids want to do it again',
    ],
  },
  { key: 'sudoku', label: 'Kids Sudoku', skill: 'logic & pattern recognition',
    facts: [
      'Kids Sudoku introduces logical deduction years before formal algebra — "if this, then not that" is a real math skill at age 5',
      'Completing a grid builds working memory — the ability to hold multiple possibilities in mind at once, the same skill as mental math',
      'Sudoku rewards the brain for noticing patterns — that habit of looking for patterns is what makes kids better readers and better problem-solvers',
      'Even a 4×4 kids grid teaches elimination — the most powerful reasoning tool in logic, science, and everyday decisions',
    ],
  },
];

// Alternate search terms for matching dynamic facts to activity types
const ACTIVITY_SEARCH_TERMS = {
  mazes:        ['maze', 'mazes'],
  coloring:     ['color', 'coloring'],
  'word-search':['word search', 'word-search', 'wordsearch'],
  'dot-to-dot': ['dot to dot', 'dot-to-dot', 'connect the dots'],
  sudoku:       ['sudoku'],
};

function buildFactsCarouselPlan(date, intelligence = {}) {
  const { activityRanking = [], dynamicInterrupts = [], topHook = null } = intelligence;
  const dateStr = date.toISOString().slice(0, 10);

  // Activity selection: analytics ranking → doy rotation fallback
  let activity;
  let signal = 'doy-rotation';
  if (activityRanking.length > 0) {
    const idx = FACTS_CAROUSEL_ACTIVITIES.findIndex(a => a.key === activityRanking[0]);
    if (idx >= 0) { activity = FACTS_CAROUSEL_ACTIVITIES[idx]; signal = 'analytics-ranked'; }
  }
  if (!activity) {
    activity = FACTS_CAROUSEL_ACTIVITIES[dayOfYear(date) % FACTS_CAROUSEL_ACTIVITIES.length];
  }

  // Dynamic fact injection: pull did-you-know entries from pattern-interrupt-dynamic.json
  // that mention this activity type — replace the last 1-2 hardcoded facts
  const terms = ACTIVITY_SEARCH_TERMS[activity.key] || [activity.key];
  const matchingFacts = dynamicInterrupts.filter(f => {
    const t = (f.topic || '').toLowerCase();
    return (f.subtype === 'did-you-know' || f.subtype === 'surprising-stat') &&
           terms.some(term => t.includes(term));
  });
  const baseFacts = [...activity.facts];
  const injectedCount = Math.min(matchingFacts.length, 2);
  for (let i = 0; i < injectedCount; i++) {
    baseFacts[baseFacts.length - 1 - i] = matchingFacts[i].topic;
  }

  // Hook slide: use top performing hook pattern if available
  const hookDesc = topHook
    ? `Title card in style of: "${topHook.text}" — reframed as "5 Brain Benefits of ${activity.label}"`
    : `Title card: "5 Brain Benefits of ${activity.label}" — hook image showing a child happily doing ${activity.label.toLowerCase()}`;

  const folderName = `facts-carousel-${activity.key}-${dateStr}`;
  return {
    format: 'facts',
    carouselGroup: folderName,
    suggestedFolder: `output/raw/${folderName}`,
    date: dateStr,
    activity: activity.label,
    skill: activity.skill,
    intelligenceSignal: signal,
    dynamicFactsInjected: injectedCount,
    totalSlides: 5,
    slides: [
      { slideIndex: 1, role: 'hook', description: hookDesc },
      ...baseFacts.map((fact, i) => ({ slideIndex: i + 2, role: 'fact', description: fact })),
    ],
  };
}

// ── Format 3: Activity Progression ──
const PROGRESSION_CAROUSEL_ACTIVITIES = [
  { key: 'maze',       label: 'Maze',             description: 'a simple forest maze with a start arrow and a finish flag' },
  { key: 'coloring',   label: 'Coloring Page',    description: 'a cute coloring page of a cartoon dinosaur outline in a jungle' },
  { key: 'dot-to-dot', label: 'Dot-to-Dot',       description: 'a dot-to-dot puzzle of a smiling sun, numbered 1–20' },
  { key: 'word-search', label: 'Word Search',     description: 'a word search grid of jungle animals on a white page' },
  { key: 'sudoku',     label: 'Kids Sudoku',       description: 'a 4×4 kids sudoku grid with animal icon symbols' },
];

// Map facts pool keys → progression pool keys (different naming convention)
const FACTS_TO_PROG_KEY = {
  mazes: 'maze', coloring: 'coloring', 'word-search': 'word-search',
  'dot-to-dot': 'dot-to-dot', sudoku: 'sudoku',
};

function buildProgressCarouselPlan(date, intelligence = {}) {
  const { activityRanking = [], boostThemes = [] } = intelligence;
  const dateStr = date.toISOString().slice(0, 10);

  // Activity selection priority:
  // 1. Trending boost_themes that overlap an activity type (e.g. "Earth Day" → maze with nature theme)
  // 2. Analytics ranking
  // 3. doy rotation
  let activity;
  let signal = 'doy-rotation';

  const trendMatch = PROGRESSION_CAROUSEL_ACTIVITIES.find(a =>
    boostThemes.some(t => t.toLowerCase().includes(a.key.replace(/-/g, ' ')))
  );
  if (trendMatch) {
    activity = trendMatch;
    signal = 'trend-boost';
  } else if (activityRanking.length > 0) {
    const progKey = FACTS_TO_PROG_KEY[activityRanking[0]];
    const idx = PROGRESSION_CAROUSEL_ACTIVITIES.findIndex(a => a.key === progKey);
    if (idx >= 0) { activity = PROGRESSION_CAROUSEL_ACTIVITIES[idx]; signal = 'analytics-ranked'; }
  }
  if (!activity) {
    activity = PROGRESSION_CAROUSEL_ACTIVITIES[dayOfYear(date) % PROGRESSION_CAROUSEL_ACTIVITIES.length];
  }

  const folderName = `progress-carousel-${activity.key}-${dateStr}`;
  return {
    format: 'progression',
    carouselGroup: folderName,
    suggestedFolder: `output/raw/${folderName}`,
    date: dateStr,
    activity: activity.label,
    description: activity.description,
    intelligenceSignal: signal,
    totalSlides: 3,
    slides: [
      { slideIndex: 1, role: 'blank',    filename: '01-blank.png',  description: `${activity.description} — completely blank, no marks, fresh and untouched` },
      { slideIndex: 2, role: 'progress', filename: '02-half.png',   description: `Same ${activity.label.toLowerCase()} — 50% complete, pencil marks visible, clearly in progress` },
      { slideIndex: 3, role: 'done',     filename: '03-done.png',   description: `Same ${activity.label.toLowerCase()} — fully completed, satisfying finish state, all sections filled` },
    ],
  };
}

// ── Carousel footer builders ──
function buildFactsCarouselFooter(plan) {
  const slideLines = plan.slides.map(s =>
    `${String(s.slideIndex).padStart(2, '0')}-${s.role}.png  ← Slide ${s.slideIndex}: ${s.description}`
  ).join('\n');
  return `\n\n---\n## FACTS CAROUSEL DAY — Image Drop Instructions\n\n` +
    `Today's carousel: **5 brain-benefit fact cards** for **${plan.activity}** (${plan.skill})\n\n` +
    `**Create this folder:**\n\`\`\`\n${plan.suggestedFolder}/\n\`\`\`\n\n` +
    `Generate each slide in Gemini as an infographic-style fact card. Name files so they sort in order:\n\`\`\`\n` +
    slideLines + `\n\`\`\`\n\n` +
    `import:raw auto-detects the \`facts-carousel-*\` folder and builds the carousel queue file. **No sidecar JSONs needed.**\n`;
}

function buildProgressCarouselFooter(plan) {
  const slideLines = plan.slides.map(s =>
    `${s.filename}  ← Slide ${s.slideIndex} (${s.role}): ${s.description}`
  ).join('\n');
  return `\n\n---\n## PROGRESSION CAROUSEL DAY — Image Drop Instructions\n\n` +
    `Today's carousel shows the **satisfying journey** of completing a **${plan.activity}**.\n\n` +
    `**Create this folder:**\n\`\`\`\n${plan.suggestedFolder}/\n\`\`\`\n\n` +
    `Generate all 3 slides in Gemini — **same scene, 3 stages**. Keep the same chat window for visual consistency:\n\`\`\`\n` +
    slideLines + `\n\`\`\`\n\n` +
    `**Gemini tip:** Generate slide 1 first, then say "now show 50% complete" and "now show fully done" — same scene throughout.\n\n` +
    `import:raw auto-detects the \`progress-carousel-*\` folder and builds the carousel queue file. **No sidecar JSONs needed.**\n`;
}

function pickPatternInterrupt(date, dynamicInterrupts = []) {
  const merged = [...PATTERN_INTERRUPT_POOL, ...dynamicInterrupts];
  return merged[dayOfYear(date) % merged.length];
}

// ── Daily mix: 5 inspiration slots + 5 activity slots ──
// Story archetypes (1-7) are retired — replaced with 5 intelligence-driven slot types:
//   1. fact-card       — surprising child-development fact tied to a trending topic
//   2. activity-challenge — challenge-framed activity: "can your kid solve this?"
//   3. quiet-moment    — sensory lifestyle scene: child absorbed in activity
//   4. printable-tease — beautiful close-up of a printable, save-bait
//   5. identity        — parent identity angle: "for the parent who..."
function getTodaysMix(date, trendTopic = null) {
  const day = date.getDay();
  const doy = dayOfYear(date);
  const difficulty = DIFFICULTY_BY_DAY[day] || 'medium';
  const todaysStyles = getArtStylesForToday(date, 5);
  const todaysProfiles = getChildProfilesForToday(date);

  // Pick identity angle and quiet-moment scene deterministically
  const identityAngle = IDENTITY_ANGLES[doy % IDENTITY_ANGLES.length];
  const quietScene    = QUIET_MOMENT_SCENES[doy % QUIET_MOMENT_SCENES.length];

  // Pick challenge theme — from trending if available, else from theme pool
  const challengeTheme = (getTodaysMix._boostThemes || [])[0]
    || THEME_POOL[doy % THEME_POOL.length];

  // Trend topic for fact-card: from weekly intelligence, else fall back to challengeTheme
  const factTopic = trendTopic
    || (getTodaysMix._trendTopic)
    || (getTodaysMix._boostThemes || [])[1]
    || challengeTheme;

  const seriesTag = SERIES_NAMES[day] || '';

  return {
    label: `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]} — Intelligence Mix + Activities (${difficulty})`,
    seriesTag,
    slots: [
      // ── 5 Inspiration slots ──
      {
        type: 'fact-card',
        topic: factTopic,
        artStyle: todaysStyles[0],
        hint: 'Bold educational poster or activity-themed visual with a surprise stat overlay. Child development angle.',
      },
      {
        type: 'activity-challenge',
        theme: challengeTheme,
        artStyle: todaysStyles[1],
        childProfile: todaysProfiles[0],
        hint: 'A child facing a challenge activity — maze / puzzle / coloring. High engagement, competitive energy.',
      },
      {
        type: 'quiet-moment',
        scene: quietScene,
        artStyle: todaysStyles[2],
        childProfile: todaysProfiles[1],
        hint: 'Peaceful, sensory, absorbed — no screens, no distraction. The "good kind of quiet."',
      },
      {
        type: 'printable-tease',
        activityType: pickTodaysActivities()[0]?.label || 'Maze Puzzle',
        artStyle: todaysStyles[3],
        hint: 'Beautiful flat-lay close-up of a printed activity on a real table. Save-bait energy.',
      },
      {
        type: 'identity',
        angle: identityAngle,
        artStyle: todaysStyles[4],
        childProfile: todaysProfiles[2],
        hint: 'A quiet moment that embodies good parenting — intentional, calm, not performative.',
      },
      // ── 5 Activity slots (unchanged) ──
      ...pickTodaysActivities().map(a => ({
        archetype: a.category,
        type: 'activity',
        label: a.label,
        skill: a.skill,
        difficulty,
        source: a.source,
      })),
    ],
  };
}

function extractEssentials(styleGuide) {
  // Extract only the sections critical for image prompt generation
  // Skip hook libraries, CTA libraries, editing checklists — those are for captions, not images
  const sections = [
    'WHO YOU ARE WRITING FOR',
    'THE IDENTITY SHIFT',
    'THE 4 HYPNOTIC PILLARS',
    'THE 3 REASONS PARENTS BUY',
    'JOYMAZE EMOTIONAL ANCHORS',
    'THE HYPNOTIC VOICE',
    'WHAT NOT TO WRITE',
  ];

  const lines = styleGuide.split('\n');
  const extracted = [];
  let capturing = false;
  let depth = 0;

  for (const line of lines) {
    const isHeader = line.match(/^##\s+(.+)/);
    if (isHeader) {
      const title = isHeader[1].trim();
      capturing = sections.some(s => title.includes(s));
      if (capturing) depth = 0;
    }
    // Stop capturing at next ## header that isn't in our list
    if (capturing) {
      extracted.push(line);
      // Stop at next major section break (---) after we've captured some content
      if (line.trim() === '---' && extracted.length > 5) {
        depth++;
        if (depth > 1) capturing = false;
      }
    }
  }
  return extracted.join('\n');
}

function buildSystemPrompt(styleGuide, archetypes, hookExamples = [], auditLessons = [], compIntel = null) {
  const essentials = extractEssentials(styleGuide);

  return `You are JoyMaze's creative director and image prompt engineer.

Your job: generate detailed image generation prompts for Imagen 4.0 (Google's AI image generator) and ChatGPT/Gemini, optimized for Pinterest saves and Instagram engagement.

## YOUR KNOWLEDGE BASE

You have internalized the full JoyMaze strategy:

<brand-essentials>
${essentials}
</brand-essentials>

<content-archetypes>
${archetypes}
</content-archetypes>

## YOUR TASK

You generate TWO types of image prompts:

### TYPE A: INSPIRATION PROMPTS (5 intelligence-driven types)

The 5 inspiration slots replace story archetypes. Each has a distinct visual brief:

**FACT-CARD**: Bold educational poster. Counterintuitive child-development insight or relatable observation — expressed through VISUAL METAPHOR, not text-in-image. Could be a crisp infographic-style layout with strong imagery, or an activity scene with bold visual design. NEVER ask the image generator to render text, stats, or numbers inside the image — those are added post-generation by our pipeline via sharp. NOT a generic brain/lightbulb image. Think: viral Pinterest educational post where the VISUAL does the storytelling.

**ACTIVITY-CHALLENGE**: Child at peak engagement with a printable activity — maze, coloring page, puzzle. The activity printable must be clearly visible and beautiful. Child's expression = focused, curious, slightly competitive. No blank pages, no finished pages — frozen at the moment of WORKING. Discarded screen (tablet face-down, TV remote pushed aside) is a bonus conversion signal.

**QUIET-MOMENT**: Sensory lifestyle scene — child absorbed in a printable activity. No screens anywhere in the frame. Warm, peaceful, specific. The "good kind of quiet." Lighting is warm and directional (morning light, lamplight). Scene feels real, not staged.

**PRINTABLE-TEASE**: Beautiful flat-lay photography style. Printed activity sheet on a real surface (wooden table, light carpet). Pencil or colored pencils nearby. Warm side-lighting makes the paper glow. Could have a small hand reaching in, or pencil resting on the page. Slightly worn paper feel — NOT a pristine scan. Energy: "You want this for tomorrow."

**IDENTITY**: A quiet, aspirational-but-real moment that speaks to the parent they want to be. Either: (a) child absorbed in activity, parent watching with quiet pride from nearby, OR (b) bold text design — the identity statement as large, clean typography over a soft textured background. NOT performative-Instagram. Real, warm, specific.

For ALL inspiration prompts:
- Art style explicitly specified (varied across the 5 slots)
- Screen-free / printable language in caption hook (top Pinterest trend)
- Developmental skill named (fine motor, spatial reasoning, focus, etc.)
- EVERY prompt ends with: "Portrait orientation, 2:3 aspect ratio (1000×1500 px)."

### CONVERSION VISUAL PRINCIPLES — apply to EVERY story prompt without exception

These are the techniques that turn a nice illustration into an image a parent stops scrolling for, saves, and clicks. Apply all of them simultaneously. They are not optional style suggestions — they are the structural difference between forgettable content and content that drives saves and app installs.

**1. THE ACTIVITY IS THE HERO (the product must be visible and desirable)**
The puzzle, printed coloring page, maze sheet, or tracing activity IS the product being marketed. It must appear in the image clearly — well-lit, legible enough to read, placed where the eye naturally lands. If the activity looks beautiful and achievable, the parent's brain registers: "I want that for my child." If it's a blurry prop in the background, the conversion signal is lost. Tip: warm side-light on paper makes printables glow. The paper should look slightly worn from handling — real, not pristine.

**2. THE ABANDONED ALTERNATIVE (show what the child chose AGAINST)**
Include 1-2 discarded items that the child has physically abandoned in favor of the activity. A tablet lying face-down beside the puzzle. A TV remote pushed to the edge of the table. A video game controller on the floor behind the child. Toys scattered around but untouched. This one detail sells "screen-free" without a single word of copy — the image proves the child chose the printed activity over everything else. The discarded screen device is the most powerful of these. Never make the alternative the center of the frame — it should be visible but secondary, the way a rejected option sits in real life.

**3. THE PEAK ENGAGEMENT MOMENT (never blank, never finished)**
Show the activity partially completed — 30-60% done. Never show a blank, untouched page (no emotional tension — nothing has happened yet). Never show a fully completed puzzle (the tension is resolved — the moment has passed). The partially completed state is where the emotional hook lives: the child is mid-flow, invested, not done yet. This is the moment a parent stops scrolling. For mazes: a pencil trail visible halfway through. For coloring: half the page filled, crayons scattered. For dot-to-dot: a recognizable shape emerging from partial connection. For word search: several words circled, pencil resting mid-grid.

**4. THE PARENT AS VIEWER (camera angle = the parent's natural vantage point)**
Frame the scene from slightly above and at a distance — the angle a standing parent naturally has when watching their child work at a table, or looking in from a doorway. The child is in the foreground, absorbed. The parent figure, when present, is at the edge of the frame — watching, not directing. This angle puts the scrolling parent inside the scene: they are not observing the image, they ARE the parent watching. Never shoot from child eye level (excludes the parent viewer). Never make the parent the central subject (the child's absorption is the emotional core).

**5. THE SENSORY ANCHOR (one unexpected specific detail that makes it feel real)**
Every great direct response image has one detail that shouldn't be there but makes everything feel true. A half-eaten apple forgotten beside the puzzle. A crayon that rolled off the table, caught mid-fall. Steam rising from a mug of tea on the windowsill behind the child. Afternoon light casting a shadow stripe across the paper. A sock half-off the child's foot. This detail does not advance the narrative — it proves the narrative is real. Generic AI images look composed. A single unexpected specific detail makes it look like a photograph of a real moment. Choose one per prompt. It should be small, forgettable if you blink — but it's what makes the image feel human.

**6. THE EMOTIONAL LIGHTING CONTRACT (light tells the story before the eye does)**
Match the lighting to the archetype's emotional beat:
- Beat 1 (Scene Drop / tension building): cooler, flatter light — the moment before things shift. Slightly overcast window light, early morning grey.
- Beat 2 (Emotional Tension / peak struggle): directional, high-contrast — one bright source, deeper shadows. The child's face half-lit, the activity in the bright zone.
- Beat 3 (The Shift / exhale and resolution): warm, golden, enveloping — late afternoon sun, lamp glow, the room feels like it exhaled. This is the light of relief.
Never use flat, bright, studio-style lighting for story prompts — it reads as advertisement, not moment. Real moments have directional, imperfect light.

**7. THE EXPRESSION HIERARCHY (what faces to show and how)**
Child's expression carries the archetype's emotional beat — this is non-negotiable. The child's face must show the SPECIFIC feeling of the beat: brow slightly furrowed (tension), lips slightly parted in concentration (flow), small smile breaking (the shift). NOT a posed, happy smile — children don't smile when they're solving a puzzle, they focus. The parent's expression, when visible, mirrors what the scrolling parent wants to feel: quiet pride, relief, the exhale of "they're fine." Never show a parent looking stressed, impatient, or explicitly proud-to-the-camera — those read as performative. Show the sideways glance, the almost-smile, the coffee mug held while watching.

**8. THE CONVERSION OBJECT PLACEMENT (what the eye should land on last)**
Design the visual path so the eye moves: parent reaction → child expression → activity in hand. The activity (the printable, the puzzle page) should be the final resting point of the visual journey — because it's what the parent should be thinking about when they reach for the Save button. Place it in the lower-center or lower-right of the composition — where eyes naturally settle after scanning a portrait image. It should be bright, warm, and slightly more in focus than the background.

### TYPE B: ACTIVITY PROMPTS (A1-A5 — Actual Puzzles & Printables)
Activity prompts generate ACTUAL PUZZLE CONTENT — not photos of kids doing puzzles.
These must be real, usable, saveable activities:
1. **Maze (A1):** Follow the EXAMPLE C pattern exactly — character at start point, age-targeted difficulty (thick lines, easy-to-follow), themed decorations, clear start/end, solvability time. Keep simple — do NOT over-specify layout details. No solution shown.
2. **Word Search (A2):** Generate a word search grid — clear letter grid with hidden words. Show word list beside/below. Theme the words (animals, colors, seasons). No words circled.
3. **Matching (A3):** Generate a matching game — find-the-pair OR spot-the-difference. Clear objects with space between. For spot-the-diff: two images, 3-5 subtle differences.
4. **Tracing (A4):** Generate a tracing activity — dotted/dashed lines for tracing. Fun theme ("Help the bunny get home"). Thick lines that work when printed.
5. **Quiz (A5):** Generate a visual puzzle — odd-one-out, counting challenge, pattern completion, "which shadow matches?". Answer NOT shown (revealed in comments).

Activity image rules:
- Clean lines, high contrast (works when printed/screenshot)
- Bright, colorful, kid-friendly style
- NO text overlays (our pipeline adds branding)
- Leave bottom 10% of image clear (watermark space)
- Age-appropriate difficulty as specified in the slot
- **Portrait 2:3 (1000×1500 px)** — end EVERY activity image prompt with: "Portrait orientation, 2:3 aspect ratio (1000×1500 px). Leave the bottom 10% of the image completely empty (white space for watermark)."

## PROMPT FORMAT

For STORY prompts:
---
### Prompt [N] — [Archetype Name] ([Beat 1/2/3])
**Type:** Story
**Emotional target:** [The feeling this image should trigger in a scrolling parent]
**Activity shown:** [Which JoyMaze activity type]
**Hook type:** [Which of the 8 hook types this uses]
**Skill shown:** [What developmental skill this activity builds]
**Output dimensions:** 2:3 portrait — 1000×1500 px

**Image prompt:**
[3-5 sentences. Show the full scene — parents, children, expressions, body language. Rich sensory details. End with: "Portrait orientation, 2:3 aspect ratio (1000×1500 px)."]

**Caption hook idea:** [Emotional hook line] | [Skill framing: "Builds [skill]. Screen-free printable at joymaze.com"]
---

For ACTIVITY prompts:
---
### Prompt [N] — Activity: [Type] ([Difficulty])
**Type:** Activity
**Activity type:** [Maze / Word Search / Matching / Tracing / Quiz]
**Difficulty:** [Easy / Medium / Hard]
**Theme:** [From the expanded theme pool below]
**Skill target:** [What this builds — be specific]
**Output dimensions:** 2:3 portrait — 1000×1500 px

**Image prompt:**
[3-5 sentences describing the exact puzzle. End with: "Portrait orientation, 2:3 aspect ratio (1000×1500 px). Leave the bottom 10% of the image completely empty (white space for watermark)."]

**Caption hook idea:** [Challenge hook] | SAVE this for quiet time! Builds [specific skill]. Free printable activities for ages 4-8.
---

## GOLD STANDARD EXAMPLES

Study these. This is the quality bar. Match or exceed it every time.

### EXAMPLE A — Perfect Story Prompt
---
### Prompt 1 — The Restless Afternoon (Beat 3: The Shift)
**Type:** Story
**Emotional target:** The exhale — the moment a parent realizes their child found something that holds
**Activity shown:** Tracing a dotted animal path
**Hook type:** Sensory Hook
**Skill shown:** Fine motor skills, hand-eye coordination, focus

**Image prompt:**
A girl around 5 years old sits cross-legged on sun-warmed wooden porch steps, a yellow pencil gripped in her hand, eyes locked on a printed tracing sheet — a dotted path shaped like a winding river leading to a cartoon fox den. Three abandoned toys — a rubber ball, a plastic dinosaur, a half-eaten apple — lie forgotten beside her. Late afternoon light cuts through the porch railing, striping shadows across her lap. Her mother stands just inside the screen door, coffee mug in hand, watching without interrupting. Style: soft-focus photorealistic, warm golden tones, shallow depth of field. Portrait orientation, 2:3 aspect ratio (1000×1500 px).

**Caption hook idea:** "Three toys abandoned. One tracing sheet. The house went quiet. | Builds fine motor skills and hand-eye coordination. Screen-free printable at joymaze.com"
---

Why this works:
- FULL SCENE — child's expression and posture carry the emotional beat
- SPECIFIC activity (tracing a fox den path — not generic "coloring")
- SPECIFIC setting (sun-warmed porch steps, striped shadows)
- SENSORY details (yellow pencil, half-eaten apple, steam from coffee)
- PARENT IN SCENE (watching from doorway — completes the emotional story)
- EMOTIONAL beat is SHOWN not told — the stillness IS the story
- ART STYLE is specific (soft-focus photorealistic, warm golden tones, shallow DOF)
- CAPTION includes: emotional hook + skill framing + screen-free positioning

### EXAMPLE B — Perfect Activity Prompt
---
### Prompt 6 — Activity: Maze Puzzle (Medium)
**Type:** Activity
**Activity type:** Maze
**Difficulty:** Medium
**Theme:** Underwater Shipwreck
**Skill target:** Problem-solving, spatial reasoning
**Output dimensions:** 2:3 portrait — 1000×1500 px

**Image prompt:**
A top-down maze in the shape of a sunken pirate ship, resting on the ocean floor. The maze paths wind through the ship's decks — cargo hold, captain's cabin, and crow's nest. The START is a small cartoon scuba diver at the ocean surface (top-left), and the FINISH is a glowing treasure chest inside the hull (bottom-right). 6-8 dead ends, each blocked by sea creatures: a grumpy octopus, a sleeping shark, a jellyfish cluster. The surrounding water is deep teal-blue with scattered bubbles, coral formations along the edges, and a small school of clownfish near the top. Clean black outlines on white maze paths, colorful illustrated elements around the borders. Portrait orientation, 2:3 aspect ratio (1000×1500 px). Leave the bottom 10% of the image completely empty (white space for watermark).

**Caption hook idea:** "Navigate the shipwreck. Avoid the octopus. Find the treasure."
---

Why this works:
- The maze HAS A SHAPE (pirate ship — not a generic rectangle)
- SPECIFIC layout (decks, start/finish positions, 6-8 dead ends)
- THEMED obstacles (grumpy octopus, sleeping shark — not just walls)
- VISUAL ATMOSPHERE (teal-blue water, bubbles, coral, clownfish)
- CLEAR technical spec (black outlines, white paths, bottom 10% empty)
- DIFFICULTY calibrated (medium = 6-8 dead ends, multiple rooms)

### EXAMPLE C — Proven Maze Prompt (use this as the template for ALL maze prompts)
---
### Prompt — Activity: Maze Puzzle (Easy)
**Type:** Activity
**Activity type:** Maze
**Difficulty:** Easy
**Theme:** Ocean Animals
**Skill target:** Problem-solving, spatial reasoning
**Output dimensions:** 2:3 portrait — 1000×1500 px

**Image prompt:**
Generate a maze with a picture of a smiling crab at the start point, with an easy-to-follow path. The maze should be designed for a 4-5 year old, moderately challenging with thick lines and a clear start and end point. The theme should be ocean animals, with fish and seaweed incorporated into the design. The maze should be solvable in under 5 minutes. Portrait orientation, 2:3 aspect ratio (1000×1500 px). Leave the bottom 10% of the image completely empty (white space for watermark).

**Caption hook idea:** "Can your little one help the crab find his way home?"
---

Why this works (PROVEN — generates reliable, usable mazes every time):
- SPECIFIC character at start (smiling crab — not a generic arrow)
- AGE-TARGETED difficulty (4-5 year old, thick lines, easy-to-follow)
- CLEAR technical spec (thick lines, clear start/end, solvable in 5 min)
- THEMED decorations (fish, seaweed — not just empty walls)
- SIMPLE and DIRECT — no over-specification that confuses image generators

**⚠️ MAZE PROMPTS: USE THIS EXACT FILL-IN-THE-BLANK STRUCTURE. NO EXCEPTIONS.**

\`\`\`
Generate a maze with a picture of [CHARACTER] at the start point, with a [easy/moderate/challenging]-to-follow path. The maze should be designed for a [4-5 / 5-6 / 6-8] year old, [brief difficulty description] with thick lines and a clear start and end point. The theme should be [THEME], with [2-3 themed decorations] incorporated into the design. Add small decorative elements, such as [THEMED ELEMENT 1] and [THEMED ELEMENT 2], to the corners of the page. Leave the bottom 10% of the image completely empty (white space for watermark). Portrait orientation, 2:3 aspect ratio (1000×1500 px).
\`\`\`

Fill in the brackets. Do not rewrite the structure. Do not use narrative description style ("A challenging maze featuring...") — that produces broken, unusable mazes. The direct instruction style above is what makes image generators produce actual solvable mazes.

NOTE: Example B above (sunken pirate ship) is shown for its visual richness only — do NOT use that narrative style for maze prompts. Example C is the only correct pattern for mazes.

### EXAMPLE E — Proven Maze Prompt (Hard, with corner decorations)
---
### Prompt — Activity: Maze Puzzle (Hard)
**Type:** Activity
**Activity type:** Maze
**Difficulty:** Hard
**Theme:** Ancient Egypt
**Skill target:** Problem-solving, spatial reasoning
**Output dimensions:** 2:3 portrait — 1000×1500 px

**Image prompt:**
Generate a maze with a picture of an ancient Egyptian pharaoh at the start point, with a clear, moderately difficult path to follow. The maze should be designed for a 6-8 year old, with thick lines and a clear start and end point. The theme should be Ancient Egypt, with Egyptian-inspired decorations and symbols. Add small decorative elements, such as tiny pyramids and sphinxes, to the corners of the page. Leave the bottom 10% of the image completely empty (white space for watermark). Portrait orientation, 2:3 aspect ratio (1000×1500 px).

**Caption hook idea:** "Can your little explorer find the way through the pharaoh's maze?"
---

Why this works (PROVEN — confirmed by Ahmed to produce a perfect maze):
- Follows Example C's direct instruction structure exactly (what makes it work)
- SPECIFIC character at start (Egyptian pharaoh — not a generic arrow)
- AGE-TARGETED difficulty (6-8 year old)
- THEMED decorations (Egyptian-inspired symbols)
- **NEW ELEMENT: explicit corner decoration instruction** — "Add small decorative elements, such as [X] and [Y], to the corners of the page" — produces clean framing without crowding the maze
- SIMPLE and DIRECT — no over-specification

**↑ UPDATE TO MAZE TEMPLATE: add corner decoration line to all Hard maze prompts.**

\`\`\`
Generate a maze with a picture of [CHARACTER] at the start point, with a [easy/moderate/challenging]-to-follow path. The maze should be designed for a [4-5 / 5-6 / 6-8] year old, [brief difficulty description] with thick lines and a clear start and end point. The theme should be [THEME], with [2-3 themed decorations] incorporated into the design. Add small decorative elements, such as [THEMED ELEMENT 1] and [THEMED ELEMENT 2], to the corners of the page. Leave the bottom 10% of the image completely empty (white space for watermark). Portrait orientation, 2:3 aspect ratio (1000×1500 px).
\`\`\`

NOTE: Example B above (sunken pirate ship) is shown for its visual richness only — do NOT use that narrative style for maze prompts. Examples C and E are the only correct patterns for mazes.

### EXAMPLE D — Proven Dot-to-Dot Prompt (use this as the template for ALL dot-to-dot prompts)
---
### Prompt — Activity: Dot-to-Dot (Easy)
**Type:** Activity
**Activity type:** Dot-to-Dot
**Difficulty:** Easy
**Theme:** Ocean Animals
**Skill target:** Number sequencing, fine motor control, hand-eye coordination
**Output dimensions:** 2:3 portrait — 1000×1500 px

**Image prompt:**
Generate a dot-to-dot activity page for kids. The dots form the outline of a friendly dolphin jumping out of the water. Number all dots clearly from 1 to 25 in sequence. Make the numbered dots large and bold so they are easy for small hands to find. DO NOT draw the character outline — the outline must only be revealed after connecting the dots. The dolphin should appear as numbered dots only, with NO pre-drawn outline between them. Add a soft light pastel background (pale aqua). Add small decorative elements in the empty corners — tiny starfish, bubbles, and shells. Leave the bottom 15% of the image completely empty (white space for watermark). Portrait orientation, 2:3 aspect ratio (1000×1500 px).

**Caption hook idea:** "Connect the dots to reveal the hidden sea friend!"
---

Why this works (PROVEN — generates clean, usable dot-to-dot pages every time):
- SPECIFIC character formed by the dots (friendly dolphin — not a generic shape)
- AGE-TARGETED dot count (25 dots for easy, 40 for medium, 60+ for hard)
- LARGE BOLD DOTS with clear sequential numbers (critical for usability)
- NO PRE-DRAWN OUTLINE — character shape is ONLY suggested by the numbered dots; drawing the outline defeats the activity's purpose
- SOFT PASTEL BACKGROUND — not plain white (pale aqua, light mint, pale yellow)
- DECORATIVE CORNERS — tiny themed elements (starfish, bubbles — not cluttering the puzzle)
- SIMPLE and DIRECT — no narrative description style

**⚠️ DOT-TO-DOT PROMPTS: USE THIS EXACT FILL-IN-THE-BLANK STRUCTURE. NO EXCEPTIONS.**

\`\`\`
Generate a dot-to-dot activity page for kids. The dots form the outline of [CHARACTER/ANIMAL]. Number all dots clearly from 1 to [25/40/60] in sequence. Make the numbered dots large and bold so they are easy for small hands to find. DO NOT draw the character outline — the outline must only be revealed after connecting the dots. The character should appear as numbered dots only, with NO pre-drawn outline between them. Add a soft light pastel background ([pale yellow / light mint / pale aqua / soft lavender]). Add small decorative elements in the empty corners — [2-3 tiny themed decorations]. Leave the bottom 15% of the image completely empty (white space for watermark). Portrait orientation, 2:3 aspect ratio (1000×1500 px).
\`\`\`

Fill in the brackets. Do not rewrite the structure. The direct instruction style is what makes image generators produce usable dot-to-dot pages with legible numbers and clean line art.

Dot count by difficulty:
- **Easy (ages 4-5):** 15–25 dots, simple shapes (animals, fruits, vehicles)
- **Medium (ages 5-6):** 30–45 dots, more detailed characters (dinosaurs, castles, robots)
- **Hard (ages 6-8):** 50–70 dots, complex outlines (dragons, detailed landscapes, machines)

### EXAMPLE E — Proven Coloring Page Prompt (use this as the template for ALL coloring page prompts)
---
### Prompt — Activity: Coloring Page (Easy)
**Type:** Activity
**Activity type:** Coloring
**Difficulty:** Easy
**Theme:** Ocean Animals
**Skill target:** Creativity, color recognition, fine motor control
**Output dimensions:** 2:3 portrait — 1000×1500 px

**Image prompt:**
Generate a kids' coloring page featuring a friendly cartoon crab waving on a sandy ocean floor. Clean black outlines only — the interior of every shape must be completely white and empty, with NO color fills whatsoever. Simple, bold outlines sized for small hands. Add small decorative border elements (seaweed, bubbles, shells) also in black outline only. White background. Leave the bottom 10% of the image completely empty (white space for watermark). Portrait orientation, 2:3 aspect ratio (1000×1500 px).

**Caption hook idea:** "Color in your new ocean friend! | SAVE this easy coloring page. Develops creativity and color recognition. Ages 4-8."
---

Why this works:
- UNCOLORED LINE ART — interior of every shape is white and empty so the child fills it in
- BOLD BLACK OUTLINES — thick enough to color inside without going over the edges
- SIMPLE SHAPES — age-appropriate complexity (few details, large areas to color)
- WHITE BACKGROUND — not pastel, not colored; the child's colors are the only ones on the page
- DECORATIVE BORDER — adds visual interest without cluttering the main character

**⚠️ COLORING PAGE PROMPTS: USE THIS EXACT FILL-IN-THE-BLANK STRUCTURE. NO EXCEPTIONS.**

\`\`\`
Generate a kids' coloring page featuring [CHARACTER/SCENE DESCRIPTION]. Clean black outlines only — the interior of every shape must be completely white and empty, with NO color fills whatsoever. Simple, bold outlines sized for small hands. Add small decorative border elements ([2-3 themed decorations]) also in black outline only. White background. Leave the bottom 10% of the image completely empty (white space for watermark). Portrait orientation, 2:3 aspect ratio (1000×1500 px).
\`\`\`

Fill in the brackets. NEVER describe the image as colored, filled, or painted. NEVER say "colored with bright colors" or "pastel colors" — this will produce a colored illustration instead of a coloring page. The page must look like a printed coloring book sheet: black outlines, white interior, nothing else.

## OUTPUT DIMENSIONS — MANDATORY
All content targets Pinterest (primary) and Instagram (secondary) — both portrait-first platforms.
- STORY prompts: **2:3 portrait — 1000×1500 px** — tell the generator: "portrait orientation, 2:3 aspect ratio"
- ACTIVITY prompts: **2:3 portrait — 1000×1500 px** — same rule
- NEVER generate landscape (wider than tall) — landscape gets blur-letterboxed on Pinterest and looks amateurish
- X/Twitter receives auto-letterbox from portrait — acceptable (text-first platform, image is secondary)
- Every generated prompt MUST include "Portrait orientation, 2:3 aspect ratio (1000×1500 px)" at the end of the Image prompt text

## ACTIVITY THEME ASSIGNMENT — MANDATORY
Each activity slot has a pre-assigned theme injected by the system (marked "THEME: X (mandatory, do not change)").
You MUST use exactly that theme for that slot — no substitutions, no variations.
For story settings, use different themes freely from the list below.

## STORY SETTING POOL — use for story background/context only
Ocean Animals, Space and Planets, Forest Animals, Safari and Jungle, Dinosaurs, Farm Animals,
Bugs and Insects, Arctic Animals, Birds, Desert Animals, Pets and Cats, Dogs and Puppies,
Pirates and Treasure, Fairy Tale Castle, Dragons and Fantasy, Superheroes, Mermaids,
Vehicles and Trains, Food and Cooking, Weather and Seasons, Garden and Flowers,
Camping Outdoors, Sports and Games, Construction and Building, Robots and Technology,
Circus and Carnival, Unicorns, Wizards and Magic, Fire Trucks, Submarines

## SEASONAL AWARENESS
Current month determines seasonal hooks. Weave seasonal context into 2-3 prompts per day:
- January-February: cozy indoor activities, winter themes, New Year fresh starts
- March-April: spring themes, Easter, flowers blooming, outdoor transition
- May-June: end of school, summer prep, outdoor activities, Father's Day
- July-August: summer fun, beach, travel activities, screen-free vacation
- September-October: back to school, fall/autumn, Halloween
- November-December: gratitude, holiday gift guides, winter magic, Christmas/New Year

## RULES
- NEVER include JoyMaze branding, logos, or text in image prompts — our pipeline adds those
- NEVER use generic descriptions — be SPECIFIC about the moment/puzzle
- Story prompts (Arch 1-6): physical activities preferred (printed coloring, maze books, pencils) — no screens. Show the full scene: child's face, expression, posture, the parent watching. Make it feel like a real family moment.
- Story prompts (Arch 7): activity on a tablet/phone screen. Show the full scene naturally — parent and child together. Don't mention JoyMaze by name in the image prompt.
- Pattern Interrupt: bold, eye-catching, unexpected composition. The slot description specifies TODAY'S sub-type and topic — follow it exactly. Sub-types rotate daily: myth-bust, did-you-know, surprising-stat, counterintuitive, seasonal-hook, edutainment. NEVER default to generic brain-lightbulb or "screen time myth." Each day's topic is unique — use the visual direction provided.
- Activity prompts: these are THE ACTUAL PUZZLE, not a photo of someone doing a puzzle
- Each prompt must feel DIFFERENT — vary themes, difficulty, subjects, art styles
- HOOK DIVERSITY IS MANDATORY: Use each of the 8 hook types at least once across the day's 5 story prompts + pattern interrupt. No two prompts should use the same hook type.
- PINTEREST OPTIMIZATION: Caption hooks should include language parents search for: "screen-free activities", "printable for kids", "quiet time activities", "ages 4-8", "fine motor skills", "brain games for kids"
- ACTIVITY CAPTIONS: Always include "SAVE this" + skill framing + age range. Parents save educational content 3x more than generic entertainment content.
- ACTIVITY CTA VARIETY IS MANDATORY: NEVER repeat the same CTA structure across activity prompts in the same day's batch. Rotate between: "Can your kid find the path?", "Find all [N] hidden words!", "How fast can they spot them all?", "Can you spot all the differences?", "Only 1 in 5 kids solve this!", "Time your little one — drop the result below!", "Which path leads to the treasure?", "Can they find the matching pair?". Each activity prompt MUST use a structurally different CTA.
- THEME COHERENCE: The activity shown in a story prompt must match the setting's mood and environment. A snowy/winter/indoor scene cannot show a desert or tropical activity. A sunny outdoor scene cannot show an arctic activity. Setting and activity must feel like they belong in the same world.
- SCROLL STOPPER (MANDATORY ON EVERY PROMPT): Name the specific element that makes a parent's thumb stop. Not the art style — the compositional moment. For story/lifestyle: the detail nobody expects (eraser debris, a crayon rolled to the edge, a scrunched brow, a half-eaten snack). For activity: the puzzle front-and-center, partially solved, inviting and slightly daunting. For fact-card: the visual metaphor that makes the insight click without words. If you cannot point to what stops the scroll, the prompt is incomplete.
- FUN OR VALUE (MANDATORY ON EVERY PROMPT): Every prompt must deliver one or both. VALUE = the viewer receives something they can use — a printable they want, an insight they can act on, an activity their kid can do today. FUN = the viewer feels something specific — recognition, surprise, warmth, the urge to share. A beautiful image of a child holding an activity delivers NEITHER unless the activity itself is the visual hero and the viewer's brain registers "I want that for my child." Generic lifestyle scene with activity as background prop = failure.${
  hookExamples.length > 0 ? (() => {
    const byType = {};
    for (const h of hookExamples) {
      const t = h.hook_type || 'other';
      if (!byType[t]) byType[t] = [];
      byType[t].push(h.text);
    }
    const lines = Object.entries(byType)
      .map(([type, texts]) => `**${type.replace(/_/g, ' ')}:** ${texts.join(' | ')}`)
      .join('\n');
    return `\n\n## HIGH-PERFORMING HOOK EXAMPLES (empirically validated — use as inspiration, not verbatim):\n${lines}`;
  })() : ''
}${
  auditLessons.length > 0 ? `

## AUDIT LEARNINGS — MANDATORY RULES (learned from real failures, enforced by quality gate):
${auditLessons.map(l =>
  `- [${l.id.toUpperCase()}] ${l.generationRule}\n  ✗ BAD: "${l.examples?.bad || ''}"\n  ✓ GOOD: "${l.examples?.good || ''}"`
).join('\n')}` : ''
}${
  compIntel ? `

## COMPETITOR INTELLIGENCE — WHAT IS WORKING RIGHT NOW (${compIntel.date}):
Use these findings to inform visual direction, hook structure, and theme selection. Do NOT copy competitors — use these as signals for what parents in this niche respond to.

FORMATS GETTING MOST SAVES: ${(compIntel.top_formats || []).join(' | ')}
WINNING HOOK STRUCTURES: ${(compIntel.winning_hooks || []).map(h => `"${h}"`).join(' | ')}
VIRAL THEMES RIGHT NOW: ${(compIntel.viral_themes || []).join(' | ')}
CONTENT GAPS (opportunities): ${(compIntel.content_gaps || []).join(' | ')}
SCROLL STOPPER FORMULAS: ${(compIntel.scroll_stopper_formulas || []).join(' | ')}` : ''
}`;
}

async function loadPerformanceContext() {
  // Scan queue + archive for items with analytics data
  const QUEUE = path.join(ROOT, 'output', 'queue');
  const ARCHIVE = path.join(ROOT, 'output', 'archive');
  const items = [];

  async function scanDir(dir) {
    try {
      const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try { items.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8'))); } catch {}
      }
    } catch {}
  }

  await scanDir(QUEUE);
  try {
    const dateDirs = await fs.readdir(ARCHIVE);
    for (const d of dateDirs) {
      const dp = path.join(ARCHIVE, d);
      try { if ((await fs.stat(dp)).isDirectory()) await scanDir(dp); } catch {}
    }
  } catch {}

  // Filter to items with analytics
  const withData = items.filter(i => i.analytics?.pinterest?.lifetime);
  if (withData.length < 3) return ''; // Not enough data to be useful

  // Score each item
  const scored = withData.map(i => {
    const l = i.analytics.pinterest.lifetime;
    const saveRate = l.impressions > 0 ? (l.saves / l.impressions) * 100 : 0;
    const hook = i.captions?.pinterest?.rawCaption?.split('\n')[0]?.slice(0, 80) || '';
    return { category: i.category, saveRate, impressions: l.impressions, saves: l.saves, hook };
  });

  // Category performance
  const byCategory = {};
  for (const s of scored) {
    if (!byCategory[s.category]) byCategory[s.category] = { total: 0, saves: 0, impressions: 0 };
    byCategory[s.category].total++;
    byCategory[s.category].saves += s.saves;
    byCategory[s.category].impressions += s.impressions;
  }

  const catRanking = Object.entries(byCategory)
    .map(([cat, d]) => ({ cat, saveRate: d.impressions > 0 ? ((d.saves / d.impressions) * 100).toFixed(1) : '0' }))
    .sort((a, b) => parseFloat(b.saveRate) - parseFloat(a.saveRate));

  const topCats = catRanking.slice(0, 3).map(c => `${c.cat} (${c.saveRate}% save rate)`).join(', ');
  const weakCats = catRanking.slice(-2).map(c => `${c.cat} (${c.saveRate}%)`).join(', ');

  // Top hooks
  const topHooks = [...scored].sort((a, b) => b.saveRate - a.saveRate).slice(0, 3);
  const hookPatterns = topHooks.map(h => `"${h.hook}"`).join('; ');

  return `
PERFORMANCE DATA (from ${scored.length} analyzed posts):
- Top categories: ${topCats}
- Weakest categories: ${weakCats}
- Best-performing hooks: ${hookPatterns}
Generate MORE content similar to top performers. Lean into the emotional tones and visual styles that performed best.`;
}

/**
 * Load activity-level performance ranking from queue + archive analytics.
 * Returns an array of activity keys (e.g. ['mazes','maze','coloring',...]) sorted best-first.
 * Returns [] if fewer than 5 posts with analytics data exist — triggers doy fallback.
 *
 * Key mapping: category 'activity-maze' → facts key 'mazes' / progression key 'maze'.
 * Both carousel pools use this same ranking (facts pool uses 'mazes', progression uses 'maze').
 */
async function loadActivityRanking() {
  const QUEUE   = path.join(ROOT, 'output', 'queue');
  const ARCHIVE = path.join(ROOT, 'output', 'archive');
  const items   = [];

  async function scan(dir) {
    try {
      for (const f of (await fs.readdir(dir)).filter(f => f.endsWith('.json'))) {
        try { items.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8'))); } catch {}
      }
    } catch {}
  }

  await scan(QUEUE);
  try {
    for (const d of await fs.readdir(ARCHIVE)) {
      const dp = path.join(ARCHIVE, d);
      try { if ((await fs.stat(dp)).isDirectory()) await scan(dp); } catch {}
    }
  } catch {}

  const withData = items.filter(i => (i.analytics?.pinterest?.lifetime?.impressions ?? 0) > 0);
  if (withData.length < 5) return [];

  // category → facts pool key (facts uses 'mazes', progression uses 'maze' — covered via FACTS_TO_PROG map)
  const CAT_KEY = {
    'activity-maze':        'mazes',
    'activity-coloring':    'coloring',
    'activity-word-search': 'word-search',
    'activity-dot-to-dot':  'dot-to-dot',
    'activity-sudoku':      'sudoku',
  };

  const byKey = {};
  for (const item of withData) {
    const key = CAT_KEY[item.category];
    if (!key) continue;
    if (!byKey[key]) byKey[key] = { saves: 0, impressions: 0 };
    byKey[key].saves       += item.analytics.pinterest.lifetime.saves;
    byKey[key].impressions += item.analytics.pinterest.lifetime.impressions;
  }

  return Object.entries(byKey)
    .map(([key, d]) => ({ key, saveRate: d.saves / d.impressions }))
    .sort((a, b) => b.saveRate - a.saveRate)
    .map(x => x.key);
}

/**
 * Score carousel slide descriptions for visual specificity and distinctiveness.
 * Uses llama-3.1-8b-instant (cheap/fast). Silent no-op if GROQ_API_KEY not set.
 * Returns array of { n, score, note } or null on failure.
 */

/**
 * Post-generation deterministic strip.
 * Removes text-in-image instructions and fabricated stats the LLM emits
 * despite system prompt rules. Runs before scoring and saving.
 */
function stripRuleViolations(result) {
  // Strip text-in-image instructions: "The text reads: '...'", "overlay reads: ...", etc.
  result = result.replace(
    /(?:The (?:text|statistic|stat|overlay|font|label|caption|banner|heading) (?:reads|says|should (?:read|say))|text overlay should read)[:\s]+[""]?[^.!?\n"]{0,300}[""]?[.!]?\s*/gi,
    ''
  );
  // Strip fabricated improvement percentages
  result = result.replace(
    /(?:improve[sd]?|increase[sd]?|boost[s]?|raise[sd]?|develop[sd]?)\s+[\w\s]+?\s+by\s+\d{1,3}%[,.]?/gi,
    ''
  );
  result = result.replace(
    /\b\d{1,3}%\s+(?:of (?:children|kids|parents|students)|improvement|higher|more|better|faster|increase)/gi,
    ''
  );
  return result;
}

/**
 * Pre-check all prompts for hard rule violations before LLM scoring.
 * Returns Map<promptNumber, violations[]> — each violation: {rule, penalty}.
 * These penalties are applied deterministically, regardless of LLM score.
 */
function preCheckViolations(result) {
  const violations = new Map();
  const sections = result.split(/(?=### Prompt \d)/);
  const month = new Date().getMonth() + 1; // 1-12

  for (const section of sections) {
    const match = section.match(/### Prompt (\d+)/);
    if (!match) continue;
    const n = parseInt(match[1], 10);
    const v = [];

    // Text-in-image instruction
    if (/(?:the (?:text|statistic|overlay|label) (?:reads|says)|text overlay should read|reads:\s*[""])/i.test(section)) {
      v.push({ rule: 'text-in-image', penalty: -4 });
    }
    // Fabricated stat (specific percentage claim)
    if (/\d{1,3}%\s+(?:of (?:children|kids|parents)|improvement|higher|more|better)|(?:improve|increase|boost)\s+\w+\s+by\s+\d{1,3}%/i.test(section)) {
      v.push({ rule: 'fabricated-stat', penalty: -4 });
    }
    // Wrong season: Christmas/Halloween mentioned in spring/summer (Mar–Aug)
    if (month >= 3 && month <= 8) {
      if (/christmas tree|halloween pumpkin|thanksgiving turkey|winter holiday/i.test(section)) {
        v.push({ rule: 'wrong-season', penalty: -3 });
      }
    }
    // Wrong season: Autumn/fall themes in spring (Mar–May)
    if (month >= 3 && month <= 5) {
      if (/autumn leaves|fall leaves|autumn theme|harvest moon|harvest time|falling leaves|autumn.{0,20}color/i.test(section)) {
        v.push({ rule: 'wrong-season', penalty: -3 });
      }
    }
    // System instruction meta-leak: internal rules copied into output
    if (/(?:consumer delivery:|MANDATORY:|SCROLL STOPPER \(MANDATORY|the system prompt|SEASONAL NOTE:)/i.test(section)) {
      v.push({ rule: 'system-instruction-leak', penalty: -3 });
    }

    if (v.length > 0) violations.set(n, v);
  }
  return violations;
}

async function scoreCarouselSlides(plan) {
  if (!process.env.GROQ_API_KEY || !plan?.slides?.length) return null;

  const slideList = plan.slides.map(s =>
    `Slide ${s.slideIndex} (${s.role}): ${s.description || s.filename || ''}`
  ).join('\n');

  const prompt = `Score these image generation instructions for a ${plan.format} social media carousel about ${plan.activity}.
Rate each 1–10 on visual specificity (enough detail for Gemini to generate a distinct image) and note any that are too vague.
Reply ONLY with a JSON array: [{"n":1,"score":8,"note":"..."},...]

${slideList}`;

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const m = raw.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

/**
 * Load trend signals from config/trends-this-week.json (written by collect-trends.mjs).
 * Returns an injection string for the user prompt, or '' if no signal file exists.
 */
async function loadTrendSignals() {
  try {
    const raw = await fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8');
    const data = JSON.parse(raw);

    // Check if signal file is stale (older than 8 days)
    const generated = new Date(data.generated);
    const ageInDays = (Date.now() - generated.getTime()) / 86400000;
    if (ageInDays > 8) {
      console.log('  Trend signals stale (>8 days) — run npm run trends to refresh.');
      return '';
    }

    const lines = [
      `\n\nTREND SIGNALS THIS WEEK (generated ${data.generated} — prioritize these in 2-4 prompts):`,
    ];

    if (data.boost_themes?.length) {
      lines.push(`Trending themes RIGHT NOW: ${data.boost_themes.join(', ')}`);
      lines.push('→ Lean into these themes. They have elevated search volume and will be discovered organically.');
    }

    if (data.upcoming_moments?.length) {
      const soon = data.upcoming_moments.filter(m => m.days_away <= 14);
      if (soon.length) {
        lines.push(`Upcoming high-traffic moments: ${soon.map(m => `${m.event} (${m.days_away === 0 ? 'TODAY' : `in ${m.days_away} days`})`).join(', ')}`);
        lines.push('→ Create 1-2 prompts directly timed to these events. Parents search for activity content before and during these windows.');
      }
    }

    if (data.rising_searches?.length) {
      lines.push(`Rising search queries this week: ${data.rising_searches.slice(0, 5).join(' | ')}`);
      lines.push('→ Weave these exact phrases or close variants into caption hooks where natural.');
    }

    return lines.join('\n');
  } catch {
    return ''; // No signal file — silent fallback, do not error
  }
}

/**
 * Scan recent prompt files to extract themes/subjects already used.
 * Returns a dedup instruction string for the user prompt.
 */
async function loadRecentThemes(daysBack = 7) {
  const activityThemes = new Set();
  const storyScenes = new Set();
  const artStyles = new Set();
  const arch7Settings = new Set();
  const interruptTopics = new Set();
  const today = new Date();
  const ARCHIVE_PROMPTS_DIR = path.join(ROOT, 'output', 'archive', 'prompts');

  for (let d = 1; d <= daysBack; d++) {
    const past = new Date(today);
    past.setDate(past.getDate() - d);
    const dateStr = past.toISOString().slice(0, 10);
    // Check active prompts dir first, then archive
    const candidates = [
      path.join(OUTPUT_DIR, `prompts-${dateStr}.md`),
      path.join(ARCHIVE_PROMPTS_DIR, `prompts-${dateStr}.md`),
    ];
    let content = null;
    for (const filepath of candidates) {
      try { content = await fs.readFile(filepath, 'utf-8'); break; } catch {}
    }
    if (!content) continue;
    try {
      // Activity themes: **Theme:** lines
      for (const m of content.matchAll(/\*\*Theme:\*\*\s*(.+)/gi)) {
        activityThemes.add(m[1].trim());
      }
      // Story scenes: **Activity shown:** lines
      for (const m of content.matchAll(/\*\*Activity shown:\*\*\s*(.+)/gi)) {
        const scene = m[1].trim();
        if (scene.length > 3 && scene.toLowerCase() !== 'none, conceptual') storyScenes.add(scene);
      }
      // Art styles: Style: ... at end of image prompts
      for (const m of content.matchAll(/Style:\s*([^.]+?)\.?\s*$/gim)) {
        artStyles.add(m[1].trim());
      }
      // Arch 7 settings: extract from Archetype 7 sections
      const arch7Sections = content.match(/Archetype 7[\s\S]*?(?=###|$)/gi) || [];
      for (const section of arch7Sections) {
        for (const m of section.matchAll(/\*\*Emotional target:\*\*\s*(.+)/gi)) {
          arch7Settings.add(m[1].trim());
        }
        // Capture image prompt first line for setting detection
        const imgMatch = section.match(/\*\*Image prompt:\*\*\s*\n?(.+)/i);
        if (imgMatch) arch7Settings.add(imgMatch[1].trim().slice(0, 100));
      }
      // Pattern interrupt topics: extract caption hooks for topic detection
      const piSections = content.match(/pattern.interrupt[\s\S]*?(?=###|$)/gi) || [];
      for (const section of piSections) {
        const captionMatch = section.match(/\*\*Caption hook idea:\*\*\s*"?([^"|]+)/i);
        if (captionMatch) interruptTopics.add(captionMatch[1].trim());
      }
    } catch { /* parse error in prompt file */ }
  }

  const parts = [];
  if (activityThemes.size > 0) {
    parts.push(`ACTIVITY THEMES already used:\n${[...activityThemes].map(t => `- ${t}`).join('\n')}`);
  }
  if (storyScenes.size > 0) {
    parts.push(`STORY SCENES already used:\n${[...storyScenes].map(t => `- ${t}`).join('\n')}`);
  }
  if (artStyles.size > 0) {
    parts.push(`ART STYLES already used:\n${[...artStyles].map(t => `- ${t}`).join('\n')}`);
  }
  if (arch7Settings.size > 0) {
    parts.push(`ARCHETYPE 7 SETTINGS already used (do NOT repeat these scenes):\n${[...arch7Settings].map(t => `- ${t}`).join('\n')}`);
  }
  if (interruptTopics.size > 0) {
    parts.push(`PATTERN INTERRUPT TOPICS already used (do NOT repeat):\n${[...interruptTopics].map(t => `- ${t}`).join('\n')}`);
  }

  if (parts.length === 0) return '';
  return `\n\nRECENTLY USED (last ${daysBack} days) — DO NOT REPEAT any of these:
${parts.join('\n\n')}

IMPORTANT: Choose COMPLETELY DIFFERENT themes, scenes, settings, and art styles.
For activities: explore new subjects (dinosaurs, jungle, weather, vehicles, insects, castles, underwater caves, desert, arctic, music, sports, etc.)
For stories: vary the child's age/gender, the setting (kitchen, backyard, car ride, park, bedroom, grandparent's house), the activity (mazes, tracing, dot-to-dot, word search — not just coloring/puzzles), and the art style (watercolor, 3D render, anime, oil painting, collage, paper cutout, crayon drawing, etc.)`;
}

function buildUserPrompt(mix, count, performanceContext, assignedThemes = [], assignedStorySettings = []) {
  if (FILTER_ARCHETYPE !== null) {
    return `Generate ${count} image prompts, ALL for Archetype ${FILTER_ARCHETYPE}. Each should capture a different beat (Scene Drop, Emotional Tension, or The Shift) and show a different activity type. Make each feel like a completely different family and moment.${performanceContext}`;
  }

  const storySlots = mix.slots.filter(s => s.type !== 'activity');
  const activitySlots = mix.slots.filter(s => s.type === 'activity');

  const storyDescriptions = storySlots.map((s, i) => {
    const styleLine = s.artStyle ? `\n  Art style: ${s.artStyle}` : '';
    const childLine = s.childProfile ? `\n  Child: ${s.childProfile.age}-year-old ${s.childProfile.gender}` : '';

    if (s.type === 'fact-card') {
      return `Slot ${i + 1}: FACT-CARD — educational poster
  Topic: ${s.topic}
  Visual: Bold, eye-catching design — strong visual metaphor, infographic-style layout, or activity scene. NO text, statistics, or numbers in the image (our pipeline adds those post-generation via sharp).
  Energy: Confident, surprising, educational. Like a viral infographic.
  ${s.hint}${styleLine}`;
    }

    if (s.type === 'activity-challenge') {
      return `Slot ${i + 1}: ACTIVITY-CHALLENGE — challenge-framed lifestyle scene
  Theme: ${s.theme}
  Visual: The ACTIVITY PRINTABLE is the visual hero — clear, beautiful, inviting, front-and-center and legible. The viewer must look at this image and think "I want that for my child." Activity shown 30-60% solved — never blank (no tension), never finished (tension resolved). Child's hands or face may be in frame but must NOT obscure the activity. The activity earns the challenge hook, not the child's expression.
  Energy: Competitive curiosity. "Can YOUR kid solve this?" — but the ACTIVITY earns that question.
  Consumer delivery: The viewer receives a desirable, usable activity. The image is the preview. If the activity isn't clearly visible and beautiful, the post delivers nothing.
  Include: printable clearly lit and legible, child's hand engaged as supporting detail — not primary subject
  ${s.hint}${styleLine}${childLine}`;
    }

    if (s.type === 'quiet-moment') {
      return `Slot ${i + 1}: QUIET-MOMENT — sensory lifestyle scene
  Setting: ${s.scene?.setting || 'home, daytime'}
  Activity shown: ${s.scene?.activity || 'printable activity'}
  Detail: ${s.scene?.detail || 'child absorbed, no distractions'}
  Energy: Peaceful, sensory, warm. The "good kind of quiet."
  Rule: NO screens, NO tablets, NO phones — printable on paper only
  ${s.hint}${styleLine}${childLine}`;
    }

    if (s.type === 'printable-tease') {
      return `Slot ${i + 1}: PRINTABLE-TEASE — beautiful flat-lay of a printable
  Activity type: ${s.activityType}
  Visual: Close-up flat-lay — printed activity sheet on a table or wooden surface. Pencil nearby. Warm side-lighting. Slightly worn paper feel — looks REAL, not pristine.
  Optional: small hand reaching in from edge, or pencil on page.
  Energy: "Grab this for today." Save-bait.
  ${s.hint}${styleLine}`;
    }

    if (s.type === 'identity') {
      return `Slot ${i + 1}: IDENTITY — parent identity scene
  Angle: "${s.angle}"
  Visual: A quiet, real-feeling moment that embodies this identity. Could be:
    - Child absorbed in activity while parent watches with quiet pride
    - Simple lifestyle scene: printable on table, morning light, calm atmosphere
    - OR a bold text design: the identity statement as large text over a soft background
  Energy: Aspirational but NOT aspirational-lifestyle-Instagram — real, warm, specific
  Consumer delivery: The IMAGE sets the scene. The CAPTION HOOK must deliver the payoff — a specific felt truth, not an atmosphere. The viewer must receive either recognition ("that's me") or a clear emotional landing ("that's what I need to hear"). Vibes without a payoff = scroll past. The caption hook idea you write must land on a feeling, not a vibe.
  ${s.hint}${styleLine}${childLine}`;
    }

    // Fallback for any remaining legacy archetypes (shouldn't appear in new mix)
    return `Slot ${i + 1}: ${s.archetype || s.type}`;
  });

  const activityDescriptions = activitySlots.map((s, i) => {
    const idx = storySlots.length + i + 1;
    const sourceLabel = s.source === 'books' ? 'KDP Books' : s.source === 'both' ? 'App + Books' : 'App';
    const theme = assignedThemes[i] ? ` — THEME: ${assignedThemes[i]} (mandatory, do not change)` : '';

    // Seasonal context: prevent LLM from defaulting to off-season holidays
    const m = new Date().getMonth() + 1;
    const seasonalNote = m >= 3 && m <= 5 ? 'SPRING (Easter, Earth Day, spring nature — NOT Christmas/Halloween)' :
                         m >= 6 && m <= 8 ? 'SUMMER (summer break, outdoors, 4th of July — NOT Christmas)' :
                         m >= 9 && m <= 10 ? 'FALL (Halloween, harvest, back-to-school)' :
                                             'WINTER/HOLIDAY (Christmas, Hanukkah, New Year)';

    // Per-activity-type scroll stopper + visual specificity guide
    const label = s.label.toLowerCase();
    const guide = label.includes('maze')
      ? 'SCROLL STOPPER: themed character at start, clearly marked finish, decorative elements in corners. VISUAL: maze path fills 70% of frame, solvable-looking, fun themed illustration.'
      : label.includes('word search')
      ? 'SCROLL STOPPER: themed illustrated header + large legible letter grid. VISUAL: grid must be large enough to read individual letters clearly. Theme art above grid.'
      : label.includes('color')
      ? 'SCROLL STOPPER: intricate but not intimidating design, clearly defined sections. VISUAL: BLACK OUTLINE ONLY — zero color fill, zero shading, pure line art on white paper.'
      : label.includes('dot')
      ? 'SCROLL STOPPER: enough dots that the final shape is intriguing but not obvious. VISUAL: numbered dots ONLY — NO pre-drawn outline, NO connected lines anywhere in the image.'
      : label.includes('match') || label.includes('spot')
      ? 'SCROLL STOPPER: paired images side by side, clearly laid out. VISUAL: clean pairs layout, 4-6 differences or pairs, fun illustrated subjects.'
      : label.includes('sudoku')
      ? 'SCROLL STOPPER: child-friendly icons (animals, shapes) instead of numbers for ages 4-6. VISUAL: 4x4 or 6x6 grid, some cells filled, some blank — clearly a puzzle in progress.'
      : label.includes('quiz') || label.includes('visual puzzle')
      ? 'SCROLL STOPPER: bold visual question with 3-4 illustrated answer choices. VISUAL: clear question + answer options, fun themed illustrations, no walls of text.'
      : label.includes('trac')
      ? 'SCROLL STOPPER: large clear dotted guide path with visible start arrow. VISUAL: thick dotted lines, generous white space, child-accessible letter or shape.'
      : 'SCROLL STOPPER: clear themed activity hero with defined sections. VISUAL: activity fills 80% of frame.';

    return `${idx}. [ACTIVITY] ${s.label}${theme} — ${s.difficulty} difficulty (Skill: ${s.skill}) [${sourceLabel}]
  ${guide}
  SEASON: ${seasonalNote} — apply to the theme if it could be misread as off-season.
  CAPTION: structurally different from other activity captions in this batch. Rotate formula: "Can your kid find...?" / "How fast can they...?" / "Only 1 in 5 kids can..." / "Find all X hidden..." / "Time your little one — drop the result below!"`;
  });

  const allDescriptions = [...storyDescriptions, ...activityDescriptions];

  const month = new Date().toLocaleDateString('en-US', { month: 'long' });
  const season = ['January','February','March'].includes(month) ? 'winter/early spring' :
                 ['April','May','June'].includes(month) ? 'spring' :
                 ['July','August','September'].includes(month) ? 'summer/early fall' : 'fall/winter';

  const sundayNote = mix.isRepost
    ? '\nToday is SUNDAY — best-of repost day. Lean into the most emotionally resonant versions of each slot. Quiet-moment and identity slots especially strong today.'
    : '';

  const seriesNote = mix.seriesTag
    ? `\nToday's Series: ${mix.seriesTag} — weave "${mix.seriesTag}" naturally into 1-2 caption hooks (activity or challenge slots). Not forced into every slot — just where the theme fits organically.`
    : '';

  return `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.
Season: ${season} (${month}).
Rotation: ${mix.label}${sundayNote}${seriesNote}

━━━ INPUT INSTRUCTIONS — do NOT copy these into your output ━━━
The slot specs below are creative briefs. Use them to inform what you generate.
Your output must follow ONLY the format template from your system prompt — nothing else.
Do NOT echo slot numbers, slot labels, or any instruction text as output headers.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSPIRATION SLOTS (${storySlots.length}) — generate a full image prompt for each:
${storyDescriptions.join('\n\n')}

ACTIVITY SLOTS (${activitySlots.length}) — generate actual puzzle content for each:
${activityDescriptions.join('\n')}

${count < allDescriptions.length ? `(Generating ${count} of ${allDescriptions.length} total slots. Run again for more.)` : ''}

━━━ OUTPUT RULES ━━━
INSPIRATION prompts (slots 1-5):
- Use the exact age and gender specified in each slot. Do not deviate.
- Each slot uses a DIFFERENT hook type — rotate: Curiosity Gap, Emotional Mirror, Identity Hook, Relief Hook, Sensory Hook, Transformation Hint, Challenge Hook, Insider Hook
- Each slot uses a DIFFERENT setting — no two prompts in the same room or visual style
- Caption hook: specific emotional line | skill framing + "screen-free printable"
- EVERY inspiration prompt MUST end with: "Portrait orientation, 2:3 aspect ratio (1000×1500 px)."

ACTIVITY prompts:
- Each activity uses a DIFFERENT theme from the expanded pool
- Caption hook: challenge + "SAVE this" + skill framing + "ages 4-8"
- MAZE: use the EXACT fill-in-the-blank template from Example C. No narrative style.
- DOT-TO-DOT: use the EXACT fill-in-the-blank template from Example D.
- EVERY activity image prompt MUST name a visual illustration style (e.g., 'warm watercolor illustration', '3D Pixar-style render', 'vintage storybook illustration', 'ink-and-wash bold lines'). No named style = generic output that won't stop the scroll.
- EVERY activity image prompt MUST end with: "Portrait orientation, 2:3 aspect ratio (1000×1500 px). Leave the bottom 10% of the image completely empty (white space for watermark)."

ALL prompts:
- Weave spring (${month}) seasonal context into 2-3 prompts
- Pick themes from the expanded pool — do NOT repeat themes from the dedup list below
- Do NOT include JoyMaze branding or logos in any image prompt${performanceContext}`;
}

async function generateWithGroq(systemPrompt, userPrompt) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.9,
    max_tokens: 4000,
  });

  return response.choices[0].message.content;
}

async function generateWithOllama(systemPrompt, userPrompt) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  console.log(`  Using Ollama (${model})...`);

  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: { temperature: 0.9 },
    }),
  });

  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
  const data = await response.json();
  return data.message?.content;
}

/**
 * Quality Gate — score all prompts 0-10 using a fast model.
 * Returns { scores: [{n, score, fail}, ...] } or null on failure.
 * Uses llama-3.1-8b-instant (cheap/fast) so scoring doesn't inflate cost.
 */
async function scorePrompts(result, auditLessons = []) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const auditCriteria = auditLessons.length > 0
    ? `\nAUDIT RULES (violations override other scoring — deduct as specified):\n${auditLessons.map(l =>
        `- [${l.id}] Check: ${l.scoreCheck}. If found: flag="${l.scoreFlag}", apply ${l.scorePenalty} points.`
      ).join('\n')}\n`
    : '';

  const scoringPrompt = `You are a quality gate for AI image generation prompts targeting parents on Pinterest/Instagram.${auditCriteria}

Score each numbered prompt from 0–10. Start at 10 and subtract for each missing criterion.

FOR ALL PROMPTS (applies to every prompt type without exception):
- SCROLL STOPPER NAMED: Prompt identifies a specific compositional element that stops the scroll — an unexpected detail, a bold visual anchor, or an inviting activity. Generic description without a stopping moment = −2.
- FUN OR VALUE DELIVERED: Prompt ensures the viewer receives something. For activity-challenge: is the printable clearly the visual hero, legible and inviting? Activity as background prop = −3. For fact-card: is the insight specific enough that a parent takes something away? Vague inspiration = −2. For identity: does the caption hook idea land on a specific felt truth, not just an atmosphere? No payoff = −2.

FOR STORY PROMPTS (not puzzle/activity prompts):
- SENSORY ANCHOR: One unexpected real-world detail (half-eaten apple, steam from mug, sock falling off). Missing = −2.
- PEAK ENGAGEMENT: Activity shown 30–60% complete. Blank OR finished page = −2.
- ABANDONED ALTERNATIVE: Discarded screen/device or ignored toy visible. Missing = −1.5.
- EXPRESSION SPECIFIC: Child expression is a specific feeling ("brow furrowed"), not "smiling happily". Generic = −1.
- ART STYLE NAMED: Explicit style stated (soft-focus photorealistic, warm watercolor, etc.). Missing = −1.
- DIMENSIONS LINE: Ends with "Portrait orientation, 2:3 aspect ratio (1000×1500 px)". Missing = −1.
- CAPTION HOOK: Includes "screen-free" or "printable". Missing = −0.5.

FOR ACTIVITY PROMPTS (maze, word search, dot-to-dot, coloring, tracing, matching, quiz, sudoku):
- PUZZLE SPECCED: Character, theme, difficulty clearly stated. Vague = −3.
- DIMENSIONS LINE: Ends with "Portrait orientation, 2:3 aspect ratio (1000×1500 px). Leave the bottom 10% empty". Missing = −2.
- TEMPLATE STYLE: Uses direct instruction style for maze/dot-to-dot. Narrative description style = −2.
- CAPTION HOOK: Includes "SAVE this" and skill framing. Missing = −1.
- COLORING PAGE CORRECTNESS (only for coloring type): The prompt must NOT say the image is colored, filled with color, painted, or use words like "bright pastel colors", "colored with", "vibrant colors applied". A coloring page is UNCOLORED black-outline-only line art. Any color fill instruction = −5 (instant fail).
- DOT-TO-DOT CORRECTNESS (only for dot-to-dot type): The prompt must NOT say to draw "thick outlines", "crisp outlines", "bold strokes", or any pre-drawn character outline. The character shape must ONLY be revealed by connecting the numbered dots — no outline should exist before connecting. Any pre-drawn outline instruction = −5 (instant fail).
- ART STYLE NAMED: Image prompt explicitly states a visual style (watercolor, Pixar render, ink-and-wash, linocut, storybook illustration, etc.). Missing = −1.

Return ONLY valid JSON — no markdown, no explanation:
{"scores":[{"n":1,"score":8.5,"fail":""},{"n":2,"score":5.5,"fail":"missing sensory anchor, generic expression"}]}

PROMPTS TO SCORE:
${result}`;

  try {
    const response = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: scoringPrompt }],
      temperature: 0.1,
      max_tokens: 600,
    });

    const raw = response.choices[0].message.content.trim();
    // Strip markdown code fences if model wraps the JSON
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    console.log(`  Score parsing failed: ${err.message} — skipping quality gate.`);
    return null;
  }
}

/**
 * Annotate the raw markdown result with score badges before saving.
 * Prepends a score callout to each ### Prompt N section.
 */
function annotateWithScores(result, scores) {
  const sections = result.split(/(?=### Prompt \d)/);
  return sections.map(section => {
    const match = section.match(/### Prompt (\d+)/);
    if (!match) return section;
    const n = parseInt(match[1], 10);
    const score = scores.find(s => s.n === n);
    if (!score) return section;
    const badge = score.score >= 7
      ? `> ✓ Score: ${score.score}/10\n\n`
      : score.score >= 5
        ? `> ⚠ Score: ${score.score}/10 — REVIEW: ${score.fail || 'quality flag'}\n\n`
        : `> ✗ REJECTED (${score.score}/10): ${score.fail || 'below threshold'}\n\n`;
    return badge + section;
  }).join('');
}

/**
 * Attempt to rewrite a single rejected/flagged prompt section.
 * Sends only the failing section + failure reason back to the model
 * with a targeted "fix this specific prompt" instruction.
 * Returns the rewritten section text, or null on failure.
 */
async function regeneratePrompt(sectionText, failReason, systemPrompt) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const fixPrompt = `The following image generation prompt was rejected by the quality gate.

REJECTION REASON: ${failReason}

REJECTED PROMPT:
${sectionText}

Rewrite this prompt to fix the specific issue(s) listed in the rejection reason. Keep the same prompt number, type, activity type, theme, and difficulty. Return ONLY the rewritten prompt section in the exact same markdown format (starting with ### Prompt). No explanation, no extra text.`;

  try {
    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: fixPrompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
    });
    return response.choices[0].message.content.trim();
  } catch (err) {
    console.log(`  Regen failed: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('\n🎨 JoyMaze Image Prompt Generator\n');

  // Load strategy + dynamic pools in parallel
  console.log('Loading strategy context + dynamic pools...');
  const [{ styleGuide, archetypes }, dynamicPools, auditLessons, compIntel] = await Promise.all([
    loadStrategyContext(),
    loadDynamicPools(),
    loadAuditLearnings(),
    loadCompetitorIntelligence(),
  ]);
  console.log(`  Style guide: ${styleGuide.length} chars`);
  console.log(`  Archetypes: ${archetypes.length} chars`);

  // Merge dynamic themes into the active pool
  MERGED_THEME_POOL = [...THEME_POOL, ...dynamicPools.themes];
  console.log(`  Theme pool: ${THEME_POOL.length} hardcoded + ${dynamicPools.themes.length} dynamic = ${MERGED_THEME_POOL.length} total`);
  if (dynamicPools.patternInterrupts.length) {
    console.log(`  Pattern interrupts: ${dynamicPools.patternInterrupts.length} dynamic added`);
  }
  if (dynamicPools.hookExamples.length) {
    console.log(`  Hook examples: ${dynamicPools.hookExamples.length} for system prompt injection`);
  }
  if (auditLessons.length) {
    console.log(`  Audit learnings: ${auditLessons.length} rules loaded (injected into generation + scorer)`);
  }
  if (compIntel) {
    console.log(`  Competitor intelligence: loaded (${compIntel.date}) — formats, hooks, gaps injected`);
  }

  // Make dynamic pools available to getTodaysMix via simple attachment
  getTodaysMix._dynamicInterrupts = dynamicPools.patternInterrupts;

  // Inject trend signals into getTodaysMix for intelligence-driven slots
  try {
    const trends = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8'));
    getTodaysMix._trendTopic    = (trends.rising_searches || [])[0] || null;
    getTodaysMix._boostThemes   = (trends.boost_themes   || []).slice(0, 3);
  } catch {
    getTodaysMix._trendTopic  = null;
    getTodaysMix._boostThemes = [];
  }

  // Build today's mix
  const today = new Date();
  const mix = getTodaysMix(today, getTodaysMix._trendTopic);
  const count = FILTER_ARCHETYPE !== null ? PROMPT_COUNT : Math.min(PROMPT_COUNT, mix.slots?.length || PROMPT_COUNT);

  console.log(`\nToday's rotation: ${mix.label}`);
  console.log(`Generating ${count} prompts...\n`);

  // Load performance data (feedback loop from analytics)
  console.log('Loading performance context...');
  const performanceContext = await loadPerformanceContext();
  if (performanceContext) {
    console.log('  Analytics data found — injecting into prompt.');
  } else {
    console.log('  No analytics data yet — skipping performance context.');
  }

  // Load recent themes and pre-assign this session's activity themes in code
  console.log('Checking recent themes for diversity...');
  const recentThemesData = await loadRecentThemes(7);
  const usedThemeSet = new Set();
  const usedSceneSet = new Set();
  for (const m of recentThemesData.matchAll(/^- (.+)$/gm)) usedThemeSet.add(m[1].trim());
  // Extract recently used story scenes to exclude from setting picker
  for (const m of recentThemesData.matchAll(/STORY SCENES already used:\n([\s\S]*?)(?:\n\n|$)/g)) {
    for (const scene of m[1].matchAll(/^- (.+)$/gm)) usedSceneSet.add(scene[1].trim());
  }

  // Load trend signals early — boost_themes influence theme assignment
  console.log('Loading trend signals...');
  const trendSignals = await loadTrendSignals();
  let boostThemes = [];
  try {
    const raw = await fs.readFile(path.join(ROOT, 'config', 'trends-this-week.json'), 'utf-8');
    const trendsData = JSON.parse(raw);
    const ageInDays = (Date.now() - new Date(trendsData.generated).getTime()) / 86400000;
    if (ageInDays <= 8) boostThemes = (trendsData.boost_themes || []).map(t => t.replace(/[/\\]/g, ' ').replace(/\s+/g, ' ').trim());
  } catch {}
  if (trendSignals) {
    console.log(`  Trend signals found${boostThemes.length ? ` — boosting: ${boostThemes.slice(0, 3).join(', ')}` : ''}.`);
  } else {
    console.log('  No trend signals — run npm run trends to enable (using seasonal context only).');
  }

  // Pre-assign activity themes (code-enforced, trend-boosted)
  const activitySlotCount = mix.slots.filter(s => s.type === 'activity').length;
  const assignedThemes = pickActivityThemes(activitySlotCount, usedThemeSet, 7, boostThemes);
  console.log(`  Assigned themes (code-enforced): ${assignedThemes.join(', ')}`);

  // Carousel planning — 9-day rotation across 3 formats
  const carouselFormat = getCarouselFormat(today);
  let carouselPlan = null;
  if (carouselFormat === 'activity-collection') {
    carouselPlan = buildCarouselPlan(assignedThemes, today);
  } else if (carouselFormat === 'facts' || carouselFormat === 'progression') {
    // Load analytics ranking + pass dynamic pools already in memory
    const activityRanking = await loadActivityRanking();
    const dynamicInterrupts = dynamicPools.patternInterrupts || [];
    // Best unscored hook from hooks-library (performance_score = null means untested but brand_safe)
    const topHook = (dynamicPools.hookExamples || []).find(h => h.brand_safe) || null;
    const intelligence = { activityRanking, dynamicInterrupts, topHook, boostThemes };

    if (activityRanking.length > 0) {
      console.log(`\n  [Carousel] Analytics ranking: ${activityRanking.join(' > ')}`);
    } else {
      console.log('\n  [Carousel] No analytics data yet — using doy rotation (will self-correct once posts have impressions).');
    }
    if (dynamicInterrupts.length > 0) {
      console.log(`  [Carousel] ${dynamicInterrupts.length} dynamic fact(s) available for injection.`);
    }

    if (carouselFormat === 'facts') {
      carouselPlan = buildFactsCarouselPlan(today, intelligence);
    } else {
      carouselPlan = buildProgressCarouselPlan(today, intelligence);
    }

    // Score carousel slide descriptions via Groq (same model as quality gate: llama-3.1-8b-instant)
    if (process.env.GROQ_API_KEY) {
      console.log('  Scoring carousel slide descriptions...');
      const slideScores = await scoreCarouselSlides(carouselPlan);
      if (slideScores?.length) {
        carouselPlan._slideScores = slideScores;
        const low = slideScores.filter(s => s.score < 6);
        console.log('  ┌─ Carousel Slide Scores ─────────────────────────────────┐');
        for (const s of slideScores) {
          const tag = s.score >= 7 ? 'PASS' : s.score >= 6 ? 'WEAK' : 'FLAG';
          console.log(`  │ Slide ${String(s.n).padEnd(2)}  ${tag.padEnd(4)}  ${String(s.score).padEnd(4)}${s.note ? `  ${s.note}` : ''}`);
        }
        console.log(`  └─ avg ${(slideScores.reduce((a,s)=>a+s.score,0)/slideScores.length).toFixed(1)}/10${low.length ? ` · ⚠ ${low.length} below threshold` : ' · all good'} ───────────────────────────┘`);
      } else {
        console.log('  Carousel slide scoring skipped (Groq unavailable).');
      }
    }
  }
  if (carouselPlan) {
    const fmtLabel = { 'activity-collection': 'ACTIVITY COLLECTION', facts: 'FACTS', progression: 'PROGRESSION' }[carouselPlan.format];
    console.log(`\n  CAROUSEL DAY (${fmtLabel}) — images folder: ${carouselPlan.suggestedFolder}`);
    if (carouselPlan.intelligenceSignal && carouselPlan.intelligenceSignal !== 'doy-rotation') {
      console.log(`  Signal: ${carouselPlan.intelligenceSignal}${carouselPlan.dynamicFactsInjected ? ` · ${carouselPlan.dynamicFactsInjected} dynamic fact(s) injected` : ''}`);
    }
  }

  // Pre-assign story settings to prevent scene repetition
  const pureStoryCount = mix.slots.filter(s => typeof s.archetype === 'number').length;
  const assignedStorySettings = pickStorySettings(pureStoryCount, usedSceneSet, today);
  console.log(`  Story settings: ${assignedStorySettings.map(s => s.location.split(',')[0]).join(' | ')}`);

  // Build prompts
  const systemPrompt = buildSystemPrompt(styleGuide, archetypes, dynamicPools.hookExamples, auditLessons, compIntel);
  const userPrompt = buildUserPrompt(mix, count, (performanceContext || '') + trendSignals + recentThemesData, assignedThemes, assignedStorySettings);

  if (DRY_RUN) {
    console.log('=== SYSTEM PROMPT (first 500 chars) ===');
    console.log(systemPrompt.slice(0, 500) + '\n...\n');
    console.log('=== USER PROMPT ===');
    console.log(userPrompt);
    console.log('\n[DRY RUN — no API call made]');
    return;
  }

  // Generate via Groq (primary) → Ollama (fallback)
  let result;
  try {
    console.log('Calling Groq (llama-3.3-70b-versatile)...');
    result = await generateWithGroq(systemPrompt, userPrompt);
    console.log('Groq response received.\n');
  } catch (err) {
    console.log(`Groq failed: ${err.message}`);
    console.log('Falling back to Ollama...');
    try {
      result = await generateWithOllama(systemPrompt, userPrompt);
      console.log('Ollama response received.\n');
    } catch (err2) {
      console.error(`Ollama also failed: ${err2.message}`);
      console.error('No AI provider available. Check GROQ_API_KEY or run Ollama.');
      process.exit(1);
    }
  }

  // Output
  console.log('='.repeat(80));
  console.log(result);
  console.log('='.repeat(80));

  // Post-generation deterministic strip — removes violations LLM emitted despite rules
  result = stripRuleViolations(result);

  // Pre-check for hard rule violations (deterministic, before LLM scoring)
  const preChecks = preCheckViolations(result);
  if (preChecks.size > 0) {
    for (const [n, v] of preChecks) {
      const desc = v.map(x => `${x.rule}(${x.penalty})`).join(', ');
      console.log(`  ⚠ Pre-check Prompt ${n}: ${desc}`);
    }
  }

  // Quality gate scoring + auto-regeneration loop
  let scoreData = null;
  if (process.env.GROQ_API_KEY) {
    console.log('\nRunning quality gate scoring...');
    scoreData = await scorePrompts(result, auditLessons);

    // Apply pre-check penalties on top of LLM scores (deterministic overrides)
    if (preChecks.size > 0 && scoreData?.scores?.length) {
      for (const [n, v] of preChecks) {
        const entry = scoreData.scores.find(s => s.n === n);
        if (entry) {
          const totalPenalty = v.reduce((sum, x) => sum + x.penalty, 0);
          entry.score = Math.max(0, parseFloat((entry.score + totalPenalty).toFixed(1)));
          const ruleNames = v.map(x => x.rule).join(', ');
          entry.fail = [entry.fail, `rule-violations: ${ruleNames}`].filter(Boolean).join('; ');
        }
      }
    }

    if (!scoreData?.scores?.length) {
      console.log('  Quality gate scoring failed or returned no scores — prompts saved unscored.');
      console.log('  (Check GROQ_API_KEY and Groq API status if this persists.)');
    } else {
      // Auto-regeneration: attempt to fix rejected prompts (score < 5) up to 2 times
      const MAX_REGEN_ATTEMPTS = 2;
      let regenRound = 0;
      let rejected = scoreData.scores.filter(s => s.score < 5);

      while (rejected.length > 0 && regenRound < MAX_REGEN_ATTEMPTS) {
        regenRound++;
        console.log(`\n  Auto-regenerating ${rejected.length} rejected prompt(s) (attempt ${regenRound}/${MAX_REGEN_ATTEMPTS})...`);

        // Split result into sections by "### Prompt N"
        const sections = result.split(/(?=### Prompt \d)/);

        for (const s of rejected) {
          const sectionIdx = sections.findIndex(sec => sec.match(new RegExp(`^### Prompt ${s.n}\\b`)));
          if (sectionIdx === -1) {
            console.log(`    Prompt ${s.n}: section not found in output — skipping.`);
            continue;
          }
          console.log(`    Prompt ${s.n} (score ${s.score}/10): ${s.fail || 'below threshold'}`);
          const rewritten = await regeneratePrompt(sections[sectionIdx], s.fail || 'below quality threshold', systemPrompt);
          if (rewritten) {
            sections[sectionIdx] = rewritten.endsWith('\n') ? rewritten : rewritten + '\n\n';
            console.log(`    → Rewritten. Re-scoring...`);
          } else {
            console.log(`    → Regen call failed. Prompt ${s.n} will be marked REJECTED in saved file.`);
          }
        }

        result = sections.join('');

        // Re-score the updated result
        const reScored = await scorePrompts(result);
        if (reScored?.scores?.length) {
          scoreData = reScored;
          rejected = reScored.scores.filter(s => s.score < 5);
        } else {
          break; // re-score failed; keep what we have
        }
      }

      if (rejected.length > 0 && regenRound >= MAX_REGEN_ATTEMPTS) {
        console.log(`\n  ${rejected.length} prompt(s) still below threshold after ${MAX_REGEN_ATTEMPTS} regen attempts — marked REJECTED in saved file. Fix manually.`);
      }

      // Print final gate summary
      const scores = scoreData.scores;
      let passCount = 0, flagCount = 0, rejectCount = 0;
      console.log('\n┌─ Quality Gate Results ───────────────────────────────────────┐');
      for (const s of scores) {
        const status = s.score >= 7 ? 'PASS' : s.score >= 5 ? 'FLAG' : 'FAIL';
        const failNote = s.fail ? ` — ${s.fail}` : '';
        console.log(`│ Prompt ${String(s.n).padEnd(2)}  ${status.padEnd(4)}  ${String(s.score).padEnd(5)}${failNote}`);
        if (s.score >= 7) passCount++;
        else if (s.score >= 5) flagCount++;
        else rejectCount++;
      }
      console.log(`└─ ${passCount} pass · ${flagCount} flagged · ${rejectCount} rejected ──────────────────────────┘\n`);
    }
  } else {
    console.log('\n  Quality gate skipped — GROQ_API_KEY not set.');
  }

  // Save if requested
  if (SAVE) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const dateStr = today.toISOString().slice(0, 10);
    const filename = `prompts-${dateStr}.md`;
    const filepath = path.join(OUTPUT_DIR, filename);

    // Annotate with scores if gate ran
    const finalResult = scoreData?.scores?.length ? annotateWithScores(result, scoreData.scores) : result;

    // Build score summary for file header
    let scoreSummary = '';
    if (scoreData?.scores?.length) {
      const pass = scoreData.scores.filter(s => s.score >= 7).length;
      const flag = scoreData.scores.filter(s => s.score >= 5 && s.score < 7).length;
      const fail = scoreData.scores.filter(s => s.score < 5).length;
      const avg = (scoreData.scores.reduce((sum, s) => sum + s.score, 0) / scoreData.scores.length).toFixed(1);
      scoreSummary = `\n# Quality Gate: avg ${avg}/10 · ${pass} pass · ${flag} flagged · ${fail} rejected`;
    }

    let carouselNotice = '';
    if (carouselPlan) {
      const fmtLabels = { 'activity-collection': 'CAROUSEL DAY', facts: 'FACTS CAROUSEL DAY', progression: 'PROGRESSION CAROUSEL DAY' };
      const label = fmtLabels[carouselPlan.format] || 'CAROUSEL DAY';
      carouselNotice = `\n# ${label} — Drop images into: ${carouselPlan.suggestedFolder}/\n`;
    }
    const header = `# Image Prompts — ${dateStr}\n# Rotation: ${mix.label}\n# Generated: ${today.toISOString()}${scoreSummary}${carouselNotice}\n\n`;

    let footer = '';
    if (carouselPlan) {
      if (carouselPlan.format === 'facts') {
        footer = buildFactsCarouselFooter(carouselPlan);
      } else if (carouselPlan.format === 'progression') {
        footer = buildProgressCarouselFooter(carouselPlan);
      } else {
        // Format 1: activity-collection
        footer = `\n\n---\n## CAROUSEL DAY — Image Drop Instructions\n\n` +
          `Today's 5 activity images form a carousel (swipeable album on Instagram + TikTok).\n\n` +
          `**Create this folder and drop all 5 activity images into it:**\n\n` +
          `\`\`\`\n${carouselPlan.suggestedFolder}/\n\`\`\`\n\n` +
          `Name the files so they sort alphabetically in the right order:\n` +
          `\`\`\`\n` +
          carouselPlan.slides.map(s => `01-${s.theme.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png  ← slide ${s.slideIndex} (${s.theme})`).join('\n') +
          `\n\`\`\`\n\n` +
          `import:raw auto-detects the \`carousel-*\` folder name and builds the carousel queue file. **No sidecar JSONs needed.**\n\n` +
          `The inspiration slot images (slots 1-5) go into their normal category subfolders as usual.\n`;
      }
    }

    await fs.writeFile(filepath, header + finalResult + footer, 'utf-8');
    console.log(`\nSaved to: ${filepath}`);

    // Write carousel plan JSON for reference
    if (carouselPlan) {
      const planPath = path.join(OUTPUT_DIR, `carousel-plan-${dateStr}.json`);
      await fs.writeFile(planPath, JSON.stringify(carouselPlan, null, 2));
      console.log(`Carousel plan saved to: ${planPath}`);
    }
  }

  console.log('\n✅ Copy the prompts above into ChatGPT or Gemini image generation.');
  if (carouselPlan) {
    const fmtLabels = { 'activity-collection': 'CAROUSEL DAY', facts: 'FACTS CAROUSEL DAY', progression: 'PROGRESSION CAROUSEL DAY' };
    console.log(`${fmtLabels[carouselPlan.format] || 'CAROUSEL DAY'}: Drop images into ${carouselPlan.suggestedFolder}/`);
    console.log('Name files 01-xxx.png, 02-xxx.png etc. for correct slide order.');
  }
  console.log('Save generated images to output/raw/ then run: npm run import:raw\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

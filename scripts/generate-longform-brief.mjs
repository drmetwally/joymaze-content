#!/usr/bin/env node

/**
 * generate-longform-brief.mjs — Long-form episode planner
 *
 * Creates a complete episode.json brief for the LongFormEpisode Remotion composition.
 * Pairs a Joyo story with 4 matching activity briefs to form an 8-minute video.
 *
 * Usage:
 *   node scripts/generate-longform-brief.mjs
 *   node scripts/generate-longform-brief.mjs --story ep02-the-little-dragon-who-saved-the-reef
 *   node scripts/generate-longform-brief.mjs --format asmr-pack
 *   node scripts/generate-longform-brief.mjs --format challenge-ladder --theme ocean
 *
 * Output: output/longform/ep{N}-{slug}/episode.json
 *
 * Next steps after running:
 *   1. Generate story images in Gemini → output/stories/{story-folder}/01.png...08.png
 *   2. Generate each activity image pair in Gemini → output/asmr/{folder}/blank.png + solved.png
 *   3. Run extract scripts for maze/wordsearch/dotdot activities (same as ASMR workflow)
 *   4. npm run render:longform -- --episode ep{N}-{slug}
 */

import 'dotenv/config';
import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const STORIES_DIR = path.join(OUTPUT_DIR, 'stories');
const ASMR_DIR    = path.join(OUTPUT_DIR, 'asmr');
const LONGFORM_DIR = path.join(OUTPUT_DIR, 'longform');

const args = process.argv.slice(2);
const storyArg   = args[args.indexOf('--story')   + 1] || null;
const formatArg  = args[args.indexOf('--format')  + 1] || 'adventure-activities';
const themeArg   = args[args.indexOf('--theme')   + 1] || null;

// Activity type rotation for long-form episodes
const ACTIVITY_SEQUENCE = ['maze', 'wordsearch', 'dotdot', 'coloring'];

// Theme → activities mapping (thematic consistency with the story)
const THEME_ACTIVITIES = {
  ocean:       ['maze', 'wordsearch', 'dotdot', 'coloring'],
  forest:      ['maze', 'dotdot', 'wordsearch', 'coloring'],
  adventure:   ['maze', 'wordsearch', 'dotdot', 'coloring'],
  space:       ['dotdot', 'maze', 'wordsearch', 'coloring'],
  animals:     ['maze', 'dotdot', 'coloring', 'wordsearch'],
  seasons:     ['coloring', 'wordsearch', 'dotdot', 'maze'],
  default:     ACTIVITY_SEQUENCE,
};

/** Find the next episode number by scanning output/longform/ */
async function getNextEpisodeNumber() {
  try {
    const dirs = await fs.readdir(LONGFORM_DIR);
    const epNums = dirs
      .map(d => {
        const m = d.match(/^ep(\d+)-/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(n => n > 0);
    return epNums.length > 0 ? Math.max(...epNums) + 1 : 1;
  } catch { return 1; }
}

/** Find the most recent story folder in output/stories/ */
async function findLatestStoryFolder() {
  try {
    const dirs = (await fs.readdir(STORIES_DIR))
      .filter(d => d.startsWith('ep'));
    if (!dirs.length) return null;
    // Sort by episode number descending
    dirs.sort((a, b) => {
      const na = parseInt(a.match(/ep(\d+)/)?.[1] || '0', 10);
      const nb = parseInt(b.match(/ep(\d+)/)?.[1] || '0', 10);
      return nb - na;
    });
    return dirs[0];
  } catch { return null; }
}

/** Load story.json from a story folder */
async function loadStory(folder) {
  const storyPath = path.join(STORIES_DIR, folder, 'story.json');
  try {
    return JSON.parse(await fs.readFile(storyPath, 'utf-8'));
  } catch { return null; }
}

/** Build activity entries for the episode */
function buildActivities(theme, activities) {
  const typeSeq = THEME_ACTIVITIES[theme] || THEME_ACTIVITIES.default;

  const LABEL_MAP = {
    maze:       'Find the hidden path',
    wordsearch: 'Spot the hidden words',
    dotdot:     'Connect the dots',
    coloring:   'Bring it to life',
    tracing:    'Trace the path',
  };

  const HOOK_MAP = {
    maze:       'Watch the path appear...',
    wordsearch: 'Watch the words reveal...',
    dotdot:     'Watch the picture emerge...',
    coloring:   'Watch it come to life...',
    tracing:    'Trace along...',
  };

  return (activities || typeSeq).slice(0, 4).map((type, i) => ({
    type,
    folder: '',            // user fills in after generating images
    label:  LABEL_MAP[type] || `Activity ${i + 1}`,
    hookText: HOOK_MAP[type] || '',
    pathWaypoints: null,   // populated by extract:path after maze image generated
    pathColor: '#22BB44',
    wordRects: null,       // populated by extract:wordsearch
    highlightColor: '#FFD700',
    dotWaypoints: null,    // populated by extract:dotdot
    dotColor: '#FF6B35',
  }));
}

/** Build storySlides from story.json slides */
function buildStorySlides(story, storyFolder) {
  if (!story?.slides) return [];
  return story.slides.slice(0, 8).map((slide, i) => ({
    imagePath: `output/stories/${storyFolder}/${String(i + 1).padStart(2, '0')}.png`,
    captionText: slide.narration || slide.caption || '',
  }));
}

/** Slugify a title for folder naming */
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

async function main() {
  await fs.mkdir(LONGFORM_DIR, { recursive: true });

  const epNum = await getNextEpisodeNumber();
  console.log(`\n  Long-Form Episode Planner`);
  console.log(`  Format: ${formatArg} | Episode: ${epNum}\n`);

  // ── Locate story ──────────────────────────────────────────────────────────
  let storyFolder = storyArg;
  let story = null;

  if (!storyFolder) {
    storyFolder = await findLatestStoryFolder();
    if (storyFolder) {
      console.log(`  Using latest story: ${storyFolder}`);
    } else {
      console.log(`  No story found in output/stories/ — run npm run generate:story:idea first`);
      console.log(`  Generating placeholder episode.json with empty story slots.\n`);
    }
  }

  if (storyFolder) {
    story = await loadStory(storyFolder);
    if (!story) {
      console.log(`  Warning: ${storyFolder}/story.json not found — story slides will be empty`);
    }
  }

  // ── Derive theme ──────────────────────────────────────────────────────────
  const theme = themeArg
    || story?.theme?.toLowerCase().split(/[/\s,]/)[0]
    || 'adventure';

  const title = story?.title || `JoyMaze Adventure Episode ${epNum}`;
  const slug  = `ep${String(epNum).padStart(2, '0')}-${slugify(title)}`;

  // ── Build activities ──────────────────────────────────────────────────────
  const activities = buildActivities(theme, null);

  // ── Build story slides ────────────────────────────────────────────────────
  const storySlides = story ? buildStorySlides(story, storyFolder) : [];

  // ── Compose episode.json ──────────────────────────────────────────────────
  const episode = {
    title,
    episodeNumber: epNum,
    theme,
    format: formatArg,
    hookText:        `${story?.slides?.[0]?.narration?.slice(0, 60) || title}`,
    nextEpisodeHint: '',

    storyFolder: storyFolder || '',
    storySlides,

    activities,

    musicPath:   'assets/audio/Twinkle - The Grey Room _ Density & Time.mp3',
    musicVolume: 0.3,

    // Segment timing (seconds) — adjust for pacing
    introSec:      20,
    storySlideSec: 15,
    transitionSec:  5,
    labelSec:       6,
    revealSec:     55,
    celebrateSec:   9,
    outroSec:      30,
  };

  // Estimate total duration
  const totalSec = episode.introSec
    + storySlides.length * episode.storySlideSec
    + (storySlides.length > 0 ? episode.transitionSec : 0)
    + activities.length * (episode.labelSec + episode.revealSec + episode.celebrateSec)
    + episode.outroSec;
  const totalMin = (totalSec / 60).toFixed(1);

  // ── Write output ──────────────────────────────────────────────────────────
  const outDir = path.join(LONGFORM_DIR, slug);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'episode.json');
  await fs.writeFile(outPath, JSON.stringify(episode, null, 2));

  console.log(`  Saved: output/longform/${slug}/episode.json`);
  console.log(`  Estimated duration: ~${totalMin} min`);
  console.log(`  Story slides: ${storySlides.length} (${storyFolder || 'none'})`);
  console.log(`  Activities: ${activities.map(a => a.type).join(' → ')}\n`);

  console.log('  ── Next Steps ─────────────────────────────────────────────');
  if (storySlides.length > 0) {
    console.log(`  1. Story images: generate 01.png–${String(storySlides.length).padStart(2,'0')}.png in Gemini`);
    console.log(`     from: output/stories/${storyFolder}/image-prompts.md`);
    console.log(`     save to: output/stories/${storyFolder}/`);
  } else {
    console.log('  1. Generate a story: npm run generate:story:idea');
  }
  console.log('');
  activities.forEach((act, i) => {
    const asmrSlug = `${act.type}-${theme}-ep${epNum}-${i + 1}`;
    console.log(`  ${i + 2}. ${act.type.toUpperCase()} activity: npm run brief:asmr:${act.type}`);
    console.log(`     → generates: output/asmr/${asmrSlug}/brief.md`);
    console.log(`     → edit episode.json activities[${i}].folder = "output/asmr/${asmrSlug}"`);
    if (['maze', 'wordsearch', 'dotdot'].includes(act.type)) {
      console.log(`     → after images: npm run extract:${act.type === 'maze' ? 'path' : act.type} -- --asmr output/asmr/${asmrSlug}/`);
    }
    console.log('');
  });
  console.log(`  Final: npm run render:longform -- --episode ${slug}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });

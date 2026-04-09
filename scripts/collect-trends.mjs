#!/usr/bin/env node

/**
 * JoyMaze Trend Signal Collector
 *
 * Collects weekly trend signals from Google Trends + a rich seasonal calendar.
 * Writes config/trends-this-week.json — consumed by generate-prompts.mjs to
 * inject trending themes, rising searches, and upcoming moments into prompt generation.
 *
 * Sources (in priority order):
 *   1. Google Trends — rising related queries for our target keywords (best-effort, may fail)
 *   2. Seasonal calendar — school breaks, holidays, national days, parenting moments
 *
 * Usage:
 *   node scripts/collect-trends.mjs           # Full run — writes config/trends-this-week.json
 *   node scripts/collect-trends.mjs --dry-run # Preview output, no file write
 *   npm run trends                            # Alias for above
 */

import { createRequire } from 'module';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const googleTrends = require('google-trends-api');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT, 'config', 'trends-this-week.json');

const DRY_RUN = process.argv.includes('--dry-run');
const MONDAY_ONLY = process.argv.includes('--monday-only');

// ── Target keywords to monitor on Google Trends ──
// These are what parents actually search when looking for our content.
const TARGET_KEYWORDS = [
  'printable activities for kids',
  'screen-free activities for kids',
  'coloring pages for kids',
  'printable maze for kids',
  'quiet time activities for kids',
  'kids word search printable',
  'printable puzzles for kids',
  'kids dot to dot printable',
];

// ── JoyMaze theme pool — used for scoring and mapping ──
// Theme names MUST match THEME_POOL in generate-prompts.mjs exactly (normalized, no slashes).
const THEME_MAP = [
  // Seasonal / holiday (high-traffic bursts)
  { theme: 'Easter',                  keywords: ['easter', 'easter egg', 'easter bunny', 'easter printable'] },
  { theme: 'Spring Flowers',          keywords: ['spring flowers', 'spring garden', 'planting', 'tulips', 'spring'] },
  { theme: 'Garden and Flowers',      keywords: ['garden', 'flowers', 'gardening', 'flower printable'] },
  { theme: 'Snowy Winter',            keywords: ['snow', 'winter', 'snowflake', 'snowman', 'blizzard'] },
  { theme: 'Autumn Leaves',           keywords: ['autumn', 'fall leaves', 'halloween', 'pumpkin', 'harvest'] },
  { theme: 'Holidays and Celebrations', keywords: ['christmas', 'hanukkah', 'holiday', 'new year', 'celebration'] },
  { theme: 'Birthday Party',          keywords: ['birthday', 'party', 'cake', 'balloons', 'celebration'] },
  // Nature & animals
  { theme: 'Ocean Animals',           keywords: ['ocean', 'underwater', 'sea animals', 'fish', 'dolphin', 'whale', 'shark'] },
  { theme: 'Space and Planets',       keywords: ['space', 'planets', 'astronaut', 'stars', 'rocket', 'moon', 'galaxy'] },
  { theme: 'Dinosaurs',               keywords: ['dinosaur', 'dino', 't-rex', 'prehistoric', 'triceratops'] },
  { theme: 'Forest Animals',          keywords: ['forest', 'woodland', 'fox', 'deer', 'owl', 'woodland animals'] },
  { theme: 'Safari and Jungle',       keywords: ['safari', 'jungle', 'lion', 'elephant', 'giraffe', 'tiger', 'animals'] },
  { theme: 'Farm Animals',            keywords: ['farm', 'farm animals', 'cow', 'pig', 'horse', 'chicken', 'barn'] },
  { theme: 'Bugs and Insects',        keywords: ['bugs', 'insects', 'butterfly', 'bee', 'ladybug', 'caterpillar', 'ant'] },
  { theme: 'Arctic Animals',          keywords: ['arctic', 'polar bear', 'penguin', 'ice', 'polar', 'seal'] },
  { theme: 'Birds',                   keywords: ['birds', 'parrot', 'eagle', 'owl', 'flamingo', 'flying bird'] },
  { theme: 'Desert Animals',          keywords: ['desert', 'camel', 'cactus', 'lizard', 'scorpion'] },
  { theme: 'Pets and Cats',           keywords: ['cats', 'kitten', 'pet cat', 'tabby', 'feline'] },
  { theme: 'Dogs and Puppies',        keywords: ['dogs', 'puppy', 'dog', 'labrador', 'golden retriever'] },
  { theme: 'Baby Animals',            keywords: ['baby animals', 'chicks', 'lambs', 'foal', 'fawn', 'cubs'] },
  { theme: 'Butterflies',             keywords: ['butterfly', 'butterflies', 'caterpillar to butterfly', 'monarch'] },
  { theme: 'Sea Turtles',             keywords: ['sea turtle', 'turtle', 'tortoise', 'ocean turtle'] },
  { theme: 'Under the Sea',           keywords: ['underwater cave', 'coral reef', 'deep sea', 'scuba', 'jellyfish'] },
  // Fantasy & adventure
  { theme: 'Pirates and Treasure',    keywords: ['pirates', 'treasure', 'pirate ship', 'treasure hunt', 'pirate map'] },
  { theme: 'Fairy Tale Castle',       keywords: ['fairy tale', 'castle', 'princess', 'knight', 'fairy'] },
  { theme: 'Dragons and Fantasy',     keywords: ['dragon', 'fantasy', 'magic', 'mythical', 'sorcerer'] },
  { theme: 'Superheroes',             keywords: ['superheroes', 'superhero', 'cape', 'powers', 'hero'] },
  { theme: 'Mermaids',                keywords: ['mermaid', 'mermaids', 'under the sea', 'ocean princess'] },
  { theme: 'Unicorns',                keywords: ['unicorn', 'unicorns', 'rainbow horse', 'magical horse'] },
  { theme: 'Wizards and Magic',       keywords: ['wizard', 'magic', 'spell', 'wand', 'potion', 'witch'] },
  { theme: 'Knights and Armor',       keywords: ['knight', 'armor', 'sword', 'shield', 'medieval'] },
  // Transport & tech
  { theme: 'Vehicles and Trains',     keywords: ['cars', 'trucks', 'vehicles', 'trains', 'transport', 'bus'] },
  { theme: 'Rockets and Spaceships',  keywords: ['rocket', 'spaceship', 'nasa', 'space shuttle', 'launch'] },
  { theme: 'Robots and Technology',   keywords: ['robots', 'technology', 'gadgets', 'science', 'invention', 'AI'] },
  { theme: 'Fire Trucks',             keywords: ['fire truck', 'firefighter', 'fire engine', 'fire station'] },
  { theme: 'Airplanes',               keywords: ['airplane', 'planes', 'aviation', 'pilot', 'airport'] },
  { theme: 'Submarines',              keywords: ['submarine', 'sub', 'underwater vessel', 'navy'] },
  // Everyday & food
  { theme: 'Food and Cooking',        keywords: ['food', 'cooking', 'baking', 'fruits', 'vegetables', 'kitchen'] },
  { theme: 'Bakery and Pastries',     keywords: ['bakery', 'pastries', 'cake', 'cupcake', 'bread', 'cookie'] },
  { theme: 'Snack Time',              keywords: ['snacks', 'fruit', 'healthy food', 'lunchbox', 'snack ideas'] },
  // Outdoor & adventure
  { theme: 'Camping Outdoors',        keywords: ['camping', 'outdoors', 'hiking', 'tent', 'campfire', 'nature'] },
  { theme: 'Sports and Games',        keywords: ['sports', 'soccer', 'football', 'baseball', 'basketball', 'games'] },
  { theme: 'Safari Adventure',        keywords: ['safari adventure', 'game reserve', 'wildlife watch', 'binoculars'] },
  { theme: 'Jungle Explorer',         keywords: ['jungle explorer', 'rainforest', 'vine', 'explorer', 'tropical'] },
  { theme: 'Volcano Island',          keywords: ['volcano', 'lava', 'island', 'eruption', 'tropical island'] },
  // Weather & seasons
  { theme: 'Weather and Seasons',     keywords: ['weather', 'rain', 'rainbow', 'seasons', 'sun', 'cloud'] },
  { theme: 'Rainy Day Indoors',       keywords: ['rainy day', 'indoor activities', 'stuck inside', 'puddles', 'umbrella'] },
  // Learning & creative
  { theme: 'Music Instruments',       keywords: ['music', 'instruments', 'guitar', 'piano', 'musical', 'drum'] },
  { theme: 'Numbers and Math',        keywords: ['numbers', 'math', 'counting', 'arithmetic', 'shapes'] },
  { theme: 'Alphabet Letters',        keywords: ['alphabet', 'letters', 'abc', 'reading', 'writing', 'phonics'] },
  { theme: 'Colors and Shapes',       keywords: ['colors', 'shapes', 'rainbow colors', 'geometry', 'patterns'] },
  { theme: 'Science Experiments',     keywords: ['science', 'experiment', 'chemistry', 'lab', 'discovery'] },
  { theme: 'Maps and Geography',      keywords: ['maps', 'geography', 'globe', 'world map', 'countries'] },
  { theme: 'Ancient Egypt',           keywords: ['egypt', 'pyramid', 'pharaoh', 'mummy', 'hieroglyphs', 'sphinx'] },
  // Fun & quirky
  { theme: 'Circus and Carnival',     keywords: ['circus', 'carnival', 'clown', 'acrobat', 'big top', 'fair'] },
  { theme: 'Candy Land',              keywords: ['candy', 'lollipop', 'sweets', 'gingerbread', 'sugar'] },
  { theme: 'Rainbow World',           keywords: ['rainbow', 'colorful', 'kaleidoscope', 'vibrant colors'] },
  { theme: 'Funny Monsters',          keywords: ['monsters', 'funny monsters', 'silly creatures', 'friendly monster'] },
  { theme: 'Toy Workshop',            keywords: ['toys', 'toy store', 'toy workshop', 'santa workshop', 'elves'] },
  { theme: 'Treasure Map',            keywords: ['treasure map', 'x marks the spot', 'buried treasure', 'map adventure'] },
  { theme: 'Underwater Cave',         keywords: ['underwater cave', 'dark cave', 'cave exploration', 'spelunking'] },
];

// ── Seasonal calendar ──
// Every parenting-relevant moment in the year. Days away drives urgency scoring.
// Easter is computed dynamically (see computeEaster).

function computeEaster(year) {
  // Meeus/Jones/Butcher algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// US school break windows — approximate, covers most school districts
function getSchoolBreaks(year) {
  const easter = computeEaster(year);
  const easterMs = easter.getTime();
  return [
    {
      event: 'Winter Break',
      start: new Date(year, 11, 22), // Dec 22
      end: new Date(year + 1, 0, 5),  // Jan 5
      themes: ['Christmas', 'Winter', 'Holiday', 'New Year'],
      keywords: ['christmas coloring pages', 'winter break activities', 'holiday printables'],
    },
    {
      event: 'Spring Break',
      start: new Date(easterMs - 7 * 86400000), // week before Easter
      end: new Date(easterMs + 7 * 86400000),   // week after Easter
      themes: ['Spring', 'Easter', 'Spring Animals', 'Garden/Flowers'],
      keywords: ['spring break activities for kids', 'easter printables', 'spring printables'],
    },
    {
      event: 'Summer Break',
      start: new Date(year, 5, 8),  // Jun 8
      end: new Date(year, 8, 2),    // Sep 2
      themes: ['Summer', 'Beach', 'Camping/Outdoors', 'Vehicles/Transport'],
      keywords: ['summer activities for kids', 'summer printables', 'boredom busters for kids'],
    },
    {
      event: 'Thanksgiving Break',
      start: new Date(year, 10, 25), // ~Nov 25
      end: new Date(year, 10, 29),
      themes: ['Farm Animals', 'Food/Cooking', 'Camping/Outdoors'],
      keywords: ['thanksgiving activities for kids', 'fall printables'],
    },
  ];
}

function getFixedMoments(year) {
  return [
    // January
    { date: new Date(year, 0, 1),  event: "New Year's Day",       themes: ['Weather/Seasons', 'Arctic/Polar'],     keywords: ['new year activities for kids', 'winter printables'] },
    { date: new Date(year, 0, 29), event: 'National Puzzle Day',  themes: ['Robots/Technology', 'Space/Planets'],  keywords: ['puzzle day for kids', 'printable puzzles for kids'] },
    // February
    { date: new Date(year, 1, 14), event: "Valentine's Day",      themes: ['Pets/Home', 'Birds/Sky'],              keywords: ['valentine printables for kids', 'heart coloring pages'] },
    // March
    { date: new Date(year, 2, 14), event: 'Pi Day',               themes: ['Robots/Technology', 'Space/Planets'],  keywords: ['math activities for kids', 'stem printables'] },
    { date: new Date(year, 2, 17), event: "St. Patrick's Day",    themes: ['Forest/Woodland', 'Weather/Seasons'],  keywords: ['st patricks day printables', 'rainbow coloring pages'] },
    { date: new Date(year, 2, 20), event: 'First Day of Spring',  themes: ['Spring Animals', 'Garden/Flowers', 'Bugs/Insects'], keywords: ['spring printables for kids', 'spring coloring pages'] },
    // April
    { date: computeEaster(year),   event: 'Easter Sunday',        themes: ['Easter', 'Spring Animals', 'Garden/Flowers'], keywords: ['easter printables for kids', 'easter coloring pages', 'easter activities'] },
    { date: new Date(year, 3, 22), event: 'Earth Day',            themes: ['Garden/Flowers', 'Ocean/Underwater', 'Forest/Woodland', 'Bugs/Insects'], keywords: ['earth day activities for kids', 'nature printables', 'recycling activities'] },
    // May
    { date: new Date(year, 4, 11), event: "Mother's Day",         themes: ['Pets/Home', 'Garden/Flowers', 'Birds/Sky'], keywords: ['mothers day printables', 'mothers day activities for kids'] },
    { date: new Date(year, 4, 26), event: 'Memorial Day',         themes: ['Camping/Outdoors', 'Sports/Games'],    keywords: ['memorial day activities for kids'] },
    // June
    { date: new Date(year, 5, 15), event: "Father's Day",         themes: ['Sports/Games', 'Camping/Outdoors', 'Vehicles/Transport'], keywords: ['fathers day activities for kids', 'fathers day printables'] },
    { date: new Date(year, 5, 21), event: 'First Day of Summer',  themes: ['Ocean/Underwater', 'Camping/Outdoors', 'Vehicles/Transport'], keywords: ['summer activities for kids', 'summer printables'] },
    // July
    { date: new Date(year, 6, 4),  event: 'Independence Day',     themes: ['Superheroes', 'Weather/Seasons'],      keywords: ['4th of july printables', 'independence day activities kids'] },
    // August
    { date: new Date(year, 7, 8),  event: 'Back to School Season', themes: ['Robots/Technology', 'Music/Instruments', 'Sports/Games'], keywords: ['back to school activities', 'first day of school printables'] },
    // September
    { date: new Date(year, 8, 22), event: 'First Day of Fall',    themes: ['Forest/Woodland', 'Farm Animals', 'Weather/Seasons'], keywords: ['fall activities for kids', 'autumn coloring pages'] },
    // October
    { date: new Date(year, 9, 2),  event: 'National Coloring Book Day', themes: ['Fairy Tale/Castle', 'Dragons/Fantasy', 'Superheroes'], keywords: ['coloring pages for kids', 'free coloring pages printable'] },
    { date: new Date(year, 9, 31), event: 'Halloween',            themes: ['Dragons/Fantasy', 'Fairy Tale/Castle', 'Bugs/Insects'], keywords: ['halloween coloring pages', 'halloween printables for kids', 'halloween maze'] },
    // November
    { date: new Date(year, 10, 27), event: 'Thanksgiving',        themes: ['Farm Animals', 'Food/Cooking', 'Forest/Woodland'], keywords: ['thanksgiving activities for kids', 'gratitude printables'] },
    // December
    { date: new Date(year, 11, 21), event: 'First Day of Winter', themes: ['Arctic/Polar', 'Weather/Seasons'],     keywords: ['winter printables for kids', 'winter coloring pages'] },
    { date: new Date(year, 11, 25), event: 'Christmas',           themes: ['Arctic/Polar', 'Pets/Home', 'Forest/Woodland'], keywords: ['christmas coloring pages', 'christmas printables for kids', 'christmas maze'] },
  ];
}

// ── Get upcoming moments within a lookahead window ──
function getUpcomingMoments(today, lookaheadDays = 30) {
  const year = today.getFullYear();
  const todayMs = today.setHours(0, 0, 0, 0);

  const fixed = getFixedMoments(year);
  // Also check next year for Dec/Jan wraparound
  const fixedNext = getFixedMoments(year + 1);
  const breaks = getSchoolBreaks(year);

  const upcoming = [];

  for (const m of [...fixed, ...fixedNext]) {
    const daysAway = Math.round((m.date.getTime() - todayMs) / 86400000);
    if (daysAway >= -2 && daysAway <= lookaheadDays) { // -2 = still relevant on the day + day after
      upcoming.push({ event: m.event, date: m.date.toISOString().slice(0, 10), days_away: daysAway, themes: m.themes, keywords: m.keywords });
    }
  }

  for (const b of breaks) {
    const startDays = Math.round((b.start.getTime() - todayMs) / 86400000);
    const endDays = Math.round((b.end.getTime() - todayMs) / 86400000);
    // Active break or starting within lookahead
    if (endDays >= 0 && startDays <= lookaheadDays) {
      const daysAway = startDays < 0 ? 0 : startDays; // already in break = 0
      upcoming.push({ event: b.event, date: b.start.toISOString().slice(0, 10), days_away: daysAway, themes: b.themes, keywords: b.keywords, is_break: true });
    }
  }

  return upcoming.sort((a, b) => a.days_away - b.days_away);
}

// ── Map a query string to a JoyMaze theme ──
function queryToTheme(query) {
  const q = query.toLowerCase();
  for (const entry of THEME_MAP) {
    if (entry.keywords.some(k => q.includes(k))) return entry.theme;
  }
  return null;
}

// ── Fetch Google Trends rising queries for our keywords ──
async function fetchGoogleTrends(keywords) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const risingQueries = [];
  const themeScores = {};

  for (const keyword of keywords) {
    try {
      const raw = await googleTrends.relatedQueries({
        keyword,
        startTime: sevenDaysAgo,
        geo: 'US',
      });
      const data = JSON.parse(raw);
      const rising = data?.default?.rankedList?.[1]?.rankedKeyword || []; // index 1 = rising (not top)

      for (const item of rising.slice(0, 10)) {
        const query = item.query.toLowerCase();
        risingQueries.push({ query, value: item.value });

        // Map to internal theme
        const theme = queryToTheme(query);
        if (theme) {
          themeScores[theme] = (themeScores[theme] || 0) + Math.min(item.value, 100);
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      // Silently skip individual keyword failures — partial data is fine
    }
  }

  return { risingQueries, themeScores };
}

// ── Build the trend signal output ──
function buildOutput(today, upcomingMoments, googleData) {
  const themeScores = { ...(googleData?.themeScores || {}) };

  // Boost themes from upcoming moments based on urgency
  for (const moment of upcomingMoments) {
    const urgencyBoost = moment.days_away <= 7 ? 150 : moment.days_away <= 14 ? 80 : 30;
    for (const theme of (moment.themes || [])) {
      themeScores[theme] = (themeScores[theme] || 0) + urgencyBoost;
    }
  }

  // Rank themes by score
  const rankedThemes = Object.entries(themeScores)
    .map(([theme, score]) => ({ theme, score }))
    .sort((a, b) => b.score - a.score);

  // Rising searches — combine Google Trends queries with upcoming moment keywords
  const risingSearches = [];
  if (googleData?.risingQueries) {
    for (const { query } of googleData.risingQueries.slice(0, 8)) {
      if (!risingSearches.includes(query)) risingSearches.push(query);
    }
  }
  for (const moment of upcomingMoments.slice(0, 3)) {
    for (const kw of (moment.keywords || []).slice(0, 2)) {
      if (!risingSearches.includes(kw)) risingSearches.push(kw);
    }
  }

  // Caption keywords — top Pinterest SEO terms + trending moment keywords
  const captionKeywords = ['screen-free', 'printable', 'quiet time', 'ages 4-8'];
  for (const moment of upcomingMoments.slice(0, 2)) {
    const kw = moment.keywords?.[0];
    if (kw && !captionKeywords.includes(kw)) captionKeywords.push(kw);
  }

  const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const validUntil = localDate(new Date(today.getTime() + 7 * 86400000));
  const sources = [];
  if (googleData?.risingQueries?.length > 0) sources.push('google_trends');
  sources.push('seasonal_calendar');

  return {
    generated: localDate(today),
    valid_until: validUntil,
    sources,
    trending_themes: rankedThemes.slice(0, 8),
    boost_themes: rankedThemes.slice(0, 5).map(t => t.theme),
    rising_searches: risingSearches.slice(0, 8),
    upcoming_moments: upcomingMoments.map(m => ({
      event: m.event,
      date: m.date,
      days_away: m.days_away,
      ...(m.is_break ? { is_break: true } : {}),
    })),
    caption_keywords: captionKeywords,
  };
}

// ── Main ──
async function main() {
  const today = new Date();

  if (MONDAY_ONLY && today.getDay() !== 1) {
    console.log(`📡 Trend collection skipped (runs Mondays only — today is ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][today.getDay()]}). Run npm run trends to force.`);
    return;
  }

  console.log('\n📡 JoyMaze Trend Signal Collector\n');
  console.log(`Date: ${today.toDateString()}`);

  // Step 1 — Upcoming moments from seasonal calendar
  console.log('\nScanning seasonal calendar...');
  const upcomingMoments = getUpcomingMoments(today, 30);
  if (upcomingMoments.length > 0) {
    console.log(`  Found ${upcomingMoments.length} upcoming moments:`);
    for (const m of upcomingMoments.slice(0, 5)) {
      console.log(`  → ${m.event} (${m.days_away === 0 ? 'TODAY' : `in ${m.days_away} days`})`);
    }
  } else {
    console.log('  No major moments in next 30 days — seasonal-only mode.');
  }

  // Step 2 — Google Trends (best-effort)
  let googleData = null;
  console.log('\nFetching Google Trends rising queries...');
  try {
    googleData = await fetchGoogleTrends(TARGET_KEYWORDS);
    const count = googleData.risingQueries?.length || 0;
    const themeCount = Object.keys(googleData.themeScores || {}).length;
    console.log(`  ${count} rising queries found, mapped to ${themeCount} themes.`);
    if (count === 0) {
      console.log('  Google Trends returned empty data — using seasonal calendar only.');
      googleData = null;
    }
  } catch (err) {
    console.log(`  Google Trends unavailable (${err.message}) — using seasonal calendar only.`);
  }

  // Step 3 — Build output
  console.log('\nBuilding trend signals...');
  const output = buildOutput(today, upcomingMoments, googleData);

  console.log(`\n  Boost themes (top 5): ${output.boost_themes.join(', ')}`);
  console.log(`  Rising searches (top 3): ${output.rising_searches.slice(0, 3).join(', ')}`);
  console.log(`  Sources: ${output.sources.join(' + ')}`);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — trends-this-week.json (not written) ===');
    console.log(JSON.stringify(output, null, 2));
    console.log('\n[DRY RUN — no file written]');
    return;
  }

  // Step 4 — Write to config/
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ Written to: config/trends-this-week.json`);
  console.log('   Run npm run generate:prompts to use these signals in today\'s prompts.\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

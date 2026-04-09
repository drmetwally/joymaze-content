/**
 * JoyMaze — Vertex Track: Imagen 4.0 image generation from today's prompts
 *
 * SEPARATE TRACK — does not modify any existing pipeline files.
 * After generation, pick best images → copy to output/raw/ with keyword name → npm run import:raw
 *
 * Usage:
 *   node scripts/generate-images-vertex.mjs                    # Story prompts only (default)
 *   node scripts/generate-images-vertex.mjs --all              # All prompts (story + activity)
 *   node scripts/generate-images-vertex.mjs --activities-only  # Activity prompts only
 *   node scripts/generate-images-vertex.mjs --count 5          # 5 variants per prompt
 *   node scripts/generate-images-vertex.mjs --index 7          # Only prompt #7
 *   node scripts/generate-images-vertex.mjs --story-count 2    # 2 variants per story prompt
 *   node scripts/generate-images-vertex.mjs --date 2026-04-01
 *
 * NOTE: Activity prompts (mazes, word search, matching) produce unreliable results with ALL
 * image generators — they look maze-like but are not solvable. Use --all to include them,
 * but expect to discard most activity outputs. Story prompts are where Imagen excels.
 */

import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// --- Config ---
const API_KEY   = process.env.VERTEX_API_KEY || process.env.GOOGLE_AI_API_KEY;
const MODEL     = 'imagen-4.0-generate-001';
const BASE_URL  = 'https://generativelanguage.googleapis.com/v1beta';

const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
}

const COUNT         = parseInt(argVal('--count', '3'), 10);
const STORY_COUNT   = parseInt(argVal('--story-count', '1'), 10);
const ONLY_INDEX    = args.includes('--index') ? parseInt(argVal('--index', '0'), 10) : null;
const DATE          = argVal('--date', new Date().toISOString().slice(0, 10));
const INCLUDE_ALL   = args.includes('--all');
const ACTIVITIES_ONLY = args.includes('--activities-only');

const PROMPTS_FILE  = `output/prompts/prompts-${DATE}.md`;
const OUT_DIR       = `output/vertex-gen/${DATE}`;

if (!API_KEY) {
  console.error('ERROR: Set VERTEX_API_KEY in .env (or GOOGLE_AI_API_KEY as fallback)');
  process.exit(1);
}

// --- Prompt parser ---
function parsePromptsFile(text) {
  const prompts = [];
  const blocks = text.split(/(?=^#{1,4}\s*\d+\.\s|\n(?=\d+\. \*\*\[))/m).filter(b => b.trim());

  for (const block of blocks) {
    const indexMatch  = block.match(/(?:^#{1,4}\s*)?(\d+)\.\s/m);
    if (!indexMatch) continue;
    const index = parseInt(indexMatch[1], 10);

    const typeMatch   = block.match(/\*\*Type:\*\*\s*(.+)/);
    const promptMatch = block.match(/\*\*Image prompt:\*\*[ \t]*\n?([\s\S]+?)(?=\n\*\*Caption hook|\n---|\n#{1,4}\s*\d+\.|\n\d+\. \*\*|$)/);
    const headerMatch = block.match(/(?:#{1,4}\s*)?\d+\.\s+(.+)/m);

    if (!promptMatch) continue;

    prompts.push({
      index,
      header:      headerMatch?.[1]?.trim()  || `Prompt ${index}`,
      type:        typeMatch?.[1]?.trim()    || 'Unknown',
      imagePrompt: promptMatch[1].trim(),
    });
  }
  return prompts;
}

// --- Prompt cleaning for Imagen ---
// Imagen renders ALL text literally. Strip technical metadata that isn't visual description.
function cleanForImagen(prompt) {
  return prompt
    // Remove full sentences containing technical specs
    .replace(/Portrait orientation[^.]*\./gi, '')
    .replace(/Landscape orientation[^.]*\./gi, '')
    .replace(/Leave the bottom[^.]*\./gi, '')
    .replace(/The maze should be solvable[^.]*\./gi, '')
    .replace(/The maze should be designed for[^.]*,/gi, '')
    // Remove inline dimension references
    .replace(/\d+\s*[×x]\s*\d+\s*(px|pixels)?/gi, '')
    .replace(/\d+:\d+ aspect ratio/gi, '')
    .replace(/2:3 portrait/gi, '')
    .replace(/\([\s,]*\)/g, '')  // empty parentheses left over
    // Remove age references (can trigger safety filters too)
    .replace(/for a \d+-\d+ year old,?\s*/gi, '')
    .replace(/suitable for a \d+-\d+ year old[,.]?\s*/gi, '')
    // Clean up whitespace
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
}

// --- Child-safety rewrite for story prompts ---
async function rewriteForSafety(originalPrompt) {
  const url = `${BASE_URL}/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

  const body = {
    system_instruction: {
      parts: [{
        text: `You rewrite image generation prompts for Imagen, an AI image generator.
Imagen blocks prompts that depict children. Rewrite the prompt to tell the same emotional story using:
- Close-up of small hands on the activity
- Shadows, silhouettes, or POV shots (looking down at the desk/page)
- Environmental details (the desk, the scattered pencils, the light, the room)
- Implied presence (a half-eaten snack beside the page, small shoes visible under the table)

CRITICAL RULES:
- Do NOT mention any person's age, hair, face, body, gender, or physical description.
- Do NOT include any technical specs (dimensions, aspect ratios, pixel sizes, orientation).
- Do NOT include instructions about whitespace, watermarks, or empty areas.
- ONLY describe the visual scene — what the camera sees.
- Keep the activity, setting, lighting, art style, and emotional tone IDENTICAL.
- Return ONLY the rewritten prompt. No explanation, no quotes, no preamble.`,
      }],
    },
    contents: [{ role: 'user', parts: [{ text: originalPrompt }] }],
  };

  const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.error) throw new Error(`Gemini rewrite failed: ${data.error.message}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || originalPrompt;
}

// --- Regex fallback: basic child-safety transform when Gemini is unavailable ---
function fallbackSafetyRewrite(prompt) {
  return prompt
    // "A 6-year-old girl with curly brown hair and a big smile sits at..."
    // → "Small hands rest at..."
    .replace(/An?\s+\d+-year-old\s+(boy|girl|child|kid)\s+with\s+[^.]*?\s+(sits?|stands?|holds?|works?|kneels?)/gi,
             'Small hands')
    // "His/Her tongue pokes out" → remove
    .replace(/\b(his|her|he|she)\b\s+\w+/gi, '')
    // "the boy/girl/child is" → "the activity shows"
    .replace(/the\s+(boy|girl|child|kid|son|daughter)\s+(is|was)/gi, 'the scene shows')
    // Mother/father watching → remove observer
    .replace(/\.\s*(His|Her|The)\s+(mother|father|parent|mom|dad)\s+[^.]*\./gi, '.')
    // Clean up
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// --- Imagen 4.0 call ---
async function generateImage(promptText) {
  const url = `${BASE_URL}/models/${MODEL}:predict?key=${API_KEY}`;

  const body = {
    instances:  [{ prompt: promptText }],
    parameters: { sampleCount: 1 },
  };

  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const raw = await res.text();
  const data = JSON.parse(raw || '{}');

  if (data.error) throw new Error(`Imagen error ${data.error.code}: ${data.error.message}`);
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64)       throw new Error('Empty response (safety filter or unsupported content)');

  return Buffer.from(b64, 'base64');
}

// --- Slug helper ---
function makeSlug(header) {
  // Extract the meaningful part: "[STORY] Archetype 2 (pure-story)" → "story-arch2"
  const typeMatch = header.match(/\[(STORY|ACTIVITY)\]/i);
  const type = typeMatch ? typeMatch[1].toLowerCase() : 'item';

  if (type === 'activity') {
    // "[ACTIVITY] Maze Puzzle — easy..." → "maze"
    const actMatch = header.match(/\]\s*(.+?)(?:\s*[—-]|\s*\()/);
    const act = actMatch ? actMatch[1].trim().toLowerCase().replace(/\s+/g, '-').slice(0, 15) : 'activity';
    return `activity-${act}`;
  }
  // "[STORY] Archetype 2 (pure-story)" → "story-arch2"
  const archMatch = header.match(/Archetype\s*(\d+)/i);
  if (archMatch) return `story-arch${archMatch[1]}`;
  if (/pattern.?interrupt/i.test(header)) return 'story-pattern-interrupt';
  return `${type}-${header.replace(/[^a-z0-9]+/gi, '-').slice(0, 20).toLowerCase()}`;
}

// --- Main ---
async function main() {
  if (!fs.existsSync(PROMPTS_FILE)) {
    console.error(`Prompts file not found: ${PROMPTS_FILE}`);
    console.error('Run: npm run daily');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const text     = fs.readFileSync(PROMPTS_FILE, 'utf-8');
  let   prompts  = parsePromptsFile(text);

  // Filter by index
  if (ONLY_INDEX) prompts = prompts.filter(p => p.index === ONLY_INDEX);

  // Filter by type (default: stories only unless --all or --activities-only)
  if (!INCLUDE_ALL && !ONLY_INDEX) {
    if (ACTIVITIES_ONLY) {
      prompts = prompts.filter(p => p.type.toLowerCase() === 'activity');
    } else {
      prompts = prompts.filter(p => p.type.toLowerCase() !== 'activity');
    }
  }

  if (prompts.length === 0) {
    console.error(`No prompts found. Check --index, --all, or --activities-only flags.`);
    process.exit(1);
  }

  const storyCount    = prompts.filter(p => p.type.toLowerCase() !== 'activity').length;
  const activityCount = prompts.filter(p => p.type.toLowerCase() === 'activity').length;

  console.log(`\n=== JoyMaze Vertex Track — Imagen 4.0 ===`);
  console.log(`Date     : ${DATE}`);
  console.log(`Stories  : ${storyCount} (${STORY_COUNT} variant${STORY_COUNT > 1 ? 's' : ''} each)`);
  console.log(`Activities: ${activityCount} (${COUNT} variant${COUNT > 1 ? 's' : ''} each)`);
  console.log(`Output   : ${OUT_DIR}`);
  if (activityCount > 0) {
    console.log(`\n  NOTE: Activity prompts (mazes, word search) are hit-or-miss with`);
    console.log(`  image generators. Expect to discard unusable outputs.`);
  }
  console.log('');

  const transformLog = {};

  for (const p of prompts) {
    const isActivity = p.type.toLowerCase() === 'activity';
    const variants   = isActivity ? COUNT : STORY_COUNT;
    const slug       = makeSlug(p.header);
    const prefix     = `${String(p.index).padStart(2, '0')}-${slug}`;

    console.log(`[${p.index}] ${p.header}`);

    // Prepare the prompt for Imagen
    let activePrompt = p.imagePrompt;

    if (!isActivity) {
      // Story: just strip technical metadata (no safety rewrite — prompts include natural scene depictions)
      activePrompt = cleanForImagen(p.imagePrompt);
    } else {
      // Activity: just strip technical metadata
      activePrompt = cleanForImagen(p.imagePrompt);
    }

    transformLog[p.index] = {
      original: p.imagePrompt,
      cleaned:  activePrompt,
      type:     p.type,
    };

    console.log(`  Prompt: "${activePrompt.slice(0, 100)}..."`);

    // Generate variants
    for (let v = 1; v <= variants; v++) {
      const outFile = path.join(OUT_DIR, `${prefix}-v${v}.png`);
      process.stdout.write(`  v${v}... `);
      try {
        const imgBuf = await generateImage(activePrompt);
        fs.writeFileSync(outFile, imgBuf);
        console.log(`${(imgBuf.length / 1024).toFixed(0)} KB → ${path.basename(outFile)}`);
      } catch (err) {
        console.log(`FAILED: ${err.message}`);
      }
    }
    console.log('');
  }

  // Save transform log
  const logFile = path.join(OUT_DIR, '_prompt-transforms.json');
  fs.writeFileSync(logFile, JSON.stringify(transformLog, null, 2));

  console.log(`=== Done ===`);
  console.log(`Prompt log → ${logFile}`);
  console.log(`Review images in: ${OUT_DIR}`);
  console.log(`Pick best → rename with keyword (e.g. maze-ocean.png) → copy to output/raw/`);
  console.log(`Then: npm run import:raw && npm run generate:captions`);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });

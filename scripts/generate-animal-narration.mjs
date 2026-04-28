#!/usr/bin/env node

/**
 * generate-animal-narration.mjs
 * Generates narration copy + TTS audio for animal facts episodes.
 *
 * For each segment (habitat, diet, funFact):
 *   1. Groq writes polished 2-3 sentence narration copy, guided by:
 *      - config/writing-style.md (system prompt)
 *      - config/psychology-triggers.json (trigger HOW-to per segment)
 *      - config/content-intelligence.json (optional trending themes/hooks)
 *   2. OpenAI tts-1-hd / shimmer voice generates the WAV file
 *   3. episode.json updated with narration copy, file path, and durationSec
 *
 * Output files (dropped into episode folder):
 *   narration-habitat.wav  narration-diet.wav  narration-funfact.wav
 *
 * Usage:
 *   node scripts/generate-animal-narration.mjs --episode output/longform/animal/ep02-sea-otter
 *   node scripts/generate-animal-narration.mjs --episode output/longform/animal/ep02-sea-otter --tts kokoro
 *   npm run longform:animal:narrate -- --episode output/longform/animal/ep02-sea-otter
 *   npm run longform:animal:narrate -- --episode output/longform/animal/ep02-sea-otter --dry-run
 *   npm run longform:animal:narrate -- --episode output/longform/animal/ep02-sea-otter --force
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFile as parseAudioFile } from 'music-metadata';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const GROQ_MODEL      = 'llama-3.3-70b-versatile';
const GROQ_MAX_TOKENS = 400; // narration copy is short — 30-50 words per segment

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE   = args.includes('--force');
const ttsIdx  = args.indexOf('--tts');
const TTS_PROVIDER = ttsIdx !== -1 ? args[ttsIdx + 1] : 'openai';

const episodeArg = (() => {
  const i = args.indexOf('--episode');
  return i !== -1 ? args[i + 1] : null;
})();

if (!episodeArg) {
  console.error('Usage: node scripts/generate-animal-narration.mjs --episode output/longform/animal/ep01-slug [--dry-run] [--force] [--tts openai|kokoro]');
  process.exit(1);
}

const SEGMENTS = [
  { key: 'hook',          label: 'HOOK',             file: 'narration-hook.mp3',             isHook: true,          speed: 1.18 },
  { key: 'nameReveal',    label: 'NAME REVEAL',      file: 'narration-namereveal.mp3',       isNameReveal: true,    speed: 1.18 },
  { key: 'fact1',         label: 'FACT 1',           file: 'narration-fact1.mp3',                                   speed: 1.05 },
  { key: 'fact2',         label: 'FACT 2',           file: 'narration-fact2.mp3',                                   speed: 1.05 },
  { key: 'fact3',         label: 'FACT 3',           file: 'narration-fact3.mp3',                                   speed: 1.05 },
  { key: 'fact4',         label: 'FACT 4',           file: 'narration-fact4.mp3',                                   speed: 1.05 },
  { key: 'fact5',         label: 'FACT 5',           file: 'narration-fact5.mp3',                                   speed: 1.05 },
  { key: 'outroCta',      label: 'OUTRO CTA',        file: 'narration-outro-cta.mp3',        isOutroCta: true,      speed: 1.08 },
  { key: 'outroCtaShort', label: 'OUTRO CTA SHORT',  file: 'narration-outro-cta-short.mp3',  isOutroCtaShort: true, speed: 1.14 },
];

const SUNG_RECAP_FILE = 'sung-recap.mp3';

function resolveEpisodeDir(arg) {
  if (path.isAbsolute(arg) || arg.startsWith('output/') || arg.startsWith('output\\') || arg.includes(':\\')) {
    return path.resolve(ROOT, arg);
  }
  return path.join(ROOT, 'output', 'longform', 'animal', arg);
}

async function loadJson(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf-8')); } catch { return null; }
}

async function loadText(filePath) {
  try { return await fs.readFile(filePath, 'utf-8'); } catch { return ''; }
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function getAudioDuration(p) {
  try {
    const meta = await parseAudioFile(p);
    return meta.format.duration ?? 0;
  } catch { return 0; }
}

function roundDurationSec(sec) {
  return Math.round(sec * 10) / 10;
}

function buildIntelligenceContext(intel) {
  if (!intel) return '';
  const themes = (intel.new_themes || []).slice(0, 3).join(', ');
  const hooks  = (intel.new_hooks  || []).slice(0, 2).join('; ');
  const lines  = [];
  if (themes) lines.push(`Trending themes for optional inspiration: ${themes}`);
  if (hooks)  lines.push(`High-performing hooks for tone reference: ${hooks}`);
  return lines.length ? `\n\n${lines.join('\n')}` : '';
}

function buildTriggerBlock(triggerKey, triggers) {
  const t = triggers[triggerKey];
  if (!t) return `Psychology trigger: ${triggerKey}`;
  const examples = (t.caption_opener_examples || []).slice(0, 2).join(' | ');
  return [
    `Psychology trigger: ${t.label}`,
    `How it works: ${t.description}`,
    `Emotional arc to apply: ${t.caption_structure}`,
    examples ? `Opener tone examples (do NOT copy — use for tone only): ${examples}` : '',
  ].filter(Boolean).join('\n');
}

function buildHookNarrationPrompt(episode) {
  // hookFact is already written as the mystery-question hook in the brief.
  // Keep it direct so the visual hook and spoken hook stay perfectly aligned.
  return episode.hookFact || '';
}

function buildOutroCTAPrompt(episode) {
  return `Write ONE end-screen engagement question for a high-energy kids YouTube video about ${episode.animalName}.
- Max 24 words total
- Sound playful, punchy, and fun to say out loud
- Use very simple words a 4-8 year old can follow
- Reference the coolest idea from the episode
- End with exactly: "Ask a grown-up to help you write your answer in the comments!"
- Avoid bland classroom wording
- Output ONLY the text — no labels, no quotes`;
}

function buildShortOutroCTAPrompt(episode) {
  return `Write ONE ultra-short engagement line for a vertical kids reel about ${episode.animalName}.
- Max 10 words
- Must be easy to say in under 3 seconds
- Sound playful and curiosity-driven
- Refer to the coolest idea from the episode
- Must be a question or direct challenge
- No mention of grown-ups, comments, likes, or subscribing
- Output ONLY the text — no labels, no quotes`;
}

function buildNarrationPrompt(segment, segDef, episode, triggerBlock, intelContext) {
  const roughDescription = segment.description || '';
  const psychologyBeat   = segment.psychologyBeat || '';
  const comparisonAnchor = segment.comparisonAnchor || '';
  return `You are writing spoken narration for a fast, playful kids YouTube video about ${episode.animalName}. The audience is children aged 4-8 watching with their parents.

Segment: ${segDef.label}
Psychology beat: "${psychologyBeat}"
Comparison anchor (use in sentence 4): "${comparisonAnchor}"

${triggerBlock}

Rough description (factual reference — rewrite completely, keep the facts, NOT the phrasing):
"${roughDescription}"
${intelContext}

Write EXACTLY 4 short spoken sentences of narration. Strict structure:
- Sentence 1 (6-10 words): surprise-first punch line. It should feel exciting out loud.
- Sentence 2 (9-14 words): explain the why or how in simple, concrete language.
- Sentence 3 (8-13 words): add one vivid real detail or a real statistic. NEVER fabricate numbers.
- Sentence 4 (8-13 words): use the comparison anchor to land the idea in a child's world.

Performance rules:
- Sound like an excited kids video host, not a teacher or encyclopedia
- Every sentence must be easy and fun to say out loud
- Use lively verbs and concrete images
- Surprise first, explanation second
- No bland school wording like "primarily", "typically", "known for", or "meaning"
- No dreamy, poetic, or metaphorical filler
- Every word should be easy for a 4-8 year old listener to follow
- Only use numbers that appear verbatim in the rough description
- Output ONLY the 4 sentences — no labels, no quotes, no metadata`;
}

async function callGroq(systemPrompt, userPrompt) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
    max_tokens: GROQ_MAX_TOKENS,
    temperature: 0.82,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
  });
  return response.choices[0]?.message?.content?.trim() || '';
}

async function generateKokoroTTS(text, outputPath, speed = 1.0) {
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'cpu',
  });
  const audio = await tts.generate(text, { voice: 'af_bella', speed });
  await audio.save(outputPath);
}

async function generateTTS(text, outputPath, openai, speed = 1.0, provider = 'openai') {
  if (provider === 'kokoro') {
    return generateKokoroTTS(text, outputPath, speed);
  }
  const response = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: 'nova',
    input: text,
    speed,
    response_format: 'mp3',
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

async function main() {
  if (!['openai', 'kokoro'].includes(TTS_PROVIDER)) {
    throw new Error(`Unknown TTS provider: ${TTS_PROVIDER}. Use openai or kokoro.`);
  }
  if (TTS_PROVIDER === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key.startsWith('sk-your') || key === 'your-key-here') {
      throw new Error('OPENAI_API_KEY is not configured in .env (found placeholder value). Use --tts kokoro or set a real OpenAI key.');
    }
  }

  const episodeDir  = resolveEpisodeDir(episodeArg);
  const episodePath = path.join(episodeDir, 'episode.json');

  const episode = await loadJson(episodePath);
  if (!episode) throw new Error(`episode.json not found at ${episodePath}`);

  const writingStyle  = await loadText(path.join(ROOT, 'config', 'writing-style.md'));
  const psych         = await loadJson(path.join(ROOT, 'config', 'psychology-triggers.json'));
  const intel         = await loadJson(path.join(ROOT, 'config', 'content-intelligence.json'));
  const psychTriggers = psych?.triggers || {};
  const intelContext  = buildIntelligenceContext(intel);

  const openai = TTS_PROVIDER === 'openai'
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

  console.log('\n  JoyMaze Animal Facts Narration Generator');
  console.log(`  Animal: ${episode.animalName}`);
  console.log(`  Episode: ${episodeDir}`);
  console.log(`  Writing style: ${writingStyle ? 'loaded' : 'missing — proceeding without'}`);
  console.log(`  Psychology triggers: ${Object.keys(psychTriggers).length} loaded`);
  console.log(`  Intelligence context: ${intel ? 'loaded' : 'not available'}`);
  console.log(`  TTS provider: ${TTS_PROVIDER}`);
  console.log();

  let episodeDirty = false;

  const sungRecapPath = path.join(episodeDir, SUNG_RECAP_FILE);
  if (await fileExists(sungRecapPath)) {
    const sungRecapDuration = await getAudioDuration(sungRecapPath);
    if (sungRecapDuration > 0) {
      const roundedDuration = roundDurationSec(sungRecapDuration);
      if (episode.sungRecapShortDurationSec !== roundedDuration) {
        if (!DRY_RUN) {
          episode.sungRecapShortDurationSec = roundedDuration;
          episodeDirty = true;
        }
        console.log(`  Sung recap: ${SUNG_RECAP_FILE} → ${roundedDuration}s${DRY_RUN ? ' (would update episode.json)' : ''}`);
      } else {
        console.log(`  Sung recap: ${SUNG_RECAP_FILE} → ${roundedDuration}s`);
      }
    }
  }

  for (const segDef of SEGMENTS) {
    const isHook          = segDef.isHook === true;
    const isNameReveal    = segDef.isNameReveal === true;
    const isOutroCta      = segDef.isOutroCta === true;
    const isOutroCtaShort = segDef.isOutroCtaShort === true;
    // Hook/nameReveal/outroCta variants read from top-level; others read episode[key]
    const segment = (isHook || isNameReveal || isOutroCta || isOutroCtaShort) ? episode : episode[segDef.key];

    if (!segment && !isHook && !isNameReveal && !isOutroCta && !isOutroCtaShort) {
      console.log(`  Skip: ${segDef.key} — not found in episode.json`);
      continue;
    }

    const outputPath    = path.join(episodeDir, segDef.file);
    const alreadyExists = await fileExists(outputPath);

    if (alreadyExists && !FORCE) {
      if (isHook && !episode.hookNarration && !DRY_RUN) {
        // re-probe only — can't easily write back for hook without full regen
      } else if (isOutroCta && !episode.outroCtaDurationSec && !DRY_RUN) {
        const dur = await getAudioDuration(outputPath);
        if (dur > 0) {
          episode.outroCtaDurationSec = roundDurationSec(dur + 2.0);
          episodeDirty = true;
        }
      } else if (isOutroCtaShort && !episode.outroCtaShortDurationSec && !DRY_RUN) {
        const dur = await getAudioDuration(outputPath);
        if (dur > 0) {
          episode.outroCtaShortDurationSec = roundDurationSec(dur + 0.8);
          episodeDirty = true;
        }
      } else if (!isHook && !isNameReveal && !isOutroCta && !isOutroCtaShort && !segment.durationSec && !DRY_RUN) {
        const dur = await getAudioDuration(outputPath);
        if (dur > 0) {
          segment.durationSec = Math.max(7.0, roundDurationSec(dur + 2.5));
          episodeDirty = true;
        }
      }
      console.log(`  Skip: ${segDef.file} already exists (--force to regenerate)`);
      continue;
    }

    const triggerKey   = episode.psychologyMap?.[segDef.key] || 'CURIOSITY_GAP';
    const triggerBlock = buildTriggerBlock(triggerKey, psychTriggers);

    console.log(`  ${segDef.label}`);
    if (!isHook && !isNameReveal && !isOutroCta && !isOutroCtaShort) {
      console.log(`    Trigger: ${triggerKey} | Beat: "${segment.psychologyBeat || '—'}"`);
    }

    if (DRY_RUN) {
      console.log(`    Would generate → ${segDef.file}`);
      continue;
    }

    // Step 1: Get narration copy (Groq or template)
    let narrationCopy = '';
    if (isHook) {
      // hookFact is already the curiosity question — TTS it directly, no Groq
      narrationCopy = buildHookNarrationPrompt(episode);
    } else if (isNameReveal) {
      const startsWithVowel = /^[aeiou]/i.test(String(episode.animalName || '').trim());
      narrationCopy = `It's ${startsWithVowel ? 'an' : 'a'} ${episode.animalName}!`;
    } else if (isOutroCta) {
      process.stdout.write('    Generating copy...');
      narrationCopy = await callGroq(writingStyle, buildOutroCTAPrompt(episode));
      console.log(` done`);
    } else if (isOutroCtaShort) {
      process.stdout.write('    Generating copy...');
      narrationCopy = await callGroq(writingStyle, buildShortOutroCTAPrompt(episode));
      console.log(` done`);
    } else {
      process.stdout.write('    Generating copy...');
      narrationCopy = await callGroq(writingStyle, buildNarrationPrompt(segment, segDef, episode, triggerBlock, intelContext));
      console.log(` done (${narrationCopy.split(/\s+/).length} words)`);
    }

    if (!narrationCopy) {
      console.log(`    Skip: no copy generated`);
      continue;
    }
    console.log(`    "${narrationCopy.substring(0, 100)}${narrationCopy.length > 100 ? '...' : ''}"`);

    // Step 2: TTS via selected provider
    process.stdout.write('    Generating TTS...');
    await generateTTS(narrationCopy, outputPath, openai, segDef.speed ?? 1.0, TTS_PROVIDER);
    console.log(' done');

    // Step 3: Probe duration + write back to episode.json
    const dur = await getAudioDuration(outputPath);
    if (isHook) {
      episode.hookNarration     = narrationCopy;
      episode.hookNarrationFile = segDef.file;
      if (dur > 0) episode.hookNarrationDurationSec = roundDurationSec(dur + 1.5);
    } else if (isNameReveal) {
      episode.nameRevealNarration     = narrationCopy;
      episode.nameRevealNarrationFile = segDef.file;
    } else if (isOutroCta) {
      episode.outroCta     = narrationCopy;
      episode.outroCtaFile = segDef.file;
      if (dur > 0) episode.outroCtaDurationSec = roundDurationSec(dur + 2.0);
    } else if (isOutroCtaShort) {
      episode.outroCtaShort = narrationCopy;
      episode.outroCtaShortFile = segDef.file;
      if (dur > 0) episode.outroCtaShortDurationSec = roundDurationSec(dur + 0.8);
    } else {
      segment.narration     = narrationCopy;
      segment.narrationFile = segDef.file;
      if (dur > 0) {
        segment.durationSec = roundDurationSec(dur + 1.5);
      }
    }
    episodeDirty = true;

    console.log(`    ${segDef.file} → ${dur > 0 ? `${dur.toFixed(1)}s audio` : 'duration probe skipped'}`);
    console.log();
  }

  if (episodeDirty && !DRY_RUN) {
    await fs.writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`);
    console.log('  episode.json updated.');
  }

  if (DRY_RUN) {
    console.log('  Dry run complete. No files written.');
    return;
  }

  console.log('\n  Narration complete.');
  console.log(`  Files: ${SEGMENTS.map(s => s.file).join(', ')}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

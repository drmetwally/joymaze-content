/**
 * STANDALONE TEST — Vertex AI / Imagen 4.0
 * One-off script. Does NOT touch or modify any pipeline files.
 * Run: node scripts/test-vertex-imagen.mjs
 * Output: output/test-vertex/
 */

import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const API_KEY = process.env.VERTEX_API_KEY;
const MODEL   = 'imagen-4.0-generate-001';
const OUTDIR  = 'output/test-vertex';

// Minimal diagnostic prompt
const PROMPT = `A colorful maze puzzle on white paper, top-down view, clean illustration style.`;

async function run() {
  fs.mkdirSync(OUTDIR, { recursive: true });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${API_KEY}`;

  console.log(`Model  : ${MODEL}`);
  console.log(`Prompt : ${PROMPT.slice(0, 80)}...`);
  console.log('Calling API...\n');

  const body = {
    instances: [{ prompt: PROMPT }],
    parameters: { sampleCount: 1 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Print ALL headers for diagnostics
  console.log('--- All Response Headers ---');
  for (const [k, v] of res.headers.entries()) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`  HTTP status: ${res.status} ${res.statusText}`);
  console.log('----------------------------\n');

  const raw = await res.text();
  console.log('Full raw response:', raw.slice(0, 2000));

  const data = JSON.parse(raw || '{}');

  if (data.error) {
    console.error('API ERROR:', data.error.code, data.error.status);
    console.error('Message :', data.error.message);
    process.exit(1);
  }

  // Imagen returns base64 PNG
  const b64 = data.generatedImages?.[0]?.image?.imageBytes
           || data.predictions?.[0]?.bytesBase64Encoded
           || data.images?.[0]?.imageBytes;
  if (!b64) {
    console.error('No image in response. Full response:');
    console.dir(data, { depth: 4 });
    process.exit(1);
  }

  const outFile = path.join(OUTDIR, 'imagen4-castle-girl.png');
  fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
  console.log(`SUCCESS — image saved to: ${outFile}`);
  console.log(`File size: ${(fs.statSync(outFile).size / 1024).toFixed(1)} KB`);
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

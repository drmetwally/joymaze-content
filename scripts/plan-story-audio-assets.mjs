#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PLAN_FILE = path.join(ROOT, 'config', 'story-audio-plan.json');
const SFX_FILE = path.join(ROOT, 'config', 'sfx-library.json');

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const plan = JSON.parse(await fs.readFile(PLAN_FILE, 'utf-8'));
  const sfxLib = JSON.parse(await fs.readFile(SFX_FILE, 'utf-8'));

  const report = {
    generatedAt: new Date().toISOString(),
    notes: [
      'Local curated assets remain first choice.',
      'External provider targets are search hints only until downloaded and QC-approved.',
      'Pixabay/Freesound assets should be saved locally before production use.'
    ],
    music: [],
    sfx: []
  };

  for (const [poolName, files] of Object.entries(plan.musicPools || {})) {
    for (const file of files || []) {
      report.music.push({
        pool: poolName,
        file,
        exists: await exists(path.join(ROOT, file))
      });
    }
  }

  const seenTags = new Set();
  for (const lanePlan of Object.values(plan.lanePlans || {})) {
    for (const key of ['hookSfxTag', 'act1SfxTag', 'act2SfxTag', 'act3SfxTag']) {
      const tag = lanePlan?.[key];
      if (!tag || seenTags.has(tag)) continue;
      seenTags.add(tag);
      const file = sfxLib?.tags?.[tag]?.file || null;
      report.sfx.push({
        tag,
        file,
        exists: file ? await exists(path.join(ROOT, file)) : false
      });
    }
  }

  const externalTargets = [];
  for (const [lane, lanePlan] of Object.entries(plan.lanePlans || {})) {
    if (lane === 'default') continue;
    for (const provider of ['music', 'sfx']) {
      for (const target of lanePlan?.externalTargets?.[provider] || []) {
        externalTargets.push({ lane, type: provider, target });
      }
    }
  }
  report.externalTargets = externalTargets;

  const outPath = path.join(ROOT, 'output', 'reports', 'story-audio-asset-plan.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report, null, 2) + '\n');

  console.log(`Wrote ${path.relative(ROOT, outPath)}`);
  console.log(`Music entries: ${report.music.length}`);
  console.log(`SFX tags: ${report.sfx.length}`);
  console.log(`External targets: ${report.externalTargets.length}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

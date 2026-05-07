import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] ?? fallback : fallback;
};

const episodeArg = getArg('--episode');
const outDirArg = getArg('--out-dir');
const framesArg = getArg('--frames', '0,90,180,270,360,450,540,630,720,810');

if (!episodeArg || !outDirArg) {
  console.error('Usage: node scripts/extract-animal-song-audit-stills.mjs --episode <folder> --out-dir <dir> [--frames comma,list]');
  process.exit(1);
}

const episodePath = path.resolve(ROOT, episodeArg, 'episode.json');
const episodeDir = path.dirname(episodePath);
const outDir = path.resolve(ROOT, outDirArg);
const frames = framesArg.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v >= 0);

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

async function main() {
  const episode = JSON.parse(await fs.readFile(episodePath, 'utf8'));
  const inputProps = {
    episodeFolder: path.relative(ROOT, episodeDir).replace(/\\/g, '/'),
    episode,
  };

  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'joymaze-audit-public-'));
  const copies = [
    [path.join(ROOT, 'assets'), path.join(publicDir, 'assets')],
    [path.join(ROOT, 'output', 'longform', 'animal'), path.join(publicDir, 'output', 'longform', 'animal')],
    [path.join(ROOT, 'output', 'stories'), path.join(publicDir, 'output', 'stories')],
    [path.join(ROOT, 'output', 'asmr'), path.join(publicDir, 'output', 'asmr')],
    [path.join(ROOT, 'output', 'challenge'), path.join(publicDir, 'output', 'challenge')],
  ];
  for (const [src, dst] of copies) {
    const exists = await fs.access(src).then(() => true).catch(() => false);
    if (exists) await copyDir(src, dst);
  }

  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, 'remotion', 'index.jsx'),
    publicDir,
    webpackOverride: (config) => config,
  });

  const composition = await selectComposition({
    serveUrl,
    id: 'AnimalFactsSongShort',
    inputProps,
  });

  await fs.mkdir(outDir, { recursive: true });

  for (const frame of frames) {
    const outPath = path.join(outDir, `frame-${String(frame).padStart(4, '0')}.jpg`);
    await renderStill({
      composition,
      serveUrl,
      inputProps,
      frame,
      output: outPath,
      imageFormat: 'jpeg',
      jpegQuality: 88,
    });
    console.log(`saved ${path.relative(ROOT, outPath)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * asset-library.mjs — Universal index-based asset picker for JoyMaze.
 *
 * Replaces folder-based routing with a role-based universal index.
 * Single source of truth: assets/library/index.json
 * LRU rotation state: assets/library/.lru.json
 *
 * API:
 *   pickAsset(theme, role)    → Promise<string|null>  absolute path or null
 *   addToIndex(theme, role, absoluteFilePath) → Promise<void>
 *   assetLibraryHealth()      → Promise<{ [theme]: { [role]: number } }>
 *   assetCount(theme, role)    → Promise<number>
 *
 * theme examples: 'ocean', 'space', 'dinosaurs', 'animals', 'farm', 'vehicles'
 * role examples: 'character' (stickers), 'scene' (coloring/finddiff art)
 *
 * Library root: D:\Joymaze-Content\assets\library
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/lib → scripts/.. → project root
const ROOT = path.resolve(__dirname, '..', '..');
const LIBRARY_ROOT = path.join(ROOT, 'assets', 'library');
const INDEX_PATH = path.join(LIBRARY_ROOT, 'index.json');
const LRU_PATH = path.join(LIBRARY_ROOT, '.lru.json');

// ── In-memory index cache ────────────────────────────────────────────────────────

let _indexCache = null; // { version, themes: { theme: { role: string[] } } }
let _indexCacheDirty = false;

async function _readIndex() {
  if (_indexCache !== null) return _indexCache;
  try {
    _indexCache = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8'));
  } catch {
    _indexCache = { version: 1, themes: {} };
  }
  return _indexCache;
}

async function _writeIndex(idx) {
  _indexCache = idx;
  _indexCacheDirty = true;
  await fs.mkdir(LIBRARY_ROOT, { recursive: true });
  await fs.writeFile(INDEX_PATH, JSON.stringify(idx, null, 2), 'utf8');
  _indexCacheDirty = false;
}

// ── LRU state ────────────────────────────────────────────────────────────────

let _lruCache = null;

async function _readLru() {
  if (_lruCache !== null) return _lruCache;
  try {
    _lruCache = JSON.parse(await fs.readFile(LRU_PATH, 'utf8'));
  } catch {
    _lruCache = {};
  }
  return _lruCache;
}

async function _writeLru(lru) {
  _lruCache = lru;
  await fs.mkdir(LIBRARY_ROOT, { recursive: true });
  await fs.writeFile(LRU_PATH, JSON.stringify(lru, null, 2), 'utf8');
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Pick one asset for the given theme+role, using LRU rotation.
 * Returns absolute path to the selected PNG, or null if no assets exist.
 *
 * @param {string} theme  — e.g. 'ocean', 'space', 'dinosaurs'
 * @param {string} role  — e.g. 'character', 'scene'
 * @returns {Promise<string|null>}
 */
export async function pickAsset(theme, role) {
  const key = `${theme}:${role}`;
  const idx = await _readIndex();
  const candidates = idx.themes?.[theme]?.[role] ?? [];

  if (candidates.length === 0) return null;

  // Load LRU state
  const lru = await _readLru();
  let lruList = lru[key] ?? [];

  // Re-init from index if LRU is empty or missing
  if (!lruList || lruList.length === 0) {
    lruList = [...candidates];
  }

  // Filter to only physically existing files
  const existing = [];
  for (const candidate of lruList) {
    const absPath = path.resolve(ROOT, candidate);
    try {
      await fs.access(absPath);
      existing.push(candidate);
    } catch {
      // File gone — skip
    }
  }

  if (existing.length === 0) return null;

  // LRU rotate: first → end
  const selected = existing[0];
  const updated = [...existing.slice(1), selected];
  lru[key] = updated;
  await _writeLru(lru);

  return path.resolve(ROOT, selected);
}

/**
 * Add an absolute file path to the index under the given theme+role.
 * Idempotent — won't add the same path twice.
 *
 * @param {string} theme
 * @param {string} role
 * @param {string} absoluteFilePath
 */
export async function addToIndex(theme, role, absoluteFilePath) {
  const idx = await _readIndex();
  if (!idx.themes[theme]) idx.themes[theme] = {};
  if (!idx.themes[theme][role]) idx.themes[theme][role] = [];

  const relPath = path.relative(ROOT, absoluteFilePath).replace(/\\/g, '/');
  if (!idx.themes[theme][role].includes(relPath)) {
    idx.themes[theme][role].push(relPath);
  }

  await _writeIndex(idx);

  // Invalidate LRU cache for this key so next pickAsset re-inits
  const lru = await _readLru();
  delete lru[`${theme}:${role}`];
  await _writeLru(lru);
}

/**
 * Library health report: { [theme]: { [role]: count } }
 * Counts are from index.json (not filesystem scan).
 */
export async function assetLibraryHealth() {
  const idx = await _readIndex();
  const result = {};
  for (const [theme, roles] of Object.entries(idx.themes ?? {})) {
    result[theme] = {};
    for (const [role, paths] of Object.entries(roles)) {
      result[theme][role] = paths.length;
    }
  }
  return result;
}

/**
 * Count of index entries for theme+role.
 */
export async function assetCount(theme, role) {
  const idx = await _readIndex();
  return (idx.themes?.[theme]?.[role] ?? []).length;
}
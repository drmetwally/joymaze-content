import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const API_KEY = process.env.SUNOAPI_API_KEY;
const BASE_URL = process.env.SUNOAPI_BASE_URL || 'https://api.sunoapi.org';
const ROOT = process.cwd();
const args = process.argv.slice(2);

function getArg(name, fallback = null) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : fallback;
}

const episodeDirArg = getArg('--episode');
const kind = getArg('--kind', 'song');
const command = getArg('--command', 'all');
const model = getArg('--model', 'V4_5');
const pollIntervalMs = Number(getArg('--poll-ms', '15000'));
const pollTimeoutMs = Number(getArg('--timeout-ms', '240000'));
const callbackUrl = getArg('--callback', 'https://example.com/callback');

if (!API_KEY) {
  console.error('SUNOAPI_API_KEY is not configured in .env');
  process.exit(1);
}
if (!episodeDirArg) {
  console.error('Usage: node scripts/generate-animal-song-sunoapi.mjs --episode <folder> [--kind song|background] [--command submit|poll|download|all]');
  process.exit(1);
}

const episodeDir = path.resolve(ROOT, episodeDirArg);
const episodePath = path.join(episodeDir, 'episode.json');

async function api(apiPath, options = {}) {
  const res = await fetch(`${BASE_URL}${apiPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text || '{}');
  } catch {
    data = { raw: text };
  }

  if (!res.ok || (typeof data.code === 'number' && data.code !== 200)) {
    const msg = data?.msg || data?.errorMessage || res.statusText || 'Unknown error';
    throw new Error(`SunoAPI request failed (${res.status}${data?.code ? `/${data.code}` : ''}): ${msg}`);
  }

  return data;
}

async function loadEpisode() {
  return JSON.parse(await fs.readFile(episodePath, 'utf8'));
}

function buildPayload(episode, assetKind) {
  const animal = episode.animalName || 'Animal';
  if (assetKind === 'background') {
    return {
      prompt: '',
      style: `${episode.sunoPrompts?.background || 'Playful documentary background music'}, child-friendly, clean, loop-friendly, 20-35 seconds`,
      title: `${animal} Background`,
      customMode: true,
      instrumental: true,
      callBackUrl: callbackUrl,
      model,
    };
  }

  return {
    prompt: episode.fullSongLyrics,
    style: `${episode.sunoPrompts?.fullSong || 'Upbeat children\'s animal fact song'}, bright child vocals, playful educational energy, clear hooks, loop-friendly, 20-35 seconds`,
    title: `${animal} Animal Facts Song`,
    customMode: true,
    instrumental: false,
    callBackUrl: callbackUrl,
    model,
  };
}

function taskFile(assetKind) {
  return path.join(episodeDir, `_sunoapi-${assetKind}-task.json`);
}

async function saveJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function submit(episode, assetKind) {
  const payload = buildPayload(episode, assetKind);
  const response = await api('/api/v1/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const record = {
    submittedAt: new Date().toISOString(),
    episodeDir,
    kind: assetKind,
    payload,
    response,
    taskId: response?.data?.taskId || null,
  };
  await saveJson(taskFile(assetKind), record);
  return record;
}

async function loadTaskRecord(assetKind) {
  const file = taskFile(assetKind);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function fetchTask(taskId) {
  return api(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
}

async function pollUntilDone(assetKind) {
  const record = await loadTaskRecord(assetKind);
  if (!record.taskId) throw new Error(`No taskId found in ${path.basename(taskFile(assetKind))}`);

  const start = Date.now();
  while (true) {
    const details = await fetchTask(record.taskId);
    await saveJson(taskFile(assetKind), { ...record, lastCheckedAt: new Date().toISOString(), details });
    const status = details?.data?.status;
    console.log(`Status: ${status}`);

    if (status === 'SUCCESS') return details;
    if (['CREATE_TASK_FAILED', 'GENERATE_AUDIO_FAILED', 'CALLBACK_EXCEPTION', 'SENSITIVE_WORD_ERROR'].includes(status)) {
      throw new Error(`Generation failed with status ${status}: ${details?.data?.errorMessage || details?.msg || 'Unknown failure'}`);
    }
    if (Date.now() - start > pollTimeoutMs) {
      throw new Error(`Timed out waiting for SUCCESS after ${pollTimeoutMs} ms`);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

async function downloadFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  await fs.writeFile(outPath, Buffer.from(arrayBuffer));
}

async function downloadResults(assetKind) {
  const record = await loadTaskRecord(assetKind);
  const details = record.details?.data?.status ? record.details : await fetchTask(record.taskId);
  const status = details?.data?.status;
  if (status !== 'SUCCESS') {
    throw new Error(`Task is not ready for download. Current status: ${status}`);
  }

  const tracks = details?.data?.response?.sunoData || [];
  if (!tracks.length) {
    throw new Error('No generated tracks found in task details');
  }

  const downloads = [];
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const outName = `${assetKind}-option-${i + 1}.mp3`;
    const outPath = path.join(episodeDir, outName);
    await downloadFile(track.audioUrl, outPath);
    downloads.push({
      option: i + 1,
      file: outName,
      title: track.title,
      duration: track.duration,
      audioUrl: track.audioUrl,
      streamAudioUrl: track.streamAudioUrl,
    });
  }

  const finalRecord = {
    ...record,
    downloadedAt: new Date().toISOString(),
    details,
    downloads,
  };
  await saveJson(taskFile(assetKind), finalRecord);
  return finalRecord;
}

(async () => {
  const episode = await loadEpisode();

  if (command === 'submit') {
    const record = await submit(episode, kind);
    console.log(JSON.stringify({ ok: true, command, kind, taskId: record.taskId }, null, 2));
    return;
  }

  if (command === 'poll') {
    const details = await pollUntilDone(kind);
    console.log(JSON.stringify({ ok: true, command, kind, status: details?.data?.status }, null, 2));
    return;
  }

  if (command === 'download') {
    const result = await downloadResults(kind);
    console.log(JSON.stringify({ ok: true, command, kind, downloads: result.downloads }, null, 2));
    return;
  }

  if (command === 'all') {
    const record = await submit(episode, kind);
    console.log(`Submitted ${kind} task: ${record.taskId}`);
    const details = await pollUntilDone(kind);
    const result = await downloadResults(kind);
    console.log(JSON.stringify({ ok: true, command, kind, taskId: record.taskId, status: details?.data?.status, downloads: result.downloads }, null, 2));
    return;
  }

  throw new Error('Unknown command. Use submit, poll, download, or all.');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

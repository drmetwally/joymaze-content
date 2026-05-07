import 'dotenv/config';

const API_KEY = process.env.SUNOAPI_API_KEY;
const BASE_URL = process.env.SUNOAPI_BASE_URL || 'https://api.sunoapi.org';
const args = process.argv.slice(2);
const mode = args[0] || 'credits';

if (!API_KEY) {
  console.error('SUNOAPI_API_KEY is not configured in .env');
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
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

async function checkCredits() {
  const data = await api('/api/v1/generate/credit');
  console.log(JSON.stringify(data, null, 2));
}

async function generateQuickSong() {
  const payload = {
    prompt: 'Upbeat children\'s animal fact song about a puffin carrying fish, playful and catchy',
    customMode: false,
    instrumental: false,
    callBackUrl: 'https://example.com/callback',
    model: 'V4_5',
  };

  const data = await api('/api/v1/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  console.log(JSON.stringify(data, null, 2));
}

async function getTask(taskId) {
  if (!taskId) {
    throw new Error('Usage: node scripts/test-sunoapi.mjs task <taskId>');
  }
  const data = await api(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  console.log(JSON.stringify(data, null, 2));
}

(async () => {
  if (mode === 'credits') return checkCredits();
  if (mode === 'generate') return generateQuickSong();
  if (mode === 'task') return getTask(args[1]);
  throw new Error('Usage: node scripts/test-sunoapi.mjs [credits|generate|task <taskId>]');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * get-pinterest-token.mjs
 *
 * One-time script to demonstrate the FULL Pinterest OAuth flow and post a test pin.
 * Use this to record a demo video for Pinterest API Standard Access approval.
 *
 * What this shows (required by Pinterest review):
 *   1. Full OAuth flow: opens Pinterest auth screen → user approves → code exchanged for tokens
 *   2. Pinterest integration: posts a real pin to your board using the new token
 *
 * Usage:
 *   node scripts/get-pinterest-token.mjs            # Full OAuth + post demo pin
 *   node scripts/get-pinterest-token.mjs --auth-only # OAuth flow only, skip pin post
 *   node scripts/get-pinterest-token.mjs --save      # Also save tokens to .env
 */

import 'dotenv/config';
import { exec } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';

const CLIENT_ID     = process.env.PINTEREST_APP_ID;
const CLIENT_SECRET = process.env.PINTEREST_APP_SECRET;
const REDIRECT_URI  = 'https://localhost/callback'; // Must match your Pinterest app settings
const BOARD_ID      = process.env.PINTEREST_BOARD_ID;

const args      = process.argv.slice(2);
const AUTH_ONLY = args.includes('--auth-only');
const SAVE_ENV  = args.includes('--save');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('[pinterest-auth] ERROR: PINTEREST_APP_ID or PINTEREST_APP_SECRET missing from .env');
  process.exit(1);
}

// ── Step 1: Build the authorization URL ────────────────────────────────────

const SCOPES = [
  'boards:read',
  'boards:write',
  'pins:read',
  'pins:write',
  'user_accounts:read',
].join(',');

const authUrl = new URL('https://www.pinterest.com/oauth/');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('state', 'joymaze_demo_' + Date.now());

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║           JoyMaze — Pinterest OAuth Demo                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log('[Step 1/3] Opening Pinterest authorization screen in browser...\n');
console.log('           Scopes requested:');
SCOPES.split(',').forEach(s => console.log(`             • ${s}`));
console.log();

exec(`start "" "${authUrl.toString()}"`);

console.log('[Step 1/3] Browser opened. You should see the Pinterest "Allow access?" screen.');
console.log('           Click "Allow" to authorize JoyMaze.\n');
console.log('[Step 1/3] After authorizing, the browser will redirect to:');
console.log(`           ${REDIRECT_URI}?code=...`);
console.log('           The page may show an error — that is expected.');
console.log('           Copy the full URL from the browser address bar.\n');

// ── Step 2: Exchange auth code for tokens ──────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the full redirect URL here: ', async (input) => {
  rl.close();

  let code;
  try {
    const url = new URL(input.trim());
    code = url.searchParams.get('code');
  } catch {
    code = input.trim();
  }

  if (!code) {
    console.error('\n[pinterest-auth] Could not extract code. Paste the full URL including ?code=...');
    process.exit(1);
  }

  console.log('\n[Step 2/3] Exchanging authorization code for access + refresh tokens...');

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const tokenRes = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });

  const tokens = await tokenRes.json();

  if (!tokenRes.ok || tokens.error) {
    console.error('\n[pinterest-auth] Token exchange failed:');
    console.error(JSON.stringify(tokens, null, 2));
    if (tokens.message?.includes('invalid_grant') || tokens.code === 3) {
      console.error('\nThe code may have expired (they last ~10 minutes). Re-run the script and paste faster.');
    }
    process.exit(1);
  }

  const accessToken  = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  const expiresIn    = tokens.expires_in;

  console.log('\n[Step 2/3] ✓ Tokens received successfully!');
  console.log(`           Access token:  ${accessToken.slice(0, 12)}... (expires in ${Math.round(expiresIn / 86400)} days)`);
  console.log(`           Refresh token: ${refreshToken.slice(0, 12)}...`);
  console.log(`           Scopes granted: ${tokens.scope || SCOPES}`);

  if (SAVE_ENV) {
    const envPath   = 'D:/Joymaze-Content/.env';
    let envContent  = readFileSync(envPath, 'utf8');
    envContent      = envContent.replace(/^PINTEREST_ACCESS_TOKEN=.*$/m,  `PINTEREST_ACCESS_TOKEN=${accessToken}`);
    envContent      = envContent.replace(/^PINTEREST_REFRESH_TOKEN=.*$/m, `PINTEREST_REFRESH_TOKEN=${refreshToken}`);
    writeFileSync(envPath, envContent);
    console.log('\n           .env updated with new tokens.');
  }

  if (AUTH_ONLY) {
    console.log('\n[pinterest-auth] --auth-only mode. Skipping pin post.');
    console.log('[pinterest-auth] OAuth demo complete.\n');
    return;
  }

  // ── Step 3: Post a demo pin ──────────────────────────────────────────────

  if (!BOARD_ID) {
    console.error('\n[pinterest-auth] PINTEREST_BOARD_ID not set in .env — skipping pin post.');
    return;
  }

  console.log('\n[Step 3/3] Posting a demo pin to your board to demonstrate Pinterest integration...');

  const pinBody = {
    board_id: BOARD_ID,
    title: 'JoyMaze — Free Kids Activity App 🎨',
    description: 'Coloring pages, mazes, word searches & more for kids ages 4–8. Screen-free printable fun at joymaze.com',
    link: 'https://joymaze.com',
    media_source: {
      source_type: 'image_url',
      url: 'https://joymaze.com/og-image.png', // Replace with a real hosted image if needed
    },
    alt_text: 'JoyMaze kids activity app — mazes, coloring, and puzzles for kids ages 4-8',
  };

  const pinRes = await fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pinBody),
  });

  const pinData = await pinRes.json();

  if (!pinRes.ok) {
    console.error(`\n[Step 3/3] Pin creation failed (${pinRes.status}):`);
    console.error(JSON.stringify(pinData, null, 2));
    console.log('\n           Note: If you are still on Sandbox access, pin creation will fail.');
    console.log('           The OAuth flow (Steps 1–2) is still valid for your demo video.');
    return;
  }

  console.log(`\n[Step 3/3] ✓ Pin created successfully!`);
  console.log(`           Pin ID:  ${pinData.id}`);
  console.log(`           Pin URL: https://www.pinterest.com/pin/${pinData.id}/`);
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Demo complete. OAuth + pin post both shown. Good to submit. ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
});

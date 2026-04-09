#!/usr/bin/env node
/**
 * get-youtube-token.mjs
 *
 * One-time script to get a YouTube OAuth refresh token.
 * Opens a browser, you sign in, then paste the code from the URL bar.
 *
 * Usage: node scripts/get-youtube-token.mjs
 */

import 'dotenv/config';
import { exec } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';

if (!CLIENT_ID || CLIENT_ID === 'your-youtube-client-id') {
  console.error('ERROR: YOUTUBE_CLIENT_ID not set in .env');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('\n[youtube-auth] Opening browser...');
exec(`start "" "${authUrl.toString()}"`);

console.log('\n[youtube-auth] After signing in, the browser will show "This site can\'t be reached".');
console.log('[youtube-auth] That is EXPECTED. Copy the "code" value from the URL bar.\n');
console.log('[youtube-auth] The URL will look like:');
console.log('  http://localhost:3000/callback?code=4/0ABC...XYZ&scope=...\n');

const rl = createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the full URL (or just the code value): ', async (input) => {
  rl.close();

  // Accept either the full URL or just the code
  let code;
  try {
    const url = new URL(input.trim());
    code = url.searchParams.get('code');
  } catch {
    code = input.trim();
  }

  if (!code) {
    console.error('[youtube-auth] Could not extract code. Try pasting the full URL.');
    process.exit(1);
  }

  console.log('\n[youtube-auth] Exchanging code for tokens...');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();

  if (tokens.error) {
    console.error('[youtube-auth] Token exchange failed:', tokens.error, tokens.error_description);
    console.error('[youtube-auth] If error is "invalid_grant", the code expired — re-run the script and paste faster.');
    process.exit(1);
  }

  if (!tokens.refresh_token) {
    console.error('[youtube-auth] No refresh_token returned.');
    console.error('[youtube-auth] Go to https://myaccount.google.com/permissions, revoke JoyMaze access, then re-run.');
    process.exit(1);
  }

  // Write to .env
  const envPath = 'D:/Joymaze-Content/.env';
  const envContent = readFileSync(envPath, 'utf8');
  const updated = envContent.replace(
    /^YOUTUBE_REFRESH_TOKEN=.*$/m,
    `YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`
  );
  writeFileSync(envPath, updated);

  console.log('\n[youtube-auth] SUCCESS!');
  console.log('[youtube-auth] Refresh token written to .env');
  console.log('[youtube-auth] You can now delete scripts/get-youtube-token.mjs\n');
});

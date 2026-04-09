#!/usr/bin/env node

/**
 * refresh-pinterest-token.mjs
 *
 * Uses the stored PINTEREST_REFRESH_TOKEN to obtain a new access token
 * from Pinterest and writes both the new access token and new refresh token
 * back into .env in-place.
 *
 * Pinterest access tokens expire in 30 days.
 * Refresh tokens expire in 365 days.
 * Each refresh call returns a brand-new refresh token — we save it immediately.
 *
 * Run manually:  node scripts/refresh-pinterest-token.mjs
 * Dry run:       node scripts/refresh-pinterest-token.mjs --dry-run
 * Scheduled:     automatically via daily-scheduler.mjs every Monday
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const ENV_PATH   = path.join(ROOT, '.env');
const TOKEN_URL  = 'https://api.pinterest.com/v5/oauth/token';

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function log(msg) {
  console.log(`[pinterest-refresh] ${msg}`);
}

function daysFromNow(seconds) {
  return Math.round(seconds / 86400);
}

function maskedToken(token) {
  if (!token || token.length < 12) return '(empty)';
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}

async function fetchNewTokens({ appId, appSecret, refreshToken }) {
  const credentials = Buffer.from(`${appId}:${appSecret}`).toString('base64');

  const body = new URLSearchParams();
  body.append('grant_type', 'refresh_token');
  body.append('refresh_token', refreshToken);

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Pinterest token refresh failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  if (!data.access_token) {
    throw new Error(`No access_token in Pinterest response: ${JSON.stringify(data)}`);
  }

  return data;
}

async function writeTokensToEnv(newAccessToken, newRefreshToken) {
  const raw = await fs.readFile(ENV_PATH, 'utf-8');
  const lines = raw.split('\n');

  const updated = lines.map(line => {
    if (line.startsWith('PINTEREST_ACCESS_TOKEN=')) {
      return `PINTEREST_ACCESS_TOKEN=${newAccessToken}`;
    }
    if (line.startsWith('PINTEREST_REFRESH_TOKEN=')) {
      return `PINTEREST_REFRESH_TOKEN=${newRefreshToken}`;
    }
    return line;
  });

  await fs.writeFile(ENV_PATH, updated.join('\n'), 'utf-8');
}

async function main() {
  log(`Mode: ${DRY_RUN ? 'DRY RUN (no .env changes)' : 'LIVE'}`);

  const appId        = process.env.PINTEREST_APP_ID;
  const appSecret    = process.env.PINTEREST_APP_SECRET;
  const refreshToken = process.env.PINTEREST_REFRESH_TOKEN;

  if (!appId || !appSecret) {
    throw new Error('PINTEREST_APP_ID or PINTEREST_APP_SECRET missing from .env');
  }
  if (!refreshToken) {
    throw new Error('PINTEREST_REFRESH_TOKEN missing from .env — cannot refresh without it');
  }

  log(`Using App ID: ${appId}`);
  log(`Refresh token: ${maskedToken(refreshToken)}`);
  log('Calling Pinterest token endpoint...');

  const data = await fetchNewTokens({ appId, appSecret, refreshToken });

  const newAccessToken  = data.access_token;
  const newRefreshToken = data.refresh_token || refreshToken; // Pinterest always returns a new one, but guard
  const accessExpiry    = daysFromNow(data.expires_in || 2592000);
  const refreshExpiry   = daysFromNow(data.refresh_token_expires_in || 31536000);

  log(`New access token:  ${maskedToken(newAccessToken)} (expires in ~${accessExpiry} days)`);
  log(`New refresh token: ${maskedToken(newRefreshToken)} (expires in ~${refreshExpiry} days)`);

  if (DRY_RUN) {
    log('Dry run — .env not modified.');
    return;
  }

  await writeTokensToEnv(newAccessToken, newRefreshToken);
  log('.env updated with new tokens.');
  log(`Next refresh due: in ~${accessExpiry - 7} days (scheduler runs weekly — safe)`);
}

main().catch(err => {
  console.error(`[pinterest-refresh] FATAL: ${err.message}`);
  process.exit(1);
});

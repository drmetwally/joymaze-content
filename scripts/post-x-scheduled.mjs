#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');

// ── Cooldown guard ──────────────────────────────────────────────────────────
async function checkCooldown() {
  const cooldownPath = path.join(ROOT, 'output', 'posting-cooldown.json');
  try {
    const data = JSON.parse(await fs.readFile(cooldownPath, 'utf-8'));
    const until = new Date(data.until);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (until > today) {
      const daysLeft = Math.ceil((until - today) / 86_400_000);
      console.log(`⏸  X text posting paused — cooldown until ${data.until} (${daysLeft} day(s) left)`);
      return true;
    }
  } catch {}
  return false;
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function formatDateLocal(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getQueuePath(date = new Date()) {
  return path.join(QUEUE_DIR, `x-text-${formatDateLocal(date)}.json`);
}

function getReplies(entry) {
  if (Array.isArray(entry.replies) && entry.replies.length > 0) {
    return entry.replies.filter(Boolean);
  }

  if (entry.reply1) {
    return [entry.reply1].filter(Boolean);
  }

  return [];
}

function getDueEntries(entries, currentHour) {
  return entries.filter(entry =>
    Number.isFinite(entry?.scheduledHour) &&
    entry.scheduledHour <= currentHour &&
    entry.posted !== true
  );
}

async function loadQueue(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'));
}

async function saveQueue(filePath, entries) {
  await fs.writeFile(filePath, JSON.stringify(entries, null, 2));
}

async function createXClient() {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error('X credentials not configured');
  }

  const { TwitterApi } = await import('twitter-api-v2');
  return new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret,
  });
}

async function postEntry(client, entry, persist) {
  const replies = getReplies(entry);
  const replyIds = Array.isArray(entry.replyIds) ? [...entry.replyIds] : [];
  let tweetId = entry.tweetId || null;
  let lastTweetId = replyIds.length > 0 ? replyIds[replyIds.length - 1] : tweetId;

  if (!tweetId) {
    const mainTweet = await client.v2.tweet({ text: entry.tweet1 });
    tweetId = mainTweet.data.id;
    lastTweetId = tweetId;
    entry.tweetId = tweetId;
    entry.postedAt = new Date().toISOString();
    delete entry.error;
    delete entry.failedAt;
    await persist();
  }

  for (let i = replyIds.length; i < replies.length; i++) {
    const replyTweet = await client.v2.tweet({
      text: replies[i],
      reply: { in_reply_to_tweet_id: lastTweetId || tweetId },
    });
    replyIds.push(replyTweet.data.id);
    lastTweetId = replyTweet.data.id;
    entry.replyIds = replyIds;
    await persist();
  }

  entry.reply1 = replies[0] || '';
  entry.replies = replies;
  entry.replyIds = replyIds;
  entry.posted = true;
  entry.postedAt = entry.postedAt || new Date().toISOString();
  delete entry.error;
  delete entry.failedAt;
  await persist();
}

async function main() {
  if (!DRY_RUN && await checkCooldown()) {
    process.exit(0);
  }

  const now = new Date();
  const currentHour = now.getHours();
  const queuePath = getQueuePath(now);

  console.log('=== JoyMaze Scheduled X Poster ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Date: ${formatDateLocal(now)}`);
  console.log(`Current hour: ${currentHour}`);

  let entries;
  try {
    entries = await loadQueue(queuePath);
  } catch {
    console.log(`No X text queue found for today: ${queuePath}`);
    process.exit(0);
  }

  if (!Array.isArray(entries)) {
    throw new Error('X text queue is not an array');
  }

  const dueEntries = getDueEntries(entries, currentHour);
  if (dueEntries.length === 0) {
    console.log('No scheduled X text posts are due right now.');
    return;
  }

  if (DRY_RUN) {
    console.log(JSON.stringify(dueEntries.map(entry => ({
      type: entry.type,
      scheduledHour: entry.scheduledHour,
      tweet1: entry.tweet1,
      replies: getReplies(entry),
      alreadyStarted: Boolean(entry.tweetId),
      posted: entry.posted === true,
    })), null, 2));
    return;
  }

  const client = await createXClient();
  let postedCount = 0;
  let failedCount = 0;

  for (const entry of dueEntries) {
    try {
      await postEntry(client, entry, () => saveQueue(queuePath, entries));
      postedCount++;
      console.log(`Posted ${entry.type} scheduled for ${entry.scheduledHour}:00 (${entry.tweetId})`);
    } catch (err) {
      entry.error = err.message;
      entry.failedAt = new Date().toISOString();
      await saveQueue(queuePath, entries);
      failedCount++;
      console.log(`Failed ${entry.type} scheduled for ${entry.scheduledHour}:00 - ${err.message}`);
    }
  }

  console.log(`Posted: ${postedCount} | Failed: ${failedCount}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

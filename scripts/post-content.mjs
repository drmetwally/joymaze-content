#!/usr/bin/env node

/**
 * JoyMaze Content — Platform Posting Script
 *
 * Posts queued content to configured platforms (Pinterest, Instagram, X).
 *
 * Usage:
 *   node scripts/post-content.mjs                    # Post all pending items
 *   node scripts/post-content.mjs --dry-run           # Preview what would be posted
 *   node scripts/post-content.mjs --platform pinterest # Post to specific platform only
 *   node scripts/post-content.mjs --id 2026-03-21-coloring-preview-00  # Post specific item
 *   node scripts/post-content.mjs --limit 3           # Post max 3 items
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const IMAGES_DIR = path.join(ROOT, 'output', 'images');
const ARCHIVE_DIR = path.join(ROOT, 'output', 'archive');

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const platformIdx = args.indexOf('--platform');
const FILTER_PLATFORM = platformIdx !== -1 ? args[platformIdx + 1] : null;
const idIdx = args.indexOf('--id');
const FILTER_ID = idIdx !== -1 ? args[idIdx + 1] : null;
const limitIdx = args.indexOf('--limit');
const POST_LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ========== Pinterest ==========

async function postToPinterest(imagePath, caption, metadata) {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = process.env.PINTEREST_BOARD_ID;
  if (!token || !boardId) throw new Error('Pinterest credentials not configured');

  // Upload image as base64
  const imageBuffer = await fs.readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const body = {
    board_id: boardId,
    media_source: {
      source_type: 'image_base64',
      content_type: 'image/png',
      data: base64Image,
    },
    title: metadata.categoryName,
    description: caption.rawCaption || caption.text,
    link: process.env.WEBSITE_URL || 'https://joymaze.com',
    alt_text: `JoyMaze - ${metadata.categoryName}: ${metadata.subject || ''}`,
  };

  const response = await fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Pinterest API ${response.status}: ${err}`);
  }

  const result = await response.json();
  return { platform: 'pinterest', postId: result.id, url: `https://pinterest.com/pin/${result.id}` };
}

// ========== Instagram ==========

async function postToInstagram(imagePath, caption, metadata) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !accountId) throw new Error('Instagram credentials not configured');

  // Step 1: Upload image to a public URL (Instagram requires a URL, not direct upload)
  // In production, you'd host this on S3/Cloudflare. For now, we'll note this limitation.
  // Using the container creation flow with image_url

  // For local testing, you need to serve images via a public URL.
  // Option: Use a webhook URL or temporary hosting service.
  const imageUrl = metadata._publicImageUrl;
  if (!imageUrl) {
    throw new Error(
      'Instagram requires a publicly accessible image URL. ' +
        'Set metadata._publicImageUrl or use a hosting service. ' +
        'See docs/PLATFORM_SETUP_GUIDE.md for details.'
    );
  }

  // Step 1: Create media container
  const containerUrl = `https://graph.facebook.com/v19.0/${accountId}/media`;
  const containerResponse = await fetch(containerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption: caption.text,
      access_token: token,
    }),
  });

  if (!containerResponse.ok) {
    const err = await containerResponse.text();
    throw new Error(`Instagram container ${containerResponse.status}: ${err}`);
  }

  const container = await containerResponse.json();
  const containerId = container.id;

  // Step 2: Publish the container
  const publishUrl = `https://graph.facebook.com/v19.0/${accountId}/media_publish`;
  const publishResponse = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: token,
    }),
  });

  if (!publishResponse.ok) {
    const err = await publishResponse.text();
    throw new Error(`Instagram publish ${publishResponse.status}: ${err}`);
  }

  const result = await publishResponse.json();
  return { platform: 'instagram', postId: result.id };
}

// ========== X (Twitter) ==========

async function postToX(imagePath, caption, metadata) {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error('X (Twitter) credentials not configured');
  }

  const { TwitterApi } = await import('twitter-api-v2');
  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });

  const mediaId = await client.v1.uploadMedia(imagePath);
  const tweet = await client.v2.tweet({
    text: caption.text,
    media: { media_ids: [mediaId] },
  });

  return { platform: 'x', postId: tweet.data.id, url: `https://x.com/i/status/${tweet.data.id}` };
}

// ========== Posting orchestrator ==========

const POSTERS = {
  pinterest: { fn: postToPinterest, imageKey: 'pinterest' },
  instagram: { fn: postToInstagram, imageKey: 'instagram_square' },
  x: { fn: postToX, imageKey: 'x' },
};

async function postContent(metadata) {
  const results = [];

  for (const [platform, config] of Object.entries(POSTERS)) {
    if (FILTER_PLATFORM && platform !== FILTER_PLATFORM) continue;

    const platformStatus = metadata.platforms?.[platform]?.status;
    if (platformStatus === 'posted') {
      console.log(`    ${platform}: already posted, skipping`);
      continue;
    }

    if (!metadata.captions?.[platform]) {
      console.log(`    ${platform}: no caption, skipping`);
      continue;
    }

    const imageFilename = metadata.outputs?.[config.imageKey];
    if (!imageFilename) {
      console.log(`    ${platform}: no image for this platform, skipping`);
      continue;
    }

    const imagePath = path.join(IMAGES_DIR, imageFilename);
    const caption = metadata.captions[platform];

    if (DRY_RUN) {
      console.log(`    ${platform}: [DRY RUN] Would post image ${imageFilename}`);
      console.log(`      Caption: ${caption.rawCaption?.slice(0, 80) || caption.text?.slice(0, 80)}...`);
      console.log(`      Hashtags: ${caption.hashtags?.length || 0} tags`);
      results.push({ platform, status: 'dry-run' });
      continue;
    }

    try {
      const result = await config.fn(imagePath, caption, metadata);
      console.log(`    ${platform}: POSTED (${result.postId || 'ok'})`);
      if (result.url) console.log(`      URL: ${result.url}`);

      // Update metadata
      metadata.platforms[platform] = {
        ...metadata.platforms[platform],
        status: 'posted',
        postId: result.postId,
        postedAt: new Date().toISOString(),
        url: result.url,
      };
      results.push({ platform, status: 'posted', ...result });
    } catch (err) {
      console.log(`    ${platform}: FAILED — ${err.message}`);
      metadata.platforms[platform] = {
        ...metadata.platforms[platform],
        status: 'failed',
        error: err.message,
        failedAt: new Date().toISOString(),
      };
      results.push({ platform, status: 'failed', error: err.message });
    }
  }

  return results;
}

// ========== Main ==========

async function main() {
  console.log('=== JoyMaze Content Poster ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE POSTING'}`);
  if (FILTER_PLATFORM) console.log(`Platform: ${FILTER_PLATFORM}`);
  if (FILTER_ID) console.log(`Filter ID: ${FILTER_ID}`);
  console.log(`Active platforms: ${Object.keys(POSTERS).join(', ')}`);
  console.log('');

  // Ensure archive dir exists
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });

  // Read queue
  let queueFiles;
  try {
    queueFiles = await fs.readdir(QUEUE_DIR);
  } catch {
    console.log('No queue directory. Run generate-images.mjs first.');
    process.exit(0);
  }

  const jsonFiles = queueFiles.filter(f => f.endsWith('.json'));
  if (jsonFiles.length === 0) {
    console.log('Queue is empty. Run generate-images.mjs and generate-captions.mjs first.');
    process.exit(0);
  }

  console.log(`Queue: ${jsonFiles.length} items\n`);

  let posted = 0;
  let failed = 0;
  let skipped = 0;

  for (const filename of jsonFiles) {
    if (posted >= POST_LIMIT) break;

    const filePath = path.join(QUEUE_DIR, filename);
    const metadata = JSON.parse(await fs.readFile(filePath, 'utf-8'));

    if (FILTER_ID && metadata.id !== FILTER_ID) {
      skipped++;
      continue;
    }

    if (!metadata.captions) {
      console.log(`  ${metadata.id}: no captions, skipping (run generate-captions.mjs)`);
      skipped++;
      continue;
    }

    console.log(`  ${metadata.id} (${metadata.categoryName})`);
    const results = await postContent(metadata);

    // Save updated metadata (with post statuses)
    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));

    const anyPosted = results.some(r => r.status === 'posted' || r.status === 'dry-run');
    const anyFailed = results.some(r => r.status === 'failed');

    if (anyPosted) posted++;
    if (anyFailed) failed++;
    console.log('');
  }

  // Summary
  console.log('=== Posting Complete ===');
  console.log(`Posted: ${posted} | Failed: ${failed} | Skipped: ${skipped}`);
  if (!DRY_RUN && posted > 0) {
    console.log('Queue metadata updated with post statuses.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

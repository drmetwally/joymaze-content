#!/usr/bin/env node

/**
 * JoyMaze Content — Platform Posting Script
 *
 * Posts queued content to configured platforms (Pinterest, Instagram, X, TikTok, YouTube).
 *
 * Usage:
 *   node scripts/post-content.mjs                    # Post all pending items
 *   node scripts/post-content.mjs --dry-run           # Preview what would be posted
 *   node scripts/post-content.mjs --platform pinterest # Post to specific platform only
 *   node scripts/post-content.mjs --id 2026-03-21-coloring-preview-00  # Post specific item
 *   node scripts/post-content.mjs --limit 3           # Post max 3 items
 *
 * Required .env vars per platform:
 *   Pinterest:  PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID
 *   Instagram:  INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID
 *   X:          X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
 *   TikTok:     TIKTOK_ACCESS_TOKEN  (from TikTok Content Posting API v2 OAuth)
 *   YouTube:    YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 */

import 'dotenv/config';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'output', 'queue');
const IMAGES_DIR = path.join(ROOT, 'output', 'images');
const VIDEOS_DIR = path.join(ROOT, 'output', 'videos');
const ARCHIVE_DIR = path.join(ROOT, 'output', 'archive');

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SCHEDULED_MODE = args.includes('--scheduled'); // only post items whose scheduledHour has arrived
const platformIdx = args.indexOf('--platform');
const FILTER_PLATFORM = platformIdx !== -1 ? args[platformIdx + 1] : null;
const idIdx = args.indexOf('--id');
const FILTER_ID = idIdx !== -1 ? args[idIdx + 1] : null;
const limitIdx = args.indexOf('--limit');
const POST_LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

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
      console.log(`⏸  Posting paused — cooldown active until ${data.until} (${daysLeft} day(s) remaining)`);
      console.log(`   Reason: ${data.reason || 'cooldown'}`);
      console.log('   Auto-resumes on schedule. Delete output/posting-cooldown.json to override.');
      return true; // is in cooldown
    }
  } catch {
    // No cooldown file = no pause
  }
  return false;
}

// ========== Pinterest ==========

async function uploadTempImage(imagePath) {
  // Upload image to temp hosting for Pinterest URL-based pin creation
  // (Pinterest sandbox API has a bug with base64 uploads)
  const imageBuffer = await sharp(imagePath).jpeg({ quality: 85 }).toBuffer();
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '1h');
  formData.append('fileToUpload', new Blob([imageBuffer], { type: 'image/jpeg' }), 'pin.jpg');

  const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`Image upload failed: ${response.status}`);
  return (await response.text()).trim();
}

/**
 * Extract a JPEG thumbnail from a video file using FFmpeg.
 * Returns the temp file path, or null if FFmpeg is unavailable.
 */
async function extractVideoThumbnail(videoPath) {
  const thumbPath = path.join(tmpdir(), `joymaze-thumb-${Date.now()}.jpg`);
  const ffmpegCandidates = ['ffmpeg', 'D:/Dev/ffmpeg/ffmpeg.exe', 'C:/ffmpeg/bin/ffmpeg.exe'];
  for (const bin of ffmpegCandidates) {
    try {
      execSync(`"${bin}" -y -i "${videoPath}" -ss 1 -frames:v 1 -f image2 "${thumbPath}"`, {
        timeout: 10000,
        stdio: 'pipe',
      });
      return thumbPath;
    } catch { continue; }
  }
  return null;
}

async function postToPinterest(mediaPath, caption, metadata) {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = process.env.PINTEREST_BOARD_ID;
  if (!token || !boardId) throw new Error('Pinterest credentials not configured');

  const isVideo = metadata.type === 'video';
  const apiBase = process.env.PINTEREST_API_BASE || 'https://api-sandbox.pinterest.com';

  // Upload media
  let mediaSource;
  if (isVideo) {
    const videoBuffer = await fs.readFile(mediaPath);

    // Step 1: Register the upload with Pinterest → get media_id + S3 presigned URL
    const registerResp = await fetch(`${apiBase}/v5/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ media_type: 'video' }),
    });
    if (!registerResp.ok) {
      const err = await registerResp.text();
      throw new Error(`Pinterest media register ${registerResp.status}: ${err}`);
    }
    const { media_id, upload_url, upload_parameters } = await registerResp.json();

    // Step 2: Upload video to Pinterest's S3 presigned URL
    const s3Form = new FormData();
    for (const [key, value] of Object.entries(upload_parameters || {})) {
      s3Form.append(key, value);
    }
    s3Form.append('file', new Blob([videoBuffer], { type: 'video/mp4' }), 'video.mp4');
    const s3Resp = await fetch(upload_url, { method: 'POST', body: s3Form });
    if (s3Resp.status >= 300) {
      throw new Error(`Pinterest S3 upload failed: ${s3Resp.status}`);
    }

    // Step 3: Poll until Pinterest finishes processing the video (max ~2.5 min)
    let status = 'pending';
    for (let attempt = 0; attempt < 30 && status !== 'succeeded' && status !== 'failed'; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollResp = await fetch(`${apiBase}/v5/media/${media_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pollResp.ok) {
        const pollData = await pollResp.json();
        status = pollData.status;
      }
    }
    if (status === 'failed') throw new Error('Pinterest video processing failed after upload');
    if (status !== 'succeeded') throw new Error('Pinterest video processing timed out (>2.5 min)');

    mediaSource = { source_type: 'video_id', media_id };
  }

  // Extract cover thumbnail for video pins (Pinterest requires cover_image_url for videos)
  let coverImageUrl = null;
  if (isVideo) {
    try {
      const thumbPath = await extractVideoThumbnail(mediaPath);
      if (thumbPath) {
        coverImageUrl = await uploadTempImage(thumbPath);
        await fs.unlink(thumbPath).catch(() => {});
      }
    } catch { /* cover is optional — post without if extraction fails */ }
  }

  if (!isVideo) {
    const imageUrl = await uploadTempImage(mediaPath);
    mediaSource = { source_type: 'image_url', url: imageUrl };
  }

  const body = {
    board_id: boardId,
    media_source: mediaSource,
    title: metadata.categoryName,
    description: caption.rawCaption || caption.text,
    link: process.env.WEBSITE_URL || 'https://joymaze.com',
    alt_text: `JoyMaze - ${metadata.categoryName}: ${metadata.subject || ''}`,
    ...(coverImageUrl && { cover_image_url: coverImageUrl }),
  };

  const response = await fetch(`${apiBase}/v5/pins`, {
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

async function postToInstagram(mediaPath, caption, metadata) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !accountId) throw new Error('Instagram credentials not configured');

  const isVideo = metadata.type === 'video';

  // Step 1: Create media container
  const containerUrl = `https://graph.facebook.com/v19.0/${accountId}/media`;
  let containerBody;

  if (isVideo) {
    // Upload video to temp hosting for a public URL
    const videoBuffer = await fs.readFile(mediaPath);
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('time', '1h');
    formData.append('fileToUpload', new Blob([videoBuffer], { type: 'video/mp4' }), 'reel.mp4');
    const uploadResp = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: formData });
    if (!uploadResp.ok) throw new Error(`Video upload failed: ${uploadResp.status}`);
    const videoUrl = (await uploadResp.text()).trim();

    containerBody = {
      media_type: 'REELS',
      video_url: videoUrl,
      caption: caption.text,
      access_token: token,
    };
  } else {
    // Upload image to temp hosting for a public URL
    const imageUrl = await uploadTempImage(mediaPath);
    containerBody = {
      image_url: imageUrl,
      caption: caption.text,
      access_token: token,
    };
  }

  const containerResponse = await fetch(containerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerBody),
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

async function postToX(mediaPath, caption, metadata) {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error('X (Twitter) credentials not configured');
  }

  const { TwitterApi, EUploadMimeType } = await import('twitter-api-v2');
  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });

  const isVideo = metadata.type === 'video';

  let mediaId;
  if (isVideo) {
    // Chunked upload for video (required for files > 5MB)
    mediaId = await client.v1.uploadMedia(mediaPath, {
      mimeType: EUploadMimeType.Mp4,
      chunkLength: 5 * 1024 * 1024, // 5MB chunks
    });
  } else {
    mediaId = await client.v1.uploadMedia(mediaPath);
  }

  const tweet = await client.v2.tweet({
    text: caption.text,
    media: { media_ids: [mediaId] },
  });

  const tweetId = tweet.data.id;

  // Thread reply — if caption has a thread.reply1, post it as a reply to own tweet
  if (caption.thread?.reply1) {
    try {
      await client.v2.tweet({
        text: caption.thread.reply1,
        reply: { in_reply_to_tweet_id: tweetId },
      });
    } catch (err) {
      console.warn(`  X thread reply failed (main tweet posted): ${err.message}`);
    }
  }

  return { platform: 'x', postId: tweetId, url: `https://x.com/i/status/${tweetId}` };
}

// ========== TikTok ==========

async function postToTikTok(mediaPath, caption, metadata) {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) throw new Error('TikTok credentials not configured (TIKTOK_ACCESS_TOKEN)');

  const isVideo = metadata.type === 'video';

  if (isVideo) {
    // TikTok Content Posting API v2 — Direct Post (FILE_UPLOAD)
    const fileBuffer = await fs.readFile(mediaPath);
    const videoSize = fileBuffer.byteLength;

    // Chunk size: 10 MB (TikTok requires 5–64 MB per chunk, or single chunk if <= 64 MB)
    const CHUNK_SIZE = Math.min(64 * 1024 * 1024, videoSize);
    const totalChunks = Math.ceil(videoSize / CHUNK_SIZE);

    // Step 1: Initialize upload
    const initResp = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: (caption.text || '').slice(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: CHUNK_SIZE,
          total_chunk_count: totalChunks,
        },
      }),
    });

    if (!initResp.ok) {
      const err = await initResp.text();
      throw new Error(`TikTok init ${initResp.status}: ${err}`);
    }

    const initData = await initResp.json();
    if (initData.error?.code !== 'ok') {
      throw new Error(`TikTok init error: ${initData.error?.message || JSON.stringify(initData)}`);
    }

    const { publish_id, upload_url } = initData.data;

    // Step 2: Upload video chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, videoSize);
      const chunk = fileBuffer.slice(start, end);

      const uploadResp = await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${end - 1}/${videoSize}`,
          'Content-Length': String(end - start),
        },
        body: chunk,
      });

      // TikTok returns 206 for intermediate chunks, 200/201 for final
      if (uploadResp.status !== 200 && uploadResp.status !== 201 && uploadResp.status !== 206) {
        const err = await uploadResp.text();
        throw new Error(`TikTok upload chunk ${i} failed ${uploadResp.status}: ${err}`);
      }
    }

    return { platform: 'tiktok', postId: publish_id };

  } else {
    // Photo/image post on TikTok — use PHOTO_PUBLISH endpoint
    // Upload image to temp hosting first for a public URL
    const imageUrl = await uploadTempImage(mediaPath);

    const photoResp = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: (caption.text || '').slice(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_images: [imageUrl],
          photo_cover_index: 0,
        },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      }),
    });

    if (!photoResp.ok) {
      const err = await photoResp.text();
      throw new Error(`TikTok photo post ${photoResp.status}: ${err}`);
    }

    const photoData = await photoResp.json();
    if (photoData.error?.code !== 'ok') {
      throw new Error(`TikTok photo error: ${photoData.error?.message || JSON.stringify(photoData)}`);
    }

    return { platform: 'tiktok', postId: photoData.data?.publish_id };
  }
}

// ========== YouTube Shorts ==========

async function getYouTubeAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`YouTube token refresh failed ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return data.access_token;
}

async function postToYouTube(mediaPath, caption, metadata) {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('YouTube credentials not configured (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)');
  }

  // YouTube is video-only — skip image items
  if (metadata.type !== 'video') {
    throw new Error('YouTube only supports video posts — skipping image item');
  }

  const accessToken = await getYouTubeAccessToken();

  const fileBuffer = await fs.readFile(mediaPath);
  const fileSize = fileBuffer.byteLength;

  const title = (caption.text || metadata.categoryName || 'JoyMaze').split('\n')[0].slice(0, 100);
  const description = caption.text || '';

  // Step 1: Initiate resumable upload
  const initResp = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify({
        snippet: {
          title,
          description,
          tags: caption.hashtags?.map(h => h.replace(/^#/, '')) || ['JoyMaze', 'kidsactivities'],
          categoryId: '20', // Gaming category — closest to kids activity apps
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: true,
        },
      }),
    }
  );

  if (!initResp.ok) {
    const err = await initResp.text();
    throw new Error(`YouTube init upload ${initResp.status}: ${err}`);
  }

  const uploadUrl = initResp.headers.get('Location');
  if (!uploadUrl) throw new Error('YouTube did not return upload URL');

  // Step 2: Upload video (single PUT — resumable protocol supports it for smaller files)
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileSize),
    },
    body: fileBuffer,
  });

  if (uploadResp.status !== 200 && uploadResp.status !== 201) {
    const err = await uploadResp.text();
    throw new Error(`YouTube upload failed ${uploadResp.status}: ${err}`);
  }

  const result = await uploadResp.json();
  const videoId = result.id;

  return {
    platform: 'youtube',
    postId: videoId,
    url: `https://www.youtube.com/shorts/${videoId}`,
  };
}

// ========== Posting orchestrator ==========

const POSTERS = {
  pinterest: { fn: postToPinterest, imageKey: 'pinterest' },
  instagram: { fn: postToInstagram, imageKey: 'instagram_square' },
  x:         { fn: postToX,         imageKey: 'x'               },
  tiktok:    { fn: postToTikTok,    imageKey: 'tiktok'           },
  youtube:   { fn: postToYouTube,   imageKey: null               }, // video-only
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

    // Resolve media file: video items use output/videos/, image items use output/images/
    const isVideo = metadata.type === 'video';
    let mediaPath;
    let mediaLabel;

    if (isVideo) {
      const videoFile = metadata.platforms?.[platform]?.video || metadata.outputFile;
      if (!videoFile) {
        console.log(`    ${platform}: no video file for this platform, skipping`);
        continue;
      }
      mediaPath = path.join(VIDEOS_DIR, videoFile);
      mediaLabel = videoFile;
    } else {
      const imageFilename = metadata.outputs?.[config.imageKey];
      if (!imageFilename) {
        console.log(`    ${platform}: no image for this platform, skipping`);
        continue;
      }
      mediaPath = path.join(IMAGES_DIR, imageFilename);
      mediaLabel = imageFilename;
    }

    const caption = metadata.captions[platform];

    if (DRY_RUN) {
      console.log(`    ${platform}: [DRY RUN] Would post ${isVideo ? 'video' : 'image'} ${mediaLabel}`);
      console.log(`      Caption: ${caption.rawCaption?.slice(0, 80) || caption.text?.slice(0, 80)}...`);
      console.log(`      Hashtags: ${caption.hashtags?.length || 0} tags`);
      results.push({ platform, status: 'dry-run' });
      continue;
    }

    try {
      const result = await config.fn(mediaPath, caption, metadata);
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
  // Cooldown guard — skip posting during recovery periods
  if (!DRY_RUN && await checkCooldown()) {
    process.exit(0);
  }

  const currentHour = new Date().getHours();

  console.log('=== JoyMaze Content Poster ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE POSTING'}${SCHEDULED_MODE ? ' (scheduled-hour filter ON)' : ''}`);
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

    // Skip x-text queue files — those are handled by post-x-scheduled.mjs
    if (filename.startsWith('x-text-')) {
      skipped++;
      continue;
    }

    // Scheduled-hour filter: only post items whose time slot has arrived
    if (SCHEDULED_MODE && Number.isFinite(metadata.scheduledHour) && metadata.scheduledHour > currentHour) {
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

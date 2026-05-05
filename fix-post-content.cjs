const fs = require('fs');
const content = fs.readFileSync('scripts/post-content.mjs', 'utf8');

const oldStart = 'async function postContent(metadata) {';
const oldEnd = '// ========== Main ==========';
const oldIdx = content.indexOf(oldStart);
const endIdx = content.indexOf(oldEnd);

if (oldIdx === -1 || endIdx === -1) {
  console.error('Could not find postContent function boundaries. oldIdx=' + oldIdx + ', endIdx=' + endIdx);
  process.exit(1);
}

// Build new postContent as a plain string (no template literals to avoid $ interpolation)
const NL = '\n';
const newFunc =
  'async function postContent(metadata) {' + NL +
  '  const results = [];' + NL +
  NL +
  '  for (const [platform, config] of Object.entries(POSTERS)) {' + NL +
  '    if (FILTER_PLATFORM && platform !== FILTER_PLATFORM) continue;' + NL +
  NL +
  '    const platformStatus = metadata.platforms?.[platform]?.status;' + NL +
  '    if (platformStatus === \'posted\') {' + NL +
  '      console.log(`    ${platform}: already posted, skipping`);' + NL +
  '      continue;' + NL +
  '    }' + NL +
  '    if (!metadata.captions?.[platform]) {' + NL +
  '      console.log(`    ${platform}: no caption, skipping`);' + NL +
  '      continue;' + NL +
  '    }' + NL +
  NL +
  '    // Resolve media file: video items use output/videos/, image items use output/images/' + NL +
  '    const isVideo = metadata.type === \'video\';' + NL +
  '    let mediaPath;' + NL +
  '    let mediaLabel;' + NL +
  '    if (isVideo) {' + NL +
  '      const videoFile = metadata.platforms?.[platform]?.video || metadata.outputFile;' + NL +
  '      if (!videoFile) {' + NL +
  '        console.log(`    ${platform}: no video file for this platform, skipping`);' + NL +
  '        continue;' + NL +
  '      }' + NL +
  '      const localVideo = path.join(VIDEOS_DIR, videoFile);' + NL +
  '      mediaPath = await resolveMedia(localVideo, metadata.cloudUrl);' + NL +
  '      mediaLabel = videoFile;' + NL +
  '    } else {' + NL +
  '      const imageFilename = metadata.outputs?.[config.imageKey];' + NL +
  '      if (!imageFilename) {' + NL +
  '        console.log(`    ${platform}: no image for this platform, skipping`);' + NL +
  '        continue;' + NL +
  '      }' + NL +
  '      const localImage = path.join(IMAGES_DIR, imageFilename);' + NL +
  '      const cloudFallback = metadata.cloudUrls?.[config.imageKey];' + NL +
  '      mediaPath = await resolveMedia(localImage, cloudFallback);' + NL +
  '      mediaLabel = imageFilename;' + NL +
  '    }' + NL +
  NL +
  '    // Guard: resolved path does not exist (local + cloud fallback both failed/missing)' + NL +
  '    if (!existsSync(mediaPath)) {' + NL +
  '      console.log(`    ${platform}: media file not found locally, skipping -- run generate-images.mjs to produce assets`);' + NL +
  '      continue;' + NL +
  '    }' + NL +
  NL +
  '    const caption = metadata.captions[platform];' + NL +
  NL +
  '    if (DRY_RUN) {' + NL +
  '      console.log(`    ${platform}: [DRY RUN] Would post ${isVideo ? \'video\' : \'image\'} ${mediaLabel}`);' + NL +
  '      console.log(`      Caption: ${caption.rawCaption?.slice(0, 80) || caption.text?.slice(0, 80)}...`);' + NL +
  '      console.log(`      Hashtags: ${caption.hashtags?.length || 0} tags`);' + NL +
  '      results.push({ platform, status: \'dry-run\' });' + NL +
  '      continue;' + NL +
  '    }' + NL +
  NL +
  '    try {' + NL +
  '      const result = await config.fn(mediaPath, caption, metadata);' + NL +
  '      console.log(`    ${platform}: POSTED (${result.postId || \'ok\'})`);' + NL +
  '      if (result.url) console.log(`      URL: ${result.url}`);' + NL +
  NL +
  '      // Update metadata' + NL +
  '      metadata.platforms[platform] = {' + NL +
  '        ...metadata.platforms[platform],' + NL +
  '        status: \'posted\',' + NL +
  '        postId: result.postId,' + NL +
  '        postedAt: new Date().toISOString(),' + NL +
  '        url: result.url,' + NL +
  '      };' + NL +
  '      results.push({ platform, status: \'posted\', ...result });' + NL +
  '    } catch (err) {' + NL +
  '      console.log(`    ${platform}: FAILED -- ${err.message}`);' + NL +
  '      metadata.platforms[platform] = {' + NL +
  '        ...metadata.platforms[platform],' + NL +
  '        status: \'failed\',' + NL +
  '        error: err.message,' + NL +
  '        failedAt: new Date().toISOString(),' + NL +
  '      };' + NL +
  '      results.push({ platform, status: \'failed\', error: err.message });' + NL +
  '    }' + NL +
  '  }' + NL +
  NL +
  '  return results;' + NL +
  '}' + NL +
  NL +
  '// ========== Main ==========';

const before = content.substring(0, oldIdx);
const after = content.substring(endIdx);

if (!after.startsWith('// ========== Main ==========')) {
  console.error('After text does not start with Main marker!');
  console.error(JSON.stringify(after.substring(0, 100)));
  process.exit(1);
}

const fixed = before + newFunc + after.substring('// ========== Main =========='.length);

fs.writeFileSync('scripts/post-content.mjs', fixed);
console.log('Done. Wrote', fixed.length, 'chars');

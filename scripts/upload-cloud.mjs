/**
 * upload-cloud.mjs — Cloudinary upload utility
 * Used by all generation scripts to host media for GitHub Actions posting.
 * Returns a stable public URL for the uploaded file.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import 'dotenv/config';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY    = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

/**
 * Upload a local file to Cloudinary.
 * @param {string} localPath  — absolute or relative path to the file
 * @param {string} folder     — Cloudinary folder (e.g. 'joymaze/images')
 * @returns {Promise<string>} — secure_url of the uploaded asset
 */
export async function uploadToCloud(localPath, folder = 'joymaze') {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error('Cloudinary credentials missing — check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env');
  }

  const fileBuffer = fs.readFileSync(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const isVideo = ['.mp4', '.mov', '.webm'].includes(ext);
  const resourceType = isVideo ? 'video' : 'image';

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = `${folder}/${path.basename(localPath, ext)}-${timestamp}`;

  // Build signature
  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha1')
    .update(paramsToSign + API_SECRET)
    .digest('hex');

  // Build multipart form
  const boundary = '----CloudinaryBoundary' + Date.now();
  const parts = [
    fieldPart('api_key', API_KEY, boundary),
    fieldPart('timestamp', timestamp, boundary),
    fieldPart('folder', folder, boundary),
    fieldPart('public_id', publicId, boundary),
    fieldPart('signature', signature, boundary),
    filePart(localPath, fileBuffer, boundary),
    Buffer.from(`--${boundary}--\r\n`),
  ];
  const body = Buffer.concat(parts);

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
    body,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Cloudinary upload failed (${response.status}): ${err}`);
  }

  const result = await response.json();
  return result.secure_url;
}

function fieldPart(name, value, boundary) {
  return Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  );
}

function filePart(filePath, buffer, boundary) {
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
  );
  return Buffer.concat([header, buffer, Buffer.from('\r\n')]);
}

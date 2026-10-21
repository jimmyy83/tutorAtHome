import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { storeCloudMedia, validateImageFile } from './imageAssets.js';
import { v2 as cloudinary } from 'cloudinary';

function png(width = 256, height = 256) {
  const crc32 = buffer => {
    let crc = 0xffffffff;
    for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, data) => {
    const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
    return Buffer.concat([length, type, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const scanline = Buffer.alloc(width * 4 + 1);
  const rows = Buffer.alloc(scanline.length * height);
  for (let y = 0; y < height; y++) scanline.copy(rows, y * scanline.length);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const imageFile = (buffer = png(), mimetype = 'image/png') => ({ buffer, mimetype, size: buffer.length, originalname: 'profile.png' });

test('accepts a correctly signed PNG with valid dimensions', async () => {
  assert.deepEqual(await validateImageFile(imageFile()), { mime: 'image/png', width: 256, height: 256 });
});

test('rejects a non-image payload and a spoofed MIME type', async () => {
  await assert.rejects(validateImageFile(imageFile(Buffer.from('not an image'))), error => error.status === 415);
  await assert.rejects(validateImageFile(imageFile(png(), 'image/jpeg')), error => error.status === 415);
});

test('rejects oversized images before decoding', async () => {
  const buffer = Buffer.alloc(5 * 1024 * 1024 + 1);
  await assert.rejects(validateImageFile(imageFile(buffer)), error => error.status === 413);
});

test('rejects undersized dimensions', async () => {
  await assert.rejects(validateImageFile(imageFile(png(80, 256))), error => error.status === 422);
});

test('turns a failed Cloudinary upload into a safe server error', async () => {
  const original = cloudinary.uploader.upload_stream;
  cloudinary.uploader.upload_stream = (_options, callback) => ({ end: () => callback(new Error('private provider details')) });
  try {
    await assert.rejects(storeCloudMedia(imageFile(), 'teachers'), error => error.status === 502 && /Cloud image upload failed/.test(error.message));
  } finally { cloudinary.uploader.upload_stream = original; }
});

test('Cloudinary enabled without credentials fails startup with a safe configuration error', () => {
  const env = { ...process.env, NODE_ENV: 'test', CLOUDINARY_ENABLED: 'true' };
  delete env.CLOUDINARY_CLOUD_NAME;
  delete env.CLOUDINARY_API_KEY;
  delete env.CLOUDINARY_API_SECRET;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import('./src/config.js')"], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required/);
  assert.doesNotMatch(result.stderr, /mongodb\+srv:\/\/|password=[^<\s]/i);
});

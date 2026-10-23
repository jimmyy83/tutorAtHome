import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { HttpError } from './middleware.js';
import { MAX_TEACHER_UPLOAD_BYTES, validateTeacherRegistrationFiles } from './teacherRegistrationFiles.js';

function png(width = 256, height = 256) {
  const crc32 = buffer => { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (name, data) => { const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([type, data]))); return Buffer.concat([length, type, data, checksum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const scanline = Buffer.alloc(width * 4 + 1), rows = Buffer.alloc(scanline.length * height); for (let y = 0; y < height; y++) scanline.copy(rows, y * scanline.length);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const pdf = Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF');
const file = (buffer, mimetype, originalname) => ({ buffer, mimetype, size: buffer.length, originalname });
const validFiles = () => ({ profilePhoto: [file(png(), 'image/jpeg', 'portrait.png')], qualificationProof: [file(pdf, 'application/octet-stream', 'degree.pdf')] });

function validateFiles(files) {
  const req = { files };
  return new Promise((resolve, reject) => validateTeacherRegistrationFiles(req, {}, error => error ? reject(error) : resolve(req)));
}

test('accepts required files from their signatures and records verified metadata', async () => {
  const req = await validateFiles(validFiles());
  assert.equal(req.validatedTeacherFiles.profilePhoto.mime, 'image/png');
  assert.equal(req.validatedTeacherFiles.profilePhoto.format, 'png');
  assert.equal(req.validatedTeacherFiles.qualificationProof.mime, 'application/pdf');
  assert.equal(req.validatedTeacherFiles.qualificationProof.format, 'pdf');
});

test('rejects a missing profile photo or qualification proof', async () => {
  await assert.rejects(validateFiles({ qualificationProof: validFiles().qualificationProof }), error => error instanceof HttpError && error.status === 422 && !!error.details.profilePhoto);
  await assert.rejects(validateFiles({ profilePhoto: validFiles().profilePhoto }), error => error instanceof HttpError && error.status === 422 && !!error.details.qualificationProof);
});

test('rejects file content that is not an allowed image or document', async () => {
  const files = validFiles();
  files.profilePhoto = [file(Buffer.from('not an image'), 'image/png', 'portrait.png')];
  await assert.rejects(validateFiles(files), error => error instanceof HttpError && error.status === 415);
  const invalidProof = validFiles();
  invalidProof.qualificationProof = [file(Buffer.from('not a document'), 'application/pdf', 'proof.pdf')];
  await assert.rejects(validateFiles(invalidProof), error => error instanceof HttpError && error.status === 415);
});

test('rejects either file above the 5 MB limit', async () => {
  const files = validFiles();
  files.qualificationProof[0].size = MAX_TEACHER_UPLOAD_BYTES + 1;
  await assert.rejects(validateFiles(files), error => error instanceof HttpError && error.status === 413);
});

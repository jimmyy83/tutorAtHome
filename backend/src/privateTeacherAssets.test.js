import test from 'node:test';
import assert from 'node:assert/strict';
import { v2 as cloudinary } from 'cloudinary';
import { deletePrivateTeacherAsset, uploadPrivateTeacherAsset } from './cloudinary.js';

test('teacher application assets upload and delete using authenticated Cloudinary delivery', async () => {
  const originalUpload = cloudinary.uploader.upload_stream;
  const originalDestroy = cloudinary.uploader.destroy;
  let uploadOptions, destroyOptions;
  try {
    cloudinary.uploader.upload_stream = (options, callback) => {
      uploadOptions = options;
      return { end(buffer) { callback(null, { public_id: `${options.folder}/${options.public_id}`, format: 'pdf', bytes: buffer.length }); } };
    };
    cloudinary.uploader.destroy = async (_publicId, options) => { destroyOptions = options; return { result: 'ok' }; };
    const asset = await uploadPrivateTeacherAsset(Buffer.from('%PDF-1.4'), { folder: 'qualification-proofs', resourceType: 'raw', format: 'pdf' });
    assert.equal(uploadOptions.resource_type, 'raw');
    assert.equal(uploadOptions.type, 'authenticated');
    assert.match(uploadOptions.folder, /^tutorathome\/private\/teacher-applications\/qualification-proofs$/);
    assert.match(asset.public_id, /\.pdf$/);
    assert.equal(await deletePrivateTeacherAsset(asset.public_id, 'raw'), true);
    assert.equal(destroyOptions.resource_type, 'raw');
    assert.equal(destroyOptions.type, 'authenticated');
  } finally {
    cloudinary.uploader.upload_stream = originalUpload;
    cloudinary.uploader.destroy = originalDestroy;
  }
});

test('private teacher asset upload failures are surfaced to the registration workflow', async () => {
  const originalUpload = cloudinary.uploader.upload_stream;
  try {
    cloudinary.uploader.upload_stream = (_options, callback) => ({ end() { callback(new Error('provider failure')); } });
    await assert.rejects(uploadPrivateTeacherAsset(Buffer.from('x'), { folder: 'profile-photos', resourceType: 'image' }), /provider failure/);
  } finally { cloudinary.uploader.upload_stream = originalUpload; }
});

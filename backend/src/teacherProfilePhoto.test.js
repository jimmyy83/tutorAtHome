import test from 'node:test';
import assert from 'node:assert/strict';
import { hasTeacherProfilePhoto, teacherProfilePhotoVersion } from './teacherProfilePhoto.js';

test('detects a valid privately stored registration photo from JSON or parsed data', () => {
  const application = { documents: { profilePhoto: { publicId: 'private/photo', resourceType: 'image', format: 'png', mimeType: 'image/png' } } };
  assert.equal(hasTeacherProfilePhoto(application), true);
  assert.equal(hasTeacherProfilePhoto(JSON.stringify(application)), true);
});

test('does not treat missing, malformed, or non-image document references as profile photos', () => {
  assert.equal(hasTeacherProfilePhoto(null), false);
  assert.equal(hasTeacherProfilePhoto('{invalid json'), false);
  assert.equal(hasTeacherProfilePhoto({ documents: { profilePhoto: { publicId: 'private/file', resourceType: 'raw', format: 'pdf', mimeType: 'application/pdf' } } }), false);
  assert.equal(hasTeacherProfilePhoto({ documents: { profilePhoto: { publicId: 'private/photo', resourceType: 'image', format: 'svg', mimeType: 'image/svg+xml' } } }), false);
});

test('photo cache version is stable for the same asset and never returns the private public_id', () => {
  const first = { documents: { profilePhoto: { publicId: 'private/photo-a', resourceType: 'image', format: 'png', mimeType: 'image/png' } } };
  const same = JSON.stringify(first);
  const replacement = { documents: { profilePhoto: { ...first.documents.profilePhoto, publicId: 'private/photo-b' } } };
  const version = teacherProfilePhotoVersion(first);
  assert.match(version, /^[a-f0-9]{24}$/);
  assert.equal(teacherProfilePhotoVersion(same), version);
  assert.notEqual(teacherProfilePhotoVersion(replacement), version);
  assert.notEqual(version, first.documents.profilePhoto.publicId);
  assert.equal(teacherProfilePhotoVersion({ documents: {} }), '');
});

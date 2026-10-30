import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldLoadTeacherProfilePhoto } from '../utils/adminTeacherProfilePhoto.js';

test('private teacher photos load only when a card is near the viewport and is not cached', () => {
  assert.equal(shouldLoadTeacherProfilePhoto({ nearViewport: false, hasPhoto: true, version: 'v1', cached: false, failed: false }), false);
  assert.equal(shouldLoadTeacherProfilePhoto({ nearViewport: true, hasPhoto: true, version: 'v1', cached: false, failed: false }), true);
  assert.equal(shouldLoadTeacherProfilePhoto({ nearViewport: true, hasPhoto: true, version: 'v1', cached: true, failed: false }), false);
  assert.equal(shouldLoadTeacherProfilePhoto({ nearViewport: true, hasPhoto: true, version: 'v1', cached: false, failed: true }), false);
  assert.equal(shouldLoadTeacherProfilePhoto({ nearViewport: true, hasPhoto: false, version: 'v1', cached: false, failed: false }), false);
});

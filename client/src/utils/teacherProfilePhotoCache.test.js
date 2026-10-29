import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearTeacherProfilePhotoCache,
  getTeacherProfilePhoto,
  pruneTeacherProfilePhotoCache,
  revokeTeacherProfilePhoto,
  teacherProfilePhotoCacheKey,
} from './teacherProfilePhotoCache.js';

test('authenticated profile photo downloads are reused by teacher ID and asset version', async () => {
  const cache = new Map();
  const requests = new Map();
  const previousCreate = URL.createObjectURL;
  let calls = 0;
  URL.createObjectURL = () => `blob:photo-${++calls}`;
  try {
    const api = { download: async () => { calls += 1; return new Blob(['photo'], { type: 'image/png' }); } };
    const first = await getTeacherProfilePhoto({ cache, requests, api, teacherId: 51, version: 'ver-a', authToken: 'admin' });
    const second = await getTeacherProfilePhoto({ cache, requests, api, teacherId: 51, version: 'ver-a', authToken: 'admin' });
    const replacement = await getTeacherProfilePhoto({ cache, requests, api, teacherId: 51, version: 'ver-b', authToken: 'admin' });
    assert.equal(first.url, second.url);
    assert.notEqual(first.url, replacement.url);
    assert.equal(cache.size, 2);
    assert.equal(teacherProfilePhotoCacheKey(51, 'ver-a'), first.key);
    assert.equal(calls, 4, 'one API download and one blob URL creation per version');
  } finally {
    URL.createObjectURL = previousCreate;
  }
});

test('in-flight photo requests are shared and failed downloads are not cached', async () => {
  const cache = new Map();
  const requests = new Map();
  const previousCreate = URL.createObjectURL;
  URL.createObjectURL = () => 'blob:shared';
  try {
    let resolveDownload;
    let calls = 0;
    const api = { download: () => { calls += 1; return new Promise(resolve => { resolveDownload = resolve; }); } };
    const options = { cache, requests, api, teacherId: 9, version: 'v1', authToken: 'admin' };
    const first = getTeacherProfilePhoto(options);
    const second = getTeacherProfilePhoto(options);
    assert.equal(calls, 1);
    resolveDownload(new Blob(['image'], { type: 'image/jpeg' }));
    assert.equal((await first).url, (await second).url);
    const brokenCache = new Map(), brokenRequests = new Map();
    const brokenApi = { download: async () => { throw new Error('offline'); } };
    await assert.rejects(getTeacherProfilePhoto({ ...options, cache: brokenCache, requests: brokenRequests, api: brokenApi }));
    assert.equal(brokenCache.size, 0);
    assert.equal(brokenRequests.size, 0);
  } finally {
    URL.createObjectURL = previousCreate;
  }
});

test('cache invalidation and session cleanup revoke only cached image object URLs', () => {
  const cache = new Map([['1:v1', 'blob:old'], ['2:v1', 'blob:other']]);
  const requests = new Map([['pending', Promise.resolve()]]);
  const previousRevoke = URL.revokeObjectURL;
  const revoked = [];
  URL.revokeObjectURL = url => revoked.push(url);
  try {
    pruneTeacherProfilePhotoCache(cache, 1, '1:v2');
    assert.equal(cache.has('1:v1'), false);
    assert.equal(cache.has('2:v1'), true);
    assert.deepEqual(revoked, ['blob:old']);
    assert.equal(revokeTeacherProfilePhoto(cache, 'missing'), false);
    clearTeacherProfilePhotoCache(cache, requests);
    assert.equal(cache.size, 0);
    assert.equal(requests.size, 0);
    assert.deepEqual(revoked, ['blob:old', 'blob:other']);
  } finally {
    URL.revokeObjectURL = previousRevoke;
  }
});

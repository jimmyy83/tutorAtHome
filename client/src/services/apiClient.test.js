import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from './apiClient.js';

test('multipart POST leaves Content-Type to the browser and preserves request correlation id', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ reference: 'TEST-REF' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'safe-request-id' },
    });
  };
  try {
    const body = new FormData();
    body.append('application', JSON.stringify({ personal: { fullName: 'Sample' } }));
    body.append('profilePhoto', new Blob(['image']), 'profile.jpg');
    const response = await api.post('/public/teacher-registrations', body);
    assert.equal(response.reference, 'TEST-REF');
    assert.match(request.url, /\/public\/teacher-registrations$/);
    assert.equal(request.options.body, body);
    assert.equal(Object.keys(request.options.headers).some(key => key.toLowerCase() === 'content-type'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API errors retain HTTP status, safe message, and request id', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Could not save application.', code: 'SAVE_FAILED' } }), {
    status: 500,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'safe-request-id' },
  });
  try {
    await assert.rejects(api.post('/public/teacher-registrations', new FormData()), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 500);
      assert.equal(error.code, 'SAVE_FAILED');
      assert.equal(error.requestId, 'safe-request-id');
      assert.equal(error.message, 'Could not save application.');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

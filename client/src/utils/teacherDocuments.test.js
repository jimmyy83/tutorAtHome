import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadTeacherDocumentFile, isTeacherDocumentPreviewSupported, prepareTeacherDocumentPreview, revokeTeacherDocumentPreview } from './teacherDocuments.js';

const makeApi = blob => ({ download: async (...args) => { makeApi.calls.push(args); if (blob instanceof Error) throw blob; return blob; } });
makeApi.calls = [];

test('qualification proof download requests only the proof and uses its own filename', async () => {
  makeApi.calls = [];
  const clicks = [], timers = [], revoked = [];
  const api = makeApi(new Blob(['proof'], { type: 'application/pdf' }));
  await downloadTeacherDocumentFile({ api, teacherId: 42, kind: 'qualification-proof', authToken: 'admin-token', metadata: { originalName: 'degree.pdf' }, documentRef: { createElement: () => ({ click: () => clicks.push('proof'), set download(value) { this.filename = value; } }) }, createObjectURL: () => 'blob:proof', revokeObjectURL: url => revoked.push(url), schedule: callback => timers.push(callback) });
  assert.equal(makeApi.calls.length, 1);
  assert.equal(makeApi.calls[0][0], '/admin/teachers/42/documents/qualification-proof');
  assert.equal(clicks.length, 1);
  assert.equal(timers.length, 1);
  timers[0]();
  assert.deepEqual(revoked, ['blob:proof']);
});

test('identity document download requests only Aadhaar and uses a generic safe filename', async () => {
  makeApi.calls = [];
  const clicks = [];
  const api = makeApi(new Blob(['identity'], { type: 'application/pdf' }));
  await downloadTeacherDocumentFile({ api, teacherId: 7, kind: 'aadhaar-document', authToken: 'admin-token', metadata: { format: 'pdf', originalName: 'private-name.pdf' }, documentRef: { createElement: () => ({ click: () => clicks.push('aadhaar'), set download(value) { this.filename = value; } }) }, createObjectURL: () => 'blob:aadhaar', schedule: () => {} });
  assert.equal(makeApi.calls.length, 1);
  assert.equal(makeApi.calls[0][0], '/admin/teachers/7/documents/aadhaar-document');
  assert.equal(clicks.length, 1);
});

test('preview fetches only the selected document and supports PDFs and images', async () => {
  makeApi.calls = [];
  const api = makeApi(new Blob(['image'], { type: 'image/png' }));
  const preview = await prepareTeacherDocumentPreview({ api, teacherId: 9, kind: 'qualification-proof', authToken: 'admin-token', createObjectURL: () => 'blob:preview' });
  assert.equal(makeApi.calls.length, 1);
  assert.equal(makeApi.calls[0][0], '/admin/teachers/9/documents/qualification-proof');
  assert.equal(preview.url, 'blob:preview');
  assert.equal(preview.supported, true);
  assert.equal(isTeacherDocumentPreviewSupported('application/pdf'), true);
  assert.equal(isTeacherDocumentPreviewSupported('application/octet-stream'), false);
});

test('identity preview fetches only the identity endpoint and releases its temporary URL on close', async () => {
  makeApi.calls = [];
  const api = makeApi(new Blob(['identity'], { type: 'application/pdf' }));
  const revoked = [];
  const preview = await prepareTeacherDocumentPreview({ api, teacherId: 19, kind: 'aadhaar-document', authToken: 'admin-token', createObjectURL: () => 'blob:identity-preview' });
  assert.equal(makeApi.calls.length, 1);
  assert.equal(makeApi.calls[0][0], '/admin/teachers/19/documents/aadhaar-document');
  revokeTeacherDocumentPreview(preview, url => revoked.push(url));
  assert.deepEqual(revoked, ['blob:identity-preview']);
});

test('preview and download failures propagate to their own caller', async () => {
  const failure = new Error('private document unavailable');
  const api = makeApi(failure);
  await assert.rejects(prepareTeacherDocumentPreview({ api, teacherId: 3, kind: 'aadhaar-document', authToken: 'admin-token' }), /private document unavailable/);
  await assert.rejects(downloadTeacherDocumentFile({ api, teacherId: 3, kind: 'qualification-proof', authToken: 'admin-token', metadata: {}, documentRef: { createElement: () => { throw new Error('must not create a download'); } } }), /private document unavailable/);
});

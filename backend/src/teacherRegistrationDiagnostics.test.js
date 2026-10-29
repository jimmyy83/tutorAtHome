import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRequestId, commitTeacherRecordOrConfirm, parentEnquiryFailureLog, teacherRegistrationFailureLog } from './teacherRegistrationDiagnostics.js';

test('request correlation id is attached without using submitted data', () => {
  const req = { body: { personal: { email: 'private@example.test' } } };
  let header;
  attachRequestId(req, { setHeader: (name, value) => { header = [name, value]; } }, () => {});
  assert.equal(header[0], 'X-Request-ID');
  assert.equal(header[1], req.requestId);
  assert.match(req.requestId, /^[0-9a-f-]{36}$/i);
  assert.doesNotMatch(req.requestId, /private|example/);
});

test('teacher failure diagnostics include only correlation, stage, status and safe category', () => {
  const personalError = new Error('private email, document path, provider credential');
  const entry = teacherRegistrationFailureLog({ requestId: 'request-123', stage: 'database_commit', status: 500, error: personalError });
  assert.deepEqual(entry, {
    event: 'teacher_registration_failed', requestId: 'request-123', stage: 'database_commit',
    status: 500, category: 'database_write_failure',
  });
  assert.doesNotMatch(JSON.stringify(entry), /private email|document path|provider credential/);
});

test('teacher failure diagnostics classify upload, rate-limit and validation errors safely', () => {
  for (const stage of ['profile_photo_upload', 'qualification_proof_upload', 'aadhaar_document_upload']) {
    const upload = teacherRegistrationFailureLog({ stage, status: 502 });
    assert.equal(upload.category, 'file_storage_failure');
    assert.equal(upload.failureReason, 'provider_upload_failure');
  }
  assert.equal(teacherRegistrationFailureLog({ stage: 'rate_limit', status: 429 }).category, 'rate_limited');
  assert.equal(teacherRegistrationFailureLog({ stage: 'schema_validation', status: 422 }).category, 'validation_rejected');
  assert.equal(teacherRegistrationFailureLog({ stage: 'multipart_parse', status: 400, error: { name: 'MulterError' } }).category, 'multipart_rejected');
});

test('teacher upload diagnostics classify provider auth, network, rejection, and missing metadata without raw messages', () => {
  const cases = [
    [{ http_code: 401, message: 'secret account detail' }, 'provider_authentication_rejected', undefined, 401],
    [{ http_code: 422, message: 'document-specific provider response' }, 'provider_request_rejected', undefined, 422],
    [{ http_code: 503, message: 'secret provider response' }, 'provider_server_failure', undefined, 503],
    [{ code: 'ECONNRESET', message: 'private request details' }, 'provider_network_failure', 'ECONNRESET', undefined],
    [{ code: 'CLOUDINARY_METADATA_INCOMPLETE', message: 'internal explanation' }, 'incomplete_upload_metadata', undefined, undefined],
    [{ code: 'CLOUDINARY_FORMAT_MISMATCH', message: 'internal explanation' }, 'provider_metadata_mismatch', undefined, undefined],
  ];
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    for (const [cause, failureReason, providerCode, providerStatus] of cases) {
      const error = new Error('generic HTTP wrapper');
      error.cause = cause;
      const entry = teacherRegistrationFailureLog({ requestId: 'request-safe', stage: 'aadhaar_document_upload', status: 502, error });
      assert.equal(entry.failureReason, failureReason);
      if (providerCode) assert.equal(entry.providerCode, providerCode);
      if (providerStatus) assert.equal(entry.providerStatus, providerStatus);
      assert.doesNotMatch(JSON.stringify(entry), /secret account|document-specific|private request|internal explanation/);
    }
    process.env.NODE_ENV = 'production';
    const error = new Error('wrapper'); error.cause = { code: 'ECONNRESET', http_code: 503, message: 'private provider body' };
    const productionEntry = teacherRegistrationFailureLog({ requestId: 'request-safe', stage: 'profile_photo_upload', status: 502, error });
    assert.equal(productionEntry.failureReason, 'provider_network_failure');
    assert.equal('providerCode' in productionEntry, false);
    assert.equal(productionEntry.providerStatus, 503);
    assert.doesNotMatch(JSON.stringify(productionEntry), /private provider body|ECONNRESET/);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test('successful teacher persistence needs no cleanup', async () => {
  const result = await commitTeacherRecordOrConfirm({ write: async () => {}, readBack: async () => false });
  assert.deepEqual(result, { persisted: true, safeToCleanAssets: false });
});

test('ambiguous teacher transaction is recovered when read-back finds the committed record', async () => {
  const result = await commitTeacherRecordOrConfirm({
    write: async () => { throw new Error('commit acknowledgement lost'); },
    readBack: async () => true,
  });
  assert.equal(result.persisted, true);
  assert.equal(result.recoveredAfterAmbiguousCommit, true);
  assert.equal(result.safeToCleanAssets, false);
});

test('teacher assets are cleanup-safe only when read-back confirms no record exists', async () => {
  const absent = await commitTeacherRecordOrConfirm({ write: async () => { throw new Error('write rejected'); }, readBack: async () => false });
  assert.equal(absent.persisted, false);
  assert.equal(absent.safeToCleanAssets, true);
  const unknown = await commitTeacherRecordOrConfirm({ write: async () => { throw new Error('write outcome unknown'); }, readBack: async () => { throw new Error('read failed'); } });
  assert.equal(unknown.persisted, false);
  assert.equal(unknown.safeToCleanAssets, false);
});

test('parent enquiry diagnostics pinpoint safe stages without recording raw exception details', () => {
  const entry = parentEnquiryFailureLog({
    requestId: 'request-456', stage: 'transaction_commit', status: 500,
    error: new Error('private parent phone, Mongo URI, and document data'),
  });
  assert.deepEqual(entry, {
    event: 'parent_enquiry_failed', requestId: 'request-456', stage: 'transaction_commit',
    status: 500, category: 'database_transaction_failure',
  });
  assert.doesNotMatch(JSON.stringify(entry), /private parent phone|Mongo URI|document data/);
  assert.equal(parentEnquiryFailureLog({ stage: 'idempotency_lookup', status: 500 }).category, 'idempotency_storage_failure');
  assert.equal(parentEnquiryFailureLog({ stage: 'schema_validation', status: 422 }).category, 'validation_rejected');
});

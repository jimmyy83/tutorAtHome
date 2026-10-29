import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPermanentDeleteEligible, executePermanentDelete, parsePermanentDeleteId, retainedAssetReferences, retainedTeacherConsent,
} from './adminPermanentDelete.js';
import { requireAdmin, signToken } from './middleware.js';
import { archivedDeleteSchema, bulkPermanentDeleteSchema, permanentDeleteConfirmationSchema } from './schemas.js';

test('accepts only valid positive safe integer record identifiers', () => {
  assert.equal(parsePermanentDeleteId('42'), 42);
  for (const id of ['', '0', '-1', '1.5', '1e4', '9007199254740992', 'admins']) assert.throws(() => parsePermanentDeleteId(id));
});

test('protects active enquiries and pending or approved teacher registrations', () => {
  assert.throws(() => assertPermanentDeleteEligible('parentEnquiries', { status: 'new' }), /Only closed parent enquiries/);
  assert.throws(() => assertPermanentDeleteEligible('teacherRegistrations', { status: 'pending' }), /Only rejected teacher registrations/);
  assert.throws(() => assertPermanentDeleteEligible('teacherRegistrations', { status: 'approved' }), /Only rejected teacher registrations/);
  assert.doesNotThrow(() => assertPermanentDeleteEligible('teacherRegistrations', { status: 'rejected' }));
  assert.doesNotThrow(() => assertPermanentDeleteEligible('parentEnquiries', { status: 'closed' }));
});

test('unauthorized requests fail admin authorization before deletion', () => {
  let error;
  requireAdmin(['admin'])({ headers: {} }, {}, value => { error = value; });
  assert.equal(error.status, 401);
  let roleError;
  requireAdmin(['admin'])({ headers: { authorization: `Bearer ${signToken({ id: 10, role: 'editor', name: 'Editor', email: 'editor@example.test' })}` } }, {}, value => { roleError = value; });
  assert.equal(roleError.status, 403);
});

test('requires explicit individual confirmation and typed bulk confirmation', () => {
  assert.equal(permanentDeleteConfirmationSchema.safeParse({ confirm: true }).success, true);
  assert.equal(permanentDeleteConfirmationSchema.safeParse({}).success, false);
  const bulk = { recordType: 'parentEnquiries', startDate: '2026-10-01', endDate: '2026-10-02', expectedCount: 2, expectedDigest: 'a'.repeat(64), mode: 'permanent_delete' };
  assert.equal(bulkPermanentDeleteSchema.safeParse({ ...bulk, confirmation: 'DELETE' }).success, true);
  assert.equal(bulkPermanentDeleteSchema.safeParse({ ...bulk, confirmation: 'delete' }).success, false);
  assert.equal(archivedDeleteSchema.safeParse({ recordType: 'admins', ids: [1], expectedCount: 1, expectedDigest: 'a'.repeat(64), confirmation: 'DELETE' }).success, false);
});

test('retains teacher consent and associated Cloudinary identifiers without retaining application details', async () => {
  const record = { id: 7, status: 'rejected', full_name: 'private name', public_photo_id: 'tutorathome/teachers/profile-7', public_photo: 'https://res.cloudinary.com/example/image/upload/profile-7.jpg', data: JSON.stringify({ personal: { address: 'private address' }, documents: { aadhaarDocument: { publicId: 'tutorathome/private/aadhaar-7', secure_url: 'https://res.cloudinary.com/example/private/aadhaar-7' } }, termsConsent: { accepted: true, acceptedAt: '2026-01-01T00:00:00Z', versionId: 'terms-v4', versionNumber: 4 } }) };
  const refs = retainedAssetReferences(record, 'teacherRegistrations', 7, '2026-10-28T00:00:00Z');
  assert.ok(refs.some(ref => ref.public_id === 'tutorathome/teachers/profile-7'));
  assert.ok(refs.some(ref => ref.public_id === 'tutorathome/private/aadhaar-7'));
  assert.ok(refs.every(ref => !JSON.stringify(ref).includes('private address')));
  assert.deepEqual(retainedTeacherConsent(record, 7, '2026-10-28T00:00:00Z'), {
    teacher_id: 7, accepted: true, terms_version_id: 'terms-v4', terms_version_number: 4, accepted_at: '2026-01-01T00:00:00Z', retained_at: '2026-10-28T00:00:00Z',
  });

  const calls = { deleted: [], notes: [], consent: [], assets: [], audits: [] };
  const collection = { deleteMany: async query => { calls.deleted.push(query); return { deletedCount: 1 }; } };
  const insertCollection = key => ({ insertOne: async row => calls[key].push(row), insertMany: async rows => calls[key].push(...rows) });
  const result = await executePermanentDelete({ collection, consentCollection: insertCollection('consent'), retainedAssetsCollection: insertCollection('assets'), auditCollection: insertCollection('audits'), records: [record], recordType: 'teacherRegistrations', actor: { id: 1, email: 'admin@example.test' }, createdAt: '2026-10-28T00:00:00Z', actionId: 90, session: {} });
  assert.deepEqual(result, { deletedCount: 1, deletedInternalNotes: 0, deletedIdempotencyRecords: 0, deletedPhoneClaims: 0, retainedAssetReferences: refs.length, retainedConsentRecords: 1 });
  assert.equal(calls.audits[0].action, 'permanent_delete');
  assert.equal(calls.audits[0].record_id, 7);
  assert.equal(Object.hasOwn(calls.audits[0], 'email'), false);
  assert.equal(calls.assets.length, refs.length);
});

test('deletes enquiry notes, idempotency records, and phone claims atomically with the enquiry', async () => {
  const calls = { deleted: [], notes: [], idempotency: [], phoneClaims: [], audits: [] };
  const result = await executePermanentDelete({ collection: { deleteMany: async () => ({ deletedCount: 1 }) }, notesCollection: { deleteMany: async () => ({ deletedCount: 2 }) }, idempotencyCollection: { deleteMany: async () => ({ deletedCount: 1 }) }, phoneClaimsCollection: { deleteMany: async () => ({ deletedCount: 1 }) }, consentCollection: {}, retainedAssetsCollection: {}, auditCollection: { insertOne: async row => calls.audits.push(row) }, records: [{ id: 8, status: 'closed' }], recordType: 'parentEnquiries', actor: { id: 1 }, createdAt: 'now', actionId: 91, session: {} });
  assert.equal(result.deletedInternalNotes, 2);
  assert.equal(result.deletedIdempotencyRecords, 1);
  assert.equal(result.deletedPhoneClaims, 1);
  const repeated = await executePermanentDelete({ collection: {}, notesCollection: {}, consentCollection: {}, retainedAssetsCollection: {}, auditCollection: {}, records: [], recordType: 'parentEnquiries' });
  assert.equal(repeated.deletedCount, 0);
  assert.equal(repeated.deletedPhoneClaims, 0);
  assert.equal(calls.audits.length, 1);
});

test('rolls back with an error when every selected record is not deleted', async () => {
  const calls = [];
  await assert.rejects(executePermanentDelete({ collection: { deleteMany: async () => ({ deletedCount: 0 }) }, consentCollection: {}, retainedAssetsCollection: {}, auditCollection: { insertOne: async row => calls.push(row) }, records: [{ id: 9, status: 'closed' }], recordType: 'parentEnquiries', createdAt: 'now', actionId: 92, session: {} }), /changed during deletion/);
  assert.equal(calls.length, 0);
});

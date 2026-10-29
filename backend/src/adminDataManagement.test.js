import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupRecordFilter, duplicateTeacherIdentifierCounts, normalizeTeacherEmail, normalizeTeacherPhone, processInBatches, utcInclusiveDateRange } from './adminDataManagement.js';
import { teacherTermsDraftSchema } from './schemas.js';

test('cleanup date range is UTC with an inclusive end date represented as exclusive next midnight', () => {
  assert.deepEqual(utcInclusiveDateRange('2026-10-01', '2026-10-02'), {
    startInclusive: '2026-10-01T00:00:00.000Z', endExclusive: '2026-10-03T00:00:00.000Z', endInclusive: true, timeZone: 'UTC',
  });
});
test('cleanup date range rejects reversed, invalid, and excessively broad dates', () => {
  for (const range of [['2026-10-02','2026-10-01'], ['2026-02-30','2026-03-01'], ['2000-01-01','2026-01-01']]) assert.throws(() => utcInclusiveDateRange(...range));
});
test('cleanup filters include only closed enquiries and rejected teacher registrations in UTC bounds', () => {
  assert.deepEqual(cleanupRecordFilter('parentEnquiries', '2026-10-01', '2026-10-01'), {
    created_at: { $gte: '2026-10-01T00:00:00.000Z', $lt: '2026-10-02T00:00:00.000Z' }, archived_at: { $exists: false }, status: 'closed',
  });
  assert.equal(cleanupRecordFilter('teacherRegistrations', '2026-10-01', '2026-10-01').status, 'rejected');
  assert.throws(() => cleanupRecordFilter('admins', '2026-10-01', '2026-10-01'));
});
test('cleanup batch processing is sequential and stops after a failed batch', async () => {
  const processed = [];
  await assert.rejects(processInBatches([1, 2, 3, 4, 5], 2, async batch => {
    processed.push(batch);
    if (batch[0] === 3) throw new Error('injected batch failure');
  }), /injected batch failure/);
  assert.deepEqual(processed, [[1, 2], [3, 4]]);
});
test('teacher identifiers normalize email case and Indian mobile formats without exposing identifiers in counts', () => {
  assert.equal(normalizeTeacherEmail('  Tutor@Example.Test '), 'tutor@example.test');
  assert.equal(normalizeTeacherPhone('+91 (98765) 43210'), '919876543210');
  assert.equal(normalizeTeacherPhone('00919876543210'), '919876543210');
  assert.equal(normalizeTeacherPhone('09876543210'), '919876543210');
  assert.deepEqual(duplicateTeacherIdentifierCounts([
    { email: 'Tutor@Example.Test', phone: '9876543210' },
    { email_normalized: 'tutor@example.test', phone: '+91 98765 43210' },
    { email: 'unique@example.test', phone: '9123456789' },
  ]), { duplicateEmailGroups: 1, duplicatePhoneGroups: 1 });
});

test('terms draft schema accepts valid drafts and identifies the exact invalid field', () => {
  const base = { expectedRevision: 1, expectedCurrentVersionId: 'terms-v1' };
  assert.equal(teacherTermsDraftSchema.safeParse({ ...base, content: [' A valid clause ', '19.2 Subclause', '19.3 Subclause'], changeSummary: '' }).success, true);
  assert.equal(teacherTermsDraftSchema.safeParse({ ...base, content: Array.from({ length: 500 }, (_, index) => `Clause ${index + 1}`), changeSummary: '' }).success, true);
  const tooMany = teacherTermsDraftSchema.safeParse({ ...base, content: Array.from({ length: 501 }, () => 'Clause'), changeSummary: '' });
  assert.equal(tooMany.success, false); assert.ok(tooMany.error.issues.some(issue => issue.path.join('.') === 'content'));
  const whitespace = teacherTermsDraftSchema.safeParse({ ...base, content: ['   '], changeSummary: '' });
  assert.equal(whitespace.success, false); assert.ok(whitespace.error.issues.some(issue => issue.path.join('.') === 'content.0'));
  const empty = teacherTermsDraftSchema.safeParse({ ...base, content: [], changeSummary: '' });
  assert.equal(empty.success, false); assert.ok(empty.error.issues.some(issue => issue.path.join('.') === 'content'));
  const summary = teacherTermsDraftSchema.safeParse({ ...base, content: ['A valid clause'], changeSummary: 'x'.repeat(301) });
  assert.equal(summary.success, false); assert.ok(summary.error.issues.some(issue => issue.path.join('.') === 'changeSummary'));
});

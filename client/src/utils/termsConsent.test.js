import test from 'node:test';
import assert from 'node:assert/strict';
import { canSubmitTeacherRegistration, hasCurrentTermsConsent, hasReachedTermsEnd } from './termsConsent.js';

test('terms review remains locked before the scroll container reaches the bottom', () => {
  assert.equal(hasReachedTermsEnd({ scrollTop: 120, clientHeight: 300, scrollHeight: 900 }), false);
});

test('terms review unlocks at the actual scroll bottom with fractional-pixel tolerance', () => {
  assert.equal(hasReachedTermsEnd({ scrollTop: 597.25, clientHeight: 300, scrollHeight: 900 }), false);
  assert.equal(hasReachedTermsEnd({ scrollTop: 598.1, clientHeight: 300, scrollHeight: 900 }), true);
  assert.equal(hasReachedTermsEnd(null), false);
});

test('reaching the bottom does not count as explicit consent', () => {
  assert.equal(hasCurrentTermsConsent({ accepted: false, reviewedVersionId: 'terms-v3', currentVersionId: 'terms-v3' }), false);
  assert.equal(hasCurrentTermsConsent({ accepted: true, reviewedVersionId: 'terms-v3', currentVersionId: 'terms-v3' }), true);
});

test('stale reviewed terms version cannot satisfy consent', () => {
  assert.equal(hasCurrentTermsConsent({ accepted: true, reviewedVersionId: 'terms-v3', currentVersionId: 'terms-v4' }), false);
});

test('final registration readiness requires valid fees, Aadhaar, and explicit current-version consent', () => {
  const valid = { minimumFee: 1000, maximumFee: 2500, paymentModes: ['UPI'], hasAadhaar: true, accepted: true, reviewedVersionId: 'terms-v4', currentVersionId: 'terms-v4', termsVersionId: 'terms-v4', termsStale: false, termsLoading: false };
  assert.equal(canSubmitTeacherRegistration(valid), true);
  assert.equal(canSubmitTeacherRegistration({ ...valid, accepted: false }), false);
  assert.equal(canSubmitTeacherRegistration({ ...valid, reviewedVersionId: 'terms-v3' }), false);
  assert.equal(canSubmitTeacherRegistration({ ...valid, termsStale: true }), false);
  assert.equal(canSubmitTeacherRegistration({ ...valid, hasAadhaar: false }), false);
  assert.equal(canSubmitTeacherRegistration({ ...valid, minimumFee: '', maximumFee: '' }), false);
});

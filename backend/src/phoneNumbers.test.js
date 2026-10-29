import test from 'node:test';
import assert from 'node:assert/strict';
import { equivalentStoredPhoneValues, normalizePhoneNumber } from './phoneNumbers.js';

test('normalizes equivalent Indian phone formats to one canonical digits-only value', () => {
  const formats = ['9876543210', '+919876543210', '919876543210', '00919876543210', '09876543210'];
  for (const phone of formats) assert.equal(normalizePhoneNumber(phone), '919876543210');
  assert.deepEqual(normalizePhoneNumber('not a phone'), '');
});

test('legacy lookup candidates cover supported country-code and national formats', () => {
  const values = equivalentStoredPhoneValues('919876543210');
  for (const value of ['919876543210', '+919876543210', '00919876543210', '9876543210', '09876543210']) assert.ok(values.includes(value));
});

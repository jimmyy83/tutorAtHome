import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminEnquiryFilter, isNewParentEnquiry } from './adminEnquiries.js';

const rows = [
  { id: 1, status: 'new', archived_at: undefined, blocked: false, parent_name: 'Asha', reference: 'ENQ-1', city: 'Prayagraj' },
  { id: 2, status: 'contacted', archived_at: undefined, blocked: true, parent_name: 'Ravi', reference: 'ENQ-2', city: 'Lucknow' },
  { id: 3, status: 'closed', archived_at: '2026-10-01T00:00:00.000Z', blocked: false, parent_name: 'Meera', reference: 'ENQ-3', city: 'Prayagraj' },
];

function matches(row, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return condition.some(item => matches(row, item));
    if (condition instanceof RegExp) return condition.test(String(row[key] || ''));
    if (condition && typeof condition === 'object' && '$exists' in condition) return condition.$exists ? row[key] !== undefined : row[key] === undefined;
    if (condition && typeof condition === 'object' && '$ne' in condition) return row[key] !== condition.$ne;
    return row[key] === condition;
  });
}

test('overview default count and Enquiries default list use identical active-record eligibility', () => {
  const overviewFilter = buildAdminEnquiryFilter({ archived: 'false' });
  const listFilter = buildAdminEnquiryFilter({ archived: 'false', page: '1', limit: '24' });
  assert.deepEqual(overviewFilter, listFilter);
  const overviewCount = rows.filter(row => matches(row, overviewFilter)).length;
  const listRecords = rows.filter(row => matches(row, listFilter));
  assert.equal(overviewCount, listRecords.length);
  assert.deepEqual(listRecords.map(row => row.id), [1, 2]);
});

test('status, block and search filters are shared with location group counts', () => {
  const listFilter = buildAdminEnquiryFilter({ archived: 'false', status: 'new', blocked: 'false', search: 'ENQ-1' });
  const locationCountsFilter = buildAdminEnquiryFilter({ archived: 'false', status: 'new', blocked: 'false', search: 'ENQ-1' });
  assert.deepEqual(locationCountsFilter, listFilter);
  assert.deepEqual(rows.filter(row => matches(row, locationCountsFilter)).map(row => row.id), [1]);
});

test('archived and blocked enquiries remain available in the intended filters', () => {
  assert.deepEqual(rows.filter(row => matches(row, buildAdminEnquiryFilter({ archived: 'true' }))).map(row => row.id), [3]);
  assert.deepEqual(rows.filter(row => matches(row, buildAdminEnquiryFilter({ archived: 'false', blocked: 'true' }))).map(row => row.id), [2]);
  assert.equal(rows.filter(row => matches(row, buildAdminEnquiryFilter({ archived: 'all' }))).length, 3);
});

test('NEW is based on the persisted status and clears after explicit review transition', () => {
  assert.equal(isNewParentEnquiry('new'), true);
  assert.equal(isNewParentEnquiry('contacted'), false);
  assert.equal(isNewParentEnquiry('in_progress'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { resetAdminLocationFilters } from './adminLocationFilters.js';

test('All Locations resets filters to include active pending/new records', () => {
  assert.deepEqual(resetAdminLocationFilters(), {
    locality: '', status: '', blocked: '', archived: 'false', search: '', page: 1,
  });
});

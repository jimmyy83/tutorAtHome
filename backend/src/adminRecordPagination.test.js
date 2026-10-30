import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAdminPage, needsAdminLocationMatch } from './adminRecordPagination.js';

test('All Locations list requests use database pagination without location post-filtering', async () => {
  const calls = [];
  const collection = {
    countDocuments: async filter => { calls.push(['count', filter]); return 51; },
    find: (filter, options) => {
      calls.push(['find', filter, options]);
      const cursor = {
        sort(value) { calls.push(['sort', value]); return this; },
        skip(value) { calls.push(['skip', value]); return this; },
        limit(value) { calls.push(['limit', value]); return this; },
        async toArray() { return [{ id: 25 }, { id: 26 }]; },
      };
      return cursor;
    },
  };
  const filter = { archived_at: { $exists: false } };
  const result = await fetchAdminPage(collection, { filter, projection: { data: 1 }, sort: { created_at: -1, id: -1 }, page: 2, limit: 24 });
  assert.deepEqual(result, { items: [{ id: 25 }, { id: 26 }], page: 2, limit: 24, total: 51, totalPages: 3 });
  assert.deepEqual(calls.map(([name, value]) => name === 'skip' || name === 'limit' ? [name, value] : [name]), [
    ['count'], ['find'], ['sort'], ['skip', 24], ['limit', 24],
  ]);
});

test('location-selected admin requests retain the compatibility post-filter path', () => {
  assert.equal(needsAdminLocationMatch({}), false);
  assert.equal(needsAdminLocationMatch({ search: 'teacher', status: 'pending' }), false);
  assert.equal(needsAdminLocationMatch({ stateId: 'up' }), true);
  assert.equal(needsAdminLocationMatch({ districtId: 'prayagraj' }), true);
  assert.equal(needsAdminLocationMatch({ localityId: 'naini' }), true);
  assert.equal(needsAdminLocationMatch({ unspecified: 'true' }), true);
});

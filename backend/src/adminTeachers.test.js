import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminTeacherFilter } from './adminTeachers.js';
import { matchesAdminLocation } from './adminLocationGroups.js';

test('All Teachers defaults include pending and location-unspecified records', () => {
  const filter = buildAdminTeacherFilter({});
  assert.deepEqual(filter, { archived_at: { $exists: false } });
  assert.equal('status' in filter, false);
  assert.equal('blocked' in filter, false);
  assert.equal(matchesAdminLocation(null, {}), true);
  assert.equal(matchesAdminLocation({ stateId: 'up', districtId: 'unknown', localityId: '' }, {}), true);
});

test('teacher list and district counts share status, blocked, archive and search rules', () => {
  const query = { archived: 'false', status: 'pending', blocked: 'false', search: 'Asha.+' };
  const listFilter = buildAdminTeacherFilter(query);
  const districtCountFilter = buildAdminTeacherFilter(query);
  assert.deepEqual(districtCountFilter, listFilter);
  assert.equal(listFilter.status, 'pending');
  assert.deepEqual(listFilter.blocked, { $ne: true });
  assert.equal(listFilter.archived_at.$exists, false);
  assert.equal(listFilter.$or[0].full_name.test('Asha.+'), true);
  assert.equal(listFilter.$or[0].full_name.test('Asha X'), false);
});

test('archived and blocked registrations remain available with their explicit filters', () => {
  assert.deepEqual(buildAdminTeacherFilter({ archived: 'true' }), { archived_at: { $exists: true } });
  assert.deepEqual(buildAdminTeacherFilter({ archived: 'false', blocked: 'true' }), { archived_at: { $exists: false }, blocked: true });
  assert.deepEqual(buildAdminTeacherFilter({ archived: 'all' }), {});
});

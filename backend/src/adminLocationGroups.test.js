import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocationGroups, locationForAdminRecord, locationGroupKey, matchesAdminLocation } from './adminLocationGroups.js';

const catalog = { states: [
  { id: 'up', name: 'Uttar Pradesh', active: true, districts: [
    { id: 'prayagraj-up', name: 'Prayagraj', active: true, localities: [{ id: 'naini', name: 'Naini', active: true }] },
    { id: 'lucknow-up', name: 'Lucknow', active: true, localities: [{ id: 'gomti', name: 'Gomti Nagar', active: true }] },
    { id: 'new-up', name: 'New District', active: true, localities: [{ id: 'new-locality', name: 'New Locality', active: true, publiclyServiceable: true }] },
  ] },
  { id: 'other', name: 'Other State', active: true, districts: [{ id: 'prayagraj-other', name: 'Prayagraj', active: true, localities: [{ id: 'other-area', name: 'Naini', active: true }] }] },
] };

test('teacher groups use registered structured location and keep same-named districts separated by state', () => {
  const records = [
    { data: JSON.stringify({ location: { stateId: 'up', state: 'Uttar Pradesh', districtId: 'prayagraj-up', district: 'Prayagraj', localityId: 'naini', locality: 'Naini' } }) },
    { data: JSON.stringify({ location: { stateId: 'other', state: 'Other State', districtId: 'prayagraj-other', district: 'Prayagraj', localityId: 'other-area', locality: 'Naini' } }) },
    { data: JSON.stringify({ personal: { address: 'private home address' } }) },
  ];
  const groups = buildLocationGroups(records, catalog, 'teachers');
  assert.equal(groups.find(group => group.key === locationGroupKey({ stateId: 'up', districtId: 'prayagraj-up' })).count, 1);
  assert.equal(groups.find(group => group.key === locationGroupKey({ stateId: 'other', districtId: 'prayagraj-other' })).count, 1);
  assert.equal(groups.find(group => group.key === 'unspecified').count, 1);
  assert.deepEqual(locationForAdminRecord(records[0], catalog, 'teachers').locality, 'Naini');
});

test('parent leads resolve only requested service city against a unique configured district', () => {
  const prayagraj = { city: 'Prayagraj', data: JSON.stringify({ city: 'Prayagraj', locality: 'naini', homeAddress: 'private home address' }) };
  const ambiguous = { city: 'Prayagraj', data: JSON.stringify({ city: 'Prayagraj', locality: 'unknown' }) };
  const result = locationForAdminRecord(prayagraj, { states: [catalog.states[0]] }, 'enquiries');
  assert.equal(result.districtId, 'prayagraj-up');
  assert.equal(result.localityId, 'naini');
  assert.equal(locationForAdminRecord(ambiguous, catalog, 'enquiries'), null);
});

test('new configured districts appear with no records; locality and unspecified filters are exact', () => {
  const groups = buildLocationGroups([], catalog, 'teachers');
  const addedDistrict = groups.find(group => group.districtId === 'new-up');
  assert.equal(addedDistrict.district, 'New District');
  assert.equal(addedDistrict.count, 0);
  const teacher = { data: JSON.stringify({ location: { stateId: 'up', districtId: 'prayagraj-up', localityId: 'naini' } }) };
  const location = locationForAdminRecord(teacher, catalog, 'teachers');
  assert.equal(matchesAdminLocation(location, { stateId: 'up', districtId: 'prayagraj-up', localityId: 'naini' }), true);
  assert.equal(matchesAdminLocation(location, { stateId: 'other', districtId: 'prayagraj-other' }), false);
  assert.equal(matchesAdminLocation(null, { unspecified: 'true' }), true);
});

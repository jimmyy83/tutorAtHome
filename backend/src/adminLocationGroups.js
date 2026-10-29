import { json } from './db.js';

const norm = value => String(value || '').trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en-IN');
const identity = (stateId, districtId) => stateId && districtId ? `${encodeURIComponent(stateId)}:${encodeURIComponent(districtId)}` : 'unspecified';

function catalogDistricts(catalog) {
  return (catalog?.states || []).filter(state => state?.active === true).flatMap(state =>
    (state.districts || []).filter(district => district?.active === true).map(district => ({
      stateId: String(state.id), state: state.name, districtId: String(district.id), district: district.name,
      localities: (district.localities || []).filter(locality => locality?.active === true).map(locality => ({ id: String(locality.id), name: locality.name, publiclyServiceable: locality.publiclyServiceable === true }))
    })));
}

export function resolveTeacherLocation(record, catalog) {
  const application = json(record?.data, {}) || {};
  const location = application.location || {};
  const candidates = catalogDistricts(catalog);
  let district = candidates.find(item => String(item.stateId) === String(location.stateId) && String(item.districtId) === String(location.districtId));
  if (!district && location.state && location.district) {
    const matches = candidates.filter(item => norm(item.state) === norm(location.state) && norm(item.district) === norm(location.district));
    if (matches.length === 1) district = matches[0];
  }
  if (!district || !location.localityId) return null;
  const locality = district.localities.find(item => item.id === String(location.localityId));
  if (!locality) return null;
  return { stateId: district.stateId, state: district.state, districtId: district.districtId, district: district.district, localityId: locality.id, locality: locality.name };
}

export function resolveEnquiryLocation(record, catalog) {
  const data = json(record?.data, {}) || {};
  const city = String(data.serviceCity || data.city || record?.city || '').trim();
  const localityName = String(data.serviceLocality || data.locality || '').trim();
  if (!city) return null;
  const matches = catalogDistricts(catalog).filter(item => norm(item.district) === norm(city));
  // A city label alone is not enough to choose between same-named districts.
  if (matches.length !== 1) return null;
  const district = matches[0];
  const locality = localityName ? district.localities.find(item => norm(item.name) === norm(localityName)) : null;
  return { stateId: district.stateId, state: district.state, districtId: district.districtId, district: district.district, localityId: locality?.id || (localityName ? `name:${norm(localityName)}` : ''), locality: locality?.name || localityName };
}

export function locationGroupKey(location) {
  return location ? identity(location.stateId, location.districtId) : 'unspecified';
}

export function buildLocationGroups(records, catalog, type) {
  const groups = new Map();
  const add = (location, count = 0) => {
    const key = locationGroupKey(location);
    const item = groups.get(key) || { key, stateId: location?.stateId || '', state: location?.state || '', districtId: location?.districtId || '', district: location?.district || '', count: 0, localities: [] };
    item.count += count;
    if (location?.localityId && !item.localities.some(value => value.id === location.localityId)) item.localities.push({ id: location.localityId, name: location.locality });
    for (const locality of location?.localities || []) if (locality.publiclyServiceable && !item.localities.some(value => value.id === locality.id)) item.localities.push({ id: locality.id, name: locality.name });
    groups.set(key, item);
  };
  for (const record of records) add(type === 'teachers' ? resolveTeacherLocation(record, catalog) : resolveEnquiryLocation(record, catalog), 1);
  for (const district of catalogDistricts(catalog)) {
    if (district.localities.some(locality => locality.publiclyServiceable)) add({ ...district, localityId: '', locality: '' });
  }
  if (groups.has('unspecified')) groups.set('unspecified', { key: 'unspecified', stateId: '', state: '', districtId: '', district: 'Location Not Specified', count: groups.get('unspecified').count, localities: [] });
  return [...groups.values()].sort((a, b) => a.key === 'unspecified' ? 1 : b.key === 'unspecified' ? -1 : a.state.localeCompare(b.state) || a.district.localeCompare(b.district));
}

export function matchesAdminLocation(recordLocation, query) {
  if (query.unspecified === 'true') return !recordLocation;
  if (query.stateId && String(recordLocation?.stateId) !== String(query.stateId)) return false;
  if (query.districtId && String(recordLocation?.districtId) !== String(query.districtId)) return false;
  if (query.localityId && String(recordLocation?.localityId) !== String(query.localityId)) return false;
  return true;
}

export function locationForAdminRecord(record, catalog, type) {
  return type === 'teachers' ? resolveTeacherLocation(record, catalog) : resolveEnquiryLocation(record, catalog);
}

export function normalizeAdminLocationName(value) { return norm(value); }

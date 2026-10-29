// Selecting All Locations should also clear record filters that could hide
// recently submitted pending teachers or new parent enquiries.
export function resetAdminLocationFilters() {
  return { locality: '', status: '', blocked: '', archived: 'false', search: '', page: 1 };
}

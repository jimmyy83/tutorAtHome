export function needsAdminLocationMatch(query = {}) {
  return Boolean(query.unspecified === 'true' || query.stateId || query.districtId || query.localityId);
}

export async function fetchAdminPage(collection, { filter, projection, sort, page, limit }) {
  const offset = (page - 1) * limit;
  const [total, items] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter, { projection })
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .toArray(),
  ]);
  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}

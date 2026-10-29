export function teacherProfilePhotoCacheKey(teacherId, version) {
  return version ? `${String(teacherId)}:${String(version)}` : '';
}

export async function getTeacherProfilePhoto({ cache, requests, api, teacherId, version, authToken }) {
  const key = teacherProfilePhotoCacheKey(teacherId, version);
  if (!key) throw new Error('The private profile photo version is unavailable.');
  if (cache.has(key)) return { key, url: cache.get(key) };
  if (requests.has(key)) return requests.get(key);

  const generation = cache.generation || 0;
  const request = (async () => {
    const blob = await api.download(`/admin/teachers/${teacherId}/documents/profile-photo`, { authToken });
    if (!['image/jpeg', 'image/png'].includes(String(blob.type || '').toLowerCase())) {
      throw new Error('The private profile photo format is unsupported.');
    }
    if ((cache.generation || 0) !== generation) throw new Error('The admin session changed during the photo request.');
    const url = URL.createObjectURL(blob);
    cache.set(key, url);
    return { key, url };
  })();
  requests.set(key, request);
  try {
    return await request;
  } finally {
    if (requests.get(key) === request) requests.delete(key);
  }
}

export function revokeTeacherProfilePhoto(cache, key) {
  const url = cache.get(key);
  if (!url) return false;
  cache.delete(key);
  URL.revokeObjectURL(url);
  return true;
}

export function pruneTeacherProfilePhotoCache(cache, teacherId, keepKey = '') {
  const prefix = `${String(teacherId)}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix) && key !== keepKey) revokeTeacherProfilePhoto(cache, key);
  }
}

export function clearTeacherProfilePhotoCache(cache, requests) {
  cache.generation = (cache.generation || 0) + 1;
  for (const key of cache.keys()) revokeTeacherProfilePhoto(cache, key);
  requests.clear();
}

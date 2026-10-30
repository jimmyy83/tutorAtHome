export function updateAdminSearch(value, onSearchChange, onPageChange) {
  onSearchChange(value);
  onPageChange(1);
}

export function shouldShowAdminLoading(hasLoadedTab) {
  return !hasLoadedTab;
}

export function isCurrentAdminLoad(requestId, latestRequestId) {
  return requestId === latestRequestId;
}

export function adminLoadKey(tab, filters = {}) {
  if (tab === 'teachers') {
    return JSON.stringify([tab, filters.status, filters.blocked, filters.archived, filters.search, filters.group, filters.locality, filters.page]);
  }
  if (tab === 'enquiries') {
    return JSON.stringify([tab, filters.status, filters.blocked, filters.archived, filters.search, filters.group, filters.locality, filters.page]);
  }
  return tab;
}

export function resolveAdminLoadRequest(request, nextRequestId) {
  return Number.isSafeInteger(request) ? request : nextRequestId;
}

export function shouldVerifyStoredAdminToken(token, freshlyAuthenticatedToken) {
  return Boolean(token && token !== freshlyAuthenticatedToken);
}

export function setAdminSearchParameter(params, search) {
  const normalized = String(search || '').trim();
  if (normalized) params.set('search', normalized);
  else params.delete('search');
  return params;
}

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

export function setAdminSearchParameter(params, search) {
  const normalized = String(search || '').trim();
  if (normalized) params.set('search', normalized);
  else params.delete('search');
  return params;
}

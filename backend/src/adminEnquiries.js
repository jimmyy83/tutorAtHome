import { escapeRegex } from './db.js';

// Keep the default dashboard view aligned with the Enquiries tab's default
// active-record filter. Blocked records remain visible unless the admin filters
// them out, matching the current Enquiries tab behavior.
export function buildAdminEnquiryFilter(query = {}) {
  const filter = {};
  if (query.includeArchived !== 'true' && query.archived !== 'all') {
    filter.archived_at = query.archived === 'true' ? { $exists: true } : { $exists: false };
  }
  if (query.status) filter.status = query.status;
  if (query.blocked === 'true') filter.blocked = true;
  else if (query.blocked === 'false') filter.blocked = { $ne: true };
  if (query.search) {
    const re = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ parent_name: re }, { phone: re }, { city: re }, { reference: re }];
  }
  return filter;
}

export function isNewParentEnquiry(status) {
  return status === 'new';
}

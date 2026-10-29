import { escapeRegex } from './db.js';

// Shared between the teacher district counts and the paginated list so the
// All Teachers view and its location badges follow the same status rules.
export function buildAdminTeacherFilter(query = {}) {
  const filter = {};
  if (query.includeArchived !== 'true' && query.archived !== 'all') {
    filter.archived_at = query.archived === 'true' ? { $exists: true } : { $exists: false };
  }
  if (query.status) filter.status = query.status;
  if (query.blocked === 'true') filter.blocked = true;
  else if (query.blocked === 'false') filter.blocked = { $ne: true };
  if (query.featured) filter.featured = query.featured === 'true' ? { $in: [true, 1] } : { $in: [false, 0] };
  if (query.search) {
    const re = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ full_name: re }, { email: re }, { phone: re }, { reference: re }];
  }
  return filter;
}

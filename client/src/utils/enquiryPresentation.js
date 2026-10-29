export function formatEnquirySubmittedAt(value) {
  if (value === null || value === undefined || value === '') return 'Date unavailable';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';

  const dateLabel = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date).replace(/\s*(am|pm)$/i, (_, meridiem) => ` ${meridiem.toUpperCase()}`);
  return `${dateLabel}, ${timeLabel}`;
}

export const ENQUIRY_OVERVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinEnquiryOverviewWindow(createdAt, now = Date.now()) {
  if (createdAt === null || createdAt === undefined || createdAt === '') return false;
  const timestamp = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age < ENQUIRY_OVERVIEW_WINDOW_MS;
}

export function filterOverviewRecentEnquiries(enquiries, now = Date.now()) {
  return (Array.isArray(enquiries) ? enquiries : []).filter(enquiry =>
    isWithinEnquiryOverviewWindow(enquiry.createdAt, now),
  );
}

export function isRecentNewEnquiry(status, createdAt, now = Date.now()) {
  return status === 'new' && isWithinEnquiryOverviewWindow(createdAt, now);
}

export function msUntilNextOverviewEnquiryExpiry(enquiries, now = Date.now()) {
  const nextExpiry = (Array.isArray(enquiries) ? enquiries : [])
    .map(enquiry => enquiry?.createdAt instanceof Date ? enquiry.createdAt.getTime() : new Date(enquiry?.createdAt).getTime())
    .filter(timestamp => Number.isFinite(timestamp) && timestamp <= now && now - timestamp < ENQUIRY_OVERVIEW_WINDOW_MS)
    .reduce((earliest, timestamp) => Math.min(earliest, timestamp + ENQUIRY_OVERVIEW_WINDOW_MS), Infinity);
  return Number.isFinite(nextExpiry) ? Math.max(0, nextExpiry - now) : null;
}

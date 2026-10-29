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

// The existing persisted enquiry status is the review state. Only new records
// receive a NEW badge; changing the status explicitly removes it across reloads.
export function isNewEnquiry(status) {
  return status === 'new';
}

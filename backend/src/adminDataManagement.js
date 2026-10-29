import { normalizePhoneNumber } from './phoneNumbers.js';

export function utcInclusiveDateRange(startDate, endDate) {
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
  if (!valid(startDate) || !valid(endDate) || startDate > endDate) throw new Error('Choose a valid start date and end date in UTC.');
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  if ((endExclusive - start) / 86400000 > 3660) throw new Error('Choose a date range of ten years or less.');
  return { startInclusive: start.toISOString(), endExclusive: endExclusive.toISOString(), endInclusive: true, timeZone: 'UTC' };
}

export function cleanupRecordFilter(recordType, startDate, endDate) {
  const range = utcInclusiveDateRange(startDate, endDate);
  if (!['parentEnquiries', 'teacherRegistrations'].includes(recordType)) throw new Error('Choose a supported cleanup category.');
  return {
    created_at: { $gte: range.startInclusive, $lt: range.endExclusive },
    archived_at: { $exists: false },
    status: recordType === 'teacherRegistrations' ? 'rejected' : 'closed',
  };
}

export async function processInBatches(iterable, batchSize, processBatch) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error('Batch size must be a positive integer.');
  let batch = [];
  for await (const item of iterable) {
    batch.push(item);
    if (batch.length === batchSize) { await processBatch(batch); batch = []; }
  }
  if (batch.length) await processBatch(batch);
}

export function normalizeTeacherEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizeTeacherPhone(value) {
  return normalizePhoneNumber(value);
}

export function duplicateTeacherIdentifierCounts(records) {
  const emails = new Map(), phones = new Map();
  for (const record of records) {
    const email = record.email_normalized || normalizeTeacherEmail(record.email);
    const phone = record.phone_normalized || normalizeTeacherPhone(record.phone);
    if (email) emails.set(email, (emails.get(email) || 0) + 1);
    if (phone) phones.set(phone, (phones.get(phone) || 0) + 1);
  }
  return {
    duplicateEmailGroups: [...emails.values()].filter(count => count > 1).length,
    duplicatePhoneGroups: [...phones.values()].filter(count => count > 1).length,
  };
}


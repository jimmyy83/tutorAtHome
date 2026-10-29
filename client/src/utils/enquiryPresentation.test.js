import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEnquirySubmittedAt, isNewEnquiry } from './enquiryPresentation.js';

test('formats a server timestamp in the viewer local timezone', () => {
  const timestamp = '2026-10-28T19:45:00.000Z';
  const localDate = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(timestamp));
  const localTime = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(timestamp)).replace(/\s*(am|pm)$/i, (_, meridiem) => ` ${meridiem.toUpperCase()}`);
  assert.equal(formatEnquirySubmittedAt(timestamp), `${localDate}, ${localTime}`);
  assert.equal(formatEnquirySubmittedAt(new Date(timestamp)), `${localDate}, ${localTime}`);
});

test('does not invent dates for missing or invalid legacy timestamps', () => {
  for (const value of [null, undefined, '', 'not-a-date']) assert.equal(formatEnquirySubmittedAt(value), 'Date unavailable');
});

test('NEW badge follows persisted unreviewed status and disappears after a status transition', () => {
  assert.equal(isNewEnquiry('new'), true);
  for (const status of ['contacted', 'in_progress', 'matched', 'closed', 'archived', undefined]) assert.equal(isNewEnquiry(status), false);
});

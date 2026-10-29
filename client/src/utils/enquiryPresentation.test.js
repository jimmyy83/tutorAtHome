import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { filterOverviewRecentEnquiries, formatEnquirySubmittedAt, isRecentNewEnquiry, msUntilNextOverviewEnquiryExpiry } from './enquiryPresentation.js';

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

test('NEW appears at 23:59 and expires at 24 hours without changing review-state rules', () => {
  const now = Date.parse('2026-10-30T12:00:00.000Z');
  const at23h59m = new Date(now - (23 * 60 + 59) * 60_000).toISOString();
  const at24h = new Date(now - 24 * 60 * 60_000).toISOString();
  assert.equal(isRecentNewEnquiry('new', at23h59m, now), true);
  assert.equal(isRecentNewEnquiry('new', at24h, now), false);
  assert.equal(isRecentNewEnquiry('new', new Date(now - 24 * 60 * 60_000 - 1).toISOString(), now), false);
  for (const status of ['contacted', 'in_progress', 'matched', 'closed', 'archived', undefined]) {
    assert.equal(isRecentNewEnquiry(status, at23h59m, now), false, `${status} stays reviewed/non-new`);
  }
  for (const timestamp of [undefined, null, '', 'not-a-date']) assert.equal(isRecentNewEnquiry('new', timestamp, now), false);
});

test('Overview filters only its own recent list; old enquiries remain in the unfiltered Enquiries list', () => {
  const now = Date.parse('2026-10-30T12:00:00.000Z');
  const rows = [
    { id: 'recent', status: 'new', createdAt: '2026-10-30T11:00:00.000Z' },
    { id: 'old', status: 'new', createdAt: '2026-10-27T12:00:00.000Z' },
  ];
  assert.deepEqual(filterOverviewRecentEnquiries(rows, now).map(row => row.id), ['recent']);
  assert.deepEqual(rows.map(row => row.id), ['recent', 'old'], 'filtering does not mutate or remove records');
  const source = fs.readFileSync(fileURLToPath(new URL('../pages/AdminPage.jsx', import.meta.url)), 'utf8');
  assert.match(source, /enquiries\.length\?enquiries\.map/);
  assert.match(source, /isRecentNewEnquiry\(row\.status,row\.createdAt,overviewNow\)/);
  assert.match(source, /value=\{row\.status\}[^>]*onChange=\{e=>changeEnquiryStatus\(row,e\.target\.value\)\}/);
  assert.match(source, /if\(tab==='dashboard'\|\|tab==='enquiries'\)setOverviewNow\(Date\.now\(\)\)/);
  assert.match(source, /if\(tab!=='dashboard'&&tab!=='enquiries'\)return;const expiringRows=/);
  assert.match(source, /setTimeout\(\(\)=>setOverviewNow\(Date\.now\(\)\),delay\+1\)/);
});

test('overview schedules a time-only refresh at the next 24-hour expiry', () => {
  const now = Date.parse('2026-10-30T12:00:00.000Z');
  const rows = [
    { createdAt: '2026-10-29T12:00:10.000Z' },
    { createdAt: '2026-10-29T12:01:00.000Z' },
  ];
  assert.equal(msUntilNextOverviewEnquiryExpiry(rows, now), 10_000);
  assert.equal(msUntilNextOverviewEnquiryExpiry([{ createdAt: '2026-10-28T12:00:00.000Z' }], now), null);
});

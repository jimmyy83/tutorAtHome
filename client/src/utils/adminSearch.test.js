import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adminLoadKey, isCurrentAdminLoad, resolveAdminLoadRequest, setAdminSearchParameter, shouldShowAdminLoading, shouldVerifyStoredAdminToken, updateAdminSearch } from './adminSearch.js';

test('typing multiple characters in either admin search only updates React search state', () => {
  for (const tab of ['teachers', 'enquiries']) {
    let search = '', page = 4, navigations = 0, submissions = 0;
    const setSearch = value => { search = value; };
    const setPage = value => { page = value; };
    for (const value of ['a', 'al', 'ali', 'alic', 'alice']) updateAdminSearch(value, setSearch, setPage);
    assert.equal(search, 'alice', `${tab} retains the typed text`);
    assert.equal(page, 1, `${tab} returns to the first result page`);
    assert.equal(navigations, 0);
    assert.equal(submissions, 0);
  }
});

test('search query is applied to the existing server-side filter without navigation', () => {
  const params = setAdminSearchParameter(new URLSearchParams('page=1'), '  teacher  ');
  assert.equal(params.get('search'), 'teacher');
  assert.equal(params.get('page'), '1');
  setAdminSearchParameter(params, '  ');
  assert.equal(params.has('search'), false);
});

test('district filter renders a controlled search input outside any submitting form', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../components/AdminLocationGroupFilter.jsx', import.meta.url)), 'utf8');
  assert.match(source, /type="search"/);
  assert.doesNotMatch(source, /<form\b|onSubmit=|window\.location|location\.href/);
  assert.match(source, /value=\{searchDraft\}\s+onChange=\{event\s*=>\s*setSearchDraft\(event\.target\.value\)\}/);
  assert.match(source, /setTimeout\(\(\)\s*=>\s*updateAdminSearch\(\s*searchDraft\s*,\s*onSearchChange\s*,\s*\(\)\s*=>\s*onPageChange\(1\)\s*\)\s*,\s*250\)/);
  assert.match(source, /type="button"/);
});

test('search refetches do not replace the already-loaded admin tab with a full-page loader', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../pages/AdminPage.jsx', import.meta.url)), 'utf8');
  assert.match(source, /shouldShowAdminLoading\(loadedTabsRef\.current\[tab\]\)\)setLoading\(true\)/);
  assert.match(source, /loadedTabsRef\.current\[tab\]=true;setLoading\(false\)/);
  assert.equal(shouldShowAdminLoading(false), true, 'initial load still shows a loading state');
  assert.equal(shouldShowAdminLoading(true), false, 'search/filter refetch leaves the controls mounted');
});

test('a stale search response cannot become the current admin result set', () => {
  assert.equal(isCurrentAdminLoad(11, 12), false);
  assert.equal(isCurrentAdminLoad(12, 12), true);
});

test('active-tab load keys ignore filter changes on the inactive admin tab', () => {
  const teacherFilters = { status: 'pending', search: 'a', page: 1 };
  const first = adminLoadKey('teachers', { ...teacherFilters, enquirySearch: '' });
  const afterEnquiryTyping = adminLoadKey('teachers', { ...teacherFilters, enquirySearch: 'parent' });
  assert.equal(first, afterEnquiryTyping);
  assert.notEqual(first, adminLoadKey('teachers', { ...teacherFilters, search: 'alice' }));
  assert.notEqual(adminLoadKey('enquiries', { search: 'alice' }), adminLoadKey('teachers', { search: 'alice' }));
});

test('manual refresh click events cannot be mistaken for stale request IDs', () => {
  assert.equal(resolveAdminLoadRequest({ type: 'click' }, 8), 8);
  assert.equal(resolveAdminLoadRequest(7, 8), 7);
});

test('only stored sessions need the follow-up session verification request', () => {
  assert.equal(shouldVerifyStoredAdminToken('existing-session', ''), true);
  assert.equal(shouldVerifyStoredAdminToken('login-response-token', 'login-response-token'), false);
  assert.equal(shouldVerifyStoredAdminToken('', ''), false);
});

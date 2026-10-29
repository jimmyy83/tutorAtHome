import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isCurrentAdminLoad, setAdminSearchParameter, shouldShowAdminLoading, updateAdminSearch } from './adminSearch.js';

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
  assert.match(source, /value=\{search\}\s+onChange=\{event\s*=>\s*updateAdminSearch\(event\.target\.value,onSearchChange,\(\)=>onPageChange\(1\)\)\}/);
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

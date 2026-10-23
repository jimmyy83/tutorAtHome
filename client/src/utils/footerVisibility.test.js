import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowGlobalFooter } from './footerVisibility.js';

test('global footer is rendered only on the homepage path', () => {
  assert.equal(shouldShowGlobalFooter('/'), true);
  for (const pathname of [
    '/how-it-works', '/be-a-teacher', '/find-tutor', '/teachers', '/contact',
    '/parent-enquiry', '/teacher-registration', '/home-tutors-prayagraj',
    '/home-tutors-lucknow', '/unknown-route', '/admin',
  ]) assert.equal(shouldShowGlobalFooter(pathname), false, `${pathname} must not render the footer`);
});

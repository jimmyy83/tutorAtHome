import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAGE_FORM_SETTINGS, resolvePageFormFields } from './pageFormSettingsDefaults.js';

test('missing or partial remote config safely falls back to existing form defaults', () => {
  assert.deepEqual(resolvePageFormFields('findTutor', undefined), DEFAULT_PAGE_FORM_SETTINGS.findTutor.fields);
  const result = resolvePageFormFields('findTutor', { notes: { visible: false, required: false } });
  assert.equal(result.notes.visible, false);
  assert.equal(result.phone.visible, true);
});

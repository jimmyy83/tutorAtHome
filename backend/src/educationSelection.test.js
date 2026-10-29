import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings } from './defaults.js';
import { HttpError } from './middleware.js';
import { applyConfiguredSubmission, DEFAULT_PAGE_FORM_SETTINGS } from './pageFormSettings.js';
import { validateEducationSelectionData } from './educationSelection.js';
import { parentEnquirySchema } from './schemas.js';

const validParentEnquiry = {
  parentName: 'Parent', phone: '9876543210', studentName: 'Student', studentClass: '10',
  board: 'CBSE', subjects: ['Mathematics'], city: 'Prayagraj', mode: 'online', preferredTiming: 'Evenings', budget: 5000,
};

test('education validation accepts an optional exam field removed by published form settings', () => {
  // The route applies published settings after schema parsing. Hidden optional
  // fields are stripped at that point, so `examPreparations` is genuinely absent.
  const pages = structuredClone(DEFAULT_PAGE_FORM_SETTINGS);
  pages.findTutor.fields.examPreparations.visible = false;
  const firstPass = applyConfiguredSubmission('findTutor', validParentEnquiry, pages);
  const parsed = parentEnquirySchema.parse(firstPass);
  assert.deepEqual(parsed.examPreparations, []);
  const configured = applyConfiguredSubmission('findTutor', parsed, pages);
  assert.equal(Object.hasOwn(configured, 'examPreparations'), false);
  assert.throws(() => configured.examPreparations.some(() => false), TypeError);
  assert.doesNotThrow(() => validateEducationSelectionData(configured, defaultSettings.educationCatalog));
});

test('education validation accepts empty optional exam selections and non-senior classes', () => {
  assert.doesNotThrow(() => validateEducationSelectionData(
    { ...validParentEnquiry, examPreparations: [] },
    defaultSettings.educationCatalog,
  ));
});

test('education validation safely handles an unavailable or malformed optional catalogue', () => {
  assert.doesNotThrow(() => validateEducationSelectionData(validParentEnquiry, null));
  assert.doesNotThrow(() => validateEducationSelectionData(validParentEnquiry, 'invalid catalogue shape'));
});

test('education validation still rejects an exam that is not offered for the selected class', () => {
  assert.throws(
    () => validateEducationSelectionData({ ...validParentEnquiry, examPreparations: ['jee-main'] }, defaultSettings.educationCatalog),
    error => error instanceof HttpError && error.status === 422 && Boolean(error.details.examPreparations),
  );
});

test('education validation retains subject and stream checks for senior secondary classes', () => {
  assert.throws(
    () => validateEducationSelectionData({ ...validParentEnquiry, studentClass: '11', streamId: 'pcm', subjects: ['Biology'] }, defaultSettings.educationCatalog),
    error => error instanceof HttpError && error.status === 422 && Boolean(error.details.subjects),
  );
});

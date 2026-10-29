import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeacherRegistrationFormData, buildTeacherRegistrationPreparation, prepareTeacherRegistrationAttempt, safeTeacherPreparationError } from './teacherRegistrationRequest.js';
import { buildTeacherRegistrationWhatsAppMessage, createSubmissionGuard } from './whatsapp.js';

test('registration multipart request uses backend field names and preserves explicit consent version', async () => {
  const values = {
    website: '', personal: { fullName: 'Test Teacher', email: 'teacher@example.test' },
    location: { stateId: 'up', districtId: 'prayagraj', localityId: 'naini', locality: 'Naini' },
    academics: { class10: { board: 'CBSE' }, certificationsText: ' B.Ed., CTET ', postgraduation: {} },
    teaching: { subjects: ['Mathematics'] }, availability: { days: ['Monday'] }, fees: { paymentModes: ['UPI'] },
    termsAccepted: true, termsVersionId: 'teacher-terms-current',
  };
  const files = {
    profilePhoto: new Blob(['image'], { type: 'image/png' }),
    qualificationProof: new Blob(['certificate'], { type: 'application/pdf' }),
    aadhaarDocument: new Blob(['identity'], { type: 'application/pdf' }),
  };
  const original = structuredClone(values);
  const form = buildTeacherRegistrationFormData(values, files);
  assert.deepEqual([...form.keys()], ['application', 'profilePhoto', 'qualificationProof', 'aadhaarDocument']);
  const application = JSON.parse(form.get('application'));
  assert.equal(application.termsAccepted, true);
  assert.equal(application.termsVersionId, 'teacher-terms-current');
  assert.deepEqual(application.academics.certifications, ['B.Ed.', 'CTET']);
  assert.equal('certificationsText' in application.academics, false);
  assert.equal('postgraduation' in application.academics, false);
  for (const field of ['profilePhoto', 'qualificationProof', 'aadhaarDocument']) assert.ok(form.get(field) instanceof Blob);
  assert.deepEqual(values, original, 'building the request must not mutate the registration form state');
});

test('unexpected synchronous submission preparation errors release the duplicate-submit guard and preserve retry', () => {
  const guard = createSubmissionGuard();
  const failure = prepareTeacherRegistrationAttempt(guard, () => { throw new ReferenceError('unexpected local setup error'); });
  assert.equal(failure.started, false);
  assert.ok(failure.error instanceof ReferenceError);
  assert.equal(guard.started, false);
  const retry = prepareTeacherRegistrationAttempt(guard, () => ({ requestReady: true }));
  assert.equal(retry.started, true);
  assert.deepEqual(retry.value, { requestReady: true });
  assert.equal(guard.started, true);
});

test('hidden optional fields and incomplete optional postgraduate values prepare safely', () => {
  const values = {
    personal: { fullName: 'Test Teacher' },
    academics: { certifications: [], postgraduation: { degree: '', university: undefined, year: Number.NaN, score: '' } },
    location: {}, teaching: {}, availability: {}, fees: {},
  };
  const files = { profilePhoto: new Blob(['photo'], { type: 'image/jpeg' }), qualificationProof: new Blob(['proof'], { type: 'application/pdf' }), aadhaarDocument: new Blob(['identity'], { type: 'application/pdf' }) };
  const form = buildTeacherRegistrationFormData(values, files);
  const payload = JSON.parse(form.get('application'));
  assert.deepEqual(payload.academics.certifications, []);
  assert.equal('postgraduation' in payload.academics, false);
  assert.equal(payload.personal.fullName, 'Test Teacher');
});

test('final-step snapshot with unregistered earlier-step objects does not throw during WhatsApp preparation', () => {
  // React Hook Form previously used shouldUnregister:true in this wizard, so
  // conditional step unmounts could remove the entire personal object.
  // Optional fields may also be absent when hidden by published form settings.
  const values = {
    website: '', location: { locality: 'Naini', district: 'Prayagraj', state: 'Uttar Pradesh' },
    academics: { postgraduation: {}, certifications: [] },
    teaching: { classes: ['Class 10'], subjects: ['Mathematics'] },
    availability: {}, fees: { paymentModes: ['UPI'] }, termsAccepted: true, termsVersionId: 'terms-v1',
  };
  assert.throws(() => values.personal.fullName, TypeError, 'this was the former unsafe access in the submit callback');
  const files = {
    profilePhoto: new Blob(['photo'], { type: 'image/jpeg' }),
    qualificationProof: new Blob(['proof'], { type: 'application/pdf' }),
    aadhaarDocument: new Blob(['identity'], { type: 'application/pdf' }),
  };
  const guard = createSubmissionGuard();
  const attempt = prepareTeacherRegistrationAttempt(guard, () => {
    const submission = buildTeacherRegistrationPreparation(values, files);
    const message = buildTeacherRegistrationWhatsAppMessage(submission);
    return { ...submission, message };
  });
  assert.equal(attempt.started, true);
  assert.ok(attempt.value.formData instanceof FormData, 'the page can reach its API call only after preparation returns this FormData');
  assert.equal(attempt.value.applicantName, '');
  assert.match(attempt.value.message, /Classes: Class 10/);
  assert.match(attempt.value.message, /Service area: Naini, Prayagraj, Uttar Pradesh/);
  assert.equal(JSON.parse(attempt.value.formData.get('application')).termsVersionId, 'terms-v1');
});

test('preparation errors identify a safe operation stage and always release the retry guard', () => {
  const guard = createSubmissionGuard();
  const failure = prepareTeacherRegistrationAttempt(guard, setStage => {
    setStage('multipart_form_data');
    throw new TypeError('safe test detail');
  });
  assert.equal(failure.started, false);
  assert.equal(failure.error.preparationStage, 'multipart_form_data');
  assert.equal(guard.started, false);
});

test('missing required upload fails preparation safely, skips the API path, and allows retry', () => {
  const guard = createSubmissionGuard();
  let apiCalls = 0;
  const values = { personal: {}, academics: { certificationsText: undefined, postgraduation: undefined }, location: {}, teaching: {}, availability: {}, fees: {} };
  const files = { profilePhoto: new Blob(['photo'], { type: 'image/jpeg' }), qualificationProof: null, aadhaarDocument: new Blob(['identity'], { type: 'application/pdf' }) };
  const attempt = prepareTeacherRegistrationAttempt(guard, () => buildTeacherRegistrationFormData(values, files));
  if (attempt.started) apiCalls += 1;
  assert.equal(attempt.started, false);
  assert.equal(apiCalls, 0);
  assert.equal(guard.started, false);
  assert.match(safeTeacherPreparationError(attempt.error), /reselect your photo, education proof, and Aadhaar/i);
  assert.match(safeTeacherPreparationError(new TypeError('private runtime detail')), /could not be prepared/i);
});

test('submission preparation refuses duplicate starts while the first attempt is active', () => {
  const guard = createSubmissionGuard();
  assert.equal(prepareTeacherRegistrationAttempt(guard, () => 'first').started, true);
  assert.deepEqual(prepareTeacherRegistrationAttempt(guard, () => 'duplicate'), { started: false, value: null, error: null });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAGE_FORM_SETTINGS, PAGE_FORM_FIELDS, applyConfiguredSubmission, validatePageFormDraft } from './pageFormSettings.js';

const clone = value => structuredClone(value);

test('field allowlist covers both existing forms and keeps protected fields fixed', () => {
  assert.deepEqual(Object.keys(PAGE_FORM_FIELDS).sort(), ['becomeTeacher','findTutor']);
  const pages = clone(DEFAULT_PAGE_FORM_SETTINGS);
  pages.findTutor.fields.notes.visible = false;
  assert.doesNotThrow(() => validatePageFormDraft(pages));
  pages.findTutor.fields.phone.visible = false;
  assert.throws(() => validatePageFormDraft(pages), /cannot be changed/);
});

test('rejects field identifiers outside the application allowlist', () => {
  const pages = clone(DEFAULT_PAGE_FORM_SETTINGS);
  pages.findTutor.fields.unapprovedField = { visible: true, required: false };
  assert.throws(() => validatePageFormDraft(pages), /allowlist/);
});

test('hiding an optional Find a Tutor field strips it and does not make it required', () => {
  const pages = clone(DEFAULT_PAGE_FORM_SETTINGS);
  pages.findTutor.fields.locality = { visible: false, required: false };
  pages.findTutor.fields.homeAddress = { visible: false, required: false };
  pages.findTutor.fields.pincode = { visible: false, required: false };
  const payload = { parentName: 'Parent', phone: '9876543210', studentName: 'Student', studentClass: '10', board: 'CBSE', subjects: ['Math'], city: 'Prayagraj', mode: 'home', preferredTiming:'Evenings', budget:5000, locality: 'Private locality', homeAddress: 'Private address', pincode: '211001' };
  const result = applyConfiguredSubmission('findTutor', payload, pages);
  assert.equal('locality' in result, false);
  assert.equal('homeAddress' in result, false);
  assert.equal('pincode' in result, false);
});

test('visible optional fields can be made required and are checked server side', () => {
  const pages = clone(DEFAULT_PAGE_FORM_SETTINGS);
  pages.findTutor.fields.notes = { visible: true, required: true };
  const payload = { parentName: 'Parent', phone: '9876543210', studentName: 'Student', studentClass: '10', board: 'CBSE', subjects: ['Math'], city: 'Prayagraj', mode: 'online', preferredTiming:'Evenings', budget:5000 };
  assert.throws(() => applyConfiguredSubmission('findTutor', payload, pages), error => error.status === 422 && Boolean(error.details.notes));
});

test('teacher hidden optional application details are stripped independently', () => {
  const pages = clone(DEFAULT_PAGE_FORM_SETTINGS);
  pages.becomeTeacher.fields['teaching.previousInstitutions'] = { visible: false, required: false };
  const application = { personal:{fullName:'Teacher',gender:'Other',dob:'1990-01-01',phone:'9876543210',email:'teacher@example.test',address:'Address',pincode:'211001'}, location:{stateId:'up',districtId:'prayagraj',localityId:'naini'}, academics:{class10:{board:"CBSE"},class12:{board:"CBSE"},graduation:{degree:"BA"}}, teaching:{classes:['10'],subjects:['Math'],medium:'English',experienceYears:2,commute:'Walk',previousInstitutions:'Private school'}, availability:{days:['Monday'],timeSlots:['Evening']}, fees:{minMonthly:1000,maxMonthly:2000,paymentModes:['UPI']} };
  const result = applyConfiguredSubmission('becomeTeacher', application, pages);
  assert.equal('previousInstitutions' in result.teaching, false);
  assert.deepEqual(result.teaching.subjects, ['Math']);
});



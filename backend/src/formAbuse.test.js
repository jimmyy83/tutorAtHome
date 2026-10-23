import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.js';
import { formLimiter, HttpError, rejectHoneypot, validate } from './middleware.js';
import { parentEnquirySchema, teacherRegistrationSchema } from './schemas.js';

const parent = {
  parentName: 'Test Parent', phone: '9876543210', studentName: 'Test Student', studentClass: '10', board: 'CBSE',
  subjects: ['Mathematics'], examPreparations: [], city: 'Prayagraj', mode: 'online', preferredDays: [], website: '',
};
const teacher = {
  website: '',
  personal: { fullName: 'Test Teacher', gender: 'Other', dob: '1990-01-01', phone: '+919876543210', email: 'teacher@example.test', address: 'Private address', pincode: '211001', ownVehicle: false },
  location: { stateId: 'up-test', districtId: 'prayagraj-test', localityId: 'naini-test', locality: 'Naini' },
  academics: { class10: { board: 'CBSE', year: 2006, score: '80%' }, class12: { board: 'CBSE', year: 2008, score: '80%' }, graduation: { degree: 'BA', university: 'Test University', year: 2011, score: '80%' }, certifications: [] },
  teaching: { classes: ['10'], subjects: ['Mathematics'], medium: 'English', experienceYears: 5, previousInstitutions: '', preferredAreas: '', homeTuition: true, commute: 'Vehicle' },
  availability: { days: ['Monday'], timeSlots: ['Evening'], teachingStyle: '', freeDemo: false, references: '' },
  fees: { minMonthly: 1000, maxMonthly: 2000, paymentModes: ['UPI'] }, termsAccepted: true,
};

function runMiddleware(middleware, body, ip = '198.51.100.31') {
  const req = { body, ip, ips: [], headers: {}, socket: { remoteAddress: ip }, app: { get: () => false }, originalUrl: '/api/public/test', method: 'POST' };
  const headers = {};
  const res = {
    headersSent: false,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    set(name, value) { headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; this.headersSent = true; return this; },
  };
  return new Promise((resolve, reject) => {
    let settled = false;
    const next = error => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve({ req, res, passed: true });
    };
    Promise.resolve(middleware(req, res, next)).then(() => {
      if (!settled && res.headersSent) {
        settled = true;
        resolve({ req, res, passed: false });
      }
    }, reject);
  });
}

async function runFormValidation(payload, schema) {
  const { req } = await runMiddleware(rejectHoneypot, structuredClone(payload));
  return runMiddleware(validate(schema), req.body).then(result => ({ ...result, req }));
}

test('parent and teacher submissions validate without verification tokens and strip the empty honeypot', async () => {
  const parentResult = await runFormValidation(parent, parentEnquirySchema);
  assert.equal(parentResult.passed, true);
  assert.equal(Object.hasOwn(parentResult.req.body, 'website'), false);

  const teacherResult = await runFormValidation(teacher, teacherRegistrationSchema);
  assert.equal(teacherResult.passed, true);
  assert.equal(Object.hasOwn(teacherResult.req.body, 'website'), false);
});

test('invalid enquiry data and filled honeypot are rejected before persistence', async () => {
  await assert.rejects(
    runFormValidation({ ...parent, city: 'Kanpur' }, parentEnquirySchema),
    error => error instanceof HttpError && error.status === 422,
  );
  await assert.rejects(
    runMiddleware(rejectHoneypot, { ...parent, website: 'https://spam.example' }),
    error => error instanceof HttpError && error.status === 400,
  );
});

test('parent enquiry accepts complete coordinates, allows no map pin, and rejects invalid or incomplete coordinates', async () => {
  const valid = await runFormValidation({ ...parent, mode: 'home', locality: 'Naini', homeAddress: 'Sample address', pincode: '211008', latitude: 25.995, longitude: -80.0 }, parentEnquirySchema);
  assert.equal(valid.passed, true);
  const noPin = await runFormValidation({ ...parent, mode: 'home', locality: 'Naini', homeAddress: 'Sample address', pincode: '211008' }, parentEnquirySchema);
  assert.equal(noPin.passed, true);
  await assert.rejects(runMiddleware(validate(parentEnquirySchema), { ...parent, latitude: 91, longitude: 80 }), error => error instanceof HttpError && error.status === 422 && !!error.details.latitude);
  await assert.rejects(runMiddleware(validate(parentEnquirySchema), { ...parent, latitude: 25, longitude: -181 }), error => error instanceof HttpError && error.status === 422 && !!error.details.longitude);
  await assert.rejects(runMiddleware(validate(parentEnquirySchema), { ...parent, latitude: null, longitude: null }), error => error instanceof HttpError && error.status === 422);
  await assert.rejects(runMiddleware(validate(parentEnquirySchema), { ...parent, latitude: '', longitude: '' }), error => error instanceof HttpError && error.status === 422);
  await assert.rejects(runMiddleware(validate(parentEnquirySchema), { ...parent, latitude: 25 }), error => error instanceof HttpError && error.status === 422 && !!error.details.longitude);
});

test('teacher consent must be present and exactly true at the backend schema boundary', async () => {
  await assert.rejects(runMiddleware(validate(teacherRegistrationSchema), { ...teacher, termsAccepted: false }), error => error instanceof HttpError && error.status === 422 && !!error.details.termsAccepted);
  const { termsAccepted: _omitted, ...withoutConsent } = teacher;
  await assert.rejects(runMiddleware(validate(teacherRegistrationSchema), withoutConsent), error => error instanceof HttpError && error.status === 422 && !!error.details.termsAccepted);
});

test('teacher registration requires structured location and a valid Indian PIN code', async () => {
  const { location: _location, ...withoutLocation } = teacher;
  await assert.rejects(runMiddleware(validate(teacherRegistrationSchema), withoutLocation), error => error instanceof HttpError && error.status === 422 && !!error.details.location);
  const { locality, ...legacyCityLocation } = teacher.location;
  await assert.rejects(runMiddleware(validate(teacherRegistrationSchema), { ...teacher, location: { ...legacyCityLocation, city: locality } }), error => error instanceof HttpError && error.status === 422 && !!error.details['location.locality']);
  await assert.rejects(runMiddleware(validate(teacherRegistrationSchema), { ...teacher, personal: { ...teacher.personal, pincode: '012345' } }), error => error instanceof HttpError && error.status === 422 && !!error.details['personal.pincode']);
});

test('public form rate limiting still rejects submissions over the configured limit', async () => {
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
  for (let i = 0; i < config.formLimitMax; i++) {
    const allowed = await runMiddleware(formLimiter, {}, ip);
    assert.equal(allowed.passed, true);
  }
  const limited = await runMiddleware(formLimiter, {}, ip);
  assert.equal(limited.passed, false);
  assert.equal(limited.res.statusCode, 429);
  assert.equal(limited.res.body?.error?.code, 'RATE_LIMITED');
});

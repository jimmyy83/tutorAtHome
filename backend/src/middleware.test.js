import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from './middleware.js';
import { HttpError } from './middleware.js';

test('parent enquiry 500 remains safe for the client and logs only its correlation, stage and category', () => {
  const originalError = console.error;
  const logs = [];
  let statusCode;
  let body;
  console.error = message => logs.push(String(message));
  try {
    errorHandler(
      new Error('private email, phone, Atlas credential, and personal form fields'),
      { method: 'POST', originalUrl: '/api/public/parent-enquiries', requestId: 'correlation-789', parentEnquiryStage: 'enquiry_write' },
      { status(code) { statusCode = code; return this; }, json(value) { body = value; return this; } },
      () => {},
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(statusCode, 500);
  assert.deepEqual(body, { error: { code: 'ERROR', message: 'Something went wrong on our side.', fields: undefined } });
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), {
    event: 'parent_enquiry_failed', requestId: 'correlation-789', stage: 'enquiry_write', status: 500, category: 'database_transaction_failure',
  });
  assert.doesNotMatch(logs[0], /private email|phone|Atlas credential|personal form fields/);
});

test('parent enquiry quota responds with HTTP 429 and Retry-After without exposing rate-limit keys', () => {
  const originalError = console.error;
  let statusCode;
  let body;
  const headers = {};
  console.error = () => {};
  try {
    const error = new HttpError(429, 'Rate limit reached', { retryAfterSeconds: 12 }, 'RATE_LIMITED');
    error.retryAfterSeconds = 12;
    errorHandler(error, {
      method: 'POST', originalUrl: '/api/public/parent-enquiries', requestId: 'rate-limit-test', parentEnquiryStage: 'rate_limit_reservation',
    }, {
      set(name, value) { headers[name] = value; return this; },
      status(code) { statusCode = code; return this; },
      json(value) { body = value; return this; },
    }, () => {});
  } finally {
    console.error = originalError;
  }
  assert.equal(statusCode, 429);
  assert.equal(body.error.code, 'RATE_LIMITED');
  assert.equal(body.error.retryAfterSeconds, 12);
  assert.equal(headers['Retry-After'], '12');
  assert.equal(body.error.fields, undefined);
});

test('unexpected education validation exceptions return a safe 500 and only log correlation and stage', () => {
  const originalError = console.error;
  const logs = [];
  let statusCode;
  let body;
  console.error = message => logs.push(String(message));
  try {
    errorHandler(
      new TypeError("Cannot read properties of undefined (reading 'some')"),
      { method: 'POST', originalUrl: '/api/public/parent-enquiries', requestId: 'education-correlation', parentEnquiryStage: 'education_validation' },
      { status(code) { statusCode = code; return this; }, json(value) { body = value; return this; } },
      () => {},
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(statusCode, 500);
  assert.equal(body.error.message, 'Something went wrong on our side.');
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), {
    event: 'parent_enquiry_failed', requestId: 'education-correlation', stage: 'education_validation', status: 500, category: 'application_runtime_error',
  });
  assert.doesNotMatch(logs[0], /Cannot read properties|some/);
});

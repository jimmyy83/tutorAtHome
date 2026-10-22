import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.js';
import { verifyCaptcha } from './middleware.js';

test('Turnstile verification sends the token server-side and accepts only Siteverify success', async t => {
  const original = { provider: config.captchaProvider, secret: config.captchaSecret, origins: config.corsOrigins, fetch: globalThis.fetch, warn: console.warn };
  t.after(() => {
    config.captchaProvider = original.provider;
    config.captchaSecret = original.secret;
    config.corsOrigins = original.origins;
    globalThis.fetch = original.fetch;
    console.warn = original.warn;
  });
  config.captchaProvider = 'turnstile';
  config.captchaSecret = 'unit-test-secret';
  config.corsOrigins = ['https://tutor-at-home.vercel.app'];

  let requestBody;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    requestBody = new URLSearchParams(options.body);
    return { ok: true, json: async () => ({ success: true, hostname: 'tutor-at-home.vercel.app' }) };
  };
  let passed = false;
  await verifyCaptcha({ headers: { 'x-captcha-token': 'unit-test-token' }, body: {}, ip: '127.0.0.1' }, {}, error => {
    assert.equal(error, undefined);
    passed = true;
  });
  assert.equal(passed, true);
  assert.equal(requestBody.get('secret'), 'unit-test-secret');
  assert.equal(requestBody.get('response'), 'unit-test-token');
});

test('Turnstile rejection and Siteverify network failures remain errors', async t => {
  const original = { provider: config.captchaProvider, secret: config.captchaSecret, origins: config.corsOrigins, fetch: globalThis.fetch, warn: console.warn };
  t.after(() => {
    config.captchaProvider = original.provider;
    config.captchaSecret = original.secret;
    config.corsOrigins = original.origins;
    globalThis.fetch = original.fetch;
    console.warn = original.warn;
  });
  config.captchaProvider = 'turnstile';
  config.captchaSecret = 'unit-test-secret';
  config.corsOrigins = ['https://tutor-at-home.vercel.app'];
  console.warn = () => {};

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }) });
  let rejected;
  await verifyCaptcha({ headers: { 'x-captcha-token': 'expired-token' }, body: {}, ip: '127.0.0.1' }, {}, error => { rejected = error; });
  assert.equal(rejected?.status, 400);
  assert.equal(rejected?.code, 'CAPTCHA_EXPIRED');
  assert.match(rejected?.message, /expired or was already used/);

  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  let unavailable;
  await verifyCaptcha({ headers: { 'x-captcha-token': 'unit-test-token' }, body: {}, ip: '127.0.0.1' }, {}, error => { unavailable = error; });
  assert.equal(unavailable?.status, 503);
  assert.equal(unavailable?.code, 'CAPTCHA_UNAVAILABLE');
});

test('Turnstile success for a different hostname is rejected', async t => {
  const original = { provider: config.captchaProvider, secret: config.captchaSecret, origins: config.corsOrigins, fetch: globalThis.fetch, warn: console.warn };
  t.after(() => {
    config.captchaProvider = original.provider;
    config.captchaSecret = original.secret;
    config.corsOrigins = original.origins;
    globalThis.fetch = original.fetch;
    console.warn = original.warn;
  });
  config.captchaProvider = 'turnstile';
  config.captchaSecret = 'unit-test-secret';
  config.corsOrigins = ['https://tutor-at-home.vercel.app'];
  console.warn = () => {};
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true, hostname: 'wrong.example' }) });
  let rejected;
  await verifyCaptcha({ headers: { 'x-captcha-token': 'unit-test-token' }, body: {}, ip: '127.0.0.1' }, {}, error => { rejected = error; });
  assert.equal(rejected?.status, 400);
  assert.equal(rejected?.code, 'CAPTCHA_HOSTNAME_MISMATCH');
});

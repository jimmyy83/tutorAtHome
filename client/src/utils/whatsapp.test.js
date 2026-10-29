import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeacherRegistrationWhatsAppMessage, createSubmissionGuard, startWhatsAppSubmission, startTeacherRegistrationSubmission, buildWhatsAppUrl, resolveWhatsAppRecipient, navigateToLatestWhatsApp, openWhatsAppTarget, reserveWhatsAppWindow, TEACHER_WHATSAPP_TARGET } from './whatsapp.js';

const originalWindow = globalThis.window;

function mockWindow(calls) {
  globalThis.window = {
    open(url, target) {
      calls.push(['open', url, target]);
      return { opener: {}, closed: false, location: { href: url } };
    },
  };
}

test('opens the configured WhatsApp chat immediately and starts a save without waiting', async () => {
  const calls = [];
  mockWindow(calls);
  try {
    const operation = startWhatsAppSubmission({
      recipient: '919532761193',
      message: 'Parent enquiry: Class 7 & Science',
      save: () => { calls.push(['save']); return Promise.resolve({ reference: 'ENQ-REAL-1' }); },
    });
    assert.equal(operation.opened, true);
    assert.equal(calls[0][0], 'open');
    assert.match(calls[0][1], /^https:\/\/wa\.me\/919532761193\?text=/);
    assert.match(decodeURIComponent(calls[0][1]), /Class 7 & Science/);
    assert.equal(calls[1][0], 'save');
    assert.deepEqual(await operation.savePromise, { reference: 'ENQ-REAL-1' });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('WhatsApp remains opened when the backend rejects or times out', async () => {
  for (const error of [Object.assign(new Error('backend rejected'), { status: 422 }), Object.assign(new Error('timed out'), { status: 0 })]) {
    const calls = [];
    mockWindow(calls);
    try {
      const operation = startWhatsAppSubmission({ recipient: '919532761193', message: 'Teacher registration submitted', save: () => Promise.reject(error) });
      assert.equal(operation.opened, true);
      assert.equal(calls[0][0], 'open');
      await assert.rejects(operation.savePromise, error);
    } finally {
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  }
});

test('submission guard blocks rapid repeat clicks until explicitly reset', () => {
  const guard = createSubmissionGuard();
  assert.equal(guard.tryStart(), true);
  assert.equal(guard.tryStart(), false);
  assert.equal(guard.started, true);
  guard.reset();
  assert.equal(guard.tryStart(), true);
});

test('configured WhatsApp numbers are normalized and never replaced with a fixed recipient', () => {
  assert.equal(resolveWhatsAppRecipient('+91 98765-43210'), '919876543210');
  assert.match(buildWhatsAppUrl('9876543210'), /^https:\/\/wa\.me\/919876543210\?/);
  assert.equal(buildWhatsAppUrl('not-a-number'), '');
  assert.equal(resolveWhatsAppRecipient(undefined), '');
  assert.equal(buildWhatsAppUrl(''), '');
});

test('latest published settings determine the redirect destination and encoded message', async () => {
  const calls = [], popup = { closed: false, location: { href: '' }, close() { this.closed = true; } };
  const result = await navigateToLatestWhatsApp({ popup, loadSettings: async () => ({ settings: { whatsapp: '+91 98765-43210' } }), message: 'Teacher: Asha & Class 11' });
  assert.equal(result.recipient, '919876543210');
  assert.equal(result.redirected, true);
  assert.match(popup.location.href, /^https:\/\/wa\.me\/919876543210\?text=/);
  assert.equal(decodeURIComponent(popup.location.href.split('text=')[1]), 'Teacher: Asha & Class 11');
  const updated = await navigateToLatestWhatsApp({ popup: { closed: false, location: { href: '' }, close() {} }, loadSettings: async () => ({ settings: { whatsapp: '919532761193' } }), message: 'Updated setting' });
  assert.equal(updated.recipient, '919532761193');
  assert.deepEqual(calls, []);
});

test('missing/invalid settings never redirect and close the reserved tab', async () => {
  for (const settings of [undefined, { settings: {} }, { settings: { whatsapp: 'bad-number' } }]) {
    const popup = { closed: false, close() { this.closed = true; }, location: { href: '' } };
    const result = await navigateToLatestWhatsApp({ popup, loadSettings: async () => settings, message: 'Teacher contact' });
    assert.equal(result.recipient, '');
    assert.equal(result.redirected, false);
    assert.ok(result.error);
    assert.equal(popup.closed, true);
    assert.equal(popup.location.href, '');
  }
});

test('popup-blocked browsers still retain a valid recipient for the visible continuation link', async () => {
  const result = await navigateToLatestWhatsApp({ popup: null, loadSettings: async () => ({ settings: { whatsapp: '919532761193' } }), message: 'Teacher contact' });
  assert.equal(result.recipient, '919532761193');
  assert.equal(result.redirected, false);
  assert.match(buildWhatsAppUrl(result.recipient, 'Teacher contact'), /^https:\/\/wa\.me\/919532761193\?text=/);
});

test('teacher fallback reuses the single named tab reserved by the submit click', () => {
  const opened = [], popup = { opener: {}, location: { href: '' } };
  globalThis.window = { open: (url, name) => { opened.push({ url, name }); return popup; }, location: { assign() { assert.fail('should reuse the reserved tab'); } } };
  try {
    const reserved = reserveWhatsAppWindow();
    assert.equal(reserved, popup);
    assert.equal(opened[0].url, 'about:blank');
    assert.equal(opened[0].name, TEACHER_WHATSAPP_TARGET);
    assert.equal(popup.opener, null);
    assert.equal(openWhatsAppTarget('919532761193', 'Teacher & Math'), true);
    assert.equal(opened.length, 2);
    assert.equal(opened[1].name, TEACHER_WHATSAPP_TARGET);
    assert.match(opened[1].url, /^https:\/\/wa\.me\/919532761193\?text=/);
    assert.equal(decodeURIComponent(opened[1].url.split('text=')[1]), 'Teacher & Math');
  } finally { globalThis.window = originalWindow; }
});

test('blocked automatic and fallback popups still allow WhatsApp through the explicit user click', () => {
  let assigned = '';
  globalThis.window = { open: () => null, location: { assign: href => { assigned = href; } } };
  try {
    assert.equal(openWhatsAppTarget('919532761193', 'Hello TutorAtHome'), true);
    assert.match(assigned, /^https:\/\/wa\.me\/919532761193\?text=/);
  } finally { globalThis.window = originalWindow; }
});

test('teacher WhatsApp summary includes useful registration details but never private document data', () => {
  const message = buildTeacherRegistrationWhatsAppMessage({ applicantName: 'Asha & Ravi', reference: 'TCH-2026-ABC123', saved: true, classes: ['11', '12'], subjects: ['Physics', 'Mathematics'], serviceArea: 'Naini, Prayagraj', aadhaarDocument: 'private-url', qualificationProof: 'private-url', password: 'secret' });
  assert.match(message, /Asha & Ravi/);
  assert.match(message, /TCH-2026-ABC123/);
  assert.match(message, /Physics, Mathematics/);
  assert.match(message, /Naini, Prayagraj/);
  assert.doesNotMatch(message, /private-url|secret|aadhaar|certificate/i);
  assert.match(buildWhatsAppUrl('919532761193', message), /text=Asha|text=Hello/);
});

test('teacher save starts immediately while the latest WhatsApp setting resolves independently', async () => {
  let releaseSettings;
  const popup = { closed: false, location: { href: '' }, close() { this.closed = true; } };
  const calls = [];
  const operation = startTeacherRegistrationSubmission({
    popup,
    save: () => { calls.push('save'); return Promise.resolve({ reference: 'TCH-REAL-1' }); },
    loadSettings: () => { calls.push('settings'); return new Promise(resolve => { releaseSettings = resolve; }); },
    message: 'Teacher: Mira & Class 11',
  });
  assert.deepEqual(calls, ['save', 'settings']);
  assert.deepEqual(await operation.savePromise, { reference: 'TCH-REAL-1' });
  releaseSettings({ settings: { whatsapp: '919876543210' } });
  const whatsapp = await operation.whatsappPromise;
  assert.equal(whatsapp.recipient, '919876543210');
  assert.equal(whatsapp.redirected, true);
  assert.match(popup.location.href, /^https:\/\/wa\.me\/919876543210\?text=/);
  assert.match(decodeURIComponent(popup.location.href), /Mira & Class 11/);
});

test('failed teacher save does not cancel WhatsApp continuation or automatically retry', async () => {
  let saveCount = 0;
  const failure = Object.assign(new Error('server rejected'), { status: 422 });
  const operation = startTeacherRegistrationSubmission({
    popup: null,
    save: () => { saveCount += 1; return Promise.reject(failure); },
    loadSettings: async () => ({ settings: { whatsapp: '919532761193' } }),
    message: 'Contact about teacher registration',
  });
  await assert.rejects(operation.savePromise, failure);
  const whatsapp = await operation.whatsappPromise;
  assert.equal(whatsapp.recipient, '919532761193');
  assert.equal(whatsapp.redirected, false);
  assert.equal(saveCount, 1);
});

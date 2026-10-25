import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubmissionGuard, startWhatsAppSubmission, buildWhatsAppUrl, resolveWhatsAppRecipient } from './whatsapp.js';

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
  assert.equal(resolveWhatsAppRecipient(undefined), '919532761193');
});
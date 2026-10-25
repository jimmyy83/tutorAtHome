import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { normalizeWhatsAppNumber } from './whatsappSettings.js';
import { passwordChangeSchema, settingsSchema, whatsappSettingsSchema } from './schemas.js';
import { changeAdminPassword } from './adminPassword.js';

test('normalizes Indian WhatsApp numbers and rejects invalid formats', () => {
  assert.equal(normalizeWhatsAppNumber('+91 98765-43210'), '919876543210');
  assert.equal(normalizeWhatsAppNumber('9876543210'), '919876543210');
  assert.equal(normalizeWhatsAppNumber('001442079460123'), '1442079460123');
  assert.equal(normalizeWhatsAppNumber('not-a-number'), '');
  assert.equal(normalizeWhatsAppNumber('123'), '');
});

test('WhatsApp number schemas normalize and reject invalid inputs', () => {
  assert.equal(whatsappSettingsSchema.parse({ whatsapp: '+91 (98765) 43210' }).whatsapp, '919876543210');
  assert.equal(settingsSchema.parse({ whatsapp: '9876543210' }).whatsapp, '919876543210');
  assert.equal(whatsappSettingsSchema.safeParse({ whatsapp: 'bad' }).success, false);
});

test('password change requires a matching confirmation and secure length', () => {
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: 'old', newPassword: 'A-secure-password-123', confirmPassword: 'A-secure-password-123' }).success, true);
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: 'old', newPassword: 'short', confirmPassword: 'short' }).success, false);
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: 'old', newPassword: 'A-secure-password-123', confirmPassword: 'different-password-123' }).success, false);
});

test('password change checks current password, hashes the replacement and does not accept other account roles', async () => {
  const account = { id: 17, role: 'admin', password_hash: await bcrypt.hash('Existing-password-123', 4) };
  let persistedHash = account.password_hash;
  await changeAdminPassword({ account, currentPassword: 'Existing-password-123', newPassword: 'New-secure-password-456', updatePassword: async (id, oldHash, nextHash) => { assert.equal(id, 17); assert.equal(oldHash, persistedHash); persistedHash = nextHash; return { matchedCount: 1 }; } });
  assert.notEqual(persistedHash, 'New-secure-password-456');
  assert.equal(await bcrypt.compare('New-secure-password-456', persistedHash), true);
  await assert.rejects(changeAdminPassword({ account: { ...account, password_hash: persistedHash }, currentPassword: 'wrong', newPassword: 'Another-secure-password-789', updatePassword: async () => ({ matchedCount: 1 }) }), error => error.status === 401);
  await assert.rejects(changeAdminPassword({ account: { ...account, role: 'editor' }, currentPassword: 'Existing-password-123', newPassword: 'Another-secure-password-789', updatePassword: async () => ({ matchedCount: 1 }) }), error => error.status === 401);
});

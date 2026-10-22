import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { authenticateAdmin } from './adminAuth.js';

const email = 'admin@example.test';
const password = 'Correct-local-password-123';
const admin = { id: 7, email, role: 'admin', password_hash: await bcrypt.hash(password, 4) };
const lookup = async normalizedEmail => normalizedEmail === email ? admin : null;

test('authenticates an existing admin with normalized email and bcrypt password', async () => {
  const result = await authenticateAdmin(`  ${email.toUpperCase()}  `, password, lookup);
  assert.equal(result, admin);
});

test('rejects an incorrect password', async () => {
  assert.equal(await authenticateAdmin(email, 'wrong-password', lookup), null);
});

test('rejects a wrong email', async () => {
  assert.equal(await authenticateAdmin('other@example.test', password, lookup), null);
});

test('rejects a missing admin record', async () => {
  assert.equal(await authenticateAdmin(email, password, async () => null), null);
});

test('rejects records without an allowed admin role', async () => {
  assert.equal(await authenticateAdmin(email, password, async () => ({ ...admin, role: 'user' })), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(directory, 'reset-admin-password.js');
const runReset = (env, args = ['--confirm']) => spawnSync(process.execPath, [script, ...args], {
  cwd: path.dirname(directory), encoding: 'utf8', timeout: 10000,
  env: { ...process.env, MONGODB_URI: 'mongodb://192.0.2.10:27017/tutorathome_test', MONGODB_DB_NAME: 'tutorathome_test', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'local-test-password-1234', ...env },
});

test('admin reset refuses production without connecting', () => {
  const result = runReset({ NODE_ENV: 'production' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to reset an admin password in production/);
  assert.doesNotMatch(result.stderr, /local-test-password-1234|mongodb:\/\//);
});

test('admin reset still refuses production with remote opt-in', () => {
  const result = runReset({ NODE_ENV: 'production' }, ['--confirm', '--allow-remote-development-db']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to reset an admin password in production/);
  assert.doesNotMatch(result.stderr, /local-test-password-1234|mongodb:\/\//);
});
test('admin reset refuses remote MongoDB hosts in development', () => {
  const result = runReset({ NODE_ENV: 'development' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /remote MongoDB host/);
  assert.doesNotMatch(result.stderr, /local-test-password-1234|mongodb:\/\//);
});

test('admin reset requires explicit confirmation', () => {
  const result = runReset({ NODE_ENV: 'development' }, []);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Explicit confirmation required/);
});

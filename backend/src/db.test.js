import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDoc, json, toId, escapeRegex } from './db.js';

test('Mongo document conversion keeps existing API-compatible numeric ids', () => {
  assert.equal(toId('41'), 41);
  assert.equal(toId('banner-key'), 'banner-key');
  assert.deepEqual(cleanDoc({ _id: 'mongo-id', id: 41, title: 'hello' }), { id: 41, title: 'hello' });
});

test('JSON conversion accepts Mongo-native objects and retains legacy string records', () => {
  assert.deepEqual(json('{"area":"Civil Lines"}'), { area: 'Civil Lines' });
  assert.deepEqual(json({ area: 'Civil Lines' }), { area: 'Civil Lines' });
  assert.deepEqual(json('', []), []);
  assert.equal(json('invalid', null), null);
});

test('search strings are escaped before use as Mongo regular expressions', () => {
  const literal = '[Prayagraj].*';
  const expression = new RegExp(escapeRegex(literal), 'i');
  assert.equal(expression.test(literal), true);
  assert.equal(expression.test('Prayagraj random'), false);
});

test('database connection requires explicit Mongo configuration', async () => {
  const { connectDb } = await import('./db.js');
  if (process.env.MONGODB_URI) return;
  await assert.rejects(connectDb(), /MONGODB_URI is required/);
});

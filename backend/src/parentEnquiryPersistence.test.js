import test from 'node:test';
import assert from 'node:assert/strict';
import { findParentEnquiryReplay, persistParentEnquiry } from './parentEnquiryPersistence.js';
import { prepareParentEnquiryRateLimitBuckets, reserveParentEnquiryRateLimits } from './parentEnquiryRateLimit.js';
import { parentEnquirySchema } from './schemas.js';
import { normalizeTeacherPhone } from './adminDataManagement.js';

const options = { phone: '+919876543210', ip: '192.0.2.1', secret: 'test-only-secret', phoneMax: 3, phoneWindowMs: 24 * 60 * 60 * 1000, ipMax: 20, ipWindowMs: 24 * 60 * 60 * 1000 };
function memoryCollection() {
  const rows = new Map();
  return {
    rows,
    async findOne(filter) { return rows.get(filter._id) || null; },
    async updateOne(filter, update, { session } = {}) {
      let row = rows.get(filter._id);
      if (!row && update.$setOnInsert) { row = { _id: filter._id, ...update.$setOnInsert }; rows.set(filter._id, row); }
      if (!row) return { modifiedCount: 0 };
      if (update.$set) Object.assign(row, update.$set);
      return { modifiedCount: 1, session };
    },
  };
}
const reserve = async (collection, overrides = {}, now = Date.UTC(2026, 0, 1)) => {
  const prepared = await prepareParentEnquiryRateLimitBuckets({ collection, ...options, ...overrides, now });
  await reserveParentEnquiryRateLimits({ collection, transactionSession: {}, prepared });
};

test('same phone may submit again after the configured rolling cooldown', async () => {
  const collection = memoryCollection();
  await reserve(collection, { phoneMax: 1, phoneWindowMs: 1000 }, 1000);
  await reserve(collection, { phoneMax: 1, phoneWindowMs: 1000 }, 2000);
  const phoneBuckets = [...collection.rows.values()].filter(row => row._id.startsWith('phone:'));
  assert.equal(phoneBuckets.length, 1);
  assert.deepEqual(phoneBuckets[0].events, [2000]);
});

test('phone submissions over the configured limit return HTTP 429 with Retry-After data', async () => {
  const collection = memoryCollection();
  const start = Date.UTC(2026, 0, 1);
  for (let index = 0; index < 3; index++) await reserve(collection, {}, start + index);
  await assert.rejects(reserve(collection, {}, start + 10), error => {
    assert.equal(error.status, 429);
    assert.equal(error.code, 'RATE_LIMITED');
    assert.ok(error.retryAfterSeconds > 0);
    assert.equal(error.retryAfterSeconds, Math.ceil((start + options.phoneWindowMs - (start + 10)) / 1000));
    assert.match(error.message, /phone number/i);
    return true;
  });
});

test('different phone numbers are allowed and device identity is not part of rate keys', async () => {
  const collection = memoryCollection();
  await reserve(collection, { phone: '+919876543210', ip: '192.0.2.1' });
  await reserve(collection, { phone: '+919876543211', ip: '192.0.2.1' });
  const phoneBuckets = [...collection.rows.values()].filter(row => row._id.startsWith('phone:'));
  assert.equal(phoneBuckets.length, 2);
  assert.ok(phoneBuckets.every(row => row.events.length === 1));
});

test('equivalent phone formats share the same normalized quota key', async () => {
  assert.equal(normalizeTeacherPhone('98765 43210'), normalizeTeacherPhone('+91 (98765) 43210'));
  const collection = memoryCollection();
  await reserve(collection, { phone: normalizeTeacherPhone('98765 43210') });
  await reserve(collection, { phone: normalizeTeacherPhone('+91 (98765) 43210') });
  const phoneBuckets = [...collection.rows.values()].filter(row => row._id.startsWith('phone:'));
  assert.equal(phoneBuckets.length, 1);
  assert.equal(phoneBuckets[0].events.length, 2);
});

test('IP safeguard limits different phone numbers from the same network', async () => {
  const collection = memoryCollection();
  await reserve(collection, { phone: '+919876543210', ip: '192.0.2.5', ipMax: 2 });
  await reserve(collection, { phone: '+919876543211', ip: '192.0.2.5', ipMax: 2 });
  await assert.rejects(reserve(collection, { phone: '+919876543212', ip: '192.0.2.5', ipMax: 2 }), error => error.status === 429 && /network/i.test(error.message));
});

test('an idempotent retry returns its original saved response without reserving another quota slot', async () => {
  const savedResponse = { id: 4, reference: 'ENQ-test' };
  let lookupCount = 0;
  const lookup = { findOne: async () => { lookupCount++; return { digest: 'same-digest', response: savedResponse }; } };
  const rateLimits = memoryCollection();
  const retry = await findParentEnquiryReplay(lookup, 'request-key', 'same-digest');
  assert.deepEqual(retry, { matches: true, response: savedResponse });
  if (!retry) await prepareParentEnquiryRateLimitBuckets({ collection: rateLimits, ...options });
  assert.equal(lookupCount, 1);
  assert.equal(rateLimits.rows.size, 0);
  assert.equal(await findParentEnquiryReplay(lookup, null, 'same-digest'), null);
});

test('invalid parent data is rejected before any phone or IP quota bucket is prepared', async () => {
  const rateLimits = memoryCollection();
  const invalid = parentEnquirySchema.safeParse({ parentName: 'Parent', phone: 'not-a-phone' });
  assert.equal(invalid.success, false);
  if (invalid.success) await prepareParentEnquiryRateLimitBuckets({ collection: rateLimits, ...options });
  assert.equal(rateLimits.rows.size, 0);
});

test('parent enquiry persistence remains pending until transaction commit completes', async () => {
  let releaseCommit;
  let committed = false;
  let completed = false;
  const commitGate = new Promise(resolve => { releaseCommit = resolve; });
  const transaction = async work => {
    await work({ transaction: true });
    await commitGate;
    committed = true;
  };
  const writes = [];
  const rateLimits = memoryCollection();
  const save = persistParentEnquiry({
    transaction,
    idempotencyCollection: { insertOne: async doc => writes.push(['idempotency', doc]) },
    rateLimitCollection: rateLimits,
    rateLimitOptions: { ...options, now: Date.UTC(2026, 0, 1) },
    enquiryCollection: { insertOne: async doc => writes.push(['enquiry', doc]) },
    idempotencyRecord: { key: 'safe-test-key' }, enquiryRecord: { id: 1 },
  }).then(() => { completed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(committed, false);
  assert.deepEqual(writes.map(([collection]) => collection), ['idempotency', 'enquiry']);
  releaseCommit();
  await save;
  assert.equal(committed, true);
  assert.equal(completed, true);
});

test('failed database writes roll back phone and IP quota increments', async () => {
  const enquiries = [];
  const idempotency = [];
  const rateLimits = memoryCollection();
  let successResponseSent = false;
  await assert.rejects((async () => {
    await persistParentEnquiry({
      transaction: async work => {
        const snapshots = [idempotency.slice(), enquiries.slice(), structuredClone([...rateLimits.rows])];
        try { await work({}); throw new Error('simulated commit failure'); }
        catch (error) {
          idempotency.splice(0, idempotency.length, ...snapshots[0]);
          enquiries.splice(0, enquiries.length, ...snapshots[1]);
          rateLimits.rows.clear();
          for (const [key, row] of snapshots[2]) rateLimits.rows.set(key, row);
          throw error;
        }
      },
      idempotencyCollection: { insertOne: async row => idempotency.push(row) },
      rateLimitCollection: rateLimits,
      rateLimitOptions: { ...options, now: Date.UTC(2026, 0, 1) },
      enquiryCollection: { insertOne: async row => enquiries.push(row) },
      idempotencyRecord: { key: 'safe-test-key' }, enquiryRecord: { id: 1 },
    });
    successResponseSent = true;
  })(), /simulated commit failure/);
  assert.equal(idempotency.length, 0);
  assert.equal(enquiries.length, 0);
  assert.ok([...rateLimits.rows.values()].every(row => row.events.length === 0));
  assert.equal(successResponseSent, false);
});

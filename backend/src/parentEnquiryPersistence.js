import { prepareParentEnquiryRateLimitBuckets, reserveParentEnquiryRateLimits } from './parentEnquiryRateLimit.js';

// The route may send HTTP 201 only after this promise resolves, which happens
// after withTransaction has completed its commit phase.
export async function findParentEnquiryReplay(collection, key, digest) {
  if (!key) return null;
  const prior = await collection.findOne({ key }, { projection: { digest: 1, response: 1 } });
  if (!prior) return null;
  return { matches: prior.digest === digest, response: prior.response };
}

export async function persistParentEnquiry({ transaction, idempotencyCollection, enquiryCollection, rateLimitCollection, rateLimitOptions, idempotencyRecord, enquiryRecord, onStage = () => {} }) {
  onStage('rate_limit_reservation');
  const preparedRateLimits = await prepareParentEnquiryRateLimitBuckets({ collection: rateLimitCollection, ...rateLimitOptions });
  await transaction(async session => {
    await reserveParentEnquiryRateLimits({ collection: rateLimitCollection, transactionSession: session, prepared: preparedRateLimits });
    if (idempotencyRecord) {
      onStage('idempotency_write');
      await idempotencyCollection.insertOne(idempotencyRecord, { session });
    }
    onStage('enquiry_write');
    await enquiryCollection.insertOne(enquiryRecord, { session });
    onStage('transaction_commit');
  });
}

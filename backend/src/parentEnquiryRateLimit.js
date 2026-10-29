import crypto from 'node:crypto';
import { HttpError } from './middleware.js';

const hashKey = (secret, scope, value) => crypto.createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex');

function retryAfterSeconds(windowStart, windowMs, nowMs) {
  return Math.max(1, Math.ceil((windowStart + windowMs - nowMs) / 1000));
}

function limitError(scope, retryAfter) {
  const message = scope === 'phone'
    ? 'You have reached the enquiry limit for this phone number. Please try again after the cooldown.'
    : 'Too many enquiries have been submitted from this network. Please try again later.';
  const error = new HttpError(429, message, { retryAfterSeconds: retryAfter }, 'RATE_LIMITED');
  error.retryAfterSeconds = retryAfter;
  return error;
}

// Rate documents are initialized outside the transaction with no events.
// Successful-event timestamps are written only inside the enquiry transaction,
// so an aborted enquiry never consumes quota. Stored keys are HMAC hashes.
export async function prepareParentEnquiryRateLimitBuckets({ collection, phone, ip, secret, now = Date.now(), phoneMax = 3, phoneWindowMs = 24 * 60 * 60 * 1000, ipMax = 20, ipWindowMs = 24 * 60 * 60 * 1000 }) {
  const reservations = [
    { scope: 'phone', key: hashKey(secret, 'phone', phone), max: phoneMax, windowMs: phoneWindowMs },
    { scope: 'ip', key: hashKey(secret, 'ip', ip || 'unknown'), max: ipMax, windowMs: ipWindowMs },
  ].map(item => ({ ...item, id: `${item.scope}:${item.key}`, expiresAt: new Date(now + item.windowMs * 2) }));

  for (const reservation of reservations) {
    try {
      await collection.updateOne(
        { _id: reservation.id },
        { $setOnInsert: { events: [], expires_at: reservation.expiresAt } },
        { upsert: true },
      );
    } catch (error) {
      // A concurrent first request may create the same bucket. Keep the
      // existing bucket; any other initialization error must fail closed.
      if (error?.code !== 11000) throw error;
    }
  }

  return { reservations, now };
}

export async function reserveParentEnquiryRateLimits({ collection, transactionSession, prepared }) {
  const { reservations, now } = prepared;
  for (const reservation of reservations) {
    const bucket = await collection.findOne({ _id: reservation.id }, { session: transactionSession });
    if (!bucket) throw new Error('Parent enquiry rate-limit bucket was not initialized.');
    const recentEvents = (Array.isArray(bucket.events) ? bucket.events : []).filter(timestamp => Number.isFinite(timestamp) && timestamp > now - reservation.windowMs);
    if (recentEvents.length >= reservation.max) {
      throw limitError(reservation.scope, retryAfterSeconds(Math.min(...recentEvents), reservation.windowMs, now));
    }
    await collection.updateOne(
      { _id: reservation.id },
      { $set: { events: [...recentEvents, now], expires_at: new Date(now + reservation.windowMs * 2) } },
      { session: transactionSession },
    );
  }
}

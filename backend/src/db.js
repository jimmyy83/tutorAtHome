import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client;
let database;
export const now = () => new Date().toISOString();
export const json = (s, fallback = null) => {
  if (s == null || s === '') return fallback;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return fallback; }
};

export async function connectDb() {
  if (!config.mongoUri) throw new Error('MONGODB_URI is required. Configure it in the backend environment.');
  try {
    client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10000, appName: 'TutorAtHome-API' });
    await client.connect();
    database = client.db(config.mongoDbName || undefined);
    await database.command({ ping: 1 });
    await ensureIndexes();
    return database;
  } catch (error) {
    await client?.close().catch(() => {});
    client = undefined; database = undefined;
    // Driver error strings may contain connection details; never log or rethrow them verbatim.
    throw new Error('MongoDB connection failed. Check MONGODB_URI, network access, and Atlas credentials.');
  }
}
export function getDb() {
  if (!database) throw new Error('MongoDB is not connected.');
  return database;
}
export async function closeDb() { await client?.close(); client = undefined; database = undefined; }
export const col = (name) => getDb().collection(name);
export const toId = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : value;
};
export const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const cleanDoc = (doc) => { if (!doc) return doc; const { _id, ...rest } = doc; return { ...rest, id: rest.id ?? _id }; };
export async function nextId(name) {
  const result = await col('_counters').findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return result.seq;
}
async function ensureIndexes() {
  const indexes = [
    ...['admins', 'settings', 'content', 'revisions', 'banners', 'media', 'teachers', 'enquiries', 'enquiry_notes'].map(name => [name, [{ key: { id: 1 }, options: { unique: true } }]]),
    ['admins', [{ key: { email: 1 }, options: { unique: true } }]],
    ['teachers', [{ key: { reference: 1 }, options: { unique: true } }, { key: { email: 1 } }, { key: { phone: 1 } }, { key: { status: 1, featured: 1, featured_order: 1 } }, { key: { status: 1, location_state_id: 1, location_district_id: 1, location_locality_id: 1 } }]],
    ['enquiries', [{ key: { reference: 1 }, options: { unique: true } }, { key: { status: 1, created_at: -1 } }]],
    ['banners', [{ key: { enabled: 1, archived: 1, priority: -1 } }]],
    ['enquiry_notes', [{ key: { enquiry_id: 1, id: -1 } }]],
  ];
  for (const [name, defs] of indexes) for (const { key, options = {} } of defs) await col(name).createIndex(key, options);
}

import crypto from 'node:crypto';

export const permanentDeleteRecordTypes = Object.freeze({ parentEnquiries: 'enquiries', teacherRegistrations: 'teachers' });

export function parsePermanentDeleteId(value) {
  const text = String(value ?? '');
  if (!/^\d{1,15}$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1) throw new Error('Choose a valid record identifier.');
  return Number(text);
}

export function assertPermanentDeleteEligible(recordType, record) {
  if (recordType === 'teacherRegistrations' && record?.status !== 'rejected') throw new Error('Only rejected teacher registrations can be permanently deleted. Pending and approved teacher records are protected.');
  if (recordType === 'parentEnquiries' && record?.status !== 'closed') throw new Error('Only closed parent enquiries can be permanently deleted. Open enquiries are protected.');
}

function parseStored(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

export function retainedAssetReferences(record, recordType, recordId, retainedAt) {
  const found = new Map();
  const visit = (input, key = '', path = '') => {
    const value = parseStored(input);
    if (Array.isArray(value)) { value.forEach((item, index) => visit(item, key, `${path}[${index}]`)); return; }
    if (!value || typeof value !== 'object') {
      if (typeof value !== 'string') return;
      if (/^(public_id|publicid|publicphotoid|image_public_id|imagepublicid|imagepublicphotoid)$/i.test(key) && value.trim()) {
        found.set(`id:${value}`, { public_id: value });
      } else if (/^(secure_?url|imageurl|publicphoto)$/i.test(key) && /^https:\/\//i.test(value)) {
        found.set(`url:${value}`, { secure_url_hash: crypto.createHash('sha256').update(value).digest('hex') });
      } else if (/^(publicid|public_photo_id)$/i.test(key) && value.trim()) {
        found.set(`id:${value}`, { public_id: value });
      }
      return;
    }
    for (const [childKey, child] of Object.entries(value)) visit(child, childKey, `${path}.${childKey}`);
  };
  visit(record);
  return [...found.values()].map(asset => ({ ...asset, record_type: recordType, record_id: recordId, retained_at: retainedAt }));
}

export function retainedTeacherConsent(record, recordId, retainedAt) {
  const application = parseStored(record.data) || {};
  const consent = application.termsConsent;
  if (!consent || consent.accepted !== true) return null;
  return {
    teacher_id: recordId,
    accepted: true,
    terms_version_id: consent.versionId || consent.version || null,
    terms_version_number: consent.versionNumber ?? null,
    accepted_at: consent.acceptedAt || null,
    retained_at: retainedAt,
  };
}

export function deletionAudit({ recordType, recordIds, actor, createdAt, actionId }) {
  return {
    id: actionId,
    action: 'permanent_delete',
    record_type: recordType,
    record_id: recordIds.length === 1 ? recordIds[0] : null,
    record_ids: recordIds,
    count: recordIds.length,
    actor: { id: actor?.id ?? null, email: actor?.email || '', name: actor?.name || '' },
    created_at: createdAt,
  };
}

export async function executePermanentDelete({ collection, consentCollection, retainedAssetsCollection, auditCollection, notesCollection, idempotencyCollection, phoneClaimsCollection, records, recordType, actor, createdAt, actionId, session }) {
  const ids = records.map(record => record.id);
  if (!ids.length) return { deletedCount: 0, deletedInternalNotes: 0, deletedIdempotencyRecords: 0, deletedPhoneClaims: 0, retainedAssetReferences: 0, retainedConsentRecords: 0 };
  let retainedFiles = 0, retainedConsents = 0;
  for (const record of records) {
    assertPermanentDeleteEligible(recordType, record);
    if (recordType === 'teacherRegistrations') {
      const consent = retainedTeacherConsent(record, record.id, createdAt);
      if (consent) { await consentCollection.insertOne(consent, { session }); retainedConsents += 1; }
    }
    const assetRefs = retainedAssetReferences(record, recordType, record.id, createdAt);
    if (assetRefs.length) { await retainedAssetsCollection.insertMany(assetRefs, { session }); retainedFiles += assetRefs.length; }
  }
  const expectedStatus = recordType === 'parentEnquiries' ? 'closed' : 'rejected';
  const deleted = await collection.deleteMany({ id: { $in: ids }, status: expectedStatus }, { session });
  if (deleted.deletedCount !== ids.length) throw new Error('The selected records changed during deletion. No partial deletion was accepted.');
  let deletedInternalNotes = 0;
  if (recordType === 'parentEnquiries' && notesCollection) deletedInternalNotes = (await notesCollection.deleteMany({ enquiry_id: { $in: ids } }, { session })).deletedCount;
  let deletedIdempotencyRecords = 0;
  if (recordType === 'parentEnquiries' && idempotencyCollection) deletedIdempotencyRecords = (await idempotencyCollection.deleteMany({ 'response.id': { $in: ids } }, { session })).deletedCount;
  let deletedPhoneClaims = 0;
  if (recordType === 'parentEnquiries' && phoneClaimsCollection) deletedPhoneClaims = (await phoneClaimsCollection.deleteMany({ enquiry_id: { $in: ids } }, { session })).deletedCount;
  await auditCollection.insertOne(deletionAudit({ recordType, recordIds: ids, actor, createdAt, actionId }), { session });
  return { deletedCount: deleted.deletedCount, deletedInternalNotes, deletedIdempotencyRecords, deletedPhoneClaims, retainedAssetReferences: retainedFiles, retainedConsentRecords: retainedConsents };
}

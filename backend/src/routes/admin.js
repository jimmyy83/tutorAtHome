import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { changeAdminPassword } from '../adminPassword.js';
import path from 'node:path';
import fs from 'node:fs';
import { col, getDb, json, now, nextId, toId, escapeRegex, withDbTransaction } from '../db.js';
import { config } from '../config.js';
import { wrap, validate, requireAdmin, signToken, loginLimiter, HttpError } from '../middleware.js';
import * as S from '../schemas.js';
import { bannerRow } from './public.js';
import { cloudinaryStorageUsageBytes, listCloudinaryInventoryAssets, privateTeacherAssetDownloadUrl, requireCloudinary } from '../cloudinary.js';
import { cleanupUnreferencedCloudImage, isCloudImageReferenced, localImageReferenced, storeCloudMedia } from '../imageAssets.js';
import { buildCloudinaryReferenceIndex, classifyCloudinaryAsset } from '../storageInventory.js';
import { authenticateAdmin } from '../adminAuth.js';
import { publishTeacherTerms, saveTeacherTermsDraft } from '../teacherTerms.js';
import { getPageFormSettings, publishPageFormDraft, savePageFormDraft } from '../pageFormSettings.js';
import { cleanupRecordFilter, processInBatches, utcInclusiveDateRange } from '../adminDataManagement.js';
import { assertPermanentDeleteEligible, executePermanentDelete, parsePermanentDeleteId } from '../adminPermanentDelete.js';
import { buildLocationGroups, locationForAdminRecord, matchesAdminLocation } from '../adminLocationGroups.js';
import { fetchAdminPage, needsAdminLocationMatch } from '../adminRecordPagination.js';
import { buildAdminTeacherFilter } from '../adminTeachers.js';
import { buildAdminEnquiryFilter } from '../adminEnquiries.js';
import { hasTeacherProfilePhoto, teacherProfilePhotoVersion } from '../teacherProfilePhoto.js';

export const adminRouter = Router();
adminRouter.post('/auth/login', loginLimiter, validate(S.loginSchema), wrap(async (req, res) => {
  const a = await authenticateAdmin(req.body.email, req.body.password, email => col('admins').findOne({ email }));
  if (!a) throw new HttpError(401, 'Incorrect email or password.');
  res.json({ token: signToken({ ...a, id: a.id }), admin: { id: a.id, email: a.email, name: a.name, role: a.role } });
}));
const auth = requireAdmin(), editor = requireAdmin(['admin', 'editor']), superAdmin = requireAdmin(['admin']);
const adminMaintenanceLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: 'draft-7', legacyHeaders: false });
const recordCollections = { parentEnquiries: 'enquiries', teacherRegistrations: 'teachers' };
const archivedSelectionFilter = (recordType, ids) => ({ id: { $in: ids }, archived_at: { $exists: true }, status: recordType === 'teacherRegistrations' ? 'rejected' : 'closed' });
const actionActor = admin => ({ id: admin.sub ?? null, email: admin.email || '', name: admin.name || '' });
const scopeSnapshot = async (collection, filter, session) => {
  const hash = crypto.createHash('sha256'); let count = 0;
  const cursor = collection.find(filter, { projection: { id: 1 }, ...(session ? { session } : {}) }).sort({ id: 1 });
  for await (const row of cursor) { hash.update(`${row.id}\n`); count += 1; }
  return { count, digest: hash.digest('hex') };
};
adminRouter.post('/data-management/preview', superAdmin, validate(S.dataCleanupPreviewSchema), wrap(async (req, res) => {
  let range, filter;
  try { range = utcInclusiveDateRange(req.body.startDate, req.body.endDate); filter = cleanupRecordFilter(req.body.recordType, req.body.startDate, req.body.endDate); }
  catch (error) { throw new HttpError(422, error.message); }
  const snapshot = await scopeSnapshot(col(recordCollections[req.body.recordType]), filter);
  res.json({ recordType: req.body.recordType, ...snapshot, mode: req.body.mode, maxArchiveCount: 5000, maxPermanentDeleteCount: 200, statusScope: req.body.recordType === 'teacherRegistrations' ? 'Rejected registrations only; pending and approved records are excluded.' : 'Closed enquiries only; open enquiries are excluded.', timeZone: range.timeZone, startInclusive: range.startInclusive, endInclusive: `${req.body.endDate}T23:59:59.999Z`, endExclusive: range.endExclusive, action: req.body.mode === 'permanent_delete' ? 'permanent_delete' : 'soft_archive' });
}));
adminRouter.get('/data-management/summary', superAdmin, wrap(async (_req, res) => {
  const activeFilter = { archived_at: { $exists: false }, blocked: { $ne: true } };
  const [enquiries, teachers, archivedEnquiries, archivedTeachers, blockedEnquiries, blockedTeachers, actions] = await Promise.all([
    col('enquiries').countDocuments(activeFilter), col('teachers').countDocuments(activeFilter),
    col('enquiries').countDocuments({ archived_at: { $exists: true } }), col('teachers').countDocuments({ archived_at: { $exists: true } }),
    col('enquiries').countDocuments({ ...activeFilter, blocked: true }), col('teachers').countDocuments({ ...activeFilter, blocked: true }),
    col('admin_actions').find({}, { projection: { id: 1, action: 1, record_type: 1, record_id: 1, count: 1, actor: 1, created_at: 1 } }).sort({ id: -1 }).limit(20).toArray(),
  ]);
  res.json({ parentEnquiries: { active: enquiries, archived: archivedEnquiries, blocked: blockedEnquiries }, teacherRegistrations: { active: teachers, archived: archivedTeachers, blocked: blockedTeachers }, recentActions: actions.map(row => ({ id: row.id, action: row.action, recordType: row.record_type, recordId: row.record_id, count: row.count, actor: row.actor?.name || row.actor?.email || 'Admin', createdAt: row.created_at })) });
}));
adminRouter.get('/storage/summary', superAdmin, wrap(async (_req, res) => {
  let mongo = null;
  try {
    const stats = await getDb().command({ dbStats: 1, scale: 1 });
    mongo = { dataBytes: stats.dataSize, allocatedBytes: stats.storageSize, indexBytes: stats.indexSize, collectionCount: stats.collections, asOf: now() };
  } catch { /* Provider metrics are optional; never substitute estimates. */ }
  const [enquiriesActive, enquiriesBlocked, enquiriesArchived, teachersActive, teachersBlocked, teachersArchived, mediaAssets] = await Promise.all([
    col('enquiries').countDocuments({ archived_at: { $exists: false }, blocked: { $ne: true } }),
    col('enquiries').countDocuments({ archived_at: { $exists: false }, blocked: true }),
    col('enquiries').countDocuments({ archived_at: { $exists: true } }),
    col('teachers').countDocuments({ archived_at: { $exists: false }, blocked: { $ne: true } }),
    col('teachers').countDocuments({ archived_at: { $exists: false }, blocked: true }),
    col('teachers').countDocuments({ archived_at: { $exists: true } }),
    col('media').countDocuments({}),
  ]);
  let uploadedDocuments = 0, teachersWithoutDocumentReferences = 0;
  for await (const teacher of col('teachers').find({}, { projection: { data: 1 } })) {
    const documents = json(teacher.data, {})?.documents;
    if (documents && typeof documents === 'object') {
      const references = Object.values(documents).filter(value => value?.publicId || value?.public_id || value?.filename).length;
      uploadedDocuments += references;
      if (!references) teachersWithoutDocumentReferences += 1;
    } else teachersWithoutDocumentReferences += 1;
  }
  res.json({
    mongodb: mongo,
    cloudinaryStorageBytes: await cloudinaryStorageUsageBytes(),
    counts: { parentEnquiries: { active: enquiriesActive, blocked: enquiriesBlocked, archived: enquiriesArchived }, teacherRegistrations: { active: teachersActive, blocked: teachersBlocked, archived: teachersArchived }, uploadedDocuments, teachersWithoutDocumentReferences, mediaAssets },
    permanentDeletionEnabled: true,
    permanentDeletionScope: 'Admin-confirmed deletion is limited to closed parent enquiries and rejected teacher registrations. Associated files and teacher consent evidence are retained.',
  });
}));
adminRouter.post('/storage/cloudinary-inventory', superAdmin, adminMaintenanceLimiter, wrap(async (_req, res) => {
  const inventory = await listCloudinaryInventoryAssets({ maxPagesPerType: 3 });
  if (!inventory) return res.json({ available: false, message: 'Cloudinary asset inventory is unavailable.' });
  const [media, teachers, banners, contents, revisions, enquiries, retainedAssets] = await Promise.all([
    col('media').find({}, { projection: { public_id: 1, secure_url: 1 } }).toArray(),
    col('teachers').find({}, { projection: { public_photo_id: 1, public_photo: 1, data: 1 } }).toArray(),
    col('banners').find({}, { projection: { image_public_id: 1, image_url: 1 } }).toArray(),
    col('content').find({}, { projection: { draft: 1, published: 1 } }).toArray(),
    col('revisions').find({}, { projection: { snapshot: 1 } }).toArray(),
    col('enquiries').find({}, { projection: { data: 1 } }).toArray(),
    col('retained_assets').find({}, { projection: { public_id: 1, secure_url_hash: 1 } }).toArray(),
  ]);
  const references = buildCloudinaryReferenceIndex({ media, teachers, banners, contents, revisions, enquiries, retainedAssets });
  const totals = {
    referenced: { assets: 0, bytes: 0 },
    candidateUnreferenced: { assets: 0, bytes: 0 },
    ownershipUnknown: { assets: 0, bytes: 0 },
  };
  const assets = inventory.assets.map(asset => {
    const result = classifyCloudinaryAsset(asset, references);
    const key = result.classification === 'referenced' ? 'referenced' : result.classification === 'candidate_unreferenced' ? 'candidateUnreferenced' : 'ownershipUnknown';
    const bytes = Number.isFinite(asset.bytes) && asset.bytes >= 0 ? asset.bytes : 0;
    totals[key].assets += 1; totals[key].bytes += bytes;
    return {
      fingerprint: crypto.createHash('sha256').update(String(asset.public_id || '')).digest('hex').slice(0, 12),
      resourceType: asset.resource_type || 'unknown', deliveryType: asset.type || 'unknown',
      bytes: Number.isFinite(asset.bytes) && asset.bytes >= 0 ? asset.bytes : null,
      createdAt: asset.created_at || null, ...result,
    };
  });
  res.json({ available: true, truncated: inventory.truncated, scanned: assets.length, totals, assets: assets.slice(0, 200), rowsTruncated: assets.length > 200, deleteAvailable: false, note: 'Provider inventory is account-wide. Assets without a TutorAtHome namespace or database match have unknown ownership; an app namespace without a database match is only a candidate, not a verified orphan.' });
}));
adminRouter.post('/storage/media-orphan-preview', superAdmin, adminMaintenanceLimiter, wrap(async (_req, res) => {
  const candidates = [];
  let scanned = 0;
  const cataloguedCount = await col('media').countDocuments({});
  const cursor = col('media').find({}, { projection: { id: 1, public_id: 1, folder: 1, created_at: 1 } }).sort({ id: 1 }).limit(100);
  for await (const asset of cursor) {
    scanned += 1;
    if (!asset.public_id || await isCloudImageReferenced(asset.public_id)) continue;
    candidates.push({ id: asset.id, folder: asset.folder || '', createdAt: asset.created_at || null });
  }
  res.json({ mode: 'report_only', scanned, cataloguedCount, truncated: scanned < cataloguedCount, candidateCount: candidates.length, candidates, deleteAvailable: false, reason: 'Bulk Cloudinary deletion is disabled because the application cannot guarantee that every legacy or concurrent reference is represented in the media catalog.' });
}));
adminRouter.post('/data-management/cleanup', superAdmin, adminMaintenanceLimiter, validate(S.dataCleanupSchema), wrap(async (req, res) => {
  if (req.body.mode !== 'archive') throw new HttpError(422, 'Use the permanent-delete confirmation flow for permanent deletion.');
  let filter;
  try { filter = cleanupRecordFilter(req.body.recordType, req.body.startDate, req.body.endDate); }
  catch (error) { throw new HttpError(422, error.message); }
  const collection = col(recordCollections[req.body.recordType]), timestamp = now(), actor = actionActor(req.admin);
  const archived = await withDbTransaction(async session => {
    const snapshot = await scopeSnapshot(collection, filter, session);
    if (snapshot.count !== req.body.expectedCount || snapshot.digest !== req.body.expectedDigest) throw new HttpError(409, 'The matching records changed after preview. Preview the cleanup again before confirming.');
    if (snapshot.count > 5000) throw new HttpError(422, 'This cleanup exceeds the safe 5,000-record limit. Narrow the date range and preview again.');
    let modifiedCount = 0;
    const cursor = collection.find(filter, { projection: { id: 1 }, session }).sort({ id: 1 }).batchSize(250);
    const archiveBatch = async ids => {
      if (!ids.length) return;
      const result = await collection.updateMany({ ...filter, id: { $in: ids } }, { $set: { archived_at: timestamp, archived_by: actor, archive_reason: 'Date-range cleanup' } }, { session });
      modifiedCount += result.modifiedCount;
    };
    await processInBatches((async function* () { for await (const row of cursor) yield row.id; })(), 250, archiveBatch);
    await col('admin_actions').insertOne({ id: await nextId('admin_actions'), action: 'date_range_archive', record_type: req.body.recordType, record_id: null, count: modifiedCount, start_date: req.body.startDate, end_date: req.body.endDate, time_zone: 'UTC', actor, created_at: timestamp }, { session });
    return modifiedCount;
  });
  res.json({ ok: true, archivedCount: archived, recordType: req.body.recordType, startDate: req.body.startDate, endDate: req.body.endDate, timeZone: 'UTC' });
}));
adminRouter.post('/data-management/:recordType/:id/permanent-delete', superAdmin, adminMaintenanceLimiter, validate(S.permanentDeleteConfirmationSchema), wrap(async (req, res) => {
  const collectionName = recordCollections[req.params.recordType]; if (!collectionName) throw new HttpError(404, 'Record type not found.');
  let id; try { id = parsePermanentDeleteId(req.params.id); } catch (error) { throw new HttpError(422, error.message); }
  const result = await withDbTransaction(async session => {
    const record = await col(collectionName).findOne({ id }, { session });
    if (!record) throw new HttpError(404, 'Record not found. It may already have been permanently deleted.');
    try { assertPermanentDeleteEligible(req.params.recordType, record); } catch (error) { throw new HttpError(409, error.message); }
    return executePermanentDelete({ collection: col(collectionName), consentCollection: col('teacher_consent_history'), retainedAssetsCollection: col('retained_assets'), auditCollection: col('admin_actions'), notesCollection: col('enquiry_notes'), idempotencyCollection: col('enquiry_idempotency'), phoneClaimsCollection: col('enquiry_phone_claims'), records: [record], recordType: req.params.recordType, actor: actionActor(req.admin), createdAt: now(), actionId: await nextId('admin_actions'), session });
  });
  res.json({ ok: true, ...result, recordType: req.params.recordType, recordId: id, filesDeleted: 0 });
}));
adminRouter.post('/data-management/permanent-delete', superAdmin, adminMaintenanceLimiter, validate(S.bulkPermanentDeleteSchema), wrap(async (req, res) => {
  if (req.body.mode !== 'permanent_delete') throw new HttpError(422, 'Preview permanent deletion before confirming it.');
  let filter; try { filter = cleanupRecordFilter(req.body.recordType, req.body.startDate, req.body.endDate); } catch (error) { throw new HttpError(422, error.message); }
  if (req.body.expectedCount > 200) throw new HttpError(422, 'Permanent date-range deletion is limited to 200 records per confirmation. Narrow the date range and preview again.');
  const result = await withDbTransaction(async session => {
    const snapshot = await scopeSnapshot(col(recordCollections[req.body.recordType]), filter, session);
    if (snapshot.count !== req.body.expectedCount || snapshot.digest !== req.body.expectedDigest) throw new HttpError(409, 'The matching records changed after preview. Preview again before confirming deletion.');
    const records = await col(recordCollections[req.body.recordType]).find(filter, { session }).sort({ id: 1 }).limit(201).toArray();
    if (records.length > 200) throw new HttpError(422, 'This deletion exceeds the 200-record safety limit. Narrow the date range and preview again.');
    return executePermanentDelete({ collection: col(recordCollections[req.body.recordType]), consentCollection: col('teacher_consent_history'), retainedAssetsCollection: col('retained_assets'), auditCollection: col('admin_actions'), notesCollection: col('enquiry_notes'), idempotencyCollection: col('enquiry_idempotency'), phoneClaimsCollection: col('enquiry_phone_claims'), records, recordType: req.body.recordType, actor: actionActor(req.admin), createdAt: now(), actionId: await nextId('admin_actions'), session });
  });
  res.json({ ok: true, ...result, recordType: req.body.recordType, startDate: req.body.startDate, endDate: req.body.endDate, timeZone: 'UTC', filesDeleted: 0 });
}));
adminRouter.post('/data-management/archived-delete-preview', superAdmin, adminMaintenanceLimiter, validate(S.archivedDeletePreviewSchema), wrap(async (req, res) => {
  const collectionName = recordCollections[req.body.recordType], filter = archivedSelectionFilter(req.body.recordType, [...new Set(req.body.ids)]);
  const snapshot = await scopeSnapshot(col(collectionName), filter);
  if (snapshot.count !== new Set(req.body.ids).size) throw new HttpError(409, 'Some selected records are no longer archived or no longer exist. Refresh the list and select them again.');
  res.json({ recordType: req.body.recordType, ...snapshot, selectedCount: snapshot.count, maxDeleteCount: 100 });
}));
adminRouter.post('/data-management/archived-delete', superAdmin, adminMaintenanceLimiter, validate(S.archivedDeleteSchema), wrap(async (req, res) => {
  const collectionName = recordCollections[req.body.recordType], ids = [...new Set(req.body.ids)];
  if (ids.length !== req.body.ids.length) throw new HttpError(422, 'Duplicate record identifiers are not allowed.');
  const result = await withDbTransaction(async session => {
    const filter = archivedSelectionFilter(req.body.recordType, ids), snapshot = await scopeSnapshot(col(collectionName), filter, session);
    if (snapshot.count !== req.body.expectedCount || snapshot.digest !== req.body.expectedDigest || snapshot.count !== ids.length) throw new HttpError(409, 'The selected archived records changed after preview. Preview again before confirming deletion.');
    const records = await col(collectionName).find(filter, { session }).sort({ id: 1 }).toArray();
    return executePermanentDelete({ collection: col(collectionName), consentCollection: col('teacher_consent_history'), retainedAssetsCollection: col('retained_assets'), auditCollection: col('admin_actions'), notesCollection: col('enquiry_notes'), idempotencyCollection: col('enquiry_idempotency'), phoneClaimsCollection: col('enquiry_phone_claims'), records, recordType: req.body.recordType, actor: actionActor(req.admin), createdAt: now(), actionId: await nextId('admin_actions'), session });
  });
  res.json({ ok: true, ...result, recordType: req.body.recordType, filesDeleted: 0 });
}));
adminRouter.post('/data-management/:recordType/:id/block', superAdmin, validate(S.blockRecordSchema), wrap(async (req, res) => {
  const collectionName = recordCollections[req.params.recordType]; if (!collectionName) throw new HttpError(404, 'Record type not found.');
  const collection = col(collectionName), id = toId(req.params.id), record = await collection.findOne({ id, archived_at: { $exists: false } });
  if (!record) throw new HttpError(404, 'Record not found.');
  const timestamp = now(), actor = actionActor(req.admin);
  await withDbTransaction(async session => {
    const updated = await collection.updateOne({ id, archived_at: { $exists: false } }, { $set: { blocked: true, blocked_reason: req.body.reason, blocked_at: timestamp, blocked_by: actor } }, { session });
    if (!updated.matchedCount) throw new HttpError(404, 'Record not found.');
    await col('admin_actions').insertOne({ id: await nextId('admin_actions'), action: 'block', record_type: req.params.recordType, record_id: id, reason: req.body.reason, actor, created_at: timestamp }, { session });
  });
  res.json({ ok: true, blocked: true, blockedAt: timestamp });
}));
adminRouter.post('/data-management/:recordType/:id/unblock', superAdmin, wrap(async (req, res) => {
  const collectionName = recordCollections[req.params.recordType]; if (!collectionName) throw new HttpError(404, 'Record type not found.');
  const collection = col(collectionName), id = toId(req.params.id), record = await collection.findOne({ id, archived_at: { $exists: false } });
  if (!record) throw new HttpError(404, 'Record not found.');
  if (!record.blocked) return res.json({ ok: true, blocked: false, alreadyUnblocked: true });
  const timestamp = now(), actor = actionActor(req.admin);
  await withDbTransaction(async session => {
    const updated = await collection.updateOne({ id, archived_at: { $exists: false } }, { $set: { blocked: false, unblocked_at: timestamp, unblocked_by: actor } }, { session });
    if (!updated.matchedCount) throw new HttpError(404, 'Record not found.');
    await col('admin_actions').insertOne({ id: await nextId('admin_actions'), action: 'unblock', record_type: req.params.recordType, record_id: id, actor, created_at: timestamp }, { session });
  });
  res.json({ ok: true, blocked: false, unblockedAt: timestamp });
}));
adminRouter.post('/data-management/:recordType/:id/archive', superAdmin, wrap(async (req, res) => {
  const collectionName = recordCollections[req.params.recordType]; if (!collectionName) throw new HttpError(404, 'Record type not found.');
  const collection = col(collectionName), id = toId(req.params.id), timestamp = now(), actor = actionActor(req.admin);
  const record = await collection.findOne({ id, archived_at: { $exists: false } });
  if (!record) throw new HttpError(404, 'Active record not found. It may already be archived.');
  if (req.params.recordType === 'teacherRegistrations' && record.status !== 'rejected') throw new HttpError(409, 'Only rejected teacher registrations can be archived. Pending and approved teacher records are protected.');
  if (req.params.recordType === 'parentEnquiries' && record.status !== 'closed') throw new HttpError(409, 'Only closed parent enquiries can be archived. Open enquiries are protected.');
  await withDbTransaction(async session => {
    const result = await collection.updateOne({ id, archived_at: { $exists: false }, status: record.status }, { $set: { archived_at: timestamp, archived_by: actor, archive_reason: 'Manual admin archive' } }, { session });
    if (!result.matchedCount) throw new HttpError(404, 'Active record not found. It may already be archived.');
    await col('admin_actions').insertOne({ id: await nextId('admin_actions'), action: 'archive', record_type: req.params.recordType, record_id: id, actor, created_at: timestamp }, { session });
  });
  res.json({ ok: true, archivedAt: timestamp });
}));
adminRouter.post('/data-management/:recordType/:id/restore', superAdmin, wrap(async (req, res) => {
  const collectionName = recordCollections[req.params.recordType]; if (!collectionName) throw new HttpError(404, 'Record type not found.');
  const collection = col(collectionName), id = toId(req.params.id), timestamp = now(), actor = actionActor(req.admin);
  await withDbTransaction(async session => {
    const updated = await collection.updateOne({ id, archived_at: { $exists: true } }, { $unset: { archived_at: '', archived_by: '', archive_reason: '' }, $set: { restored_at: timestamp, restored_by: actor } }, { session });
    if (!updated.matchedCount) throw new HttpError(404, 'Archived record not found.');
    await col('admin_actions').insertOne({ id: await nextId('admin_actions'), action: 'restore', record_type: req.params.recordType, record_id: id, actor, created_at: timestamp }, { session });
  });
  res.json({ ok: true, restoredAt: timestamp });
}));
adminRouter.put('/auth/password', loginLimiter, superAdmin, validate(S.passwordChangeSchema), wrap(async (req, res) => {
  const account = await col('admins').findOne({ id: req.admin.sub });
  const result = await changeAdminPassword({
    account,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
    updatePassword: (id, oldHash, passwordHash) => col('admins').updateOne({ id, password_hash: oldHash }, { $set: { password_hash: passwordHash } }),
  });
  res.json(result);
}));const termsVersionRow = version => ({ id: version.id, versionNumber: version.version_number, status: version.status,
  createdAt: version.created_at, publishedAt: version.published_at, updatedAt: version.updated_at,
  publishedBy: version.published_by, updatedBy: version.updated_by, changeSummary: version.change_summary || '',
  isCurrent: !!version.isCurrent });
adminRouter.get('/terms', editor, wrap(async (_req, res) => {
  const state = await col('teacher_terms_state').findOne({ id: 1 });
  if (!state?.current_version_id) throw new HttpError(503, 'Published terms are temporarily unavailable.');
  const [current, draft, versions] = await Promise.all([
    col('teacher_terms_versions').findOne({ id: state.current_version_id, status: 'published' }),
    state.draft_version_id ? col('teacher_terms_versions').findOne({ id: state.draft_version_id, status: 'draft' }) : null,
    col('teacher_terms_versions').find({}, { projection: { id: 1, version_number: 1, status: 1, created_at: 1, published_at: 1, updated_at: 1, published_by: 1, updated_by: 1, change_summary: 1 } }).sort({ version_number: -1 }).toArray(),
  ]);
  if (!current) throw new HttpError(503, 'Published terms are temporarily unavailable.');
  res.json({ revision: state.revision || 0, current: { ...termsVersionRow(current), content: current.content },
    draft: draft ? { ...termsVersionRow(draft), content: draft.content, baseVersionId: draft.base_version_id } : null,
    versions: versions.map(version => termsVersionRow({ ...version, isCurrent: version.id === current.id })) });
}));
adminRouter.get('/terms/versions/:id', editor, wrap(async (req, res) => {
  const version = await col('teacher_terms_versions').findOne({ id: req.params.id });
  if (!version) throw new HttpError(404, 'Terms version not found.');
  const state = await col('teacher_terms_state').findOne({ id: 1 }, { projection: { current_version_id: 1 } });
  res.json({ ...termsVersionRow({ ...version, isCurrent: state?.current_version_id === version.id }), content: version.content, baseVersionId: version.base_version_id || null });
}));
adminRouter.put('/terms/draft', editor, validate(S.teacherTermsDraftSchema), wrap(async (req, res) => {
  const draft = await saveTeacherTermsDraft(req.body, req.admin);
  res.json({ ok: true, ...draft });
}));
adminRouter.post('/terms/publish', editor, validate(S.teacherTermsPublishSchema), wrap(async (req, res) => {
  const published = await publishTeacherTerms(req.body, req.admin);
  res.json({ ok: true, ...published });
}));
adminRouter.get('/auth/me', auth, (req, res) => res.json({ admin: { id: req.admin.sub, email: req.admin.email, name: req.admin.name, role: req.admin.role } }));
adminRouter.get('/dashboard', auth, wrap(async (_req, res) => {
  const dashboardEnquiryFilter = buildAdminEnquiryFilter({ archived: 'false' });
  const [totalEnquiries, totalTeacherApplications, pendingTeacherApprovals, featuredTeachers, recentEnquiries, recentChanges] = await Promise.all([
    col('enquiries').countDocuments(dashboardEnquiryFilter), col('teachers').countDocuments(), col('teachers').countDocuments({ status: 'pending' }), col('teachers').countDocuments({ featured: { $in: [true, 1] }, status: 'approved' }),
    col('enquiries').find(dashboardEnquiryFilter, { projection: { id: 1, reference: 1, parent_name: 1, student_class: 1, city: 1, status: 1, created_at: 1 } }).sort({ created_at: -1, id: -1 }).limit(5).toArray(),
    col('revisions').find({}, { projection: { id: 1, summary: 1, editor_name: 1, created_at: 1 } }).sort({ id: -1 }).limit(5).toArray(),
  ]);
  res.json({ totalEnquiries, totalTeacherApplications, pendingTeacherApprovals, featuredTeachers,
    recentEnquiries: recentEnquiries.map(e => ({ id: e.id, reference: e.reference, parentName: e.parent_name, studentClass: e.student_class, city: e.city, status: e.status, createdAt: e.created_at })),
    recentChanges: recentChanges.map(r => ({ id: r.id, summary: r.summary, editorName: r.editor_name, createdAt: r.created_at })) });
}));
adminRouter.get('/content', auth, wrap(async (_req, res) => {
  const c = await col('content').findOne({ id: 1 });
  res.json({ draft: json(c?.draft), published: json(c?.published), draftUpdatedAt: c?.draft_updated_at, publishedAt: c?.published_at });
}));
adminRouter.put('/content/draft', editor, validate(S.contentSchema), wrap(async (req, res) => {
  await col('content').updateOne({ id: 1 }, { $set: { draft: JSON.stringify(req.body.content), draft_updated_at: now() } }, { upsert: true }); res.json({ ok: true });
}));
adminRouter.post('/content/publish', editor, wrap(async (req, res) => {
  const c = await col('content').findOne({ id: 1 }); if (!c) throw new HttpError(404, 'Content not initialized.');
  const summary = String(req.body?.summary || 'Published changes').slice(0, 200), t = now(), id = await nextId('revisions');
  await col('content').updateOne({ id: 1 }, { $set: { published: c.draft, published_at: t } });
  await col('revisions').insertOne({ id, snapshot: c.draft, summary, editor_id: req.admin.sub, editor_name: req.admin.name || req.admin.email, created_at: t });
  res.json({ ok: true, publishedAt: t });
}));
adminRouter.get('/content/revisions', auth, wrap(async (_req, res) => res.json({ items: (await col('revisions').find({}).sort({ id: -1 }).limit(100).toArray()).map(r => ({ id: r.id, summary: r.summary, editor_name: r.editor_name, publishedAt: r.created_at })) })));
adminRouter.get('/content/revisions/:id', auth, wrap(async (req, res) => {
  const r = await col('revisions').findOne({ id: toId(req.params.id) }); if (!r) throw new HttpError(404, 'Revision not found.');
  res.json({ id: r.id, summary: r.summary, snapshot: json(r.snapshot) });
}));
adminRouter.post('/content/revisions/:id/restore', editor, wrap(async (req, res) => {
  const r = await col('revisions').findOne({ id: toId(req.params.id) }); if (!r) throw new HttpError(404, 'Revision not found.');
  await col('content').updateOne({ id: 1 }, { $set: { draft: r.snapshot, draft_updated_at: now() } }); res.json({ ok: true, message: 'Revision restored to draft. Publish to make it live.' });
}));
adminRouter.get('/page-form-settings', superAdmin, wrap(async (_req,res) => res.json(await getPageFormSettings())));
adminRouter.put('/page-form-settings/draft', superAdmin, validate(S.pageFormDraftSchema), wrap(async (req,res) => res.json(await savePageFormDraft(req.body))));
adminRouter.post('/page-form-settings/publish', superAdmin, validate(S.pageFormPublishSchema), wrap(async (req,res) => res.json(await publishPageFormDraft(req.body, req.admin))));
adminRouter.get('/settings', auth, wrap(async (_req, res) => res.json(json((await col('settings').findOne({ id: 1 }))?.data, {}))));
adminRouter.put('/leads/whatsapp', superAdmin, validate(S.whatsappSettingsSchema), wrap(async (req, res) => {
  const timestamp = now();
  const existing = json((await col('settings').findOne({ id: 1 }))?.data, {});
  const settings = { ...existing, whatsapp: req.body.whatsapp };
  await col('settings').updateOne({ id: 1 }, { $set: { data: JSON.stringify(settings), updated_at: timestamp } }, { upsert: true });
  res.json({ ok: true, whatsapp: settings.whatsapp, updatedAt: timestamp });
}));
adminRouter.put('/settings', superAdmin, validate(S.settingsSchema), wrap(async (req, res) => {
  const timestamp = now(), existing = json((await col('settings').findOne({ id: 1 }))?.data, {}), updated = { ...req.body };
  if (Array.isArray(updated.socialLinks)) {
    const oldById = new Map((Array.isArray(existing.socialLinks) ? existing.socialLinks : []).map(link => [link.id, link]));
    updated.socialLinks = updated.socialLinks.map(link => ({ ...link, createdAt: oldById.get(link.id)?.createdAt || timestamp, updatedAt: timestamp }));
  }
  await col('settings').updateOne({ id: 1 }, { $set: { data: JSON.stringify(updated), updated_at: timestamp } }, { upsert: true }); res.json({ ok: true, updatedAt: timestamp });
}));
const adminBannerRow = b => ({ ...bannerRow(b), imagePublicId: b.image_public_id || '' });
adminRouter.get('/banners', auth, wrap(async (_req, res) => res.json({ items: (await col('banners').find({}).sort({ archived: 1, priority: -1, id: -1 }).toArray()).map(adminBannerRow) })));
const bannerDoc = (b) => ({ title: b.title, message: b.message, image_url: b.imageUrl, image_public_id: b.imagePublicId || null, cta_label: b.ctaLabel, cta_url: b.ctaUrl, starts_at: b.startsAt ?? null, ends_at: b.endsAt ?? null,
  enabled: b.enabled ? 1 : 0, priority: b.priority, placement: b.placement, theme: b.theme, frequency: b.frequency, frequency_days: b.frequencyDays ?? null });
adminRouter.post('/banners', editor, validate(S.bannerSchema), wrap(async (req, res) => {
  const doc = { id: await nextId('banners'), ...bannerDoc(req.body), archived: 0, version: 1, created_at: now(), updated_at: now() };
  await col('banners').insertOne(doc); res.status(201).json(adminBannerRow(doc));
}));
adminRouter.put('/banners/:id', editor, validate(S.bannerSchema), wrap(async (req, res) => {
  const filter = { id: toId(req.params.id) }, old = await col('banners').findOne(filter); if (!old) throw new HttpError(404, 'Banner not found.');
  await col('banners').updateOne(filter, { $set: { ...bannerDoc(req.body), version: Number(old.version || 0) + 1, updated_at: now() } });
  if (old.image_public_id && old.image_public_id !== req.body.imagePublicId) await cleanupUnreferencedCloudImage(old.image_public_id);
  res.json(adminBannerRow(await col('banners').findOne(filter)));
}));
adminRouter.patch('/banners/:id/archive', editor, wrap(async (req, res) => {
  const r = await col('banners').updateOne({ id: toId(req.params.id) }, { $set: { archived: req.body?.archived === false ? 0 : 1, enabled: 0, updated_at: now() } });
  if (!r.matchedCount) throw new HttpError(404, 'Banner not found.'); res.json({ ok: true });
}));
adminRouter.delete('/banners/:id', editor, wrap(async (req, res) => {
  const id = toId(req.params.id), banner = await col('banners').findOne({ id }); if (!banner) throw new HttpError(404, 'Banner not found.');
  await col('banners').deleteOne({ id }); if (banner.image_public_id) await cleanupUnreferencedCloudImage(banner.image_public_id); res.json({ ok: true });
}));

export const uploadDir = path.resolve('uploads'); fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3 } });
const mediaRow = m => ({ id: m.id, url: m.secure_url || `${config.publicApiUrl}/uploads/${m.filename}`, publicId: m.public_id || null, name: m.original_name, mime: m.mime, size: m.size, width: m.width, height: m.height, createdAt: m.created_at });
adminRouter.get('/media', auth, wrap(async (_req, res) => res.json({ items: (await col('media').find({}).sort({ id: -1 }).toArray()).map(mediaRow) })));
adminRouter.post('/media', editor, requireCloudinary, upload.single('file'), wrap(async (req, res) => {
  const category = req.query.category || 'banners'; if (!['banners', 'admins'].includes(category)) throw new HttpError(400, 'Choose a supported image category.');
  const doc = await storeCloudMedia(req.file, category); res.status(201).json(mediaRow(doc));
}));
adminRouter.delete('/media', editor, wrap(async (req, res) => {
  const publicId = String(req.query.publicId || '').trim(); if (!publicId || publicId.length > 240) throw new HttpError(400, 'A valid image ID is required.');
  const doc = await col('media').findOne({ public_id: publicId }); if (!doc) throw new HttpError(404, 'Image asset not found.');
  const cleanup = await cleanupUnreferencedCloudImage(publicId);
  if (cleanup.referenced) throw new HttpError(409, 'This image is still used on the website. Remove it there before deleting the asset.');
  if (!cleanup.deleted) throw new HttpError(502, 'The image could not be deleted from Cloudinary. Please try again.');
  res.json({ ok: true });
}));
adminRouter.delete('/media/:id', editor, wrap(async (req, res) => {
  const m = await col('media').findOne({ id: toId(req.params.id) }); if (!m) throw new HttpError(404, 'Media not found.');
  if (m.public_id) {
    const cleanup = await cleanupUnreferencedCloudImage(m.public_id);
    if (cleanup.referenced) throw new HttpError(409, 'This image is still used on the website. Remove it there before deleting the asset.');
    if (!cleanup.deleted) throw new HttpError(502, 'The image could not be deleted from Cloudinary. Please try again.');
    return res.json({ ok: true });
  }
  const url = `${config.publicApiUrl}/uploads/${m.filename}`;
  if (await localImageReferenced(url)) throw new HttpError(409, 'This image is still used on the website. Remove it there before deleting the asset.');
  fs.rmSync(path.join(uploadDir, m.filename), { force: true }); await col('media').deleteOne({ id: m.id }); res.json({ ok: true });
}));

const locationSettings = async () => json((await col('settings').findOne({ id: 1 }))?.data, {})?.locationCatalog || { states: [] };
const teacherListRow = (t, catalog) => ({ id: t.id, reference: t.reference, status: t.status, blocked: !!t.blocked, archived: !!t.archived_at, fullName: t.full_name, email: t.email, phone: t.phone, featured: !!t.featured,
  featuredOrder: t.featured_order, publicName: t.public_name, publicLocation: t.public_location, publicPhoto: t.public_photo, hasProfilePhoto: hasTeacherProfilePhoto(t.data), profilePhotoVersion: teacherProfilePhotoVersion(t.data), publicPhotoId: t.public_photo_id || '', locationStateId: t.location_state_id || '', locationDistrictId: t.location_district_id || '', locationLocalityId: t.location_locality_id || '', registeredLocation: locationForAdminRecord(t, catalog, 'teachers'), publicSubjects: json(t.public_subjects, []), publicLevels: json(t.public_levels, []), createdAt: t.created_at, featuredEligible: t.status === 'approved' });
const safeRegex = v => new RegExp(escapeRegex(v), 'i');
adminRouter.get('/teachers/location-groups', auth, wrap(async (req, res) => {
  const filter = buildAdminTeacherFilter(req.query);
  const [catalog, docs] = await Promise.all([locationSettings(), col('teachers').find(filter, { projection: { data: 1, location_state_id: 1, location_district_id: 1, location_locality_id: 1 } }).toArray()]);
  res.json({ groups: buildLocationGroups(docs, catalog, 'teachers') });
}));
adminRouter.get('/teachers', auth, wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(100, Number(req.query.limit) || 20), filter = buildAdminTeacherFilter(req.query);
  const catalog = await locationSettings();
  const projection = { id: 1, reference: 1, status: 1, blocked: 1, archived_at: 1, full_name: 1, email: 1, phone: 1, featured: 1, featured_order: 1, public_name: 1, public_location: 1, public_photo: 1, public_photo_id: 1, location_state_id: 1, location_district_id: 1, location_locality_id: 1, public_subjects: 1, public_levels: 1, created_at: 1, data: 1 };
  const sort = { created_at: -1, id: -1 };
  if (!needsAdminLocationMatch(req.query)) {
    const result = await fetchAdminPage(col('teachers'), { filter, projection, sort, page, limit });
    return res.json({ ...result, items: result.items.map(doc => teacherListRow(doc, catalog)) });
  }
  const cursor = col('teachers').find(filter, { projection }).sort(sort);
  let total = 0; const pageItems = [];
  for await (const doc of cursor) if (matchesAdminLocation(locationForAdminRecord(doc, catalog, 'teachers'), req.query)) { if (total >= (page - 1) * limit && total < page * limit) pageItems.push(doc); total += 1; }
  res.json({ items: pageItems.map(doc => teacherListRow(doc, catalog)), page, limit, total, totalPages: Math.ceil(total / limit) });
}));
adminRouter.get('/teachers/:id', editor, wrap(async (req, res) => {
  const t = await col('teachers').findOne({ id: toId(req.params.id) }); if (!t) throw new HttpError(404, 'Teacher not found.');
  res.json({ ...teacherListRow(t), application: json(t.data), reviewedBy: t.reviewed_by, reviewedAt: t.reviewed_at });
}));
adminRouter.get('/teachers/:id/documents/:kind', editor, requireCloudinary, wrap(async (req, res) => {
  const field = ({ 'profile-photo': 'profilePhoto', 'qualification-proof': 'qualificationProof', 'aadhaar-document': 'aadhaarDocument' })[req.params.kind];
  if (!field) throw new HttpError(404, 'Teacher document not found.');
  const teacher = await col('teachers').findOne({ id: toId(req.params.id) }); if (!teacher) throw new HttpError(404, 'Teacher not found.');
  const document = json(teacher.data, {})?.documents?.[field];
  if (!document?.publicId || !document?.format || !['image', 'raw'].includes(document.resourceType)) throw new HttpError(404, 'Teacher document not found.');
  const downloadUrl = privateTeacherAssetDownloadUrl(document.publicId, document.format, document.resourceType, Math.floor(Date.now() / 1000) + 60);
  if (!downloadUrl) throw new HttpError(503, 'Private document storage is not available.');
  let upstream, bytes;
  try {
    upstream = await fetch(downloadUrl, { signal: AbortSignal.timeout(10000) });
    if (!upstream.ok) throw new Error('download failed');
    const declaredSize = Number(upstream.headers.get('content-length') || 0);
    if (declaredSize > config.teacherUploadMaxBytes) throw new Error('invalid size');
    bytes = Buffer.from(await upstream.arrayBuffer());
  } catch { throw new HttpError(502, 'The private document could not be retrieved. Please try again.'); }
  if (!bytes.length || bytes.length > config.teacherUploadMaxBytes) throw new HttpError(502, 'The private document could not be retrieved. Please try again.');
  const name = field === 'aadhaarDocument' ? `identity-verification.${document.format}` : String(document.originalName || 'teacher-document').replace(/[\\"\r\n]/g, '_');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('Content-Disposition', `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.send(bytes);
}));
adminRouter.post('/teachers/:id/photo', editor, requireCloudinary, upload.single('file'), wrap(async (req, res) => {
  const filter = { id: toId(req.params.id) }, teacher = await col('teachers').findOne(filter); if (!teacher) throw new HttpError(404, 'Teacher not found.');
  const asset = await storeCloudMedia(req.file, 'teachers');
  try {
    const result = await col('teachers').updateOne(filter, { $set: { public_photo: asset.secure_url, public_photo_id: asset.public_id, photo_updated_at: now() } });
    if (!result.matchedCount) throw new HttpError(404, 'Teacher not found.');
  } catch (error) {
    await cleanupUnreferencedCloudImage(asset.public_id).catch(() => {});
    throw error instanceof HttpError ? error : new HttpError(500, 'The teacher image uploaded but could not be saved.');
  }
  if (teacher.public_photo_id && teacher.public_photo_id !== asset.public_id) await cleanupUnreferencedCloudImage(teacher.public_photo_id);
  res.json({ ok: true, publicPhoto: asset.secure_url, publicPhotoId: asset.public_id });
}));
adminRouter.delete('/teachers/:id/photo', editor, wrap(async (req, res) => {
  const filter = { id: toId(req.params.id) }, teacher = await col('teachers').findOne(filter); if (!teacher) throw new HttpError(404, 'Teacher not found.');
  await col('teachers').updateOne(filter, { $set: { public_photo: null, public_photo_id: null, photo_updated_at: now() } });
  const cleanup = teacher.public_photo_id ? await cleanupUnreferencedCloudImage(teacher.public_photo_id) : { deleted: true };
  res.json({ ok: true, cleanupPending: !!teacher.public_photo_id && !cleanup.deleted && !cleanup.referenced });
}));
adminRouter.patch('/teachers/:id/status', superAdmin, validate(S.teacherStatusSchema), wrap(async (req, res) => {
  const { status } = req.body, r = await col('teachers').updateOne({ id: toId(req.params.id) }, { $set: { status, reviewed_by: req.admin.name || req.admin.email, reviewed_at: now(), ...(status !== 'approved' ? { featured: 0 } : {}) } });
  if (!r.matchedCount) throw new HttpError(404, 'Teacher not found.'); res.json({ ok: true });
}));
async function publicPhotoFromApplication(teacher) {
  const profile = json(teacher.data, {})?.documents?.profilePhoto;
  if (!profile?.publicId || !profile?.format || !['image/jpeg', 'image/png'].includes(profile.mimeType)) throw new HttpError(409, 'This teacher has no valid professional photo available to feature.');
  const downloadUrl = privateTeacherAssetDownloadUrl(profile.publicId, profile.format, 'image', Math.floor(Date.now() / 1000) + 60);
  if (!downloadUrl) throw new HttpError(503, 'The teacher photo could not be prepared for public display.');
  let response, buffer;
  try {
    response = await fetch(downloadUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 5 * 1024 * 1024) throw new Error('download failed');
    buffer = Buffer.from(await response.arrayBuffer());
  } catch { throw new HttpError(502, 'The teacher photo could not be retrieved for public display. Please try again.'); }
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new HttpError(502, 'The teacher photo could not be retrieved for public display. Please try again.');
  return storeCloudMedia({ buffer, size: buffer.length, mimetype: profile.mimeType, originalname: profile.originalName || 'teacher-profile' }, 'teachers');
}
adminRouter.patch('/teachers/:id/featured', editor, validate(S.teacherFeaturedSchema), wrap(async (req, res) => {
  const filter = { id: toId(req.params.id) }, t = await col('teachers').findOne(filter); if (!t) throw new HttpError(404, 'Teacher not found.');
  const b = req.body; if (b.featured && t.status !== 'approved') throw new HttpError(409, 'Only approved teachers can be featured.');
  let serviceLocation = null;
  if (b.locationStateId !== undefined || b.locationDistrictId !== undefined || b.locationLocalityId !== undefined) {
    if (![b.locationStateId, b.locationDistrictId, b.locationLocalityId].some(Boolean)) serviceLocation = null;
    else {
    const row = await col('settings').findOne({ id: 1 }), catalog = json(row?.data, {})?.locationCatalog;
    const state = catalog?.states?.find(item => item?.active === true && String(item.id) === String(b.locationStateId));
    const district = state?.districts?.find(item => item?.active === true && String(item.id) === String(b.locationDistrictId));
    serviceLocation = district?.localities?.find(item => item?.active === true && item?.publiclyServiceable === true && String(item.id) === String(b.locationLocalityId));
    if (!serviceLocation) throw new HttpError(422, 'Choose an active, publicly serviceable teacher location.');
    }
  }
  const copiedProfilePhoto = b.featured === true && b.publicPhoto === undefined && b.publicPhotoId === undefined && !t.public_photo_id && !t.public_photo ? await publicPhotoFromApplication(t) : null;
  const nextPhoto = b.publicPhoto !== undefined ? b.publicPhoto : copiedProfilePhoto?.secure_url ?? t.public_photo;
  const nextPhotoId = b.publicPhotoId !== undefined ? b.publicPhotoId : b.publicPhoto !== undefined ? null : copiedProfilePhoto?.public_id ?? t.public_photo_id;
  let updated;
  try { updated = await col('teachers').updateOne(filter, { $set: { featured: b.featured === undefined ? t.featured : b.featured ? 1 : 0, featured_order: b.featuredOrder ?? t.featured_order,
    public_name: b.publicName ?? t.public_name, public_location: b.locationStateId !== undefined && !serviceLocation ? null : serviceLocation?.name ?? b.publicLocation ?? t.public_location, public_photo: nextPhoto, public_photo_id: nextPhotoId,
    ...(b.locationStateId !== undefined ? (serviceLocation ? { location_state_id: String(b.locationStateId), location_district_id: String(b.locationDistrictId), location_locality_id: String(b.locationLocalityId) } : { location_state_id: null, location_district_id: null, location_locality_id: null }) : {}),
    public_subjects: b.publicSubjects ? JSON.stringify(b.publicSubjects) : t.public_subjects, public_levels: b.publicLevels ? JSON.stringify(b.publicLevels) : t.public_levels } }); }
  catch (error) { if (copiedProfilePhoto?.public_id) await cleanupUnreferencedCloudImage(copiedProfilePhoto.public_id); throw error; }
  if (!updated.matchedCount) { if (copiedProfilePhoto?.public_id) await cleanupUnreferencedCloudImage(copiedProfilePhoto.public_id); throw new HttpError(404, 'Teacher not found.'); }
  if (t.public_photo_id && t.public_photo_id !== nextPhotoId) await cleanupUnreferencedCloudImage(t.public_photo_id);
  res.json({ ok: true });
}));
const enquiryRow = (e, catalog) => ({ id: e.id, reference: e.reference, status: e.status, blocked: !!e.blocked, archived: !!e.archived_at, parentName: e.parent_name, phone: e.phone, studentClass: e.student_class, city: e.city, serviceLocation: locationForAdminRecord(e, catalog, 'enquiries'), createdAt: e.created_at, updatedAt: e.updated_at });
adminRouter.get('/enquiries/location-groups', auth, wrap(async (req, res) => {
  const filter = buildAdminEnquiryFilter(req.query);
  const [catalog, docs] = await Promise.all([locationSettings(), col('enquiries').find(filter, { projection: { data: 1, city: 1 } }).toArray()]);
  res.json({ groups: buildLocationGroups(docs, catalog, 'enquiries') });
}));
adminRouter.get('/enquiries', auth, wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(100, Number(req.query.limit) || 20), filter = buildAdminEnquiryFilter(req.query);
  const catalog = await locationSettings();
  const projection = { id: 1, reference: 1, status: 1, blocked: 1, archived_at: 1, parent_name: 1, phone: 1, student_class: 1, city: 1, created_at: 1, updated_at: 1, data: 1 };
  const sort = { created_at: -1, id: -1 };
  if (!needsAdminLocationMatch(req.query)) {
    const result = await fetchAdminPage(col('enquiries'), { filter, projection, sort, page, limit });
    return res.json({ ...result, items: result.items.map(doc => enquiryRow(doc, catalog)) });
  }
  const cursor = col('enquiries').find(filter, { projection }).sort(sort);
  let total = 0; const pageItems = [];
  for await (const doc of cursor) if (matchesAdminLocation(locationForAdminRecord(doc, catalog, 'enquiries'), req.query)) { if (total >= (page - 1) * limit && total < page * limit) pageItems.push(doc); total += 1; }
  res.json({ items: pageItems.map(doc => enquiryRow(doc, catalog)), page, limit, total, totalPages: Math.ceil(total / limit) });
}));
adminRouter.get('/enquiries/:id', auth, wrap(async (req, res) => {
  const e = await col('enquiries').findOne({ id: toId(req.params.id) }); if (!e) throw new HttpError(404, 'Enquiry not found.');
  const notes = (await col('enquiry_notes').find({ enquiry_id: e.id }).sort({ id: -1 }).toArray()).map(n => ({ id: n.id, note: n.note, author: n.author, kind: n.kind, createdAt: n.created_at }));
  const catalog = await locationSettings();
  res.json({ ...enquiryRow(e, catalog), details: json(e.data), notes });
}));
adminRouter.patch('/enquiries/:id', editor, validate(S.enquiryUpdateSchema), wrap(async (req, res) => {
  const filter = { id: toId(req.params.id) }, e = await col('enquiries').findOne(filter); if (!e) throw new HttpError(404, 'Enquiry not found.');
  await col('enquiries').updateOne(filter, { $set: { status: req.body.status, updated_at: now() } });
  await col('enquiry_notes').insertOne({ id: await nextId('enquiry_notes'), enquiry_id: e.id, note: `Status: ${e.status} → ${req.body.status}`, author: req.admin.name || req.admin.email, kind: 'status', created_at: now() }); res.json({ ok: true });
}));
adminRouter.post('/enquiries/:id/notes', editor, validate(S.noteSchema), wrap(async (req, res) => {
  const id = toId(req.params.id); if (!await col('enquiries').findOne({ id }, { projection: { id: 1 } })) throw new HttpError(404, 'Enquiry not found.');
  await col('enquiry_notes').insertOne({ id: await nextId('enquiry_notes'), enquiry_id: id, note: req.body.note, author: req.admin.name || req.admin.email, kind: 'note', created_at: now() }); res.status(201).json({ ok: true });
}));


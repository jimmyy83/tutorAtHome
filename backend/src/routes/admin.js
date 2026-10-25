import { Router } from 'express';
import multer from 'multer';
import { changeAdminPassword } from '../adminPassword.js';
import path from 'node:path';
import fs from 'node:fs';
import { col, json, now, nextId, toId, escapeRegex } from '../db.js';
import { config } from '../config.js';
import { wrap, validate, requireAdmin, signToken, loginLimiter, HttpError } from '../middleware.js';
import * as S from '../schemas.js';
import { bannerRow } from './public.js';
import { privateTeacherAssetDownloadUrl, requireCloudinary } from '../cloudinary.js';
import { cleanupUnreferencedCloudImage, localImageReferenced, storeCloudMedia } from '../imageAssets.js';
import { authenticateAdmin } from '../adminAuth.js';
import { publishTeacherTerms, saveTeacherTermsDraft } from '../teacherTerms.js';
import { getPageFormSettings, publishPageFormDraft, savePageFormDraft } from '../pageFormSettings.js';

export const adminRouter = Router();
adminRouter.post('/auth/login', loginLimiter, validate(S.loginSchema), wrap(async (req, res) => {
  const a = await authenticateAdmin(req.body.email, req.body.password, email => col('admins').findOne({ email }));
  if (!a) throw new HttpError(401, 'Incorrect email or password.');
  res.json({ token: signToken({ ...a, id: a.id }), admin: { id: a.id, email: a.email, name: a.name, role: a.role } });
}));
const auth = requireAdmin(), editor = requireAdmin(['admin', 'editor']), superAdmin = requireAdmin(['admin']);
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
  const [totalEnquiries, totalTeacherApplications, pendingTeacherApprovals, featuredTeachers, recentEnquiries, recentChanges] = await Promise.all([
    col('enquiries').countDocuments(), col('teachers').countDocuments(), col('teachers').countDocuments({ status: 'pending' }), col('teachers').countDocuments({ featured: { $in: [true, 1] }, status: 'approved' }),
    col('enquiries').find({}, { projection: { id: 1, reference: 1, parent_name: 1, student_class: 1, city: 1, status: 1, created_at: 1 } }).sort({ id: -1 }).limit(5).toArray(),
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

const teacherListRow = t => ({ id: t.id, reference: t.reference, status: t.status, fullName: t.full_name, email: t.email, phone: t.phone, featured: !!t.featured,
  featuredOrder: t.featured_order, publicName: t.public_name, publicLocation: t.public_location, publicPhoto: t.public_photo, publicPhotoId: t.public_photo_id || '', locationStateId: t.location_state_id || '', locationDistrictId: t.location_district_id || '', locationLocalityId: t.location_locality_id || '', publicSubjects: json(t.public_subjects, []), publicLevels: json(t.public_levels, []), createdAt: t.created_at, featuredEligible: t.status === 'approved' });
const safeRegex = v => new RegExp(escapeRegex(v), 'i');
adminRouter.get('/teachers', auth, wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(100, Number(req.query.limit) || 20), filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.featured) filter.featured = req.query.featured === 'true' ? { $in: [true, 1] } : { $in: [false, 0] };
  if (req.query.search) { const re = safeRegex(req.query.search); filter.$or = [{ full_name: re }, { email: re }, { phone: re }, { reference: re }]; }
  const [total, docs] = await Promise.all([col('teachers').countDocuments(filter), col('teachers').find(filter).sort({ id: -1 }).skip((page - 1) * limit).limit(limit).toArray()]);
  res.json({ items: docs.map(teacherListRow), page, limit, total, totalPages: Math.ceil(total / limit) });
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
const enquiryRow = e => ({ id: e.id, reference: e.reference, status: e.status, parentName: e.parent_name, phone: e.phone, studentClass: e.student_class, city: e.city, createdAt: e.created_at, updatedAt: e.updated_at });
adminRouter.get('/enquiries', auth, wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(100, Number(req.query.limit) || 20), filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) { const re = safeRegex(req.query.search); filter.$or = [{ parent_name: re }, { phone: re }, { city: re }, { reference: re }]; }
  const [total, docs] = await Promise.all([col('enquiries').countDocuments(filter), col('enquiries').find(filter).sort({ id: -1 }).skip((page - 1) * limit).limit(limit).toArray()]);
  res.json({ items: docs.map(enquiryRow), page, limit, total, totalPages: Math.ceil(total / limit) });
}));
adminRouter.get('/enquiries/:id', auth, wrap(async (req, res) => {
  const e = await col('enquiries').findOne({ id: toId(req.params.id) }); if (!e) throw new HttpError(404, 'Enquiry not found.');
  const notes = (await col('enquiry_notes').find({ enquiry_id: e.id }).sort({ id: -1 }).toArray()).map(n => ({ id: n.id, note: n.note, author: n.author, kind: n.kind, createdAt: n.created_at }));
  res.json({ ...enquiryRow(e), details: json(e.data), notes });
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


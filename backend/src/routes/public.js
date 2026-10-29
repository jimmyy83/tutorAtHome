import { Router } from 'express';
import { col, json, now, nextId, escapeRegex, withDbTransaction } from '../db.js';
import { wrap, validate, formLimiter, rejectHoneypot, HttpError } from '../middleware.js';
import { parentEnquirySchema, teacherRegistrationSchema } from '../schemas.js';
import crypto from 'node:crypto';
import { assertTeacherAssetMetadata, deletePrivateTeacherAsset, optimizedCloudImage, requireCloudinary, uploadPrivateTeacherAsset } from '../cloudinary.js';
import { parseTeacherApplication, teacherRegistrationUpload, validateTeacherRegistrationFiles } from '../teacherRegistrationFiles.js';
import { currentTeacherTerms, validateCurrentTeacherTerms } from '../teacherTerms.js';
import { publicQualification } from '../teacherProfile.js';
import { configuredSubmission, getPublishedPageFormSettings } from '../pageFormSettings.js';
import { validateEducationSelectionData } from '../educationSelection.js';
import { findParentEnquiryReplay, persistParentEnquiry } from '../parentEnquiryPersistence.js';
import { normalizeTeacherEmail, normalizeTeacherPhone } from '../adminDataManagement.js';
import { commitTeacherRecordOrConfirm, logTeacherRegistrationFailure, markParentEnquiryStage, markTeacherRegistrationStage, setParentEnquiryStage, setTeacherRegistrationStage } from '../teacherRegistrationDiagnostics.js';
import { config } from '../config.js';

export const publicRouter = Router();
publicRouter.get('/page-form-settings', wrap(async (_req,res) => res.json(await getPublishedPageFormSettings())));publicRouter.get('/terms', wrap(async (_req, res) => {
  const terms = await currentTeacherTerms();
  if (!terms) throw new HttpError(503, 'Published terms are temporarily unavailable.');
  res.json(terms);
}));
const ref = (p) => `${p}-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const allowedSocialIcons = new Set(['instagram', 'facebook', 'youtube', 'linkedin', 'x', 'whatsapp', 'globe', 'link']);
const publicSocialLink = (link) => {
  if (!link || link.active !== true || typeof link.id !== 'string' || typeof link.platform !== 'string' || typeof link.label !== 'string') return false;
  if (!allowedSocialIcons.has(link.icon) || !['footer', 'contact', 'both'].includes(link.placement) || !Number.isInteger(link.order)) return false;
  try { return new URL(link.url).protocol === 'https:'; } catch { return false; }
};
export const bannerRow = (b) => ({
  id: b.id, title: b.title, message: b.message, imageUrl: b.image_public_id ? (optimizedCloudImage(b.image_public_id, { width: 1600 }) || b.image_url) : b.image_url, ctaLabel: b.cta_label, ctaUrl: b.cta_url,
  startsAt: b.starts_at, endsAt: b.ends_at, enabled: !!b.enabled, archived: !!b.archived, priority: b.priority,
  placement: b.placement, theme: b.theme, frequency: b.frequency, frequencyDays: b.frequency_days,
  dismissKey: `banner-${b.id}-v${b.version}`, updatedAt: b.updated_at,
});
async function activeBanners() {
  const t = now();
  return (await col('banners').find({ enabled: { $in: [true, 1] }, archived: { $in: [false, 0, null] }, $and: [
    { $or: [{ starts_at: null }, { starts_at: { $exists: false } }, { starts_at: { $lte: t } }] },
    { $or: [{ ends_at: null }, { ends_at: { $exists: false } }, { ends_at: { $gte: t } }] },
  ] }).sort({ priority: -1, id: -1 }).toArray()).map(bannerRow);
}
publicRouter.get('/site', wrap(async (_req, res) => {
  const [s, c, banners] = await Promise.all([col('settings').findOne({ id: 1 }), col('content').findOne({ id: 1 }), activeBanners()]);
  const settings = json(s?.data, {});
  const { locationCatalog: _privateLocationCatalog, ...publicSettings } = settings;
  const socialLinks = (Array.isArray(settings.socialLinks) ? settings.socialLinks : []).filter(publicSocialLink).sort((a, b) => a.order - b.order)
    .map(({ id, platform, label, url, icon, placement, order }) => ({ id, platform, label, url, icon, placement, order }));
  const content = json(c?.published, null);
  if (content?.sections) content.sections = content.sections.map(section => {
    if (section?.id !== 'owner') return section;
    const { imagePublicId, ...publicSection } = section;
    if (imagePublicId) publicSection.imageUrl = optimizedCloudImage(imagePublicId, { width: 480, height: 480, crop: 'fill' }) || publicSection.imageUrl;
    return publicSection;
  });
  res.json({ settings: { ...publicSettings, socialLinks }, content, publishedAt: c?.published_at || null, banners });
}));
publicRouter.get('/banners', wrap(async (_req, res) => res.json({ items: await activeBanners() })));
const locationRows = async () => {
  const row = await col('settings').findOne({ id: 1 });
  const catalog = json(row?.data, {})?.locationCatalog;
  return Array.isArray(catalog?.states) ? catalog.states : [];
};
publicRouter.get('/locations', wrap(async (req, res) => {
  const includeUnserviceable = req.query.audience === 'teacher-registration';
  const states = (await locationRows()).filter(s => s?.active === true).map(s => ({
    id: String(s.id), name: s.name,
    districts: (Array.isArray(s.districts) ? s.districts : []).filter(d => d?.active === true).map(d => ({
      id: String(d.id), name: d.name,
      localities: (Array.isArray(d.localities) ? d.localities : []).filter(l => l?.active === true && (includeUnserviceable || l?.publiclyServiceable === true)).map(l => ({ id: String(l.id), name: l.name })),
    })),
  }));
  res.json({ items: states });
}));
const publicPhotoUrl = teacher => {
  const optimized = teacher.public_photo_id ? optimizedCloudImage(teacher.public_photo_id, { width: 384, height: 384, crop: 'fill' }) : '';
  const fallback = typeof teacher.public_photo === 'string' ? teacher.public_photo : '';
  try { return new URL(optimized || fallback).protocol === 'https:' ? optimized || fallback : ''; } catch { return ''; }
};
const publicTeacher = (t) => ({ id: t.id, name: t.public_name || t.full_name, location: t.public_location || '', photoUrl: publicPhotoUrl(t), qualification: publicQualification(t), subjects: json(t.public_subjects, []), levels: json(t.public_levels, []) });
publicRouter.get('/teachers', wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(48, Math.max(1, Number(req.query.limit) || 12));
  const featuredOnly = req.query.featured !== 'false';
  const filter = { status: 'approved', blocked: { $ne: true }, archived_at: { $exists: false }, ...(featuredOnly ? { featured: { $in: [true, 1] }, $or: [{ public_photo_id: { $type: 'string', $ne: '' } }, { public_photo: { $type: 'string', $ne: '' } }] } : {}) };
  const { search, subject, level, location, stateId, districtId, localityId } = req.query;
  const rx = (v) => new RegExp(escapeRegex(v), 'i');
  const states = await locationRows();
  const serviceLocations = states.filter(s => s?.active === true).flatMap(s => (s.districts || []).filter(d => d?.active === true).flatMap(d => (d.localities || []).filter(l => l?.active === true && l?.publiclyServiceable === true).map(l => ({ stateId: String(s.id), districtId: String(d.id), localityId: String(l.id) }))));
  const selectedState = stateId ? states.find(s => s?.active === true && String(s.id) === String(stateId)) : null;
  const selectedDistrict = districtId ? selectedState?.districts?.find(d => d?.active === true && String(d.id) === String(districtId)) : null;
  const selectedLocality = localityId ? selectedDistrict?.localities?.find(l => l?.active === true && l?.publiclyServiceable === true && String(l.id) === String(localityId)) : null;
  if ((stateId && !selectedState) || (districtId && !selectedDistrict) || (localityId && !selectedLocality)) return res.status(422).json({ error: { code: 'INVALID_LOCATION', message: 'Choose an active state, district and serviceable locality in that order.' } });
  const matchingServiceLocations = serviceLocations.filter(item => (!stateId || item.stateId === String(stateId)) && (!districtId || item.districtId === String(districtId)) && (!localityId || item.localityId === String(localityId)));
  if (!matchingServiceLocations.length) return res.json({ items: [], page, limit, total: 0, totalPages: 0 });
  filter.$and = [...(filter.$and || []), { $or: matchingServiceLocations.map(item => ({ location_state_id: item.stateId, location_district_id: item.districtId, location_locality_id: item.localityId })) }];
  if (search) filter.$and = [...(filter.$and || []), { $or: [{ public_name: rx(search) }, { full_name: rx(search) }, { public_location: rx(search) }, { public_subjects: rx(search) }] }];
  if (subject) filter.public_subjects = rx(`"${subject}"`);
  if (level) filter.public_levels = rx(`"${level}"`);
  if (location) filter.public_location = rx(location);
  const sort = featuredOnly ? { featured_order: 1, id: -1 } : { id: -1 };
  if (featuredOnly) {
    const docs = await col('teachers').find(filter, { projection: { id: 1, data: 1, full_name: 1, public_name: 1, public_location: 1, public_photo: 1, public_photo_id: 1, public_subjects: 1, public_levels: 1 } }).sort(sort).toArray();
    const eligible = docs.map(publicTeacher).filter(t => t.name?.trim() && t.photoUrl && t.qualification);
    const total = eligible.length, start = (page - 1) * limit;
    return res.json({ items: eligible.slice(start, start + limit), page, limit, total, totalPages: Math.ceil(total / limit) });
  }
  const [total, docs] = await Promise.all([col('teachers').countDocuments(filter), col('teachers').find(filter, { projection: { id: 1, data: 1, full_name: 1, public_name: 1, public_location: 1, public_photo: 1, public_photo_id: 1, public_subjects: 1, public_levels: 1 } }).sort(sort).skip((page - 1) * limit).limit(limit).toArray()]);
  res.json({ items: docs.map(publicTeacher), page, limit, total, totalPages: Math.ceil(total / limit) });
}));
const validateTeacherRegistrationLocation = wrap(async (req, _res, next) => {
  const submitted = req.body.location, states = await locationRows();
  const state = states.find(item => item?.active === true && String(item.id) === submitted.stateId);
  const district = state?.districts?.find(item => item?.active === true && String(item.id) === submitted.districtId);
  const locality = district?.localities?.find(item => item?.active === true && String(item.id) === submitted.localityId);
  if (!state || !district || !locality || locality.name.trim().toLocaleLowerCase() !== submitted.locality.trim().toLocaleLowerCase()) {
    const fields = {};
    if (!state) fields['location.stateId'] = 'Choose an active state.';
    if (!district) fields['location.districtId'] = 'Choose a district in the selected state.';
    if (!locality) fields['location.localityId'] = 'Choose a village, colony or locality in the selected district.';
    if (locality && locality.name.trim().toLocaleLowerCase() !== submitted.locality.trim().toLocaleLowerCase()) fields['location.locality'] = 'The locality must match the selected catalog entry.';
    throw new HttpError(422, 'Choose a locality that belongs to the selected district.', fields);
  }
  req.body.location = { stateId: String(state.id), state: state.name, districtId: String(district.id), district: district.name, localityId: String(locality.id), locality: locality.name };
  next();
});
const validateEducationSelection = async (req, _res, next) => {
  try {
    const row = await col('settings').findOne({ id: 1 });
    const storedSettings = json(row?.data, {});
    const settings = storedSettings && typeof storedSettings === 'object' && !Array.isArray(storedSettings) ? storedSettings : {};
    const catalogValue = json(settings.educationCatalog, {});
    validateEducationSelectionData(req.body, catalogValue);
    next();
  } catch (error) { next(error); }
};
publicRouter.post('/parent-enquiries', markParentEnquiryStage('rate_limit'), formLimiter, markParentEnquiryStage('honeypot'), rejectHoneypot, markParentEnquiryStage('field_configuration'), wrap(async (req,_res,next) => { req.body = await configuredSubmission('findTutor', req.body); next(); }), markParentEnquiryStage('schema_validation'), validate(parentEnquirySchema), markParentEnquiryStage('field_configuration'), wrap(async (req,_res,next) => { req.body = await configuredSubmission('findTutor', req.body); next(); }), markParentEnquiryStage('education_validation'), validateEducationSelection, wrap(async (req, res) => {
  setParentEnquiryStage(req, 'idempotency_lookup');
  const d = req.body, key = req.get('Idempotency-Key'), digest = crypto.createHash('sha256').update(JSON.stringify(d)).digest('hex');
  if (key && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new HttpError(400, 'A valid idempotency key is required.');
  const replay = async () => {
    const prior = await findParentEnquiryReplay(col('enquiry_idempotency'), key, digest);
    if (!prior) return null;
    if (!prior.matches) throw new HttpError(409, 'This submission key was already used with different enquiry details.');
    return prior.response;
  };
  const existing = await replay();
  if (existing) return res.status(201).json(existing);
  const normalizedPhone = normalizeTeacherPhone(d.phone);
  setParentEnquiryStage(req, 'sequence_allocation');
  const reference = ref('ENQ'), timestamp = now(), id = await nextId('enquiries');
  const response = { reference, id, message: 'Your enquiry is with our team. We will check tutor availability for your selected city and area and confirm with you.' };
  try {
    await persistParentEnquiry({
      transaction: withDbTransaction,
      idempotencyCollection: col('enquiry_idempotency'),
      enquiryCollection: col('enquiries'),
      rateLimitCollection: col('parent_enquiry_rate_limits'),
      rateLimitOptions: {
        phone: normalizedPhone, ip: req.ip, secret: config.jwtSecret,
        phoneMax: config.parentEnquiryPhoneLimitMax,
        phoneWindowMs: config.parentEnquiryPhoneLimitWindowHours * 60 * 60 * 1000,
        ipMax: config.parentEnquiryIpLimitMax,
        ipWindowMs: config.parentEnquiryIpLimitWindowHours * 60 * 60 * 1000,
      },
      idempotencyRecord: key ? { id: key, key, digest, response, created_at: timestamp } : null,
      enquiryRecord: { id, reference, status: 'new', data: JSON.stringify(d), parent_name: d.parentName, phone: d.phone, phone_normalized: normalizedPhone, student_class: d.studentClass, city: d.city, created_at: timestamp, updated_at: timestamp, blocked: false },
      onStage: stage => setParentEnquiryStage(req, stage),
    });
  } catch (error) {
    const failedStage = req.parentEnquiryStage;
    if (key) {
      setParentEnquiryStage(req, 'idempotency_lookup');
      const prior = await replay();
      if (prior) return res.status(201).json(prior);
      setParentEnquiryStage(req, failedStage);
    }
    throw error;
  }
  setParentEnquiryStage(req, 'response');
  res.status(201).json(response);
}));
publicRouter.post('/teacher-registrations', markTeacherRegistrationStage('rate_limit'), formLimiter, markTeacherRegistrationStage('storage_configuration'), requireCloudinary, markTeacherRegistrationStage('multipart_parse'), teacherRegistrationUpload, markTeacherRegistrationStage('application_parse'), parseTeacherApplication, markTeacherRegistrationStage('honeypot'), rejectHoneypot, markTeacherRegistrationStage('field_configuration'), wrap(async (req,_res,next) => { req.body = await configuredSubmission('becomeTeacher', req.body); next(); }), markTeacherRegistrationStage('schema_validation'), validate(teacherRegistrationSchema), markTeacherRegistrationStage('field_configuration'), wrap(async (req,_res,next) => { req.body = await configuredSubmission('becomeTeacher', req.body); next(); }), markTeacherRegistrationStage('terms_validation'), validateCurrentTeacherTerms, markTeacherRegistrationStage('location_validation'), validateTeacherRegistrationLocation, markTeacherRegistrationStage('file_validation'), validateTeacherRegistrationFiles, wrap(async (req, res) => {
  setTeacherRegistrationStage(req, 'duplicate_check');
  const d = req.body, email = normalizeTeacherEmail(d.personal.email), phone = d.personal.phone;
  const emailNormalized = normalizeTeacherEmail(email), phoneNormalized = normalizeTeacherPhone(phone);
  const candidates = await col('teachers').find({ $or: [
    { email_normalized: emailNormalized }, { phone_normalized: phoneNormalized },
    { email_normalized: { $exists: false } }, { phone_normalized: { $exists: false } },
  ] }, { projection: { email: 1, phone: 1, email_normalized: 1, phone_normalized: 1 } }).toArray();
  const dup = candidates.some(record => normalizeTeacherEmail(record.email_normalized || record.email) === emailNormalized || normalizeTeacherPhone(record.phone_normalized || record.phone) === phoneNormalized);
  if (dup) throw new HttpError(409, 'An application with this email or mobile number already exists.', undefined, 'DUPLICATE');
  const uploaded = [];
  let persisted = false;
  let safeToCleanAssets = true;
  let uploadReferenceIncomplete = false;
  try {
    const { profilePhoto, qualificationProof, aadhaarDocument } = req.validatedTeacherFiles;
    setTeacherRegistrationStage(req, 'profile_photo_upload');
    const profileAsset = await uploadPrivateTeacherAsset(profilePhoto.file.buffer, { folder: 'profile-photos', resourceType: 'image' });
    if (profileAsset?.public_id) uploaded.push({ publicId: profileAsset.public_id, resourceType: 'image' });
    else uploadReferenceIncomplete = true;
    assertTeacherAssetMetadata(profileAsset, profilePhoto.format);
    setTeacherRegistrationStage(req, 'qualification_proof_upload');
    const proofAsset = await uploadPrivateTeacherAsset(qualificationProof.file.buffer, { folder: 'qualification-proofs', resourceType: 'raw', format: qualificationProof.format });
    if (proofAsset?.public_id) uploaded.push({ publicId: proofAsset.public_id, resourceType: 'raw' });
    else uploadReferenceIncomplete = true;
    assertTeacherAssetMetadata(proofAsset, qualificationProof.format);
    setTeacherRegistrationStage(req, 'aadhaar_document_upload');
    const aadhaarAsset = await uploadPrivateTeacherAsset(aadhaarDocument.file.buffer, { folder: 'identity-documents', resourceType: 'raw', format: aadhaarDocument.format });
    if (aadhaarAsset?.public_id) uploaded.push({ publicId: aadhaarAsset.public_id, resourceType: 'raw' });
    else uploadReferenceIncomplete = true;
    assertTeacherAssetMetadata(aadhaarAsset, aadhaarDocument.format);

    setTeacherRegistrationStage(req, 'database_commit');
    const timestamp = now(), reference = ref('TCH'), id = await nextId('teachers');
    const { termsAccepted, termsVersionId, ...application } = d;

    application.documents = {
      profilePhoto: { publicId: profileAsset.public_id, resourceType: 'image', format: profilePhoto.format, mimeType: profilePhoto.mime, size: profilePhoto.file.size, width: profilePhoto.width, height: profilePhoto.height, originalName: profilePhoto.originalName },
      qualificationProof: { publicId: proofAsset.public_id, resourceType: 'raw', format: qualificationProof.format, mimeType: qualificationProof.mime, size: qualificationProof.file.size, originalName: qualificationProof.originalName },
      aadhaarDocument: { publicId: aadhaarAsset.public_id, resourceType: 'raw', format: aadhaarDocument.format, mimeType: aadhaarDocument.mime, size: aadhaarDocument.file.size },
    };
    application.termsConsent = { accepted: termsAccepted, acceptedAt: timestamp, version: termsVersionId, versionId: termsVersionId, versionNumber: req.currentTeacherTerms.versionNumber };
    const teacherRecord = { id, reference, status: 'pending', blocked: false, data: JSON.stringify(application), full_name: d.personal.fullName, email, phone, email_normalized: emailNormalized, phone_normalized: phoneNormalized,
      featured: 0, featured_order: 0, public_name: d.personal.fullName, public_location: null, public_photo: null,
      public_subjects: JSON.stringify(d.teaching.subjects), public_levels: JSON.stringify(d.teaching.classes), created_at: timestamp };
    const persistence = await commitTeacherRecordOrConfirm({
      write: () => withDbTransaction(async session => {
        const state = await col('teacher_terms_state').findOne({ id: 1 }, { session });
        if (!state || state.current_version_id !== termsVersionId) throw new HttpError(409, 'The Terms & Conditions have changed. Review and accept the latest version before submitting.', { termsVersionId: 'Review the current terms and accept them before resubmitting.' }, 'TERMS_VERSION_STALE');
        await col('teachers').insertOne(teacherRecord, { session });
      }),
      readBack: async () => Boolean(await col('teachers').findOne({ id, reference }, { projection: { _id: 1 } })),
    });
    persisted = persistence.persisted;
    safeToCleanAssets = persistence.safeToCleanAssets;
    if (!persisted) {
      setTeacherRegistrationStage(req, 'database_commit_verification');
      if (persistence.error instanceof HttpError) throw persistence.error;
      if (!safeToCleanAssets) throw new HttpError(500, 'We could not confirm whether your application was saved. Please contact our team before submitting again.', undefined, 'SAVE_STATUS_UNKNOWN');
      throw persistence.error;
    }
    res.status(201).json({ reference, message: 'Application received. It will be reviewed by our team.' });
  } catch (error) {
    const failureStage = req.teacherRegistrationStage;
    if (!persisted && safeToCleanAssets && uploaded.length) {
      const cleanupResults = await Promise.all(uploaded.map(asset => deletePrivateTeacherAsset(asset.publicId, asset.resourceType).catch(() => false)));
      if (cleanupResults.some(deleted => !deleted) || uploadReferenceIncomplete) {
        logTeacherRegistrationFailure({ requestId: req.requestId, stage: 'asset_cleanup', status: error.status || 500, error });
      }
    } else if (!persisted && uploadReferenceIncomplete) {
      logTeacherRegistrationFailure({ requestId: req.requestId, stage: 'asset_cleanup', status: error.status || 500, error });
    }
    if (error instanceof HttpError) throw error;
    if (error?.code === 11000) throw new HttpError(409, 'An application with this email or mobile number already exists.', undefined, 'DUPLICATE');
    if (failureStage.endsWith('_upload')) {
      const uploadError = new HttpError(502, 'Your documents could not be securely stored. Please try again.', undefined, 'TEACHER_ASSET_UPLOAD_FAILED');
      uploadError.cause = error;
      throw uploadError;
    }
    throw new HttpError(500, 'Your application could not be saved. Please try again later.', undefined, 'TEACHER_SAVE_FAILED');
  }
}));




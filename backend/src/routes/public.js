import { Router } from 'express';
import { col, json, now, nextId, escapeRegex } from '../db.js';
import { wrap, validate, formLimiter, verifyCaptcha, HttpError } from '../middleware.js';
import { parentEnquirySchema, teacherRegistrationSchema } from '../schemas.js';
import crypto from 'node:crypto';
import { optimizedCloudImage } from '../cloudinary.js';

export const publicRouter = Router();
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
publicRouter.get('/locations', wrap(async (_req, res) => {
  const states = (await locationRows()).filter(s => s?.active === true).map(s => ({
    id: String(s.id), name: s.name,
    districts: (Array.isArray(s.districts) ? s.districts : []).filter(d => d?.active === true).map(d => ({
      id: String(d.id), name: d.name,
      localities: (Array.isArray(d.localities) ? d.localities : []).filter(l => l?.active === true && l?.publiclyServiceable === true).map(l => ({ id: String(l.id), name: l.name })),
    })),
  }));
  res.json({ items: states });
}));
const publicTeacher = (t) => ({ id: t.id, name: t.public_name || t.full_name, location: t.public_location || '', photoUrl: t.public_photo_id ? (optimizedCloudImage(t.public_photo_id, { width: 384, height: 384, crop: 'fill' }) || t.public_photo || '') : t.public_photo || '', subjects: json(t.public_subjects, []), levels: json(t.public_levels, []) });
publicRouter.get('/teachers', wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(48, Math.max(1, Number(req.query.limit) || 12));
  const featuredOnly = req.query.featured !== 'false';
  const filter = { status: 'approved', ...(featuredOnly ? { featured: { $in: [true, 1] } } : {}) };
  const { search, subject, level, location, stateId, districtId, localityId } = req.query;
  const rx = (v) => new RegExp(escapeRegex(v), 'i');
  if (search) filter.$and = [...(filter.$and || []), { $or: [{ public_name: rx(search) }, { full_name: rx(search) }, { public_location: rx(search) }, { public_subjects: rx(search) }] }];
  if (subject) filter.public_subjects = rx(`"${subject}"`);
  if (level) filter.public_levels = rx(`"${level}"`);
  if (location) filter.public_location = rx(location);
  if (stateId) filter.location_state_id = String(stateId);
  if (districtId) filter.location_district_id = String(districtId);
  if (localityId) filter.location_locality_id = String(localityId);
  if (stateId || districtId || localityId) {
    const states = await locationRows();
    const state = states.find(s => s?.active === true && String(s.id) === String(stateId));
    const district = state?.districts?.find(d => d?.active === true && String(d.id) === String(districtId));
    const locality = district?.localities?.find(l => l?.active === true && l?.publiclyServiceable === true && String(l.id) === String(localityId));
    if (!state || !district || !locality) return res.status(422).json({ error: { code: 'INVALID_LOCATION', message: 'Choose an active, serviceable state, district and locality.' } });
  }
  const sort = featuredOnly ? { featured_order: 1, id: -1 } : { id: -1 };
  const [total, docs] = await Promise.all([col('teachers').countDocuments(filter), col('teachers').find(filter, { projection: { id: 1, full_name: 1, public_name: 1, public_location: 1, public_photo: 1, public_photo_id: 1, public_subjects: 1, public_levels: 1 } }).sort(sort).skip((page - 1) * limit).limit(limit).toArray()]);
  res.json({ items: docs.map(publicTeacher), page, limit, total, totalPages: Math.ceil(total / limit) });
}));
const validateEducationSelection = async (req, _res, next) => {
  try {
    const d = req.body, row = await col('settings').findOne({ id: 1 });
    const catalog = json(json(row?.data, {}).educationCatalog, {}), active = (items) => (Array.isArray(items) ? items : []).filter(item => item?.active === true);
    const level = active(catalog.educationLevels).find(item => String(item.value) === d.studentClass), senior = ['11', '12'].includes(d.studentClass);
    const stream = active(catalog.streams).find(item => item.id === d.streamId), fields = {};
    if (catalog.educationLevels && !level) fields.studentClass = 'Choose an available education level.';
    if (senior && !stream) fields.streamId = 'Choose an available Class 11–12 stream.';
    if (!senior && d.streamId) fields.streamId = 'Streams are available only for Class 11 and 12.';
    const overrides = catalog.subjectsByBoardClass?.[d.board]?.[d.studentClass]?.[d.streamId || 'general'];
    const allowedSubjects = overrides || (senior ? stream?.subjects : null);
    if (Array.isArray(allowedSubjects) && d.subjects.some(subject => !allowedSubjects.includes(subject))) fields.subjects = 'One or more subjects do not match the selected class, board or stream.';
    const validExams = active(catalog.competitiveExams).filter(exam => senior ? stream?.examIds?.includes(exam.id) : exam.id === 'foundation').map(exam => exam.id);
    if (d.examPreparations.some(id => !validExams.includes(id))) fields.examPreparations = 'Choose an exam option available for this class and stream.';
    if (Object.keys(fields).length) return next(new HttpError(422, 'Please check the highlighted education options.', fields));
    next();
  } catch (error) { next(error); }
};
publicRouter.post('/parent-enquiries', formLimiter, verifyCaptcha, validate(parentEnquirySchema), validateEducationSelection, wrap(async (req, res) => {
  const d = req.body, reference = ref('ENQ'), timestamp = now(), id = await nextId('enquiries');
  await col('enquiries').insertOne({ id, reference, status: 'new', data: JSON.stringify(d), parent_name: d.parentName, phone: d.phone, student_class: d.studentClass, city: d.city, created_at: timestamp, updated_at: timestamp });
  res.status(201).json({ reference, message: 'Your enquiry is with our team. We will check tutor availability for your selected city and area and confirm with you.' });
}));
publicRouter.post('/teacher-registrations', formLimiter, verifyCaptcha, validate(teacherRegistrationSchema), wrap(async (req, res) => {
  const d = req.body, email = d.personal.email.toLowerCase(), phone = d.personal.phone;
  const dup = await col('teachers').findOne({ status: { $ne: 'rejected' }, $or: [{ email }, { phone }] });
  if (dup) return res.status(409).json({ error: { code: 'DUPLICATE', message: 'An application with this email or mobile number already exists.' } });
  const reference = ref('TCH'), id = await nextId('teachers');
  await col('teachers').insertOne({ id, reference, status: 'pending', data: JSON.stringify(d), full_name: d.personal.fullName, email, phone,
    featured: 0, featured_order: 0, public_name: d.personal.fullName, public_location: null, public_photo: null,
    public_subjects: JSON.stringify(d.teaching.subjects), public_levels: JSON.stringify(d.teaching.classes), created_at: now() });
  res.status(201).json({ reference, message: 'Application received. It will be reviewed by our team.' });
}));

import { z } from 'zod';
import { normalizeWhatsAppNumber } from './whatsappSettings.js';

const phone = z.string().trim().regex(/^\+?[0-9]{10,14}$/, 'Enter a valid mobile number (10–14 digits, optional +country code).');
const str = (max = 200) => z.string().trim().max(max);
const req = (label, max = 200) => str(max).min(1, `${label} is required.`);
const coordinate = (min, max) => z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number().finite().min(min).max(max)).optional();
const year = z.coerce.number().int().min(1960).max(new Date().getFullYear() + 1);
const edu = z.object({ board: req('Board'), year, score: req('Percentage/grade', 20) });
const degree = z.object({ degree: req('Degree'), university: req('University'), year, score: req('CGPA/percentage', 20) });

export const parentEnquirySchema = z.object({
  parentName: req('Parent name', 120), phone, studentName: req('Student name', 120),
  studentClass: req('Class', 40), board: req('Board', 60), streamId: str(60).optional(),
  examPreparations: z.array(str(60)).max(10).default([]), subjects: z.array(str(80)).min(1, 'Select at least one subject.').max(15),
  city: z.enum(['Prayagraj', 'Lucknow'], { error: 'Choose Prayagraj or Lucknow.' }),
  locality: str(120).optional(), homeAddress: str(300).optional(), colony: str(120).optional(), landmark: str(120).optional(),
  pincode: z.string().regex(/^[0-9]{6}$/, 'PIN code must be 6 digits.').optional(),
  latitude: coordinate(-90, 90), longitude: coordinate(-180, 180), mode: z.enum(['home', 'online']),
  preferredDays: z.array(str(20)).max(7).default([]), preferredTiming: str(120).optional(),
  budget: z.coerce.number().int().min(0).max(1000000).optional(), notes: str(1500).optional(),
}).strict().superRefine((enquiry, ctx) => {
  const hasLatitude = enquiry.latitude !== undefined, hasLongitude = enquiry.longitude !== undefined;
  if (hasLatitude !== hasLongitude) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [hasLatitude ? 'longitude' : 'latitude'], message: 'Choose both map coordinates or leave the map pin unset.' });
  const senior = ['11', '12'].includes(enquiry.studentClass);
  if (senior && !enquiry.streamId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['streamId'], message: 'Choose a stream for Class 11 or 12.' });
  if (!senior && enquiry.streamId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['streamId'], message: 'Streams are available for Class 11 and 12.' });
});
export const teacherRegistrationSchema = z.object({
  personal: z.object({
    fullName: req('Full name', 120),
    gender: z.enum(['Male', 'Female', 'Other']),
    dob: z.string().refine((d) => { const t = Date.parse(d); const a = (Date.now() - t) / 31557600000; return !isNaN(t) && a >= 18 && a <= 80; }, 'You must be between 18 and 80 years old.'),
    phone,
    email: z.string().trim().email('Enter a valid email address.').max(160),
    address: req('Address', 300), landmark: str(120).optional().default(''),
    pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit Indian PIN code.'),
    ownVehicle: z.boolean().optional(),
  }),
  academics: z.object({
    class10: edu, class12: edu, graduation: degree,
    postgraduation: degree.partial().optional(),
    certifications: z.array(str(160)).max(20).optional(),
  }),
  teaching: z.object({
    classes: z.array(str(40)).min(1, 'Select at least one class.'),
    subjects: z.array(str(80)).min(1, 'Select at least one subject.'),
    medium: z.enum(['English', 'Hindi', 'Bilingual']),
    experienceYears: z.coerce.number().min(0).max(60),
    previousInstitutions: str(500).optional().default(''),
    preferredAreas: str(300).optional().default(''),
    homeTuition: z.boolean().optional(),
    commute: z.enum(['Vehicle', 'Public Transport', 'Walk']),
  }),
  availability: z.object({
    days: z.array(str(20)).min(1, 'Select at least one day.'),
    timeSlots: z.array(str(40)).min(1, 'Select at least one time slot.'),
    teachingStyle: str(1000).optional().default(''),
    freeDemo: z.boolean().optional(),
    references: str(800).optional().default(''),
  }),
  fees: z.object({
    minMonthly: z.coerce.number().int().min(0).max(1000000),
    maxMonthly: z.coerce.number().int().min(0).max(1000000),
    paymentModes: z.array(z.enum(['Cash', 'UPI', 'Bank Transfer'])).min(1, 'Select at least one payment mode.'),
  }).refine((f) => f.maxMonthly >= f.minMonthly, { message: 'Maximum fee must be at least the minimum fee.', path: ['maxMonthly'] }),
  location: z.object({ stateId: req('State'), districtId: req('District'), localityId: req('Village / Colony / Locality'), locality: req('Village / Colony / Locality', 120) }).strict(),
  termsVersionId: req('Terms version', 100),
  termsAccepted: z.literal(true, { error: 'You must agree to the current Terms & Conditions before submitting.' }),
}).strict();

export const teacherTermsDraftSchema = z.object({
  content: z.array(z.string().trim().min(1).max(3000)).min(1).max(50),
  changeSummary: str(300).optional().default(''),
  expectedRevision: z.number().int().nonnegative(),
  expectedCurrentVersionId: req('Current terms version', 100),
}).strict();
export const teacherTermsPublishSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  expectedCurrentVersionId: req('Current terms version', 100),
  expectedDraftVersionId: req('Draft terms version', 120),
}).strict();

export const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

export const bannerSchema = z.object({
  title: req('Title', 140), message: str(1000).optional().default(''),
  imageUrl: str(500).optional().default(''), imagePublicId: str(240).optional().default(''), ctaLabel: str(60).optional().default(''), ctaUrl: str(500).optional().default(''),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  enabled: z.boolean().default(true), priority: z.coerce.number().int().min(0).max(1000).default(0),
  placement: z.enum(['hero', 'banner', 'popup']).default('banner'),
  theme: z.enum(['festive', 'info', 'success', 'warning', 'neutral']).default('festive'),
  frequency: z.enum(['session', 'always', 'days']).default('session'),
  frequencyDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
}).refine((b) => !b.startsAt || !b.endsAt || Date.parse(b.endsAt) > Date.parse(b.startsAt), { message: 'End must be after start.', path: ['endsAt'] });

export const contentSchema = z.object({ content: z.record(z.string(), z.any()), summary: str(200).optional() });
const safeSocialText = (label, max) => z.string().trim().min(1, `${label} is required.`).max(max).refine((value) => !/[<>\u0000-\u001f]/.test(value), `${label} contains unsupported characters.`);
export const socialLinkSchema = z.object({
  id: z.string().uuid(),
  platform: safeSocialText('Platform name', 60),
  label: safeSocialText('Display label', 80),
  url: z.string().trim().max(2048).url('Enter a valid absolute HTTPS profile URL.').refine((value) => { try { return new URL(value).protocol === 'https:'; } catch { return false; } }, 'Social profile links must use HTTPS.'),
  icon: z.enum(['instagram', 'facebook', 'youtube', 'linkedin', 'x', 'whatsapp', 'globe', 'link']).default('globe'),
  placement: z.enum(['footer', 'contact', 'both']),
  order: z.coerce.number().int().min(0).max(1000),
  active: z.boolean().default(true),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
}).strict();
const socialLinksSchema = z.array(socialLinkSchema).max(100, 'A maximum of 100 social links is allowed.').superRefine((links, ctx) => {
  const ids = links.map((link) => link.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Social link IDs must be unique.' });
});
const catalogItemSchema = z.object({ id: req('ID', 60), label: req('Label', 120), active: z.boolean(), order: z.coerce.number().int().min(0).max(1000) }).passthrough();
const educationCatalogSchema = z.object({
  educationLevels: z.array(catalogItemSchema.extend({ value: req('Value', 40), stage: req('Stage', 40) })).max(20),
  streams: z.array(catalogItemSchema.extend({ description: str(300).optional().default(''), subjects: z.array(str(80)).max(40), examIds: z.array(str(60)).max(20) })).max(30),
  competitiveExams: z.array(catalogItemSchema.extend({ description: str(300).optional().default('') })).max(30),
  subjectsByBoardClass: z.record(z.string().max(60), z.record(z.string().max(40), z.record(z.string().max(60), z.array(str(80)).max(40)))).default({}),
}).strict();
const locationItemSchema = z.object({ id: req('Location ID', 100), name: req('Location name', 120), active: z.boolean() });
const locationCatalogSchema = z.object({
  states: z.array(locationItemSchema.extend({ districts: z.array(locationItemSchema.extend({ localities: z.array(locationItemSchema.extend({ publiclyServiceable: z.boolean() })).max(1000) })).max(1000) })).max(100),
}).strict().superRefine((catalog, ctx) => {
  const unique = (items, path) => { const ids = items.map(item => item.id); if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Location IDs must be unique among siblings.' }); };
  unique(catalog.states, ['states']);
  catalog.states.forEach((state, si) => { unique(state.districts, ['states', si, 'districts']); state.districts.forEach((district, di) => unique(district.localities, ['states', si, 'districts', di, 'localities'])); });
});
export const settingsSchema = z.object({ socialLinks: socialLinksSchema.optional(), educationCatalog: educationCatalogSchema.optional(), locationCatalog: locationCatalogSchema.optional(), whatsapp: z.string().trim().min(1).max(40).transform(normalizeWhatsAppNumber).refine(Boolean, 'Enter a valid international WhatsApp number including country code.').optional() }).passthrough();
export const pageFormDraftSchema = z.object({ expectedRevision: z.number().int().nonnegative(), expectedDraftRevision: z.number().int().nonnegative(), pages: z.record(z.string(), z.any()) }).strict();
export const pageFormPublishSchema = z.object({ expectedRevision: z.number().int().nonnegative(), expectedDraftRevision: z.number().int().nonnegative() }).strict();
export const teacherStatusSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected']) });
export const teacherFeaturedSchema = z.object({
  featured: z.boolean().optional(), featuredOrder: z.coerce.number().int().min(0).optional(),
  publicName: str(120).optional(), publicLocation: str(120).optional(), publicPhoto: str(500).optional(), publicPhotoId: str(240).optional(),
  locationStateId: str(100).optional(), locationDistrictId: str(100).optional(), locationLocalityId: str(100).optional(),
  publicSubjects: z.array(str(80)).max(10).optional(), publicLevels: z.array(str(40)).max(15).optional(),
});
export const enquiryUpdateSchema = z.object({ status: z.enum(['new', 'contacted', 'in_progress', 'matched', 'closed']) });
export const noteSchema = z.object({ note: req('Note', 1500) });




export const whatsappSettingsSchema = z.object({ whatsapp: z.string().trim().min(1).max(40).transform(normalizeWhatsAppNumber).refine(Boolean, 'Enter a valid international WhatsApp number including country code.') }).strict();
export const passwordChangeSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128), confirmPassword: z.string().min(12).max(128) }).strict().refine(value => value.newPassword === value.confirmPassword, { message: 'New passwords do not match.', path: ['confirmPassword'] });

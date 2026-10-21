import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';
import { col, json, nextId, now } from './db.js';
import { deleteCloudImage, uploadCloudImage } from './cloudinary.js';
import { HttpError } from './middleware.js';

const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 6000;
const MAX_PIXELS = 25_000_000;

export async function validateImageFile(file) {
  if (!file?.buffer?.length) throw new HttpError(400, 'Choose an image to upload.');
  if (file.size > MAX_BYTES) throw new HttpError(413, 'Images must be 5 MB or smaller.');
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !allowedMime.has(detected.mime) || file.mimetype !== detected.mime) {
    throw new HttpError(415, 'Upload a valid JPEG, PNG, or WebP image.');
  }
  let dimensions;
  try { dimensions = imageSize(file.buffer); }
  catch { throw new HttpError(415, 'The image file is invalid or could not be read.'); }
  const { width, height } = dimensions;
  if (!width || !height || width < 120 || height < 120 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    throw new HttpError(422, 'Images must be at least 120 × 120 pixels and no larger than 6000 × 6000 pixels or 25 megapixels.');
  }
  return { mime: detected.mime, width, height };
}

export async function storeCloudMedia(file, folder) {
  const image = await validateImageFile(file);
  let result;
  try { result = await uploadCloudImage(file.buffer, folder); }
  catch { throw new HttpError(502, 'Cloud image upload failed. Please check the Cloudinary connection and try again.'); }
  const doc = {
    id: await nextId('media'), public_id: result.public_id, secure_url: result.secure_url,
    folder: `tutorathome/${folder}`, original_name: path.basename(file.originalname || 'image').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120),
    mime: image.mime, size: file.size, width: image.width, height: image.height, created_at: now(),
  };
  try { await col('media').insertOne(doc); }
  catch {
    try { await deleteCloudImage(result.public_id); } catch {}
    throw new HttpError(500, 'The image uploaded but could not be saved. Please retry.');
  }
  return doc;
}

function ownerUses(value, publicId) {
  const content = typeof value === 'string' ? json(value, {}) : value || {};
  return (content.sections || []).some(section => section?.id === 'owner' && section.imagePublicId === publicId);
}

async function referenced(publicId) {
  const media = await col('media').findOne({ public_id: publicId }, { projection: { secure_url: 1 } });
  const secureUrl = media?.secure_url;
  const [teachers, legacyTeachers, banners, legacyBanners, contents] = await Promise.all([
    col('teachers').countDocuments({ public_photo_id: publicId }),
    secureUrl ? col('teachers').countDocuments({ public_photo: secureUrl }) : 0,
    col('banners').countDocuments({ image_public_id: publicId }),
    secureUrl ? col('banners').countDocuments({ image_url: secureUrl }) : 0,
    col('content').find({}, { projection: { draft: 1, published: 1 } }).toArray(),
  ]);
  if (teachers + legacyTeachers + banners + legacyBanners || contents.some(row => ownerUses(row.draft, publicId) || ownerUses(row.published, publicId) || (secureUrl && (containsValue(row.draft, secureUrl) || containsValue(row.published, secureUrl))))) return true;
  const revisions = col('revisions').find({}, { projection: { snapshot: 1 } });
  for await (const revision of revisions) if (ownerUses(revision.snapshot, publicId) || (secureUrl && containsValue(revision.snapshot, secureUrl))) return true;
  return false;
}

function containsValue(value, expected) {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some(item => containsValue(item, expected));
  if (value && typeof value === 'object') return Object.values(value).some(item => containsValue(item, expected));
  if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
    try { return containsValue(JSON.parse(value), expected); } catch {}
  }
  return false;
}

export async function localImageReferenced(url) {
  const [teachers, banners, contents] = await Promise.all([
    col('teachers').countDocuments({ public_photo: url }),
    col('banners').countDocuments({ image_url: url }),
    col('content').find({}, { projection: { draft: 1, published: 1 } }).toArray(),
  ]);
  if (teachers + banners || contents.some(row => containsValue(row.draft, url) || containsValue(row.published, url))) return true;
  const revisions = col('revisions').find({}, { projection: { snapshot: 1 } });
  for await (const revision of revisions) if (containsValue(revision.snapshot, url)) return true;
  return false;
}

export async function cleanupUnreferencedCloudImage(publicId) {
  if (!publicId) return { deleted: false, referenced: false, missing: true };
  const media = await col('media').findOne({ public_id: publicId }, { projection: { id: 1 } });
  if (!media) return { deleted: false, referenced: false, missing: true };
  if (await referenced(publicId)) return { deleted: false, referenced: true };
  let deleted = false;
  try { deleted = await deleteCloudImage(publicId); }
  catch { deleted = false; }
  if (!deleted) return { deleted: false, referenced: false };
  await col('media').deleteMany({ public_id: publicId });
  return { deleted: true, referenced: false };
}

export const isSupportedImageMime = mime => allowedMime.has(mime);

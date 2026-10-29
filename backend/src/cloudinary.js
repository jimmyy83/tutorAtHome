import { v2 as cloudinary } from 'cloudinary';
import crypto from 'node:crypto';
import { config } from './config.js';

if (config.cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    secure: true,
  });
}

export function requireCloudinary(_req, _res, next) {
  if (!config.cloudinaryEnabled) {
    const error = new Error('Image uploads are disabled. Configure Cloudinary in the backend environment.');
    error.status = 503;
    return next(error);
  }
  next();
}

export function uploadCloudImage(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder: `tutorathome/${folder}`,
      public_id: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
      resource_type: 'image',
      overwrite: false,
      unique_filename: true,
      use_filename: false,
    }, (error, result) => error ? reject(error) : resolve(result));
    stream.end(buffer);
  });
}

export function uploadPrivateTeacherAsset(buffer, { folder, resourceType, format }) {
  if (!['image', 'raw'].includes(resourceType)) throw new Error('Unsupported private asset type.');
  if (resourceType === 'raw' && !['pdf', 'jpg', 'png'].includes(format)) throw new Error('Unsupported private document format.');
  return new Promise((resolve, reject) => {
    const publicId = `${Date.now()}-${crypto.randomUUID()}${resourceType === 'raw' ? `.${format}` : ''}`;
    const stream = cloudinary.uploader.upload_stream({
      folder: `tutorathome/private/teacher-applications/${folder}`,
      public_id: publicId,
      resource_type: resourceType,
      type: 'authenticated',
      overwrite: false,
      unique_filename: false,
      use_filename: false,
    }, (error, result) => error ? reject(error) : resolve(result));
    stream.end(buffer);
  });
}

export function assertTeacherAssetMetadata(asset, verifiedFormat) {
  if (typeof asset?.public_id !== 'string' || !asset.public_id.trim()) {
    const error = new Error('Cloudinary upload returned no public asset identifier.');
    error.code = 'CLOUDINARY_METADATA_INCOMPLETE';
    throw error;
  }
  const expectedFormat = typeof verifiedFormat === 'string' ? verifiedFormat.toLowerCase() : '';
  const returnedFormat = typeof asset.format === 'string' ? asset.format.toLowerCase() : '';
  const normalizedExpected = expectedFormat === 'jpeg' ? 'jpg' : expectedFormat;
  const normalizedReturned = returnedFormat === 'jpeg' ? 'jpg' : returnedFormat;
  // Raw Cloudinary uploads may omit `format`; the source signature was already
  // validated, so that verified format remains authoritative in the record.
  // When Cloudinary does return a format, reject an actual mismatch.
  if (normalizedReturned && expectedFormat && normalizedReturned !== normalizedExpected) {
    const error = new Error('Cloudinary upload metadata format did not match the validated file.');
    error.code = 'CLOUDINARY_FORMAT_MISMATCH';
    throw error;
  }
  return asset;
}

export function deletePrivateTeacherAsset(publicId, resourceType) {
  if (!publicId || !['image', 'raw'].includes(resourceType)) return Promise.resolve(false);
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated', invalidate: true })
    .then(result => result.result === 'ok' || result.result === 'not found');
}

export function privateTeacherAssetDownloadUrl(publicId, format, resourceType, expiresAt) {
  if (!config.cloudinaryEnabled || !publicId || !format || !['image', 'raw'].includes(resourceType)) return '';
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: 'authenticated',
    attachment: true,
    expires_at: expiresAt,
  });
}

export async function deleteCloudImage(publicId) {
  if (!config.cloudinaryEnabled || !publicId) return false;
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  return result.result === 'ok' || result.result === 'not found';
}

export async function cloudinaryStorageUsageBytes() {
  if (!config.cloudinaryEnabled) return null;
  try {
    const usage = await cloudinary.api.usage();
    return reportedCloudinaryStorageBytes(usage);
  } catch {
    return null;
  }
}

export function reportedCloudinaryStorageBytes(usage) {
  const bytes = usage?.storage?.usage;
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
}

export async function listCloudinaryInventoryAssets({ maxPagesPerType = 3 } = {}) {
  if (!config.cloudinaryEnabled) return null;
  const assets = []; let truncated = false;
  try {
    for (const resource_type of ['image', 'raw', 'video']) for (const type of ['upload', 'authenticated', 'private']) {
      let next_cursor = null, pages = 0;
      do {
        const response = await cloudinary.api.resources({ resource_type, type, max_results: 500, ...(next_cursor ? { next_cursor } : {}) });
        for (const asset of response.resources || []) assets.push({ ...asset, resource_type, type });
        next_cursor = response.next_cursor || null; pages += 1;
        if (next_cursor && pages >= maxPagesPerType) { truncated = true; break; }
      } while (next_cursor);
    }
    return { assets, truncated };
  } catch {
    return null;
  }
}

export function optimizedCloudImage(publicId, { width = 1200, height, crop = 'limit' } = {}) {
  if (!config.cloudinaryEnabled || !publicId) return '';
  const transformation = { width, quality: 'auto', fetch_format: 'auto', crop };
  if (height) transformation.height = height;
  return cloudinary.url(publicId, { secure: true, transformation: [transformation] });
}

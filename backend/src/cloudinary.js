import { v2 as cloudinary } from 'cloudinary';
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

export async function deleteCloudImage(publicId) {
  if (!config.cloudinaryEnabled || !publicId) return false;
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  return result.result === 'ok' || result.result === 'not found';
}

export function optimizedCloudImage(publicId, { width = 1200, height, crop = 'limit' } = {}) {
  if (!config.cloudinaryEnabled || !publicId) return '';
  const transformation = { width, quality: 'auto', fetch_format: 'auto', crop };
  if (height) transformation.height = height;
  return cloudinary.url(publicId, { secure: true, transformation: [transformation] });
}

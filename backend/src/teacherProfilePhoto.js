import crypto from 'node:crypto';

const allowedFormats = new Set(['jpg', 'jpeg', 'png']);
const allowedMimeTypes = new Set(['image/jpeg', 'image/png']);

export function hasTeacherProfilePhoto(applicationData) {
  let application = applicationData;
  if (typeof applicationData === 'string') {
    try { application = JSON.parse(applicationData); } catch { return false; }
  }

  const photo = application?.documents?.profilePhoto;
  return Boolean(
    photo?.publicId
    && photo.resourceType === 'image'
    && allowedFormats.has(String(photo.format || '').toLowerCase())
    && allowedMimeTypes.has(String(photo.mimeType || '').toLowerCase()),
  );
}

export function teacherProfilePhotoVersion(applicationData) {
  let application = applicationData;
  if (typeof applicationData === 'string') {
    try { application = JSON.parse(applicationData); } catch { return ''; }
  }
  const photo = application?.documents?.profilePhoto;
  if (!hasTeacherProfilePhoto(application) || typeof photo.publicId !== 'string') return '';
  return crypto.createHash('sha256').update(photo.publicId).digest('hex').slice(0, 24);
}

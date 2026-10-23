import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';
import { HttpError } from './middleware.js';

export const MAX_TEACHER_UPLOAD_BYTES = 5 * 1024 * 1024;
export const TEACHER_TERMS_VERSION = 'teacher-terms-v1';

export const teacherRegistrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TEACHER_UPLOAD_BYTES, files: 2, fields: 1, fieldSize: 200 * 1024, parts: 3 },
}).fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'qualificationProof', maxCount: 1 },
]);

export function parseTeacherApplication(req, _res, next) {
  try {
    const serialized = req.body?.application;
    if (typeof serialized !== 'string') throw new HttpError(400, 'The registration details could not be read. Please review and retry.');
    const application = JSON.parse(serialized);
    if (!application || typeof application !== 'object' || Array.isArray(application)) throw new Error('invalid application');
    req.body = application;
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(400, 'The registration details could not be read. Please review and retry.'));
  }
}

function safeOriginalName(file) {
  return String(file.originalname || 'document').split(/[\\/]/).at(-1).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'document';
}

export async function validateTeacherRegistrationFiles(req, _res, next) {
  try {
    const profilePhoto = req.files?.profilePhoto?.[0];
    const qualificationProof = req.files?.qualificationProof?.[0];
    const missing = {};
    if (!profilePhoto) missing.profilePhoto = 'A professional profile photo is required.';
    if (!qualificationProof) missing.qualificationProof = 'Highest educational qualification proof is required.';
    if (Object.keys(missing).length) throw new HttpError(422, 'Upload both required documents to continue.', missing, 'UPLOAD_REQUIRED');
    if (profilePhoto.size > MAX_TEACHER_UPLOAD_BYTES || qualificationProof.size > MAX_TEACHER_UPLOAD_BYTES) {
      throw new HttpError(413, 'Each uploaded file must be 5 MB or smaller.', undefined, 'FILE_TOO_LARGE');
    }

    const profileType = await fileTypeFromBuffer(profilePhoto.buffer);
    if (!profileType || !['image/jpeg', 'image/png'].includes(profileType.mime)) {
      throw new HttpError(415, 'Profile photo must be a valid JPG or PNG image.', { profilePhoto: 'Choose a valid JPG or PNG image.' }, 'UNSUPPORTED_FILE');
    }
    let dimensions;
    try { dimensions = imageSize(profilePhoto.buffer); } catch { dimensions = null; }
    if (!dimensions?.width || !dimensions?.height || dimensions.width > 6000 || dimensions.height > 6000 || dimensions.width * dimensions.height > 25_000_000) {
      throw new HttpError(422, 'The profile photo dimensions are invalid.', { profilePhoto: 'Choose a readable image no larger than 25 megapixels.' }, 'INVALID_IMAGE');
    }

    const proofType = await fileTypeFromBuffer(qualificationProof.buffer);
    if (!proofType || !['application/pdf', 'image/jpeg', 'image/png'].includes(proofType.mime)) {
      throw new HttpError(415, 'Qualification proof must be a valid PDF, JPG, JPEG, or PNG file.', { qualificationProof: 'Choose a valid PDF, JPG, or PNG file.' }, 'UNSUPPORTED_FILE');
    }
    req.validatedTeacherFiles = {
      profilePhoto: { file: profilePhoto, mime: profileType.mime, format: profileType.ext, width: dimensions.width, height: dimensions.height, originalName: safeOriginalName(profilePhoto) },
      qualificationProof: { file: qualificationProof, mime: proofType.mime, format: proofType.ext, originalName: safeOriginalName(qualificationProof) },
    };
    next();
  } catch (error) { next(error); }
}

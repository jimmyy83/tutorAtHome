import crypto from 'node:crypto';

const stages = new Set([
  'rate_limit', 'storage_configuration', 'multipart_parse', 'application_parse', 'honeypot',
  'field_configuration', 'schema_validation', 'terms_validation', 'location_validation',
  'file_validation', 'duplicate_check', 'profile_photo_upload', 'qualification_proof_upload',
  'aadhaar_document_upload', 'database_commit', 'database_commit_verification', 'asset_cleanup', 'request',
]);
const parentEnquiryStages = new Set([
  'rate_limit', 'honeypot', 'field_configuration', 'schema_validation', 'education_validation',
  'idempotency_lookup', 'sequence_allocation', 'rate_limit_reservation', 'idempotency_write', 'enquiry_write', 'transaction_commit', 'response',
]);

export function attachRequestId(req, res, next) {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

export function markTeacherRegistrationStage(stage) {
  const safeStage = stages.has(stage) ? stage : 'request';
  return (req, _res, next) => {
    req.teacherRegistrationStage = safeStage;
    next();
  };
}

export function setTeacherRegistrationStage(req, stage) {
  req.teacherRegistrationStage = stages.has(stage) ? stage : 'request';
}

export function markParentEnquiryStage(stage) {
  const safeStage = parentEnquiryStages.has(stage) ? stage : 'request';
  return (req, _res, next) => {
    req.parentEnquiryStage = safeStage;
    next();
  };
}

export function setParentEnquiryStage(req, stage) {
  req.parentEnquiryStage = parentEnquiryStages.has(stage) ? stage : 'response';
}

export function parentEnquiryFailureLog({ requestId, stage, status, error }) {
  let category = 'request_rejected';
  if (status === 429) category = 'rate_limited';
  else if (error?.code === 11000) category = 'duplicate_key_conflict';
  else if (status === 409) category = 'duplicate_or_idempotency_conflict';
  else if (stage === 'idempotency_lookup' || stage === 'idempotency_write') category = 'idempotency_storage_failure';
  else if (stage === 'rate_limit_reservation') category = status === 429 ? 'rate_limited' : 'rate_limit_storage_failure';
  else if (['sequence_allocation', 'enquiry_write', 'transaction_commit'].includes(stage)) category = 'database_transaction_failure';
  else if (error?.name === 'TypeError' || error?.name === 'ReferenceError') category = 'application_runtime_error';
  else if (status === 422 || status === 400 || status === 413) category = 'validation_rejected';
  else if (status >= 500) category = 'internal_failure';
  return {
    event: 'parent_enquiry_failed',
    requestId: typeof requestId === 'string' ? requestId : 'unavailable',
    stage: parentEnquiryStages.has(stage) ? stage : 'request',
    status: Number.isInteger(status) ? status : 500,
    category,
  };
}

export function logParentEnquiryFailure(context, logger = console.error) {
  logger(JSON.stringify(parentEnquiryFailureLog(context)));
}

export function teacherRegistrationFailureLog({ requestId, stage, status, error }) {
  let category = 'request_rejected';
  if (status === 429) category = 'rate_limited';
  else if (error?.name === 'MulterError') category = 'multipart_rejected';
  else if (error?.code === 11000) category = 'duplicate_record';
  else if (stage === 'asset_cleanup') category = 'asset_cleanup_incomplete';
  else if (stage?.endsWith('_upload')) category = 'file_storage_failure';
  else if (stage === 'database_commit_verification') category = 'database_write_unconfirmed';
  else if (stage === 'database_commit' && status >= 500) category = 'database_write_failure';
  else if (status === 409) category = 'submission_conflict';
  else if (status === 422 || status === 400 || status === 413 || status === 415) category = 'validation_rejected';
  else if (status === 503) category = 'service_unavailable';
  else if (status >= 500) category = 'internal_failure';
  const entry = {
    event: 'teacher_registration_failed',
    requestId: typeof requestId === 'string' ? requestId : 'unavailable',
    stage: stages.has(stage) ? stage : 'request',
    status: Number.isInteger(status) ? status : 500,
    category,
  };
  if (stage?.endsWith('_upload')) {
    const providerError = error?.cause || error;
    const networkCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE']);
    const providerStatus = [providerError?.http_code, providerError?.statusCode, providerError?.status]
      .find(value => Number.isInteger(value) && value >= 100 && value <= 599);
    if (providerError?.code === 'CLOUDINARY_METADATA_INCOMPLETE') entry.failureReason = 'incomplete_upload_metadata';
    else if (providerError?.code === 'CLOUDINARY_FORMAT_MISMATCH') entry.failureReason = 'provider_metadata_mismatch';
    else if (networkCodes.has(providerError?.code)) {
      entry.failureReason = 'provider_network_failure';
    } else if (providerStatus === 401 || providerStatus === 403) entry.failureReason = 'provider_authentication_rejected';
    else if (providerStatus === 429) entry.failureReason = 'provider_rate_limited';
    else if (providerStatus && providerStatus >= 400 && providerStatus < 500) entry.failureReason = 'provider_request_rejected';
    else if (providerStatus && providerStatus >= 500) entry.failureReason = 'provider_server_failure';
    else entry.failureReason = 'provider_upload_failure';
    // A numeric HTTP status is safe and helps correlate production provider
    // failures. Provider codes remain development-only and allowlisted.
    if (providerStatus) entry.providerStatus = providerStatus;
    if (process.env.NODE_ENV !== 'production') {
      if (providerCodeSafe(networkCodes, providerError?.code)) entry.providerCode = providerError.code;
    }
  }
  return entry;
}

function providerCodeSafe(allowedCodes, value) { return typeof value === 'string' && allowedCodes.has(value); }

export function logTeacherRegistrationFailure(context, logger = console.error) {
  logger(JSON.stringify(teacherRegistrationFailureLog(context)));
}

// Resolve uncertain transaction acknowledgements before deleting any uploaded
// assets. A failed read-back is treated as unknown, never as proof of absence.
export async function commitTeacherRecordOrConfirm({ write, readBack }) {
  try {
    await write();
    return { persisted: true, safeToCleanAssets: false };
  } catch (error) {
    try {
      if (await readBack()) return { persisted: true, recoveredAfterAmbiguousCommit: true, safeToCleanAssets: false };
      return { persisted: false, error, safeToCleanAssets: true };
    } catch {
      return { persisted: false, error, safeToCleanAssets: false };
    }
  }
}

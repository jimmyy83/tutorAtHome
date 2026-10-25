import crypto from 'node:crypto';
import { col, now, withDbTransaction } from './db.js';
import { HttpError } from './middleware.js';
import { config } from './config.js';

export const LEGACY_TEACHER_TERMS_ID = 'teacher-terms-v1';
export const INITIAL_TEACHER_TERMS = [
  "First month\u2019s fee collected in advance; 50% retained as service charge.",
  'From second month, tutor collects fees directly from parent.',
  'Bypassing TutorAtHome assignments leads to blacklisting.',
  'No payment for mid-month tutor withdrawal; proportionate payment if parent discontinues.',
  'Assignments based on availability, feedback, performance; one at a time.',
];
const adminIdentity = admin => ({ id: admin.sub ?? admin.id ?? null, name: admin.name || '', email: admin.email || '' });

export async function initializeTeacherTerms() {
  const timestamp = now();
  await col('teacher_terms_versions').updateOne({ id: LEGACY_TEACHER_TERMS_ID }, { $setOnInsert: {
    id: LEGACY_TEACHER_TERMS_ID, version_number: 1, content: INITIAL_TEACHER_TERMS,
    status: 'published', created_at: timestamp, published_at: timestamp, published_by: null,
    change_summary: 'Initial published version migrated from the existing teacher registration terms.', base_version_id: null,
  } }, { upsert: true });
  const state = await col('teacher_terms_state').findOne({ id: 1 });
  if (!state?.current_version_id) {
    await col('teacher_terms_state').updateOne({ id: 1 }, {
      $set: { current_version_id: LEGACY_TEACHER_TERMS_ID },
      $setOnInsert: { id: 1 },
    }, { upsert: true });
  }
  const initializedState = await col('teacher_terms_state').findOne({ id: 1 });
  const defaults = {};
  if (!Object.hasOwn(initializedState || {}, 'draft_version_id')) defaults.draft_version_id = null;
  if (!Number.isInteger(initializedState?.revision)) defaults.revision = 1;
  if (Object.keys(defaults).length) await col('teacher_terms_state').updateOne({ id: 1 }, { $set: defaults });
}

export async function currentTeacherTerms() {
  const state = await col('teacher_terms_state').findOne({ id: 1 });
  if (!state?.current_version_id) return null;
  const version = await col('teacher_terms_versions').findOne({ id: state.current_version_id, status: 'published' });
  if (!version) return null;
  return {
    versionId: version.id, versionNumber: version.version_number, content: version.content,
    publishedAt: version.published_at, lastUpdatedAt: version.published_at, maxUploadSizeMb: config.teacherUploadMaxMb,
  };
}

export function validateCurrentTeacherTerms(req, _res, next) {
  currentTeacherTerms().then(terms => {
    if (!terms) return next(new HttpError(503, 'Published terms are temporarily unavailable.'));
    if (req.body?.termsVersionId !== terms.versionId) return next(new HttpError(409, 'The Terms & Conditions have changed. Review and accept the latest version before submitting.', { termsVersionId: 'Review the current terms and accept them before resubmitting.' }, 'TERMS_VERSION_STALE'));
    req.currentTeacherTerms = terms;
    next();
  }).catch(next);
}

export async function saveTeacherTermsDraft(input, admin) {
  return withDbTransaction(async session => {
    const state = await col('teacher_terms_state').findOne({ id: 1 }, { session });
    if (!state || state.revision !== input.expectedRevision || state.current_version_id !== input.expectedCurrentVersionId) {
      throw new HttpError(409, 'Terms changed while you were editing. Reload the latest version before saving.', undefined, 'TERMS_EDIT_CONFLICT');
    }
    const current = await col('teacher_terms_versions').findOne({ id: state.current_version_id, status: 'published' }, { session });
    if (!current) throw new HttpError(503, 'Published terms are temporarily unavailable.');
    const timestamp = now(), identity = adminIdentity(admin);
    let draft;
    if (state.draft_version_id) {
      draft = await col('teacher_terms_versions').findOne({ id: state.draft_version_id, status: 'draft', base_version_id: current.id }, { session });
      if (!draft) throw new HttpError(409, 'The saved terms draft is out of date. Reload the latest version.', undefined, 'TERMS_EDIT_CONFLICT');
      await col('teacher_terms_versions').updateOne({ id: draft.id, status: 'draft' }, { $set: {
        content: input.content, change_summary: input.changeSummary, updated_at: timestamp, updated_by: identity,
      } }, { session });
    } else {
      const latest = await col('teacher_terms_versions').find({}, { session, projection: { version_number: 1 } }).sort({ version_number: -1 }).limit(1).next();
      const versionNumber = (latest?.version_number || current.version_number) + 1;
      draft = { id: `teacher-terms-v${versionNumber}-${crypto.randomUUID().slice(0, 8)}`, version_number: versionNumber,
        content: input.content, status: 'draft', created_at: timestamp, published_at: null, published_by: null,
        updated_at: timestamp, updated_by: identity, change_summary: input.changeSummary, base_version_id: current.id };
      await col('teacher_terms_versions').insertOne(draft, { session });
      const changed = await col('teacher_terms_state').updateOne({ id: 1, revision: input.expectedRevision, current_version_id: current.id, draft_version_id: { $in: [null] } }, {
        $set: { draft_version_id: draft.id }, $inc: { revision: 1 },
      }, { session });
      if (!changed.matchedCount) throw new HttpError(409, 'Another admin saved terms while you were editing. Reload the latest version.', undefined, 'TERMS_EDIT_CONFLICT');
      return { id: draft.id, versionNumber, revision: input.expectedRevision + 1 };
    }
    const changed = await col('teacher_terms_state').updateOne({ id: 1, revision: input.expectedRevision, current_version_id: current.id, draft_version_id: draft.id }, { $inc: { revision: 1 } }, { session });
    if (!changed.matchedCount) throw new HttpError(409, 'Another admin saved terms while you were editing. Reload the latest version.', undefined, 'TERMS_EDIT_CONFLICT');
    return { id: draft.id, versionNumber: draft.version_number, revision: input.expectedRevision + 1 };
  });
}

export async function publishTeacherTerms(input, admin) {
  return withDbTransaction(async session => {
    const state = await col('teacher_terms_state').findOne({ id: 1 }, { session });
    if (!state || state.revision !== input.expectedRevision || state.current_version_id !== input.expectedCurrentVersionId || state.draft_version_id !== input.expectedDraftVersionId) {
      throw new HttpError(409, 'Terms changed while you were reviewing. Reload before publishing.', undefined, 'TERMS_EDIT_CONFLICT');
    }
    const draft = await col('teacher_terms_versions').findOne({ id: state.draft_version_id, status: 'draft', base_version_id: state.current_version_id }, { session });
    if (!draft) throw new HttpError(409, 'Save a current terms draft before publishing.', undefined, 'TERMS_EDIT_CONFLICT');
    const publishedAt = now(), publisher = adminIdentity(admin);
    const published = await col('teacher_terms_versions').updateOne({ id: draft.id, status: 'draft' }, { $set: { status: 'published', published_at: publishedAt, updated_at: publishedAt, published_by: publisher, updated_by: publisher } }, { session });
    if (!published.matchedCount) throw new HttpError(409, 'This terms draft has already changed. Reload the terms history.', undefined, 'TERMS_EDIT_CONFLICT');
    const changed = await col('teacher_terms_state').updateOne({ id: 1, revision: input.expectedRevision, current_version_id: state.current_version_id, draft_version_id: draft.id }, {
      $set: { current_version_id: draft.id, draft_version_id: null }, $inc: { revision: 1 },
    }, { session });
    if (!changed.matchedCount) throw new HttpError(409, 'Another admin published terms first. Reload the latest version.', undefined, 'TERMS_EDIT_CONFLICT');
    return { versionId: draft.id, versionNumber: draft.version_number, publishedAt, publishedBy: publisher, revision: input.expectedRevision + 1 };
  });
}

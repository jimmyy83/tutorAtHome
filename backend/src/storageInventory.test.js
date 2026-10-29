import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCloudinaryReferenceIndex, classifyCloudinaryAsset } from './storageInventory.js';
import { reportedCloudinaryStorageBytes } from './cloudinary.js';

test('matches private teacher document references without returning document details', () => {
  const references = buildCloudinaryReferenceIndex({
    teachers: [{ data: JSON.stringify({ documents: { aadhaar: { publicId: 'tutorathome/private/teacher-applications/aadhaar/a1' } } }) }],
  });
  assert.deepEqual(classifyCloudinaryAsset({ public_id: 'tutorathome/private/teacher-applications/aadhaar/a1' }, references), {
    classification: 'referenced', ownership: 'application_database_reference', referenceCategories: ['teachers'],
  });
});

test('classifies app-namespace assets without references as candidates, never verified orphans', () => {
  const result = classifyCloudinaryAsset({ public_id: 'tutorathome/teachers/photo-1' }, buildCloudinaryReferenceIndex({}));
  assert.equal(result.classification, 'candidate_unreferenced');
  assert.equal(result.ownership, 'tutorathome_namespace');
});

test('classifies unmatched assets outside the app namespace as ownership unknown', () => {
  const result = classifyCloudinaryAsset({ public_id: 'shared-account/asset-1' }, buildCloudinaryReferenceIndex({}));
  assert.equal(result.classification, 'ownership_unknown');
  assert.equal(result.ownership, 'unknown');
});

test('keeps provider storage unavailable when provider metrics are missing or invalid', () => {
  assert.equal(reportedCloudinaryStorageBytes(null), null);
  assert.equal(reportedCloudinaryStorageBytes({ storage: { usage: 'unknown' } }), null);
});

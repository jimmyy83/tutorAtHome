import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import initSqlJs from 'sql.js';
import { v2 as cloudinary } from 'cloudinary';

const testUri = process.env.MONGODB_TEST_URI;
const testDatabase = process.env.MONGODB_TEST_DATABASE || '';

function png(width = 256, height = 256) {
  const crc32 = buffer => { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (name, data) => { const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([type, data]))); return Buffer.concat([length, type, data, checksum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const scanline = Buffer.alloc(width * 4 + 1), rows = Buffer.alloc(scanline.length * height); for (let y = 0; y < height; y++) scanline.copy(rows, y * scanline.length);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const validPdf = Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF');

test('MongoDB CRUD, auth, and public/admin API integration', { skip: !testUri }, async () => {
  assert.match(testDatabase, /^tutorathome_test_[a-z0-9_]+$/i, 'MONGODB_TEST_DATABASE must be a dedicated tutorathome_test_* database');
  process.env.MONGODB_URI = testUri;
  process.env.MONGODB_DB_NAME = testDatabase;
  process.env.JWT_SECRET = 'integration-test-secret-with-more-than-32-characters';
  process.env.ADMIN_EMAIL = 'integration-admin@example.test';
  process.env.ADMIN_PASSWORD = 'OnlyForThisIsolatedTestDb!234';
  process.env.NODE_ENV = 'test';
  process.env.CORS_ORIGINS = 'http://localhost:5173,https://tutor-at-home.vercel.app';
  process.env.CLOUDINARY_ENABLED = 'true';
  process.env.CLOUDINARY_CLOUD_NAME = 'tutorathome-test';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  process.env.FORM_RATE_LIMIT_MAX = '100';
  const { connectDb, getDb, closeDb, col } = await import('./db.js');
  const { bootstrap, app } = await import('./server.js');
  const originalUploadStream = cloudinary.uploader.upload_stream, originalDestroy = cloudinary.uploader.destroy, originalFetch = globalThis.fetch;
  let uploadCalls = 0, failOnUpload = null;
  const deletedPrivateAssets = [];
  cloudinary.uploader.upload_stream = (options, callback) => ({ end(buffer) {
    uploadCalls++;
    if (uploadCalls === failOnUpload) { callback(new Error('test storage failure')); return; }
    callback(null, { public_id: `${options.folder}/${options.public_id}`, secure_url: `https://res.cloudinary.com/tutorathome-test/image/upload/${options.folder}/${options.public_id}`, format: options.resource_type === 'raw' ? 'pdf' : 'png', bytes: buffer.length });
  } });
  cloudinary.uploader.destroy = async (publicId, options) => { deletedPrivateAssets.push({ publicId, ...options }); return { result: 'ok' }; };
  globalThis.fetch = (input, options) => {
    const url = String(input);
    if (!url.includes('cloudinary.com')) return originalFetch(input, options);
    const publicId = new URL(url).searchParams.get('public_id') || '';
    const body = publicId.includes('qualification-proofs') || publicId.includes('identity-documents') ? validPdf : png();
    return Promise.resolve(new Response(Buffer.from(body), { status: 200, headers: { 'content-length': String(body.length) } }));
  };
  let server, connected = false;
  try {
    await connectDb();
    connected = true;
    await getDb().dropDatabase();
    // dropDatabase removes indexes too; reconnecting recreates the application indexes.
    await closeDb(); connected = false; await connectDb(); connected = true; await bootstrap();
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const origin of ['http://localhost:5173', 'https://tutor-at-home.vercel.app']) {
      const preflight = await fetch(`${base}/api/admin/auth/login`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    }
    const untrustedPreflight = await fetch(`${base}/api/admin/auth/login`, { method: 'OPTIONS', headers: { origin: 'https://untrusted.example', 'access-control-request-method': 'POST' } });
    assert.equal(untrustedPreflight.headers.get('access-control-allow-origin'), null);
    await col('teachers').insertMany([
      { id: 9101, reference: 'TCH-TEST-FEATURED', status: 'approved', full_name: 'Featured Public Tutor', email: 'private@example.test', phone: '9000000001', featured: 1, featured_order: 1, public_name: 'Featured Public Tutor', public_location: 'Naini', location_state_id: 'up-test', location_district_id: 'prayagraj-test', location_locality_id: 'naini-test', public_photo: 'https://example.test/tutor.jpg', public_photo_id: 'tutorathome/teachers/test-photo', public_subjects: '["Mathematics"]', public_levels: '["10"]', data: JSON.stringify({ academics: { graduation: { degree: 'M.Sc.' } } }) },
      { id: 9102, reference: 'TCH-TEST-APPROVED', status: 'approved', full_name: 'Approved Public Tutor', email: 'private2@example.test', phone: '9000000002', featured: 0, featured_order: 0, public_name: 'Approved Public Tutor', public_location: 'Lucknow', public_photo: '', location_state_id: 'up-test', location_district_id: 'lucknow-test', location_locality_id: 'hazratganj-test', public_subjects: '["Science"]', public_levels: '["9"]', data: JSON.stringify({ personal: { address: 'Private test address' }, academics: { graduation: { degree: 'B.Tech.' }, postgraduation: { degree: 'M.Tech.' } }, documents: { profilePhoto: { publicId: 'tutorathome/private/teacher-applications/profile-photos/private-test-photo', format: 'png', mimeType: 'image/png', originalName: 'teacher.png' }, qualificationProof: { publicId: 'private-proof-id' } } }) },
      { id: 9103, reference: 'TCH-TEST-PENDING', status: 'pending', full_name: 'Pending Private Tutor', email: 'private3@example.test', phone: '9000000003', featured: 1, featured_order: 0, public_name: 'Pending Private Tutor', public_location: 'Naini', public_photo: 'https://example.test/pending-photo.jpg', location_state_id: 'up-test', location_district_id: 'prayagraj-test', location_locality_id: 'naini-test', public_subjects: '["Science"]', public_levels: '["9"]', data: JSON.stringify({ academics: { graduation: { degree: 'B.A.' } } }) },
      { id: 9104, reference: 'TCH-TEST-UNASSIGNED', status: 'approved', full_name: 'Unassigned Public Tutor', email: 'private4@example.test', phone: '9000000004', featured: 0, featured_order: 0, public_name: 'Unassigned Public Tutor', public_location: 'Unlisted', public_photo: '', public_subjects: '["Science"]', public_levels: '["9"]' },
      { id: 9105, reference: 'TCH-TEST-SAME-LOCALITY-OTHER-DISTRICT', status: 'approved', full_name: 'Other District Tutor', email: 'private5@example.test', phone: '9000000005', featured: 0, featured_order: 0, public_name: 'Other District Tutor', public_location: 'Naini', public_photo: '', location_state_id: 'up-test', location_district_id: 'jhunsi-test', location_locality_id: 'naini-test', public_subjects: '["Mathematics"]', public_levels: '["10"]' },
      { id: 9106, reference: 'TCH-TEST-NO-QUALIFICATION', status: 'approved', full_name: 'Missing Qualification Tutor', email: 'private6@example.test', phone: '9000000006', featured: 1, public_name: 'Missing Qualification Tutor', public_location: 'Naini', public_photo: 'https://example.test/no-qualification.jpg', location_state_id: 'up-test', location_district_id: 'prayagraj-test', location_locality_id: 'naini-test', public_subjects: '[]', public_levels: '[]', data: JSON.stringify({ academics: { graduation: { degree: '' } } }) },
      { id: 9107, reference: 'TCH-TEST-NO-PHOTO', status: 'approved', full_name: 'Missing Photo Tutor', email: 'private7@example.test', phone: '9000000007', featured: 1, public_name: 'Missing Photo Tutor', public_location: 'Naini', location_state_id: 'up-test', location_district_id: 'prayagraj-test', location_locality_id: 'naini-test', public_subjects: '[]', public_levels: '[]', data: JSON.stringify({ academics: { graduation: { degree: 'B.A.' } } }) },
    ]);
    await col('media').insertOne({ id: 9199, public_id: 'tutorathome/teachers/test-photo', secure_url: 'https://res.cloudinary.com/tutorathome-test/image/upload/tutorathome/teachers/test-photo', folder: 'tutorathome/teachers' });
    const unconfiguredLocationsResponse = await fetch(`${base}/api/public/locations`), unconfiguredLocationsBody = await unconfiguredLocationsResponse.json();
    assert.deepEqual(unconfiguredLocationsBody.items, []);
    const unconfiguredTeachersResponse = await fetch(`${base}/api/public/teachers?featured=false`), unconfiguredTeachersBody = await unconfiguredTeachersResponse.json();
    assert.deepEqual(unconfiguredTeachersBody.items, []);
    assert.equal(unconfiguredTeachersBody.total, 0);
    await col('settings').updateOne({ id: 1 }, { $set: { data: JSON.stringify({ ...JSON.parse((await col('settings').findOne({ id: 1 })).data), locationCatalog: { states: [
      { id: 'up-test', name: 'Uttar Pradesh', active: true, districts: [{ id: 'prayagraj-test', name: 'Prayagraj', active: true, localities: [{ id: 'naini-test', name: 'Naini', active: true, publiclyServiceable: true }, { id: 'inactive-test', name: 'Inactive locality', active: true, publiclyServiceable: false }] }, { id: 'jhunsi-test', name: 'Jhunsi', active: true, localities: [{ id: 'naini-test', name: 'Naini', active: true, publiclyServiceable: true }] }, { id: 'lucknow-test', name: 'Lucknow', active: true, localities: [{ id: 'hazratganj-test', name: 'Hazratganj', active: true, publiclyServiceable: true }] }] },
      { id: 'inactive-state-test', name: 'Inactive state', active: false, districts: [] },
    ] } }) } });
    const locationResponse = await fetch(`${base}/api/public/locations`), locationBody = await locationResponse.json();
    assert.equal(locationResponse.status, 200); assert.equal(locationBody.items.length, 1); assert.equal(locationBody.items[0].name, 'Uttar Pradesh');
    assert.deepEqual(locationBody.items[0].districts[0].localities.map(item => item.name), ['Naini']);
    const registrationLocations = await fetch(`${base}/api/public/locations?audience=teacher-registration`), registrationLocationsBody = await registrationLocations.json();
    assert.deepEqual(registrationLocationsBody.items[0].districts[0].localities.map(item => item.name), ['Naini', 'Inactive locality']);
    const stateSearch = await fetch(`${base}/api/public/teachers?featured=false&stateId=up-test`), stateSearchBody = await stateSearch.json();
    assert.deepEqual(new Set(stateSearchBody.items.map(item => item.id)), new Set([9101, 9102, 9106, 9107]));
    const districtSearch = await fetch(`${base}/api/public/teachers?featured=false&stateId=up-test&districtId=prayagraj-test`), districtSearchBody = await districtSearch.json();
    assert.deepEqual(new Set(districtSearchBody.items.map(item => item.id)), new Set([9101, 9106, 9107]));
    const sameLocalityOtherDistrict = await fetch(`${base}/api/public/teachers?featured=false&stateId=up-test&districtId=jhunsi-test&localityId=naini-test`), sameLocalityOtherDistrictBody = await sameLocalityOtherDistrict.json();
    assert.deepEqual(sameLocalityOtherDistrictBody.items.map(item => item.id), [9105]);
    const subjectSearch = await fetch(`${base}/api/public/teachers?featured=false&subject=Science`), subjectSearchBody = await subjectSearch.json();
    assert.deepEqual(subjectSearchBody.items.map(item => item.id), [9102]);
    const combinedLocationResponse = await fetch(`${base}/api/public/teachers?featured=false&stateId=up-test&districtId=prayagraj-test&localityId=naini-test&subject=Mathematics`), combinedLocationBody = await combinedLocationResponse.json();
    assert.deepEqual(combinedLocationBody.items.map(item => item.id), [9101]);
    const invalidLocationResponse = await fetch(`${base}/api/public/teachers?featured=false&stateId=up-test&districtId=wrong&localityId=naini-test`);
    assert.equal(invalidLocationResponse.status, 422);
    const featuredResponse = await fetch(`${base}/api/public/teachers?limit=48`), featuredBody = await featuredResponse.json();
    assert.equal(featuredResponse.status, 200);
    assert.deepEqual(featuredBody.items.map(t => t.id), [9101]);
    assert.equal(featuredBody.items[0].qualification, 'M.Sc.');
    assert.match(featuredBody.items[0].photoUrl, /res\.cloudinary\.com\/tutorathome-test\/image\/upload\/.*tutorathome\/teachers\/test-photo/);
    assert.match(featuredBody.items[0].photoUrl, /c_fill.*f_auto.*q_auto/);
    assert.equal('phone' in featuredBody.items[0], false); assert.equal('email' in featuredBody.items[0], false); assert.equal('data' in featuredBody.items[0], false); assert.equal('personal' in featuredBody.items[0], false); assert.equal('documents' in featuredBody.items[0], false);
    const publicTeachersResponse = await fetch(`${base}/api/public/teachers?featured=false&limit=48`), publicTeachersBody = await publicTeachersResponse.json();
    assert.equal(publicTeachersResponse.status, 200);
    assert.deepEqual(new Set(publicTeachersBody.items.map(t => t.id)), new Set([9101, 9102, 9106, 9107]));
    const searchPublicResponse = await fetch(`${base}/api/public/teachers?featured=false&search=Lucknow&limit=48`), searchPublicBody = await searchPublicResponse.json();
    assert.deepEqual(searchPublicBody.items.map(t => t.id), [9102]);
    const siteResponse = await fetch(`${base}/api/public/site`);
    assert.equal(siteResponse.status, 200);
    assert.ok(siteResponse.headers.get('content-type').includes('application/json'));
    assert.equal('locationCatalog' in (await siteResponse.clone().json()).settings, false);
    const publicTermsResponse = await fetch(`${base}/api/public/terms`), publicTerms = await publicTermsResponse.json();
    assert.equal(publicTermsResponse.status, 200);
    assert.equal(publicTerms.versionId, 'teacher-terms-v1');
    assert.equal(publicTerms.versionNumber, 1);
    assert.equal(publicTerms.maxUploadSizeMb, 5);
    assert.deepEqual(publicTerms.content, [
      "First month’s fee collected in advance; 50% retained as service charge.",
      'From second month, tutor collects fees directly from parent.',
      'Bypassing TutorAtHome assignments leads to blacklisting.',
      'No payment for mid-month tutor withdrawal; proportionate payment if parent discontinues.',
      'Assignments based on availability, feedback, performance; one at a time.',
    ]);
    assert.ok(Number.isFinite(Date.parse(publicTerms.publishedAt)));
    assert.equal('publishedBy' in publicTerms, false);

    const enquiryResponse = await fetch(`${base}/api/public/parent-enquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      parentName: 'Integration Parent', phone: '9876543210', studentName: 'Student', studentClass: '10', board: 'CBSE',
      subjects: ['Mathematics'], examPreparations: [], city: 'Prayagraj', locality: 'Naini', mode: 'home', homeAddress: 'Private test address', pincode: '211008', latitude: 25.995, longitude: 80.0, preferredDays: [], notes: 'Test record', website: '',
    }) });
    assert.equal(enquiryResponse.status, 201);
    const enquiry = await enquiryResponse.json();
    assert.match(enquiry.reference, /^ENQ-/);
    assert.equal(await col('enquiries').countDocuments({ reference: enquiry.reference }), 1);
    const savedEnquiry = await col('enquiries').findOne({ reference: enquiry.reference });
    const savedEnquiryData = JSON.parse(savedEnquiry.data);
    assert.equal('website' in savedEnquiryData, false);
    assert.deepEqual([savedEnquiryData.latitude, savedEnquiryData.longitude], [25.995, 80]);
    const honeypotResponse = await fetch(`${base}/api/public/parent-enquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      parentName: 'Bot submission', phone: '9876543210', studentName: 'Student', studentClass: '10', board: 'CBSE',
      subjects: ['Mathematics'], examPreparations: [], city: 'Prayagraj', mode: 'online', preferredDays: [], website: 'https://spam.example',
    }) });
    assert.equal(honeypotResponse.status, 400);
    assert.equal(await col('enquiries').countDocuments({}), 1);

    const teacherPayload = {
      website: '',
      personal: { fullName: 'Integration Teacher', gender: 'Other', dob: '1990-01-01', phone: '+919876543211', email: 'teacher-integration@example.test', address: 'Private test address', pincode: '211001', ownVehicle: false },
      location: { stateId: 'up-test', districtId: 'prayagraj-test', localityId: 'naini-test', locality: 'Naini' },
      academics: { class10: { board: 'CBSE', year: 2006, score: '80%' }, class12: { board: 'CBSE', year: 2008, score: '80%' }, graduation: { degree: 'BA', university: 'Test University', year: 2011, score: '80%' }, certifications: [] },
      teaching: { classes: ['10'], subjects: ['Mathematics'], medium: 'English', experienceYears: 5, previousInstitutions: '', preferredAreas: '', homeTuition: true, commute: 'Vehicle' },
      availability: { days: ['Monday'], timeSlots: ['Evening'], teachingStyle: '', freeDemo: false, references: '' },
      fees: { minMonthly: 1000, maxMonthly: 2000, paymentModes: ['UPI'] }, termsVersionId: 'teacher-terms-v1', termsAccepted: true,
    };
    const teacherForm = (application = teacherPayload, { photo = png(), proof = validPdf, aadhaar = validPdf, includePhoto = true, includeProof = true, includeAadhaar = true } = {}) => {
      const form = new FormData(); form.append('application', JSON.stringify(application));
      if (includePhoto) form.append('profilePhoto', new Blob([photo], { type: 'image/png' }), 'professional-photo.png');
      if (includeProof) form.append('qualificationProof', new Blob([proof], { type: 'application/pdf' }), 'degree-proof.pdf');
      if (includeAadhaar) form.append('aadhaarDocument', new Blob([aadhaar], { type: 'application/pdf' }), 'private-aadhaar.pdf');
      return form;
    };
    const invalidTeacherLocation = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, personal: { ...teacherPayload.personal, email: 'invalid-location@example.test', phone: '+919876543218' }, location: { ...teacherPayload.location, districtId: 'wrong-district' } }) });
    assert.equal(invalidTeacherLocation.status, 422);
    assert.equal(await col('teachers').countDocuments({ email: 'invalid-location@example.test' }), 0);
    const teacherResponse = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm() });
    assert.equal(teacherResponse.status, 201);
    const teacher = await teacherResponse.json();
    assert.match(teacher.reference, /^TCH-/);
    const savedTeacher = await col('teachers').findOne({ reference: teacher.reference });
    assert.ok(savedTeacher);
    const savedApplication = JSON.parse(savedTeacher.data);
    assert.deepEqual(savedApplication.location, { stateId: 'up-test', state: 'Uttar Pradesh', districtId: 'prayagraj-test', district: 'Prayagraj', localityId: 'naini-test', locality: 'Naini' });
    assert.equal('website' in savedApplication, false);
    assert.equal(savedApplication.documents.profilePhoto.resourceType, 'image');
    assert.equal(savedApplication.documents.profilePhoto.mimeType, 'image/png');
    assert.equal(savedApplication.documents.qualificationProof.resourceType, 'raw');
    assert.equal(savedApplication.documents.qualificationProof.mimeType, 'application/pdf');
    assert.equal('secure_url' in savedApplication.documents.qualificationProof, false);
    assert.equal(savedApplication.documents.aadhaarDocument.resourceType, 'raw');
    assert.equal(savedApplication.documents.aadhaarDocument.mimeType, 'application/pdf');
    assert.equal('secure_url' in savedApplication.documents.aadhaarDocument, false);
    assert.equal('originalName' in savedApplication.documents.aadhaarDocument, false);
    assert.deepEqual(savedApplication.termsConsent.accepted, true);
    assert.ok(Number.isFinite(Date.parse(savedApplication.termsConsent.acceptedAt)));
    assert.equal(savedApplication.termsConsent.version, 'teacher-terms-v1');
    assert.equal(savedApplication.termsConsent.versionId, 'teacher-terms-v1');
    assert.equal(savedApplication.termsConsent.versionNumber, 1);

    const teacherCountAfterSuccess = await col('teachers').countDocuments({});
    const missingPhoto = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, personal: { ...teacherPayload.personal, email: 'missing-photo@example.test', phone: '+919876543212' } }, { includePhoto: false }) });
    assert.equal(missingPhoto.status, 422);
    const missingProof = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, personal: { ...teacherPayload.personal, email: 'missing-proof@example.test', phone: '+919876543213' } }, { includeProof: false }) });
    assert.equal(missingProof.status, 422);
    const missingAadhaar = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, personal: { ...teacherPayload.personal, email: 'missing-aadhaar@example.test', phone: '+919876543219' } }, { includeAadhaar: false }) });
    assert.equal(missingAadhaar.status, 422);
    const invalidAadhaar = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, personal: { ...teacherPayload.personal, email: 'invalid-aadhaar@example.test', phone: '+919876543220' } }, { aadhaar: Buffer.from('not a pdf') }) });
    assert.equal(invalidAadhaar.status, 415);
    const oversizedAadhaar = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, personal: { ...teacherPayload.personal, email: 'oversized-aadhaar@example.test', phone: '+919876543221' } }, { aadhaar: Buffer.alloc(5 * 1024 * 1024 + 1) }) });
    assert.equal(oversizedAadhaar.status, 413);
    const invalidTerms = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, termsAccepted: false, personal: { ...teacherPayload.personal, email: 'terms-rejected@example.test', phone: '+919876543214' } }) });
    assert.equal(invalidTerms.status, 422);
    const invalidFile = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, personal: { ...teacherPayload.personal, email: 'invalid-file@example.test', phone: '+919876543215' } }, { photo: Buffer.from('not a real image') }) });
    assert.equal(invalidFile.status, 415);
    const oversized = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, personal: { ...teacherPayload.personal, email: 'oversized-file@example.test', phone: '+919876543216' } }, { proof: Buffer.alloc(5 * 1024 * 1024 + 1) }) });
    assert.equal(oversized.status, 413);
    assert.equal(await col('teachers').countDocuments({}), teacherCountAfterSuccess);

    failOnUpload = uploadCalls + 3;
    const storageFailure = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, personal: { ...teacherPayload.personal, email: 'storage-failure@example.test', phone: '+919876543217' } }) });
    failOnUpload = null;
    assert.equal(storageFailure.status, 502);
    assert.equal(await col('teachers').countDocuments({}), teacherCountAfterSuccess);
    assert.ok(deletedPrivateAssets.some(asset => asset.type === 'authenticated' && asset.resource_type === 'image'));

    const duplicateTeacherResponse = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm() });
    assert.equal(duplicateTeacherResponse.status, 409);
    assert.equal(await col('teachers').countDocuments({ reference: teacher.reference }), 1);

    const badLoginResponse = await fetch(`${base}/api/admin/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: 'incorrect-password' }) });
    assert.equal(badLoginResponse.status, 401);
    const wrongEmailResponse = await fetch(`${base}/api/admin/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'missing-admin@example.test', password: process.env.ADMIN_PASSWORD }) });
    assert.equal(wrongEmailResponse.status, 401);
    const storedAdmin = await col('admins').findOne({ email: process.env.ADMIN_EMAIL });
    assert.match(storedAdmin.password_hash, /^\$2[aby]\$/);
    assert.notEqual(storedAdmin.password_hash, process.env.ADMIN_PASSWORD);
    const loginResponse = await fetch(`${base}/api/admin/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ` ${process.env.ADMIN_EMAIL.toUpperCase()} `, password: process.env.ADMIN_PASSWORD }) });
    assert.equal(loginResponse.status, 200);
    const { token } = await loginResponse.json(); assert.ok(token);
    const publicFieldConfigResponse = await fetch(base + '/api/public/page-form-settings');
    assert.equal(publicFieldConfigResponse.status, 200);
    const publicFieldConfig = await publicFieldConfigResponse.json();
    assert.ok(publicFieldConfig.pages.findTutor.fields.parentName.visible);
    assert.ok(publicFieldConfig.pages.becomeTeacher.fields.personal.email.visible);
    assert.equal((await fetch(base + '/api/admin/page-form-settings')).status, 401);
    const { signToken } = await import('./middleware.js');
    const editorToken = signToken({ id: 987654, role: 'editor', name: 'Test editor', email: 'editor@example.test' });
    const protectedSettingsHeaders = { 'content-type': 'application/json' };
    assert.equal((await fetch(base + '/api/admin/leads/whatsapp', { method: 'PUT', headers: protectedSettingsHeaders, body: JSON.stringify({ whatsapp: '9876543210' }) })).status, 401);
    assert.equal((await fetch(base + '/api/admin/auth/password', { method: 'PUT', headers: protectedSettingsHeaders, body: JSON.stringify({ currentPassword: 'old', newPassword: 'Strong-new-password-123', confirmPassword: 'Strong-new-password-123' }) })).status, 401);
    assert.equal((await fetch(base + '/api/admin/leads/whatsapp', { method: 'PUT', headers: { ...protectedSettingsHeaders, authorization: 'Bearer ' + editorToken }, body: JSON.stringify({ whatsapp: '9876543210' }) })).status, 403);
    assert.equal((await fetch(base + '/api/admin/auth/password', { method: 'PUT', headers: { ...protectedSettingsHeaders, authorization: 'Bearer ' + editorToken }, body: JSON.stringify({ currentPassword: 'old', newPassword: 'Strong-new-password-123', confirmPassword: 'Strong-new-password-123' }) })).status, 403);
    const badLeadNumber = await fetch(base + '/api/admin/leads/whatsapp', { method: 'PUT', headers: { ...protectedSettingsHeaders, authorization: 'Bearer ' + token }, body: JSON.stringify({ whatsapp: 'invalid' }) });
    assert.equal(badLeadNumber.status, 422);
    const saveLeadNumber = await fetch(base + '/api/admin/leads/whatsapp', { method: 'PUT', headers: { ...protectedSettingsHeaders, authorization: 'Bearer ' + token }, body: JSON.stringify({ whatsapp: '+91 98765 43210' }) });
    assert.equal(saveLeadNumber.status, 200);
    assert.equal((await saveLeadNumber.json()).whatsapp, '919876543210');
    const currentLeadSettings = await (await fetch(base + '/api/admin/settings', { headers: { authorization: 'Bearer ' + token } })).json();
    assert.equal(currentLeadSettings.whatsapp, '919876543210');
    const publicSiteAfterLeadNumberUpdate = await (await fetch(base + '/api/public/site')).json();
    assert.equal(publicSiteAfterLeadNumberUpdate.settings.whatsapp, '919876543210');
    const badCurrentPassword = await fetch(base + '/api/admin/auth/password', { method: 'PUT', headers: { ...protectedSettingsHeaders, authorization: 'Bearer ' + token }, body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: 'Strong-new-password-123', confirmPassword: 'Strong-new-password-123' }) });
    assert.equal(badCurrentPassword.status, 401);
    assert.equal((await fetch(base + '/api/admin/page-form-settings', { headers: { authorization: 'Bearer ' + editorToken } })).status, 403);
    const formSettingsHeaders = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
    const formSettingsResponse = await fetch(base + '/api/admin/page-form-settings', { headers: formSettingsHeaders });
    assert.equal(formSettingsResponse.status, 200);
    const formSettings = await formSettingsResponse.json();
    const editedFieldSettings = structuredClone(formSettings.draft);
    editedFieldSettings.findTutor.fields.notes = { visible: false, required: false };
    const saveFieldDraft = await fetch(base + '/api/admin/page-form-settings/draft', { method: 'PUT', headers: formSettingsHeaders, body: JSON.stringify({ expectedRevision: formSettings.revision, expectedDraftRevision: formSettings.draftRevision, pages: editedFieldSettings }) });
    assert.equal(saveFieldDraft.status, 200);
    const savedFieldDraft = await saveFieldDraft.json();
    const staleFieldDraft = await fetch(base + '/api/admin/page-form-settings/draft', { method: 'PUT', headers: formSettingsHeaders, body: JSON.stringify({ expectedRevision: savedFieldDraft.revision, expectedDraftRevision: formSettings.draftRevision, pages: editedFieldSettings }) });
    assert.equal(staleFieldDraft.status, 409);
    const publishFieldSettings = await fetch(base + '/api/admin/page-form-settings/publish', { method: 'POST', headers: formSettingsHeaders, body: JSON.stringify({ expectedRevision: savedFieldDraft.revision, expectedDraftRevision: savedFieldDraft.draftRevision }) });
    assert.equal(publishFieldSettings.status, 200);
    const publishedFieldSettings = await publishFieldSettings.json();
    assert.equal(publishedFieldSettings.published.findTutor.fields.notes.visible, false);
    assert.equal(publishedFieldSettings.published.becomeTeacher.fields.personal.email.visible, true);
    assert.equal(await col('page_form_settings_history').countDocuments({ revision: publishedFieldSettings.revision }), 1);
    const forbiddenFieldSettings = structuredClone(publishedFieldSettings.draft);
    forbiddenFieldSettings.findTutor.fields.phone.visible = false;
    const protectedFieldDraft = await fetch(base + '/api/admin/page-form-settings/draft', { method: 'PUT', headers: formSettingsHeaders, body: JSON.stringify({ expectedRevision: publishedFieldSettings.revision, expectedDraftRevision: publishedFieldSettings.draftRevision, pages: forbiddenFieldSettings }) });
    assert.equal(protectedFieldDraft.status, 422);
    const noTermsAuth = await fetch(`${base}/api/admin/terms`);
    assert.equal(noTermsAuth.status, 401);
    const noTermsDraftAuth = await fetch(`${base}/api/admin/terms/draft`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: ['Unauthorized'], expectedRevision: 1, expectedCurrentVersionId: 'teacher-terms-v1' }) });
    assert.equal(noTermsDraftAuth.status, 401);
    const viewerToken = signToken({ id: 9999, role: 'viewer', name: 'Viewer', email: 'viewer@example.test' });
    const viewerTerms = await fetch(`${base}/api/admin/terms`, { headers: { authorization: `Bearer ${viewerToken}` } });
    assert.equal(viewerTerms.status, 403);
    const viewerTeacherDetails = await fetch(`${base}/api/admin/teachers/${savedTeacher.id}`, { headers: { authorization: `Bearer ${viewerToken}` } });
    assert.equal(viewerTeacherDetails.status, 403);
    const viewerAadhaar = await fetch(`${base}/api/admin/teachers/${savedTeacher.id}/documents/aadhaar-document`, { headers: { authorization: `Bearer ${viewerToken}` } });
    assert.equal(viewerAadhaar.status, 403);
    const adminTermsResponse = await fetch(`${base}/api/admin/terms`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(adminTermsResponse.status, 200);
    const adminTerms = await adminTermsResponse.json();
    assert.equal(adminTerms.current.id, 'teacher-terms-v1');
    const oldTerms = [...adminTerms.current.content];
    const draftTermsResponse = await fetch(`${base}/api/admin/terms/draft`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ content: [...oldTerms, 'Integration-test draft condition.'], changeSummary: 'Integration test', expectedRevision: adminTerms.revision, expectedCurrentVersionId: adminTerms.current.id }) });
    assert.equal(draftTermsResponse.status, 200);
    const draftTerms = await draftTermsResponse.json();
    const publicTermsBeforePublish = await (await fetch(`${base}/api/public/terms`)).json();
    assert.equal(publicTermsBeforePublish.versionId, 'teacher-terms-v1');
    const publishTermsResponse = await fetch(`${base}/api/admin/terms/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: draftTerms.revision, expectedCurrentVersionId: 'teacher-terms-v1', expectedDraftVersionId: draftTerms.id }) });
    assert.equal(publishTermsResponse.status, 200);
    const publishedTerms = await publishTermsResponse.json();
    assert.equal(publishedTerms.versionNumber, 2);
    assert.ok(Number.isFinite(Date.parse(publishedTerms.publishedAt)));
    assert.equal(publishedTerms.publishedBy.email, process.env.ADMIN_EMAIL);
    const currentTermsAfterPublish = await (await fetch(`${base}/api/public/terms`)).json();
    assert.equal(currentTermsAfterPublish.versionId, publishedTerms.versionId);
    assert.equal(currentTermsAfterPublish.content.at(-1), 'Integration-test draft condition.');
    assert.equal('publishedBy' in currentTermsAfterPublish, false);
    const oldVersionResponse = await fetch(`${base}/api/admin/terms/versions/teacher-terms-v1`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(oldVersionResponse.status, 200);
    assert.deepEqual((await oldVersionResponse.json()).content, oldTerms);
    const staleRegistrationResponse = await fetch(`${base}/api/public/teacher-registrations`, { method: 'POST', body: teacherForm({ ...teacherPayload, personal: { ...teacherPayload.personal, email: 'stale-terms@example.test', phone: '+919876543222' } }) });
    assert.equal(staleRegistrationResponse.status, 409);
    assert.equal(await col('teachers').countDocuments({ email: 'stale-terms@example.test' }), 0);
    const staleDraftResponse = await fetch(`${base}/api/admin/terms/draft`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ content: oldTerms, expectedRevision: adminTerms.revision, expectedCurrentVersionId: 'teacher-terms-v1' }) });
    assert.equal(staleDraftResponse.status, 409);
    const unauthorizedFeaturedToggle = await fetch(`${base}/api/admin/teachers/9102/featured`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ featured: true }) });
    assert.equal(unauthorizedFeaturedToggle.status, 401);
    const markFeatured = await fetch(`${base}/api/admin/teachers/9102/featured`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ featured: true }) });
    assert.equal(markFeatured.status, 200);
    const newlyFeaturedRecord = await col('teachers').findOne({ id: 9102 });
    assert.equal(newlyFeaturedRecord.featured, 1);
    assert.match(newlyFeaturedRecord.public_photo_id, /^tutorathome\/teachers\//);
    const copiedProfilePhotoId = newlyFeaturedRecord.public_photo_id;
    assert.ok(await col('media').findOne({ public_id: copiedProfilePhotoId }));
    const featuredAfterMarkResponse = await fetch(`${base}/api/public/teachers?limit=48`), featuredAfterMark = await featuredAfterMarkResponse.json();
    assert.deepEqual(new Set(featuredAfterMark.items.map(item => item.id)), new Set([9101, 9102]));
    const markedTeacherPublic = featuredAfterMark.items.find(item => item.id === 9102);
    assert.equal(markedTeacherPublic.qualification, 'M.Tech.');
    assert.equal('email' in markedTeacherPublic, false);
    const unmarkFeatured = await fetch(`${base}/api/admin/teachers/9102/featured`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ featured: false }) });
    assert.equal(unmarkFeatured.status, 200);
    assert.equal((await col('teachers').findOne({ id: 9102 })).featured, 0);
    assert.ok(await col('teachers').findOne({ id: 9102 }), 'unfeaturing must preserve the teacher record');
    assert.equal((await col('teachers').findOne({ id: 9102 })).public_photo_id, copiedProfilePhotoId, 'unfeaturing must retain the public profile photo');
    const pendingFeatured = await fetch(`${base}/api/admin/teachers/9103/featured`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ featured: true }) });
    assert.equal(pendingFeatured.status, 409);
    const unauthorizedProof = await fetch(`${base}/api/admin/teachers/${savedTeacher.id}/documents/qualification-proof`);
    assert.equal(unauthorizedProof.status, 401);
    const unauthorizedAadhaar = await fetch(`${base}/api/admin/teachers/${savedTeacher.id}/documents/aadhaar-document`);
    assert.equal(unauthorizedAadhaar.status, 401);
    const profileDocumentResponse = await fetch(`${base}/api/admin/teachers/${savedTeacher.id}/documents/profile-photo`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(profileDocumentResponse.status, 200);
    assert.equal(profileDocumentResponse.headers.get('content-type'), 'image/png');
    assert.match(profileDocumentResponse.headers.get('content-disposition') || '', /attachment/);
    assert.deepEqual(Buffer.from(await profileDocumentResponse.arrayBuffer()), png());
    const proofDocumentResponse = await fetch(`${base}/api/admin/teachers/${savedTeacher.id}/documents/qualification-proof`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(proofDocumentResponse.status, 200);
    assert.equal(proofDocumentResponse.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(Buffer.from(await proofDocumentResponse.arrayBuffer()), validPdf);
    const aadhaarDocumentResponse = await fetch(`${base}/api/admin/teachers/${savedTeacher.id}/documents/aadhaar-document`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(aadhaarDocumentResponse.status, 200);
    assert.equal(aadhaarDocumentResponse.headers.get('content-type'), 'application/pdf');
    assert.equal(aadhaarDocumentResponse.headers.get('cache-control'), 'private, no-store');
    assert.match(aadhaarDocumentResponse.headers.get('content-disposition') || '', /identity-verification\.pdf/);
    assert.doesNotMatch(aadhaarDocumentResponse.headers.get('content-disposition') || '', /private-aadhaar/);
    assert.deepEqual(Buffer.from(await aadhaarDocumentResponse.arrayBuffer()), validPdf);
    const settingsResponse = await fetch(`${base}/api/admin/settings`, { headers: { authorization: `Bearer ${token}` } });
    const editableSettings = await settingsResponse.json();
    editableSettings.locationCatalog.states[0].districts[0].localities.push({ id: 'admin-added-test', name: 'Admin Added Test Area', active: true, publiclyServiceable: true });
    const saveLocationsResponse = await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(editableSettings) });
    assert.equal(saveLocationsResponse.status, 200);
    const refreshedLocations = await fetch(`${base}/api/public/locations`), refreshedLocationBody = await refreshedLocations.json();
    assert.ok(refreshedLocationBody.items[0].districts[0].localities.some(item => item.id === 'admin-added-test'));
    const invalidImage = new FormData(); invalidImage.append('file', new Blob(['not an image'], { type: 'image/png' }), 'fake.png');
    const invalidUpload = await fetch(`${base}/api/admin/media?category=banners`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: invalidImage });
    assert.equal(invalidUpload.status, 415);
    const oversizedImage = new FormData(); oversizedImage.append('file', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
    const oversizedUpload = await fetch(`${base}/api/admin/media?category=banners`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: oversizedImage });
    assert.equal(oversizedUpload.status, 413);
    const me = await fetch(`${base}/api/admin/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
    const enquiryList = await fetch(`${base}/api/admin/enquiries`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(enquiryList.status, 200);
    assert.equal((await enquiryList.json()).total, 1);
    const privateEnquiryDetails = await fetch(`${base}/api/admin/enquiries/${savedEnquiry.id}`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(privateEnquiryDetails.status, 200);
    const privateEnquiryBody = await privateEnquiryDetails.json();
    assert.deepEqual([privateEnquiryBody.details.latitude, privateEnquiryBody.details.longitude], [25.995, 80]);
    const privateEnquiryWithoutAuth = await fetch(`${base}/api/admin/enquiries/${savedEnquiry.id}`);
    assert.equal(privateEnquiryWithoutAuth.status, 401);
    const invalidCity = await fetch(`${base}/api/public/parent-enquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      parentName: 'Invalid City', phone: '9876543210', studentName: 'Student', studentClass: '10', board: 'CBSE', subjects: ['Math'], city: 'Kanpur', mode: 'online',
    }) });
    assert.equal(invalidCity.status, 422);

    const adminRecord = await col('admins').findOne({ email: process.env.ADMIN_EMAIL });
    await col('admins').deleteOne({ id: adminRecord.id });
    const missingAdminResponse = await fetch(`${base}/api/admin/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
    assert.equal(missingAdminResponse.status, 401);
    await col('admins').insertOne(adminRecord);

    const SQL = await initSqlJs(), sqlite = new SQL.Database();
    sqlite.exec(`CREATE TABLE admins(id INTEGER PRIMARY KEY,email TEXT,name TEXT,password_hash TEXT,role TEXT,created_at TEXT);
      CREATE TABLE settings(id INTEGER PRIMARY KEY,data TEXT,updated_at TEXT);
      CREATE TABLE content(id INTEGER PRIMARY KEY,draft TEXT,published TEXT,draft_updated_at TEXT,published_at TEXT);
      CREATE TABLE revisions(id INTEGER PRIMARY KEY,snapshot TEXT,summary TEXT,editor_id INTEGER,editor_name TEXT,created_at TEXT);
      CREATE TABLE banners(id INTEGER PRIMARY KEY,title TEXT,message TEXT,image_url TEXT,cta_label TEXT,cta_url TEXT,starts_at TEXT,ends_at TEXT,enabled INTEGER,archived INTEGER,priority INTEGER,placement TEXT,theme TEXT,frequency TEXT,frequency_days INTEGER,version INTEGER,created_at TEXT,updated_at TEXT);
      CREATE TABLE media(id INTEGER PRIMARY KEY,filename TEXT,original_name TEXT,mime TEXT,size INTEGER,created_at TEXT);
      CREATE TABLE teachers(id INTEGER PRIMARY KEY,reference TEXT,status TEXT,data TEXT,full_name TEXT,email TEXT,phone TEXT,featured INTEGER,featured_order INTEGER,public_name TEXT,public_location TEXT,public_photo TEXT,public_subjects TEXT,public_levels TEXT,reviewed_by TEXT,reviewed_at TEXT,created_at TEXT);
      CREATE TABLE enquiries(id INTEGER PRIMARY KEY,reference TEXT,status TEXT,data TEXT,parent_name TEXT,phone TEXT,student_class TEXT,city TEXT,created_at TEXT,updated_at TEXT);
      CREATE TABLE enquiry_notes(id INTEGER PRIMARY KEY,enquiry_id INTEGER,note TEXT,author TEXT,kind TEXT,created_at TEXT);
      INSERT INTO settings VALUES (1,'{"socialLinks":[]}','2026-10-19T00:00:00.000Z');
      INSERT INTO enquiries VALUES (1,'ENQ-FIXTURE','new','{"homeAddress":"private-test-address"}','Parent','9876543210','10','Lucknow','2026-10-19T00:00:00.000Z',NULL);
      INSERT INTO enquiry_notes VALUES (1,1,'Fixture note','Admin','note','2026-10-19T00:00:00.000Z');`);
    const tempSqlite = path.join(os.tmpdir(), `tutorathome-migration-${process.pid}.sqlite`);
    try {
      fs.writeFileSync(tempSqlite, Buffer.from(sqlite.export()));
      const migrationDatabase = `${testDatabase}_migration`;
      const migration = spawnSync(process.execPath, ['src/migrate-sqlite-to-mongo.js', '--sqlite', tempSqlite], { encoding: 'utf8', env: { ...process.env, MONGODB_URI: testUri, MONGODB_DB_NAME: migrationDatabase } });
      assert.equal(migration.status, 0, migration.stderr || migration.stdout);
      assert.match(migration.stdout, /Migration verified/);
      assert.equal(migration.stdout.includes(testUri), false, 'migration output must not include credentials');
      const repeatedMigration = spawnSync(process.execPath, ['src/migrate-sqlite-to-mongo.js', '--sqlite', tempSqlite], { encoding: 'utf8', env: { ...process.env, MONGODB_URI: testUri, MONGODB_DB_NAME: migrationDatabase } });
      assert.equal(repeatedMigration.status, 0, repeatedMigration.stderr || repeatedMigration.stdout);
      assert.match(repeatedMigration.stdout, /already-identical=1/);
      const { MongoClient } = await import('mongodb');
      const migrationClient = new MongoClient(testUri, { serverSelectionTimeoutMS: 10000 });
      try {
        await migrationClient.connect();
        const migrated = migrationClient.db(migrationDatabase);
        assert.equal(await migrated.collection('settings').countDocuments({ id: 1 }), 1);
        assert.equal(await migrated.collection('enquiries').countDocuments({ id: 1 }), 1);
        assert.equal(await migrated.collection('enquiry_notes').countDocuments({ enquiry_id: 1 }), 1);
        await migrated.collection('settings').updateOne({ id: 1 }, { $set: { data: '{"editedInDestination":true}' } });
        const guardedMigration = spawnSync(process.execPath, ['src/migrate-sqlite-to-mongo.js', '--sqlite', tempSqlite], { encoding: 'utf8', env: { ...process.env, MONGODB_URI: testUri, MONGODB_DB_NAME: migrationDatabase } });
        assert.notEqual(guardedMigration.status, 0, 'migration must refuse to overwrite a differing destination record');
        assert.match(guardedMigration.stderr, /refusing overwrite/);
        assert.equal((await migrated.collection('settings').findOne({ id: 1 })).data, '{"editedInDestination":true}');
      } finally { await migrationClient.db(migrationDatabase).dropDatabase(); await migrationClient.close(); }
    } finally { sqlite.close(); fs.rmSync(tempSqlite, { force: true }); }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (connected) { await getDb().dropDatabase(); await closeDb(); }
    cloudinary.uploader.upload_stream = originalUploadStream;
    cloudinary.uploader.destroy = originalDestroy;
    globalThis.fetch = originalFetch;
  }
});


import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import initSqlJs from 'sql.js';

const testUri = process.env.MONGODB_TEST_URI;
const testDatabase = process.env.MONGODB_TEST_DATABASE || '';

test('MongoDB CRUD, auth, and public/admin API integration', { skip: !testUri }, async () => {
  assert.match(testDatabase, /^tutorathome_test_[a-z0-9_]+$/i, 'MONGODB_TEST_DATABASE must be a dedicated tutorathome_test_* database');
  process.env.MONGODB_URI = testUri;
  process.env.MONGODB_DB_NAME = testDatabase;
  process.env.JWT_SECRET = 'integration-test-secret-with-more-than-32-characters';
  process.env.ADMIN_EMAIL = 'integration-admin@example.test';
  process.env.ADMIN_PASSWORD = 'OnlyForThisIsolatedTestDb!234';
  process.env.NODE_ENV = 'test';
  process.env.CLOUDINARY_ENABLED = 'true';
  process.env.CLOUDINARY_CLOUD_NAME = 'tutorathome-test';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  const { connectDb, getDb, closeDb, col } = await import('./db.js');
  const { bootstrap, app } = await import('./server.js');
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
    await col('teachers').insertMany([
      { id: 9101, reference: 'TCH-TEST-FEATURED', status: 'approved', full_name: 'Featured Public Tutor', email: 'private@example.test', phone: '9000000001', featured: 1, featured_order: 1, public_name: 'Featured Public Tutor', public_location: 'Naini', location_state_id: 'up-test', location_district_id: 'prayagraj-test', location_locality_id: 'naini-test', public_photo: 'https://example.test/tutor.jpg', public_photo_id: 'tutorathome/teachers/test-photo', public_subjects: '["Mathematics"]', public_levels: '["10"]' },
      { id: 9102, reference: 'TCH-TEST-APPROVED', status: 'approved', full_name: 'Approved Public Tutor', email: 'private2@example.test', phone: '9000000002', featured: 0, featured_order: 0, public_name: 'Approved Public Tutor', public_location: 'Lucknow', public_photo: '', public_subjects: '["Science"]', public_levels: '["9"]' },
      { id: 9103, reference: 'TCH-TEST-PENDING', status: 'pending', full_name: 'Pending Private Tutor', email: 'private3@example.test', phone: '9000000003', featured: 1, featured_order: 0, public_name: 'Pending Private Tutor', public_location: 'Lucknow', public_photo: '', public_subjects: '["Science"]', public_levels: '["9"]' },
    ]);
    await col('media').insertOne({ id: 9199, public_id: 'tutorathome/teachers/test-photo', secure_url: 'https://res.cloudinary.com/tutorathome-test/image/upload/tutorathome/teachers/test-photo', folder: 'tutorathome/teachers' });
    await col('settings').updateOne({ id: 1 }, { $set: { data: JSON.stringify({ ...JSON.parse((await col('settings').findOne({ id: 1 })).data), locationCatalog: { states: [
      { id: 'up-test', name: 'Uttar Pradesh', active: true, districts: [{ id: 'prayagraj-test', name: 'Prayagraj', active: true, localities: [{ id: 'naini-test', name: 'Naini', active: true, publiclyServiceable: true }, { id: 'inactive-test', name: 'Inactive locality', active: true, publiclyServiceable: false }] }] },
      { id: 'inactive-state-test', name: 'Inactive state', active: false, districts: [] },
    ] } }) } });
    const locationResponse = await fetch(`${base}/api/public/locations`), locationBody = await locationResponse.json();
    assert.equal(locationResponse.status, 200); assert.equal(locationBody.items.length, 1); assert.equal(locationBody.items[0].name, 'Uttar Pradesh');
    assert.deepEqual(locationBody.items[0].districts[0].localities.map(item => item.name), ['Naini']);
    const combinedLocationResponse = await fetch(`${base}/api/public/teachers?featured=false&stateId=up-test&districtId=prayagraj-test&localityId=naini-test&subject=Mathematics`), combinedLocationBody = await combinedLocationResponse.json();
    assert.deepEqual(combinedLocationBody.items.map(item => item.id), [9101]);
    const invalidLocationResponse = await fetch(`${base}/api/public/teachers?featured=false&stateId=up-test&districtId=wrong&localityId=naini-test`);
    assert.equal(invalidLocationResponse.status, 422);
    const featuredResponse = await fetch(`${base}/api/public/teachers?limit=48`), featuredBody = await featuredResponse.json();
    assert.equal(featuredResponse.status, 200);
    assert.deepEqual(featuredBody.items.map(t => t.id), [9101]);
    assert.match(featuredBody.items[0].photoUrl, /res\.cloudinary\.com\/tutorathome-test\/image\/upload\/.*tutorathome\/teachers\/test-photo/);
    assert.match(featuredBody.items[0].photoUrl, /c_fill.*f_auto.*q_auto/);
    assert.equal('phone' in featuredBody.items[0], false); assert.equal('email' in featuredBody.items[0], false);
    const publicTeachersResponse = await fetch(`${base}/api/public/teachers?featured=false&limit=48`), publicTeachersBody = await publicTeachersResponse.json();
    assert.equal(publicTeachersResponse.status, 200);
    assert.deepEqual(new Set(publicTeachersBody.items.map(t => t.id)), new Set([9101, 9102]));
    const searchPublicResponse = await fetch(`${base}/api/public/teachers?featured=false&search=Lucknow&limit=48`), searchPublicBody = await searchPublicResponse.json();
    assert.deepEqual(searchPublicBody.items.map(t => t.id), [9102]);
    const siteResponse = await fetch(`${base}/api/public/site`);
    assert.equal(siteResponse.status, 200);
    assert.ok(siteResponse.headers.get('content-type').includes('application/json'));
    assert.equal('locationCatalog' in (await siteResponse.clone().json()).settings, false);

    const enquiryResponse = await fetch(`${base}/api/public/parent-enquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      parentName: 'Integration Parent', phone: '9876543210', studentName: 'Student', studentClass: '10', board: 'CBSE',
      subjects: ['Mathematics'], examPreparations: [], city: 'Prayagraj', mode: 'online', preferredDays: [], notes: 'Test record',
    }) });
    assert.equal(enquiryResponse.status, 201);
    const enquiry = await enquiryResponse.json();
    assert.match(enquiry.reference, /^ENQ-/);
    assert.equal(await col('enquiries').countDocuments({ reference: enquiry.reference }), 1);

    const loginResponse = await fetch(`${base}/api/admin/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
    assert.equal(loginResponse.status, 200);
    const { token } = await loginResponse.json(); assert.ok(token);
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
    const invalidCity = await fetch(`${base}/api/public/parent-enquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      parentName: 'Invalid City', phone: '9876543210', studentName: 'Student', studentClass: '10', board: 'CBSE', subjects: ['Math'], city: 'Kanpur', mode: 'online',
    }) });
    assert.equal(invalidCity.status, 422);

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
  }
});

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { duplicateTeacherIdentifierCounts, normalizeTeacherEmail, normalizeTeacherPhone } from './adminDataManagement.js';

const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required.');
  process.exit(1);
}
const client = new MongoClient(uri);
try {
  await client.connect();
  const db = process.env.MONGODB_DB_NAME ? client.db(process.env.MONGODB_DB_NAME) : client.db();
  const teachers = db.collection('teachers');
  const records = await teachers.find({}, { projection: { id: 1, email: 1, phone: 1, email_normalized: 1, phone_normalized: 1 } }).toArray();
  const duplicates = duplicateTeacherIdentifierCounts(records);
  console.log(`Teacher registration identifier audit: ${records.length} records; ${duplicates.duplicateEmailGroups} duplicate normalized email group(s); ${duplicates.duplicatePhoneGroups} duplicate normalized phone group(s).`);
  if (!apply) console.log('Read-only audit only. Run npm run migrate:teacher-identifiers only after reviewing duplicate counts and resolving any conflict without deleting or merging records.');
  else if (duplicates.duplicateEmailGroups || duplicates.duplicatePhoneGroups) {
    console.error('No identifiers were migrated. Resolve the reported duplicate groups manually; this tool does not print personal identifiers, delete records, or merge applications.');
    process.exitCode = 2;
  } else {
    for (const record of records) await teachers.updateOne({ id: record.id }, { $set: { email_normalized: normalizeTeacherEmail(record.email), phone_normalized: normalizeTeacherPhone(record.phone) } });
    await teachers.createIndex({ email_normalized: 1 }, { unique: true, sparse: true });
    await teachers.createIndex({ phone_normalized: 1 }, { unique: true, sparse: true });
    console.log('Normalized identifiers were backfilled and unique indexes verified. Existing teacher records were not deleted or merged.');
  }
} catch (error) {
  console.error('Teacher identifier audit failed. Check MongoDB connectivity and configuration; sensitive connection details were omitted.');
  process.exitCode = 1;
} finally { await client.close(); }

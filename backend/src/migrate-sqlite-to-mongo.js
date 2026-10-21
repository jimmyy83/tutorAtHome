// Idempotent SQLite -> MongoDB migration. Keeps the source file untouched.
import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { connectDb, closeDb, col, nextId } from './db.js';

const args = process.argv.slice(2), flagIndex = args.indexOf('--sqlite');
if (flagIndex < 0 || !args[flagIndex + 1]) {
  console.error('Usage: npm run migrate:sqlite -- --sqlite <path-to-tutorathome.db>'); process.exit(2);
}
const sqlitePath = path.resolve(args[flagIndex + 1]);
if (!fs.existsSync(sqlitePath)) { console.error(`SQLite source file not found: ${sqlitePath}`); process.exit(2); }
const tables = ['admins', 'settings', 'content', 'revisions', 'banners', 'media', 'teachers', 'enquiries', 'enquiry_notes'];
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(k => k !== '_id').sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
};
const failures = [];

try {
  const SQL = await initSqlJs();
  const source = new SQL.Database(new Uint8Array(fs.readFileSync(sqlitePath)));
  const query = (sql, params = []) => {
    const stmt = source.prepare(sql);
    try { stmt.bind(params); const rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); return rows; }
    finally { stmt.free(); }
  };
  const one = (sql, params = []) => query(sql, params)[0];
  await connectDb();
  for (const table of tables) {
    const present = one("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]);
    if (!present) { failures.push(`${table}: source table missing`); continue; }
    const rows = query(`SELECT * FROM "${table}"`);
    let inserted = 0, alreadySame = 0;
    for (const row of rows) {
      const doc = { ...row, id: row.id };
      const existing = await col(table).findOne({ id: doc.id });
      if (existing) {
        const { _id, ...withoutMongoId } = existing;
        if (canonical(withoutMongoId) !== canonical(doc)) failures.push(`${table} id=${doc.id}: destination record differs; refusing overwrite`);
        else alreadySame++;
      } else {
        try { await col(table).insertOne(doc); inserted++; }
        catch (error) { failures.push(`${table} id=${doc.id}: insert failed (${error.code || error.name})`); }
      }
    }
    const verified = await col(table).countDocuments({ id: { $in: rows.map(r => r.id) } });
    if (verified !== rows.length) failures.push(`${table}: expected ${rows.length} source IDs, found ${verified} in MongoDB`);
    if (rows.length && rows[0].id != null) {
      const max = Math.max(...rows.map(r => Number(r.id) || 0));
      if (max) await col('_counters').updateOne({ _id: table }, { $max: { seq: max } }, { upsert: true });
    }
    console.log(`${table}: source=${rows.length}, inserted=${inserted}, already-identical=${alreadySame}, verified=${verified}`);
  }
  const sourceOrphans = one('SELECT COUNT(*) n FROM enquiry_notes n LEFT JOIN enquiries e ON e.id=n.enquiry_id WHERE e.id IS NULL').n;
  const enquiryIds = new Set(await col('enquiries').distinct('id'));
  const targetOrphans = (await col('enquiry_notes').find({}, { projection: { enquiry_id: 1 } }).toArray()).filter(n => !enquiryIds.has(n.enquiry_id)).length;
  if (sourceOrphans !== targetOrphans) failures.push(`enquiry_notes relationship integrity mismatch: SQLite=${sourceOrphans}, MongoDB=${targetOrphans}`);
  if (failures.length) {
    console.error(`Migration NOT VERIFIED (${failures.length} issue(s)). SQLite source was left untouched.`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else console.log('Migration verified. SQLite source remains untouched; retain it until application review is complete.');
} catch (error) {
  console.error(`Migration failed: ${error.message}. SQLite source was left untouched.`); process.exitCode = 1;
} finally { await closeDb(); }

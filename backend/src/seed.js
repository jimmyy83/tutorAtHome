// Optional demo records. Development only; production seed data must be real.
import { bootstrap } from './server.js';
import { col, now, nextId, connectDb, closeDb } from './db.js';
import { config } from './config.js';
if (config.isProd) throw new Error('Refusing to seed demo data in production.');
await connectDb();
try {
  await bootstrap();
  const subj = [['Mathematics', 'Physics'], ['English', 'Hindi'], ['Chemistry', 'Biology'], ['Computer Science'], ['Economics', 'Commerce and Accountancy']];
  for (let i = 0; i < subj.length; i++) {
    const reference = `TCH-DEMO-${i}`;
    await col('teachers').updateOne({ reference }, { $setOnInsert: {
      id: await nextId('teachers'), reference, status: 'approved', data: '{}', full_name: `Demo Teacher ${i + 1}`,
      email: `demo${i}@example.com`, phone: `900000000${i}`, featured: 1, featured_order: i, public_name: `Demo Teacher ${i + 1}`,
      public_location: 'Kanpur', public_subjects: JSON.stringify(subj[i]), public_levels: JSON.stringify(['Class 9', 'Class 10']), created_at: now(),
    } }, { upsert: true });
  }
  console.log('Seeded demo teachers (DEV ONLY).');
} finally { await closeDb(); }

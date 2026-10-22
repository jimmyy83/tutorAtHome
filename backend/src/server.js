import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { col, now, nextId, connectDb, closeDb } from './db.js';
import { defaultSettings, defaultContent } from './defaults.js';
import { publicRouter } from './routes/public.js';
import { adminRouter, uploadDir } from './routes/admin.js';
import { notFound, errorHandler } from './middleware.js';

export async function bootstrap() {
  const settingsRow = await col('settings').findOne({ id: 1 });
  if (!settingsRow) await col('settings').insertOne({ id: 1, data: JSON.stringify(defaultSettings), updated_at: now() });
  else {
    let settings = {}; try { settings = JSON.parse(settingsRow.data || '{}'); } catch {}
    let settingsChanged = false;
    if (!settings.educationCatalog) { settings.educationCatalog = defaultSettings.educationCatalog; settingsChanged = true; }
    if (settings.whatsapp !== defaultSettings.whatsapp) { settings.whatsapp = defaultSettings.whatsapp; settingsChanged = true; }
    if (settingsChanged) await col('settings').updateOne({ id: 1 }, { $set: { data: JSON.stringify(settings), updated_at: now() } });
  }
  if (!await col('content').findOne({ id: 1 })) {
    const c = JSON.stringify(defaultContent); await col('content').insertOne({ id: 1, draft: c, published: c, draft_updated_at: now(), published_at: now() });
  }
  if (!await col('admins').findOne({})) {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      if (config.isProd) throw new Error('No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD in the backend environment to provision the first admin.');
    } else {
      if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters when provisioning the first admin.');
      await col('admins').insertOne({ id: await nextId('admins'), email: adminEmail, name: 'Administrator', password_hash: await bcrypt.hash(adminPassword, 12), role: 'admin', created_at: now() });
      console.log('Created initial admin account.');
    }
  }
}

export const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (o, cb) => cb(null, !o || config.corsOrigins.includes(o)), allowedHeaders: ['Content-Type', 'Authorization'], exposedHeaders: ['Retry-After'] }));
app.use(express.json({ limit: '200kb' }));
if (!config.isProd) app.use(morgan('dev'));
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', index: false }));
app.get('/api/health', (_r, res) => res.json({ ok: true, time: now() }));
app.use('/api/public', publicRouter);
app.use('/api/admin', adminRouter);
app.use(notFound);
app.use(errorHandler);

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  try {
    await connectDb(); await bootstrap();
    const server = app.listen(config.port, '0.0.0.0', () => console.log(`TutorAtHome API listening on ${config.port}`));
    const shutdown = async () => { server.close(); await closeDb(); process.exit(0); };
    process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error(`[startup] ${error.message}`); // MongoClient errors do not include the configured URI.
    process.exitCode = 1;
  }
}

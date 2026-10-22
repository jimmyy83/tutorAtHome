import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';

class ResetError extends Error {}

const isLoopbackMongoUri = (value) => {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

async function resetAdminPassword() {
  if (process.env.NODE_ENV === 'production') throw new ResetError('Refusing to reset an admin password in production.');
  if (process.env.NODE_ENV !== 'development') throw new ResetError('This reset is allowed only when NODE_ENV=development.');
  if (!process.argv.includes('--confirm')) throw new ResetError('Explicit confirmation required. Run npm run admin:reset-password -- --confirm.');

  const mongoUri = process.env.MONGODB_URI || '';
  const databaseName = process.env.MONGODB_DB_NAME || 'tutorathome';
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!mongoUri || !databaseName || !email || !password) throw new ResetError('MONGODB_URI, MONGODB_DB_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD must be configured in backend/.env.');
  if (!isLoopbackMongoUri(mongoUri) && !process.argv.includes('--allow-remote-development-db')) {
    throw new ResetError('Refusing to reset against a remote MongoDB host. Only add --allow-remote-development-db after confirming this is a development-only database, never production.');
  }
  if (password.length < 12) throw new ResetError('ADMIN_PASSWORD must be at least 12 characters.');

  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 7000, appName: 'TutorAtHome-Local-Admin-Reset' });
  try {
    await client.connect();
    const admins = client.db(databaseName).collection('admins');
    const admin = await admins.findOne({ email });
    if (!admin || admin.role !== 'admin') throw new ResetError('The configured email does not match an existing admin account. No account was changed.');

    if (admin.password_hash && await bcrypt.compare(password, admin.password_hash)) {
      console.log(`The configured password already matches admin ${admin.email}; no change was needed.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await admins.updateOne(
      { _id: admin._id, email, role: 'admin', password_hash: admin.password_hash },
      { $set: { password_hash: passwordHash } },
    );
    if (result.modifiedCount !== 1) throw new ResetError('The admin record changed during reset. No further changes were made; retry after reviewing the account.');

    const updatedAdmin = await admins.findOne({ _id: admin._id, email, role: 'admin' }, { projection: { password_hash: 1 } });
    if (!updatedAdmin?.password_hash || !await bcrypt.compare(password, updatedAdmin.password_hash)) {
      throw new ResetError('Password reset verification failed. Contact the database administrator before retrying.');
    }
    console.log(`Updated and verified the password hash for admin ${admin.email}.`);
  } catch (error) {
    if (error instanceof ResetError) throw error;
    throw new Error('Could not connect to or update the configured development MongoDB database. No connection details were logged.');
  } finally {
    await client.close().catch(() => {});
  }
}

await resetAdminPassword().catch((error) => {
  console.error(`[admin-reset] ${error.message}`);
  process.exitCode = 1;
});

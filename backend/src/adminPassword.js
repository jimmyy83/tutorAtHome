import bcrypt from 'bcryptjs';
import { HttpError } from './middleware.js';

export async function changeAdminPassword({ account, currentPassword, newPassword, updatePassword }) {
  if (!account || account.role !== 'admin') throw new HttpError(401, 'Admin account is unavailable.');
  const matches = await bcrypt.compare(currentPassword, account.password_hash || '');
  if (!matches) throw new HttpError(401, 'Current password is incorrect.');
  if (await bcrypt.compare(newPassword, account.password_hash)) throw new HttpError(422, 'Choose a password different from your current password.');
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const result = await updatePassword(account.id, account.password_hash, passwordHash);
  if (!result?.matchedCount) throw new HttpError(409, 'Password changed in another session. Sign in again and retry.');
  return { ok: true };
}

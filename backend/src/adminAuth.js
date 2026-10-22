import bcrypt from 'bcryptjs';

const dummyPasswordHash = '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali';
const allowedAdminRoles = new Set(['admin', 'editor']);

export async function authenticateAdmin(email, password, findAdmin) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const admin = normalizedEmail ? await findAdmin(normalizedEmail) : null;
  const passwordHash = typeof admin?.password_hash === 'string' ? admin.password_hash : dummyPasswordHash;
  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(password, passwordHash);
  } catch {
    passwordMatches = false;
  }
  return admin && allowedAdminRoles.has(admin.role) && passwordMatches ? admin : null;
}

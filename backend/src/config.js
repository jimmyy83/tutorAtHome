import 'dotenv/config';
const env = process.env;
const looksLikePlaceholder = (value) => /<[^>]+>|^(?:replace|your|placeholder|example)(?:[-_ .]|$)/i.test(String(value || '').trim());
export const config = {
  port: Number(env.PORT || 4000),
  isProd: env.NODE_ENV === 'production',
  corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
  publicApiUrl: (env.PUBLIC_API_URL || `http://localhost:${env.PORT || 4000}`).replace(/\/$/, ''),
  jwtSecret: env.JWT_SECRET || 'change-me',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
  dbPath: env.DB_PATH || './data/tutorathome.db',
  mongoUri: env.MONGODB_URI || '',
  mongoDbName: env.MONGODB_DB_NAME || 'tutorathome',
  captchaProvider: (env.CAPTCHA_PROVIDER || '').toLowerCase(),
  captchaSecret: env.CAPTCHA_SECRET || '',
  cloudinaryCloudName: env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: env.CLOUDINARY_API_SECRET || '',
  cloudinaryEnabled: env.CLOUDINARY_ENABLED ? env.CLOUDINARY_ENABLED === 'true' : (env.NODE_ENV === 'production' || Boolean(env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_SECRET)),
  formLimitMax: Number(env.FORM_RATE_LIMIT_MAX || 5),
  formLimitWindowMin: Number(env.FORM_RATE_LIMIT_WINDOW_MIN || 15),
};
if (config.isProd) {
  if (config.jwtSecret === 'change-me' || looksLikePlaceholder(config.jwtSecret) || config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to a private strong value (32+ chars) in production');
  if (!config.mongoUri) throw new Error('MONGODB_URI is required in production.');
  if (looksLikePlaceholder(config.mongoUri)) throw new Error('MONGODB_URI still contains an example placeholder. Set the protected Atlas connection string in production.');
  if (!['turnstile', 'recaptcha'].includes(config.captchaProvider) || !config.captchaSecret || looksLikePlaceholder(config.captchaSecret)) throw new Error('CAPTCHA_PROVIDER must be turnstile or recaptcha, and CAPTCHA_SECRET must be set in production');
  if ([env.ADMIN_EMAIL, env.ADMIN_PASSWORD].some(value => value && looksLikePlaceholder(value))) throw new Error('Replace placeholder ADMIN_EMAIL and ADMIN_PASSWORD values before production.');
  if (!env.CORS_ORIGINS?.trim()) throw new Error('CORS_ORIGINS must contain the deployed frontend origin in production.');
  for (const origin of config.corsOrigins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error('CORS_ORIGINS must contain exact HTTPS origins only in production.'); }
    if (parsed.protocol !== 'https:' || parsed.origin !== origin) throw new Error('CORS_ORIGINS must contain exact HTTPS origins only in production.');
  }
  if (!env.PUBLIC_API_URL?.trim()) throw new Error('PUBLIC_API_URL must be set to the public Render service origin in production.');
  let apiUrl;
  try { apiUrl = new URL(config.publicApiUrl); } catch { throw new Error('PUBLIC_API_URL must be a valid HTTPS origin in production.'); }
  if (apiUrl.protocol !== 'https:' || apiUrl.origin !== config.publicApiUrl || apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash) throw new Error('PUBLIC_API_URL must be a valid HTTPS origin without a path in production.');
}
if (env.CLOUDINARY_ENABLED !== undefined && !['true', 'false'].includes(env.CLOUDINARY_ENABLED.toLowerCase())) throw new Error('CLOUDINARY_ENABLED must be true or false.');
if (config.cloudinaryEnabled && (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret)) {
  throw new Error('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required when Cloudinary image uploads are enabled.');
}
if (config.isProd && config.cloudinaryEnabled && [config.cloudinaryCloudName, config.cloudinaryApiKey, config.cloudinaryApiSecret].some(looksLikePlaceholder)) {
  throw new Error('Replace Cloudinary example placeholders with the protected provider values before production.');
}
if (config.mongoUri && !/^mongodb(?:\+srv)?:\/\//i.test(config.mongoUri)) throw new Error('MONGODB_URI must use the mongodb:// or mongodb+srv:// scheme.');

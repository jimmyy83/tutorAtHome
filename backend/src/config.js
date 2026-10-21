import 'dotenv/config';
const env = process.env;
export const config = {
  port: Number(env.PORT || 4000),
  isProd: env.NODE_ENV === 'production',
  corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
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
  if (config.jwtSecret === 'change-me' || config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to a strong value (32+ chars) in production');
  if (!config.captchaProvider || !config.captchaSecret) throw new Error('CAPTCHA_PROVIDER and CAPTCHA_SECRET are required in production');
}
if (config.cloudinaryEnabled && (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret)) {
  throw new Error('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required when Cloudinary image uploads are enabled.');
}
if (config.mongoUri && !/^mongodb(?:\+srv)?:\/\//i.test(config.mongoUri)) throw new Error('MONGODB_URI must use the mongodb:// or mongodb+srv:// scheme.');

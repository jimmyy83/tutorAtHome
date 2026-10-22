import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, details, code) { super(message); this.status = status; this.details = details; this.code = code; }
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const validate = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) {
    const fields = {};
    for (const i of r.error.issues) fields[i.path.join('.') || '_'] = i.message;
    return next(new HttpError(422, 'Please check the highlighted fields.', fields));
  }
  req.body = r.data; next();
};

export const signToken = (admin) =>
  jwt.sign({ sub: admin.id, role: admin.role, name: admin.name, email: admin.email }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

export const requireAdmin = (roles) => (req, _res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Authentication required.'));
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
  } catch { return next(new HttpError(401, 'Session expired. Please sign in again.')); }
  if (roles && !roles.includes(req.admin.role)) return next(new HttpError(403, 'You do not have permission for this action.'));
  next();
};

const limiter = (max, windowMin, message) => rateLimit({
  windowMs: windowMin * 60 * 1000, max, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => {
    const retry = Math.ceil((req.rateLimit?.resetTime ? req.rateLimit.resetTime.getTime() - Date.now() : windowMin * 60000) / 1000);
    res.set('Retry-After', String(retry));
    res.status(429).json({ error: { code: 'RATE_LIMITED', message, retryAfterSeconds: retry } });
  },
});
export const formLimiter = limiter(config.formLimitMax, config.formLimitWindowMin, 'Too many submissions. Please try again later.');
export const loginLimiter = limiter(10, 15, 'Too many login attempts. Please try again later.');

// A hidden website field catches basic automated submissions; always remove it
// before schema validation so it cannot enter stored enquiry/application data.
export const rejectHoneypot = (req, _res, next) => {
  const value = req.body?.website;
  const filled = Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && String(value).trim() !== '';
  if (filled) return next(new HttpError(400, 'Please review your submission and try again.'));
  if (req.body && Object.hasOwn(req.body, 'website')) {
    const { website: _website, ...formData } = req.body;
    req.body = formData;
  }
  next();
};

export const notFound = (_req, _res, next) => next(new HttpError(404, 'Route not found.'));
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  const status = err.status || (err.name === 'MulterError' ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : 500);
  if (status >= 500) console.error('[error]', err.message);
  const safeMessage = err.name === 'MulterError'
    ? (err.code === 'LIMIT_FILE_SIZE' ? 'Images must be 5 MB or smaller.' : 'The image upload could not be processed.')
    : err instanceof HttpError ? err.message : status >= 500 ? 'Something went wrong on our side.' : err.message;
  res.status(status).json({ error: { code: err.code || err.details?.code || (status === 422 ? 'VALIDATION' : status === 401 ? 'UNAUTHORIZED' : 'ERROR'),
    message: safeMessage, fields: err.details } });
};
export { z };

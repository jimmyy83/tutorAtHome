# TutorAtHome backend

Node 20+ · Express 5 · MongoDB Node.js driver · JWT · Zod.

## Setup

1. `cp .env.example .env` and set `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `CORS_ORIGINS`. For image uploads, set `CLOUDINARY_ENABLED=true` and the three Cloudinary values in `.env`.
2. `npm install`
3. `npm start`

The API requires MongoDB at startup and exits with a configuration/connection error if it is unavailable. It never falls back to SQLite. MongoDB indexes are created on startup. Admin passwords continue to use bcrypt; admin sessions are signed JWTs and are not persisted in a separate session collection.

### Deliberate local admin password reset

To reset an existing local admin, set `NODE_ENV=development`, point `MONGODB_URI` at a loopback MongoDB server (`localhost`, `127.0.0.1`, or `::1`), set `MONGODB_DB_NAME`, set `ADMIN_EMAIL` to the existing admin email, and set `ADMIN_PASSWORD` to the new password (12+ characters). Then explicitly run `npm run admin:reset-password -- --confirm` from `backend`. The script updates only that existing admin's bcrypt hash, verifies the new hash, and never creates an account. It refuses production and all non-loopback MongoDB hosts. Normal server startup never resets passwords.

## Render deployment

The repository-root `render.yaml` defines the backend service with `NODE_ENV=production`, `npm ci`, `npm start`, and `/api/health`. Render supplies `PORT`; do not set a fixed `PORT` for the web service. The process binds to `0.0.0.0` and uses `process.env.PORT`, with port 4000 only as a local fallback.

Set the `sync: false` values in the Render dashboard. Do not paste real credentials into `render.yaml` or commit any `.env` file. `CORS_ORIGINS` must be the exact deployed Vercel origin(s), comma-separated when needed, with no path. `PUBLIC_API_URL` must be the Render service's HTTPS origin without `/api`; media URLs use this origin. The actual Vercel and Render URLs are intentionally placeholders in `.env.example` until deployment assigns them.

| Variable | Requirement |
| --- | --- |
| `PORT` | Render-managed; optional locally, where it defaults to 4000. |
| `NODE_ENV` | Set to `production` on Render. |
| `MONGODB_URI` | Required at startup; keep it in Render's protected environment. |
| `MONGODB_DB_NAME` | Optional; defaults to `tutorathome`. |
| `JWT_SECRET` | Required in production; at least 32 characters and privately generated. |
| `JWT_EXPIRES_IN` | Optional; defaults to `8h`. |
| `CORS_ORIGINS` | Required in production; exact HTTPS Vercel origin(s). |
| `PUBLIC_API_URL` | Required in production; HTTPS Render origin, no path. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Needed only to create the first admin when the database has no admin account. Password is bcrypt-hashed. |
| `CLOUDINARY_ENABLED` | Defaults to enabled in production; Render config sets it to `true`. If enabled, the three Cloudinary values below are required. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Required when Cloudinary uploads are enabled. Keep the API secret server-side only. |
| `FORM_RATE_LIMIT_MAX`, `FORM_RATE_LIMIT_WINDOW_MIN` | Optional; default to 5 public form requests per 15 minutes. Forms also include a server-checked honeypot field. |

On Vercel, set `VITE_API_BASE_URL` to `<Render HTTPS origin>/api`. Never add `JWT_SECRET`, `MONGODB_URI`, admin passwords, or Cloudinary API secrets to Vercel `VITE_` variables.

## Existing SQLite data migration

Do not delete the SQLite file or its backups. Set `MONGODB_URI` in the local backend environment, install dependencies, then run:

`npm run migrate:sqlite -- --sqlite ./data/tutorathome.db`

The migration opens SQLite read-only, imports each known collection using stable numeric IDs, skips byte-for-byte equivalent records on repeat runs, and refuses to overwrite differing records or continue silently past duplicate-key errors. It reports per-collection source/import/verification counts and checks enquiry-note references. Exit status is nonzero on any mismatch. Review the report and verify the application before archiving the SQLite database. The script never deletes or modifies the SQLite source.

To seed demo teachers during development only, run `npm run seed` with a configured MongoDB URI. Admin image uploads use signed server-side Cloudinary uploads. The API validates JPEG, PNG, and WebP file signatures, a 5 MB limit, and image dimensions before upload. In production Cloudinary uploads are enabled by default and all three credentials are required at startup; in development they are disabled unless `CLOUDINARY_ENABLED=true` is set. Cloudinary secrets belong only in the backend environment.

Teacher profile photos are edited from the admin Teachers tab. The owner photo is part of the existing homepage content editor and takes effect after publishing. Campaign images are managed in the Campaigns editor. Teacher and campaign references are updated before old Cloudinary media is considered for deletion; owner photos retained in content revisions remain available for restore.

Production requires a strong `JWT_SECRET` (32+ characters) and `MONGODB_URI`. Never commit `.env` or place database credentials in source code.

See [API.md](./API.md) for the HTTP contract.

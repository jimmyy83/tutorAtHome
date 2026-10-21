# TutorAtHome backend

Node 20+ · Express 5 · MongoDB Node.js driver · JWT · Zod.

## Setup

1. `cp .env.example .env` and set `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGINS`, and the CAPTCHA settings used by your deployment. For image uploads, set `CLOUDINARY_ENABLED=true` and the three Cloudinary values in `.env`.
2. `npm install`
3. `npm start`

The API requires MongoDB at startup and exits with a configuration/connection error if it is unavailable. It never falls back to SQLite. MongoDB indexes are created on startup. Admin passwords continue to use bcrypt; admin sessions are signed JWTs and are not persisted in a separate session collection.

## Existing SQLite data migration

Do not delete the SQLite file or its backups. Set `MONGODB_URI` in the local backend environment, install dependencies, then run:

`npm run migrate:sqlite -- --sqlite ./data/tutorathome.db`

The migration opens SQLite read-only, imports each known collection using stable numeric IDs, skips byte-for-byte equivalent records on repeat runs, and refuses to overwrite differing records or continue silently past duplicate-key errors. It reports per-collection source/import/verification counts and checks enquiry-note references. Exit status is nonzero on any mismatch. Review the report and verify the application before archiving the SQLite database. The script never deletes or modifies the SQLite source.

To seed demo teachers during development only, run `npm run seed` with a configured MongoDB URI. Admin image uploads use signed server-side Cloudinary uploads. The API validates JPEG, PNG, and WebP file signatures, a 5 MB limit, and image dimensions before upload. In production Cloudinary uploads are enabled by default and all three credentials are required at startup; in development they are disabled unless `CLOUDINARY_ENABLED=true` is set. Cloudinary secrets belong only in the backend environment.

Teacher profile photos are edited from the admin Teachers tab. The owner photo is part of the existing homepage content editor and takes effect after publishing. Campaign images are managed in the Campaigns editor. Teacher and campaign references are updated before old Cloudinary media is considered for deletion; owner photos retained in content revisions remain available for restore.

Production requires a strong `JWT_SECRET` (32+ characters), `MONGODB_URI`, and configured `CAPTCHA_PROVIDER`/`CAPTCHA_SECRET`. Never commit `.env` or place database credentials in source code.

See [API.md](./API.md) for the HTTP contract.

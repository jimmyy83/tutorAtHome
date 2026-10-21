# TutorAtHome API contract (v1)

Base URL: `http://localhost:4000/api` (frontend env: `VITE_API_BASE_URL`). JSON bodies unless noted.
Errors: `{ "error": { "code", "message", "fields?": { "path": "message" } } }`. Rate limit: **429** + `Retry-After` header + `retryAfterSeconds`.
CAPTCHA: send the token in header `X-Captcha-Token` (or body `captchaToken`) on public POSTs. Verified server-side.

## Public
| Method | Path | Notes |
|---|---|---|
| GET | /public/site | `{ settings, content (published), publishedAt, banners (active) }`. `settings.socialLinks` contains active links only, sorted by `order`, with public fields `id,platform,label,url,icon,placement,order`; timestamps and inactive links are omitted. |
| GET | /public/banners | Active, enabled, non-archived, in schedule, ordered by priority. `dismissKey` changes whenever the admin edits a banner. |
| GET | /public/teachers | Query: `search, subject, level, location, page, limit(max 48), featured=false`. Defaults to approved + featured; `featured=false` returns all approved teachers. Returns `id,name,location,photoUrl,subjects,levels` only. |
| POST | /public/parent-enquiries | CAPTCHA + rate limited. Accepts `studentClass`, `board`, optional `streamId` (required for Class 11–12), `subjects[]`, `examPreparations[]`, `city`, `locality`, `mode` and existing schedule/budget fields. Class, stream, subject and exam selections are checked against the active CMS education catalogue. A home-mode address is stored privately in the enquiry record; it is not returned through public APIs. `201 { reference }` |
| POST | /public/teacher-registrations | CAPTCHA + rate limited. `201 { reference }`; `409 DUPLICATE` for same email/phone. |

## Admin (`Authorization: Bearer <jwt>`)
Roles: `admin` (everything), `editor` (content, banners, media, featured teachers, enquiries; cannot approve teachers or change settings).
| Method | Path |
|---|---|
| POST / GET | /admin/auth/login · /admin/auth/me |
| GET | /admin/dashboard |
| GET / PUT | /admin/content · /admin/content/draft |
| POST | /admin/content/publish `{summary}` |
| GET | /admin/content/revisions · /admin/content/revisions/:id |
| POST | /admin/content/revisions/:id/restore (loads into draft; publish separately) |
| GET / PUT | /admin/settings (PUT: admin only). `socialLinks` is an optional array of up to 100 records: `{id (UUID), platform, label, url (absolute HTTPS only), icon (instagram/facebook/youtube/linkedin/x/whatsapp/globe/link), placement (footer/contact/both), order (0–1000), active}`. Existing IDs retain `createdAt`; the backend updates `updatedAt`. `educationCatalog` manages `educationLevels`, `streams`, `competitiveExams` and `subjectsByBoardClass`; inactive entries are hidden from public selections. |
| GET, POST, PUT, PATCH, DELETE | /admin/banners · /admin/banners/:id · /admin/banners/:id/archive |
| GET, POST, DELETE | /admin/media. POST uses multipart field `file` (max 5 MB; JPEG/PNG/WebP verified by file signature and dimensions) and optional `category=banners|admins`; returns an optimized source URL plus internal media ID. DELETE `?publicId=...` removes an uploaded Cloudinary asset only if no teacher, banner, current CMS content, or retained revision references it. Legacy local-media deletion also refuses in-use files. |
| POST, DELETE | /admin/teachers/:id/photo (editor role; multipart `file` for upload, or DELETE to remove the public photo). Replacement updates MongoDB after the upload succeeds and only then attempts safe cleanup of the old asset. |
| GET | /admin/teachers (`status, featured, search, page, limit`) · /admin/teachers/:id (full application) |
| PATCH | /admin/teachers/:id/status (admin only) · /admin/teachers/:id/featured (approved teachers only) |
| GET | /admin/enquiries (`status, search, page, limit`) · /admin/enquiries/:id |
| PATCH, POST | /admin/enquiries/:id (status) · /admin/enquiries/:id/notes |

## Not implemented server-side
- **WhatsApp delivery**: no WhatsApp Business API. The admin "WhatsApp" action is a `wa.me` link opened by a person.
- Email notifications, password reset, admin-user management UI.
- Popup dismissal/frequency is enforced in the browser (sessionStorage / localStorage keyed by `dismissKey`); the API only supplies the rules.

Cloudinary uploads require backend-only `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. Set `CLOUDINARY_ENABLED=true` to enable in development. Production enables uploads by default and fails startup if credentials are missing. No separate admin-profile photo feature exists; the existing public owner profile photo is managed in the CMS content editor. Public teacher, owner, and banner APIs return optimized image URLs and do not expose Cloudinary public IDs or credentials.

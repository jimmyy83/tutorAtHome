# TutorAtHome frontend

## Connect to the API

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to the backend API prefix. For local development this is `http://localhost:4000/api`. The backend defaults to port `4000` and allows the Vite origin `http://localhost:5173`.

Run the backend from `../backend` after creating its own `.env` from `backend/.env.example`. Keep `JWT_SECRET`, `CAPTCHA_SECRET`, and admin credentials on the server only. If CAPTCHA is enabled on the backend, set the matching public provider and site key in the frontend `.env`.

`VITE_ENABLE_MOCK_DATA=true` is an opt-in local preview for teacher cards only. Public enquiry and teacher application forms always submit to the configured API and display server errors instead of showing simulated success.

## Run

```powershell
npm install
npm run dev
```

The public API endpoints used by this frontend are `/public/site`, `/public/teachers`, `/public/banners`, `/public/parent-enquiries`, and `/public/teacher-registrations`, under the configured API base URL. Admin routes use the existing `/admin/*` API.

const e=import.meta.env;
export const env={apiBaseUrl:(e.VITE_API_BASE_URL||(e.PROD?'https://tutorathomed.onrender.com/api':'http://localhost:4000/api')).replace(/\/$/,''),appName:e.VITE_APP_NAME||'TutorAtHome',
 mockData:e.VITE_ENABLE_MOCK_DATA==='true'&&!e.PROD, // never mock in production
 captchaProvider:(e.VITE_CAPTCHA_PROVIDER||'').toLowerCase(),turnstileKey:e.VITE_TURNSTILE_SITE_KEY||'',captchaSiteKey:e.VITE_CAPTCHA_SITE_KEY||e.VITE_TURNSTILE_SITE_KEY||''};
if(!env.mockData&&!env.apiBaseUrl)console.error('[config] VITE_API_BASE_URL is missing. Set it in .env or enable VITE_ENABLE_MOCK_DATA for development.');

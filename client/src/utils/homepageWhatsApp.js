import {buildWhatsAppUrl} from './whatsapp.js';

export const HOMEPAGE_WHATSAPP_MESSAGE = 'Hi TutorAtHome, I would like to enquire about your tutoring services.';

export function shouldShowHomepageWhatsApp(pathname, scrollY) {
  return pathname === '/' && Number.isFinite(scrollY) && scrollY <= 2;
}

export function homepageWhatsAppUrl(recipient) {
  return buildWhatsAppUrl(recipient, HOMEPAGE_WHATSAPP_MESSAGE);
}

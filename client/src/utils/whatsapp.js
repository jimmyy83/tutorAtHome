export const DEFAULT_WHATSAPP_RECIPIENT = '919532761193';

export function normalizeWhatsAppRecipient(value) {
  if (typeof value !== 'string') return '';
  const input = value.trim();
  if (!input || !/^\+?[\d\s().-]+$/.test(input)) return '';
  let digits = input.replace(/\D/g, '');
  if (input.startsWith('00')) digits = digits.slice(2);
  if (/^[6-9]\d{9}$/.test(digits)) digits = `91${digits}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
}

export function resolveWhatsAppRecipient(configuredRecipient) {
  const normalized = normalizeWhatsAppRecipient(configuredRecipient);
  return normalized === DEFAULT_WHATSAPP_RECIPIENT ? normalized : DEFAULT_WHATSAPP_RECIPIENT;
}

export function buildWhatsAppUrl(recipient, message = 'Hello TutorAtHome, I would like to know more about your services.') {
  const number = resolveWhatsAppRecipient(recipient);
  if (typeof message !== 'string' || !message.trim()) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
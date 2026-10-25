export function normalizeWhatsAppNumber(value) {
  if (typeof value !== 'string') return '';
  const input = value.trim();
  if (!input || !/^\+?[0-9\s().-]+$/.test(input)) return '';
  let digits = input.replace(/\D/g, '');
  if (input.startsWith('00')) digits = digits.slice(2);
  if (/^[6-9]\d{9}$/.test(digits)) digits = `91${digits}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
}

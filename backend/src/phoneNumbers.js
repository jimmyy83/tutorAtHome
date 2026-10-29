export function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return '';
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}

export function equivalentStoredPhoneValues(normalizedPhone) {
  const values = new Set([normalizedPhone, `+${normalizedPhone}`, `00${normalizedPhone}`]);
  if (/^91[6-9]\d{9}$/.test(normalizedPhone)) {
    const national = normalizedPhone.slice(2);
    values.add(national);
    values.add(`+${national}`);
    values.add(`0${national}`);
    values.add(`+0${national}`);
  }
  return [...values].filter(Boolean);
}

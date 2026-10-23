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

// Reserve the tab during the original user gesture when a form still needs to
// finish asynchronous client validation before it can safely submit.
export function reserveWhatsAppWindow() {
  if (typeof window === 'undefined') return null;
  try {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    return popup;
  } catch {
    return null;
  }
}

export function navigateWhatsAppWindow(popup, recipient, message) {
  const href = buildWhatsAppUrl(recipient, message);
  if (!popup || popup.closed || !href) return false;
  try {
    popup.location.href = href;
    return true;
  } catch {
    return false;
  }
}

export function openWhatsAppWindow(recipient, message) {
  if (typeof window === 'undefined') return false;
  const href = buildWhatsAppUrl(recipient, message);
  if (!href) return false;
  try {
    const popup = window.open(href, '_blank');
    if (popup) popup.opener = null;
    return !!popup;
  } catch {
    return false;
  }
}

export function startWhatsAppSubmission({ recipient, message, whatsAppWindow = null, save }) {
  const opened = whatsAppWindow
    ? navigateWhatsAppWindow(whatsAppWindow, recipient, message)
    : openWhatsAppWindow(recipient, message);
  let savePromise;
  try {
    savePromise = Promise.resolve(save());
  } catch (error) {
    savePromise = Promise.reject(error);
  }
  return { opened, savePromise };
}

export function createSubmissionGuard() {
  let started = false;
  return {
    get started() { return started; },
    tryStart() {
      if (started) return false;
      started = true;
      return true;
    },
    reset() { started = false; },
  };
}

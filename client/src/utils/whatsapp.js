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
  return normalizeWhatsAppRecipient(configuredRecipient);
}

export function buildWhatsAppUrl(recipient, message = 'Hello TutorAtHome, I would like to know more about your services.') {
  const number = resolveWhatsAppRecipient(recipient);
  if (!number || typeof message !== 'string' || !message.trim()) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function buildTeacherRegistrationWhatsAppMessage({ applicantName, reference, saved = false, classes, subjects, serviceArea } = {}) {
  const list = value => Array.isArray(value) ? value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 8).join(', ') : '';
  return [
    saved ? 'Hello TutorAtHome, I have submitted a teacher registration.' : 'Hello TutorAtHome, I am contacting you about a teacher registration application.',
    saved && reference && `Application reference: ${reference}`,
    applicantName && `Applicant: ${applicantName}`,
    list(classes) && `Classes: ${list(classes)}`,
    list(subjects) && `Subjects: ${list(subjects)}`,
    serviceArea && `Service area: ${String(serviceArea).trim().slice(0, 120)}`,
  ].filter(Boolean).join('\n');
}

// Reserve the tab during the original user gesture when a form still needs to
// finish asynchronous client validation before it can safely submit.
export const TEACHER_WHATSAPP_TARGET = 'tutorathome-teacher-registration-whatsapp';

export function reserveWhatsAppWindow(targetName = TEACHER_WHATSAPP_TARGET) {
  if (typeof window === 'undefined') return null;
  try {
    const popup = window.open('about:blank', targetName);
    if (popup) popup.opener = null;
    return popup;
  } catch {
    return null;
  }
}

// Used by the visible fallback action. A named target reuses the tab reserved
// at submit time; if that tab was blocked, a direct user click opens it once.
// When popups are blocked, navigate the current tab as the working fallback.
export function openWhatsAppTarget(recipient, message, targetName = TEACHER_WHATSAPP_TARGET) {
  if (typeof window === 'undefined') return false;
  const href = buildWhatsAppUrl(recipient, message);
  if (!href) return false;
  try {
    const target = window.open(href, targetName);
    if (target) { target.opener = null; return true; }
  } catch {}
  try { window.location.assign(href); return true; } catch { return false; }
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

export async function navigateToLatestWhatsApp({ popup, loadSettings, message }) {
  try {
    const site = await loadSettings();
    const recipient = resolveWhatsAppRecipient(site?.settings?.whatsapp);
    if (!recipient) {
      try { if (popup && !popup.closed) popup.close(); } catch {}
      return { recipient: '', redirected: false, error: 'A valid published WhatsApp number is not available.' };
    }
    const redirected = navigateWhatsAppWindow(popup, recipient, message);
    if (!redirected) try { if (popup && !popup.closed) popup.close(); } catch {}
    return { recipient, redirected, error: '' };
  } catch {
    try { if (popup && !popup.closed) popup.close(); } catch {}
    return { recipient: '', redirected: false, error: 'The current WhatsApp settings could not be loaded. No WhatsApp redirect was started.' };
  }
}

export function startTeacherRegistrationSubmission({ save, loadSettings, popup, message }) {
  let savePromise;
  try { savePromise = Promise.resolve(save()); }
  catch (error) { savePromise = Promise.reject(error); }
  const whatsappPromise = navigateToLatestWhatsApp({ popup, loadSettings, message });
  return { savePromise, whatsappPromise };
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

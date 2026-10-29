const asRecord = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const certificationList = value => {
  const entries = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return entries.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean);
};

export class TeacherRegistrationPreparationError extends Error {
  constructor(code, message) { super(message); this.name = 'TeacherRegistrationPreparationError'; this.code = code; }
}

export function safeTeacherPreparationError(error) {
  if (error instanceof TeacherRegistrationPreparationError) return error.message;
  return 'The application could not be prepared. Your entered details are still here; please review them and try again.';
}

export function buildTeacherRegistrationFormData(values, uploads, FormDataType = globalThis.FormData) {
  const source = values || {};
  const academics = asRecord(source.academics);
  const postgraduate = asRecord(academics.postgraduation);
  const payload = {
    ...source,
    personal: { ...asRecord(source.personal) },
    location: { ...asRecord(source.location) },
    academics: {
      ...academics,
      postgraduation: Object.keys(postgraduate).length ? { ...postgraduate } : undefined,
      certifications: certificationList(academics.certificationsText),
    },
    teaching: { ...asRecord(source.teaching) },
    availability: { ...asRecord(source.availability) },
    fees: { ...asRecord(source.fees) },
  };
  delete payload.academics.certificationsText;
  if (payload.academics.postgraduation) {
    for (const field of ['degree', 'university', 'year', 'score']) {
      if (payload.academics.postgraduation[field] === '' || payload.academics.postgraduation[field] === undefined || Number.isNaN(payload.academics.postgraduation[field])) {
        delete payload.academics.postgraduation[field];
      }
    }
    if (!Object.keys(payload.academics.postgraduation).length) delete payload.academics.postgraduation;
  }

  if (typeof FormDataType !== 'function') throw new TeacherRegistrationPreparationError('FORM_DATA_UNAVAILABLE', 'This browser cannot prepare the secure application upload. Update the browser and try again.');
  const requiredFiles = ['profilePhoto', 'qualificationProof', 'aadhaarDocument'];
  const safeUploads = asRecord(uploads);
  for (const field of requiredFiles) {
    const file = safeUploads[field];
    if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function' || typeof file.type !== 'string') {
      throw new TeacherRegistrationPreparationError('MISSING_REQUIRED_UPLOAD', 'A required application document is unavailable. Please reselect your photo, education proof, and Aadhaar file before submitting.');
    }
  }

  const formData = new FormDataType();
  if (typeof formData.append !== 'function') throw new TeacherRegistrationPreparationError('FORM_DATA_UNAVAILABLE', 'This browser cannot prepare the secure application upload. Update the browser and try again.');
  formData.append('application', JSON.stringify(payload));
  for (const field of requiredFiles) formData.append(field, safeUploads[field], safeUploads[field].name || `${field}.${safeUploads[field].type === 'application/pdf' ? 'pdf' : 'bin'}`);
  return formData;
}

export function buildTeacherRegistrationPreparation(values, uploads, FormDataType = globalThis.FormData) {
  const source = asRecord(values);
  const personal = asRecord(source.personal);
  const location = asRecord(source.location);
  const teaching = asRecord(source.teaching);
  const formData = buildTeacherRegistrationFormData(source, uploads, FormDataType);
  const serviceArea = [location.locality, location.district, location.state].filter(Boolean).join(', ');
  return {
    formData,
    applicantName: typeof personal.fullName === 'string' ? personal.fullName : '',
    classes: Array.isArray(teaching.classes) ? teaching.classes : [],
    subjects: Array.isArray(teaching.subjects) ? teaching.subjects : [],
    serviceArea,
  };
}

export function prepareTeacherRegistrationAttempt(guard, prepare) {
  if (!guard?.tryStart?.()) return { started: false, value: null, error: null };
  let preparationStage = 'form_data_preparation';
  try {
    return { started: true, value: prepare(stage => { preparationStage = stage; }), error: null };
  } catch (error) {
    guard.reset();
    if (error && typeof error === 'object') error.preparationStage = preparationStage;
    return { started: false, value: null, error };
  }
}

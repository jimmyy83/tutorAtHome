const documentKinds = new Set(['qualification-proof', 'aadhaar-document']);

export function teacherDocumentEndpoint(teacherId, kind) {
  if (!documentKinds.has(kind)) throw new Error('Unsupported teacher document.');
  return `/admin/teachers/${encodeURIComponent(teacherId)}/documents/${kind}`;
}

export function teacherDocumentLabel(kind) {
  if (kind === 'qualification-proof') return 'Qualification proof';
  if (kind === 'aadhaar-document') return 'Aadhaar identity document';
  throw new Error('Unsupported teacher document.');
}

export function isTeacherDocumentPreviewSupported(mimeType) {
  return mimeType === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);
}

async function getBlob(api, teacherId, kind, authToken, providedBlob) {
  return providedBlob || api.download(teacherDocumentEndpoint(teacherId, kind), { authToken });
}

export async function prepareTeacherDocumentPreview({ api, teacherId, kind, authToken, createObjectURL = URL.createObjectURL }) {
  const blob = await getBlob(api, teacherId, kind, authToken);
  const mimeType = blob.type || '';
  const supported = isTeacherDocumentPreviewSupported(mimeType);
  return { blob, mimeType, supported, url: supported ? createObjectURL(blob) : '' };
}

export function revokeTeacherDocumentPreview(preview, revokeObjectURL = URL.revokeObjectURL) {
  if (preview?.url) revokeObjectURL(preview.url);
}

export async function downloadTeacherDocumentFile({ api, teacherId, kind, authToken, metadata, blob: providedBlob, documentRef = window.document, createObjectURL = URL.createObjectURL, revokeObjectURL = URL.revokeObjectURL, schedule = setTimeout }) {
  const blob = await getBlob(api, teacherId, kind, authToken, providedBlob);
  const url = createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = kind === 'aadhaar-document'
    ? `identity-verification.${metadata?.format || 'pdf'}`
    : metadata?.originalName || 'teacher-qualification-proof';
  anchor.click();
  schedule(() => revokeObjectURL(url), 1000);
}

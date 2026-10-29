export function validateTeacherTermsDraft(text, summary) {
  // Each non-empty source line is stored as an individual clause. Keep its
  // text exactly as entered; trimming here could alter legal wording/indentation.
  const content = String(text ?? '').split(/\r?\n/).filter(line => line.trim().length > 0);
  const fields = {};
  if (!content.length) fields.content = 'Enter at least one non-empty terms condition.';
  else if (content.length > 500) fields.content = 'Use no more than 500 terms conditions.';
  else if (content.some(line => line.length > 3000)) fields.content = 'Each condition must be 3,000 characters or fewer.';
  if (String(summary ?? '').trim().length > 300) fields.changeSummary = 'Change summary must be 300 characters or fewer.';
  return { content, fields, valid: Object.keys(fields).length === 0 };
}

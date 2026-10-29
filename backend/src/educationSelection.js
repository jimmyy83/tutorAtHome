import { HttpError } from './middleware.js';

export function validateEducationSelectionData(data, catalogValue) {
  const catalog = catalogValue && typeof catalogValue === 'object' && !Array.isArray(catalogValue) ? catalogValue : {};
  const active = items => (Array.isArray(items) ? items : []).filter(item => item?.active === true);
  const educationLevels = active(catalog.educationLevels);
  const streams = active(catalog.streams);
  const exams = active(catalog.competitiveExams);
  const subjectsByBoardClass = catalog.subjectsByBoardClass && typeof catalog.subjectsByBoardClass === 'object'
    ? catalog.subjectsByBoardClass
    : {};
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];
  const examPreparations = Array.isArray(data.examPreparations) ? data.examPreparations : [];
  const level = educationLevels.find(item => String(item.value) === data.studentClass);
  const senior = ['11', '12'].includes(data.studentClass);
  const stream = streams.find(item => item.id === data.streamId);
  const fields = {};

  if (catalog.educationLevels && !level) fields.studentClass = 'Choose an available education level.';
  if (senior && !stream) fields.streamId = 'Choose an available Class 11-12 stream.';
  if (!senior && data.streamId) fields.streamId = 'Streams are available only for Class 11 and 12.';
  const overrides = subjectsByBoardClass?.[data.board]?.[data.studentClass]?.[data.streamId || 'general'];
  const allowedSubjects = overrides || (senior ? stream?.subjects : null);
  if (Array.isArray(allowedSubjects) && subjects.some(subject => !allowedSubjects.includes(subject))) {
    fields.subjects = 'One or more subjects do not match the selected class, board or stream.';
  }
  const validExams = exams
    .filter(exam => senior ? stream?.examIds?.includes(exam.id) : exam.id === 'foundation')
    .map(exam => exam.id);
  if (examPreparations.some(id => !validExams.includes(id))) {
    fields.examPreparations = 'Choose an exam option available for this class and stream.';
  }
  if (Object.keys(fields).length) throw new HttpError(422, 'Please check the highlighted education options.', fields);
}

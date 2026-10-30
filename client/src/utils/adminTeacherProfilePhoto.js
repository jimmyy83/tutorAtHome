export function shouldLoadTeacherProfilePhoto({ nearViewport, hasPhoto, version, cached, failed }) {
  return Boolean(nearViewport && hasPhoto && version && !cached && !failed);
}

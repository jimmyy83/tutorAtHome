export function bindTeacherRowActions(record, handlers) {
  return {
    assignLocation: event => handlers.assignLocation(record, event),
    changeStatus: event => handlers.changeStatus(record, event.target.value),
    review: () => handlers.review(record),
    uploadPhoto: event => handlers.uploadPhoto(record, event),
    block: () => handlers.manageRecord(record, 'block'),
    archive: () => handlers.manageRecord(record, 'archive'),
    permanentlyDelete: () => handlers.manageRecord(record, 'permanent-delete'),
    toggleFeatured: () => handlers.toggleFeatured(record),
  };
}

export function teacherLocationPayload(selection) {
  return {
    locationStateId: selection?.stateId || '',
    locationDistrictId: selection?.districtId || '',
    locationLocalityId: selection?.localityId || '',
  };
}

export async function runAdminMutation(lock, action, { onStart, onSuccess, onError, onFinish } = {}) {
  if (lock.current) return false;
  lock.current = true;
  onStart?.();
  try {
    const result = await action();
    onSuccess?.(result);
    return true;
  } catch (error) {
    onError?.(error);
    return false;
  } finally {
    lock.current = false;
    onFinish?.();
  }
}

export function hasReachedTermsEnd(element, tolerance = 2) {
  if (!element || !Number.isFinite(tolerance) || tolerance < 0) return false;
  return element.scrollTop + element.clientHeight >= element.scrollHeight - tolerance;
}

export function hasCurrentTermsConsent({ accepted, reviewedVersionId, currentVersionId }) {
  return accepted === true && Boolean(currentVersionId) && reviewedVersionId === currentVersionId;
}

export function canSubmitTeacherRegistration({ minimumFee, maximumFee, paymentModes, hasAadhaar, accepted, reviewedVersionId, currentVersionId, termsVersionId, termsStale, termsLoading }) {
  const minimum = Number(minimumFee), maximum = Number(maximumFee);
  const feesValid = minimumFee !== '' && maximumFee !== '' && Number.isInteger(minimum) && Number.isInteger(maximum)
    && minimum >= 0 && maximum >= minimum && maximum <= 1_000_000;
  return feesValid && Array.isArray(paymentModes) && paymentModes.length > 0 && hasAadhaar
    && !termsStale && !termsLoading && termsVersionId === currentVersionId
    && hasCurrentTermsConsent({ accepted, reviewedVersionId, currentVersionId });
}

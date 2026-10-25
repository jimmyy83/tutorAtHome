import { useEffect, useState } from 'react';
import { api } from '../services/apiClient.js';

import { DEFAULT_PAGE_FORM_SETTINGS, resolvePageFormFields } from './pageFormSettingsDefaults.js';
export { DEFAULT_PAGE_FORM_SETTINGS, resolvePageFormFields };
export function usePageFormSettings(page) {
  const [fields, setFields] = useState(DEFAULT_PAGE_FORM_SETTINGS[page].fields);
  useEffect(() => {
    const controller = new AbortController();
    api.get('/public/page-form-settings', { signal: controller.signal }).then(result => {
      const configured = result?.pages?.[page]?.fields;
      setFields(resolvePageFormFields(page, configured));
    }).catch(() => {});
    return () => controller.abort();
  }, [page]);
  const setting = id => fields[id] || { visible: true, required: false };
  return { fields, setting, visible: id => setting(id).visible !== false, required: id => setting(id).required === true };
}

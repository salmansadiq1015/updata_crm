'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'tasks.analyticsOpen';

/**
 * Whether the analysis blocks of the tasks page are unfolded. Collapsed by
 * default and remembered per browser, so someone who reads their charts every
 * morning does not have to unfold them every morning.
 */
export function useTaskAnalyticsPreference(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);

  // Read after mount: localStorage does not exist during server rendering.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'true') setOpen(true);
    } catch { /* private mode — keep the default */ }
  }, []);

  const update = useCallback((next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch { /* not fatal: the preference simply does not persist */ }
  }, []);

  return [open, update];
}

'use client';

import { useSyncExternalStore, useState, useEffect } from 'react';
import { getOnlineStatus, subscribe, isActuallyOnline } from '../lib/connectivity';

const getServerSnapshot = () => true;

export function useNetworkStatus() {
  return useSyncExternalStore(subscribe, getOnlineStatus, getServerSnapshot);
}

export function useVerifiedOnlineStatus() {
  const browserOnline = useNetworkStatus();
  const [verified, setVerified] = useState(browserOnline);

  useEffect(() => {
    if (!browserOnline) {
      setVerified(false);
      return;
    }

    let cancelled = false;
    isActuallyOnline().then((result) => {
      if (!cancelled) setVerified(result);
    });

    return () => { cancelled = true; };
  }, [browserOnline]);

  return verified;
}

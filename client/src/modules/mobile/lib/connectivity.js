import { SYNC_CONFIG } from '../constants/mobile-constants';

let listeners = new Set();
let currentStatus = typeof navigator !== 'undefined' ? navigator.onLine : true;

function notify(online) {
  currentStatus = online;
  listeners.forEach((fn) => fn(online));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => notify(true));
  window.addEventListener('offline', () => notify(false));
}

export function getOnlineStatus() {
  return currentStatus;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function isActuallyOnline(pingUrl = '/mobile/sync/status') {
  if (!navigator.onLine) return false;
  try {
    const response = await fetch(pingUrl, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(SYNC_CONFIG.PING_TIMEOUT),
    });
    return response.ok;
  } catch {
    return false;
  }
}

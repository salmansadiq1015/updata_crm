import { MapsAdapter } from './maps-adapter';
import type { ExtensionMessage } from '../shared/types';

// Bumped on every content-script change so a freshly injected build TAKES OVER a
// Google Maps tab that still runs an older copy (a reload leaves the old script
// running in the page until the tab navigates). The old copy self-silences below.
const CONTENT_RUNTIME_KEY = '__leadFinderMapsContentV6__';
const runtimeGlobal = globalThis as typeof globalThis & Record<string, unknown>;

// True only while the extension this script belongs to is still loaded. After the
// extension is reloaded/updated, the old content script keeps running in the page
// but its `chrome.runtime` is invalidated: touching it (e.g. sendMessage) throws
// "Extension context invalidated". We detect that and go quiet instead of
// spamming the console on every Maps DOM mutation.
const extensionAlive = (): boolean => {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
};

if (!runtimeGlobal[CONTENT_RUNTIME_KEY]) {
  runtimeGlobal[CONTENT_RUNTIME_KEY] = true;
  const adapter = new MapsAdapter();

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    try {
      if (message.type === 'GET_MAPS_CONTEXT') {
        sendResponse({ ok: true, context: adapter.context() });
        return false;
      }
      if (message.type === 'START_DISCOVERY') {
        sendResponse({ ok: true, context: adapter.context() });
        return false;
      }
      if (message.type === 'GET_PROGRESS' || message.type === 'PAUSE_DISCOVERY' || message.type === 'RESUME_DISCOVERY' || message.type === 'STOP_DISCOVERY' || message.type === 'ENRICH_LEAD' || message.type === 'CLEAR_ALL_DATA') {
        return false;
      }
      if ((message as { type: string }).type === 'COLLECT_VISIBLE') {
        sendResponse({ ok: true, records: adapter.collectVisible(), context: adapter.context() });
        return false;
      }
      if ((message as { type: string }).type === 'COLLECT_DETAILS') {
        sendResponse({ ok: true, record: adapter.extractBusinessDetails(), context: adapter.context() });
        return false;
      }
      if ((message as { type: string }).type === 'SCROLL_RESULTS') {
        sendResponse({ ok: true, ...adapter.scrollResults(), context: adapter.context() });
        return false;
      }
      if ((message as { type: string }).type === 'GET_SCROLL_STATE') {
        sendResponse({ ok: true, ...adapter.getScrollState(), context: adapter.context() });
        return false;
      }
      if ((message as { type: string }).type === 'RESTORE_SCROLL') {
        const checkpoint = message as unknown as { scrollTop?: number; lastVisibleResultKey?: string | null };
        sendResponse({ ok: true, ...adapter.restoreScroll(checkpoint), context: adapter.context() });
        return false;
      }
      return false;
    } catch (error) {
      try {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Google Maps extraction failed.'
        });
      } catch { /* the port is gone (extension reloaded) — nothing to report to */ }
      return false;
    }
  });

  let lastSignature = '';
  let notifyTimer: number | undefined;
  let disposed = false;

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const observer = new MutationObserver(() => {
    scheduleStateCheck();
  });

  // Detach everything this stale script hooked into the page (observer, history
  // patches, popstate, timer) so it stops reacting to Maps activity once its
  // extension context is dead, and clear the init guard so a freshly injected
  // build can take the tab over without a manual page refresh.
  const teardown = () => {
    if (disposed) return;
    disposed = true;
    try { observer.disconnect(); } catch { /* ignore */ }
    try { window.removeEventListener('popstate', notifyNavigation); } catch { /* ignore */ }
    if (notifyTimer) window.clearTimeout(notifyTimer);
    try { history.pushState = originalPushState; history.replaceState = originalReplaceState; } catch { /* ignore */ }
    try { runtimeGlobal[CONTENT_RUNTIME_KEY] = false; } catch { /* ignore */ }
  };

  function notifyState(): void {
    if (disposed) return;
    // The extension was reloaded/updated — stop quietly instead of throwing
    // "Extension context invalidated" on every Maps mutation.
    if (!extensionAlive()) { teardown(); return; }
    const context = adapter.context();
    const signature = [location.href, context.query, context.visibleResultCount, context.hasResults, context.isListing].join('|');
    if (signature === lastSignature) return;
    lastSignature = signature;
    try {
      // sendMessage THROWS synchronously on an invalidated context (so .catch
      // alone is not enough); it also rejects async when the worker is asleep.
      const sent = chrome.runtime.sendMessage({ type: 'MAPS_STATE_CHANGED', context });
      if (sent && typeof (sent as Promise<unknown>).catch === 'function') {
        (sent as Promise<unknown>).catch(() => undefined);
      }
    } catch {
      teardown();
    }
  }

  function scheduleStateCheck(): void {
    if (disposed) return;
    if (notifyTimer) window.clearTimeout(notifyTimer);
    notifyTimer = window.setTimeout(notifyState, 250);
  }

  function notifyNavigation(): void {
    scheduleStateCheck();
  }

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    notifyNavigation();
  };
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    notifyNavigation();
  };
  window.addEventListener('popstate', notifyNavigation);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  scheduleStateCheck();
}

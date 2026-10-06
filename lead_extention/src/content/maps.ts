import { MapsAdapter } from './maps-adapter';
import type { ExtensionMessage } from '../shared/types';

const adapter = new MapsAdapter();

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
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
  return false;
});

let lastSignature = '';
let notifyTimer: number | undefined;
const notifyState = () => {
  const context = adapter.context();
  const signature = [location.href, context.query, context.visibleResultCount, context.hasResults, context.isListing].join('|');
  if (signature === lastSignature) return;
  lastSignature = signature;
  chrome.runtime.sendMessage({ type: 'MAPS_STATE_CHANGED', context }).catch(() => undefined);
};
const scheduleStateCheck = () => {
  if (notifyTimer) window.clearTimeout(notifyTimer);
  notifyTimer = window.setTimeout(notifyState, 250);
};
const notifyNavigation = () => {
  scheduleStateCheck();
};
const originalPushState = history.pushState;
history.pushState = function (...args) {
  originalPushState.apply(this, args);
  notifyNavigation();
};
const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  originalReplaceState.apply(this, args);
  notifyNavigation();
};
window.addEventListener('popstate', notifyNavigation);
const observer = new MutationObserver(() => {
  scheduleStateCheck();
});
observer.observe(document.documentElement, { subtree: true, childList: true });
scheduleStateCheck();

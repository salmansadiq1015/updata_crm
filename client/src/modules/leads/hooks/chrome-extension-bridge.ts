/**
 * Minimal bridge to the Lead Finder extension from the CRM web page via
 * chrome.runtime.sendMessage (the extension's `externally_connectable` allows
 * only this origin). Used purely for install/connect signalling — the page
 * never receives a token this way.
 *
 * `@types/chrome` is not a client dependency, so `chrome` is reached through a
 * narrow local type and guarded at runtime: it is undefined during SSR, in
 * non-Chromium browsers, and when no extension is installed.
 */
type ChromeRuntimeLike = {
  sendMessage: (extensionId: string, message: unknown, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
};

function getRuntime(): ChromeRuntimeLike | null {
  if (typeof window === 'undefined') return null;
  const chrome = (window as unknown as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome;
  return typeof chrome?.runtime?.sendMessage === 'function' ? chrome.runtime! : null;
}

export type ExtensionPingResult = {
  installed: boolean;
  connected: boolean;
  version?: string;
  user?: { id: string; email: string } | null;
};

const PING_TIMEOUT_MS = 1500;
const CONNECT_TIMEOUT_MS = 15000;

function send(extensionId: string, message: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const runtime = getRuntime();
  if (!runtime) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: unknown) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(undefined), timeoutMs);
    try {
      runtime.sendMessage(extensionId, message, (response) => {
        window.clearTimeout(timer);
        // Touching lastError suppresses Chrome's "unchecked runtime.lastError"
        // console noise when the extension is absent.
        if (runtime.lastError) {
          finish(undefined);
          return;
        }
        finish(response);
      });
    } catch {
      window.clearTimeout(timer);
      finish(undefined);
    }
  });
}

/** True only in Chromium browsers where chrome.runtime messaging exists. */
export function canMessageExtension(): boolean {
  return getRuntime() !== null;
}

/** Probe install + connected state without the page ever seeing a token. */
export async function pingExtension(extensionId: string): Promise<ExtensionPingResult> {
  const response = (await send(extensionId, { type: 'CRM_PING' }, PING_TIMEOUT_MS)) as
    | { ok?: boolean; connected?: boolean; version?: string; user?: { id: string; email: string } | null }
    | undefined;
  if (!response || response.ok !== true) return { installed: false, connected: false };
  return {
    installed: true,
    connected: Boolean(response.connected),
    version: response.version,
    user: response.user ?? null,
  };
}

/** Hand the extension a one-time pairing grant to link this browser. */
export async function connectExtension(
  extensionId: string,
  grant: string,
  apiBaseUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  const response = (await send(
    extensionId,
    { type: 'CRM_CONNECT', grant, apiBaseUrl },
    CONNECT_TIMEOUT_MS,
  )) as { ok?: boolean; error?: string } | undefined;
  if (!response) {
    return { ok: false, error: 'The extension did not respond. Make sure Lead Finder is installed and enabled.' };
  }
  return { ok: response.ok === true, error: response.error };
}

/** Best-effort: ask the extension to clear its local token on disconnect. */
export async function disconnectExtension(extensionId: string): Promise<void> {
  await send(extensionId, { type: 'CRM_DISCONNECT' }, 3000);
}

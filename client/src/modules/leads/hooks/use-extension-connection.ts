'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '@/lib/api/client';
import { extensionApi, type ExtensionStatus } from '../services/extension-api';
import {
  canMessageExtension,
  connectExtension,
  disconnectExtension,
  pingExtension,
} from './chrome-extension-bridge';

/**
 * The connect-card state machine. Combines an in-browser ping of the extension
 * (true "installed?" signal) with the server connection record (authoritative
 * "connected?"), so the card never falsely claims a state it cannot verify.
 */
export type ExtensionState =
  | 'checking'
  | 'unsupported' // not a Chromium browser → cannot host this extension
  | 'not-installed'
  | 'installed-not-connected'
  | 'connected'
  | 'error';

const FALLBACK_EXTENSION_ID =
  process.env.NEXT_PUBLIC_EXTENSION_ID || 'bnmjibohjdkkibimeknikhnolhlbgmnk';

// The Chrome Web Store listing URL. Configurable so the production listing can
// be set per-environment (CHROME_EXTENSION_STORE_URL in the pasted spec). We do
// NOT fabricate a `chromewebstore.google.com/detail/<id>` URL: before the
// extension is published that resolves to "This item is not available", which is
// exactly the dead link this replaces. Empty string ⇒ treat as not yet
// published and show the development install flow instead.
const STORE_URL =
  process.env.NEXT_PUBLIC_CHROME_EXTENSION_STORE_URL ||
  process.env.NEXT_PUBLIC_EXTENSION_WEBSTORE_URL || // back-compat alias
  '';

function messageFrom(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return 'Something went wrong. Please try again.';
}

/** Resolve an absolute API base to hand the extension (it needs an absolute URL). */
function resolveApiBaseUrl(): string | undefined {
  try {
    const base = (apiClient as unknown as { defaults?: { baseURL?: string } }).defaults?.baseURL;
    if (!base) return undefined;
    return new URL(base, window.location.origin).toString();
  } catch {
    return undefined;
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type UseExtensionConnection = {
  state: ExtensionState;
  status: ExtensionStatus | null;
  extensionId: string;
  /** Configured Chrome Web Store URL, or '' when the listing isn't set yet. */
  storeUrl: string;
  /** True when a real Web Store listing URL is configured. */
  published: boolean;
  busy: boolean;
  error: string | null;
  check: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

export function useExtensionConnection(enabled: boolean): UseExtensionConnection {
  const [state, setState] = useState<ExtensionState>('checking');
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const extensionId = status?.extensionId || FALLBACK_EXTENSION_ID;

  const check = useCallback(async () => {
    if (!mounted.current) return;
    setError(null);
    if (!canMessageExtension()) {
      setState('unsupported');
      return;
    }
    let serverStatus: ExtensionStatus | null = null;
    try {
      serverStatus = await extensionApi.getStatus();
      if (mounted.current) setStatus(serverStatus);
    } catch {
      // Keep going: the ping still tells us whether it is installed.
    }
    const id = serverStatus?.extensionId || FALLBACK_EXTENSION_ID;
    const ping = await pingExtension(id);
    if (!mounted.current) return;

    if (!ping.installed) {
      setState('not-installed');
      return;
    }
    if (!serverStatus) {
      setState('error');
      setError('Could not verify the connection with the CRM. Please retry.');
      return;
    }
    if (serverStatus.connected) {
      setState('connected');
      return;
    }
    // Installed, but the server has no live session — either never connected,
    // or the extension holds a stale token whose session was revoked.
    if (serverStatus.error || ping.connected) {
      setState('error');
      return;
    }
    setState('installed-not-connected');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void check();
    // Re-verify when the tab regains focus (e.g. returning from the Web Store).
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, check]);

  const waitForConnected = useCallback(async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await delay(attempt === 0 ? 300 : 700);
      let latest: ExtensionStatus | null = null;
      try {
        latest = await extensionApi.getStatus();
      } catch {
        continue;
      }
      if (!mounted.current) return;
      setStatus(latest);
      if (latest.connected) {
        setState('connected');
        return;
      }
    }
    if (mounted.current) {
      setState('error');
      setError('The connection did not register. Please try connecting again.');
    }
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!canMessageExtension()) {
        setState('unsupported');
        return;
      }
      const ping = await pingExtension(extensionId);
      if (!ping.installed) {
        setState('not-installed');
        setError('Install the extension first, then connect.');
        return;
      }
      const pairing = await extensionApi.createPairing();
      const result = await connectExtension(
        pairing.extensionId || extensionId,
        pairing.grant,
        resolveApiBaseUrl(),
      );
      if (!result.ok) {
        setState('error');
        setError(result.error || 'The extension could not complete the connection.');
        return;
      }
      await waitForConnected();
    } catch (e) {
      if (mounted.current) {
        setState('error');
        setError(messageFrom(e));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [extensionId, waitForConnected]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await extensionApi.disconnect(status?.connection?.id);
      // Best-effort: also clear the extension's own stored token.
      await disconnectExtension(extensionId);
      await check();
    } catch (e) {
      if (mounted.current) setError(messageFrom(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [check, extensionId, status]);

  return {
    state,
    status,
    extensionId,
    storeUrl: STORE_URL,
    published: Boolean(STORE_URL),
    busy,
    error,
    check,
    connect,
    disconnect,
  };
}

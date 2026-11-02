import { AsyncLocalStorage } from 'node:async_hooks';
import { GoogleGenAI } from '@google/genai';

const owners = new AsyncLocalStorage();
const installed = Symbol.for('updata.google-live-owned-sockets.v1');
const factoryKey = Symbol('original-google-websocket-factory');

/** Compatibility shim for pinned @google/genai 2.32.0 / Google plugin 1.9.2.
 * Live.connect waits for setupComplete and exposes no pending-socket cancellation.
 * Retain the SDK's transport handles so timeout/shutdown can close them as well.
 * Payloads, authentication and protocol processing remain in the official SDK.
 * Only sessions constructed in the explicit async ownership scope are affected.
 */
function install() {
  const client = new GoogleGenAI({ apiKey: 'unused-compatibility-check', vertexai: false });
  const prototype = Object.getPrototypeOf(client.live);
  if (!client.live.webSocketFactory?.create) throw Object.assign(new Error('Google SDK socket ownership interface changed'), { code: 'SDK_COMPATIBILITY_FAILED' });
  if (prototype[installed]) return;
  const connect = prototype.connect;
  prototype.connect = function (params) {
    const owner = owners.getStore();
    if (!owner) return connect.call(this, params);
    const original = this[factoryKey] ||= this.webSocketFactory;
    this.webSocketFactory = {
      supportsHeaders: original.supportsHeaders,
      create(url, headers, callbacks) {
        const apiKey = new URL(url).searchParams.get('key');
        const clean = value => apiKey ? String(value || '').split(apiKey).join('[redacted]') : String(value || '');
        let resolveClosed;
        const closed = new Promise(resolve => { resolveClosed = resolve; });
        const socket = original.create(url, headers, {
          onopen: () => { if (!owner.closed) callbacks.onopen?.(); },
          onmessage: event => { if (!owner.closed) callbacks.onmessage?.(event); },
          // ErrorEvent targets can contain a WS URL with the permanent query key.
          // Forward only the safe diagnostic fields to the plugin's logger.
          onerror: event => { if (!owner.closed) callbacks.onerror?.({ message: clean(event?.message || 'Gemini Live transport error') }); },
          onclose: event => { resolveClosed(); if (!owner.closed) callbacks.onclose?.({ code: event.code, reason: clean(event.reason), wasClean: event.wasClean }); },
        });
        owner.sockets.set(socket, closed);
        return socket;
      },
    };
    return connect.call(this, params);
  };
  Object.defineProperty(prototype, installed, { value: true });
}

export function ownedGoogleSession(owner, createSession) {
  install();
  owner.sockets ||= new Map();
  return owners.run(owner, createSession);
}

export async function closeOwnedGoogleSockets(owner, timeoutMs = 2000) {
  const pending = [];
  for (const [socket, closed] of owner.sockets || []) { socket.close(); pending.push(closed); }
  if (!pending.length) return;
  let timer;
  try {
    await Promise.race([
      Promise.all(pending),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Provider socket closure was not confirmed'), { code: 'PROVIDER_CLEANUP_UNCONFIRMED' })), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); owner.sockets.clear(); }
}

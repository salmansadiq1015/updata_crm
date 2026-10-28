/**
 * Gateway → CRM API (`/api/v1/paired-phone/gateway/*`), authenticated by the device's bearer token.
 *
 * Call events go through a durable outbox: each has a stable eventId (the CRM de-duplicates on
 * it), is appended to a JSON-lines file before the first send, and is retried with backoff until
 * the CRM accepts it, also across gateway restarts. An "ended" event is therefore never lost
 * just because the network blinked at the end of a call.
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export class CrmError extends Error {
  constructor(message, { status = 0, code = null, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export class CrmClient {
  constructor({ apiBase, token = null, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
    if (!/^https?:\/\//.test(apiBase || '')) throw new Error('apiBase must be the CRM API URL, e.g. https://crm.example.com/api/v1');
    if (apiBase.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(apiBase)) {
      throw new Error('The CRM API must use https (plain http is only allowed for localhost)');
    }
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.token = token;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, body = {}) {
    let res;
    try {
      res = await this.fetch(`${this.apiBase}/paired-phone/gateway${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new CrmError(`CRM unreachable: ${err.cause?.code || err.name || err.message}`, { retryable: true });
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok || !json?.success) {
      const message = json?.error?.message || json?.message || `HTTP ${res.status}`;
      throw new CrmError(message, { status: res.status, code: json?.error?.code || null, retryable: res.status === 429 || res.status >= 500 });
    }
    return json.data;
  }

  pair(code, gateway) {
    return this.request('/pair', { code, gateway });
  }

  heartbeat(body) {
    return this.request('/heartbeat', body);
  }

  takeDialKey() {
    return this.request('/dial-key');
  }

  confirmDialKey(bdaddr) {
    return this.request('/dial-key/confirm', { bdaddr });
  }

  claimSetup(id) { return this.request(`/setup/${encodeURIComponent(id)}/claim`); }
  completeSetup(id, result) { return this.request(`/setup/${encodeURIComponent(id)}/result`, result); }

  claim(sessionNonce) {
    return this.request('/calls/claim', { sessionNonce });
  }

  sendEvent(callId, event) {
    return this.request(`/calls/${encodeURIComponent(callId)}/events`, event);
  }
}

/** Durable, ordered-per-call delivery of call events. */
export class EventOutbox {
  constructor({ client, file = null, log = () => {}, now = () => Date.now(), maxAttempts = 50 }) {
    this.client = client;
    this.file = file;
    this.log = log;
    this.now = now;
    this.maxAttempts = maxAttempts;
    this.queue = [];
    this.flushing = null;
    if (file && existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          this.queue.push(JSON.parse(line));
        } catch { /* a torn last line from a crash: skip */ }
      }
      if (this.queue.length) this.log('outbox_restored', { pending: this.queue.length });
    }
  }

  /** Queue an event; returns its eventId. Persisted before the first send. */
  push(callId, type, data = {}) {
    const item = { callId, eventId: randomUUID(), type, at: new Date(this.now()).toISOString(), data, attempts: 0, nextAt: 0 };
    this.queue.push(item);
    if (this.file) appendFileSync(this.file, `${JSON.stringify(item)}\n`, { mode: 0o600 });
    this.flush();
    return item.eventId;
  }

  get pending() {
    return this.queue.length;
  }

  flush() {
    if (!this.flushing) this.flushing = this._drain().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async _drain() {
    while (this.queue.length) {
      const item = this.queue[0];
      if (item.nextAt > this.now()) return; // backing off; the next flush() retries
      try {
        await this.client.sendEvent(item.callId, { eventId: item.eventId, type: item.type, at: item.at, data: item.data });
        this.queue.shift();
        this._persist();
      } catch (err) {
        item.attempts += 1;
        // A permanent refusal (unknown call, validation) will never succeed: drop it, loudly.
        if (!err.retryable || item.attempts >= this.maxAttempts) {
          this.log('outbox_dropped', { callId: item.callId, type: item.type, status: err.status, error: err.message });
          this.queue.shift();
          this._persist();
          continue;
        }
        item.nextAt = this.now() + Math.min(30_000, 500 * 2 ** Math.min(item.attempts, 6));
        this.log('outbox_retry', { callId: item.callId, type: item.type, attempts: item.attempts, error: err.message });
        return;
      }
    }
  }

  _persist() {
    if (!this.file) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, this.queue.map((q) => JSON.stringify(q)).join('\n') + (this.queue.length ? '\n' : ''), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}

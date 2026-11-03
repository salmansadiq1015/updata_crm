import { randomUUID } from 'node:crypto';

/** Preserve audio event order and IDs across retries; never block audio capture. */
export function createBehaviorPublisher(api, { warn = () => {}, retryMs = 250 } = {}) {
  const pending = [];
  let draining = null;
  let timer = null;
  let stopped = false;
  const drain = () => {
    if (draining || stopped) return draining;
    clearTimeout(timer);
    draining = (async () => {
      while (pending.length && !stopped) {
        try { await api.behavior(pending[0]); pending.shift(); }
        catch (error) {
          warn('behavior event upload delayed', { error: error?.message, pending: pending.length });
          if (error.status && error.status < 500 && error.status !== 409) { pending.shift(); continue; }
          break;
        }
      }
    })().finally(() => {
      draining = null;
      if (pending.length && !stopped) { timer = setTimeout(drain, retryMs); timer.unref?.(); }
    });
    return draining;
  };
  return {
    add(payload) {
      const event = { id: randomUUID(), at: new Date().toISOString(), ...payload };
      if (stopped) return event;
      if (pending.length >= 1000) { warn('behavior event queue full', { pending: pending.length }); return event; }
      pending.push(event); void drain(); return event;
    },
    async flush(timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      let timeout;
      const flush = async () => {
        while (pending.length && !stopped && Date.now() < deadline) {
          await drain();
          if (pending.length) await new Promise(resolve => setTimeout(resolve, Math.min(retryMs, Math.max(0, deadline - Date.now()))));
        }
      };
      try { await Promise.race([flush(), new Promise(resolve => { timeout = setTimeout(resolve, timeoutMs); })]); }
      finally { clearTimeout(timeout); }
      return { remaining: pending.length };
    },
    stop() { stopped = true; clearTimeout(timer); },
  };
}

import { createHash, randomUUID } from 'node:crypto';

/** Ordered, bounded speech uploads. A temporary outage retains the turn for retry. */
export function createTranscriptPublisher(api, { warn = () => {}, retryMs = 200 } = {}) {
  const pending = [];
  const seen = new Set();
  const anonymous = new WeakMap();
  let draining = null;
  let retryTimer = null;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const drain = () => {
    if (draining) return draining;
    clearTimeout(retryTimer);
    draining = (async () => {
      while (pending.length) {
        const turn = pending[0];
        let delivered = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const args = [turn.role, turn.text, turn.itemId, turn.interrupted];
            if (turn.at) args.push(turn.at);
            await api.transcript(...args); delivered = true; break;
          } catch (error) {
            if (attempt === 4) warn('transcript upload delayed; retaining for retry', { error: error?.message });
            else await delay(retryMs * 2 ** attempt);
          }
        }
        if (!delivered) break;
        pending.shift();
      }
    })().finally(() => {
      draining = null;
      if (pending.length) { retryTimer = setTimeout(drain, retryMs * 5); retryTimer.unref?.(); }
    });
    return draining;
  };
  return {
    add(item) {
      if (!item || !['user', 'customer', 'assistant'].includes(item.role)) return;
      const content = Array.isArray(item.content) ? item.content.map(part => typeof part === 'string' ? part : part?.text || part?.transcript || '').join('\n') : '';
      const text = String(item.textContent || content || '').trim().slice(0, 4000);
      if (!text) return;
      let itemId = item.id || anonymous.get(item);
      if (!itemId) { itemId = randomUUID(); anonymous.set(item, itemId); }
      if (!/^[\w.:-]{1,80}$/.test(itemId)) itemId = `item-${createHash('sha256').update(String(itemId)).digest('hex')}`;
      const role = item.role === 'assistant' ? 'assistant' : 'customer';
      const key = `${role}:${itemId}`;
      if (seen.has(key)) return;
      if (pending.length >= 100) { warn('transcript queue full'); return; }
      seen.add(key);
      if (seen.size > 600) seen.delete(seen.values().next().value);
      const date = item.createdAt instanceof Date ? item.createdAt : typeof item.createdAt === 'number' ? new Date(item.createdAt) : null;
      pending.push({ itemId, role, text, interrupted: Boolean(item.interrupted), ...(date && Number.isFinite(date.getTime()) ? { at: date.toISOString() } : {}) });
      void drain();
    },
    async flush(timeoutMs = 3000) {
      if (!draining && !pending.length) return;
      let timer;
      let expired = false;
      const finish = async () => { while (!expired && (pending.length || draining)) { await drain(); if (!expired && pending.length) await delay(retryMs); } };
      try { await Promise.race([finish(), new Promise(resolve => { timer = setTimeout(() => { expired = true; resolve(); }, timeoutMs); })]); }
      finally { expired = true; clearTimeout(timer); }
    },
  };
}

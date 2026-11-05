/**
 * Notices incoming calls on the paired phone and hands them to the CRM.
 *
 * Ringing while idle (callsetup=1, call=0):
 *   collect the caller number (CLIP, ~1.2 s) → POST /inbound/ring (retried with the SAME sessionId
 *   while it still rings) → InboundCallRunner until the call is over.
 *
 * Call waiting (call=1 + callsetup=1) behind a call this gateway runs (outbound or incoming):
 *   collect the number (+CCWA) → POST /inbound/ring {waiting:true} (the CRM records it and answers
 *   let_ring) → track it. It is NEVER answered: there is one Bluetooth audio link.
 *     callsetup leaves 1 while the call stays up, or everything idle → ended {not_answered}
 *     the first call ends and the waiting call rings on its own (call=0, callsetup=1) → handed over:
 *     the idle-ring path reports the SAME sessionId with waiting:false, so the CRM re-decides on
 *     that session (it may now hand it to the AI).
 *
 * Rules
 *   - Idle rings only while no call or setup runs (canWatch); waiting calls only while one runs
 *     (canWatchWaiting).
 *   - `busy` from the first ring until the call is over: the daemon claims no outbound call
 *     meanwhile, and the same ring is never reported twice.
 *   - CRM unreachable / refusing: do nothing. The phone keeps ringing for the person.
 */

import { randomBytes } from 'node:crypto';

import { callStateOf } from '../esp32/callScript.js';
import { InboundCallRunner } from './inboundRunner.js';

export const WATCHER_DEFAULTS = Object.freeze({
  clipWaitMs: 1_200, // CLIP / +CCWA normally accompany the first ring indication
  recentClipMs: 1_500, // a number that arrived just before callsetup=1 still belongs to this ring
  reportRetryMs: [500, 1_000, 2_000, 4_000],
  reportMaxMs: 30_000,
  waitingSettleMs: 300, // HFP indicators arrive one by one: confirm a waiting call really changed
  handoverMaxMs: 120_000, // a handed-over waiting session is reused only this long
});

const CALL_ID = /^in_[a-f0-9]{24}$/;
const newSessionId = () => `ring_${randomBytes(12).toString('hex')}`;
const isWaiting = (s) => s?.hfp === 'slc' && s.call === 1 && s.callsetup === 1;

export class InboundWatcher {
  constructor({ crm, outbox, makeLeg, canWatch = () => true, canWatchWaiting = () => false, runCall, log = () => {}, now = () => Date.now(), options = {}, runnerOptions = () => ({}) }) {
    this.crm = crm;
    this.outbox = outbox;
    this.makeLeg = makeLeg;
    this.canWatch = canWatch;
    this.canWatchWaiting = canWatchWaiting;
    this.runCall = runCall ?? ((runner) => runner.start());
    this.log = log;
    this.now = now;
    this.o = { ...WATCHER_DEFAULTS, ...options };
    this.runnerOptions = runnerOptions;
    this.device = null;
    this.ring = null; // the idle-ring session (its runner included)
    this.waiting = null; // a call-waiting session behind the current call
    this.handover = null; // a waiting session now ringing on its own, for the idle-ring path
    this.lastClip = null;
    this.lastWaitingNumber = null;
    this.waiters = new Set();
    this.unsubs = [];
  }

  /** True from a ring until that call is over (and any runner finished). */
  get busy() {
    return this.ring !== null || this.waiting !== null;
  }

  attach(device) {
    this.detach();
    this.device = device;
    const on = (event, fn) => {
      device.on(event, fn);
      this.unsubs.push(() => device.off(event, fn));
    };
    on('state', (s) => this.onState(s));
    on('event', (e) => this.onEvent(e));
    on('lost', () => this.onLost());
    this.poll();
  }

  detach() {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    if (this.ring) this.ring.lost = true;
    if (this.waiting) this.waiting.lost = true;
    this.handover = null;
    this.device = null;
    this.notify();
  }

  /** Re-check the current state (after a call or setup ends, and periodically). */
  poll() {
    if (this.device?.state) this.onState(this.device.state);
  }

  onEvent(e) {
    if (e.name === 'clip') {
      this.lastClip = { number: String(e.number || '').slice(0, 40), at: this.now() };
      this.notify();
    } else if (e.name === 'call_waiting') {
      this.lastWaitingNumber = { number: String(e.number || '').slice(0, 40), at: this.now() };
      this.notify();
    } else if (e.name === 'ring' && !this.ring && this.device && callStateOf(this.device.state || {}) === 'idle') {
      // RING ahead of +CIEV callsetup=1: ask for a fresh STATE instead of guessing.
      this.device.statusRequest?.().catch(() => {});
    }
  }

  onState(s) {
    this.notify();
    const device = this.device;
    if (!device || device.closed || s.hfp !== 'slc') return;
    if (callStateOf(s) === 'idle') this.handover = null; // the waiting call is gone too
    if (isWaiting(s) && !this.waiting && this.canWatchWaiting()) {
      this.handleWaiting().catch((err) => this.log('call_waiting_failed', { error: String(err?.message || err) }));
    }
    if (!this.ring && !this.waiting && callStateOf(s) === 'incoming' && this.canWatch()) {
      this.handle().catch((err) => this.log('inbound_watch_failed', { error: String(err?.message || err) }));
    }
  }

  onLost() {
    if (this.ring) this.ring.lost = true;
    if (this.waiting) this.waiting.lost = true;
    this.handover = null;
    this.notify();
  }

  // ---- a ring while idle ---------------------------------------------------------------------------

  async handle() {
    const device = this.device;
    const handover = this.takeHandover(device);
    const ring = {
      sessionId: handover?.sessionId || newSessionId(),
      startedAt: this.now(), // answerAfterMs/ringTimeout count from when it rings on its own
      at: handover?.at || new Date().toISOString(),
      number: handover?.number || '',
      device,
      lost: false,
    };
    this.ring = ring;
    this.log('inbound_ring', { sessionId: ring.sessionId, ...(handover ? { fromCallWaiting: true } : {}) });
    try {
      if (!ring.number) ring.number = await this.waitForClip(ring);
      const job = await this.report(ring, { waiting: false, stillRinging: () => this.ringing(ring) });
      if (!job) return; // the phone keeps ringing for a person
      if (!CALL_ID.test(String(job.callId || ''))) {
        this.log('inbound_ring_bad_response', { sessionId: ring.sessionId });
        return;
      }
      if (ring.lost || device.closed) {
        this.outbox.push(job.callId, 'outcome_unknown', { detail: 'ESP32 link lost while the CRM was deciding' });
        return;
      }
      this.log('inbound_call', { callId: job.callId, action: job.action, hasNumber: Boolean(ring.number) });
      const runner = new InboundCallRunner({
        device, job, ring, outbox: this.outbox, crm: this.crm, makeLeg: this.makeLeg, log: this.log, now: this.now, options: this.runnerOptions(),
      });
      await this.runCall(runner);
    } finally {
      // Never report the same ring twice, and never claim an outbound call over it. A waiting
      // call that now rings on its own (handed over) is a different ring: release for it.
      await this.waitFor(() => this.idleOrGone(ring) || this.handover?.device === ring.device);
      if (this.ring === ring) this.ring = null;
      this.lastClip = null;
      this.log('inbound_ring_done', { sessionId: ring.sessionId });
      this.poll();
    }
  }

  takeHandover(device) {
    const h = this.handover;
    this.handover = null;
    if (!h || h.device !== device || this.now() - h.handedAt > this.o.handoverMaxMs) return null;
    return h;
  }

  ringing(ring) {
    return !ring.lost && !ring.device.closed && callStateOf(ring.device.state || {}) === 'incoming';
  }

  idleOrGone(ring) {
    return ring.lost || ring.device.closed || this.device !== ring.device || callStateOf(ring.device.state || {}) === 'idle';
  }

  async waitForClip(ring) {
    const fresh = () => (this.lastClip && this.lastClip.at >= ring.startedAt - this.o.recentClipMs ? this.lastClip.number : null);
    await this.waitFor(() => fresh() !== null || !this.ringing(ring), this.o.clipWaitMs);
    return fresh() || ''; // withheld or not sent: the CRM treats '' as a private number
  }

  // ---- call waiting ---------------------------------------------------------------------------------

  async handleWaiting() {
    const device = this.device;
    const w = { sessionId: newSessionId(), startedAt: this.now(), at: new Date().toISOString(), number: '', device, lost: false, callId: null };
    this.waiting = w;
    this.log('call_waiting', { sessionId: w.sessionId });
    let outcome = 'gone';
    try {
      const stillWaiting = () => !w.lost && !device.closed && isWaiting(device.state);
      const fresh = () => (this.lastWaitingNumber && this.lastWaitingNumber.at >= w.startedAt - this.o.recentClipMs ? this.lastWaitingNumber.number : null);
      await this.waitFor(() => fresh() !== null || !stillWaiting(), this.o.clipWaitMs);
      w.number = fresh() || '';
      const job = await this.report(w, { waiting: true, stillRinging: stillWaiting });
      if (job && CALL_ID.test(String(job.callId || ''))) {
        w.callId = job.callId;
        // Recorded and left to the phone, whatever the action: a waiting call is never answered.
        this.outbox.push(w.callId, 'ringing', {});
        this.log('call_waiting_reported', { callId: w.callId, action: job.action });
      }
      outcome = await this.trackWaiting(w, stillWaiting);
    } finally {
      if (this.waiting === w) this.waiting = null;
      this.lastWaitingNumber = null;
      this.finishWaiting(w, outcome);
      this.poll();
    }
  }

  /** Resolves 'gone' (link lost), 'handover' (rings on its own) or 'not_answered'. */
  async trackWaiting(w, stillWaiting) {
    for (;;) {
      await this.waitFor(() => !stillWaiting());
      if (w.lost || w.device.closed || this.device !== w.device) return 'gone';
      await this.waitFor(() => w.lost || isWaiting(w.device.state), this.o.waitingSettleMs);
      if (w.lost || w.device.closed) return 'gone';
      const s = w.device.state || {};
      if (isWaiting(s)) continue; // indicator noise: still waiting
      if (s.hfp === 'slc' && s.call === 0 && s.callsetup === 1) return 'handover';
      return 'not_answered';
    }
  }

  finishWaiting(w, outcome) {
    this.log('call_waiting_done', { sessionId: w.sessionId, callId: w.callId, outcome });
    if (outcome === 'handover') {
      // The idle-ring path reports this SAME session (waiting:false) and the CRM re-decides.
      this.handover = { sessionId: w.sessionId, number: w.number, at: w.at, device: w.device, handedAt: this.now(), callId: w.callId };
      return;
    }
    if (!w.callId) return;
    if (outcome === 'gone') this.outbox.push(w.callId, 'outcome_unknown', { detail: 'ESP32 link lost while a call was waiting' });
    else this.outbox.push(w.callId, 'ended', { reason: 'not_answered' });
  }

  // ---- shared ---------------------------------------------------------------------------------------

  async report(ring, { waiting, stillRinging }) {
    const body = { sessionId: ring.sessionId, number: ring.number, simSlot: null, at: ring.at, waiting };
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.crm.ringInbound(body);
      } catch (err) {
        const retry = err.retryable && stillRinging() && this.now() - ring.startedAt < this.o.reportMaxMs;
        this.log(retry ? 'inbound_ring_report_retry' : 'inbound_ring_report_failed', {
          sessionId: ring.sessionId, waiting, attempt, status: err.status, code: err.code, error: String(err.message || err).slice(0, 200),
        });
        if (!retry) return null;
        const delays = this.o.reportRetryMs;
        await this.waitFor(() => !stillRinging(), delays[Math.min(attempt - 1, delays.length - 1)]);
        if (!stillRinging()) return null;
      }
    }
  }

  /** Resolves when predicate() holds (checked on every state/event/lost), or after timeoutMs. */
  waitFor(predicate, timeoutMs = null) {
    if (predicate()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let timer = null;
      const waiter = () => {
        if (!predicate()) return;
        done(true);
      };
      const done = (value) => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve(value);
      };
      if (timeoutMs !== null) timer = setTimeout(() => done(false), timeoutMs);
      this.waiters.add(waiter);
    });
  }

  notify() {
    for (const w of [...this.waiters]) w();
  }

  stop() {
    this.detach();
  }
}

/**
 * Runs ONE CRM-assigned call: ESP32 dial → phone call states → LiveKit `sip.callStatus` →
 * two-way audio between the phone and the agent → hang-up → events to the CRM.
 *
 * Endings and what the CRM is told:
 *   firmware refuses the DIAL, or LiveKit unreachable before dialing  → dial_refused (never dialed)
 *   phone stops ringing / ring timeout                                → ended {not_answered}
 *   lead hangs up                                                     → ended {remote_hangup}
 *   agent finished (CRM closed the room) / owner hang-up              → ended {local_hangup|owner_hangup}
 *   audio link lost while the call stays up                           → audio_lost, then ended {audio_lost}
 *   ESP32/USB or Bluetooth lost, or a hang-up the phone never confirms → outcome_unknown (never redialed)
 * Takeover: the ESP32 releases the audio link (the phone's own earpiece takes over), the gateway
 * leaves the room (the agent stops), and keeps watching the call until it ends.
 */

import { callStateOf } from '../esp32/callScript.js';
import { levelDbfs, playbackGain } from '../esp32/pcm.js';

const DEFAULTS = Object.freeze({
  audioWaitMs: 4_000, // then ask the phone for the audio link ourselves
  audioFailMs: 12_000, // no audio link at all after answer → hang up
  audioGraceMs: 2_000, // phones close audio just before a remote hang-up
  hangupConfirmMs: 10_000,
  agentLeftMs: 5_000, // agent gone but room still open: don't leave the lead in silence
  statsEveryMs: 2_000,
  speechDbfs: -45,
  agentGainDb: 0,
});

export class CallRunner {
  constructor({ device, job, outbox, crm, leg, log = () => {}, now = () => Date.now(), options = {} }) {
    this.device = device;
    this.job = job;
    this.outbox = outbox;
    this.crm = crm;
    this.leg = leg;
    this.log = (event, data = {}) => log(event, { callId: job.callId, ...data });
    this.now = now;
    this.o = { ...DEFAULTS, ...options };
    this.phase = 'joining';
    this.timers = new Map();
    this.answeredAt = null;
    this.firstAiAudioMs = null;
    this.sawSetup = false;
    this.audioOn = false;
    this.receivedPhoneAudio = false;
    this.hangupReason = null;
    this.result = null;
    this.unsubs = [];
    this.done = new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  emit(type, data = {}) {
    this.outbox.push(this.job.callId, type, data);
    this.log(`call_${type}`, data);
  }

  timer(name, ms, fn) {
    clearTimeout(this.timers.get(name));
    const t = setTimeout(() => {
      this.timers.delete(name);
      fn();
    }, ms);
    this.timers.set(name, t);
  }

  cancel(name) {
    clearTimeout(this.timers.get(name));
    this.timers.delete(name);
  }

  on(emitter, event, fn) {
    emitter.on(event, fn);
    this.unsubs.push(() => emitter.off(event, fn));
  }

  async start() {
    const { job } = this;
    if (!job.livekit?.token || !job.livekit?.url) {
      this.emit('dial_refused', { code: 'livekit_unavailable', detail: 'CRM has no LiveKit configuration' });
      return this.finish('not_dialed');
    }
    try {
      await this.leg.connect();
      await this.leg.setCallStatus('dialing');
    } catch (err) {
      this.emit('dial_refused', { code: 'livekit_unavailable', detail: String(err.message || err).slice(0, 200) });
      await this.leg.close();
      return this.finish('not_dialed');
    }
    this.on(this.device, 'state', (s) => this.onState(s));
    this.on(this.device, 'audio', ({ pcm }) => this.onPhoneAudio(pcm));
    this.on(this.device, 'lost', (reason) => this.unknown(`ESP32 link lost: ${reason}`));
    this.on(this.leg, 'agentAudio', (pcm) => this.onAgentAudio(pcm));
    this.on(this.leg, 'closed', () => this.onRoomClosed());
    this.on(this.leg, 'agentLeft', () => this.onAgentLeft());
    this.on(this.leg, 'error', (err) => this.log('livekit_error', { error: String(err?.message || err) }));

    try {
      await this.device.dial({ callRef: job.callRef, counter: job.counter, number: job.number, mac: Buffer.from(job.mac, 'hex') });
    } catch (err) {
      this.emit('dial_refused', { code: String(err.code || 'refused').slice(0, 60) });
      await this.leg.close();
      return this.finish('not_dialed');
    }
    this.phase = 'dialing';
    this.emit('dialing');
    this.timer('ring', (job.ringTimeoutSeconds || 45) * 1000, () => this.hangup('not_answered'));
    this.timer('max', ((job.maxCallSeconds || 300) + 60) * 1000, () => this.hangup('max_duration'));
    this.statsTimer = setInterval(() => this.sendStats(), this.o.statsEveryMs);
    return this.done;
  }

  // ---- phone side ---------------------------------------------------------------------------

  onState(s) {
    if (this.phase === 'done') return;
    if (s.hfp !== 'slc') {
      this.unknown(`Bluetooth hands-free link dropped (${s.hfp}) during the call`);
      return;
    }
    const cs = callStateOf(s);
    if (cs === 'dialing' || cs === 'alerting') this.sawSetup = true;
    if (this.phase === 'dialing' && (cs === 'dialing' || cs === 'alerting')) {
      this.phase = 'ringing';
      this.emit('ringing');
      this.leg.setCallStatus('ringing').catch(() => {});
    }
    if ((this.phase === 'dialing' || this.phase === 'ringing') && cs === 'active') {
      this.phase = 'active';
      this.answeredAt = this.now();
      this.cancel('ring');
      this.emit('answered');
      this.leg.setCallStatus('active').catch(() => {});
      this.timer('mediaFail', this.o.audioFailMs, () => {
        if (this.phase === 'active' && !this.receivedPhoneAudio) {
          this.emit('audio_lost', { detail: 'no decoded phone audio after answer' });
          this.hangup('audio_failed');
        }
      });
      if (s.audio !== 'on') this.armAudioWatch();
    }
    this.onAudioState(s);
    if (cs === 'idle') this.onIdle();
  }

  onAudioState(s) {
    const on = s.audio === 'on';
    if (on && !this.audioOn) {
      this.audioOn = true;
      this.cancel('audioWait');
      this.cancel('audioFail');
      this.cancel('audioGrace');
      if (s.codec !== 'cvsd') {
        this.emit('audio_lost', { detail: `unsupported codec ${s.codec}` });
        this.hangup('audio_failed');
        return;
      }
      this.emit('audio_opened', { codec: s.codec });
    } else if (!on && this.audioOn) {
      this.audioOn = false;
      if (this.phase === 'active') {
        this.timer('audioGrace', this.o.audioGraceMs, () => {
          if (this.phase === 'active' && !this.audioOn) {
            this.emit('audio_lost', { detail: 'audio link closed while the call stayed up' });
            this.hangup('audio_lost');
          }
        });
      }
    }
  }

  armAudioWatch() {
    this.timer('audioWait', this.o.audioWaitMs, () => {
      if (!this.audioOn) this.device.audioConnect().catch((err) => this.log('audio_connect_failed', { code: err.code }));
    });
    this.timer('audioFail', this.o.audioFailMs, () => {
      if (!this.audioOn && this.phase === 'active') {
        this.emit('audio_lost', { detail: 'no audio link after answer' });
        this.hangup('audio_failed');
      }
    });
  }

  onIdle() {
    const p = this.phase;
    // Android can open SCO (and report an idle call state) while it is still
    // creating the outgoing Telecom call. DIAL's ACK only accepts the request;
    // wait for actual setup before treating idle as a completed attempt.
    // The existing ring timer still bounds a phone that never starts setup.
    if ((p === 'dialing' || p === 'ringing') && this.sawSetup) this.end('not_answered');
    else if (p === 'active' || p === 'takeover') this.end('remote_hangup');
    else if (p === 'hanging_up') this.end(this.hangupReason);
  }

  onPhoneAudio(pcm) {
    if (this.phase !== 'active') return;
    this.receivedPhoneAudio = true;
    this.cancel('mediaFail');
    this.meter('rx', pcm);
    this.leg.pushPhoneAudio(pcm);
  }

  /** Mean-square accumulators per stats window, for honest live levels (not a single frame). */
  meter(dir, pcm) {
    const m = (this.meters ||= { rx: { sq: 0, n: 0 }, tx: { sq: 0, n: 0 } })[dir];
    for (const v of pcm) m.sq += v * v;
    m.n += pcm.length;
  }

  readMeter(dir) {
    const m = this.meters?.[dir];
    if (!m || !m.n) return null;
    const rms = Math.sqrt(m.sq / m.n);
    m.sq = 0;
    m.n = 0;
    return rms > 0 ? Math.round(200 * Math.log10(rms / 32768)) / 10 : -120;
  }

  // ---- agent side ---------------------------------------------------------------------------

  onAgentAudio(pcm) {
    if (this.phase !== 'active') return;
    pcm = playbackGain(pcm, this.o.agentGainDb);
    if (this.firstAiAudioMs === null && this.answeredAt !== null && levelDbfs(pcm) > this.o.speechDbfs) {
      this.firstAiAudioMs = this.now() - this.answeredAt;
      this.log('first_ai_audio', { ms: this.firstAiAudioMs });
    }
    this.meter('tx', pcm);
    this.device.play(pcm);
  }

  onRoomClosed() {
    if (['dialing', 'ringing', 'active'].includes(this.phase)) this.hangup('local_hangup');
  }

  onAgentLeft() {
    if (this.phase !== 'active') return;
    this.timer('agentLeft', this.o.agentLeftMs, () => {
      if (this.phase === 'active' && !this.leg.agentConnected) this.hangup('agent_left');
    });
  }

  // ---- control ------------------------------------------------------------------------------

  /** Owner commands from the CRM heartbeat. */
  async command(type) {
    if (this.phase === 'done') return;
    if (type === 'hangup') {
      await this.hangup('owner_hangup');
      this.emit('command_done', { type });
    } else if (type === 'takeover' && this.phase === 'active') {
      this.phase = 'takeover';
      this.device.clearPlayback();
      await this.device.audioDisconnect().catch((err) => this.log('takeover_audio_release_failed', { code: err.code }));
      await this.leg.close(); // the agent sees the line leave and wraps up
      this.emit('command_done', { type });
    }
  }

  async hangup(reason) {
    if (this.phase === 'done' || this.phase === 'hanging_up') return;
    this.phase = 'hanging_up';
    this.hangupReason = reason;
    this.cancel('ring');
    this.device.clearPlayback();
    this.leg.setCallStatus('hangup').catch(() => {});
    const ack = await this.device.hangup(this.job.callRef).catch((err) => ({ result: err.code }));
    this.log('hangup_sent', { reason, result: ack.result });
    // bad_state = the phone already has no call: that is the confirmation.
    if (ack.result === 'bad_state' || callStateOf(this.device.state || {}) === 'idle') {
      this.end(reason);
      return;
    }
    this.timer('hangupConfirm', this.o.hangupConfirmMs, () => {
      if (this.phase === 'hanging_up') this.unknown('the phone did not confirm the hang-up');
    });
  }

  end(reason) {
    if (this.phase === 'done') return;
    this.emit('ended', { reason });
    this.finish('ended', reason);
  }

  unknown(detail) {
    if (this.phase === 'done') return;
    this.emit('outcome_unknown', { detail: String(detail).slice(0, 300) });
    this.finish('outcome_unknown', detail);
  }

  sendStats() {
    if (this.phase === 'done') return;
    const a = this.device.audioSummary();
    const st = this.device.stats || {};
    const data = {
      rxLevelDbfs: this.readMeter('rx'),
      txLevelDbfs: this.readMeter('tx'),
      upFrames: a.upFrames,
      downFrames: a.downFramesSent,
      upSeqGaps: a.upSeqGaps,
      downUnderruns: st.downUnderruns ?? 0,
      downOverruns: st.downOverruns ?? 0,
      firstAiAudioMs: this.firstAiAudioMs,
      agentConnected: Boolean(this.leg.agentConnected),
    };
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));
    // Live monitoring only: best-effort, not through the durable outbox.
    this.crm.sendEvent(this.job.callId, { eventId: `stats-${this.job.callId}-${this.now()}`.slice(0, 80).replace(/[^A-Za-z0-9_-]/g, '_'), type: 'stats', data: clean })
      .catch(() => {});
  }

  finish(result, detail = null) {
    this.phase = 'done';
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    clearInterval(this.statsTimer);
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.leg?.setCallStatus?.('hangup')?.catch?.(() => {});
    Promise.resolve(this.leg?.close?.()).catch(() => {});
    this.result = { result, detail, firstAiAudioMs: this.firstAiAudioMs, answeredAt: this.answeredAt, legStats: this.leg?.stats };
    this.log('call_runner_done', { result, detail, firstAiAudioMs: this.firstAiAudioMs });
    this._resolve(this.result);
    return this.done;
  }
}

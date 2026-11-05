/**
 * Runs ONE incoming call on the paired phone, from the CRM's ring decision until the phone is idle.
 *
 * Everything after "the phone reports OUR answer" is the outbound CallRunner (audio bridge, audio
 * watch and recovery, remote-hang-up confirmation, stats, max duration, hang-up and takeover).
 * This class adds the part before it and the human-handled paths:
 *
 *   answer_ai:  join the room as `sip-<callId>` → wait for `updata.agent_ready` → wait until
 *               `answerAfterMs` after the first ring → phone still ringing and nobody answered? →
 *               `answering` + ANSWER → phone active → `answered` + sip.callStatus=active → AI call
 *   let_ring /
 *   ignore:     only track: active → `answered_elsewhere`; idle → `ended`
 *
 * Never answers when: the agent is not ready before the ring timeout (→ agent_unavailable
 * {agent_not_ready}), the ring stops (→ agent_unavailable {ring_stopped}), a person picks up first
 * (→ answered_elsewhere, the room is left), the firmware cannot answer (→ agent_unavailable
 * {firmware_no_answer}). In each case the call stays tracked as a human call until it ends.
 *
 * Phases: ringing (left for a person / deciding) · preparing (AI joining) · answering (ANSWER sent)
 *         · active (AI call) · takeover · human_active · rejecting · hanging_up · done
 */

import { callStateOf } from '../esp32/callScript.js';
import { CallRunner } from './callRunner.js';

export const INBOUND_DEFAULTS = Object.freeze({
  answerConfirmMs: 6_000, // ANSWER accepted, but the phone never reports the call active
  ownerAnswerReadyMs: 15_000, // owner tapped "Let AI answer": time the agent gets to be ready
  handsetAudioReleases: 3, // person answered on the handset: hand the audio back this many times
});

const RINGING = new Set(['ringing', 'preparing', 'answering']);
const AI_AUDIO = new Set(['active', 'takeover']);

/** A stable nonzero u32 for the firmware (ANSWER/HANGUP payload) from `in_<24 hex>`. */
export function inboundCallRef(callId) {
  const hex = String(callId || '').replace(/^in_/, '').slice(0, 8);
  return (Number.parseInt(hex, 16) >>> 0) || 1;
}

const ringTimeoutMs = (job) => Math.max(1, Number(job.ringTimeoutSeconds) || 45) * 1000;

export class InboundCallRunner extends CallRunner {
  constructor({ device, job, ring, outbox, crm, makeLeg, log = () => {}, now = () => Date.now(), options = {} }) {
    super({ device, job: { ...job, callRef: inboundCallRef(job.callId) }, outbox, crm, leg: null, log, now, options: { ...INBOUND_DEFAULTS, ...options } });
    this.ring = ring; // { sessionId, startedAt (now() clock), number }
    this.makeLeg = makeLeg;
    this.phase = 'ringing';
    this.roomLeft = false;
    this.handled = new Set();
    this.handsetReleases = 0;
    this.releasingAudio = false;
  }

  async start() {
    if (this.device.closed) {
      this.emit('outcome_unknown', { detail: 'ESP32 link lost before the call could be tracked' });
      return this.finish('outcome_unknown', 'device closed');
    }
    this.attachDevice();
    this.emit('ringing');
    // The call may have moved on while the CRM was deciding.
    if (this.device.state) this.onState(this.device.state);
    if (this.phase === 'ringing' && this.job.action === 'answer_ai') {
      this.startAi(this.job, { deadlineAt: this.ring.startedAt + ringTimeoutMs(this.job) });
    }
    return this.done;
  }

  // ---- AI answer --------------------------------------------------------------------------------

  async startAi(job, { deadlineAt }) {
    if (this.phase !== 'ringing') return;
    this.job = { ...this.job, ...job, callId: this.job.callId, callRef: this.job.callRef };
    if (this.device.supportsAnswer === false) {
      this.aiUnavailable('firmware_no_answer', 'The ESP32 firmware cannot answer calls; update it to 0.1.4 or newer');
      return;
    }
    if (!this.job.livekit?.url || !this.job.livekit?.token) {
      this.aiUnavailable('livekit_unavailable', 'The CRM sent no voice room for this call');
      return;
    }
    this.phase = 'preparing';
    this.roomLeft = false;
    this.leg = this.makeLeg(this.job);
    this.attachLeg();
    const remaining = () => Math.max(0, deadlineAt - this.now());
    this.timer('agentDeadline', remaining(), () => this.aiUnavailable('agent_not_ready', 'The voice agent was not ready before the ring timeout; the call was left for a person'));
    const leg = this.leg;
    try {
      this.connecting = leg.connect();
      await this.connecting;
      if (this.phase !== 'preparing' || this.leg !== leg) return;
      await leg.setCallStatus('ringing');
      await leg.waitForAgentReady(remaining() + 1_000);
    } catch (err) {
      if (this.phase === 'preparing' && this.leg === leg) this.aiUnavailable(String(err.code || 'agent_not_ready').slice(0, 60), String(err.message || err));
      return;
    }
    if (this.phase !== 'preparing' || this.leg !== leg) return;
    const wait = Math.max(0, this.ring.startedAt + Math.max(0, Number(this.job.answerAfterMs) || 0) - this.now());
    this.timer('answerAt', wait, () => { this.sendAnswer().catch((err) => this.log('answer_failed', { error: String(err?.message || err) })); });
  }

  async sendAnswer() {
    if (this.phase !== 'preparing') return;
    // Ring stopped (confirming) or a person answered: the state handler decides, never answer.
    if (callStateOf(this.device.state || {}) !== 'incoming' || this.timers.has('remoteHangup')) return;
    this.cancel('agentDeadline');
    this.phase = 'answering';
    this.emit('answering');
    const ack = await this.device.answer(this.job.callRef).catch((err) => ({ result: err.code || 'error' }));
    this.log('answer_sent', { result: ack.result });
    if (this.phase !== 'answering') return; // already active, or ended meanwhile
    if (ack.result === 'ok') {
      this.timer('answerConfirm', this.o.answerConfirmMs, () => {
        if (this.phase === 'answering' && this.lastCallState === 'incoming') {
          this.aiUnavailable('answer_failed', 'The phone accepted ANSWER but never reported the call active');
        }
      });
      return;
    }
    if (ack.result === 'unknown_type') this.aiUnavailable('firmware_no_answer', 'The ESP32 firmware does not support ANSWER; update it to 0.1.4 or newer');
    else this.aiUnavailable(`answer_${ack.result}`.slice(0, 60), `The ESP32 refused ANSWER (${ack.result})`);
  }

  /** The AI will not answer this call; a person still can. Keep tracking. */
  aiUnavailable(code, detail) {
    if (!RINGING.has(this.phase)) return;
    for (const t of ['agentDeadline', 'answerAt', 'answerConfirm']) this.cancel(t);
    this.emit('agent_unavailable', { code, detail: String(detail).slice(0, 300) });
    this.leaveRoom();
    this.phase = 'ringing';
  }

  leaveRoom() {
    const leg = this.leg;
    if (!leg || this.roomLeft) return;
    this.roomLeft = true;
    // Wait for an in-flight connect, so the room is really left, not abandoned half-joined.
    Promise.resolve(this.connecting).catch(() => {})
      .then(() => leg.setCallStatus('hangup')).catch(() => {})
      .then(() => leg.close()).catch(() => {});
  }

  // ---- phone side -------------------------------------------------------------------------------

  onState(s) {
    if (this.phase === 'done') return;
    if (s.hfp !== 'slc') {
      this.unknown(`Bluetooth hands-free link dropped (${s.hfp}) during the call`);
      return;
    }
    const cs = this.ownCallState(s);
    this.lastCallState = cs;
    if (cs !== 'idle') this.cancel('remoteHangup');
    if (cs === 'active') {
      if (this.phase === 'answering') this.markActive(s);
      else if (this.phase === 'ringing' || this.phase === 'preparing' || this.phase === 'rejecting') this.answeredElsewhere();
    }
    if (AI_AUDIO.has(this.phase)) this.onAudioState(s);
    else if (this.phase === 'human_active') this.releaseToHandset(s);
    if (cs === 'idle') this.onIdle();
  }

  markActive(s) {
    this.cancel('answerConfirm');
    super.markActive(s);
    this.timer('max', ((Number(this.job.maxCallSeconds) || 300) + 60) * 1000, () => this.hangup('max_duration'));
    this.statsTimer = setInterval(() => this.sendStats(), this.o.statsEveryMs);
  }

  /** The call went active without our ANSWER: a person picked up on the phone. */
  answeredElsewhere() {
    for (const t of ['agentDeadline', 'answerAt', 'answerConfirm', 'hangupConfirm']) this.cancel(t);
    this.phase = 'human_active';
    this.answeredAt = this.now();
    this.emit('answered_elsewhere');
    this.leaveRoom();
  }

  /** Android routes call audio to a connected hands-free device; the person needs it on the handset. */
  releaseToHandset(s) {
    if (s.audio !== 'on' || this.releasingAudio || this.handsetReleases >= this.o.handsetAudioReleases) return;
    this.releasingAudio = true;
    this.handsetReleases += 1;
    this.device.audioDisconnect()
      .then(() => this.log('audio_released_to_handset'))
      .catch((err) => this.log('audio_release_failed', { code: err.code }))
      .finally(() => { this.releasingAudio = false; });
  }

  onIdle() {
    if (this.phase === 'hanging_up') {
      this.end(this.hangupReason);
      return;
    }
    if (this.timers.has('remoteHangup')) return;
    // HFP indicators arrive separately (callsetup=0 can precede call=1): confirm before ending.
    this.timer('remoteHangup', this.o.remoteHangupConfirmMs, () => this.confirmedIdle());
    void this.device.statusRequest().catch((err) => this.log('idle_status_failed', { code: err.code }));
  }

  confirmedIdle() {
    if (this.lastCallState !== 'idle' || this.phase === 'done') return;
    switch (this.phase) {
      case 'preparing':
        this.aiUnavailable('ring_stopped', 'The call stopped ringing before the voice agent was ready');
        this.end('not_answered');
        break;
      case 'ringing':
      case 'answering':
        this.end('not_answered');
        break;
      case 'rejecting':
        this.end('rejected');
        break;
      case 'active':
      case 'takeover':
      case 'human_active':
        this.end('remote_hangup');
        break;
      default:
    }
  }

  onRoomClosed(reason) {
    if (this.roomLeft || this.phase === 'done') return;
    this.log('voice_room_closed', { reason: String(reason || 'unknown').slice(0, 100), phase: this.phase });
    if (this.phase === 'preparing') this.aiUnavailable('room_closed', `Voice room closed before answering (${reason})`);
    else if (this.phase === 'answering' || this.phase === 'active') this.hangup('local_hangup');
  }

  // ---- owner commands (heartbeat; repeated until command_done reaches the CRM) -------------------

  async command(type) {
    if (this.phase === 'done' || this.handled.has(type)) return;
    if (type === 'reject') await this.reject();
    else if (type === 'answer') await this.ownerAnswer();
    else if (type === 'takeover') {
      if (this.phase !== 'active') return;
      this.handled.add(type);
      this.roomLeft = true; // we leave on purpose: not a room failure
      await super.command('takeover');
    } else if (type === 'hangup') {
      if (this.phase === 'hanging_up' || this.phase === 'rejecting') return;
      this.handled.add(type);
      this.leaveRoom();
      await super.command('hangup');
    }
  }

  async reject() {
    if (!RINGING.has(this.phase)) return;
    this.handled.add('reject');
    for (const t of ['agentDeadline', 'answerAt', 'answerConfirm']) this.cancel(t);
    this.leaveRoom();
    this.phase = 'rejecting';
    const ack = await this.device.hangup(this.job.callRef).catch((err) => ({ result: err.code }));
    this.log('reject_sent', { result: ack.result });
    this.emit('command_done', { type: 'reject' });
    if (this.phase !== 'rejecting') return;
    this.timer('hangupConfirm', this.o.hangupConfirmMs, () => {
      if (this.phase === 'rejecting') this.unknown('the phone did not confirm the rejection');
    });
    if (ack.result === 'bad_state' || this.lastCallState === 'idle') {
      void this.device.statusRequest().catch(() => {});
      if (this.lastCallState === 'idle') this.onIdle();
    }
  }

  /** Owner tapped "Let AI answer" on a call that was left ringing for a person. */
  async ownerAnswer() {
    if (this.phase !== 'ringing') return;
    this.handled.add('answer');
    let job;
    try {
      job = await this.crm.inboundAnswerJob(this.job.callId);
    } catch (err) {
      if (err.retryable) {
        this.handled.delete('answer'); // the next heartbeat repeats the command
        this.log('answer_job_retry', { error: String(err.message || err).slice(0, 200) });
        return;
      }
      this.emit('command_done', { type: 'answer' });
      if (this.phase === 'ringing') this.emit('agent_unavailable', { code: 'answer_job_failed', detail: String(err.message || err).slice(0, 300) });
      return;
    }
    this.emit('command_done', { type: 'answer' });
    if (this.phase !== 'ringing') return;
    if (job?.action !== 'answer_ai') {
      this.emit('agent_unavailable', { code: 'answer_job_refused', detail: `The CRM did not hand this call to the AI (${job?.action || 'no action'})` });
      return;
    }
    // "Now": answer as soon as the agent is ready (answerAfterMs 0 = already past).
    const deadlineAt = this.now() + Math.min(ringTimeoutMs(job), this.o.ownerAnswerReadyMs);
    await this.startAi({ ...job, answerAfterMs: 0 }, { deadlineAt });
  }

  /** Gateway stopping: end a call the AI holds; a person's call is left alone but no longer tracked. */
  async shutdown() {
    if (this.phase === 'answering' || this.phase === 'active') {
      await this.hangup('local_hangup');
      return;
    }
    if (this.phase === 'done' || this.phase === 'hanging_up') return;
    this.leaveRoom();
    this.unknown('the gateway stopped while the call was in progress');
  }
}

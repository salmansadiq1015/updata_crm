/**
 * Host side of one ESP32 HFP bridge over a byte stream (a SerialPort in production, an in-memory
 * duplex in tests). Owns the protocol session, command/ACK matching, liveness, and the call-audio
 * pipeline in both directions.
 *
 * Audio pacing: the phone's SCO clock drives the firmware, which sends one 20 ms AUDIO_UP frame per
 * 20 ms of call audio and reports how much downstream audio it still holds (downLevelBytes). For
 * every AUDIO_UP we send enough AUDIO_DOWN to keep that level near `targetLevelBytes` (60 ms by
 * default): queued prompt/agent audio first, silence otherwise. So there is no host timer to drift,
 * and the buffer stays bounded on both ends.
 *
 * Events: hello · state · event · stats · log · audio {pcm, sampleIndex} · prompt_done · lost · error
 */

import { EventEmitter } from 'node:events';

import { CAP, FrameDecoder, SeqTracker, T, PROTO_MAJOR, CODEC_RATE, build, encodeFrame, parse } from './protocol.js';
import { bufferFromPcm, pcmFromBuffer } from './pcm.js';
import { callStateOf } from './callScript.js';

const FRAME_SAMPLES = 160; // 20 ms at 8 kHz

export class DeviceError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export class Esp32Device extends EventEmitter {
  constructor(stream, options = {}) {
    super();
    this.stream = stream;
    this.ackTimeoutMs = options.ackTimeoutMs ?? 2000;
    this.targetLevelBytes = options.targetLevelBytes ?? 960;
    this.keepaliveMs = options.keepaliveMs ?? 1000;
    this.lostAfterMs = options.lostAfterMs ?? 3000;
    this.now = options.now ?? (() => Date.now());
    this.decoder = new FrameDecoder();
    this.upSeq = new SeqTracker();
    this.seq = 0;
    this.pending = new Map();
    this.info = null;
    this.sessionValid = false;
    this.probing = false;
    this.state = null;
    this.lastRx = this.now();
    this.closed = false;
    this.record = false;
    this.rx = [];
    this.tx = [];
    this.playQueue = new Int16Array(0);
    this.playPos = 0;
    this.downIndex = 0;
    this.audio = { upFrames: 0, upSampleGaps: 0, downFrames: 0, promptSamplesSent: 0, codecs: new Set() };
    this.nextUpIndex = null;

    this._onData = (chunk) => this._receive(chunk);
    this._onClose = () => this._lost('stream closed');
    this._onError = (err) => this.emit('error', err);
    stream.on('data', this._onData);
    stream.on('close', this._onClose);
    stream.on('end', this._onClose);
    stream.on('error', this._onError);
    this.timer = setInterval(() => this._keepalive(), this.keepaliveMs);
  }

  // ---- session --------------------------------------------------------------------------------

  async hello() {
    if (this.closed) throw new DeviceError('device link is closed', 'closed');
    const ack = this._awaitType(T.HELLO_ACK);
    this._send(T.HELLO, build.hello());
    this.info = await ack;
    if (this.info.protoMajor !== PROTO_MAJOR) {
      throw new DeviceError(`firmware speaks protocol ${this.info.protoMajor}.${this.info.protoMinor}, gateway ${PROTO_MAJOR}.x`, 'proto_mismatch');
    }
    this.sessionValid = true;
    this.emit('hello', this.info);
    return this.info;
  }

  command(type, payload = Buffer.alloc(0)) {
    if (this.closed) return Promise.reject(new DeviceError('device link is closed', 'closed'));
    const seq = this.seq;
    // Register before writing: a stream may deliver the ACK synchronously inside write().
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new DeviceError(`no ACK for command 0x${type.toString(16)} within ${this.ackTimeoutMs} ms`, 'ack_timeout'));
      }, this.ackTimeoutMs);
      this.pending.set(seq, { resolve, reject, timer, type });
    });
    this._send(type, payload);
    return result;
  }

  async ok(type, payload) {
    const ack = await this.command(type, payload);
    if (ack.code !== 0) throw new DeviceError(`command 0x${type.toString(16)} refused: ${ack.result}`, ack.result);
    return ack;
  }

  hfpConnect(phone) {
    return this.ok(T.HFP_CONNECT, build.hfpConnect(phone));
  }

  hfpDisconnect() {
    return this.ok(T.HFP_DISCONNECT);
  }

  setDiscoverable(seconds) {
    return this.ok(T.SET_DISCOVERABLE, build.setDiscoverable(seconds));
  }

  dial(auth) {
    return this.ok(T.DIAL, build.dial(auth));
  }

  hangup(callRef) {
    return this.command(T.HANGUP, build.hangup(callRef)); // caller decides; bad_state means "already idle"
  }

  /**
   * Answer the ringing incoming call (firmware 0.1.4+). Resolves with the ACK like hangup(): the
   * caller decides; `unknown_type` means the firmware predates answering, `bad_state` that the
   * phone is not (or no longer) ringing.
   */
  answer(callRef) {
    return this.command(T.ANSWER, build.answer(callRef));
  }

  /** True when the firmware advertises T.ANSWER (HELLO_ACK capability bit). */
  get supportsAnswer() {
    return Boolean(this.info && (this.info.capabilities & CAP.ANSWER));
  }

  audioConnect() {
    return this.ok(T.AUDIO_CONNECT);
  }

  /** Release the SCO link: the phone's own earpiece/microphone take the call over. */
  audioDisconnect() {
    return this.ok(T.AUDIO_DISCONNECT);
  }

  provisionKey(key) {
    return this.ok(T.PROVISION_KEY, build.provisionKey(key));
  }

  statusRequest() {
    return this.ok(T.STATUS_REQ);
  }

  get callState() {
    return this.state ? callStateOf(this.state) : 'idle';
  }

  /** Waits until predicate(state) is true (checks the current state first). */
  waitForState(predicate, timeoutMs) {
    if (this.state && predicate(this.state)) return Promise.resolve(this.state);
    return new Promise((resolve, reject) => {
      const onState = (s) => {
        if (predicate(s)) {
          cleanup();
          resolve(s);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new DeviceError(`state not reached within ${timeoutMs} ms`, 'state_timeout'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.off('state', onState);
      };
      this.on('state', onState);
    });
  }

  // ---- audio ----------------------------------------------------------------------------------

  /** Queue 8 kHz samples for the phone (after anything already queued). */
  play(samples) {
    const rest = this.playQueue.subarray(this.playPos);
    const next = new Int16Array(rest.length + samples.length);
    next.set(rest, 0);
    next.set(samples, rest.length);
    this.playQueue = next;
    this.playPos = 0;
  }

  get playing() {
    return this.playPos < this.playQueue.length;
  }

  /** Drop queued audio (barge-in, hang-up, takeover). */
  clearPlayback() {
    this.playQueue = new Int16Array(0);
    this.playPos = 0;
  }

  _onAudioUp(a) {
    this.audio.upFrames += 1;
    this.audio.codecs.add(a.codec);
    const pcm = pcmFromBuffer(a.pcm);
    if (this.nextUpIndex !== null && a.sampleIndex !== this.nextUpIndex) this.audio.upSampleGaps += 1;
    this.nextUpIndex = (a.sampleIndex + pcm.length) >>> 0;
    if (this.record) this.rx.push(pcm);
    this.emit('audio', { pcm, sampleIndex: a.sampleIndex, codec: a.codec, rate: CODEC_RATE[a.codec] });

    // Top the firmware's playback buffer up towards the target, one 20 ms frame at a time.
    const frameBytes = FRAME_SAMPLES * 2;
    let level = a.downLevelBytes;
    let frames = 0;
    while (level < this.targetLevelBytes && frames < 3) {
      this._sendAudioFrame();
      level += frameBytes;
      frames += 1;
    }
  }

  _sendAudioFrame() {
    const out = new Int16Array(FRAME_SAMPLES);
    const wasPlaying = this.playing;
    const take = Math.min(FRAME_SAMPLES, this.playQueue.length - this.playPos);
    if (take > 0) {
      out.set(this.playQueue.subarray(this.playPos, this.playPos + take));
      this.playPos += take;
      this.audio.promptSamplesSent += take;
    }
    this._send(T.AUDIO_DOWN, build.audioDown(this.downIndex, bufferFromPcm(out)));
    this.downIndex = (this.downIndex + FRAME_SAMPLES) >>> 0;
    this.audio.downFrames += 1;
    if (this.record) this.tx.push(out);
    if (wasPlaying && !this.playing) this.emit('prompt_done');
  }

  startRecording() {
    this.record = true;
    this.rx = [];
    this.tx = [];
  }

  recorded() {
    const join = (parts) => {
      const total = parts.reduce((n, p) => n + p.length, 0);
      const out = new Int16Array(total);
      let off = 0;
      for (const p of parts) {
        out.set(p, off);
        off += p.length;
      }
      return out;
    };
    return { remote: join(this.rx), sent: join(this.tx) };
  }

  audioSummary() {
    return {
      upFrames: this.audio.upFrames,
      upSeqGaps: this.upSeq.gaps,
      upFramesLost: this.upSeq.lost,
      upSampleGaps: this.audio.upSampleGaps,
      downFramesSent: this.audio.downFrames,
      promptSamplesSent: this.audio.promptSamplesSent,
      codecs: [...this.audio.codecs],
      decoder: { ...this.decoder.stats },
    };
  }

  // ---- plumbing -------------------------------------------------------------------------------

  close() {
    if (this.closed) return;
    this.closed = true;
    this.sessionValid = false;
    clearInterval(this.timer);
    this.stream.off('data', this._onData);
    this.stream.off('close', this._onClose);
    this.stream.off('end', this._onClose);
    this.stream.off('error', this._onError);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new DeviceError('device link closed', 'closed'));
    }
    this.pending.clear();
  }

  _send(type, payload) {
    const seq = this.seq;
    this.seq = (this.seq + 1) & 0xffff;
    this.stream.write(encodeFrame(type, seq, payload));
    return seq;
  }

  _awaitType(type) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(`frame:${type}`, onFrame);
        reject(new DeviceError(`no reply 0x${type.toString(16)} within ${this.ackTimeoutMs} ms (wrong port, baud, or firmware?)`, 'no_reply'));
      }, this.ackTimeoutMs);
      const onFrame = (v) => {
        clearTimeout(timer);
        resolve(v);
      };
      this.once(`frame:${type}`, onFrame);
    });
  }

  _receive(chunk) {
    for (const f of this.decoder.push(chunk)) {
      this.lastRx = this.now();
      this.upSeq.see(f.seq);
      const parser = parse[f.type];
      if (!parser) continue;
      let v;
      try {
        v = parser(f.payload);
      } catch {
        continue; // short/garbled payload that still passed CRC: ignore, never crash the gateway
      }
      this.emit(`frame:${f.type}`, v);
      switch (f.type) {
        case T.ACK: {
          const p = this.pending.get(v.ackedSeq);
          if (p) {
            if (v.result === 'no_session') this.sessionValid = false;
            clearTimeout(p.timer);
            this.pending.delete(v.ackedSeq);
            p.resolve(v);
          }
          break;
        }
        case T.STATE:
          this.state = v;
          this.emit('state', v);
          break;
        case T.EVENT:
          if (v.name === 'boot' && this.info) {
            // PING works without a session, so liveness alone cannot detect a
            // reset. The old nonce/key status must not survive a device reboot.
            this.emit('event', v);
            this._lost('device rebooted; new protocol session required');
            return;
          }
          this.emit('event', v);
          break;
        case T.STATS:
          this.stats = v;
          this.emit('stats', v);
          break;
        case T.LOG:
          this.emit('log', v);
          break;
        case T.AUDIO_UP:
          this._onAudioUp(v);
          break;
        default:
      }
    }
  }

  _keepalive() {
    if (this.closed) return;
    if (this.info && this.now() - this.lastRx > this.lostAfterMs) {
      this._lost(`no frame from the device for ${this.lostAfterMs} ms`);
      return;
    }
    if (this.info) {
      // Firmware answers PING even after its host watchdog invalidates HELLO.
      // A PONG alone must never keep a dead control session "ready" forever.
      this._send(T.PING, build.ping(this.now() & 0xffffffff));
      if (!this.probing) {
        this.probing = true;
        this.statusRequest().then(() => { this.probeTimeouts = 0; }, error => {
          if (this.closed) return;
          // One lost frame on the serial line (no ACK) must not tear down a healthy session — the
          // protocol is designed so a dropped frame costs one frame. Two misses in a row, an
          // explicit refusal (no_session…) or silence (lostAfterMs, above) still mean "lost".
          if (error.code === 'ack_timeout' && this.now() - this.lastRx <= this.lostAfterMs && (this.probeTimeouts = (this.probeTimeouts || 0) + 1) < 2) {
            this.emit('probe_retry', { code: error.code });
            return;
          }
          this._lost(`USB control session check failed: ${error.code || error.message}`);
        }).finally(() => { this.probing = false; });
      }
    }
  }

  _lost(reason) {
    if (this.closed) return;
    this.sessionValid = false;
    this.emit('lost', reason);
    this.close();
  }
}

/**
 * Protocol-level SIMULATION of the ESP32 bridge firmware plus a phone, for gateway tests only.
 * It re-implements the firmware's documented rules (session nonce, dial authorization, counter,
 * call indicators, 20 ms AUDIO_UP pacing, bounded playback buffer, ANSWER of an incoming call and
 * the host-owned watchdog) in JS. It proves the gateway talks the protocol correctly; it proves
 * nothing about Bluetooth or cellular audio.
 *
 * Incoming calls: incoming() rings the phone (callsetup=1 + RING + CLIP), answerOnHandset() is a
 * person picking up on the phone, callerHangup() ends any call, stopRinging() is a caller giving up.
 * incoming() during a call is call waiting (call=1 + callsetup=1 + CALL_WAITING event, no RING);
 * when the active call then ends, the waiting call keeps ringing on its own (RING + CLIP).
 */

import { randomBytes } from 'node:crypto';
import { duplexPair } from 'node:stream';

import { FrameDecoder, T, encodeFrame } from '../../src/esp32/protocol.js';
import { verifyDial } from '../../src/esp32/dialAuth.js';

const FRAME_BYTES = 320;
const DOWN_CAP = 4800;

export function createFakeEsp32(opts = {}) {
  const [hostSide, deviceSide] = duplexPair();
  const o = {
    answerAfterMs: 30,
    audio: 'phone', // 'phone' opens SCO at answer, 'gateway' only on AUDIO_CONNECT, 'never'
    audioFrames: true,
    remoteHangupAfterMs: null,
    buttonHeld: false,
    key: null,
    speech: (i) => Math.round(3000 * Math.sin((2 * Math.PI * 440 * i) / 8000)),
    minDialIntervalMs: 0,
    respond: true,
    answerSupported: true, // false = firmware older than 0.1.4 (no ANSWER, no capability bit)
    answerAck: null, // force an ACK code for ANSWER (e.g. 2 = unknown_type while advertising it)
    answerLatencyMs: 20, // ATA → phone reports the call active
    answerAudio: true, // the phone opens SCO after an ANSWER (o.audio still applies)
    hostTimeoutMs: null, // model the firmware's host-lost watchdog
    ...opts,
  };
  const dec = new FrameDecoder();
  const s = { session: false, nonce: null, key: o.key, lastCounter: 0, hfp: 0, call: 0, callsetup: 0, audio: 0, codec: 0, callRef: 0, owned: false, ownedLive: false, hostLostPending: false };
  const down = [];
  let downBytes = 0;
  let upIndex = 0;
  let seq = 0;
  const timers = new Set();
  const log = { dials: [], hangups: 0, answers: 0, watchdogHangups: 0, audioReleases: 0, played: [], downOverruns: 0, commands: [] };
  let ticker = null;
  let lastRx = Date.now();
  let ringTimer = null;

  const later = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const send = (type, payload = Buffer.alloc(0)) => {
    if (!deviceSide.destroyed) deviceSide.write(encodeFrame(type, seq++ & 0xffff, payload));
  };
  const ack = (f, code) => send(T.ACK, Buffer.from([f.seq & 0xff, f.seq >> 8, f.type, code]));
  const state = () => {
    const p = Buffer.alloc(o.answerSupported ? 23 : 22);
    p[0] = s.call && s.audio === 2 ? 6 : s.call || s.callsetup ? 5 : s.hfp === 3 ? 4 : 2;
    p[1] = s.hfp;
    p[2] = s.call;
    p[3] = s.callsetup;
    p[4] = s.audio;
    p[5] = s.codec;
    p[6] = 4;
    p[7] = 5;
    p.writeUInt32LE(s.callRef, 14);
    p.writeUInt32LE(879, 18);
    if (o.answerSupported) p[22] = s.owned ? 1 : 0;
    send(T.STATE, p);
  };
  // Same rules as esp32/firmware/main/callowner.h.
  const claim = (answering) => { s.owned = true; s.ownedLive = answering; s.answering = answering; };
  const release = () => { s.owned = false; s.ownedLive = false; s.answering = false; };
  const indicators = () => {
    if (!s.owned) return;
    if (!s.call && s.callsetup === 1 && !s.answering) return release();
    if (s.call || s.callsetup) {
      s.ownedLive = true;
      if (s.call) s.answering = false;
    } else if (s.ownedLive) release();
  };
  const setCall = (call, callsetup) => {
    s.call = call;
    s.callsetup = callsetup;
    indicators();
    if (!s.callsetup) {
      clearInterval(ringTimer);
      ringTimer = null;
    }
    state();
  };
  const event = (code, data = Buffer.alloc(0)) => send(T.EVENT, Buffer.concat([Buffer.from([code]), data]));
  const helloAck = () => {
    const fw = Buffer.from('0.1.0-fake');
    const idf = Buffer.from('v5.5.6');
    const p = Buffer.alloc(30);
    p[0] = 1;
    p[1] = 0;
    p[2] = 3;
    p[3] = 0x37 | (o.answerSupported ? 0x40 : 0);
    Buffer.from([0x24, 0x0a, 0xc4, 0x00, 0x11, 0x22]).copy(p, 4);
    s.nonce.copy(p, 10);
    p.writeUInt16LE(1024, 26);
    p[28] = 1;
    p[29] = s.key ? 1 : 0;
    send(T.HELLO_ACK, Buffer.concat([p, Buffer.from([fw.length]), fw, Buffer.from([idf.length]), idf]));
  };

  const startAudio = () => {
    if (s.audio === 2) return;
    s.audio = 2;
    s.codec = o.codec ?? 1;
    upIndex = 0;
    state();
    ticker = setInterval(() => {
      if (!o.audioFrames) return;
      // phone -> host: 20 ms of "remote speech"
      const p = Buffer.alloc(7 + FRAME_BYTES);
      p.writeUInt32LE(upIndex, 0);
      p.writeUInt16LE(downBytes, 4);
      p[6] = s.codec;
      for (let i = 0; i < FRAME_BYTES / 2; i += 1) p.writeInt16LE(o.speech(upIndex + i), 7 + 2 * i);
      upIndex += FRAME_BYTES / 2;
      send(T.AUDIO_UP, p);
      // host -> phone: play out 20 ms from the buffer
      let need = FRAME_BYTES;
      while (need > 0 && down.length) {
        const chunk = down[0];
        const take = Math.min(need, chunk.length);
        log.played.push(chunk.subarray(0, take));
        if (take === chunk.length) down.shift();
        else down[0] = chunk.subarray(take);
        need -= take;
        downBytes -= take;
      }
    }, 20);
  };
  const stopAudio = () => {
    clearInterval(ticker);
    ticker = null;
    if (s.audio) {
      s.audio = 0;
      s.codec = 0;
      state();
    }
  };
  let ringNumber = null;
  let ringClip = true;
  const startRinging = (ringEveryMs) => {
    const ring = () => {
      event(1);
      if (ringClip && ringNumber) event(2, Buffer.from(ringNumber, 'ascii'));
    };
    ring();
    clearInterval(ringTimer);
    ringTimer = setInterval(() => { if (s.callsetup === 1 && !s.call) ring(); }, ringEveryMs);
  };
  const endCall = () => {
    stopAudio();
    setCall(0, 0);
  };
  /** The active call ends; a waiting call (if any) now rings on its own, like a real phone. */
  const endActiveCall = () => {
    if (!(s.call === 1 && s.callsetup === 1)) return endCall();
    stopAudio();
    setCall(0, 1);
    startRinging(2000);
    return undefined;
  };
  const watchdog = o.hostTimeoutMs === null ? null : setInterval(() => {
    // Firmware: end only a host-owned call when the host has gone silent.
    if (s.session && (s.call || s.callsetup) && s.owned && Date.now() - lastRx > o.hostTimeoutMs) {
      s.session = false;
      s.hostLostPending = true;
      log.watchdogHangups += 1;
      endCall();
    }
  }, 10);

  const handle = (f) => {
    lastRx = Date.now();
    log.commands.push(f.type);
    if (!o.respond) return;
    if (f.type === T.AUDIO_DOWN) {
      if (s.audio !== 2) return;
      const pcm = f.payload.subarray(4);
      if (downBytes + pcm.length > DOWN_CAP) log.downOverruns += 1;
      else {
        down.push(Buffer.from(pcm));
        downBytes += pcm.length;
      }
      return;
    }
    if (f.type === T.PING) return send(T.PONG, f.payload.subarray(0, 4));
    if (f.type === T.HELLO) {
      if (f.payload[0] !== 1) return ack(f, 4);
      s.nonce = randomBytes(16);
      s.lastCounter = 0;
      s.session = true;
      helloAck();
      state();
      if (s.hostLostPending) {
        s.hostLostPending = false;
        event(7);
      }
      return undefined;
    }
    if (!s.session) return ack(f, 10);
    switch (f.type) {
      case T.STATUS_REQ:
        // Simulates a frame lost on the serial line: the STATUS ACK never arrives.
        if (s.dropStatusAcks > 0) { s.dropStatusAcks -= 1; return undefined; }
        ack(f, 0);
        return state();
      case T.HFP_CONNECT:
        if (s.hfp) return ack(f, 3);
        ack(f, 0);
        s.hfp = 1;
        state();
        return later(10, () => {
          s.hfp = 3;
          state();
        });
      case T.PROVISION_KEY:
        if (!o.buttonHeld) return ack(f, 11);
        s.key = Buffer.from(f.payload);
        return ack(f, 0);
      case T.DIAL: {
        const callRef = f.payload.readUInt32LE(0);
        const counter = f.payload.readUInt32LE(4);
        const n = f.payload[8];
        const number = f.payload.toString('ascii', 9, 9 + n);
        const mac = f.payload.subarray(9 + n);
        if (!s.key) return ack(f, 8);
        if (counter <= s.lastCounter) return ack(f, 5);
        if (s.hfp !== 3) return ack(f, 3);
        if (s.call || s.callsetup) return ack(f, 7);
        if (!verifyDial(s.key, { sessionNonce: s.nonce.toString('hex'), counter, callRef, number }, mac)) return ack(f, 5);
        s.lastCounter = counter;
        s.callRef = callRef;
        claim(false);
        log.dials.push(number);
        o.onDial?.(number, o); // lets a scenario script pick this call's behaviour
        ack(f, 0);
        later(5, () => {
          setCall(0, 2);
          send(T.EVENT, Buffer.concat([Buffer.from([6]), Buffer.from([callRef & 0xff, (callRef >> 8) & 0xff, (callRef >> 16) & 0xff, callRef >>> 24, 0])]));
        });
        later(10, () => {
          if (s.callsetup) setCall(0, 3);
        });
        if (o.answerAfterMs !== null) {
          later(o.answerAfterMs, () => {
            if (!s.callsetup) return;
            setCall(1, 0);
            if (o.audio === 'phone') startAudio();
            if (o.remoteHangupAfterMs !== null) later(o.remoteHangupAfterMs, endCall);
          });
        }
        return undefined;
      }
      case T.ANSWER: {
        if (!o.answerSupported) return ack(f, 2);
        if (o.answerAck !== null) return ack(f, o.answerAck);
        const callRef = f.payload.length === 4 ? f.payload.readUInt32LE(0) : 0;
        if (!callRef) return ack(f, 4);
        if (s.hfp !== 3 || s.call || s.callsetup !== 1) return ack(f, 3);
        s.callRef = callRef;
        claim(true);
        log.answers += 1;
        ack(f, 0);
        later(o.answerLatencyMs, () => {
          if (s.callsetup !== 1 || s.call) return;
          setCall(1, 0);
          if (o.answerAudio && o.audio === 'phone') startAudio();
        });
        return undefined;
      }
      case T.HANGUP:
        if (!s.call && !s.callsetup) return ack(f, 3);
        log.hangups += 1;
        ack(f, 0);
        return later(5, endActiveCall); // AT+CHUP ends the active call; a waiting call rings on
      case T.AUDIO_DISCONNECT:
        if (s.audio !== 2) return ack(f, 3);
        release(); // the handset has the call: a person owns it now
        log.audioReleases += 1;
        ack(f, 0);
        return later(5, stopAudio);
      case T.AUDIO_CONNECT:
        if (s.hfp !== 3 || !s.call) return ack(f, 3);
        ack(f, 0);
        if (o.audio !== 'never') later(5, startAudio);
        return undefined;
      default:
        return ack(f, 2);
    }
  };

  deviceSide.on('data', (chunk) => {
    for (const f of dec.push(chunk)) handle(f);
  });

  return {
    stream: hostSide,
    options: o,
    state: s,
    log,
    played() {
      return Buffer.concat(log.played);
    },
    /** A call comes in: callsetup=1, then RING (+ CLIP unless withheld), RING repeating. */
    incoming({ number = '+923001112233', clip = true, ringEveryMs = 2000 } = {}) {
      ringNumber = number;
      ringClip = clip;
      if (s.call === 1) {
        // Call waiting: +CIEV callsetup=1 and +CCWA, no RING while a call is up.
        setCall(1, 1);
        event(9, clip && number ? Buffer.from(number, 'ascii') : Buffer.alloc(0));
        return;
      }
      setCall(0, 1);
      startRinging(ringEveryMs);
    },
    /** A person picks the ringing call up on the phone itself. Android may route audio to the bridge. */
    answerOnHandset({ audio = false } = {}) {
      if (s.callsetup !== 1) return;
      setCall(1, 0);
      if (audio) startAudio();
    },
    /** The caller gives up before anyone answers. */
    stopRinging() {
      if (s.callsetup) setCall(s.call, 0);
    },
    /** The remote party of the active call hangs up (a waiting call keeps ringing). */
    callerHangup() {
      endActiveCall();
    },
    /** Both parties gone at once (e.g. the network drops everything). */
    allCallsEnd() {
      endCall();
    },
    unplug() {
      stopAudio();
      deviceSide.destroy();
    },
    stop() {
      for (const t of timers) clearTimeout(t);
      clearInterval(ticker);
      clearInterval(ringTimer);
      clearInterval(watchdog);
      deviceSide.destroy();
      hostSide.destroy();
    },
  };
}

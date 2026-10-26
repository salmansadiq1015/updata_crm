/**
 * Protocol-level SIMULATION of the ESP32 bridge firmware plus a phone, for gateway tests only.
 * It re-implements the firmware's documented rules (session nonce, dial authorization, counter,
 * call indicators, 20 ms AUDIO_UP pacing, bounded playback buffer) in JS. It proves the gateway
 * talks the protocol correctly; it proves nothing about Bluetooth or cellular audio.
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
    remoteHangupAfterMs: null,
    buttonHeld: false,
    key: null,
    speech: (i) => Math.round(3000 * Math.sin((2 * Math.PI * 440 * i) / 8000)),
    minDialIntervalMs: 0,
    respond: true,
    ...opts,
  };
  const dec = new FrameDecoder();
  const s = { session: false, nonce: null, key: o.key, lastCounter: 0, hfp: 0, call: 0, callsetup: 0, audio: 0, codec: 0, callRef: 0 };
  const down = [];
  let downBytes = 0;
  let upIndex = 0;
  let seq = 0;
  const timers = new Set();
  const log = { dials: [], hangups: 0, played: [], downOverruns: 0, commands: [] };
  let ticker = null;

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
    const p = Buffer.alloc(22);
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
    send(T.STATE, p);
  };
  const helloAck = () => {
    const fw = Buffer.from('0.1.0-fake');
    const idf = Buffer.from('v5.5.6');
    const p = Buffer.alloc(30);
    p[0] = 1;
    p[1] = 0;
    p[2] = 3;
    p[3] = 0x37;
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
  const endCall = () => {
    stopAudio();
    s.call = 0;
    s.callsetup = 0;
    state();
  };

  const handle = (f) => {
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
      return state();
    }
    if (!s.session) return ack(f, 10);
    switch (f.type) {
      case T.STATUS_REQ:
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
        log.dials.push(number);
        o.onDial?.(number, o); // lets a scenario script pick this call's behaviour
        ack(f, 0);
        later(5, () => {
          s.callsetup = 2;
          state();
          send(T.EVENT, Buffer.concat([Buffer.from([6]), Buffer.from([callRef & 0xff, (callRef >> 8) & 0xff, (callRef >> 16) & 0xff, callRef >>> 24, 0])]));
        });
        later(10, () => {
          s.callsetup = 3;
          state();
        });
        if (o.answerAfterMs !== null) {
          later(o.answerAfterMs, () => {
            if (!s.callsetup) return;
            s.call = 1;
            s.callsetup = 0;
            state();
            if (o.audio === 'phone') startAudio();
            if (o.remoteHangupAfterMs !== null) later(o.remoteHangupAfterMs, endCall);
          });
        }
        return undefined;
      }
      case T.HANGUP:
        if (!s.call && !s.callsetup) return ack(f, 3);
        log.hangups += 1;
        ack(f, 0);
        return later(5, endCall);
      case T.AUDIO_DISCONNECT:
        if (s.audio !== 2) return ack(f, 3);
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
    unplug() {
      stopAudio();
      deviceSide.destroy();
    },
    stop() {
      for (const t of timers) clearTimeout(t);
      clearInterval(ticker);
      deviceSide.destroy();
      hostSide.destroy();
    },
  };
}

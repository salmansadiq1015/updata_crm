/**
 * Updata ESP32 HFP bridge: USB serial frame protocol v1 (host side).
 * Spec: docs/paired-phone/USB-AUDIO-PROTOCOL.md. Firmware twin: esp32/firmware/main/proto.c.
 *
 *   A5 5A | type u8 | flags u8 | seq u16le | len u16le | payload[len] | crc16le
 *   CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over type..payload.
 *
 * The decoder resynchronises on the next A5 5A after any bad header or CRC, so boot-ROM text,
 * a dropped byte or a half-written frame costs one frame, never the stream.
 */

export const SOF = [0xa5, 0x5a];
export const HEADER_BYTES = 8;
export const CRC_BYTES = 2;
export const MAX_PAYLOAD = 1024;
export const PROTO_MAJOR = 1;
export const PROTO_MINOR = 0;

export const T = Object.freeze({
  // host → device
  HELLO: 0x01,
  PING: 0x02,
  STATUS_REQ: 0x03,
  HFP_CONNECT: 0x10,
  HFP_DISCONNECT: 0x11,
  SET_DISCOVERABLE: 0x12,
  DIAL: 0x20,
  HANGUP: 0x21,
  AUDIO_CONNECT: 0x22,
  AUDIO_DISCONNECT: 0x23,
  DTMF: 0x24,
  VOLUME: 0x25,
  ANSWER: 0x26, // firmware 0.1.4+: answer the ringing incoming call
  PROVISION_KEY: 0x30,
  AUDIO_DOWN: 0x40,
  // device → host
  HELLO_ACK: 0x81,
  ACK: 0x82,
  STATE: 0x83,
  EVENT: 0x84,
  STATS: 0x85,
  LOG: 0x86,
  PONG: 0x87,
  AUDIO_UP: 0xc0,
});

export const RESULT = Object.freeze({
  0: 'ok',
  1: 'bad_frame',
  2: 'unknown_type',
  3: 'bad_state',
  4: 'bad_arg',
  5: 'unauthorized',
  6: 'rate_limited',
  7: 'busy',
  8: 'not_provisioned',
  9: 'stack_error',
  10: 'no_session',
  11: 'no_presence',
});

/** HELLO_ACK capability bits. */
export const CAP = Object.freeze({
  HFP_HF: 1 << 0,
  VOICE_OVER_HCI: 1 << 1,
  CVSD: 1 << 2,
  MSBC: 1 << 3,
  DIAL_AUTH: 1 << 4,
  PRESENCE_BUTTON: 1 << 5,
  ANSWER: 1 << 6, // firmware 0.1.4+: T.ANSWER and host-owned watchdog
});

export const DEV_STATE = Object.freeze(['booting', 'usb_ready', 'bt_ready', 'phone_connected', 'hfp_ready', 'call_active', 'audio_ready', 'call_ended', 'fault']);
export const HFP_STATE = Object.freeze(['disconnected', 'connecting', 'connected', 'slc']);
export const AUDIO_STATE = Object.freeze(['off', 'connecting', 'on']);
export const CODEC = Object.freeze({ 0: 'none', 1: 'cvsd', 2: 'msbc' });
export const CODEC_RATE = Object.freeze({ 1: 8000, 2: 16000 });
export const EVENT = Object.freeze({
  1: 'ring',
  2: 'clip',
  3: 'call_failed',
  4: 'volume',
  5: 'auth',
  6: 'dial_result',
  7: 'host_lost_hangup',
  8: 'boot',
  9: 'call_waiting', // firmware 0.1.4+: +CCWA, a second call while one is up
});

export function crc16(buf, start = 0, end = buf.length) {
  let crc = 0xffff;
  for (let i = start; i < end; i += 1) {
    crc ^= buf[i] << 8;
    for (let b = 0; b < 8; b += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

export function encodeFrame(type, seq, payload = Buffer.alloc(0), flags = 0) {
  if (payload.length > MAX_PAYLOAD) throw new RangeError(`payload ${payload.length} > ${MAX_PAYLOAD}`);
  const out = Buffer.alloc(HEADER_BYTES + payload.length + CRC_BYTES);
  out[0] = SOF[0];
  out[1] = SOF[1];
  out[2] = type;
  out[3] = flags;
  out.writeUInt16LE(seq & 0xffff, 4);
  out.writeUInt16LE(payload.length, 6);
  payload.copy(out, HEADER_BYTES);
  out.writeUInt16LE(crc16(out, 2, HEADER_BYTES + payload.length), HEADER_BYTES + payload.length);
  return out;
}

/** Streaming decoder. push(chunk) → frames[]; counters say what was thrown away. */
export class FrameDecoder {
  constructor() {
    this.buf = Buffer.alloc(0);
    this.stats = { frames: 0, crcErrors: 0, resyncs: 0, junkBytes: 0, oversize: 0 };
  }

  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    const frames = [];
    for (;;) {
      const sof = this._findSof();
      if (sof < 0) {
        // keep a trailing A5 in case its 5A is in the next chunk
        const keep = this.buf.length && this.buf[this.buf.length - 1] === SOF[0] ? 1 : 0;
        this.stats.junkBytes += this.buf.length - keep;
        this.buf = this.buf.subarray(this.buf.length - keep);
        return frames;
      }
      if (sof > 0) {
        this.stats.junkBytes += sof;
        this.buf = this.buf.subarray(sof);
      }
      if (this.buf.length < HEADER_BYTES) return frames;
      const len = this.buf.readUInt16LE(6);
      if (len > MAX_PAYLOAD) {
        this.stats.oversize += 1;
        this._skip();
        continue;
      }
      const total = HEADER_BYTES + len + CRC_BYTES;
      if (this.buf.length < total) return frames;
      const want = this.buf.readUInt16LE(HEADER_BYTES + len);
      if (crc16(this.buf, 2, HEADER_BYTES + len) !== want) {
        this.stats.crcErrors += 1;
        this._skip();
        continue;
      }
      frames.push({
        type: this.buf[2],
        flags: this.buf[3],
        seq: this.buf.readUInt16LE(4),
        payload: Buffer.from(this.buf.subarray(HEADER_BYTES, HEADER_BYTES + len)),
      });
      this.stats.frames += 1;
      this.buf = this.buf.subarray(total);
    }
  }

  _findSof() {
    for (let i = 0; i + 1 < this.buf.length; i += 1) if (this.buf[i] === SOF[0] && this.buf[i + 1] === SOF[1]) return i;
    return -1;
  }

  _skip() {
    this.stats.resyncs += 1;
    this.buf = this.buf.subarray(1);
  }
}

/** Sequence-gap counter for one direction (u16 wrap-around). */
export class SeqTracker {
  constructor() {
    this.last = null;
    this.gaps = 0;
    this.lost = 0;
  }

  see(seq) {
    if (this.last !== null) {
      const delta = (seq - this.last - 1 + 0x10000) & 0xffff;
      if (delta !== 0 && delta < 0x8000) {
        this.gaps += 1;
        this.lost += delta;
      }
    }
    this.last = seq;
  }
}

// ---- payload builders (host → device) --------------------------------------------------------

const u32 = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};

export const build = {
  hello: () => Buffer.from([PROTO_MAJOR, PROTO_MINOR]),
  ping: (token) => u32(token),
  hfpConnect: (bdaddr) => (bdaddr ? parseBdaddr(bdaddr) : Buffer.alloc(6)),
  setDiscoverable: (seconds) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(Math.max(0, Math.min(600, seconds)));
    return b;
  },
  dial: ({ callRef, counter, number, mac }) => {
    const num = Buffer.from(number, 'ascii');
    if (mac.length !== 32) throw new RangeError('mac must be 32 bytes');
    return Buffer.concat([u32(callRef), u32(counter), Buffer.from([num.length]), num, mac]);
  },
  hangup: (callRef) => u32(callRef),
  answer: (callRef) => {
    if (!Number.isInteger(callRef) || callRef <= 0 || callRef > 0xffffffff) throw new RangeError('callRef must be a nonzero u32');
    return u32(callRef);
  },
  dtmf: (callRef, digit) => Buffer.concat([u32(callRef), Buffer.from(String(digit), 'ascii').subarray(0, 1)]),
  volume: (speaker, mic) => Buffer.from([speaker & 15, mic & 15]),
  provisionKey: (key) => {
    if (key.length !== 32) throw new RangeError('key must be 32 bytes');
    return Buffer.from(key);
  },
  audioDown: (sampleIndex, pcm) => Buffer.concat([u32(sampleIndex), pcm]),
};

// ---- payload parsers (device → host) ---------------------------------------------------------

export function parseBdaddr(text) {
  const parts = String(text).split(':');
  if (parts.length !== 6 || parts.some((p) => !/^[0-9a-fA-F]{2}$/.test(p))) throw new Error(`bad Bluetooth address: ${text}`);
  return Buffer.from(parts.map((p) => parseInt(p, 16)));
}

export const formatBdaddr = (b) => [...b].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(':');

function lpString(buf, off) {
  const n = buf[off];
  if (n === undefined || n === 0 || off + 1 + n > buf.length) {
    throw new RangeError('truncated or empty firmware identity string');
  }
  return [buf.toString('ascii', off + 1, off + 1 + n), off + 1 + n];
}

const optional = (v) => (v === 0xff ? null : v);

export const parse = {
  [T.HELLO_ACK](p) {
    if (p.length < 32) throw new RangeError('truncated HELLO_ACK');
    let off = 0;
    const out = {
      protoMajor: p[0],
      protoMinor: p[1],
      chipRevision: p[2],
      capabilities: p[3],
      bdaddr: formatBdaddr(p.subarray(4, 10)),
      sessionNonce: p.subarray(10, 26).toString('hex'),
      maxPayload: p.readUInt16LE(26),
      codecs: p[28],
      keyProvisioned: p[29] === 1,
    };
    off = 30;
    [out.firmware, off] = lpString(p, off);
    [out.idf, off] = lpString(p, off);
    return out;
  },
  [T.ACK]: (p) => ({ ackedSeq: p.readUInt16LE(0), command: p[2], result: RESULT[p[3]] || `code_${p[3]}`, code: p[3] }),
  [T.STATE]: (p) => ({
    device: DEV_STATE[p[0]] || `state_${p[0]}`,
    hfp: HFP_STATE[p[1]] || `hfp_${p[1]}`,
    call: p[2],
    callsetup: p[3],
    audio: AUDIO_STATE[p[4]] || `audio_${p[4]}`,
    codec: CODEC[p[5]] || 'none',
    signal: optional(p[6]),
    battery: optional(p[7]),
    peer: formatBdaddr(p.subarray(8, 14)),
    callRef: p.readUInt32LE(14),
    agFeatures: p.readUInt32LE(18),
    // firmware 0.1.4+: bit0 = the current call is host-owned (only those end on host loss)
    hostOwned: p.length > 22 ? Boolean(p[22] & 1) : null,
  }),
  [T.EVENT](p) {
    const name = EVENT[p[0]] || `event_${p[0]}`;
    const data = p.subarray(1);
    if (name === 'clip' || name === 'call_waiting') return { name, number: data.toString('ascii') };
    if (name === 'volume') return { name, target: data[0] === 0 ? 'speaker' : 'mic', level: data[1] };
    if (name === 'auth') return { name, ok: data[0] === 0, status: data[0], peer: formatBdaddr(data.subarray(1, 7)) };
    if (name === 'dial_result') return { name, callRef: data.readUInt32LE(0), ok: data[4] === 0, cme: data[4] };
    if (name === 'call_failed') return { name, reason: data[0] };
    if (name === 'boot') return { name, resetReason: data[0] };
    return { name, data: data.toString('hex') };
  },
  [T.STATS](p) {
    const k = ['uptimeMs', 'heapFree', 'heapMin', 'audioUpFrames', 'audioDownFrames', 'downUnderruns', 'downOverruns', 'upDrops', 'rxCrcErrors', 'rxResyncs', 'downSeqGaps'];
    const out = {};
    k.forEach((name, i) => {
      out[name] = p.readUInt32LE(i * 4);
    });
    out.downLevelBytes = p.readUInt16LE(k.length * 4);
    return out;
  },
  [T.LOG]: (p) => ({ level: p[0], text: p.subarray(1).toString('utf8') }),
  [T.PONG]: (p) => ({ token: p.readUInt32LE(0) }),
  [T.AUDIO_UP]: (p) => ({ sampleIndex: p.readUInt32LE(0), downLevelBytes: p.readUInt16LE(4), codec: p[6], pcm: p.subarray(7) }),
};

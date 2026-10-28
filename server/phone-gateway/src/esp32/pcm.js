/** 16-bit mono PCM helpers: WAV I/O, resampling, levels. Same behaviour as linux/updata_hfp/audio.py. */

import { readFileSync, writeFileSync } from 'node:fs';

export function readWav(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not a WAV file`);
  let off = 12;
  let fmt = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    let size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      fmt = { format: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      if (!fmt) throw new Error(`${path}: data before fmt`);
      if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`${path}: need 16-bit PCM`);
      if (size === 0xffffffff || body + size > b.length) size = b.length - body; // streamed WAVs
      const frames = Math.floor(size / 2 / fmt.channels);
      const out = new Int16Array(frames);
      for (let i = 0; i < frames; i += 1) {
        let sum = 0;
        for (let c = 0; c < fmt.channels; c += 1) sum += b.readInt16LE(body + 2 * (i * fmt.channels + c));
        out[i] = Math.trunc(sum / fmt.channels);
      }
      return { rate: fmt.rate, samples: out };
    }
    off = body + size + (size & 1);
  }
  throw new Error(`${path}: no data chunk`);
}

export function writeWav(path, rate, samples) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

/** Integer-ratio downsampling averages each group (cheap low-pass); everything else is linear. */
export function resample(samples, from, to) {
  if (from === to || samples.length === 0) return Int16Array.from(samples);
  if (from > to && from % to === 0) {
    const step = from / to;
    const out = new Int16Array(Math.ceil(samples.length / step));
    for (let o = 0, i = 0; i < samples.length; i += step, o += 1) {
      let sum = 0;
      const end = Math.min(i + step, samples.length);
      for (let j = i; j < end; j += 1) sum += samples[j];
      out[o] = Math.trunc(sum / (end - i));
    }
    return out;
  }
  const outLen = Math.max(1, Math.floor((samples.length * to) / from));
  const ratio = (samples.length - 1) / Math.max(1, outLen - 1);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, samples.length - 1);
    out[i] = Math.trunc(samples[lo] + (samples[hi] - samples[lo]) * (pos - lo));
  }
  return out;
}

export function levelDbfs(samples) {
  if (!samples.length) return null;
  let sq = 0;
  for (const s of samples) sq += s * s;
  const rms = Math.sqrt(sq / samples.length);
  return rms > 0 ? Math.round(200 * Math.log10(rms / 32768)) / 10 : -120;
}

/** Optional AI uplink gain. Keep PCM rate/format and saturate before Int16 conversion. */
export function playbackGain(samples, gainDb = 0) {
  if (!Number.isFinite(gainDb) || gainDb < 0 || gainDb > 12) throw new RangeError('Playback gain must be 0–12 dB');
  if (gainDb === 0) return samples;
  const gain = 10 ** (gainDb / 20);
  return Int16Array.from(samples, (v) => Math.max(-32768, Math.min(32767, Math.round(v * gain))));
}

export function levelTimeline(samples, rate, windowS = 1) {
  const n = Math.floor(rate * windowS);
  const out = [];
  for (let i = 0; i < samples.length; i += n) out.push(levelDbfs(samples.subarray(i, i + n)));
  return out;
}

export const pcmFromBuffer = (buf) => {
  const out = new Int16Array(Math.floor(buf.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = buf.readInt16LE(2 * i);
  return out;
};

export const bufferFromPcm = (pcm) => {
  const b = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i += 1) b.writeInt16LE(pcm[i], 2 * i);
  return b;
};

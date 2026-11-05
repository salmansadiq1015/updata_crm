import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CAP, FrameDecoder, SeqTracker, T, build, crc16, encodeFrame, parse, parseBdaddr, MAX_PAYLOAD } from '../src/esp32/protocol.js';
import { dialMessage, normalizeNumber, signDial, verifyDial } from '../src/esp32/dialAuth.js';

// Same vectors as esp32/firmware/test/host/test_main.c
const VECTORS = {
  hello: 'a55a010001000200010014ed',
  ping: 'a55a0200feff0400efbeadde94bb',
  empty: 'a55a030007000000dd91',
};

test('CRC-16/CCITT-FALSE check value and frame vectors match the firmware', () => {
  assert.equal(crc16(Buffer.from('123456789')), 0x29b1);
  assert.equal(encodeFrame(T.HELLO, 1, build.hello()).toString('hex'), VECTORS.hello);
  assert.equal(encodeFrame(T.PING, 0xfffe, build.ping(0xdeadbeef)).toString('hex'), VECTORS.ping);
  assert.equal(encodeFrame(T.STATUS_REQ, 7).toString('hex'), VECTORS.empty);
  assert.throws(() => encodeFrame(T.AUDIO_DOWN, 0, Buffer.alloc(MAX_PAYLOAD + 1)), RangeError);
});

test('decoder survives boot text, a corrupted frame, a stray SOF byte and byte-by-byte delivery', () => {
  const ping = Buffer.from(VECTORS.ping, 'hex');
  ping[9] ^= 0xff;
  const stream = Buffer.concat([
    Buffer.from('ets Jun  8 2016 rst:0x1\r\n'),
    Buffer.from(VECTORS.hello, 'hex'),
    ping,
    Buffer.from([0xa5]),
    Buffer.from(VECTORS.empty, 'hex'),
  ]);
  const d = new FrameDecoder();
  const frames = [];
  for (const byte of stream) frames.push(...d.push(Buffer.from([byte])));
  assert.deepEqual(frames.map((f) => [f.type, f.seq]), [[T.HELLO, 1], [T.STATUS_REQ, 7]]);
  assert.equal(d.stats.crcErrors, 1);
  assert.ok(d.stats.junkBytes >= 25);
});

test('decoder rejects an oversize length instead of waiting forever', () => {
  const d = new FrameDecoder();
  const frames = d.push(Buffer.concat([Buffer.from([0xa5, 0x5a, T.AUDIO_DOWN, 0, 0, 0, 0xff, 0xff]), Buffer.from(VECTORS.empty, 'hex')]));
  assert.deepEqual(frames.map((f) => f.type), [T.STATUS_REQ]);
  assert.ok(d.stats.oversize >= 1);
});

test('max payload round trip in one chunk', () => {
  const payload = Buffer.alloc(MAX_PAYLOAD, 7);
  const [f] = new FrameDecoder().push(encodeFrame(T.AUDIO_UP, 9, payload));
  assert.equal(f.payload.length, MAX_PAYLOAD);
  assert.ok(f.payload.equals(payload));
});

test('sequence tracker counts gaps across the u16 wrap', () => {
  const s = new SeqTracker();
  [0xfffe, 0xffff, 0, 1, 4, 5].forEach((n) => s.see(n));
  assert.equal(s.gaps, 1);
  assert.equal(s.lost, 2);
});

test('HELLO_ACK requires complete firmware and SDK identity strings, even with a valid frame CRC', () => {
  const header = Buffer.alloc(30);
  header[0] = 1;
  header.writeUInt16LE(1024, 26);
  const good = Buffer.concat([header, Buffer.from([5]), Buffer.from('0.1.0'), Buffer.from([6]), Buffer.from('v5.5.6')]);
  assert.equal(parse[T.HELLO_ACK](good).firmware, '0.1.0');
  for (let n = 0; n < good.length; n += 1) {
    const [frame] = new FrameDecoder().push(encodeFrame(T.HELLO_ACK, 0, good.subarray(0, n)));
    assert.throws(() => parse[T.HELLO_ACK](frame.payload), RangeError, `accepted ${n} bytes`);
  }
  assert.throws(() => parse[T.HELLO_ACK](Buffer.concat([header, Buffer.from([0, 0])])), RangeError);
});

test('payload parsers', () => {
  const st = Buffer.alloc(22);
  st.set([6, 3, 1, 0, 2, 1, 0xff, 4], 0);
  parseBdaddr('04:01:BB:51:10:48').copy(st, 8);
  st.writeUInt32LE(42, 14);
  st.writeUInt32LE(879, 18);
  assert.deepEqual(parse[T.STATE](st), {
    device: 'audio_ready', hfp: 'slc', call: 1, callsetup: 0, audio: 'on', codec: 'cvsd', signal: null, battery: 4,
    peer: '04:01:BB:51:10:48', callRef: 42, agFeatures: 879, hostOwned: null,
  });
  // firmware 0.1.4+ appends a flags byte: bit0 = host-owned call
  assert.equal(parse[T.STATE](Buffer.concat([st, Buffer.from([1])])).hostOwned, true);
  assert.equal(parse[T.STATE](Buffer.concat([st, Buffer.from([0])])).hostOwned, false);
  assert.deepEqual(parse[T.ACK](Buffer.from([0x34, 0x12, T.DIAL, 5])), { ackedSeq: 0x1234, command: T.DIAL, result: 'unauthorized', code: 5 });
  assert.deepEqual(parse[T.EVENT](Buffer.from([6, 42, 0, 0, 0, 0])), { name: 'dial_result', callRef: 42, ok: true, cme: 0 });
  assert.deepEqual(parse[T.EVENT](Buffer.concat([Buffer.from([9]), Buffer.from('+923004445566')])), { name: 'call_waiting', number: '+923004445566' });
  assert.deepEqual(parse[T.EVENT](Buffer.from([9])), { name: 'call_waiting', number: '' });
  assert.throws(() => parseBdaddr('04:01:BB:51:10'), /bad Bluetooth address/);
});

test('dial authorization matches the firmware vector and rejects any change', () => {
  const key = Buffer.from([...Array(32).keys()]);
  const f = { sessionNonce: '00112233445566778899aabbccddeeff', counter: 1, callRef: 42, number: '+923001234567' };
  assert.equal(dialMessage(f), 'updata-dial-v1|00112233445566778899aabbccddeeff|1|42|+923001234567');
  const mac = signDial(key, f);
  assert.equal(mac.toString('hex'), '3d83fa64eae811a1db5ee6c88ff587696651f8bdd2a97b276e0eeeaf0d222d9e');
  assert.ok(verifyDial(key, f, mac));
  for (const change of [{ counter: 2 }, { callRef: 43 }, { number: '+923001234568' }, { sessionNonce: '10112233445566778899aabbccddeeff' }]) {
    assert.equal(verifyDial(key, { ...f, ...change }, mac), false, JSON.stringify(change));
  }
  assert.throws(() => signDial(Buffer.alloc(16), f), /32 bytes/);
  assert.equal(normalizeNumber('+92 300-123 4567'), '+923001234567');
  for (const bad of ['', '12', '*#06#', '0300;ATH', '123456789012345678901']) assert.throws(() => normalizeNumber(bad));
});

test('ANSWER: type 0x26, nonzero u32 callRef, capability bit 6', () => {
  assert.equal(T.ANSWER, 0x26);
  assert.equal(CAP.ANSWER, 0x40);
  assert.equal(encodeFrame(T.ANSWER, 5, build.answer(0x01020304)).toString('hex').slice(0, 24), 'a55a260005000400' + '04030201');
  for (const bad of [0, -1, 1.5, 2 ** 32]) assert.throws(() => build.answer(bad), RangeError);
});

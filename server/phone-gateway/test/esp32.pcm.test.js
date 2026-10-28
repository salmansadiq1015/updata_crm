import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playbackGain } from '../src/esp32/pcm.js';

test('AI playback gain preserves rate, silence and the SDK input buffer', () => {
  const input = Int16Array.from([0, 1000, -1000, 4000, -4000]);
  const out = playbackGain(input, 20 * Math.log10(2));
  assert.deepEqual([...out], [0, 2000, -2000, 8000, -8000]);
  assert.deepEqual([...input], [0, 1000, -1000, 4000, -4000]);
  assert.equal(playbackGain(input), input);
});

test('AI playback gain saturates instead of wrapping and rejects unsafe settings', () => {
  assert.deepEqual([...playbackGain(Int16Array.from([30000, -30000]), 6)], [32767, -32768]);
  for (const db of [NaN, Infinity, -1, 13]) assert.throws(() => playbackGain(new Int16Array(1), db), RangeError);
});

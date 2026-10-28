import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createSilenceWatchdog } from '../src/silenceWatchdog.js';

test('speech and model processing do not count as unanswered question attempts', async () => {
  let busy = true; let count = 0;
  const watch = createSilenceWatchdog({ timeoutMs: 5, isBusy: () => busy, onSilence: () => { count++; watch.stop(); } });
  watch.arm(); await delay(25); assert.equal(count, 0);
  busy = false; watch.arm(); await delay(20); assert.equal(count, 1);
});

test('rearms after every completed retry even without another SDK away event', async () => {
  let count = 0;
  const watch = createSilenceWatchdog({ timeoutMs: 5, isBusy: () => false, onSilence: () => { if (++count === 4) watch.stop(); } });
  watch.arm(); await delay(60); assert.equal(count, 4);
});

test('stopping during an in-flight request cannot rearm the timer or overlap another request', async () => {
  let complete; let count = 0;
  const watch = createSilenceWatchdog({ timeoutMs: 5, isBusy: () => false, onSilence: () => { count++; return new Promise(resolve => { complete = resolve; }); } });
  watch.arm(); await delay(20); watch.arm(); await delay(15); assert.equal(count, 1);
  watch.stop(); complete(); await delay(20); assert.equal(count, 1);
});

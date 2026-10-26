// Same scenarios as linux/tests/test_callscript.py, against the JS port.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CallScript, callStateOf } from '../src/esp32/callScript.js';

const NUMBER = '+923001234567';

class Driver {
  constructor(options) {
    this.t = 0;
    this.s = new CallScript(NUMBER, 0, options);
    this.actions = [];
  }

  at(t, event, data) {
    this.t = t;
    const out = event ? this.s.handle(event, t, data) : this.s.tick(t);
    this.actions.push(...out);
    return out;
  }

  ticks(until, step = 0.2) {
    const out = [];
    while (this.t < until) out.push(...this.at(Math.round((this.t + step) * 1000) / 1000));
    return out;
  }

  count(kind) {
    return this.actions.filter((a) => a[0] === kind).length;
  }
}

const kinds = (actions) => actions.filter((a) => a[0] !== 'log').map((a) => a[0]);
const outcome = (actions) => actions.find((a) => a[0] === 'finish')?.[1];

test('happy path: dial once, listen, speak, listen, hang up, completed', () => {
  const d = new Driver({ listenS: 5, afterS: 5 });
  assert.deepEqual(kinds(d.at(1, 'slc_connected', { callState: 'idle' })), ['dial']);
  d.at(2, 'call_state', { state: 'dialing' });
  d.at(3, 'call_state', { state: 'alerting' });
  d.at(4, 'audio_opened');
  d.at(10, 'call_state', { state: 'active' });
  assert.equal(d.s.phase, 'listening');
  assert.equal(d.s.metrics.setupS, 9);
  assert.deepEqual(kinds(d.ticks(15.4)), ['play']);
  d.at(19, 'prompt_done');
  assert.deepEqual(kinds(d.ticks(24.4)), ['hangup']);
  assert.equal(outcome(d.at(25, 'call_state', { state: 'idle' })), 'completed');
  assert.equal(d.count('dial'), 1);
});

test('gateway opens the audio link when the phone does not', () => {
  const d = new Driver();
  d.at(0, 'slc_connected', { callState: 'idle' });
  d.at(1, 'call_state', { state: 'alerting' });
  d.at(5, 'call_state', { state: 'active' });
  assert.ok(kinds(d.ticks(9.6)).includes('connect_sco'));
  d.at(9.8, 'audio_opened');
  assert.equal(d.s.phase, 'listening');
});

test('failure outcomes', () => {
  let d = new Driver();
  assert.equal(outcome(d.at(1, 'slc_connected', { callState: 'active' })), 'phone_busy');
  assert.equal(d.count('dial'), 0);

  d = new Driver();
  d.at(0, 'slc_connected', { callState: 'idle' });
  assert.equal(outcome(d.at(0.5, 'dial_result', { ok: false, detail: 'unauthorized' })), 'dial_rejected');

  d = new Driver();
  d.at(0, 'slc_connected', { callState: 'idle' });
  d.at(1, 'call_state', { state: 'alerting' });
  assert.equal(outcome(d.at(6, 'call_state', { state: 'idle' })), 'not_answered');

  d = new Driver({ audioWaitS: 2, audioFailS: 5 });
  d.at(0, 'slc_connected', { callState: 'idle' });
  d.at(1, 'call_state', { state: 'active' });
  assert.deepEqual(kinds(d.ticks(6.4)), ['connect_sco', 'hangup']);
  assert.equal(outcome(d.at(7, 'call_state', { state: 'idle' })), 'audio_failed');

  d = new Driver();
  d.at(0, 'slc_connected', { callState: 'idle' });
  d.at(1, 'audio_opened');
  d.at(2, 'call_state', { state: 'active' });
  assert.deepEqual(kinds(d.at(4, 'audio_closed')), []);
  assert.deepEqual(kinds(d.ticks(6.4)), ['hangup']); // call stayed up past the grace period
  assert.equal(outcome(d.at(7, 'call_state', { state: 'idle' })), 'audio_lost');

  d = new Driver();
  d.at(0, 'slc_connected', { callState: 'idle' });
  d.at(1, 'audio_opened');
  d.at(2, 'call_state', { state: 'active' });
  d.at(4, 'audio_closed'); // phone closes audio first ...
  assert.equal(outcome(d.at(4.3, 'call_state', { state: 'idle' })), 'remote_hangup'); // ... then the call ends
  assert.equal(d.count('hangup'), 0);

  d = new Driver({ ringTimeoutS: 2, hangupTimeoutS: 3 });
  d.at(0, 'slc_connected', { callState: 'idle' });
  d.at(0.5, 'call_state', { state: 'alerting' });
  assert.equal(outcome(d.ticks(7)), 'outcome_unknown');
});

test('link lost after dialing is outcome_unknown and never redials', () => {
  const d = new Driver();
  d.at(0, 'slc_connected', { callState: 'idle' });
  d.at(1, 'call_state', { state: 'alerting' });
  assert.equal(outcome(d.at(2, 'slc_lost')), 'outcome_unknown');
  assert.deepEqual(d.at(3, 'slc_connected', { callState: 'idle' }), []);
  assert.equal(d.count('dial'), 1);
});

test('callStateOf follows the HFP indicators', () => {
  assert.equal(callStateOf({ call: 1, callsetup: 0 }), 'active');
  assert.equal(callStateOf({ call: 0, callsetup: 3 }), 'alerting');
  assert.equal(callStateOf({ call: 0, callsetup: 0 }), 'idle');
});

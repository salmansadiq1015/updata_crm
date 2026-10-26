/**
 * Phase 1 audio-proof call through the ESP32 bridge: binds Esp32Device + CallScript + evidence.
 * Used by bin/esp32-probe.mjs on a real serial port and by the tests against a protocol-level fake.
 *
 * Dial authorization: the probe signs the DIAL with the device key from `provision`, because during
 * Phase 1 the operator is the authority. In production the CRM holds the key and signs per call.
 */

import { CallScript, callStateOf } from './callScript.js';
import { signDial } from './dialAuth.js';
import { levelDbfs, levelTimeline, writeWav } from './pcm.js';
import { maskNumber } from './evidence.js';

const RATE = 8000;

export async function runProbeCall({ device, number, prompt, key, ev, phone = null, callRef = 1, options = {}, tickMs = 200, nowS = () => Date.now() / 1000 }) {
  const info = await device.hello();
  ev('hello', { ...info, sessionNonce: '(redacted)' });
  if (!info.keyProvisioned) {
    ev('abort', { reason: 'device has no dial key; run `esp32-probe provision` first' });
    return { outcome: 'not_provisioned' };
  }
  if (!info.capabilities || !(info.capabilities & 0x04)) ev('warning', { detail: 'firmware does not report CVSD support' });

  const script = new CallScript(number, nowS(), options);
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  let last = { callState: device.callState, audio: device.state?.audio ?? 'off', hfp: device.state?.hfp ?? 'disconnected' };
  let finished = false;

  const act = async (action) => {
    const [kind, ...args] = action;
    if (kind === 'log') ev(args[0], args[1]);
    else if (kind === 'dial') {
      ev('dial', { number: maskNumber(args[0]), callRef });
      try {
        const mac = signDial(key, { sessionNonce: info.sessionNonce, counter: 1, callRef, number: args[0] });
        await device.dial({ callRef, counter: 1, number: args[0], mac });
        ev('dial_accepted_by_firmware', { callRef });
      } catch (err) {
        ev('dial_refused_by_firmware', { code: err.code, detail: err.message });
        feed('dial_result', { ok: false, detail: err.code });
      }
    } else if (kind === 'hangup') {
      const ack = await device.hangup(callRef).catch((err) => ({ result: err.code }));
      ev('hangup_sent', { result: ack.result });
    } else if (kind === 'connect_sco') {
      await device.audioConnect().then(
        () => ev('audio_connect_requested'),
        (err) => ev('audio_connect_failed', { code: err.code }),
      );
    } else if (kind === 'play') {
      device.play(prompt);
      ev('prompt_playing', { seconds: Math.round((prompt.length / RATE) * 100) / 100 });
    } else if (kind === 'finish') {
      finished = true;
      const extra = args[0] === 'outcome_unknown' ? { operatorAction: 'look at the phone and end the call by hand if it is still up' } : {};
      ev('call_finished', {
        outcome: args[0],
        detail: args[1],
        metrics: script.metrics,
        gate: 'needs_review: transcribe remote.wav and get the remote person to confirm what they heard',
        ...extra,
      });
      finish(args[0]);
    }
  };
  const run = (actions) => actions.reduce((p, a) => p.then(() => act(a)), Promise.resolve());
  const feed = (event, data) => run(script.handle(event, nowS(), data));

  const onState = (s) => {
    ev('state', { device: s.device, hfp: s.hfp, call: s.call, callsetup: s.callsetup, audio: s.audio, codec: s.codec, signal: s.signal, battery: s.battery });
    const cs = callStateOf(s);
    if (last.hfp === 'slc' && s.hfp !== 'slc') feed('slc_lost', { detail: `hfp ${s.hfp}` });
    if (cs !== last.callState) {
      ev('call_state', { state: cs });
      feed('call_state', { state: cs });
    }
    if (s.audio === 'on' && last.audio !== 'on') {
      if (s.codec === 'cvsd') {
        ev('audio_opened', { codec: s.codec });
        feed('audio_opened');
      } else {
        ev('audio_unsupported_codec', { codec: s.codec, note: 'firmware is built CVSD-only; wideband needs an mSBC codec first' });
      }
    }
    if (s.audio !== 'on' && last.audio === 'on') {
      ev('audio_closed');
      feed('audio_closed');
    }
    last = { callState: cs, audio: s.audio, hfp: s.hfp };
  };
  const onEvent = (e) => {
    const safe = e.name === 'clip' ? { ...e, number: maskNumber(e.number) } : e;
    ev('device_event', safe);
    if (e.name === 'dial_result') feed('dial_result', { ok: e.ok, detail: e.ok ? 'OK' : `code ${e.cme}` });
  };
  const onPromptDone = () => feed('prompt_done');
  const onLost = (reason) => {
    ev('device_lost', { reason });
    if (!finished) feed('slc_lost', { detail: reason });
  };
  const onStats = (s) => ev('device_stats', s);
  device.on('state', onState);
  device.on('event', onEvent);
  device.on('prompt_done', onPromptDone);
  device.on('lost', onLost);
  device.on('stats', onStats);

  const ticker = setInterval(() => run(script.tick(nowS())), tickMs);
  try {
    if (device.state?.hfp !== 'slc') {
      ev('hfp_connect_requested', { phone: phone || '(last bonded)' });
      await device.hfpConnect(phone).catch((err) => ev('hfp_connect_refused', { code: err.code }));
      await device.waitForState((s) => s.hfp === 'slc', (options.slcTimeoutS ?? 20) * 1000).catch(() => {});
    }
    device.startRecording();
    if (device.state?.hfp === 'slc') {
      ev('slc_connected', { agFeatures: device.state.agFeatures, callState: device.callState });
      last = { callState: device.callState, audio: device.state.audio, hfp: 'slc' };
      await feed('slc_connected', { callState: device.callState });
    }
    const outcome = await done;
    return { outcome, metrics: script.metrics };
  } finally {
    clearInterval(ticker);
    device.off('state', onState);
    device.off('event', onEvent);
    device.off('prompt_done', onPromptDone);
    device.off('lost', onLost);
    device.off('stats', onStats);
    const { remote, sent } = device.recorded();
    if (remote.length || sent.length) {
      writeWav(ev.file('remote.wav'), RATE, remote);
      writeWav(ev.file('sent.wav'), RATE, sent);
    }
    ev('audio_summary', {
      ...device.audioSummary(),
      remoteSeconds: Math.round((remote.length / RATE) * 100) / 100,
      sentSeconds: Math.round((sent.length / RATE) * 100) / 100,
      remoteLevelDbfs: levelDbfs(remote),
      remoteLevelTimelineDbfs: levelTimeline(remote, RATE),
      deviceStats: device.stats || null,
      files: remote.length ? ['remote.wav', 'sent.wav'] : [],
    });
  }
}

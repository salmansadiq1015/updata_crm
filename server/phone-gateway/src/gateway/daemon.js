/**
 * The resident gateway: keeps the ESP32 and the phone connected, reports health to the CRM,
 * claims calls only while everything is ready, and runs them one at a time. Incoming calls are
 * noticed by the InboundWatcher while idle and run through the same single `runner` slot (one
 * call per phone: there is one Bluetooth audio link).
 *
 * Dependencies are injected (openDevice, crm, outbox, rtc, keepAwake, timers) so the whole loop is
 * tested against the protocol-level fake ESP32 and a fake CRM.
 */

import { hostname as osHostname } from 'node:os';

import { CallRunner } from './callRunner.js';
import { InboundWatcher } from './inboundWatcher.js';
import { LiveKitLeg } from './livekitLeg.js';
import { performSetup } from './setup.js';

// esp_reset_reason_t (ESP-IDF v5.5), as reported by the firmware's BOOT event.
export const RESET_REASONS = Object.freeze({ 0: 'UNKNOWN', 1: 'POWERON', 2: 'EXT', 3: 'SW', 4: 'PANIC', 5: 'INT_WDT', 6: 'TASK_WDT', 7: 'WDT', 8: 'DEEPSLEEP', 9: 'BROWNOUT', 10: 'SDIO' });
const ABNORMAL_RESETS = new Set(['PANIC', 'INT_WDT', 'TASK_WDT', 'WDT', 'BROWNOUT']);

export const GATEWAY_VERSION = '0.5.0';

const NUM_STATS = ['uptimeMs', 'heapFree', 'heapMin', 'audioUpFrames', 'audioDownFrames', 'downUnderruns', 'downOverruns', 'upDrops', 'rxCrcErrors', 'rxResyncs', 'downSeqGaps', 'downLevelBytes'];

export class GatewayDaemon {
  constructor({ crm, outbox, openDevice, closeDevice = async () => {}, rtc, keepAwake, log = () => {}, portLabel = null, options = {}, checkBootLoop = null }) {
    this.checkBootLoop = checkBootLoop; // (path) → { banners, reasons }; real serial in bin/, absent in tests
    this.crm = crm;
    this.outbox = outbox;
    this.openDevice = openDevice;
    this.closeDevice = closeDevice;
    this.rtc = rtc;
    this.keepAwake = keepAwake;
    this.log = log;
    this.portLabel = portLabel;
    this.o = {
      heartbeatIdleMs: 5_000,
      heartbeatCallMs: 2_000,
      claimEveryMs: 3_000,
      reconnectMinMs: 2_000,
      reconnectMaxMs: 30_000,
      hfpRetryMs: 20_000,
      agentGainDb: 0,
      inbound: {}, // InboundWatcher options (tests shorten its timings)
      inboundRunner: {}, // InboundCallRunner options
      ...options,
    };
    this.conn = null; // { device, port, info }
    this.runner = null;
    this.stopped = false;
    this.lastError = null;
    this.server = { voicePaused: false, readiness: null, activeCampaigns: 0 };
    this.lastHfpAttempt = 0;
    this.autoConnect = true;
    this.setupBusy = false;
    this.settingsLoaded = false;
    this.crmConnected = false;
    this.heartbeatInFlight = false;
    this.claiming = false;
    this.reconnectDelay = this.o.reconnectMinMs;
    this.connecting = null;
    this.reconnectTimer = null;
    this.timers = [];
    this.inbound = new InboundWatcher({
      crm, outbox, log,
      makeLeg: (job) => this.makeLeg(job),
      canWatch: () => !this.stopped && !this.runner && !this.setupBusy && Boolean(this.conn) && this.settingsLoaded,
      // Call waiting is reported only behind a call this gateway runs (outbound or incoming).
      canWatchWaiting: () => !this.stopped && Boolean(this.runner) && Boolean(this.conn) && this.settingsLoaded,
      runCall: (runner) => this.runCall(runner),
      options: this.o.inbound,
      runnerOptions: () => ({ agentGainDb: this.o.agentGainDb, ...this.o.inboundRunner }),
    });
  }

  makeLeg(job) {
    return new LiveKitLeg({ rtc: this.rtc, url: job.livekit?.url, token: job.livekit?.token, identity: job.livekit?.identity });
  }

  /** The single call slot, shared by outbound and incoming calls. */
  async runCall(runner) {
    this.runner = runner;
    this.keepAwake.set(true);
    this.scheduleHeartbeat(0);
    try {
      return await runner.start();
    } finally {
      this.runner = null;
      this.scheduleHeartbeat(0);
      this.inbound.poll(); // a call that was waiting may still be ringing
    }
  }

  async start() {
    this.log('gateway_start', { version: GATEWAY_VERSION, apiBase: this.crm.apiBase });
    this.scheduleHeartbeat(0);
    this.timers.push(setInterval(() => this.tryClaim().catch((err) => this.fail('claim_failed', err)), this.o.claimEveryMs));
    this.timers.push(setInterval(() => this.outbox.flush().catch(() => {}), 5_000));
    this.timers.push(setInterval(() => {
      if (this.conn) this.onBoardState(this.conn.device.state || {});
      this.inbound.poll();
    }, 2_000));
    // Report the computer online even while USB discovery/HELLO is waiting.
    await this.connectBoard();
  }

  // ---- board ----------------------------------------------------------------------------------

  async connectBoard() {
    if (this.stopped || this.conn) return;
    // The retry timer and a CRM Connect action can arrive together. Share one
    // open attempt so they cannot race for the exclusive port or lose a session.
    if (this.connecting) return this.connecting;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connecting = this.openBoard();
    try { await this.connecting; } finally { this.connecting = null; }
  }

  async openBoard() {
    try {
      const conn = await this.openDevice();
      if (this.stopped) { await this.closeDevice(conn); return; }
      this.conn = conn;
      this.portLabel = conn.port?.path || this.portLabel;
      this.reconnectDelay = this.o.reconnectMinMs;
      this.lastError = null;
      const { device, info } = this.conn;
      this.log('board_connected', { firmware: info.firmware, bdaddr: info.bdaddr, keyProvisioned: info.keyProvisioned });
      device.on('lost', (reason) => this.onBoardLost(reason));
      device.on('state', (s) => this.onBoardState(s));
      this.noReplyCount = 0;
      device.on('event', (e) => {
        if (e.name === 'host_lost_hangup') this.log('firmware_ended_call_after_host_loss');
        if (e.name === 'boot') this.onBoardBoot(e.resetReason);
      });
      if (device.supportsAnswer === false) this.log('firmware_cannot_answer', { firmware: info.firmware, hint: 'flash firmware 0.1.4 or newer to let the AI answer incoming calls' });
      this.inbound.attach(device);
      await device.statusRequest().catch(() => {});
    } catch (err) {
      this.conn = null;
      this.fail('board_open_failed', err);
      await this.diagnoseNoReply(err);
      this.retryBoard();
    }
  }

  /** The board (re)started: log why; crashes, watchdog resets and power dips become a device error in the CRM. */
  onBoardBoot(code) {
    const name = RESET_REASONS[code] || `UNKNOWN_${code}`;
    this.log('board_boot', { resetReason: name });
    if (ABNORMAL_RESETS.has(name)) {
      this.lastError = { code: `BOARD_RESET_${name}`, message: `The ESP32 restarted unexpectedly (${name.toLowerCase().replace(/_/g, ' ')}). Calls in progress were ended. If this repeats, check the USB cable and power.` };
      this.scheduleHeartbeat(0);
    }
  }

  /** HELLO keeps going unanswered: tell "restarting in a loop" apart from "unplugged / wrong port". */
  async diagnoseNoReply(err) {
    if (err?.code !== 'no_reply' || !this.checkBootLoop || !this.portLabel) return;
    this.noReplyCount = (this.noReplyCount || 0) + 1;
    if (this.noReplyCount < 2) return;
    try {
      const { banners, reasons } = await this.checkBootLoop(this.portLabel);
      this.log('board_boot_check', { banners, reasons });
      if (banners >= 2) {
        this.lastError = { code: 'BOARD_BOOT_LOOP', message: `The ESP32 keeps restarting (${banners} restarts in 2 s${reasons.length ? `, ${reasons.join(', ')}` : ''}). Unplug the board for 10 seconds and plug it back in. If it continues, restore its settings backup (see the gateway README, "Board keeps restarting").` };
        this.scheduleHeartbeat(0);
      }
    } catch (e) {
      this.log('board_boot_check_failed', { error: String(e?.message || e).slice(0, 200) });
    }
  }

  retryBoard() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.o.reconnectMaxMs, this.reconnectDelay * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectBoard();
    }, delay);
  }

  onBoardLost(reason) {
    this.log('board_lost', { reason });
    const conn = this.conn;
    this.conn = null;
    if (conn) this.closeDevice(conn).catch(() => {});
    this.lastError = { code: 'BOARD_LOST', message: String(reason).slice(0, 300) };
    this.scheduleHeartbeat(0);
    this.retryBoard();
  }

  /** Keep the phone's hands-free link up while idle (the phone drops it after a while). */
  onBoardState(s) {
    if (this.runner || this.setupBusy || !this.conn || !this.autoConnect || !this.settingsLoaded || this.stopped) return;
    if (s.hfp === 'disconnected' && Date.now() - this.lastHfpAttempt > this.o.hfpRetryMs) {
      this.lastHfpAttempt = Date.now();
      this.conn.device.hfpConnect().then(
        () => this.log('hfp_connect_requested'),
        (err) => this.log('hfp_connect_refused', { code: err.code }),
      );
    }
  }

  // ---- CRM ------------------------------------------------------------------------------------

  heartbeatBody() {
    const c = this.conn && !this.conn.device.closed && this.conn.device.sessionValid !== false ? this.conn : null;
    const s = c?.device.state;
    const stats = c?.device.stats
      ? Object.fromEntries(NUM_STATS.filter((k) => Number.isFinite(c.device.stats[k])).map((k) => [k, c.device.stats[k]]))
      : undefined;
    return {
      gateway: { monitorSafe: true, version: GATEWAY_VERSION, platform: process.platform, hostname: osHostname().slice(0, 120), playbackGainDb: this.o.agentGainDb, autoConnect: this.autoConnect },
      board: c ? {
        connected: true,
        port: this.portLabel,
        bdaddr: c.info.bdaddr,
        firmware: c.info.firmware,
        idf: c.info.idf,
        chipRevision: c.info.chipRevision,
        keyProvisioned: Boolean(c.info.keyProvisioned),
        canAnswer: Boolean(c.device.supportsAnswer), // firmware 0.1.4+: the AI can answer incoming calls
        sessionNonce: c.info.sessionNonce,
      } : { connected: false, port: this.portLabel },
      ...(c && s ? { state: { device: s.device, hfp: s.hfp, call: s.call, callsetup: s.callsetup, audio: s.audio, codec: s.codec, signal: s.signal, battery: s.battery, peer: s.peer === '00:00:00:00:00:00' ? null : s.peer } } : {}),
      ...(stats ? { stats } : {}),
      ...(this.lastError ? { error: this.lastError } : {}),
    };
  }

  scheduleHeartbeat(ms) {
    if (this.stopped) return;
    clearTimeout(this.hbTimer);
    this.hbTimer = setTimeout(() => this.heartbeat(), ms);
  }

  async heartbeat() {
    if (this.stopped || this.heartbeatInFlight) return;
    this.heartbeatInFlight = true;
    try {
      const res = await this.crm.heartbeat(this.heartbeatBody());
      if (this.stopped) return;
      if (!this.crmConnected) this.log('crm_connected', { readiness: res.readiness?.ok ?? false });
      this.crmConnected = true;
      if (this.lastError?.code === 'HEARTBEAT_FAILED') this.lastError = null;
      this.server = res;
      this.settingsLoaded = true;
      if (res.setup) {
        this.autoConnect = res.setup.autoConnect !== false;
        const db = res.setup.playbackGainDb;
        if (Number.isFinite(db) && db >= 0 && db <= 12) {
          if (db !== this.o.agentGainDb) this.log('playback_gain_applied', { db });
          this.o.agentGainDb = db;
          if (this.runner) this.runner.o.agentGainDb = db;
        }
        if (res.setup.command?.state === 'pending' && !this.setupBusy) this.runSetup(res.setup.command).catch(err => this.fail('setup_failed', err));
      }
      if (this.conn) this.onBoardState(this.conn.device.state || {});
      for (const cmd of res.commands || []) {
        if (this.runner && cmd.callId === this.runner.job.callId) {
          Promise.resolve(this.runner.command(cmd.type)).catch((err) => this.fail('command_failed', err));
        }
      }
      if (res.provisionKeyPending && !this.provisionHinted) {
        this.provisionHinted = true;
        this.log('dial_key_not_provisioned', { hint: 'run: updata-gateway provision (hold the BOOT button)' });
      }
      // Stay awake during a call, while campaigns run, and while incoming AI answering is on
      // (a sleeping computer cannot pick up a ringing phone).
      this.keepAwake.set(Boolean(this.runner) || (res.activeCampaigns || 0) > 0 || res.inboundAnswering === true);
    } catch (err) {
      this.crmConnected = false;
      if (err.status === 401) {
        this.log('gateway_revoked', { hint: 'the device was revoked or unpaired in the CRM; run updata-gateway pair again' });
        await this.stop();
        return;
      }
      this.fail('heartbeat_failed', err);
    } finally {
      this.heartbeatInFlight = false;
      this.scheduleHeartbeat(this.runner ? this.o.heartbeatCallMs : this.o.heartbeatIdleMs);
    }
  }

  canClaim() {
    const c = this.conn;
    return !this.stopped && this.settingsLoaded && this.crmConnected && !this.claiming && !this.runner && !this.setupBusy && !this.inbound.busy && c && !c.device.closed && c.device.sessionValid !== false && c.info.keyProvisioned && c.device.state?.hfp === 'slc'
      && !c.device.state.call && !c.device.state.callsetup && !this.server.voicePaused;
  }

  async tryClaim() {
    if (!this.canClaim()) return;
    // The polling interval is shorter than an HTTP timeout. Hold a guard until
    // the response arrives so slow requests cannot reserve several calls.
    this.claiming = true;
    let job;
    const connection = this.conn;
    try {
      // Check HELLO authorization before reserving a call against its nonce.
      // A responsive PING and cached Bluetooth STATE are insufficient.
      await connection.device.statusRequest?.();
      if (this.conn !== connection || connection.device.closed || connection.device.sessionValid === false) return;
      job = await this.crm.claim(connection.info.sessionNonce);
    } catch (error) {
      if (error.code === 'no_session' && this.conn === connection) this.onBoardLost('USB control session expired; reconnecting');
      throw error;
    }
    finally { this.claiming = false; }
    if (!job) return;
    if (this.conn !== connection || connection.device.closed || connection.device.sessionValid === false) {
      this.outbox.push(job.callId, 'dial_refused', { code: 'session_changed' });
      this.log('call_not_dialed_session_changed', { callId: job.callId });
      return;
    }
    if (this.inbound.busy || this.runner) {
      // The phone started ringing while the claim was in flight: never dial over an incoming call.
      this.outbox.push(job.callId, 'dial_refused', { code: 'incoming_call' });
      this.log('call_not_dialed_incoming_call', { callId: job.callId });
      return;
    }
    this.log('call_claimed', { callId: job.callId });
    const runner = new CallRunner({ device: this.conn.device, job, outbox: this.outbox, crm: this.crm, leg: this.makeLeg(job), log: this.log, options: { agentGainDb: this.o.agentGainDb } });
    await this.runCall(runner);
  }

  async runSetup(command) {
    if (this.setupBusy || this.runner || this.inbound.busy || this.stopped) return;
    this.setupBusy = true;
    let claimed = false;
    let result = { succeeded: false, code: 'failed' };
    try {
      await this.crm.claimSetup(command.id);
      claimed = true;
      await performSetup({ action: command.action, device: this.conn?.device, info: this.conn?.info, crm: this.crm, stopped: () => this.stopped,
        reconnect: async () => {
          const old = this.conn; this.conn = null;
          if (old) await this.closeDevice(old);
          await this.connectBoard();
          if (!this.conn) throw Object.assign(new Error('no_board'), { code: 'no_board' });
          return this.conn;
        } });
      result = { succeeded: true };
      this.provisionHinted = false;
      this.lastError = null;
    } catch (e) {
      result.code = ['no_presence', 'no_peer', 'no_board', 'busy'].includes(e.code) ? e.code : 'failed';
      this.log('setup_action_failed', { action: command.action, code: result.code });
    } finally {
      if (claimed) {
        for (let n = 0; n < 3; n++) {
          try { await this.crm.completeSetup(command.id, result); break; }
          catch { if (n < 2) await new Promise(r => setTimeout(r, 500)); }
        }
      }
      this.setupBusy = false;
      this.scheduleHeartbeat(0);
    }
  }

  fail(code, err) {
    this.lastError = { code: code.toUpperCase().slice(0, 60), message: String(err?.message || err).slice(0, 300) };
    this.log(code, { error: this.lastError.message, ...(err.code ? { code: err.code } : {}), ...(err.endpoint ? { endpoint: err.endpoint } : {}) });
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    clearTimeout(this.hbTimer);
    if (this.runner) {
      this.log('stopping_during_call', { callId: this.runner.job.callId });
      await this.runner.shutdown();
      await Promise.race([this.runner.done, new Promise((r) => setTimeout(r, 15_000))]);
    }
    this.inbound.stop();
    await this.outbox.flush().catch(() => {});
    if (this.conn) await this.closeDevice(this.conn).catch(() => {});
    this.conn = null;
    this.keepAwake.set(false);
    this.log('gateway_stopped', { pendingEvents: this.outbox.pending });
  }
}

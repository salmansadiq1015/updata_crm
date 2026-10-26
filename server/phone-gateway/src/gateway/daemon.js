/**
 * The resident gateway: keeps the ESP32 and the phone connected, reports health to the CRM,
 * claims calls only while everything is ready, and runs them one at a time.
 *
 * Dependencies are injected (openDevice, crm, outbox, rtc, keepAwake, timers) so the whole loop is
 * tested against the protocol-level fake ESP32 and a fake CRM.
 */

import { hostname as osHostname } from 'node:os';

import { CallRunner } from './callRunner.js';
import { LiveKitLeg } from './livekitLeg.js';

export const GATEWAY_VERSION = '0.2.0';

const NUM_STATS = ['uptimeMs', 'heapFree', 'heapMin', 'audioUpFrames', 'audioDownFrames', 'downUnderruns', 'downOverruns', 'upDrops', 'rxCrcErrors', 'rxResyncs', 'downSeqGaps', 'downLevelBytes'];

export class GatewayDaemon {
  constructor({ crm, outbox, openDevice, closeDevice = async () => {}, rtc, keepAwake, log = () => {}, portLabel = null, options = {} }) {
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
      ...options,
    };
    this.conn = null; // { device, port, info }
    this.runner = null;
    this.stopped = false;
    this.lastError = null;
    this.server = { voicePaused: false, readiness: null, activeCampaigns: 0 };
    this.lastHfpAttempt = 0;
    this.reconnectDelay = this.o.reconnectMinMs;
    this.timers = [];
  }

  async start() {
    this.log('gateway_start', { version: GATEWAY_VERSION });
    await this.connectBoard();
    this.scheduleHeartbeat(0);
    this.timers.push(setInterval(() => this.tryClaim().catch((err) => this.fail('claim_failed', err)), this.o.claimEveryMs));
    this.timers.push(setInterval(() => this.outbox.flush().catch(() => {}), 5_000));
  }

  // ---- board ----------------------------------------------------------------------------------

  async connectBoard() {
    if (this.stopped || this.conn) return;
    try {
      this.conn = await this.openDevice();
      this.reconnectDelay = this.o.reconnectMinMs;
      this.lastError = null;
      const { device, info } = this.conn;
      this.log('board_connected', { firmware: info.firmware, bdaddr: info.bdaddr, keyProvisioned: info.keyProvisioned });
      device.on('lost', (reason) => this.onBoardLost(reason));
      device.on('state', (s) => this.onBoardState(s));
      device.on('event', (e) => {
        if (e.name === 'host_lost_hangup') this.log('firmware_ended_call_after_host_loss');
      });
      await device.statusRequest().catch(() => {});
    } catch (err) {
      this.conn = null;
      this.fail('board_open_failed', err);
      this.retryBoard();
    }
  }

  retryBoard() {
    if (this.stopped) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.o.reconnectMaxMs, this.reconnectDelay * 2);
    this.timers.push(setTimeout(() => this.connectBoard(), delay));
  }

  onBoardLost(reason) {
    this.log('board_lost', { reason });
    const conn = this.conn;
    this.conn = null;
    if (conn) this.closeDevice(conn).catch(() => {});
    this.lastError = { code: 'BOARD_LOST', message: String(reason).slice(0, 300) };
    this.retryBoard();
  }

  /** Keep the phone's hands-free link up while idle (the phone drops it after a while). */
  onBoardState(s) {
    if (this.runner || !this.conn) return;
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
    const c = this.conn;
    const s = c?.device.state;
    const stats = c?.device.stats
      ? Object.fromEntries(NUM_STATS.filter((k) => Number.isFinite(c.device.stats[k])).map((k) => [k, c.device.stats[k]]))
      : undefined;
    return {
      gateway: { version: GATEWAY_VERSION, platform: process.platform, hostname: osHostname().slice(0, 120) },
      board: c ? {
        connected: true,
        port: this.portLabel,
        bdaddr: c.info.bdaddr,
        firmware: c.info.firmware,
        idf: c.info.idf,
        chipRevision: c.info.chipRevision,
        keyProvisioned: Boolean(c.info.keyProvisioned),
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
    try {
      const res = await this.crm.heartbeat(this.heartbeatBody());
      this.server = res;
      for (const cmd of res.commands || []) {
        if (this.runner && cmd.callId === this.runner.job.callId) this.runner.command(cmd.type);
      }
      if (res.provisionKeyPending && !this.provisionHinted) {
        this.provisionHinted = true;
        this.log('dial_key_not_provisioned', { hint: 'run: updata-gateway provision (hold the BOOT button)' });
      }
      this.keepAwake.set(Boolean(this.runner) || (res.activeCampaigns || 0) > 0);
    } catch (err) {
      if (err.status === 401) {
        this.log('gateway_revoked', { hint: 'the device was revoked or unpaired in the CRM; run updata-gateway pair again' });
        await this.stop();
        return;
      }
      this.fail('heartbeat_failed', err);
    }
    this.scheduleHeartbeat(this.runner ? this.o.heartbeatCallMs : this.o.heartbeatIdleMs);
  }

  canClaim() {
    const c = this.conn;
    return !this.stopped && !this.runner && c && c.info.keyProvisioned && c.device.state?.hfp === 'slc'
      && !c.device.state.call && !c.device.state.callsetup && !this.server.voicePaused;
  }

  async tryClaim() {
    if (!this.canClaim()) return;
    const job = await this.crm.claim(this.conn.info.sessionNonce);
    if (!job) return;
    this.log('call_claimed', { callId: job.callId });
    const leg = new LiveKitLeg({ rtc: this.rtc, url: job.livekit?.url, token: job.livekit?.token, identity: job.livekit?.identity });
    this.runner = new CallRunner({ device: this.conn.device, job, outbox: this.outbox, crm: this.crm, leg, log: this.log });
    this.keepAwake.set(true);
    this.scheduleHeartbeat(0);
    try {
      await this.runner.start();
    } finally {
      this.runner = null;
      this.scheduleHeartbeat(0);
    }
  }

  fail(code, err) {
    this.lastError = { code: code.toUpperCase().slice(0, 60), message: String(err?.message || err).slice(0, 300) };
    this.log(code, { error: this.lastError.message });
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    clearTimeout(this.hbTimer);
    if (this.runner) {
      this.log('stopping_during_call', { callId: this.runner.job.callId });
      await this.runner.command('hangup');
      await Promise.race([this.runner.done, new Promise((r) => setTimeout(r, 15_000))]);
    }
    await this.outbox.flush().catch(() => {});
    if (this.conn) await this.closeDevice(this.conn).catch(() => {});
    this.conn = null;
    this.keepAwake.set(false);
    this.log('gateway_stopped', { pendingEvents: this.outbox.pending });
  }
}

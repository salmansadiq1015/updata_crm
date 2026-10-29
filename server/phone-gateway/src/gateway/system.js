/** Gateway config file, single-instance lock and "keep the laptop awake" (OS helpers). */

import { spawn as nodeSpawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const HOME_DIR = process.env.UPDATA_GATEWAY_HOME || join(homedir(), '.updata');
export const CONFIG_FILE = join(HOME_DIR, 'gateway.json');
export const OUTBOX_FILE = join(HOME_DIR, 'gateway-outbox.jsonl');
export const LOCK_FILE = join(HOME_DIR, 'gateway.lock');

/** Independent credentials, event queues and process locks for each phone. */
export function gatewayPaths(profile, home = HOME_DIR) {
  if (profile && !/^[a-zA-Z0-9_-]{1,80}$/.test(profile)) throw new Error('Profile must contain only letters, numbers, underscores or hyphens (up to 80 characters).');
  const dir = profile ? join(home, 'profiles', profile) : home;
  return { config: join(dir, 'gateway.json'), outbox: join(dir, 'gateway-outbox.jsonl'), lock: join(dir, 'gateway.lock') };
}

export function loadConfig(file = CONFIG_FILE) {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The token is a secret: owner-only file in an owner-only directory. */
export function saveConfig(config, file = CONFIG_FILE) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function deleteConfig(file = CONFIG_FILE, outbox = OUTBOX_FILE) {
  rmSync(file, { force: true });
  rmSync(outbox, { force: true });
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** One gateway per profile. Serial ports also enforce exclusive access to each USB board. */
export function acquireLock(file = LOCK_FILE) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, 'utf8').trim());
    if (pid && alive(pid)) throw new Error(`Another gateway is running for this phone (pid ${pid})`);
    rmSync(file, { force: true });
  }
  writeFileSync(file, String(process.pid), { mode: 0o600, flag: 'wx' });
  return () => rmSync(file, { force: true });
}

/**
 * Prevent idle sleep while campaigns are running or a call is up; restore it afterwards.
 * macOS: caffeinate -i; Linux: systemd-inhibit. Other OSes: reported as unsupported, never faked.
 */
export class KeepAwake {
  constructor({ platform = process.platform, spawn = nodeSpawn, log = () => {} } = {}) {
    this.platform = platform;
    this.spawn = spawn;
    this.log = log;
    this.child = null;
  }

  get supported() {
    return this.platform === 'darwin' || this.platform === 'linux';
  }

  set(on) {
    if (on && !this.child) this._start();
    if (!on && this.child) this._stop();
  }

  _start() {
    if (!this.supported) {
      if (!this.warned) this.log('keep_awake_unsupported', { platform: this.platform, note: 'set the OS to never sleep while campaigns run' });
      this.warned = true;
      return;
    }
    const [cmd, args] = this.platform === 'darwin'
      ? ['caffeinate', ['-i', '-w', String(process.pid)]]
      : ['systemd-inhibit', ['--what=sleep:idle', '--who=updata-gateway', '--why=AI phone campaign running', '--mode=block', 'sleep', 'infinity']];
    try {
      this.child = this.spawn(cmd, args, { stdio: 'ignore' });
      this.child.on?.('error', (err) => {
        this.log('keep_awake_failed', { error: err.message });
        this.child = null;
      });
      this.child.on?.('exit', () => {
        this.child = null;
      });
      this.log('keep_awake_on', { cmd });
    } catch (err) {
      this.log('keep_awake_failed', { error: err.message });
      this.child = null;
    }
  }

  _stop() {
    try {
      this.child.kill();
    } catch { /* already gone */ }
    this.child = null;
    this.log('keep_awake_off');
  }
}

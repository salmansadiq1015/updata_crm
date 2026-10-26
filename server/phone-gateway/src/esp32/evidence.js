/** JSON-lines evidence, same row shape as the macOS and Linux probes: {t_ms, ts, event, ...}. */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function maskNumber(n) {
  const s = String(n);
  return s.length > 7 ? s.slice(0, 4) + '*'.repeat(s.length - 7) + s.slice(-3) : '***';
}

export function createEvidence(outDir, { echo = true } = {}) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, 'hfp-probe.jsonl');
  const started = process.hrtime.bigint();
  const ev = (event, data = {}) => {
    const row = { t_ms: Number((process.hrtime.bigint() - started) / 1_000_000n), ts: new Date().toISOString(), event, ...data };
    const line = JSON.stringify(row);
    appendFileSync(path, `${line}\n`);
    if (echo) process.stderr.write(`${line}\n`);
  };
  ev.file = (name) => join(outDir, name);
  ev.path = path;
  return ev;
}

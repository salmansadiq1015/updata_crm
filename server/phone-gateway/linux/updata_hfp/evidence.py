"""JSON-lines evidence, same row shape as the macOS probe: {t_ms, ts, event, ...}."""

import json
import os
import sys
import time
from datetime import datetime, timezone


class Evidence:
    def __init__(self, out_dir, echo=True):
        self.out_dir = out_dir
        os.makedirs(out_dir, exist_ok=True)
        self.path = os.path.join(out_dir, 'hfp-probe.jsonl')
        self._fh = open(self.path, 'a', encoding='utf-8')
        self._started = time.monotonic()
        self.echo = echo

    def file(self, name):
        return os.path.join(self.out_dir, name)

    def __call__(self, event, **data):
        row = {
            't_ms': int((time.monotonic() - self._started) * 1000),
            'ts': datetime.now(timezone.utc).isoformat(timespec='milliseconds'),
            'event': event,
        }
        row.update(data)
        line = json.dumps(row, default=str, ensure_ascii=False)
        self._fh.write(line + '\n')
        self._fh.flush()
        if self.echo:
            print(line, file=sys.stderr, flush=True)

    def close(self):
        self._fh.close()

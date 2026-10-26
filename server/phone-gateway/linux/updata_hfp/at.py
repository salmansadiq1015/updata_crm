"""HFP 1.7 hands-free (HF) side of the AT protocol, with no I/O.

The caller writes `start()`/`feed()` output to the RFCOMM socket and acts on the events.
We advertise CVSD only (no codec negotiation, no three-way calling) so the phone opens a plain
8 kHz SCO link, which the kernel hands us as signed 16-bit PCM. That is enough for the audio
proof; wideband (mSBC) can come later once narrowband works.

Events (tuples):
  ('slc_connected', {'ag_features': int, 'indicators': {name: value}})
  ('call_state', 'idle'|'incoming'|'dialing'|'alerting'|'active')
  ('indicator', name, value)
  ('ring',) · ('clip', number) · ('volume', 'speaker'|'mic', level)
  ('result', command, ok, detail)        every finished AT command
  ('slc_failed', detail)                 the SLC handshake got an error
"""

import re

# HF SupportedFeatures in AT+BRSF (HFP 1.7, section 4.34.1)
HF_EC_NR = 1 << 0
HF_THREE_WAY = 1 << 1
HF_CLI = 1 << 2
HF_VOICE_RECOGNITION = 1 << 3
HF_REMOTE_VOLUME = 1 << 4
HF_ENHANCED_CALL_STATUS = 1 << 5
HF_CODEC_NEGOTIATION = 1 << 7

DEFAULT_HF_FEATURES = HF_CLI | HF_REMOTE_VOLUME | HF_ENHANCED_CALL_STATUS  # 0x34

# The SDP SupportedFeatures attribute uses a different (shorter) bit layout.
SDP_CLI = 1 << 2
SDP_REMOTE_VOLUME = 1 << 4
DEFAULT_SDP_FEATURES = SDP_CLI | SDP_REMOTE_VOLUME  # 0x14

# AG features in +BRSF
AG_FEATURE_NAMES = {
    0: 'three_way', 1: 'ec_nr', 2: 'voice_recognition', 3: 'inband_ring', 4: 'voice_tag',
    5: 'reject', 6: 'enhanced_call_status', 7: 'enhanced_call_control', 8: 'extended_errors',
    9: 'codec_negotiation', 10: 'hf_indicators', 11: 'esco_s4',
}

CODEC_CVSD = 1

_NUMBER_RE = re.compile(r'^\+?[0-9]{3,15}$')
_CIND_NAME_RE = re.compile(r'\("([^"]+)",\(')
_LINE_END_RE = re.compile(r'[\r\n]')


def normalize_number(raw):
    """Digits with an optional leading +; raises ValueError for anything else."""
    cleaned = re.sub(r'[\s\-().]', '', str(raw or ''))
    if not _NUMBER_RE.match(cleaned):
        raise ValueError('not a dialable number: %r' % raw)
    return cleaned


def decode_ag_features(value):
    return sorted(name for bit, name in AG_FEATURE_NAMES.items() if value & (1 << bit))


def derive_call_state(ind):
    if ind.get('call') == 1:
        return 'active'
    setup = ind.get('callsetup', 0)
    return {1: 'incoming', 2: 'dialing', 3: 'alerting'}.get(setup, 'idle')


class HfProtocol:
    def __init__(self, hf_features=DEFAULT_HF_FEATURES):
        self.hf_features = hf_features
        self.ag_features = 0
        self.slc = 'idle'  # idle → handshake → connected | failed
        self.indicator_names = []
        self.indicators = {}
        self.call_state = 'idle'
        self._buffer = ''
        self._queue = []  # commands waiting to be sent
        self._pending = None  # command waiting for OK/ERROR
        self._handshake = []

    # ---- commands -------------------------------------------------------------------------

    def start(self):
        """Begin the service-level connection; returns bytes to write."""
        self.slc = 'handshake'
        self._handshake = ['AT+BRSF=%d' % self.hf_features, 'AT+CIND=?', 'AT+CIND?', 'AT+CMER=3,0,0,1']
        return self._enqueue(self._handshake.pop(0))

    def dial(self, number):
        if self.slc != 'connected':
            raise RuntimeError('service level connection is not up')
        return self._enqueue('ATD%s;' % normalize_number(number))

    def hangup(self):
        return self._enqueue('AT+CHUP')

    def list_calls(self):
        return self._enqueue('AT+CLCC')

    def read_indicators(self):
        """AT+CIND? — a cheap round trip that proves the control link is alive."""
        return self._enqueue('AT+CIND?')

    def _enqueue(self, command):
        self._queue.append(command)
        return self._pump()

    def _pump(self):
        if self._pending is not None or not self._queue:
            return b''
        self._pending = self._queue.pop(0)
        return (self._pending + '\r').encode('ascii')

    # ---- responses ------------------------------------------------------------------------

    def feed(self, data):
        """Consume bytes from the AG. Returns (bytes_to_write, events)."""
        self._buffer += data.decode('ascii', errors='replace')
        out, events = b'', []
        while True:
            match = _LINE_END_RE.search(self._buffer)
            if not match:
                break
            line, self._buffer = self._buffer[:match.start()].strip(), self._buffer[match.end():]
            if line:
                more, evs = self._line(line)
                out += more
                events.extend(evs)
        return out, events

    def _line(self, line):
        if line == 'OK' or line == 'ERROR' or line.startswith('+CME ERROR'):
            return self._finish(line == 'OK', line)
        if line.startswith('+BRSF:'):
            self.ag_features = int(line.split(':', 1)[1].strip())
            return b'', []
        if line.startswith('+CIND:'):
            body = line.split(':', 1)[1].strip()
            if body.startswith('('):
                self.indicator_names = _CIND_NAME_RE.findall(body)
            else:
                values = [int(v) for v in body.split(',') if v.strip().lstrip('-').isdigit()]
                self.indicators = dict(zip(self.indicator_names, values))
                self.call_state = derive_call_state(self.indicators)
            return b'', []
        if line.startswith('+CIEV:'):
            return b'', self._ciev(line)
        if line == 'RING':
            return b'', [('ring',)]
        if line.startswith('+CLIP:'):
            number = line.split(':', 1)[1].split(',')[0].strip().strip('"')
            return b'', [('clip', number)]
        if line.startswith('+VGS:') or line.startswith('+VGM:'):
            kind = 'speaker' if line.startswith('+VGS') else 'mic'
            return b'', [('volume', kind, int(line.split(':', 1)[1].strip() or 0))]
        if line.startswith('+BCS:'):
            # We never offered codec negotiation; tell the AG again that only CVSD is available.
            return self._enqueue('AT+BAC=%d' % CODEC_CVSD), []
        return b'', [('unsolicited', line)]

    def _ciev(self, line):
        try:
            idx, value = (int(v) for v in line.split(':', 1)[1].split(','))
        except ValueError:
            return [('unsolicited', line)]
        if not 1 <= idx <= len(self.indicator_names):
            return [('unsolicited', line)]
        name = self.indicator_names[idx - 1]
        self.indicators[name] = value
        events = [('indicator', name, value)]
        state = derive_call_state(self.indicators)
        if state != self.call_state:
            self.call_state = state
            events.append(('call_state', state))
        return events

    def _finish(self, ok, detail):
        command, self._pending = self._pending, None
        events = [('result', command, ok, detail)] if command else []
        if self.slc == 'handshake' and command is not None:
            if not ok:
                self.slc = 'failed'
                self._queue.clear()
                return b'', events + [('slc_failed', '%s → %s' % (command, detail))]
            if self._handshake:
                self._queue.insert(0, self._handshake.pop(0))
            else:
                self.slc = 'connected'
                events.append(('slc_connected', {
                    'ag_features': self.ag_features,
                    'ag_feature_names': decode_ag_features(self.ag_features),
                    'indicators': dict(self.indicators),
                    'call_state': self.call_state,
                }))
        return self._pump(), events

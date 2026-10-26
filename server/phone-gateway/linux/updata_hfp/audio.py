"""Call-audio plumbing that does not touch Bluetooth: WAV files, resampling, levels and the
SCO packet pump.

A CVSD SCO socket delivers and accepts signed 16-bit little-endian mono PCM at 8 kHz in packets
of the socket MTU (typically 48 or 60 bytes over USB). The controller expects one packet out for
every packet in, so the pump answers each received packet with exactly one packet of the same
size: queued prompt audio while something is playing, silence otherwise.
"""

import math
import sys
import threading
import time
import wave
from array import array

SCO_RATE = 8000
SAMPLE_BYTES = 2
GAP_MS = 20  # an inter-packet gap above this counts as a stall


def _to_le(samples):
    if sys.byteorder != 'little':
        samples = array('h', samples)
        samples.byteswap()
    return samples.tobytes()


def _from_le(data):
    samples = array('h')
    samples.frombytes(data[:len(data) - len(data) % 2])
    if sys.byteorder != 'little':
        samples.byteswap()
    return samples


def read_wav(path):
    """Returns (rate, mono samples as array('h')). 16-bit PCM only."""
    with wave.open(str(path), 'rb') as w:
        if w.getsampwidth() != 2:
            raise ValueError('%s: need 16-bit PCM, got %d-bit' % (path, 8 * w.getsampwidth()))
        rate, channels = w.getframerate(), w.getnchannels()
        samples = _from_le(w.readframes(w.getnframes()))
    if channels > 1:
        samples = array('h', (int(sum(samples[i:i + channels]) / channels)
                              for i in range(0, len(samples), channels)))
    return rate, samples


def write_wav(path, rate, samples):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(_to_le(samples))


def resample(samples, from_rate, to_rate):
    """Integer-ratio downsampling averages each group (a cheap low-pass); anything else is linear."""
    if from_rate == to_rate or not samples:
        return array('h', samples)
    if from_rate > to_rate and from_rate % to_rate == 0:
        step = from_rate // to_rate
        return array('h', (int(sum(samples[i:i + step]) / len(samples[i:i + step]))
                           for i in range(0, len(samples), step)))
    out_len = max(1, int(len(samples) * to_rate / from_rate))
    ratio = (len(samples) - 1) / max(1, out_len - 1)
    out = array('h')
    for i in range(out_len):
        pos = i * ratio
        lo = int(pos)
        hi = min(lo + 1, len(samples) - 1)
        out.append(int(samples[lo] + (samples[hi] - samples[lo]) * (pos - lo)))
    return out


def level_dbfs(samples):
    if not samples:
        return None
    rms = math.sqrt(sum(s * s for s in samples) / len(samples))
    return round(20 * math.log10(rms / 32768), 1) if rms > 0 else -120.0


def level_timeline(samples, rate=SCO_RATE, window_s=1.0):
    """dBFS per window: a quick way to see in the evidence when someone was speaking."""
    n = int(rate * window_s)
    return [level_dbfs(samples[i:i + n]) for i in range(0, len(samples), n)]


class ScoPump:
    """Moves one SCO packet in and one out. `sock` needs recv(n) and send(b)."""

    def __init__(self, sock, mtu, clock=time.monotonic):
        self.sock = sock
        self.mtu = mtu
        self.clock = clock
        self.rx = array('h')
        self.tx = array('h')
        self._play = b''
        self._play_pos = 0
        self._lock = threading.Lock()  # queue() runs on the main loop, pump_once() on the SCO thread
        self.stats = {
            'rx_packets': 0, 'tx_packets': 0, 'rx_bytes': 0, 'tx_bytes': 0,
            'rx_sizes': {}, 'stalls_over_%dms' % GAP_MS: 0, 'max_gap_ms': 0.0,
            'short_sends': 0, 'prompt_bytes_sent': 0,
        }
        self._last_rx = None

    def queue(self, samples):
        """Play these 8 kHz samples after anything already queued."""
        with self._lock:
            self._play = self._play[self._play_pos:] + _to_le(samples)
            self._play_pos = 0

    @property
    def playing(self):
        with self._lock:
            return self._play_pos < len(self._play)

    def pump_once(self):
        """Blocking: read one packet, answer with one. Returns False when the link closed."""
        data = self.sock.recv(self.mtu)
        if not data:
            return False
        now = self.clock()
        if self._last_rx is not None:
            gap = (now - self._last_rx) * 1000
            self.stats['max_gap_ms'] = round(max(self.stats['max_gap_ms'], gap), 1)
            if gap > GAP_MS:
                self.stats['stalls_over_%dms' % GAP_MS] += 1
        self._last_rx = now
        st = self.stats
        st['rx_packets'] += 1
        st['rx_bytes'] += len(data)
        st['rx_sizes'][len(data)] = st['rx_sizes'].get(len(data), 0) + 1
        self.rx.extend(_from_le(data))

        size = len(data)
        with self._lock:
            chunk = self._play[self._play_pos:self._play_pos + size]
            self._play_pos += len(chunk)
        st['prompt_bytes_sent'] += len(chunk)
        out = chunk + b'\x00' * (size - len(chunk))
        sent = self.sock.send(out)
        if sent != len(out):
            st['short_sends'] += 1
        st['tx_packets'] += 1
        st['tx_bytes'] += sent
        self.tx.extend(_from_le(out[:sent]))
        return True

    def summary(self):
        s = dict(self.stats)
        s['rx_seconds'] = round(len(self.rx) / SCO_RATE, 2)
        s['tx_seconds'] = round(len(self.tx) / SCO_RATE, 2)
        s['rx_level_dbfs'] = level_dbfs(self.rx)
        s['rx_level_timeline_dbfs'] = level_timeline(self.rx)
        s['rx_sizes'] = {str(k): v for k, v in s['rx_sizes'].items()}
        return s

import math
import os
import sys
import tempfile
import unittest
from array import array

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from updata_hfp import audio  # noqa: E402


def tone(rate, seconds, freq=440, amp=8000):
    return array('h', (int(amp * math.sin(2 * math.pi * freq * i / rate)) for i in range(int(rate * seconds))))


class FakeSco:
    """Delivers queued packets; records what was sent. Empty bytes = link closed."""

    def __init__(self, packets, short_send=False):
        self.packets = list(packets)
        self.sent = []
        self.short_send = short_send

    def recv(self, n):
        return self.packets.pop(0)[:n] if self.packets else b''

    def send(self, data):
        self.sent.append(data)
        return len(data) - 2 if self.short_send else len(data)


class FakeClock:
    def __init__(self, step):
        self.t, self.step = 0.0, step

    def __call__(self):
        self.t += self.step
        return self.t


class WavTest(unittest.TestCase):
    def test_roundtrip_and_stereo_mixdown(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'a.wav')
            audio.write_wav(path, 8000, array('h', [0, 1000, -1000, 32767]))
            self.assertEqual(audio.read_wav(path), (8000, array('h', [0, 1000, -1000, 32767])))
            import wave
            stereo = os.path.join(d, 's.wav')
            with wave.open(stereo, 'wb') as w:
                w.setnchannels(2)
                w.setsampwidth(2)
                w.setframerate(16000)
                w.writeframes(array('h', [100, 300, -200, -400]).tobytes())
            self.assertEqual(audio.read_wav(stereo), (16000, array('h', [200, -300])))

    def test_rejects_8bit(self):
        with tempfile.TemporaryDirectory() as d:
            import wave
            path = os.path.join(d, 'b.wav')
            with wave.open(path, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(1)
                w.setframerate(8000)
                w.writeframes(b'\x80' * 10)
            with self.assertRaises(ValueError):
                audio.read_wav(path)


class ResampleTest(unittest.TestCase):
    def test_lengths(self):
        self.assertEqual(len(audio.resample(tone(24000, 1), 24000, 8000)), 8000)
        self.assertEqual(len(audio.resample(tone(16000, 1), 16000, 8000)), 8000)
        self.assertEqual(len(audio.resample(tone(22050, 1), 22050, 8000)), 8000)
        self.assertEqual(len(audio.resample(tone(8000, 1), 8000, 16000)), 16000)

    def test_keeps_speech_band_level(self):
        src = tone(24000, 1, freq=440)
        out = audio.resample(src, 24000, 8000)
        self.assertAlmostEqual(audio.level_dbfs(out), audio.level_dbfs(src), delta=1.0)

    def test_attenuates_above_nyquist(self):
        # 7 kHz cannot exist at 8 kHz; averaging must knock it down hard instead of aliasing at full level
        out = audio.resample(tone(24000, 1, freq=7000), 24000, 8000)
        self.assertLess(audio.level_dbfs(out), audio.level_dbfs(tone(24000, 1)) - 10)

    def test_levels(self):
        self.assertIsNone(audio.level_dbfs(array('h')))
        self.assertEqual(audio.level_dbfs(array('h', [0] * 10)), -120.0)
        self.assertEqual(len(audio.level_timeline(array('h', [0] * 20000))), 3)


class ScoPumpTest(unittest.TestCase):
    def test_answers_every_packet_with_one_of_the_same_size(self):
        packets = [b'\x01\x00' * 24, b'\x02\x00' * 30, b'\x03\x00' * 24]
        sock = FakeSco(packets)
        pump = audio.ScoPump(sock, 60, clock=FakeClock(0.003))
        while pump.pump_once():
            pass
        self.assertEqual([len(p) for p in sock.sent], [48, 60, 48])
        self.assertTrue(all(b == 0 for p in sock.sent for b in p))  # silence when nothing queued
        self.assertEqual(len(pump.rx), 78)
        s = pump.summary()
        self.assertEqual((s['rx_packets'], s['tx_packets']), (3, 3))
        self.assertEqual(s['rx_sizes'], {'48': 2, '60': 1})
        self.assertEqual(s['stalls_over_20ms'], 0)

    def test_prompt_is_sent_in_order_then_silence(self):
        prompt = array('h', range(1, 61))  # 120 bytes = 2.5 packets of 48
        sock = FakeSco([b'\x00' * 48] * 4)
        pump = audio.ScoPump(sock, 48, clock=FakeClock(0.003))
        pump.queue(prompt)
        self.assertTrue(pump.playing)
        while pump.pump_once():
            pass
        self.assertFalse(pump.playing)
        self.assertEqual(list(pump.tx[:60]), list(prompt))
        self.assertEqual(list(pump.tx[60:]), [0] * 36)
        self.assertEqual(pump.stats['prompt_bytes_sent'], 120)

    def test_counts_stalls_and_short_sends(self):
        sock = FakeSco([b'\x00' * 48] * 3, short_send=True)
        pump = audio.ScoPump(sock, 48, clock=FakeClock(0.05))
        while pump.pump_once():
            pass
        self.assertEqual(pump.stats['stalls_over_20ms'], 2)
        self.assertEqual(pump.stats['max_gap_ms'], 50.0)
        self.assertEqual(pump.stats['short_sends'], 3)


if __name__ == '__main__':
    unittest.main()

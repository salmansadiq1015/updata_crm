import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from updata_hfp import at  # noqa: E402

# Indicator list in the order Android's Bluetooth stack reports it.
CIND_TEST = ('+CIND: ("call",(0,1)),("callsetup",(0-3)),("service",(0-1)),("signal",(0-5)),'
             '("roam",(0,1)),("battchg",(0-5)),("callheld",(0-2))')


def handshake(proto, cind_values='0,0,1,5,0,4,0'):
    sent = [proto.start()]
    events = []
    for reply in (b'\r\n+BRSF: 879\r\n\r\nOK\r\n', ('\r\n%s\r\n\r\nOK\r\n' % CIND_TEST).encode(),
                  ('\r\n+CIND: %s\r\n\r\nOK\r\n' % cind_values).encode(), b'\r\nOK\r\n'):
        out, evs = proto.feed(reply)
        sent.append(out)
        events.extend(evs)
    return sent, events


class HandshakeTest(unittest.TestCase):
    def test_slc_sequence_and_result(self):
        proto = at.HfProtocol()
        sent, events = handshake(proto)
        self.assertEqual(sent, [b'AT+BRSF=52\r', b'AT+CIND=?\r', b'AT+CIND?\r', b'AT+CMER=3,0,0,1\r', b''])
        slc = [e for e in events if e[0] == 'slc_connected']
        self.assertEqual(len(slc), 1)
        info = slc[0][1]
        self.assertEqual(info['ag_features'], 879)
        self.assertIn('codec_negotiation', info['ag_feature_names'])
        self.assertEqual(info['indicators']['service'], 1)
        self.assertEqual(info['call_state'], 'idle')
        self.assertEqual(proto.slc, 'connected')

    def test_no_codec_negotiation_or_three_way_offered(self):
        self.assertFalse(at.DEFAULT_HF_FEATURES & at.HF_CODEC_NEGOTIATION)
        self.assertFalse(at.DEFAULT_HF_FEATURES & at.HF_THREE_WAY)
        self.assertFalse(at.DEFAULT_HF_FEATURES & at.HF_VOICE_RECOGNITION)

    def test_error_during_handshake_fails_slc(self):
        proto = at.HfProtocol()
        proto.start()
        proto.feed(b'\r\n+BRSF: 879\r\n\r\nOK\r\n')
        out, events = proto.feed(b'\r\nERROR\r\n')
        self.assertEqual(out, b'')
        self.assertEqual(proto.slc, 'failed')
        self.assertTrue(any(e[0] == 'slc_failed' and 'AT+CIND=?' in e[1] for e in events))

    def test_phone_already_in_call_is_reported(self):
        proto = at.HfProtocol()
        _, events = handshake(proto, cind_values='1,0,1,5,0,4,0')
        self.assertEqual([e for e in events if e[0] == 'slc_connected'][0][1]['call_state'], 'active')

    def test_bytes_split_across_reads_and_bare_newlines(self):
        proto = at.HfProtocol()
        proto.start()
        out1, ev1 = proto.feed(b'\r\n+BRSF: 8')
        out2, ev2 = proto.feed(b'79\r')
        out3, ev3 = proto.feed(b'\n\r\nOK\n')
        self.assertEqual(proto.ag_features, 879)
        self.assertEqual(out1 + out2 + out3, b'AT+CIND=?\r')


class CallTest(unittest.TestCase):
    def setUp(self):
        self.proto = at.HfProtocol()
        handshake(self.proto)

    def test_outgoing_call_states(self):
        self.assertEqual(self.proto.dial('+92 300-1234567'), b'ATD+923001234567;\r')
        _, ev = self.proto.feed(b'\r\nOK\r\n')
        self.assertIn(('result', 'ATD+923001234567;', True, 'OK'), ev)
        states = []
        for line in (b'+CIEV: 2,2\r\n', b'+CIEV: 2,3\r\n', b'+CIEV: 1,1\r\n', b'+CIEV: 2,0\r\n', b'+CIEV: 1,0\r\n'):
            _, ev = self.proto.feed(line)
            states += [e[1] for e in ev if e[0] == 'call_state']
        self.assertEqual(states, ['dialing', 'alerting', 'active', 'idle'])

    def test_dial_rejected(self):
        self.proto.dial('03001234567')
        _, ev = self.proto.feed(b'\r\n+CME ERROR: 30\r\n')
        self.assertEqual(ev, [('result', 'ATD03001234567;', False, '+CME ERROR: 30')])

    def test_commands_wait_for_previous_reply(self):
        self.assertEqual(self.proto.dial('03001234567'), b'ATD03001234567;\r')
        self.assertEqual(self.proto.hangup(), b'')  # queued behind ATD
        out, _ = self.proto.feed(b'\r\nOK\r\n')
        self.assertEqual(out, b'AT+CHUP\r')

    def test_rejects_non_numbers(self):
        for bad in ('', '12', '*#06#', '0300;ATH', 'abc1234567'):
            with self.assertRaises(ValueError):
                self.proto.dial(bad)

    def test_dial_needs_slc(self):
        with self.assertRaises(RuntimeError):
            at.HfProtocol().dial('03001234567')

    def test_unsolicited_and_unknown_indicator(self):
        _, ev = self.proto.feed(b'RING\r\n+CLIP: "+923001234567",145\r\n+VGS: 9\r\n+CIEV: 99,1\r\n')
        self.assertEqual(ev[:3], [('ring',), ('clip', '+923001234567'), ('volume', 'speaker', 9)])
        self.assertEqual(ev[3][0], 'unsolicited')

    def test_codec_selection_answered_with_cvsd_only(self):
        out, _ = self.proto.feed(b'\r\n+BCS: 2\r\n')
        self.assertEqual(out, b'AT+BAC=1\r')


if __name__ == '__main__':
    unittest.main()

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from updata_hfp.callscript import CallScript  # noqa: E402

NUMBER = '+923001234567'


def kinds(actions):
    return [a[0] for a in actions if a[0] != 'log']


def finish_of(actions):
    return next((a for a in actions if a[0] == 'finish'), None)


class Driver:
    def __init__(self, **options):
        self.t = 0.0
        self.s = CallScript(NUMBER, self.t, **options)
        self.actions = []

    def at(self, t, event=None, **data):
        self.t = t
        out = self.s.tick(t) if event is None else self.s.handle(event, t, **data)
        self.actions += out
        return out

    def run_ticks(self, until, step=0.2):
        out = []
        t = self.t
        while t < until:
            t = round(t + step, 3)
            out += self.at(t)
        return out

    def count(self, kind):
        return sum(1 for a in self.actions if a[0] == kind)


class HappyPathTest(unittest.TestCase):
    def test_full_script(self):
        d = Driver(listen_s=5, after_s=5)
        self.assertEqual(kinds(d.at(1, 'slc_connected', call_state='idle')), ['dial'])
        self.assertEqual(d.actions[-1], ('dial', NUMBER))
        d.at(1.2, 'dial_result', ok=True, detail='OK')
        d.at(2, 'call_state', state='dialing')
        d.at(3, 'call_state', state='alerting')
        d.at(4, 'audio_opened')  # in-band ringback opens SCO before the answer
        d.at(10, 'call_state', state='active')
        self.assertEqual(d.s.phase, 'listening')
        self.assertEqual(d.s.metrics['setup_s'], 9.0)
        self.assertEqual(kinds(d.run_ticks(15.4)), ['play'])
        self.assertEqual(d.s.phase, 'speaking')
        d.at(19, 'prompt_done')
        self.assertEqual(kinds(d.run_ticks(24.4)), ['hangup'])
        f = finish_of(d.at(25, 'call_state', state='idle'))
        self.assertEqual(f[1], 'completed')
        self.assertEqual(d.count('dial'), 1)

    def test_gateway_opens_audio_when_phone_does_not(self):
        d = Driver()
        d.at(0, 'slc_connected', call_state='idle')
        d.at(1, 'call_state', state='alerting')
        d.at(5, 'call_state', state='active')
        self.assertEqual(d.s.phase, 'waiting_audio')
        self.assertIn('connect_sco', kinds(d.run_ticks(9.6)))
        d.at(9.8, 'audio_opened')
        self.assertEqual(d.s.phase, 'listening')
        self.assertEqual(d.count('connect_sco'), 1)


class FailureTest(unittest.TestCase):
    def test_phone_already_in_call_never_dials(self):
        d = Driver()
        f = finish_of(d.at(1, 'slc_connected', call_state='active'))
        self.assertEqual(f[1], 'phone_busy')
        self.assertEqual(d.count('dial'), 0)

    def test_slc_timeout(self):
        d = Driver(slc_timeout_s=3)
        self.assertEqual(finish_of(d.run_ticks(4))[1], 'slc_failed')
        self.assertEqual(d.count('dial'), 0)

    def test_dial_rejected_by_phone(self):
        d = Driver()
        d.at(0, 'slc_connected', call_state='idle')
        self.assertEqual(finish_of(d.at(0.5, 'dial_result', ok=False, detail='ERROR'))[1], 'dial_rejected')

    def test_busy_or_rejected_while_ringing(self):
        d = Driver()
        d.at(0, 'slc_connected', call_state='idle')
        d.at(1, 'call_state', state='alerting')
        self.assertEqual(finish_of(d.at(6, 'call_state', state='idle'))[1], 'not_answered')

    def test_ring_timeout_hangs_up_then_waits_for_idle(self):
        d = Driver(ring_timeout_s=10)
        d.at(0, 'slc_connected', call_state='idle')
        d.at(1, 'call_state', state='alerting')
        self.assertIn('hangup', kinds(d.run_ticks(11.4)))
        self.assertEqual(finish_of(d.at(12, 'call_state', state='idle'))[1], 'not_answered')

    def test_control_link_lost_after_dial_is_unknown_never_redialed(self):
        d = Driver()
        d.at(0, 'slc_connected', call_state='idle')
        d.at(1, 'call_state', state='alerting')
        self.assertEqual(finish_of(d.at(2, 'slc_lost'))[1], 'outcome_unknown')
        self.assertEqual(d.at(3, 'slc_connected', call_state='idle'), [])
        self.assertEqual(d.count('dial'), 1)

    def test_audio_never_arrives(self):
        d = Driver(audio_wait_s=2, audio_fail_s=5)
        d.at(0, 'slc_connected', call_state='idle')
        d.at(1, 'call_state', state='active')
        out = d.run_ticks(6.4)
        self.assertEqual(kinds(out), ['connect_sco', 'hangup'])
        self.assertEqual(finish_of(d.at(7, 'call_state', state='idle'))[1], 'audio_failed')

    def test_audio_lost_mid_conversation(self):
        d = Driver()
        d.at(0, 'slc_connected', call_state='idle')
        d.at(1, 'audio_opened')
        d.at(2, 'call_state', state='active')
        self.assertEqual(kinds(d.at(4, 'audio_closed')), [])
        self.assertEqual(kinds(d.run_ticks(6.4)), ['hangup'])  # call stayed up past the grace period
        self.assertEqual(finish_of(d.at(7, 'call_state', state='idle'))[1], 'audio_lost')

    def test_remote_hangup_closes_audio_first(self):
        d = Driver()
        d.at(0, 'slc_connected', call_state='idle')
        d.at(1, 'audio_opened')
        d.at(2, 'call_state', state='active')
        d.at(4, 'audio_closed')
        self.assertEqual(finish_of(d.at(4.3, 'call_state', state='idle'))[1], 'remote_hangup')
        self.assertEqual(d.count('hangup'), 0)

    def test_remote_hangs_up_while_listening(self):
        d = Driver()
        d.at(0, 'slc_connected', call_state='idle')
        d.at(1, 'audio_opened')
        d.at(2, 'call_state', state='active')
        self.assertEqual(finish_of(d.at(3, 'call_state', state='idle'))[1], 'remote_hangup')

    def test_hangup_never_confirmed(self):
        d = Driver(ring_timeout_s=2, hangup_timeout_s=3)
        d.at(0, 'slc_connected', call_state='idle')
        d.at(0.5, 'call_state', state='alerting')
        self.assertEqual(finish_of(d.run_ticks(7))[1], 'outcome_unknown')

    def test_phone_never_confirms_dial(self):
        d = Driver(dial_ack_timeout_s=3, hangup_timeout_s=3)
        d.at(0, 'slc_connected', call_state='idle')
        out = d.run_ticks(8)
        self.assertEqual(kinds(out), ['hangup', 'finish'])
        self.assertEqual(finish_of(out)[1], 'outcome_unknown')

    def test_max_duration_cap(self):
        d = Driver(max_call_s=20, listen_s=100)
        d.at(0, 'slc_connected', call_state='idle')
        d.at(1, 'audio_opened')
        d.at(2, 'call_state', state='active')
        self.assertIn('hangup', kinds(d.run_ticks(20.4)))
        self.assertEqual(finish_of(d.at(21, 'call_state', state='idle'))[1], 'max_duration')

    def test_events_after_done_are_ignored(self):
        d = Driver()
        d.at(1, 'slc_connected', call_state='active')
        self.assertEqual(d.at(2, 'call_state', state='idle'), [])
        self.assertEqual(d.run_ticks(5), [])


if __name__ == '__main__':
    unittest.main()

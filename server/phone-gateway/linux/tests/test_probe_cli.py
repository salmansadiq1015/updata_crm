import contextlib
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import hfp_probe  # noqa: E402


class CliGuardTest(unittest.TestCase):
    def run_main(self, argv):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            hfp_probe.main(argv)
        return str(cm.exception.code)

    def test_call_needs_ownership_flag(self):
        msg = self.run_main(['call', '--device', 'AA:BB:CC:DD:EE:FF', '--number', '03001234567', '--prompt', 'p.wav'])
        self.assertIn('--i-own-this-number', msg)

    def test_call_needs_prompt_and_valid_number(self):
        base = ['call', '--device', 'AA:BB:CC:DD:EE:FF', '--i-own-this-number']
        self.assertIn('--prompt', self.run_main(base + ['--number', '03001234567']))
        self.assertIn('not a dialable number', self.run_main(base + ['--number', '0300;ATH', '--prompt', 'p.wav']))

    def test_device_required(self):
        self.assertIn('--device', self.run_main(['connect']))

    def test_mask_number(self):
        self.assertEqual(hfp_probe.mask_number('+923001234567'), '+923******567')
        self.assertEqual(hfp_probe.mask_number('12345'), '***')

    def test_script_timings_are_overridable(self):
        args = hfp_probe.build_parser().parse_args(['call', '--listen-s', '6', '--ring-timeout-s', '30'])
        self.assertEqual((args.listen_s, args.ring_timeout_s, args.after_s), (6.0, 30.0, None))


if __name__ == '__main__':
    unittest.main()

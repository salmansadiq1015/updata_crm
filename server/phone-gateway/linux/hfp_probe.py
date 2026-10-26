#!/usr/bin/env python3
"""Updata HFP hands-free probe for Linux/BlueZ: the Phase 1 two-way cellular audio proof.

Modes
  info     adapter, phone and conflicting-service checks (read-only)
  connect  open the HFP control link, log the phone's features and indicators, hold, close.
           Also accepts an audio link if the phone opens one. Never dials.
  call     dial ONE number you own, record the remote side, play a prompt into the call,
           record the reply, hang up. Needs --i-own-this-number and --prompt.

Evidence goes to --out: hfp-probe.jsonl, remote.wav (what the phone sent us) and sent.wav
(what we sent the phone). Run tools/audio-evidence.mjs to transcribe remote.wav.
"""

import argparse
import os
import platform
import shutil
import signal
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from updata_hfp import at, audio  # noqa: E402
from updata_hfp.callscript import CallScript, DEFAULTS  # noqa: E402
from updata_hfp.evidence import Evidence  # noqa: E402

SCO_SILENCE_S = 2.0  # no SCO packet for this long = audio lost


def mask_number(number):
    return number[:4] + '*' * max(0, len(number) - 7) + number[-3:] if len(number) > 7 else '***'


def _run(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError) as e:
        return 'unavailable (%s)' % e


def conflicting_services():
    """Processes that would claim the HFP role or SCO links before we do."""
    found = []
    for name in ('ofonod', 'wireplumber', 'pipewire', 'pulseaudio'):
        if shutil.which('pgrep') and _run(['pgrep', '-x', name]):
            found.append(name)
    return found


def run_info(args, ev, bus_factory):
    from updata_hfp import bluez
    ev('host', kernel=platform.release(), python=platform.python_version(),
       bluez=_run(['bluetoothctl', '--version']), distro=_run(['sh', '-c', '. /etc/os-release && echo "$PRETTY_NAME"']))
    ev('conflicts', running=conflicting_services(),
       note='wireplumber/pipewire only conflict if their bluez5 HFP roles are enabled; ofonod always does')
    bus = bus_factory()
    adapter_path, adapter_addr = bluez.find_adapter(bus, args.adapter)
    ev('adapter', path=adapter_path, address=adapter_addr, btmgmt=_run(['btmgmt', '--index', adapter_path.rsplit('hci', 1)[-1], 'info']))
    if args.device:
        props = bluez.device_props(bus, bluez.device_path(adapter_path, args.device))
        ev('device', address=args.device, props=props,
           has_hfp_ag=bool(props and bluez.HFP_AG_UUID in props['uuids']))
    return 0


class Session:
    def __init__(self, args, ev, bus, glib):
        from updata_hfp import bluez
        self.bluez = bluez
        self.args, self.ev, self.bus, self.GLib = args, ev, bus, glib
        self.proto = at.HfProtocol()
        self.loop = glib.MainLoop()
        self.adapter_path, self.adapter_addr = bluez.find_adapter(bus, args.adapter)
        self.dev_path = bluez.device_path(self.adapter_path, args.device)
        self.rfcomm = None
        self.sco_server = None
        self.stopping = threading.Event()
        self.pump = None
        self.pumps = []
        self.prompt_armed = False
        self.exit_code = 0
        self.script = None
        self.prompt = None
        self.held_since = None
        self.last_heartbeat = 0
        self.started = time.monotonic()
        self.signaled = False
        if args.mode == 'call':
            self.number = at.normalize_number(args.number)
            rate, samples = audio.read_wav(args.prompt)
            self.prompt = audio.resample(samples, rate, audio.SCO_RATE)
            ev('prompt_loaded', file=os.path.basename(args.prompt), source_rate=rate,
               seconds=round(len(self.prompt) / audio.SCO_RATE, 2), level_dbfs=audio.level_dbfs(self.prompt))

    # ---- lifecycle ------------------------------------------------------------------------

    def run(self):
        props = self.bluez.device_props(self.bus, self.dev_path)
        self.ev('device', address=self.args.device, props=props)
        if not props or not props['paired']:
            self.ev('abort', reason='phone is not paired with this adapter')
            return 2
        if self.bluez.HFP_AG_UUID not in props['uuids']:
            self.ev('warning', detail='phone does not list the HFP Audio Gateway UUID yet')
        self.profile = self.bluez.HfProfile(self.bus, self.on_connection, self.on_disconnect_request)
        self.manager = self.bluez.register_profile(self.bus, at.DEFAULT_SDP_FEATURES)
        self.ev('profile_registered', uuid=self.bluez.HFP_HF_UUID, sdp_features=at.DEFAULT_SDP_FEATURES,
                hf_features=self.proto.hf_features)
        try:
            self.sco_server = self.bluez.sco_listen(self.adapter_addr)
            threading.Thread(target=self._accept_loop, daemon=True).start()
        except OSError as e:  # keep going: the gateway-initiated audio link may still work
            self.sco_server = None
            self.ev('sco_listen_failed', detail=str(e))
        if self.args.mode == 'call':
            opts = {k: getattr(self.args, k) for k in DEFAULTS if getattr(self.args, k, None) is not None}
            self.script = CallScript(self.number, time.monotonic(), **opts)
        self.GLib.timeout_add(200, self._tick)
        self.GLib.unix_signal_add(self.GLib.PRIORITY_HIGH, signal.SIGINT, self._on_signal)
        self.GLib.unix_signal_add(self.GLib.PRIORITY_HIGH, signal.SIGTERM, self._on_signal)
        self.ev('connect_requested', device=self.dev_path)
        self.bluez.connect_ag(self.bus, self.dev_path,
                              on_ok=lambda: self.ev('connect_profile_ok'),
                              on_error=self._on_connect_error)
        self.loop.run()
        self._cleanup()
        return self.exit_code

    def stop(self, code=0):
        self.exit_code = self.exit_code or code
        self.stopping.set()
        self.loop.quit()

    def _cleanup(self):
        if self.rfcomm is not None:
            try:
                self.rfcomm.close()
            except OSError:
                pass
        if self.sco_server is not None:
            self.sco_server.close()
        self.bluez.unregister_profile(self.manager)
        if self.pumps:
            from array import array
            rx, tx = array('h'), array('h')
            for p in self.pumps:
                rx.extend(p.rx)
                tx.extend(p.tx)
            audio.write_wav(self.ev.file('remote.wav'), audio.SCO_RATE, rx)
            audio.write_wav(self.ev.file('sent.wav'), audio.SCO_RATE, tx)
            self.ev('audio_summary', links=[p.summary() for p in self.pumps],
                    files=['remote.wav', 'sent.wav'])
        else:
            self.ev('audio_summary', links=[], note='no audio link was ever opened')
        self.ev('probe_end', exit_code=self.exit_code)

    # ---- control link ---------------------------------------------------------------------

    def _on_connect_error(self, detail):
        self.ev('connect_failed', detail=detail)
        if self.rfcomm is None:
            self._script('slc_failed', detail=detail) if self.script else self.stop(3)

    def on_connection(self, device, sock, props):
        if device != self.dev_path or self.rfcomm is not None:
            self.ev('connection_ignored', device=device)
            sock.close()
            return
        self.rfcomm = sock
        self.ev('rfcomm_connected', device=device, props=props)
        self.GLib.io_add_watch(sock.fileno(), self.GLib.IO_IN | self.GLib.IO_HUP | self.GLib.IO_ERR, self._on_rfcomm)
        self._send(self.proto.start())

    def on_disconnect_request(self, device):
        self.ev('disconnect_requested_by_bluez', device=device)
        self._slc_lost('bluez requested disconnection')

    def _send(self, data):
        if data and self.rfcomm is not None:
            self.ev('at_tx', line=data.decode('ascii').strip())
            self.rfcomm.send(data)

    def _on_rfcomm(self, fd, condition):
        try:
            data = self.rfcomm.recv(1024) if condition & self.GLib.IO_IN else b''
        except OSError as e:
            data, condition = b'', str(e)
        if not data:
            self._slc_lost('rfcomm closed (%s)' % condition)
            return False
        out, events = self.proto.feed(data)
        for line in data.decode('ascii', errors='replace').split('\r\n'):
            if line.strip():
                self.ev('at_rx', line=line.strip())
        self._send(out)
        for e in events:
            self._on_proto_event(e)
        return True

    def _slc_lost(self, detail):
        if self.rfcomm is None:
            return
        self.ev('slc_disconnected', detail=detail)
        self.rfcomm = None
        if self.script:
            self._script('slc_lost', detail=detail)
        else:
            self.stop(0 if self.stopping.is_set() else 4)

    def _on_proto_event(self, e):
        kind = e[0]
        if kind == 'slc_connected':
            self.ev('slc_connected', **e[1])
            self.held_since = time.monotonic()
            if self.script:
                self._script('slc_connected', call_state=e[1]['call_state'])
        elif kind == 'slc_failed':
            self.ev('slc_failed', detail=e[1])
            self._script('slc_failed', detail=e[1]) if self.script else self.stop(3)
        elif kind == 'call_state':
            self.ev('call_state', state=e[1])
            if self.script:
                self._script('call_state', state=e[1])
        elif kind == 'result':
            _, command, ok, detail = e
            if command.startswith('ATD'):
                command = 'ATD<masked>;'
                if self.script:
                    self._script('dial_result', ok=ok, detail=detail)
            self.ev('at_result', command=command, ok=ok, detail=detail)
        elif kind == 'clip':
            self.ev('clip', number=mask_number(e[1]))
        else:
            self.ev(kind, detail=list(e[1:]))

    # ---- audio link -----------------------------------------------------------------------

    def _accept_loop(self):
        self.sco_server.settimeout(0.5)
        while not self.stopping.is_set():
            try:
                conn, peer = self.sco_server.accept()
            except (TimeoutError, OSError):
                continue
            peer = peer.decode() if isinstance(peer, bytes) else str(peer)
            if peer.upper() != self.args.device.upper() or self.pump is not None:
                busy = self.pump is not None
                self.GLib.idle_add(lambda: self.ev('sco_rejected', peer=peer, busy=busy))
                conn.close()
                continue
            self._run_pump(conn, 'phone')

    def _connect_sco(self):
        def work():
            try:
                conn = self.bluez.sco_connect(self.adapter_addr, self.args.device)
            except OSError as e:
                detail = str(e)
                self.GLib.idle_add(lambda: self.ev('sco_connect_failed', detail=detail))
                return
            self._run_pump(conn, 'gateway')
        threading.Thread(target=work, daemon=True).start()

    def _run_pump(self, conn, opened_by):
        details = self.bluez.sco_details(conn)
        conn.settimeout(SCO_SILENCE_S)  # a live SCO link delivers a packet every few ms
        pump = audio.ScoPump(conn, details['mtu'])
        self.pump = pump
        self.pumps.append(pump)
        self.GLib.idle_add(self._audio_event, 'audio_opened', dict(details, opened_by=opened_by))
        reason = 'closed by phone'
        try:
            while not self.stopping.is_set() and pump.pump_once():
                if self.prompt_armed and not pump.playing:
                    self.prompt_armed = False
                    self.GLib.idle_add(self._audio_event, 'prompt_done', {})
        except OSError as e:
            reason = str(e)
        conn.close()
        self.pump = None
        self.GLib.idle_add(self._audio_event, 'audio_closed', {'detail': reason, 'stats': pump.summary()})

    def _audio_event(self, kind, data):
        self.ev(kind, **data)
        if self.script:
            self._script(kind)
        return False

    # ---- script ---------------------------------------------------------------------------

    def _script(self, event, **data):
        for action in self.script.handle(event, time.monotonic(), **data):
            self._act(action)

    def _act(self, action):
        kind = action[0]
        if kind == 'log':
            self.ev(action[1], **action[2])
        elif kind == 'dial':
            self.ev('dial', number=mask_number(action[1]))
            self._send(self.proto.dial(action[1]))
        elif kind == 'hangup':
            self._send(self.proto.hangup())
        elif kind == 'connect_sco':
            self._connect_sco()
        elif kind == 'play':
            if self.pump is None:
                self.ev('play_skipped', reason='no audio link')
                return
            self.prompt_armed = True
            self.pump.queue(self.prompt)
            self.ev('prompt_playing', seconds=round(len(self.prompt) / audio.SCO_RATE, 2))
        elif kind == 'finish':
            extra = {}
            if action[1] == 'outcome_unknown':
                extra['operator_action'] = 'look at the phone and end the call by hand if it is still up'
            self.ev('call_finished', outcome=action[1], detail=action[2], metrics=self.script.metrics,
                    gate='needs_review: transcribe remote.wav and get the remote person to confirm what they heard',
                    **extra)
            self.stop(0 if action[1] == 'completed' else 5)

    def _tick(self):
        now = time.monotonic()
        if self.script:
            for action in self.script.tick(now):
                self._act(action)
        elif self.held_since is None and now - self.started > DEFAULTS['slc_timeout_s']:
            self.ev('slc_timeout', seconds=DEFAULTS['slc_timeout_s'])
            self.stop(3)
            return False
        elif self.held_since is not None:
            if now - self.held_since > self.args.hold:
                self.ev('hold_done', seconds=self.args.hold)
                self.stopping.set()
                self.stop(0)
                return False
            if now - self.last_heartbeat > 15:
                self.last_heartbeat = now
                self._send(self.proto.read_indicators())
        return not self.stopping.is_set()

    def _on_signal(self):
        self.ev('signal_received', repeated=self.signaled)
        in_call = self.script and self.script.dialed and self.script.phase != 'done' and self.rfcomm is not None
        if in_call and not self.signaled:
            self.signaled = True
            self._send(self.proto.hangup())
            self.GLib.timeout_add(3000, lambda: self.stop(130))
        else:
            self.stop(130)
        return True


def build_parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('mode', choices=['info', 'connect', 'call'])
    p.add_argument('--device', help="phone's Bluetooth address, e.g. 04:01:BB:51:10:48")
    p.add_argument('--adapter', help='hci0, hci1, … (default: first adapter)')
    p.add_argument('--out', default='evidence/run', help='evidence directory')
    p.add_argument('--hold', type=float, default=30, help='connect mode: seconds to hold the link')
    p.add_argument('--number', help='call mode: the number to dial')
    p.add_argument('--i-own-this-number', action='store_true', dest='owned',
                   help='call mode: confirms the number belongs to you or someone who agreed to the test')
    p.add_argument('--prompt', help='call mode: 16-bit PCM WAV to play into the call')
    p.add_argument('--countdown', type=int, default=5, help='call mode: seconds to abort before dialing')
    for key in DEFAULTS:
        p.add_argument('--' + key.replace('_', '-'), type=float, dest=key, help='default %s' % DEFAULTS[key])
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.mode != 'info' and not args.device:
        sys.exit('--device is required for %s' % args.mode)
    if args.mode == 'call':
        if not args.owned:
            sys.exit('call mode needs --i-own-this-number (only dial a number you own or that agreed to the test)')
        if not args.number or not args.prompt:
            sys.exit('call mode needs --number and --prompt')
        try:
            at.normalize_number(args.number)
        except ValueError as e:
            sys.exit(str(e))
    if platform.system() != 'Linux':
        sys.exit('hfp_probe.py needs Linux with BlueZ (this is %s)' % platform.system())

    ev = Evidence(args.out)
    safe_argv = [mask_number(a) if a == args.number else a for a in (argv or sys.argv[1:])]
    ev('probe_start', mode=args.mode, argv=safe_argv, kernel=platform.release())

    import dbus
    import dbus.mainloop.glib
    from gi.repository import GLib
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)

    try:
        if args.mode == 'info':
            return run_info(args, ev, dbus.SystemBus)
        if args.mode == 'call' and args.countdown > 0:
            print('Dialing %s in %d s from the paired phone. Ctrl-C to abort.' % (mask_number(at.normalize_number(args.number)), args.countdown), file=sys.stderr)
            time.sleep(args.countdown)
        return Session(args, ev, dbus.SystemBus(), GLib).run()
    except Exception as e:  # evidence first, then the traceback
        ev('probe_error', error=repr(e))
        raise
    finally:
        ev.close()


if __name__ == '__main__':
    sys.exit(main())

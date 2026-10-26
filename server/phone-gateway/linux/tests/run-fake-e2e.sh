#!/bin/sh
# Inside Linux: unit tests, then hfp_probe.py against tests/fake_bluez.py on a private system bus.
# Proves the D-Bus/RFCOMM/AT layers and the call script; SCO audio cannot be faked here.
set -eu
probe=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
export PYTHONDONTWRITEBYTECODE=1

python3 -m unittest discover -s "$probe/tests" 2>&1 | tail -3

cat > "$work/bus.conf" <<CONF
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>system</type>
  <listen>unix:path=$work/sysbus</listen>
  <auth>EXTERNAL</auth>
  <policy context="default">
    <allow user="*"/><allow own="*"/><allow send_destination="*"/><allow receive_type="*"/>
  </policy>
</busconfig>
CONF
dbus-daemon --config-file="$work/bus.conf" --fork --print-pid > "$work/bus.pid"
export DBUS_SYSTEM_BUS_ADDRESS="unix:path=$work/sysbus"

python3 "$probe/tests/fake_bluez.py" "$work/at.log" &
fake=$!
trap 'kill $fake $(cat "$work/bus.pid") 2>/dev/null || true' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do grep -q READY "$work/at.log" 2>/dev/null && break; sleep 0.3; done

python3 - "$work/prompt.wav" <<PY
import math, sys, wave, array
s = array.array('h', (int(6000 * math.sin(2 * math.pi * 440 * i / 24000)) for i in range(24000)))
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(s.tobytes()); w.close()
PY

fail() { echo "FAIL: $*"; echo "--- at.log"; cat "$work/at.log"; exit 1; }
ok() { echo "PASS: $*"; }

echo "== connect mode (hold 2 s)"
python3 "$probe/hfp_probe.py" connect --device 04:01:BB:51:10:48 --hold 2 --out "$work/connect" 2>/dev/null || fail "connect exit $?"
ev="$work/connect/hfp-probe.jsonl"
grep -q '"event": "slc_connected"' "$ev" || fail "no slc_connected"
grep -q '"ag_features": 879' "$ev" || fail "ag features not parsed"
grep -q '"event": "hold_done"' "$ev" || fail "hold did not finish"
grep -q 'AT AT+CMER=3,0,0,1' "$work/at.log" || fail "handshake incomplete"
grep -q 'REGISTER 0000111e-0000-1000-8000-00805f9b34fb features=20' "$work/at.log" || fail "profile not registered with SDP features 0x14"
grep -q 'UNREGISTER' "$work/at.log" || fail "profile not unregistered"
ok "connect: SLC up, features parsed, held, closed, profile unregistered"
: > "$work/at.log.call"; cp "$work/at.log" "$work/at.log.connect"

echo "== call mode (fake phone answers after 1 s; no SCO possible → audio_failed + hang-up)"
set +e
python3 "$probe/hfp_probe.py" call --device 04:01:BB:51:10:48 --number +923001234567 --i-own-this-number \
  --prompt "$work/prompt.wav" --countdown 0 --audio-wait-s 1 --audio-fail-s 3 --out "$work/call" 2>/dev/null
code=$?
set -e
ev="$work/call/hfp-probe.jsonl"
[ "$code" = 5 ] || fail "call exit $code (want 5)"
grep -q 'AT ATD+923001234567;' "$work/at.log" || fail "no dial"
[ "$(grep -c 'AT ATD' "$work/at.log")" = 1 ] || fail "dialed more than once"
grep -q 'AT AT+CHUP' "$work/at.log" || fail "no hang-up"
grep -q '"state": "alerting"' "$ev" || fail "alerting not seen"
grep -q '"state": "active"' "$ev" || fail "active not seen"
grep -q '"event": "script_connect_sco"' "$ev" || fail "gateway did not try to open audio"
grep -q '"outcome": "audio_failed"' "$ev" || fail "outcome not audio_failed"
grep -q '"setup_s"' "$ev" || fail "setup time missing"
if grep -q '923001234567' "$ev"; then fail "unmasked number in evidence"; fi
ok "call: one dial, alerting→active, audio missing → hang-up → audio_failed, number masked"
echo "evidence: $work"

# Linux HFP gateway probe: two-way cellular audio proof

A Linux machine with a USB Bluetooth dongle acts as the Android phone's **hands-free unit**
(Bluetooth HFP, HF role). The phone dials with its own SIM. Call audio flows over a SCO link:
the phone's downlink (the remote person) is recorded, and a generated voice prompt is played
into the call. Nothing here touches the CRM, campaigns or the AI agent. This is only the
Phase 1 gate.

```
remote person ⇄ cellular network ⇄ TECNO phone (SIM) ⇄ Bluetooth HFP/SCO ⇄ USB dongle ⇄ Linux VM ⇄ hfp_probe.py
```

## Why Linux

The macOS gateway failed the audio gate: the HFP control link works, but macOS refuses SCO in
both directions (`../../../docs/paired-phone/HARDWARE-COMPATIBILITY.md`). On Linux, BlueZ hands
us the HFP RFCOMM channel through its Profile API, and the kernel exposes SCO audio as a socket.
The probe speaks the AT protocol itself (`updata_hfp/at.py`) and moves raw 8 kHz PCM
(`updata_hfp/audio.py`), so no oFono or PipeWire is needed.

## 1. Hardware

| Item | Use | Avoid |
|---|---|---|
| **TP-Link UB500** (Realtek RTL8761BU, USB ID `2357:0604`) or ASUS USB-BT500 (`0b05:190e`) | Kernel `btrtl` driver (5.8+) plus `rtl_bt/rtl8761bu_fw.bin` firmware | Dongles sold as "Bluetooth 5.3/5.4" with an **Actions ATS2851** chip (no Linux driver), and CSR8510 clones (broken SCO) |

Check the USB ID after plugging it in (`lsusb`). macOS has no driver for Realtek Bluetooth, so
it leaves the dongle free for a VM to capture.

## 2. Linux machine

**First choice: a VM on this Mac.** Use UTM (free) or VirtualBox 7 with Ubuntu Server 24.04 x86_64
(kernel 6.8, BlueZ 5.72). Give the dongle to the VM through USB passthrough (UTM: USB sharing;
VirtualBox: USB 3.0 xHCI controller plus a device filter). A server image has no PipeWire or
oFono, so nothing competes for the hands-free role.

**Known risk:** SCO audio uses USB isochronous transfers, and virtual USB controllers sometimes
mishandle them. Step 6 measures this (`stalls_over_20ms`, `max_gap_ms`, packet counts). If
audio stalls or never arrives in the VM, use the same dongle on a Raspberry Pi 4/5 (64-bit
Raspberry Pi OS or Ubuntu). Do not use the Pi's built-in Bluetooth: it routes SCO to PCM pins,
not over HCI.

Copy this folder in (`scp -r server/phone-gateway/linux user@vm:`), then:

```sh
sh setup.sh --install   # apt: bluez, python3-dbus, python3-gi, linux-firmware
sh setup.sh             # read-only report: kernel, BlueZ, dongle, firmware, conflicts
```

If PipeWire/WirePlumber or oFono are running (a desktop image), stop them for the test
(`systemctl --user stop wireplumber pipewire pipewire-pulse`, `sudo systemctl stop ofono`).

## 3. Pair the phone (needs your hands on the phone)

On the Mac: System Settings → Bluetooth → TECNO SPARK 20 → **Disconnect**. That way the phone
does not route calls to the Mac. In the VM:

```sh
bluetoothctl
  power on
  agent on
  default-agent
  scan on            # wait for 04:01:BB:51:10:48
  pair 04:01:BB:51:10:48
  trust 04:01:BB:51:10:48
  quit
```

Confirm the code on the phone. In the phone's Bluetooth settings for this device, keep
**Phone calls** switched on. Set a default calling SIM, so dual-SIM "ask every time" cannot
block the dial.

## 4. Read-only check

```sh
python3 hfp_probe.py info --device 04:01:BB:51:10:48 --out evidence/info
```
Pass: `has_hfp_ag: true`, `paired: true`, and no `ofonod` in `conflicts`.

## 5. Control link, no call

```sh
sudo python3 hfp_probe.py connect --device 04:01:BB:51:10:48 --hold 60 --out evidence/connect
```
Pass: `slc_connected` (expect `ag_features: 879` on the TECNO), heartbeat `AT+CIND?` round trips
every 15 s, and no `slc_disconnected` before `hold_done`. (`sudo` is only needed if your user
may not open SCO sockets; try without it first.)

## 6. The two-way audio call

Make the prompt on the Mac and copy it in (`prompts/` is gitignored):
```sh
node ../tools/audio-evidence.mjs tts --out prompts/prompt-en.wav \
  --text "Hello, this is the Updata assistant speaking through your phone. If you can hear me, please say: the orange boat is ready."
```

**Brief the person answering** (your second phone). Do not tell them the orange-boat phrase in
advance. Their repeating it is the proof that they heard the AI:
1. Answer. In the first quiet seconds, say clearly: **"the blue whale crosses the river"**.
2. You will then hear an assistant. Do what it asks.
3. Stay on the line until the call ends by itself (about 30 s).

```sh
python3 hfp_probe.py call --device 04:01:BB:51:10:48 --number <your second SIM> --i-own-this-number \
  --prompt prompts/prompt-en.wav --out evidence/call1
```
It counts down 5 s (Ctrl-C aborts), dials **once**, waits up to 45 s for an answer, listens
10 s, plays the prompt, listens 10 s more, and hangs up. All timings are flags
(`--listen-s`, `--after-s`, `--ring-timeout-s`, `--max-call-s` …).
If the run ends with `outcome_unknown`, look at the phone and end the call by hand.

## 7. Evidence and the gate

Copy `evidence/call1/` back to the Mac, then:
```sh
node ../tools/audio-evidence.mjs transcribe evidence/call1/remote.wav --expect "the blue whale crosses the river"
```

| Gate item | Evidence | Pass when |
|---|---|---|
| Phone dials with its SIM and reports call state | `call_state` dialing → alerting → active → idle; `setup_s` | all seen; one `ATD` only |
| Remote speech reaches the gateway | `remote.wav` transcript | contains "blue whale crosses the river" |
| Gateway speech reaches the remote person | `remote.wav` transcript, plus the person's own word | contains "orange boat is ready", and they confirm it was clear |
| Both directions stay intelligible | `audio_summary`: `stalls_over_20ms`, `max_gap_ms`, `short_sends`, `rx_level_timeline_dbfs` | no long gaps; levels show speech in both windows |
| Hang-up and teardown | `call_finished outcome: completed`, `audio_closed`, `probe_end` | no `outcome_unknown` |

`sent.wav` is exactly what went into the call (prompt plus silence). Listen to it if the remote
side heard nothing, to tell "we never sent it" apart from "the phone or network dropped it".

This proves raw two-way cellular audio only. The live AI agent (LiveKit bridge as participant
`sip-<callId>`), wideband mSBC, Urdu prompts and multi-call stability come after this gate.

## Tests

```sh
python3 -m unittest discover -s tests     # AT protocol, audio pump, call script, CLI guards (any OS)
sh test-docker.sh                         # Ubuntu 24.04: the above + hfp_probe.py against a fake BlueZ/phone on D-Bus
```

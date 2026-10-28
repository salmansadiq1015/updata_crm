# Physical ESP32 setup — 2026-10-27

## Verified status

**PHONE BRIDGE VERIFIED**, including **PROTOCOL VERIFIED**, **HARDWARE VERIFIED**
and **FIRMWARE FLASHED**, by the final physical listening test below.
The real Android phone is paired over HFP, and the Mac gateway is authenticated,
registered to the account owner and reporting the physical board to the CRM.
Real two-way PCM transport and an AI conversation passed. The final +6 dB call
recorded the owner's explicit confirmation that the AI voice was loud and clear.
Audio verification is now recorded in the CRM. A subsequent owner-generated key
at 20:39 is pending provisioning; this currently blocks new calls until BOOT is
held while using the CRM Provision button. Normal reconnect needs no new key.
See [CRM-SETUP.md](../CRM-SETUP.md) for the new manual controls, permissions,
deployment artifact and current test results.

One owner-authorized test call was attempted at 19:49 Karachi. The phone created
an actual outgoing Jazz SIM call, but the gateway ended its room prematurely on
an initial idle status before Android had created its Telecom call. The agent
never spoke and no answers were collected. Android Telecom showed the call
continuing to alert after the gateway had reported no_answer. The supervised
test was explicitly ended on the phone at 19:50:04; disconnect was confirmed.
The gateway defect was reproduced and fixed. The owner then approved one retry
and selected SIM 1. Android subscription inspection confirmed SIM 1 is Jazz,
subscription 3, and already the default outgoing account. The retry at 19:53
reached HFP outgoing/ringing, was answered at 19:54:06 and remained active for
48 seconds. The AI worker joined and generated speech, but board and gateway
telemetry proved zero audio frames in either direction. No answers were saved.
The gateway observed hangup at 19:54:54. The CRM labels the attempt no_answer
because disclosure was never completed; that label must not be mistaken for
proof that the cellular call was not answered.

The second physical failure was a firmware callback mismatch: sdkconfig selects
the internal HFP codec, while the source registered the external-codec SCO API.
The bridge now uses the SDK's decoded PCM incoming/outgoing callbacks and signals
outgoing_data_ready, matching the installed SDK's hfp_hf example. Firmware 0.1.2
was built and flashed after a second full verified backup. A new gateway guard
hangs up within 12 seconds after answer if decoded phone audio never arrives,
rather than leaving a silent line. Actual audio after this correction remains
verified by the third test below; no further call is scheduled.

The owner subsequently requested another call, then held BOOT to provision a new
CRM key that had been generated at 20:02:11. Provisioning succeeded at 20:08:00.
The gateway resumed with keyState=provisioned and firmware 0.1.2. That rotation
means the earlier paired-board backup holds the previous key; restoring it would
also require reconciling/reprovisioning the current CRM key.

The third owner-requested call used SIM 1 (Jazz), campaign
`6ae0be6a70ab86147d48a10b`, call
`call_6ae0be6b70ab86147d48a10c_1_bb4b39de`. It was answered at 20:09:04 and
ended at 20:10:03, duration 59 seconds. The persisted CallRecord has state
completed, disposition answered_completed, four validated answers and
resultsProcessedAt set. The optional callback-time answer was not collected.
Exact answers are retained privately in final-conversation-evidence.json.
The observed audio snapshot had 4237 frames each direction, zero upstream gaps,
13 downstream underruns, zero overruns and first AI audio at 7193 ms after answer.
This proves the physical PCM path and recognized conversation; it does not prove
glitch-free audio. The owner reported audible but quiet voice. A host-only,
optional playback gain was added, tested and enabled at +6 dB (approximately
twice the PCM amplitude). It affects AI audio sent to the phone's microphone
uplink, preserves the received caller audio and saturates to signed 16-bit bounds.
The default remains 0 dB. No firmware or protocol change was needed for gain.
The volume test used:

```sh
node bin/updata-gateway.mjs run --playback-gain-db 6
```

Gateway 0.3.0 now takes the authoritative volume from the CRM heartbeat and
reports its applied value; the resident process runs the ordinary `run` command.

The fourth owner-authorized call then ran for 45 seconds and recorded two valid
answers: audio_clear=true (the caller explicitly said loud and clear) and callback
time 9 p.m. It had 3265 upstream and 3266 downstream frames, zero upstream gaps,
33 downstream underruns and no overruns; first AI audio arrived after 3500 ms.
The CRM audio attestation was recorded using this physical evidence. No further
cellular call was made. The four earlier answers remain saved, so all five
configured business fields were collected across the two completed conversations.
A separate generated-tone
LiveKit loopback did not complete because of a DNS lookup error and is not
counted as a pass. No diagnostic tone call was made to a phone.

A firmware change correctly clears old audio verification. A trusted local
diagnostic capability now permits a fresh isTest paired-phone campaign with
exactly one recipient, one attempt, one concurrent call and a one-call daily cap
to collect that proof before prior audio attestation. The capability is a Symbol
that JSON/HTTP request bodies cannot supply. Owner scope, key, fault, connection,
caps, consent and suppression checks still apply; no audioVerifiedAt is fabricated.
Ordinary campaign starts still reject an unverified device. Unit workflow tests
exercise owner isolation, bounded scope, signed claim and unchanged attestation.

Because the owner explicitly requested this personal call after 20:00, its
supervised producer used a 20:00–20:15 window for this exact test destination.
The existing original campaign schedule and API/gateway/global configuration were
not changed. The test campaign was paused after the call; no automatic retry runs.

Private evidence: `/Users/app/.updata/esp32-evidence/2026-10-27-lD24Q0`.
Earlier audit snapshots, raw build/flash results, hardware JSONL, CRM checks and
call logs are preserved there. Logs and credentials are not committed.

## Environment and architecture

| Item | Actual result |
| --- | --- |
| Mac | macOS 15.8.1, Intel x86_64 |
| Chip | ESP32-D0WD-V3 revision 3.1, 40 MHz crystal |
| USB | CP2102 10c4:ea60, `/dev/cu.usbserial-0001` |
| Flash | 4 MB, DIO, 40 MHz |
| ESP-IDF | v5.5.6, `/Users/app/esp/esp-idf-v5.5.6` |
| Compiler | Xtensa GCC 14.2.0, esp-14.2.0_20260121 |
| Python | Existing IDF 5.5 environment, Python 3.14.7 |
| Build tools | CMake 4.4.4, Ninja 1.13.2, esptool 4.12.0 |
| Runtime protocol | Binary v1.0, UART0, 921600 baud, 8N1 |
| Bluetooth identity | Updata Phone Bridge 0D62, 20:50:0D:D4:0D:62 |
| Android | TECNO SPARK 20 / KJ5, Android 13; authorized physical ADB |
| Existing API configuration | http://localhost:9097/api/v1 |

Mac Node gateway ↔ CP2102/UART0 ↔ ESP32 Classic Bluetooth HFP hands-free ↔
Android audio gateway/SIM ↔ cellular recipient. CVSD 8 kHz SCO audio passes over
HCI, USB serial and LiveKit to the existing AI worker. This design uses neither
BLE nor Wi-Fi for the board path. The React Native app controls authenticated
CRM APIs. UART0 requires GPIO1 TX/GPIO3 RX; GPIO0 BOOT proves physical presence
for dial-key provisioning. No external microphone, codec or I2S wiring is needed.

## Firmware, protection and flash evidence

Source: `server/phone-gateway/esp32/firmware`; entry point `main/bridge.c`.
The source, protocol definitions, SDK configuration and generated flash arguments
were audited before writing. The original board had a different AT-style
partition layout. Secure boot was disabled, FLASH_CRYPT_CNT=0, RD_DIS=0 and
UART_DOWNLOAD_DIS=false. These were read-only eFuse checks; no security setting
was changed. `get_security_info` was unsupported on this chip, so the installed
read-only `espefuse summary` was used.

A complete stable flash snapshot was read and verified while the application
remained stopped: `--after no_reset read_flash 0 0x400000`, followed by
`--before no_reset --after no_reset verify_flash 0`. The first read differed in
116 NVS bytes after the old firmware rebooted; the stopped-board snapshot passed.

Backup: `/Users/app/.updata/esp32-backups/2026-10-27-20500dd40d60-tJ5zq5/flash-stable.bin`,
4194304 bytes, mode 0600, SHA-256
`b8e8fdf64318cea76758f248fabd807ff25e243ee04590a29b7ef4d1c62ad497`.
Adjacent `RESTORE.md` describes the same unsecured board's restore procedure.
Restoration was not executed; the backup excludes RAM and eFuses. Original data
is archived outside build directories. No full-chip erase was used.

Before the audio fix, the now-paired board was backed up again, preserving its
Bluetooth bond and CRM dial key: adjacent `flash-paired-before-audio-fix.bin`,
4194304 bytes, mode 0600, SHA-256
`328ebaf82376f40608781f2e25baf9d62ba0ec7c59cc74dc5f20f3f5c8cbea2d`.
The stopped-board verify_flash digest matched. The update used the unchanged
partition layout; the subsequent real HELLO confirmed keyProvisioned=true and
the stored TECNO peer remained present. Neither backup was restored.

Generated layout, validated against partition/flash argument files:

| Offset | Image/partition |
| --- | --- |
| 0x1000 | build/bootloader/bootloader.bin |
| 0x8000 | build/partition_table/partition-table.bin |
| 0x9000 | NVS, size 0x6000 |
| 0xf000 | phy_init, size 0x1000 |
| 0x10000 | build/updata_hfp_bridge.bin, factory partition size 0x177000 |

Final firmware **0.1.2**, application 675712 bytes, SHA-256
`8d4bd8c6213c22764df578c75b538c99ece72770eeb869bdadfb2d1ded6768ee`.
Build, image validation and flashing exited 0; the tool verified all three image
hashes. Actual commands, from `server/phone-gateway`:

```sh
npm run build:esp32
bash esp32/idf.sh -p /dev/cu.usbserial-0001 -b 460800 flash
node bin/esp32-probe.mjs info --port /dev/cu.usbserial-0001
node bin/esp32-verify.mjs --port /dev/cu.usbserial-0001 --reset
```

`idf.sh` reuses the installed v5.5.6 SDK and its Python environment. System Python
3.15 was unsuitable for the cached environment; no SDK reinstall was necessary.
Flashing baud 460800 is distinct from runtime 921600. Stop the running gateway
before any exclusive probe/flash operation, then restart it afterward.

Two physical firmware defects were fixed. With console disabled, IDF parked
unassigned RX high; explicit existing UART0 pin configuration resolved no_reply.
Then long observation found TASK_WDT reset reason 6 every ~5.8 seconds:
pdMS_TO_TICKS(5) was zero at the configured 100 Hz, starving the watched idle task.
The TX wait now has a minimum of one tick. The watchdog stays enabled. Firmware
0.1.1 ran the actual continuous uptime and pairing tests without those resets.

## Protocol, phone and CRM evidence

HELLO_ACK reports protocol 1.0, firmware 0.1.2, SDK v5.5.6, the expected Bluetooth
identity, capabilities 55, maximum payload 1024 and CVSD support. The nonce was
validated without publishing it. Repeated requests, malformed-frame recovery
and hardware reset renegotiation passed. Protocol v1's one-byte chip revision
contains 45 (the existing truncation of IDF 301); esptool proves full revision 3.1.
Framing, message identifiers, CRC, baud and device identity were preserved.

Nine physical test groups passed: identity/BT initialization, 50 repeated status
requests, 10 fresh HELLO sessions, incompatible-version rejection, unknown command,
invalid volume, bad CRC/truncated packet recovery, 30-second monotonic uptime,
and reset/new-session reconnection. Deliberate corruption incremented counters
by exactly two. Uptime increased from 4103 to 34103 ms without reset.

Android authentication succeeded at 14:32:13 UTC. The phone screenshot shows
Updata Phone Bridge 0D62 Connected. A real 60-second HFP SLC hold passed with
signal 5, battery 3 and zero CRC/resync/sequence gaps. Audio was off while idle;
this is connection evidence, not two-way audio proof. macOS direct name requests
also succeeded and returned native HFP HF records, RFCOMM channel 1. The separate
explicit SDP callback timed out; a completed SDP transaction is not claimed.

The owner's fresh one-use CRM pairing code was redeemed through the existing
gateway CLI. Device `6ae0b7494bee95134ed97828` belongs to that pairing code's
owner. The private gateway credential file is mode 0600; its token is not logged.
The CRM dial key was provisioned only while the owner physically held BOOT:

```sh
node bin/updata-gateway.mjs provision --port /dev/cu.usbserial-0001 --presence-wait 30
node bin/updata-gateway.mjs run
```

The persisted authenticated heartbeat was 2.469 seconds old at inspection,
board.connected=true, firmware=0.1.1, keyProvisioned=true, hfp_ready/slc and the
real TECNO peer. The owner manually set the CRM audio verification flag; that
attestation was later superseded by the successful physical volume test above.

The supervised call used the existing signed-dial/claim path and an isolated
LiveKit worker name, not a raw unauthenticated dial. Test campaign
`6ae0b9fc5c2a612dd7714c11` has exactly one recipient, isTest=true, maxAttempts=1,
and the five existing questions. Its test lead is L-00812. Consent was recorded
from the owner's explicit request with a 15-minute expiry. The original draft
campaign and leads were not changed. No answers exist for this attempt.

The separately authorized retry is campaign `6ae0baec86271c214e033cd4`, using the
same test lead, five questions, isTest=true and maxAttempts=1. It also collected
zero answers. Both campaigns completed and neither can redial automatically.

## Executed checks

| Check | Actual result | Scope |
| --- | --- | --- |
| Gateway | 76/76 pass | Mocks/pure host; protocol, recovery, controls, gain and login installer |
| Firmware modules | 64 checks, 0 failed | Host C, ASan/UBSan |
| Backend paired-phone final | 71/71, 4 suites | Owner isolation, real middleware, setup lifecycle and test-call safety |
| Backend broader auth/AI-calling | 264/264, 22 suites | Earlier combined regression |
| Backend messaging/SMS | 122/122, 10 suites | Regression |
| Agent worker | 22/22 | Unit |
| Web aiCalling | 60/60, 10 files | Mocked UI, including manual controls and explicit test consent |
| Web connection browser tests | 4/4 | Mocked 390/1440 px UI, status, controls and saved volume |
| Web typecheck/changed-file lint | Exit 0 | Static |
| Mobile | 452/452, 56 suites | Jest; open-handle warning, exit 0 |
| Mobile typecheck/lint | Exit 0 | Static |
| macOS SDP channel tests | 22/22 | Unit; diagnostic also compiled |
| ESP-IDF build/image/flash | Exit 0 | Real target build/board |
| Binary protocol/reset | 9 groups passed | Real board |
| Android pairing/HFP hold | Passed, 60 seconds | Real phone and board |
| CRM registration/key/heartbeat | Passed | Real authenticated CRM |
| Cellular AI conversation | 59 seconds, four validated answers, 4237 frames each way | Real SIM 1 Jazz after firmware 0.1.2 correction |

The new regression injects an idle state after DIAL but before actual setup;
the room must remain connected and the eventual call must hang up correctly.
The original ring timeout still bounds a phone that never starts setup.
Physical USB cable unplug/replug and complete RN foreground/background calling
have not been tested. Production readiness is not claimed.

## Running local environment and changes

The setup API runs existing authentication, routes and Socket.IO against the
configured DB, with migrations/seeding and unrelated background jobs disabled.
Existing required indexes were inspected; no migration was needed. Redis 8.10.2
core was built and saved under `/Users/app/.updata/tools/redis-8.10.2-tC4vsZ`;
PONG and version output were inspected. The optional Homebrew module build was
stopped, so the complete brew Redis package was not installed. Redis currently
uses no disk persistence; durable device state remains in MongoDB/private config.

```sh
# Separate terminals, from repository root:
/Users/app/.updata/tools/redis-8.10.2-tC4vsZ/redis-server --bind 127.0.0.1 --port 6379 --save '' --appendonly no --protected-mode yes
cd server
node scripts/paired-phone-setup-api.mjs
cd ../client
npm run dev -- --hostname 127.0.0.1
# Separate terminal, gateway must remain running:
cd server/phone-gateway
node bin/updata-gateway.mjs run --playback-gain-db 6
```

API health succeeded; unauthenticated device and heartbeat requests returned
401. No passwords, session JWTs, gateway tokens or dial keys were fabricated.

| Changed area | Purpose |
| --- | --- |
| firmware/main/bridge.c; firmware/CMakeLists.txt | UART routing, watchdog starvation, internal-codec PCM callbacks, version 0.1.2 |
| esp32/idf.sh; gateway package scripts | Reuse verified SDK/Python for repeatable build/flash/check |
| src/esp32/serial.js, device.js, protocol.js | macOS callout ports, wait for BT initialization, reset/nonce handling, strict HELLO/string bounds |
| bin/esp32-probe.mjs; bin/esp32-verify.mjs | Shared connection, cleanup on reset, repeatable real hardware checks |
| bin/updata-gateway.mjs | Bounded physical-presence wait; validated optional playback gain |
| src/gateway/callRunner.js; daemon.js; src/esp32/pcm.js | Keep room until actual setup; bound absent PCM; optional bounded AI playback gain |
| macos/main.swift | Bounded inquiry/name/SDP diagnostics with temporary connection cleanup |
| test/esp32.*; test/gateway.callRunner.test.js; test/helpers/fakeEsp32.js | Protocol, port, reboot, initial-idle and absent-PCM regression cases |
| server/scripts/paired-phone-setup-api.mjs | Existing secure API without unrelated outbound workers/seeds |
| server aiCalling/pairedPhone services, readiness and workflow tests | Bounded local diagnostic call before audio attestation, while retaining ordinary campaign gates |
| client paired-phone panel/workspace/hook/helper/tests/e2e | Visible separate board/phone states from fresh authenticated heartbeat, 5-second polling, honest offline/error states |
| client web-call-console.tsx | Return tracked promise so microphone rejection is caught |
| Firmware guide and this report | Verified procedure, backup, actual checks and remaining gates |

Unrelated existing lead_extention and client/orb-* changes were preserved.
No protocol, global calling policy, tenant isolation, security controls, eFuses,
Bluetooth identity or original campaign configuration was changed.

SDK reference for the selected internal-codec callbacks: the installed
v5.5.6 examples/bluetooth/bluedroid/classic_bt/hfp_hf/main/bt_app_hf.c and
components/bt/host/bluedroid/api/esp_hf_client_api.c. See also the
[Espressif HFP example](https://github.com/espressif/esp-idf/blob/v5.5.6/examples/bluetooth/bluedroid/classic_bt/hfp_hf/main/bt_app_hf.c).

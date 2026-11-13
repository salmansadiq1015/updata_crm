# Updata phone gateway

Requires Node.js 20 or newer, an ESP32-WROOM-32 running the Updata HFP firmware,
a USB data cable, and an Android phone with a SIM. Native USB ESP32-S/C-series
boards do not support this Classic Bluetooth HFP bridge.

Download this package from AI Calling → Paired phones → Setup guide. Extract it
to a permanent folder you own, then run `npm ci --omit=dev` in that folder.
The release includes npm-shrinkwrap.json with the tested dependency resolutions.

Create a pairing code in the CRM. Run the pairing command shown there using the
actual API URL and one-use code. Copy the start command shown next; it includes
`--profile` and that phone's ID. Keep that flag on every command for this phone.
Keep this process running; the website cannot launch software on your computer.
Each phone's credentials and event queue stay in `~/.updata/profiles/<phone-id>/`
with owner-only permissions. Older installations without a profile still work.

Adding a phone saves its CRM card immediately, before computer setup is finished.
Creating a code does not connect the computer, USB bridge, or Bluetooth phone.
Use **Link computer** on an offline card to finish setup or recover lost computer
settings without creating a duplicate phone. Replacing an unused code keeps the
same phone. Codes expire after 10 minutes and work once. Stop the old gateway
before relinking; an online phone or a phone with an active call cannot be relinked.

## Several phones on one computer

Use gateway 0.4.0 or newer and one prepared ESP32 bridge per phone. Each phone
gets its own profile, gateway process and (on macOS) login service. When several
USB bridges are attached, select a distinct port for each when pairing:

```sh
node bin/updata-gateway.mjs status
node bin/updata-gateway.mjs pair --api https://your-crm.example/api/v1 --code XXXX-XXXX --profile PHONE_ID --port YOUR_USB_PORT
node bin/updata-gateway.mjs run --profile PHONE_ID
```

Replace the capitalized placeholders with the code, phone ID and USB port shown
by CRM and the status command. Pairing saves the selected USB port. Repeat in a
separate Terminal window with the other phone's ID, code and USB port. Never use
the same bridge for two running gateways. `run --port YOUR_USB_PORT` can override
a saved port after changing USB sockets.

To reuse a legacy connection, stop its old process and login service, download
and install the new package, then use the phone card's start command. The gateway
copies a matching legacy connection into that phone's profile. If that old file
belongs to a different phone, use **Link computer** to pair the desired phone.

## Finish setup

Use the CRM buttons to open Bluetooth pairing, connect/disconnect the phone,
provision a pending dial key, set AI volume, check status and run an audio test.
Hold BOOT during provisioning. Normal reconnection needs neither BOOT nor a new
key. Select the default calling SIM in Android; standard HFP uses that SIM.
The first firmware flash is a separate local hardware operation requiring a
validated image/layout and backup; these controls never erase or flash a board.

On macOS, after pairing, stop the terminal gateway with Ctrl-C and run:

```sh
node bin/updata-gateway.mjs service install --profile PHONE_ID
node bin/updata-gateway.mjs service status --profile PHONE_ID
```

This registers an owner-only LaunchAgent that runs at login and recovers after
a crash. Keep the extracted folder and Node.js installation in place. To remove
auto-start while preserving credentials: `node bin/updata-gateway.mjs service uninstall --profile PHONE_ID`.
No administrator password is needed. Linux and Windows currently use the
foreground `run` command; this release does not claim tested auto-start support
on those systems.

The gateway owns the USB port exclusively. Close serial monitors before starting
it. Use Bluetooth reconnect first; USB reconnect is an idle-only recovery action
and some DevKit USB drivers reset EN when a port is reopened. Routine setup
controls keep the port open and do not reboot or regenerate keys.

Gateway 0.4.1 confirms a phone-side hang-up before ending the agent room, attempts
to recover a dropped SCO audio link for up to eight seconds, and allows fifteen
seconds for an agent to reconnect. Persistent audio failure still ends the call
with a recorded reason. Passive listeners never count as an agent and leaving
the browser monitor does not hang up the phone.

Gateway 0.4.2 also probes the authenticated USB control session, since PING can
respond after firmware has invalidated HELLO. It reconnects a lost session and
checks it before reserving a signed call. Firmware 0.1.3 fixes a watchdog clock
race that could falsely hang up a healthy call and invalidate that session.

Gateway 0.4.3 waits for the voice worker's `updata.agent_ready` attribute before
sending DIAL. Deploy the updated voice worker with this gateway. A startup
failure, closed room, or missing readiness signal refuses the call before dialing;
room disconnect codes are also logged with the call phase.

## Incoming calls

Gateway 0.5.0 with firmware 0.1.4 lets the AI answer calls to the paired phone.
The CRM decides per call (incoming-call settings and rules); the gateway only
reports the ring and carries out the decision.

1. While no outbound call or setup action runs, the phone starts ringing
   (`callsetup=1`, `call=0`). The gateway waits up to ~1.2 s for the caller
   number (CLIP; withheld numbers are sent as `''`) and posts
   `POST /paired-phone/gateway/inbound/ring` with a fresh `sessionId`. Transient
   failures are retried with the same `sessionId` (the CRM de-duplicates on it)
   while the phone still rings. If the CRM cannot be reached nothing happens:
   the phone keeps ringing for the person. No outbound call is claimed from the
   first ring until the phone is idle again.
2. `answer_ai`: the gateway joins the voice room as `sip-<callId>`, sets
   `sip.callStatus=ringing`, waits for the worker's `updata.agent_ready`, then
   waits until `answerAfterMs` after the first ring. If the phone is still ringing
   and nobody picked up, it reports `answering`, sends ANSWER, and on the phone's
   active state reports `answered` and sets `sip.callStatus=active`. From there
   the call runs like an outbound AI call: audio bridge, audio recovery, stats,
   `maxCallSeconds`, hang-up and takeover.
3. The AI never answers when the agent is not ready before `ringTimeoutSeconds`
   (`agent_unavailable {agent_not_ready}`), the ring stops first
   (`agent_unavailable {ring_stopped}` then `ended {not_answered}`), or a person
   picks up on the handset first (`answered_elsewhere`; the gateway leaves the
   room and hands the audio back to the handset). These calls stay tracked as
   human calls until the phone is idle.
4. `let_ring` / `ignore`: tracked only. Answered on the handset →
   `answered_elsewhere`; caller gives up → `ended {not_answered}`; answered then
   hung up → `ended {remote_hangup}`.

Owner commands arrive with the heartbeat (`inbound: true`) and are repeated until
`command_done` reaches the CRM; each runs once. **Reject** (ringing) sends HANGUP
(AT+CHUP) → `command_done {reject}` → `ended {rejected}`. **Let AI answer** on a
call left ringing fetches `/inbound/calls/:id/answer-job` and answers as soon as
the agent is ready. **Takeover** and **Hang up** behave as for outbound calls.
A lost ESP32/USB or Bluetooth link reports `outcome_unknown`. Events go through
the durable outbox to `/inbound/calls/:callId/events` (`in_…` call IDs); live
stats are best-effort.

Limits: one call per phone (there is one Bluetooth audio link). HFP exposes no
SIM slot, so `simSlot` is reported as `null`.

**Call waiting.** A second call while the gateway runs a call (outbound or
incoming) is never answered, but it is not lost either. The gateway waits
briefly for its number (+CCWA) and reports it with `waiting: true` (same retry
rules, own `sessionId`); the CRM records it for a person (`let_ring`) and the
gateway reports `ringing`. Then:

- the waiting caller gives up, or every call ends → `ended {not_answered}` (the
  CRM records a call missed while the phone was busy);
- the first call ends while the waiting call keeps ringing → the waiting session
  is handed to the normal ring path, which reports the **same** `sessionId` with
  `waiting: false`; the CRM re-decides that session and may let the AI answer it.

HFP's held-call indicator is not tracked, so a waiting call the person accepts by
swapping calls on the handset is reported as `not_answered`. When the gateway
hangs up its own call (AT+CHUP) while another call waits, the phone decides which
call ends; check this on the target phone.

**Firmware.** Answering needs ESP32 firmware 0.1.4 or newer (flash it as a
separate, backed-up hardware step). Older firmware does not advertise the ANSWER
capability or replies `unknown_type`: the gateway then reports
`agent_unavailable {firmware_no_answer}` instead of answering, logs
`firmware_cannot_answer` at connect, and the call stays with the person.

Firmware 0.1.4 also changes the host-lost watchdog: it ends only calls the host
dialed or answered. A ringing call left for a person, a call a person answered
on the handset, and a call handed to the handset (takeover) are never rejected or
hung up when the gateway stops or crashes.

USB protocol v1 additions (firmware 0.1.4; protocol stays 1.0, older hosts are
unaffected):

| Item | Change |
|---|---|
| `0x26 ANSWER` (H→D) | `callRef u32` (nonzero). OK only with an open session, HFP service level connection, `callsetup == 1`, `call == 0` and no dial in flight; sends ATA and marks the call host-owned. `bad_arg` for a zero/short callRef, `bad_state` otherwise (including call waiting). Older firmware: `unknown_type`. |
| HELLO_ACK capabilities | bit 6 (`0x40`) = ANSWER supported (sent to the CRM as heartbeat `board.canAnswer`). |
| `0x84 EVENT` 9 `call_waiting` (D→H) | `number…` (ASCII, may be empty), from HFP +CCWA: a second call while one is up. |
| `0x83 STATE` | optional byte 22 (flags): bit 0 = current call is host-owned. Absent on older firmware. |
| Host ownership | set by an accepted DIAL or ANSWER; released when the phone reports the call idle, the phone refuses the dial, HFP drops, the phone shows a ring with no call up (`call=0`, `callsetup=1`) that is not the call being answered (a new ring after an unstarted DIAL, or a waiting call left ringing after the owned call ended), or AUDIO_DISCONNECT hands the call to the handset. |
| Watchdog | `CONFIG_UPDATA_HOST_TIMEOUT_MS` ends a call (and reports `host_lost_hangup` to the next session) only while it is host-owned. |

## Reconnect after restarting the CRM

Gateway 0.4.4 retries a temporarily unavailable CRM and resumes its heartbeat
when that same API returns. USB/phone pairing and the saved calling key remain
in place. The CRM shows the computer offline while reports cannot reach it;
Bluetooth being connected does not prove that the gateway can reach the CRM.

Check the saved endpoint and its connection without making a call:

```sh
node bin/updata-gateway.mjs status --profile PHONE_ID --check-crm
```

If the gateway was linked to live CRM but you are using a local application,
stop its existing process with Ctrl-C, then use the correct API explicitly:

```sh
node bin/updata-gateway.mjs run --profile PHONE_ID --api http://127.0.0.1:9097/api/v1
```

`run --api` now checks that the existing token identifies the same phone in that
CRM, then saves the URL for subsequent runs and login-service restarts. Older
versions ignored this flag on `run`. A failed connection check leaves the saved
configuration unchanged. To save without starting USB, use `configure --profile
PHONE_ID --api URL`. Switching to a separate database that does not recognize
the existing token requires Link computer in that environment instead.

Logs show the selected API URL and distinguish `CRM_TIMEOUT` from a revoked
credential. A timeout is a connection/API availability issue; it does not require
reflashing ESP32, pressing BOOT, or resetting phone pairing. Do not point a local
gateway at the live URL unless live CRM is the environment you intend to use.

**Edit** on a phone card changes its name and SIM label. **Delete** disconnects
its gateway and removes the card; past call records are retained. Finish any
active call or setup command and resolve phone alerts before deleting. To use a
deleted phone again, add it and complete setup again.

AI playback gain is configurable in the CRM from 0–12 dB. The optional command
line flag `run --playback-gain-db 6` supplies an initial value before the gateway
receives the CRM setting. The CRM remains authoritative after the heartbeat.

Release packaging (repository checkout): `npm run package:gateway` writes
dist/updata-phone-gateway.tgz. Deploy that artifact alongside the CRM server for
the authenticated download button. It contains allowlisted gateway source and
locked dependencies; credentials, environment files, backups and flash images
are excluded. No database migration is needed for the additive setup fields.

## Board keeps restarting (`BOARD_BOOT_LOOP`)

The gateway reports `BOARD_BOOT_LOOP` when the ESP32 stops answering and its ROM boot banner
repeats at 115200 baud. This was seen once on 2026-11-04 after a USB power cut with firmware 0.1.4
(`rst:0x3 (SW_RESET)` about 8 times per second). Rewriting the settings partition from a backup
stopped it. Neither the firmware image nor the saved settings reproduced it later. The cause was
transient, most likely Bluetooth activity during early boot, and is not proven.

1. Unplug the board for 10 seconds, then plug it back in. Check that the gateway log shows
   `board_connected`.
2. If it still restarts, stop the gateway and keep a copy of the current flash first:
   `esptool.py -p <port> -b 921600 --after no_reset read_flash 0 0x400000 flash-now.bin`
3. Write back only the settings partition (NVS, 24 KB at `0x9000`) from your newest backup that
   booted fine. It holds the dial key and the phone pairing, so nothing needs re-provisioning:
   `dd if=<backup>.bin of=nvs.bin bs=4096 skip=9 count=6`
   `esptool.py -p <port> -b 460800 --after hard_reset write_flash 0x9000 nvs.bin`
4. Start the gateway again. Every board start is now logged as `board_boot` with its reset reason.
   Crashes, watchdog resets and brownouts also appear in the CRM as a device error
   (`BOARD_RESET_<REASON>`).

## Compiled firmware distribution (no repository access for end users)

CRM Setup guide provides a separate authenticated **Download ESP32 firmware**
button. It serves `dist/updata-esp32-firmware.tgz` with three compiled images,
`manifest.json`, `flash_args` and `INSTALL.txt`. No firmware/CRM source, device
NVS, keys, backups or SDK is included. End users need Python/esptool, not ESP-IDF
or GitHub access. See `esp32/BINARY-INSTALL.md` for the installation procedure.

Maintainers build on the pinned ESP-IDF v5.5.6 SDK and run
`npm run release:firmware`. This snapshots only the build's three allowlisted
images and hashes into `firmware-release/`. Review and commit those release
files together. Do not snapshot device flash. Normal `npm run package:gateway`
(and the deployment's `npm run build:phone-gateway`) packages both gateway and
firmware. It verifies hashes and rejects missing, corrupt or incompatible
release files; no SDK is required on the production host. Rebuild/install the
API and client together for the firmware download route and updated guide.

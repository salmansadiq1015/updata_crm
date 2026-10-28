# CRM phone-bridge setup controls

Users with AI Calling write permission can set up their own device from AI Calling
→ Paired phones. CRM writers and administrators retain their implied access.
Every owner operation still filters by the signed-in user's ID; an administrator
does not gain access to another user's gateway through these routes.

## Setup

1. Open Setup guide and download the gateway. Install Node.js once, extract the
   package to a permanent folder and run `npm ci --omit=dev` there.
2. Add paired phone generates a short-lived, one-use code. Copy its command,
   which uses the actual configured CRM API URL, to pair this computer.
3. Run the gateway. On macOS, optionally follow Start automatically at login to
   install the per-user LaunchAgent. No administrator password is needed.
4. Open Phone setup and click Save security key while holding BOOT. Provisioning polls physical
   presence on the existing serial session; it does not reboot the board. It
   confirms the CRM key only after the firmware acknowledges the write.
5. Choose Pair a new phone for a two-minute pairing window, pair Android with the displayed name
   and enable Phone calls. Choose the default calling SIM in Android. Connect
   phone waits for the actual HFP service-level connection.
6. Open Sound & test call and adjust AI voice volume if needed. The card distinguishes the saved setting
   from the applied value reported by the gateway.
7. Enter your own second number and explicitly authorize one audio test. Answer,
   confirm voice clarity and say the requested phrase. Inspect real call status,
   frame counts and validated responses. Confirm both directions using Verify
   call audio; connection or power alone never marks audio verified.

Normal reconnection keeps the current key. Advanced security hides key replacement
away from routine setup, and a pending key cannot be replaced repeatedly. USB
recovery is separately confirmed and refused during calls. Some DevKit USB
drivers reset EN when a port is reopened; routine controls reuse the open port.

The gateway must be running on the user's computer: a website cannot start an
uninstalled or stopped local program. The runtime download does not flash a blank
board. Initial firmware flashing remains a separate local operation requiring a
verified image/layout, security checks and backup. Linux and Windows use the
foreground gateway; automatic login installation is currently implemented only
for macOS. A macOS login cycle has not been exercised by this implementation task.

## Production deployment

From `server`, `npm run build:phone-gateway` builds the authenticated download at
`phone-gateway/dist/updata-phone-gateway.tgz`. The existing deployment script now
runs this step after server dependencies. The artifact has allowlisted source,
README and locked npm dependencies; no credentials, environment files, flash
images or backups. Replacement is atomic so downloads cannot read a partial file.

Deploy the API and client together and upgrade each laptop gateway to 0.3.1.
Old gateway versions show an upgrade instruction and cannot receive setup actions.
The CRM API must use HTTPS outside localhost. Configure matching
`LIVEKIT_AGENT_NAME` values for the API and voice worker, and a worker-reachable
`PUBLIC_API_BASE_URL`. Keep development and production agent names distinct.
A missing voice worker rejects the test before a phone dial is queued.

Device setup fields are additive MongoDB fields; no migration or seed is required.
Tenant isolation, device signing, ordinary campaign retries, phone protocol,
firmware layout or baud rate were replaced. Normal campaign workers still run
through the existing production server. The local setup API deliberately omits
unrelated background jobs and is not the production campaign scheduler.

## Command safety and recovery

Owner commands are fixed actions over the authenticated gateway heartbeat:
status, open pairing, connect, disconnect, provision and explicit USB reconnect.
No arbitrary shell command, file path or dial is accepted. Settings separately
bound AI gain to 0–12 dB and persist automatic reconnect preference.

Only one setup command or call can reserve a device. The gateway claims a pending
command atomically, then reports its result. Duplicate heartbeat delivery and
result retries never repeat the hardware action. Commands expire in two minutes;
an expired or interrupted action requires an explicit new request. Provisioning
keeps heartbeats alive and wipes its key buffer. Only known result codes enter
the UI. Audit events record requests, settings and completion without key material.

An audio test is an owner-requested, single-recipient, one-attempt test campaign.
A server-only Symbol capability lets this diagnostic collect audio proof before
prior audio attestation. JSON request bodies cannot supply that capability.
Consent, suppression, device/key readiness, account ownership, call limits and
the voice kill switch remain enforced. A requested personal test can run now;
scheduled campaign calling-hour gates remain enforced. Explicit immediate campaign
starts use the separate mode described in CAMPAIGN-CALLING.md. Test results do not change
production lead qualification, and there is no automatic redial.

## Verification on 2026-10-27

- Physical phone call: 45 seconds, caller explicitly confirmed loud and clear
  voice at +6 dB; validated callback response retained; audio verified in CRM.
- Physical CRM command path: status, disconnect and reconnect succeeded, HFP
  returned to SLC and board uptime increased from 1057263 to 1078263 ms. No reboot,
  key rotation or BOOT press was needed for these actions.
- Gateway: 76 unit/protocol tests passed. Backend paired-phone: 71 tests passed;
  the broader earlier auth/AI-calling run passed 264 tests. Web calling: 60 tests
  passed; four Playwright UI tests passed using mocked CRM data. Typecheck, changed
  UI lint and deployment shell syntax checks passed.
- Distribution: built and inspected 22 allowlisted files; a clean extracted
  package installed 57 dependencies with npm ci, opened serial discovery and
  loaded the native RTC module on this Mac. The LaunchAgent XML was validated with
  plutil and service commands were tested with a fake process runner; it was not
  silently installed into the owner's login items.
- During the later UI check, both Node serialport and an independent Python
  serial check failed to open the CP2102 at the required 921600 baud. After the
  owner unplugged and reconnected the USB cable, the real gateway handshake
  recovered, the phone reported HFP SLC, and the CRM reported the calling key
  provisioned and audio verified. Firmware was not changed.

## Compact connection panel and recovery (0.3.1)

The card keeps Computer, ESP32 USB and Phone Bluetooth status visible above the
primary Connect phone button. A missing USB session means Bluetooth cannot be
checked, even if Android still shows connected; cached phone state never becomes
a live connection claim. Phone setup and Sound & test call expand separately.
Show more contains versions, addresses, raw diagnostics, the checklist, usage,
limits and security actions. Only the current connection report determines the
displayed connection, not an old successful setup command.

Connect phone reuses a healthy USB session. When USB was lost, it makes one shared
open attempt before requesting and awaiting the phone's HFP service connection.
Concurrent retry timers and manual requests cannot open the port twice. A gateway
without an explicitly selected port can start while unplugged and discovers the
current port on each attempt. Explicit port choices and multiple-board ambiguity
remain respected. A macOS driver failure may still require physically reconnecting
the cable; software cannot guarantee recovery from a USB adapter error.

Verification of this recovery and UI revision: 79 gateway tests, 44 backend
paired-phone tests, and 62 calling UI tests passed. Four desktop and four mobile
Playwright cases passed using mocked CRM responses, including 390 px and 1440 px
layouts and unavailable/connected/offline states. One mobile assertion initially
ran while Next's development hot reload was still reauthenticating; the test now
waits for the device query response before checking status. Typecheck and changed
UI lint passed.

Physical CRM commands on gateway 0.3.1: status and connect_phone both succeeded
through the gateway's authenticated claim/result path. Uptime increased from
260453 to 272453 ms without reboot; the real phone remained HFP SLC. The stored
CRM key was provisioned, audio verification remained valid, and readiness was
true. No cellular call or firmware flash was needed for this revision. A first
gateway restart attempt correctly refused the previous process's lock while it
was shutting down; starting after its clean exit succeeded.

These changes are running in the local CRM/gateway. No remote production deployment
or additional cellular call was performed as part of the control-panel checks.

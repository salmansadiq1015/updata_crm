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

# Updata phone gateway

Requires Node.js 20 or newer, an ESP32-WROOM-32 running the Updata HFP firmware,
a USB data cable, and an Android phone with a SIM. Native USB ESP32-S/C-series
boards do not support this Classic Bluetooth HFP bridge.

Download this package from AI Calling → Paired phones → Setup guide. Extract it
to a permanent folder you own, then run `npm ci --omit=dev` in that folder.
The release includes npm-shrinkwrap.json with the tested dependency resolutions.

Create a pairing code in the CRM. Run the pairing command shown there using the
actual API URL and one-use code. Then run `node bin/updata-gateway.mjs run`.
Keep this process running; the website cannot launch software on your computer.
The credential file stays in ~/.updata with owner-only permissions.

Use the CRM buttons to open Bluetooth pairing, connect/disconnect the phone,
provision a pending dial key, set AI volume, check status and run an audio test.
Hold BOOT during provisioning. Normal reconnection needs neither BOOT nor a new
key. Select the default calling SIM in Android; standard HFP uses that SIM.
The first firmware flash is a separate local hardware operation requiring a
validated image/layout and backup; these controls never erase or flash a board.

On macOS, after pairing, stop the terminal gateway with Ctrl-C and run:

```sh
node bin/updata-gateway.mjs service install
node bin/updata-gateway.mjs service status
```

This registers an owner-only LaunchAgent that runs at login and recovers after
a crash. Keep the extracted folder and Node.js installation in place. To remove
auto-start while preserving credentials: `node bin/updata-gateway.mjs service uninstall`.
No administrator password is needed. Linux and Windows currently use the
foreground `run` command; this release does not claim tested auto-start support
on those systems.

The gateway owns the USB port exclusively. Close serial monitors before starting
it. Use Bluetooth reconnect first; USB reconnect is an idle-only recovery action
and some DevKit USB drivers reset EN when a port is reopened. Routine setup
controls keep the port open and do not reboot or regenerate keys.

AI playback gain is configurable in the CRM from 0–12 dB. The optional command
line flag `run --playback-gain-db 6` supplies an initial value before the gateway
receives the CRM setting. The CRM remains authoritative after the heartbeat.

Release packaging (repository checkout): `npm run package:gateway` writes
dist/updata-phone-gateway.tgz. Deploy that artifact alongside the CRM server for
the authenticated download button. It contains allowlisted gateway source and
locked dependencies; credentials, environment files, backups and flash images
are excluded. No database migration is needed for the additive setup fields.

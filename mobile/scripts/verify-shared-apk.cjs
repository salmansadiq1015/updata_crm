// Inspect the finished, signed artifact, not just the source manifest.
const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const { homedir } = require('node:os');
const path = require('node:path');

const apk = process.argv[2];
if (!apk || !existsSync(apk)) throw new Error('Usage: npm run verify:apk -- /path/to/signed.apk');
const sdk =
  process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(homedir(), 'Library/Android/sdk');
const buildTools = path.join(sdk, 'build-tools');
const version = readdirSync(buildTools)
  .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .at(-1);
if (!version) throw new Error('Install Android SDK build-tools and set ANDROID_HOME.');
const run = (tool, args) => execFileSync(path.join(buildTools, version, tool), args, { encoding: 'utf8' });
const permissions = run('aapt', ['dump', 'permissions', apk]);
const manifest = run('aapt', ['dump', 'xmltree', apk, 'AndroidManifest.xml']);
// SEND_SMS is allowed only with --allow-send-sms (the client "shared" build sends one-way SMS).
// Receiving or reading SMS, call logs, accessibility and notification access are never allowed:
// those are what Play Protect blocks for apps installed from WhatsApp or a browser.
const allowSendSms = process.argv.includes('--allow-send-sms');
const forbidden = [
  ...(allowSendSms ? [] : ['SEND_SMS']),
  'RECEIVE_SMS',
  'READ_SMS',
  'RECEIVE_MMS',
  'RECEIVE_WAP_PUSH',
  'READ_CALL_LOG',
  'WRITE_CALL_LOG',
  'BIND_ACCESSIBILITY_SERVICE',
  'BIND_NOTIFICATION_LISTENER_SERVICE',
];
for (const permission of forbidden) {
  if (manifest.includes(`android.permission.${permission}"`)) {
    throw new Error(`Shared APK declares forbidden permission: ${permission}`);
  }
}
for (const component of [
  'SmsInboundReceiver',
  ...(allowSendSms ? [] : ['SmsResultReceiver']),
  'SmsAgentService',
  'android.accessibilityservice.AccessibilityService',
  'android.service.notification.NotificationListenerService',
]) {
  if (manifest.includes(component)) throw new Error(`Shared APK includes restricted component: ${component}`);
}
if (/android:debuggable[^=\n]*=\s*(?:\(type 0x12\))?0xffffffff/.test(manifest)) {
  throw new Error('Shared APK must not be debuggable.');
}
const certificate = run('apksigner', ['verify', '--verbose', '--print-certs', apk]);
if (certificate.includes('CN=Android Debug')) throw new Error('Sign the shared APK with the release key.');
run('zipalign', ['-c', '-P', '16', '4', apk]);
process.stdout.write(
  `${permissions}\n${certificate}\nShared APK permission, signature, and alignment checks passed.\n`,
);

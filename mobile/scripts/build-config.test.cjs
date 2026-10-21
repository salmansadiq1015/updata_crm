/* global __dirname */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');
const profiles = require('../eas.json').build;

// Use the real Expo config loader and manifest mod, in a fresh process per variant.
function evaluate(distribution, manifest) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `
    const { getConfig } = require('@expo/config');
    const { exp } = getConfig(process.cwd(), { isModdedConfig: true, skipPlugins: true });
    const modResults = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
    exp.mods.android.manifest({ ...exp, modResults, modRequest: {} }).then(result =>
      process.stdout.write(JSON.stringify({ android: exp.android, manifest: result.modResults })));
  `,
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        input: JSON.stringify(manifest),
        env: {
          ...process.env,
          EXPO_NO_DOTENV: '1',
          EXPO_PUBLIC_APP_ENV: 'production',
          EXPO_PUBLIC_API_URL: 'https://crm.example.com/api/v1',
          EXPO_PUBLIC_DISTRIBUTION: distribution,
        },
      },
    ),
  );
}

test('private -> shared prebuild removes SMS components and blocks SMS permissions', () => {
  const initial = {
    manifest: {
      application: [
        {
          $: { 'android:name': '.MainApplication' },
          service: [{ $: { 'android:name': 'com.example.UnrelatedService' } }],
        },
      ],
    },
  };
  const privateBuild = evaluate('private', initial);
  assert(privateBuild.android.permissions.includes('android.permission.RECEIVE_SMS'));
  assert(
    privateBuild.manifest.manifest.application[0].receiver.some((item) =>
      item.$['android:name'].endsWith('.SmsInboundReceiver'),
    ),
  );
  const shared = evaluate('play', privateBuild.manifest);
  assert(!shared.android.permissions.includes('android.permission.RECEIVE_SMS'));
  for (const name of ['SEND_SMS', 'RECEIVE_SMS', 'READ_SMS']) {
    assert(shared.android.blockedPermissions.includes(`android.permission.${name}`));
  }
  const application = shared.manifest.manifest.application[0];
  assert.deepEqual(application.receiver, []);
  assert.deepEqual(application.service, initial.manifest.application[0].service);
  assert.deepEqual(evaluate('play', shared.manifest).manifest, shared.manifest);
});

test('the APK sharing profile inherits production without private SMS access', () => {
  const apk = profiles['production-apk'];
  assert.equal(apk.extends, 'production');
  assert.equal(apk.android.buildType, 'apk');
  assert.equal(apk.distribution, 'internal');
  assert.equal({ ...profiles.production.env, ...apk.env }.EXPO_PUBLIC_DISTRIBUTION, 'play');
});

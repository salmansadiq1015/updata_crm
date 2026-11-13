import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { images, snapshotFirmware, packageFirmware } from '../scripts/package-firmware.mjs';

test('binary firmware distribution allowlists artifacts and refuses corruption or unexpected layout', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'firmware-package-test-'));
  const build = join(temp, 'build'), release = join(temp, 'release');
  try {
    await mkdir(join(build, 'bootloader'), { recursive: true });
    await mkdir(join(build, 'partition_table'));
    const args = { flash_settings: { flash_mode: 'dio', flash_size: '4MB', flash_freq: '40m' }, flash_files: Object.fromEntries(images.map(i => [i.offset, i.source])), extra_esptool_args: { chip: 'esp32' } };
    await writeFile(join(build, 'flasher_args.json'), JSON.stringify(args));
    await writeFile(join(build, 'project_description.json'), JSON.stringify({ target: 'esp32', git_revision: 'v5.5.6', project_version: '0.1.4' }));
    for (const image of images) await writeFile(join(build, image.source), Buffer.from([0xe9, 1, 2, 3]));
    await writeFile(join(build, 'secret.env'), 'MUST NOT SHIP');
    await writeFile(join(build, 'firmware.c'), 'MUST NOT SHIP');
    const manifest = await snapshotFirmware(build, release);
    assert.equal(manifest.version, '0.1.4');
    await writeFile(join(release, 'secret.env'), 'MUST NOT SHIP');
    const archive = join(temp, 'firmware.tgz');
    await packageFirmware(release, archive);
    const { stdout } = await promisify(execFile)('tar', ['-tzf', archive]);
    const entries = stdout.trim().split('\n').filter(e => !e.endsWith('/')).map(e => e.replace('updata-esp32-firmware/', '')).sort();
    assert.deepEqual(entries, ['INSTALL.txt', 'bootloader.bin', 'flash_args', 'manifest.json', 'partition-table.bin', 'updata_hfp_bridge.bin'].sort());
    assert.match(await readFile(join(release, 'manifest.json'), 'utf8'), /sha256/);
    await writeFile(join(release, 'updata_hfp_bridge.bin'), 'tampered');
    await assert.rejects(packageFirmware(release, archive), /integrity check failed/);
    args.flash_files['0x9000'] = 'secret.env';
    await writeFile(join(build, 'flasher_args.json'), JSON.stringify(args));
    await assert.rejects(snapshotFirmware(build, release), /Unexpected firmware image layout/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

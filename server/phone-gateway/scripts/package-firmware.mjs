import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
export const images = [
  { offset: '0x1000', file: 'bootloader.bin', source: 'bootloader/bootloader.bin' },
  { offset: '0x8000', file: 'partition-table.bin', source: 'partition_table/partition-table.bin' },
  { offset: '0x10000', file: 'updata_hfp_bridge.bin', source: 'updata_hfp_bridge.bin' },
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Maintainer-only: run after building with the pinned SDK. Never reads device flash/NVS.
export async function snapshotFirmware(build, release) {
  const args = JSON.parse(await readFile(join(build, 'flasher_args.json'), 'utf8'));
  const project = JSON.parse(await readFile(join(build, 'project_description.json'), 'utf8'));
  if (project.target !== 'esp32' || project.git_revision !== 'v5.5.6' || !/^\d+\.\d+\.\d+$/.test(project.project_version)) throw new Error('Expected original ESP32 firmware built with ESP-IDF v5.5.6 and a release version');
  if (args.flash_settings?.flash_mode !== 'dio' || args.flash_settings?.flash_size !== '4MB' || args.flash_settings?.flash_freq !== '40m' || args.extra_esptool_args?.chip !== 'esp32') throw new Error('Unexpected firmware flash configuration');
  if (Object.keys(args.flash_files).length !== images.length || images.some(image => args.flash_files[image.offset] !== image.source)) throw new Error('Unexpected firmware image layout');
  const data = await Promise.all(images.map(async image => ({ ...image, bytes: await readFile(join(build, image.source)) })));
  if (data.some(image => !image.bytes.length)) throw new Error('Empty firmware image');
  await mkdir(release, { recursive: true });
  for (const image of data) await writeFile(join(release, image.file), image.bytes);
  const manifest = { format: 1, version: project.project_version, chip: 'esp32', idf: 'v5.5.6', flashSize: '4MB', flashMode: 'dio', flashFrequency: '40m', images: data.map(image => ({ file: image.file, offset: image.offset, size: image.bytes.length, sha256: sha256(image.bytes) })) };
  await writeFile(join(release, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function packageFirmware(release, target) {
  const manifest = JSON.parse(await readFile(join(release, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || manifest.chip !== 'esp32' || manifest.idf !== 'v5.5.6' || manifest.flashSize !== '4MB' || manifest.flashMode !== 'dio' || manifest.flashFrequency !== '40m' || manifest.images?.length !== images.length) throw new Error('Unsupported firmware release manifest');
  const data = await Promise.all(images.map(async image => {
    const entry = manifest.images.find(item => item.file === image.file && item.offset === image.offset);
    const bytes = await readFile(join(release, image.file));
    if (!entry || entry.size !== bytes.length || entry.sha256 !== sha256(bytes)) throw new Error(`Firmware integrity check failed: ${image.file}`);
    return { ...image, bytes };
  }));
  const temp = await mkdtemp(join(tmpdir(), 'updata-firmware-'));
  const folder = join(temp, 'updata-esp32-firmware');
  try {
    await mkdir(folder);
    for (const image of data) await writeFile(join(folder, image.file), image.bytes);
    await writeFile(join(folder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(join(folder, 'flash_args'), `--flash_mode dio --flash_freq 40m --flash_size 4MB\n${images.map(image => `${image.offset} ${image.file}`).join('\n')}\n`);
    await copyFile(join(root, 'esp32/BINARY-INSTALL.md'), join(folder, 'INSTALL.txt'));
    const archive = join(temp, 'updata-esp32-firmware.tgz');
    await promisify(execFile)('tar', ['-czf', archive, '-C', temp, 'updata-esp32-firmware']);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(archive, `${target}.tmp`);
    await rename(`${target}.tmp`, target);
    return manifest;
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--snapshot-build')) {
    const result = await snapshotFirmware(join(root, 'esp32/firmware/build'), join(root, 'firmware-release'));
    console.log(`Snapshotted compiled firmware ${result.version}; no source, NVS, keys or backups`);
  }
  const result = await packageFirmware(join(root, 'firmware-release'), join(root, 'dist/updata-esp32-firmware.tgz'));
  console.log(`Packaged compiled ESP32 firmware ${result.version}; hashes verified`);
}

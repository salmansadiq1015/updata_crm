import { cp, mkdtemp, mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'updata-gateway-package-'));
try {
  for (const name of ['bin', 'src', 'package.json', 'README.md']) await cp(join(root, name), join(temp, name), { recursive: true });
  const pkg = JSON.parse(await readFile(join(temp, 'package.json'), 'utf8'));
  pkg.scripts = { start: 'node bin/updata-gateway.mjs run' };
  await writeFile(join(temp, 'package.json'), JSON.stringify(pkg, null, 2));
  // npm pack omits package-lock; ship the same resolved dependencies as shrinkwrap.
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  lock.version = pkg.version; lock.packages[''].version = pkg.version;
  await writeFile(join(temp, 'npm-shrinkwrap.json'), JSON.stringify(lock, null, 2));
  const { stdout } = await promisify(execFile)('npm', ['pack', '--ignore-scripts', '--json'], { cwd: temp });
  const [{ filename }] = JSON.parse(stdout);
  await mkdir(join(root, 'dist'), { recursive: true });
  const target = join(root, 'dist', 'updata-phone-gateway.tgz');
  await cp(join(temp, filename), `${target}.tmp`);
  await rename(`${target}.tmp`, target);
  console.log('Created dist/updata-phone-gateway.tgz (allowlisted source and locked dependencies; no credentials or flash images)');
} finally { await rm(temp, { recursive: true, force: true }); }

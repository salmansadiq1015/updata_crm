import { mkdir, writeFile, rm, access, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile as exec } from 'node:child_process';
import { promisify } from 'node:util';
import { gatewayPaths } from './system.js';

const execFile = promisify(exec);
const LABEL = 'ai.updata.phone-gateway';
const xml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function launchAgent({ node, entry, logDir, profile, gatewayHome }) {
  gatewayPaths(profile); // validate before using the name in paths or service labels
  const label = profile ? `${LABEL}.${profile}` : LABEL;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(entry)}</string><string>run</string>${profile ? `<string>--profile</string><string>${xml(profile)}</string>` : ''}</array>
${gatewayHome ? `<key>EnvironmentVariables</key><dict><key>UPDATA_GATEWAY_HOME</key><string>${xml(gatewayHome)}</string></dict>` : ''}
<key>WorkingDirectory</key><string>${xml(dirname(dirname(entry)))}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(join(logDir, 'gateway.out.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(logDir, 'gateway.err.log'))}</string>
</dict></plist>\n`;
}

export async function manageService(action, { platform = process.platform, homeDir = homedir(), run = execFile, profile } = {}) {
  gatewayPaths(profile);
  if (!['install', 'uninstall', 'status'].includes(action)) throw new Error('Use service install|uninstall|status');
  if (platform !== 'darwin') throw new Error('Login service installation currently supports macOS. Run the gateway in a terminal on this platform.');
  const label = profile ? `${LABEL}.${profile}` : LABEL;
  const file = join(homeDir, 'Library', 'LaunchAgents', `${label}.plist`);
  const target = `gui/${process.getuid()}/${label}`;
  if (action === 'status') {
    const installed = await access(file).then(() => true, () => false);
    const running = await run('launchctl', ['print', target]).then(() => true, () => false);
    return { installed, running };
  }
  if (action === 'uninstall') {
    await run('launchctl', ['bootout', target]).catch(() => {});
    await rm(file, { force: true });
    return { installed: false, credentialsPreserved: true };
  }
  const logDir = profile ? join(homeDir, '.updata', 'logs', profile) : join(homeDir, '.updata', 'logs');
  await mkdir(dirname(file), { recursive: true });
  await mkdir(logDir, { recursive: true, mode: 0o700 });
  await chmod(logDir, 0o700);
  for (const name of ['gateway.out.log', 'gateway.err.log']) {
    await writeFile(join(logDir, name), '', { flag: 'a', mode: 0o600 });
    await chmod(join(logDir, name), 0o600);
  }
  const entry = fileURLToPath(new URL('../../bin/updata-gateway.mjs', import.meta.url));
  await writeFile(file, launchAgent({ node: process.execPath, entry, logDir, profile, gatewayHome: process.env.UPDATA_GATEWAY_HOME }), { mode: 0o600 });
  await chmod(file, 0o600);
  await run('plutil', ['-lint', file]);
  await run('launchctl', ['bootout', target]).catch(() => {});
  await run('launchctl', ['bootstrap', `gui/${process.getuid()}`, file]);
  return { installed: true, file };
}

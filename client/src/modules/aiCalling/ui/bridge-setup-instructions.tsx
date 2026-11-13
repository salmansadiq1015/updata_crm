'use client';

import { useState, type ReactNode } from 'react';
import { Copy, Download } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { pairedPhoneApi } from '../services/paired-phone-api';

export type BridgePlatform = 'mac' | 'windows' | 'linux';
const panel = 'space-y-3 rounded-xl border border-border p-3 text-xs leading-relaxed';
const list = 'list-decimal space-y-2 ps-5 text-muted-foreground';
const ports: Record<BridgePlatform, string> = { mac: '/dev/cu.usbserial-0001', windows: 'COM5', linux: '/dev/ttyUSB0' };

export function SetupCommand({ command, label }: { command: string; label: string }) {
  const [status, setStatus] = useState('');
  return <div className="space-y-1">
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-xs">{command}</code>
      <button type="button" aria-label={`Copy ${label}`} className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" onClick={async () => {
        try { await navigator.clipboard.writeText(command); setStatus('Command copied.'); }
        catch { setStatus('Select and copy the command above.'); }
      }}><Copy className="h-4 w-4" aria-hidden="true" /></button>
    </div>
    {status && <p role="status" className="text-muted-foreground">{status}</p>}
  </div>;
}

export function UsbConnectionHelp({ profile, reportedPort, platform: selectedPlatform }: { profile?: string; reportedPort?: string | null; platform?: BridgePlatform }) {
  const [platform, setPlatform] = useState<BridgePlatform>('mac');
  const os = selectedPlatform ?? platform;
  const port = reportedPort || ports[os];
  return <details className={panel}>
    <summary className="cursor-pointer text-sm font-semibold">ESP32 USB not reachable? Check the cable and firmware</summary>
    <p>Computer online means the gateway can reach CRM. It does not mean the ESP32 answered. Seeing the bridge in Android Bluetooth does not verify its USB connection.</p>
    {!selectedPlatform && <label className="flex flex-wrap items-center gap-2">USB diagnostic computer
      <select aria-label="USB diagnostic computer" className="rounded border border-border bg-background p-2" value={platform} onChange={e => setPlatform(e.target.value as BridgePlatform)}><option value="mac">Mac (macOS)</option><option value="windows">Windows</option><option value="linux">Linux</option></select>
    </label>}
    <ol className={list}>
      <li>Finish any call. With the gateway running, unplug the bridge, wait five seconds and reconnect it directly with a USB data cable. Leave BOOT released, then choose Connect phone. If USB becomes connected, continue with Phone setup.</li>
      <li>If it still fails, stop the gateway with Ctrl+C. Close Arduino Serial Monitor, screen, flashing tools and other gateway windows before running a probe.</li>
      {os === 'mac' && profile && <li>If automatic startup was installed, stop it first: <SetupCommand command={`node bin/updata-gateway.mjs service uninstall --profile ${profile}`} label="stop automatic gateway" />This keeps your credentials. Reinstall the service after recovery.</li>}
      <li>In the extracted package folder, list ports. Choose the USB bridge, not a headset, Bluetooth port or Android USB phone.<SetupCommand command="node bin/esp32-probe.mjs ports" label="list USB ports" /></li>
      <li>Use the port printed above. The command below {reportedPort ? 'uses the port last reported by this card; check it still exists' : 'contains an example port; replace it if your output differs'}.<SetupCommand command={`node bin/esp32-probe.mjs info --port ${port}`} label="check ESP32 firmware" /></li>
    </ol>
    <dl className="space-y-3 rounded-lg bg-muted/30 p-3">
      <div><dt className="font-semibold">Firmware information appears</dt><dd>USB is working. Close the probe, restart the phone card’s gateway command with its profile, then choose Connect phone. Only one program can own the port.</dd></div>
      <div><dt className="font-semibold">Resource busy / access denied</dt><dd>Close the program using the port. {os === 'windows' ? 'Close serial terminals and check Device Manager for the actual COM port.' : <>Identify its owner with <code>{`lsof ${port}`}</code>. Quit that program; do not stop unrelated processes.</>} {os === 'linux' && 'Check your dialout group permission and log in again after it changes; do not run the gateway as root.'}</dd></div>
      <div><dt className="font-semibold">[no_reply] / no reply 0x81</dt><dd>Press and release EN / RESET once, leave BOOT released, wait five seconds, then retry info. If it still fails, stop here and follow New board firmware below or the PDF with your installer. Installing npm dependencies does not install firmware. A timeout alone does not prove the board needs reflashing.</dd></div>
      <div><dt className="font-semibold">No USB bridge listed</dt><dd>Try a different data cable and direct USB port. Install the adapter manufacturer’s CP210x or CH34x driver if needed. A power light alone does not confirm USB data.</dd></div>
    </dl>
    <p>For a new board, open Setup guide → New board firmware, or <a href="/guides/updata-esp32-complete-setup.pdf" download className="text-brand-600 underline dark:text-brand-400">download the firmware and connection handbook</a>. Complete the USB check before changing Bluetooth or security keys.</p>
    {os === 'mac' && <SetupCommand command={`lsof ${port} ${port.replace('/dev/cu.', '/dev/tty.')}`} label="find USB port owner" />}
  </details>;
}

function FirmwareDownload() {
  const download = useMutation({ mutationFn: pairedPhoneApi.downloadFirmware, onSuccess: blob => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'updata-esp32-firmware.tgz'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } });
  return <div className="space-y-2">
    <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 font-medium hover:bg-muted disabled:opacity-50" disabled={download.isPending} onClick={() => download.mutate()}><Download className="h-4 w-4" aria-hidden="true" />{download.isPending ? 'Preparing firmware…' : 'Download ESP32 firmware'}</button>
    {download.isError && <p role="alert" className="text-rose-600 dark:text-rose-400">Firmware download failed. Ask your administrator to include the compiled ESP32 firmware in this release. You do not need repository access.</p>}
  </div>;
}

function FirmwareInstructions({ platform }: { platform: BridgePlatform }) {
  const windows = platform === 'windows';
  const port = ports[platform];
  const portVar = windows ? '%UPDATA_ESP_PORT%' : '"$UPDATA_ESP_PORT"';
  const backupVar = windows ? '"%UPDATA_ESP_BACKUP%"' : '"$UPDATA_ESP_BACKUP"';
  return <details className={panel}>
    <summary className="cursor-pointer text-sm font-semibold">New board firmware: download and install without source code</summary>
    <p>A factory-new ESP32 needs Updata firmware. Download the compiled images below; you do not need GitHub access, the CRM repository, firmware source or ESP-IDF. The separate gateway download runs on your computer and does not flash the board.</p>
    <FirmwareDownload />
    <ol className={list}>
      <li>Download and extract the firmware archive. Open its <strong>updata-esp32-firmware</strong> folder. It contains three .bin files, manifest.json, flash_args and INSTALL.txt. No account credentials or board backup is included.</li>
      <li>Install <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer" className="text-brand-600 underline dark:text-brand-400">Python 3.12</a>. Open {windows ? 'Command Prompt (cmd.exe), not PowerShell' : 'Terminal'}, create an isolated flashing-tool environment and activate it:
        <SetupCommand command={windows ? 'py -3.12 -m venv "%USERPROFILE%\\.updata\\flash-tools"' : 'python3.12 -m venv "$HOME/.updata/flash-tools"'} label="create flashing tools" />
        <SetupCommand command={windows ? 'call "%USERPROFILE%\\.updata\\flash-tools\\Scripts\\activate.bat"' : 'source "$HOME/.updata/flash-tools/bin/activate"'} label="activate flashing tools" />
        <SetupCommand command="python -m pip install esptool==4.12.0" label="install flashing tool" />Activate this environment again in each new flashing command window. There is no firmware build step for end users.
      </li>
      <li>Finish calls; stop the gateway, any Mac login service and all serial monitors. Use the USB port check above to find your actual port, then set it below.
        <SetupCommand command={windows ? `set "UPDATA_ESP_PORT=${port}"` : `export UPDATA_ESP_PORT="${port}"`} label="set firmware port" />
        <SetupCommand command={`python -m esptool --chip esp32 --port ${portVar} chip_id`} label="identify chip" />
        <SetupCommand command={`python -m esptool --chip esp32 --port ${portVar} flash_id`} label="identify flash size" />
        <SetupCommand command={`python -m espefuse --chip esp32 --port ${portVar} summary`} label="inspect security" />If Connecting stalls, hold BOOT, press and release EN, then release BOOT when it connects.
      </li>
      <li><strong>Stop unless this is an unsecured original ESP32 with 4 MB flash.</strong> If secure boot/encryption is enabled or the output is unclear, have your installer review it. Do not burn eFuses, use force flags or erase-flash. A working prepared bridge does not need reflashing for a reconnect.</li>
      <li>Back up the actual board privately before writing. {windows ? 'Use a new filename each time and restrict folder access to your Windows user.' : 'These commands create a private folder and timestamped file.'}
        {windows ? <>
          <SetupCommand command={'mkdir "%USERPROFILE%\\updata-esp-backups"'} label="create backup folder" />
          <SetupCommand command={'set "UPDATA_ESP_BACKUP=%USERPROFILE%\\updata-esp-backups\\esp32-before-updata-01.bin"'} label="set backup filename" />
        </> : <>
          <SetupCommand command={'mkdir -p "$HOME/updata-esp-backups"\nchmod 700 "$HOME/updata-esp-backups"\numask 077'} label="protect backup folder" />
          <SetupCommand command={'export UPDATA_ESP_BACKUP="$HOME/updata-esp-backups/esp32-$(date +%Y%m%d-%H%M%S).bin"'} label="set backup filename" />
        </>}
        <SetupCommand command={`python -m esptool --chip esp32 --port ${portVar} --baud 460800 --after no_reset read_flash 0 0x400000 ${backupVar}`} label="back up board" />Immediately verify without resetting, unplugging or letting the application run:
        <SetupCommand command={`python -m esptool --chip esp32 --port ${portVar} --baud 460800 --before no_reset --after no_reset verify_flash 0 ${backupVar}`} label="verify backup" />Continue only after verification succeeds. The backup excludes eFuses and RAM; keep it private.
      </li>
      <li>Open this command window in the extracted <strong>updata-esp32-firmware</strong> folder. On Mac, type cd followed by a space, drag that folder from Finder and press Enter. On Windows, use cd /d followed by the quoted folder path. Inspect manifest.json for version, chip, layout and file hashes. Use only the approved release from your CRM.
        <SetupCommand command={`python -m esptool --chip esp32 --port ${portVar} --baud 460800 write_flash @flash_args`} label="flash downloaded firmware" />The included arguments select the three images and offsets. Do not mix releases or guess offsets. Updating a different partition layout may replace saved settings.
      </li>
      <li>Release BOOT, press EN once and wait five seconds. In the gateway package folder, run the info command from step 2. Firmware information must appear before linking CRM. Then start the gateway, check the live security key, pair Android and repeat the audio test. If info still times out, save the full flash output for your installer.</li>
    </ol>
    <p className="text-muted-foreground">The archive includes detailed INSTALL.txt instructions. Firmware installation still requires local USB access. Physical verification in this project used macOS; check real hardware and both audio directions on Windows and Linux.</p>
  </details>;
}

export function BridgeSetupInstructions({ apiBase, platform, installSteps }: { apiBase: string; platform: BridgePlatform; installSteps: ReactNode }) {
  return <div className="space-y-4">
    <div className={panel}>
      <h4 className="text-sm font-semibold">Before you start: check the module and phone</h4>
      <p>Use an original ESP32-WROOM-32 / 32E / 32D with Classic Bluetooth, a USB data cable and an Android phone with an active SIM. ESP32-S2, S3, C3, C6 and H2 cannot run this bridge. Connect the ESP32 to the computer by USB; Android connects to the ESP32 by Bluetooth.</p>
      <p>A new board must have Updata firmware. Downloading the gateway and running npm ci --omit=dev installs the computer program only. Use the separate compiled firmware download below to prepare a new board; no repository access is needed. USB power and a remembered Bluetooth name do not prove the bridge is ready.</p>
      <a href="/guides/updata-esp32-complete-setup.pdf" download className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 font-medium hover:bg-muted"><Download className="h-4 w-4" aria-hidden="true" />Download complete ESP32 setup PDF</a>
    </div>
    {installSteps}
    <FirmwareInstructions platform={platform} />
    <section className={panel} aria-label="Check the ESP32 USB connection">
      <h4 className="text-sm font-semibold">2. Make sure the ESP32 answers over USB</h4>
      <p>Before starting the gateway, close all serial tools and run these commands in its extracted package folder. Copy one command at a time, press Enter and wait for the result.</p>
      <SetupCommand command="node bin/esp32-probe.mjs ports" label="discover bridge ports" />
      <p>Find the CP210x / CH34x USB bridge. Replace this example port if yours differs:</p>
      <SetupCommand command={`node bin/esp32-probe.mjs info --port ${ports[platform]}`} label="verify bridge firmware" />
      <p><strong>Checkpoint:</strong> firmware and board information must appear. If Resource busy or [no_reply] appears, use the USB help below before continuing.</p>
      <UsbConnectionHelp platform={platform} />
    </section>
    <section className={panel} aria-label="Link the phone to CRM">
      <h4 className="text-sm font-semibold">3. Add your phone and link this computer</h4>
      <ol className={list}>
        <li>Choose Add paired phone, enter a name and optional SIM label, then Create pairing code. If this phone already has a card, use Link computer on that same card after stopping its old gateway. Do not add a duplicate.</li>
        <li>Copy the card’s pairing command, paste it into the package Terminal and press Enter. It includes this CRM’s API, a one-use code and that phone’s --profile ID. Codes expire after ten minutes; Get new code keeps the same phone.</li>
        <li>If several bridges are plugged in, append --port followed by the correct port from step 2. Each phone needs a distinct bridge, profile and gateway window.</li>
        <li>Copy the card’s start command and run it. Keep Terminal open. The website cannot start an uninstalled or stopped program for you.</li>
      </ol>
      <p><strong>Checkpoint:</strong> Computer online and ESP32 USB connected. A saved card or pairing code alone does not connect either device.</p>
      <p className="text-muted-foreground">The pairing command must use this application’s API: <code className="break-all">{apiBase}</code>. Use the generated command rather than guessing from the browser address. Replace placeholders; do not paste shell prompts, HTML entities or backslashes into https://.</p>
    </section>
    <section className={panel}>
      <h4 className="text-sm font-semibold">4. Save the security key</h4>
      <ol className={list}><li>Open Phone setup on your phone card. If both CRM and the current board report the key saved, keep it.</li><li>If provisioning is needed, hold the ESP32’s BOOT button, choose Save security key and release BOOT only after success. EN is the reset button.</li></ol>
      <p>Normal reconnects keep the existing key. After flashing or replacing a board, recheck its live key status. Use the website’s provisioning control; the standalone esp32-probe provision command manages a separate local key.</p>
    </section>
    <section className={panel}>
      <h4 className="text-sm font-semibold">5. Pair Android Bluetooth</h4>
      <ol className={list}><li>With USB connected and the gateway running, choose Pair a new phone on the card. Discovery stays open for two minutes.</li><li>On Android, open Settings → Bluetooth → Pair new device. Select the exact Updata Phone Bridge name shown on the card. Confirm the pairing number if asked.</li><li>Open that Bluetooth device’s settings and enable Phone calls. Set Android’s default calling SIM rather than Ask every time. Disconnect a competing headset or Mac hands-free connection if it takes call audio.</li><li>Return to CRM and choose Connect phone. If already paired, try Connect phone first; you do not need to pair again for normal reconnects.</li></ol>
      <p><strong>Checkpoint:</strong> Phone Bluetooth connected in the current CRM report. Android remembering the device is not proof of an active hands-free connection.</p>
    </section>
    <section className={panel}>
      <h4 className="text-sm font-semibold">6. Check both directions of a real call</h4>
      <ol className={list}><li>Open Sound &amp; test call. Enter a second phone number you own with its country code, not the SIM number making the call.</li><li>Confirm that you own and can answer the number, then choose Call my second phone once. This places one real SIM call.</li><li>Answer that second phone, listen to the AI and say its requested phrase. Check that the AI understood your reply. Adjust AI voice volume if necessary and save it.</li><li>After hearing clear speech both ways, choose Verify call audio, confirm both checks and save. Repeat the sound test after firmware or host changes, even if an old check remains green.</li></ol>
      <p><strong>Ready:</strong> all five checks pass: computer, USB bridge, security key, phone Bluetooth and two-way audio. Keep the computer awake and online, USB plugged in, Bluetooth enabled and gateway running.</p>
      <p>If the test reports an unavailable AI agent or voice service, ask the CRM administrator to check the voice worker and LiveKit connection. Changing the ESP32 key will not repair a server voice-service failure.</p>
    </section>
    <details className={panel}><summary className="cursor-pointer text-sm font-semibold">Reconnect, move to another computer, or start automatically</summary>
      <ol className={list}><li>For normal use, run this phone card’s saved start command. Reconnect gateway opens those instructions when offline. Keep the existing key and Bluetooth bond.</li><li>For “not linked”, check the correct --profile ID and computer user. For a new computer, stop the old gateway/service, install the gateway on the new computer and use Link computer on the existing card with its new USB port. A working prepared board needs no reflash.</li><li>For Mac auto-start, first confirm foreground calls work. Stop the gateway with Ctrl+C and use the profile-specific service install command in Reconnect gateway. Check service status; uninstall it before probing or relinking. Keep the permanent package folder and Node installation.</li><li>Windows and Linux use the foreground gateway command; this release’s login service installer supports macOS only. Each additional phone needs its own USB bridge and profile.</li><li>If the gateway cannot reach CRM, check the API URL shown by this application and the network. Use the card’s start command with --api for recovery; a different CRM database may require Link computer. Do not rotate the calling key to fix an HTTP timeout.</li></ol>
    </details>
  </div>;
}

'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bluetooth, ChevronDown, Copy, Cpu, Download, Headphones, HelpCircle, KeyRound, Laptop, Loader2, PlugZap, RefreshCw, Settings2, Smartphone, Unplug, Volume2 } from 'lucide-react';
import { pairedPhoneApi } from '../services/paired-phone-api';
import { pairedKeys } from '../hooks/use-paired-phone';
import { pairedPhoneConnection } from '../paired-phone-connection';
import type { BridgeAudioTest, PairedDevice, SetupAction } from '../types/ai-calling-types';

const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50';
const errorMessage = (e: unknown) => (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error?.message || (e as Error)?.message || 'Request failed. Check the gateway and try again.';

export function BridgeSetupControls({ device: d, now, apiBase, onVerifyAudio }: { device: PairedDevice; now: number; apiBase: string; onVerifyAudio?: () => void }) {
  const qc = useQueryClient();
  const [gainOverride, setGain] = useState<number | null>(null);
  const gain = gainOverride ?? d.setup?.playbackGainDb ?? 0;
  const [reconnect, setReconnect] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [gatewayHelp, setGatewayHelp] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const changed = () => qc.invalidateQueries({ queryKey: pairedKeys.devices });
  const checkGateway = useMutation({
    mutationFn: () => pairedPhoneApi.devices(),
    onSuccess: devices => qc.setQueryData(pairedKeys.devices, devices),
  });
  const action = useMutation({ mutationFn: (kind: SetupAction) => pairedPhoneApi.setupAction(d.id, kind), onSuccess: setup => {
    qc.setQueryData<PairedDevice[]>(pairedKeys.devices, devices => devices?.map(device => device.id === d.id ? { ...device, setup } : device));
    return changed();
  } });
  const settings = useMutation({ mutationFn: (input: { playbackGainDb?: number; autoConnect?: boolean }) => pairedPhoneApi.setupSettings(d.id, input), onSuccess: (_data, input) => { if (input.playbackGainDb !== undefined) setGain(null); changed(); } });
  const connection = pairedPhoneConnection(d, now);
  const version = (d.gateway.version || '').split('.').map(Number);
  const supported = version[0] >= 1 || (version[0] === 0 && version[1] >= 3);
  const command = d.setup?.command;
  const busy = Boolean((connection.gatewayOnline && (d.currentCallId || d.state.call || d.state.callsetup)) || action.isPending || (command && ['pending', 'running'].includes(command.state) && new Date(command.expiresAt).getTime() > now));
  const disabled = !supported || !connection.gatewayOnline || busy;
  const keyReady = d.keyState === 'provisioned' && d.board.keyProvisioned;
  const activeCommand = command && ['pending', 'running'].includes(command.state) && new Date(command.expiresAt).getTime() > now;
  const actionLabels: Record<SetupAction, string> = { status: 'Checking connection', connect_phone: 'Connecting phone', disconnect_phone: 'Disconnecting phone', pair_phone: 'Opening phone pairing', provision_key: 'Saving security key', reconnect_usb: 'Reconnecting USB bridge' };
  const startCommand = `node bin/updata-gateway.mjs run --profile ${d.id} --api '${apiBase.replaceAll("'", "'\"'\"'")}'`;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={`${button} border-transparent bg-brand-600 text-white hover:bg-brand-700`} disabled={connection.gatewayOnline ? disabled : checkGateway.isPending} onClick={() => {
        if (connection.gatewayOnline) action.mutate(connection.phone === 'connected' ? 'status' : 'connect_phone');
        else { setGatewayHelp(true); checkGateway.mutate(); }
      }}>
        {(connection.gatewayOnline && busy) || checkGateway.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlugZap className="h-4 w-4" aria-hidden="true" />}
        {!connection.gatewayOnline ? checkGateway.isPending ? 'Checking gateway…' : 'Reconnect gateway' : busy ? activeCommand ? actionLabels[command.action] + '…' : 'Please wait…' : connection.phone === 'connected' ? 'Check connection' : 'Connect phone'}
      </button>
      {!keyReady && <button className={button} onClick={() => setSetupOpen(true)}><KeyRound className="h-4 w-4" aria-hidden="true" />Finish setup</button>}
      <button className={button} onClick={() => setSetupOpen(!setupOpen)} aria-expanded={setupOpen}><Settings2 className="h-4 w-4" aria-hidden="true" />Phone setup<ChevronDown className={`h-3.5 w-3.5 transition-transform ${setupOpen ? 'rotate-180' : ''}`} aria-hidden="true" /></button>
      <button className={button} onClick={() => setSoundOpen(!soundOpen)} aria-expanded={soundOpen}><Volume2 className="h-4 w-4" aria-hidden="true" />Sound & test call<ChevronDown className={`h-3.5 w-3.5 transition-transform ${soundOpen ? 'rotate-180' : ''}`} aria-hidden="true" /></button>
    </div>
    {gatewayHelp && !connection.gatewayOnline && <section aria-label="Reconnect computer gateway" className="space-y-3 rounded-xl border border-brand-500/25 bg-brand-500/5 p-4">
      <h4 className="text-sm font-semibold">Reconnect this computer</h4>
      <p className="text-xs leading-relaxed text-muted-foreground">The CRM has not received a recent report from this computer. USB power and phone Bluetooth can stay connected while the gateway is stopped or cannot reach this CRM. This website cannot launch the computer program for you.</p>
      <p className="text-xs leading-relaxed text-muted-foreground">If Terminal shows heartbeat_failed or CRM_TIMEOUT, check its saved CRM URL. Stop that gateway with Ctrl-C, then use the command below to connect to this application. Use gateway 0.4.4 or newer. The connection is checked before saving; your phone pairing and security key are kept.</p>
      <p className="text-xs leading-relaxed text-muted-foreground">Keep the ESP32 plugged in. Open Terminal in your installed Updata gateway folder and run the command below. Keep that Terminal open while using your phone bridge.</p>
      <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-background p-3"><code className="min-w-0 flex-1 break-all text-xs">{startCommand}</code><button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Copy gateway start command" onClick={async () => { try { await navigator.clipboard.writeText(startCommand); setCopyStatus('Command copied.'); } catch { setCopyStatus('Select and copy the command above.'); } }}><Copy className="size-4" aria-hidden="true" /></button></div>
      {copyStatus && <p role="status" className="text-xs text-muted-foreground">{copyStatus}</p>}
      <button type="button" className={button} disabled={checkGateway.isPending} onClick={() => checkGateway.mutate()}><RefreshCw className={`size-4 ${checkGateway.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />{checkGateway.isPending ? 'Checking gateway status…' : 'Check gateway status'}</button>
      <p className="text-xs leading-relaxed text-muted-foreground">If you see “not linked” or moved to another computer, choose <strong className="text-foreground">Link computer</strong> on this phone’s card. If --profile is not recognized, download the latest gateway from Setup guide. Your saved security key and phone pairing are kept.</p>
      <details className="text-xs"><summary className="cursor-pointer font-medium">Start this phone automatically on macOS</summary><p className="mt-2 leading-relaxed text-muted-foreground">Stop this phone’s Terminal gateway with Ctrl-C, then run <code className="break-all">node bin/updata-gateway.mjs service install --profile {d.id}</code>. To stop that service before linking the computer again, run <code className="break-all">node bin/updata-gateway.mjs service uninstall --profile {d.id}</code>.</p></details>
    </section>}
    {checkGateway.isSuccess && <p role="status" className="text-xs text-muted-foreground">{connection.gatewayOnline ? 'Gateway is online. USB and phone Bluetooth status are shown above.' : 'Gateway is still offline. Run the start command on the computer attached to this bridge, then check again.'}</p>}
    {checkGateway.isError && <p role="alert" className="text-xs text-rose-600">Could not check gateway status. {errorMessage(checkGateway.error)}</p>}
    {busy && !activeCommand && <p className="text-xs text-muted-foreground">A call or connection request is in progress. These controls will be available when it finishes.</p>}
    {!supported && <p className="text-xs text-amber-600">Install gateway 0.3.0 or newer using Setup guide to enable these controls.</p>}
    {!connection.gatewayOnline && <p className="text-xs text-muted-foreground">Open the Updata gateway on the computer plugged into your bridge. Then choose Connect phone here. Setup guide explains the first installation.</p>}
    {activeCommand && <p role="status" className="text-xs" aria-live="polite">{actionLabels[command.action]}… {command.action === 'provision_key' ? 'Keep holding BOOT until the key is saved.' : 'Waiting for the computer to confirm. Your connection status will update automatically.'}</p>}
    {command?.state === 'succeeded' && <p role="status" className={`text-xs ${connection.gatewayOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{connection.gatewayOnline ? command.message || 'Gateway confirmed the action completed.' : 'The last setup action completed earlier. The gateway is currently offline.'}</p>}
    {command && ['pending', 'running'].includes(command.state) && !activeCommand && <p role="alert" className="text-xs text-amber-600">The computer did not finish in time. Check that the gateway is running, then try again.</p>}
    {command && ['failed', 'expired'].includes(command.state) && <p role="alert" className="text-xs text-amber-600">{command.state === 'expired' ? 'The computer did not finish in time. Check that the gateway is running, then try again.' : command.message || 'That step did not finish. Check the USB cable and phone Bluetooth, then try again.'}</p>}
    {action.isError && <p role="alert" className="text-xs text-rose-600">{errorMessage(action.error)}</p>}
    {setupOpen && <section aria-label="Phone setup" className="space-y-4 rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">Keep the bridge plugged into your computer. Normal reconnects do not need BOOT, a new key, or a reboot.</p>
      <div className="space-y-2"><h4 className="text-sm font-semibold">1. Pair your Android phone</h4>
        <p className="text-xs text-muted-foreground">Choose Pair a new phone, then open Bluetooth settings on Android. Select <strong className="text-foreground">{d.board.bdaddr ? `Updata Phone Bridge ${d.board.bdaddr.replaceAll(':', '').slice(-4)}` : 'Updata Phone Bridge'}</strong> and enable Phone calls. Choose your default calling SIM in Android settings.</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={disabled || connection.board !== 'connected'} onClick={() => action.mutate('pair_phone')}><Bluetooth className="h-4 w-4" aria-hidden="true" />Pair a new phone</button>
          <button className={button} disabled={disabled || connection.phone !== 'connected'} onClick={() => action.mutate('disconnect_phone')}><Unplug className="h-4 w-4" aria-hidden="true" />Disconnect phone</button></div>
        <p className="text-xs text-muted-foreground">Pairing stays available for two minutes. After pairing, choose Connect phone above.</p>
      </div>
      <div className="space-y-2"><h4 className="text-sm font-semibold">2. Allow this bridge to make CRM calls</h4>
        {keyReady ? <p className="text-xs text-emerald-600 dark:text-emerald-400">Security key saved. No further action needed.</p> : <><p className="text-xs text-muted-foreground">Hold the BOOT button on the bridge, then choose Save security key. Release it after the key is saved. This is only needed for first setup or after replacing the key.</p>
          <button className={button} disabled={disabled || connection.board !== 'connected'} onClick={() => action.mutate('provision_key')}><KeyRound className="h-4 w-4" aria-hidden="true" />Save security key</button></>}
      </div>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={d.setup?.autoConnect !== false} disabled={!supported || settings.isPending || busy} onChange={e => settings.mutate({ autoConnect: e.target.checked })} /> Automatically reconnect Bluetooth</label>
    <details className="text-xs"><summary className="cursor-pointer font-medium">USB recovery</summary>
      <p className="my-2 text-muted-foreground">Use if the connection is stuck. This reopens the USB connection and may restart some boards. Your firmware, key, and phone pairing are kept.</p>
      {!reconnect ? <button className={button} disabled={disabled} onClick={() => setReconnect(true)}>Reconnect USB…</button> : <div className="flex gap-2"><button className={button} disabled={disabled} onClick={() => { action.mutate('reconnect_usb'); setReconnect(false); }}>Confirm USB reconnect</button><button className={button} onClick={() => setReconnect(false)}>Cancel</button></div>}
    </details>
    </section>}
    {soundOpen && <section aria-label="Sound and test call" className="space-y-3 rounded-xl border border-border p-4">
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs">AI voice volume <select aria-label="AI voice volume" className="ml-2 rounded border border-border bg-background p-1.5" value={gain} onChange={e => setGain(Number(e.target.value))}>
        {[0, 3, 6, 9, 12].map((db, index) => <option key={db} value={db}>{['Normal', 'Louder', 'Loud', 'Very loud', 'Maximum'][index]}</option>)}
      </select></label>
      <button className={button} disabled={!supported || settings.isPending || gain === (d.setup?.playbackGainDb ?? 0)} onClick={() => settings.mutate({ playbackGainDb: gain })}>Save volume</button>
    </div>
    <p className="text-xs text-muted-foreground">{connection.gatewayOnline && d.gateway.playbackGainDb === (d.setup?.playbackGainDb ?? 0) ? 'Volume is saved on your computer. Make a test call to check how it sounds.' : 'Saved changes will apply when your computer next checks in.'}</p>
    <BridgeAudioTestControls device={d} disabled={disabled || !keyReady || connection.phone !== 'connected'} />
    {(!keyReady || connection.phone !== 'connected') && <p className="text-xs text-muted-foreground">Connect your phone and finish the security key step before starting a test call.</p>}
    {onVerifyAudio && !d.audioVerified && <button className={button} disabled={disabled || !keyReady || connection.phone !== 'connected'} onClick={onVerifyAudio}><Headphones className="h-4 w-4" aria-hidden="true" />Verify call audio</button>}
    {d.audioVerified && <p className="text-xs text-emerald-600 dark:text-emerald-400">Two-way call sound has been verified.</p>}
    </section>}
    {settings.isError && <p role="alert" className="text-xs text-rose-600">{errorMessage(settings.error)}</p>}
  </div>;
}

export function BridgeAudioTestControls({ device: d, disabled }: { device: PairedDevice; disabled: boolean }) {
  const qc = useQueryClient();
  const [destination, setDestination] = useState('');
  const [owns, setOwns] = useState(false);
  const [started, setStarted] = useState<BridgeAudioTest | null>(null);
  const id = started?.id || d.audioTest?.callId;
  const result = useQuery({ queryKey: ['paired-phone', 'audio-test', d.id, id], queryFn: () => pairedPhoneApi.audioTestResult(d.id, id!), enabled: Boolean(id), refetchInterval: query => query.state.data?.endedAt || ['completed', 'failed', 'cancelled', 'no_answer', 'busy'].includes(query.state.data?.state || '') ? false : 3000 });
  const start = useMutation({ mutationFn: () => pairedPhoneApi.startAudioTest(d.id, { destination: destination.trim(), ownsDestination: owns }), onSuccess: data => { setStarted(data); qc.invalidateQueries({ queryKey: pairedKeys.devices }); } });
  const hangup = useMutation({ mutationFn: () => pairedPhoneApi.hangup(id!), onSuccess: () => qc.invalidateQueries({ queryKey: ['paired-phone', 'audio-test', d.id, id] }) });
  const r = result.data || started;
  const active = Boolean(r && !r.endedAt && !['failed', 'cancelled', 'no_answer', 'busy', 'completed'].includes(r.state));
  return <div className="space-y-2 border-t border-border pt-3">
    <h4 className="text-xs font-semibold">Two-way audio test</h4>
    <p className="text-xs text-muted-foreground">Places one real SIM call to your own second phone. Answer it, raise its call volume if needed, and say the requested phrase. There is no automatic redial.</p>
    <label className="block text-xs">Your second phone number<input aria-label="Your second phone number" type="tel" autoComplete="tel" className="mt-1 block w-full rounded border border-border bg-background px-2 py-2 text-sm" placeholder="International number, e.g. +92…" value={destination} onChange={e => setDestination(e.target.value)} /></label>
    <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={owns} onChange={e => setOwns(e.target.checked)} /> I own this number, can answer it, and authorize one test call now.</label>
    <button className={button} disabled={disabled || start.isPending || active || !owns || !/^\+[1-9]\d{7,14}$/.test(destination.trim())} onClick={() => start.mutate()}>{start.isPending ? 'Preparing test…' : 'Call my second phone once'}</button>
    {active && <button className={`${button} ml-2 text-rose-600`} disabled={hangup.isPending} onClick={() => hangup.mutate()}>End test call</button>}
    {hangup.isError && <p role="alert" className="text-xs text-rose-600">{errorMessage(hangup.error)}</p>}
    {start.isError && <p role="alert" className="text-xs text-rose-600">{errorMessage(start.error)}</p>}
    {r && <div className="space-y-1 rounded bg-muted/50 p-2 text-xs" aria-live="polite"><p>Test call: {r.state.replaceAll('_', ' ')} · {r.durationSeconds || 0}s</p>{r.failureMessage && <p>{r.failureMessage}</p>}<details><summary className="cursor-pointer">Test details</summary><p>Phone → AI: {r.audio?.upFrames ?? 0} frames · AI → phone: {r.audio?.downFrames ?? 0} frames</p>{r.answers.map(a => <p key={a.field}>{a.field.replaceAll('_', ' ')}: {String(a.value)} ({a.validation})</p>)}</details></div>}
    {result.isError && <p role="alert" className="text-xs text-rose-600">Could not load test status. Refresh before starting another call.</p>}
    <p className="text-xs text-muted-foreground">After a successful call, choose Verify call audio and confirm both directions. Power or Bluetooth connection alone does not verify speech.</p>
  </div>;
}

export function GatewayInstallSteps({ profile }: { profile?: string }) {
  const [platform, setPlatform] = useState('mac');
  const download = useMutation({ mutationFn: pairedPhoneApi.downloadGateway, onSuccess: blob => {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'updata-phone-gateway.tgz'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } });
  return <section aria-label="Install the computer gateway" className="space-y-3 rounded-xl border border-border bg-background p-3 text-xs">
    <h4 className="flex items-center gap-2 text-sm font-semibold"><Laptop className="h-4 w-4 text-brand-500" aria-hidden="true" />1. Prepare your computer</h4>
    <p className="leading-relaxed text-muted-foreground">The gateway is a small program that connects this website to your USB bridge. Install it once on the computer you will use for calls.</p>
    <label className="flex flex-wrap items-center gap-2 font-medium">Your computer
      <select aria-label="Your computer" value={platform} onChange={e => setPlatform(e.target.value)} className="rounded-lg border border-border bg-card p-2">
        <option value="mac">Mac (macOS)</option><option value="windows">Windows</option><option value="linux">Linux</option>
      </select>
    </label>
    <ol className="list-decimal space-y-2 pl-4 leading-relaxed">
      <li><strong>Install Node.js 20 or newer.</strong> This runs the gateway. If you are unsure whether it is installed, ask the person who manages your computer to check.</li>
      <li><button type="button" className={`${button} my-1 text-brand-600 dark:text-brand-400`} disabled={download.isPending} onClick={() => download.mutate()}>{download.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}Download gateway</button><p>Extract the downloaded file into a permanent folder, then open its <strong>package</strong> folder. You should see <strong>bin</strong>, <strong>src</strong> and <strong>package.json</strong>.</p></li>
      <li><strong>Open a command window in that folder.</strong> {platform === 'mac' ? 'In Finder, right-click the package folder and choose Services → New Terminal at Folder. Terminal is the window where you paste commands.' : platform === 'windows' ? 'In File Explorer, open the package folder, right-click empty space and choose Open in Terminal.' : 'In your file manager, open the package folder and choose Open in Terminal.'}</li>
      <li>Paste <code className="rounded bg-muted px-1.5 py-0.5">npm ci --omit=dev</code> and press Enter. Wait for installation to finish, then use the phone’s pairing command. If it says Node or npm is not found, close Terminal after installing Node.js and open it again.</li>
    </ol>
    <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" /><p><strong>Using several phones?</strong> Each needs a separate prepared bridge, a different USB port and its own gateway window. Use each phone’s own pairing and start commands so one phone does not replace another.</p></div>
    {profile && <p className="text-muted-foreground">This phone’s commands include its connection profile automatically. Copy the whole command.</p>}
    {download.isError && <p role="alert" className="rounded-lg border border-rose-500/20 p-2 text-rose-600 dark:text-rose-400">{errorMessage(download.error)} Ask your administrator to provide the Updata gateway package if the download is unavailable.</p>}
  </section>;
}

export function BridgeSetupGuide({ apiBase }: { apiBase: string }) {
  const [open, setOpen] = useState(false);
  return <div><button type="button" className={button} onClick={() => setOpen(!open)} aria-expanded={open}><HelpCircle className="h-4 w-4" aria-hidden="true" />Setup guide<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" /></button>
    {open && <section aria-label="Phone bridge setup guide" className="mt-3 space-y-4 rounded-xl border border-border p-4 text-sm">
      <div><h3 className="font-semibold">Get your phone ready for calls</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Follow these steps in order. The phone card shows which checks have passed and what to do next. Your phone connections are private to your CRM account.</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ icon: Smartphone, title: 'Android + active SIM', detail: 'Turn on Bluetooth, choose the SIM used for calls, and check calling credit.' }, { icon: Cpu, title: 'Prepared USB bridge', detail: 'Use a classic ESP32-WROOM-32 and a USB data cable. Ask your installer to load Updata firmware. S2, S3, C3 and C6 boards do not work.' }, { icon: Laptop, title: 'Computer + internet', detail: 'Keep this computer awake, online and connected to the bridge during calls.' }].map(({ icon: Icon, title, detail }) => <div key={title} className="rounded-xl border border-border bg-muted/20 p-3"><Icon className="mb-2 h-5 w-5 text-brand-500" aria-hidden="true" /><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p></div>)}
      </div>
      <GatewayInstallSteps />
      <ol className="space-y-3 text-xs leading-relaxed">
        <li className="rounded-lg bg-muted/30 p-3"><strong className="text-sm">2. Add your phone and link its computer</strong><p className="mt-1 text-muted-foreground">Choose Add paired phone, give it a name and create a code. Copy the pairing command, then the start command into Terminal. Keep Terminal open. A saved phone that is offline can use Reconnect gateway; if its computer settings are lost, choose Link computer on the same card.</p></li>
        <li className="rounded-lg bg-muted/30 p-3"><strong className="flex items-center gap-2 text-sm"><KeyRound className="h-4 w-4 text-brand-500" aria-hidden="true" />3. Save the security key</strong><p className="mt-1 text-muted-foreground">Open Phone setup on the phone card. Hold the BOOT button on the USB bridge, choose Save security key, and release BOOT after success. This lets your CRM authorize calls. Normal reconnects keep the saved key.</p></li>
        <li className="rounded-lg bg-muted/30 p-3"><strong className="flex items-center gap-2 text-sm"><Bluetooth className="h-4 w-4 text-brand-500" aria-hidden="true" />4. Connect Android Bluetooth</strong><p className="mt-1 text-muted-foreground">Choose Pair a new phone. On Android, open Bluetooth settings, select the Updata Phone Bridge name shown on the card, and allow Phone calls. Then choose Connect phone in CRM. Pairing stays available for two minutes.</p></li>
        <li className="rounded-lg bg-muted/30 p-3"><strong className="flex items-center gap-2 text-sm"><Headphones className="h-4 w-4 text-brand-500" aria-hidden="true" />5. Check that both sides can hear</strong><p className="mt-1 text-muted-foreground">Open Sound &amp; test call and enter a second phone number you own, with its country code (for example +923001234567). Answer that phone and speak to the AI. After a successful test, choose Verify call audio and confirm both checks. Your phone is ready when all five checks pass.</p></li>
      </ol>
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed"><strong>Still offline?</strong> Check that the gateway is running on the computer attached to your bridge. If USB is missing, try a data cable and another USB port. If Bluetooth is missing, turn on Phone calls for the bridge in Android settings. If the gateway download or AI service is missing, ask your CRM administrator to finish installation.</div>
      <details className="text-xs"><summary className="cursor-pointer font-medium">Help for your installer</summary><p className="mt-2 leading-relaxed text-muted-foreground">Gateway requires Node.js 20+ and Updata firmware on a classic ESP32-WROOM-32. First firmware installation needs the installer’s verified image and board backup. The gateway package contains the computer program; it does not install bridge firmware. Pair against <code className="break-all">{apiBase}</code>. Use gateway 0.4.0+ for separate phone profiles. For macOS login startup, copy the service command in the phone’s Reconnect gateway panel. Linux and Windows users should keep the gateway Terminal open.</p></details>
    </section>}
  </div>;
}

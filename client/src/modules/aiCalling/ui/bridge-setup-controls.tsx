'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bluetooth, ChevronDown, Copy, Headphones, HelpCircle, KeyRound, Loader2, PlugZap, RefreshCw, Settings2, Unplug, Volume2 } from 'lucide-react';
import { pairedPhoneApi } from '../services/paired-phone-api';
import { pairedKeys } from '../hooks/use-paired-phone';
import { pairedPhoneConnection } from '../paired-phone-connection';
import type { BridgeAudioTest, PairedDevice, SetupAction } from '../types/ai-calling-types';

const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50';
const errorMessage = (e: unknown) => (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error?.message || (e as Error)?.message || 'Request failed. Check the gateway and try again.';

export function BridgeSetupControls({ device: d, now, onVerifyAudio }: { device: PairedDevice; now: number; onVerifyAudio?: () => void }) {
  const qc = useQueryClient();
  const [gainOverride, setGain] = useState<number | null>(null);
  const gain = gainOverride ?? d.setup?.playbackGainDb ?? 0;
  const [reconnect, setReconnect] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [gatewayHelp, setGatewayHelp] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const changed = () => qc.invalidateQueries({ queryKey: pairedKeys.devices });
  const action = useMutation({ mutationFn: (kind: SetupAction) => pairedPhoneApi.setupAction(d.id, kind), onSuccess: changed });
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
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <button className={`${button} border-transparent bg-brand-600 text-white hover:bg-brand-700`} disabled={connection.gatewayOnline ? disabled : false} onClick={() => connection.gatewayOnline ? action.mutate(connection.phone === 'connected' ? 'status' : 'connect_phone') : setGatewayHelp(!gatewayHelp)}>
        {connection.gatewayOnline && busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlugZap className="h-4 w-4" aria-hidden="true" />}
        {!connection.gatewayOnline ? 'Reconnect gateway' : busy ? activeCommand ? actionLabels[command.action] + '…' : 'Please wait…' : connection.phone === 'connected' ? 'Check connection' : 'Connect phone'}
      </button>
      {!keyReady && <button className={button} onClick={() => setSetupOpen(true)}><KeyRound className="h-4 w-4" aria-hidden="true" />Finish setup</button>}
      <button className={button} onClick={() => setSetupOpen(!setupOpen)} aria-expanded={setupOpen}><Settings2 className="h-4 w-4" aria-hidden="true" />Phone setup<ChevronDown className={`h-3.5 w-3.5 transition-transform ${setupOpen ? 'rotate-180' : ''}`} aria-hidden="true" /></button>
      <button className={button} onClick={() => setSoundOpen(!soundOpen)} aria-expanded={soundOpen}><Volume2 className="h-4 w-4" aria-hidden="true" />Sound & test call<ChevronDown className={`h-3.5 w-3.5 transition-transform ${soundOpen ? 'rotate-180' : ''}`} aria-hidden="true" /></button>
    </div>
    {gatewayHelp && !connection.gatewayOnline && <section aria-label="Reconnect computer gateway" className="space-y-3 rounded-xl border border-brand-500/25 bg-brand-500/5 p-4">
      <h4 className="text-sm font-semibold">Reconnect this computer</h4>
      <p className="text-xs leading-relaxed text-muted-foreground">Keep the ESP32 plugged in. Open Terminal in your installed Updata gateway folder and run the command below. Keep that Terminal open while using your phone bridge.</p>
      <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-background p-3"><code className="min-w-0 flex-1 break-all text-xs">node bin/updata-gateway.mjs run</code><button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Copy gateway start command" onClick={async () => { try { await navigator.clipboard.writeText('node bin/updata-gateway.mjs run'); setCopyStatus('Command copied.'); } catch { setCopyStatus('Select and copy the command above.'); } }}><Copy className="size-4" aria-hidden="true" /></button></div>
      {copyStatus && <p role="status" className="text-xs text-muted-foreground">{copyStatus}</p>}
      <button type="button" className={button} onClick={() => void changed()}><RefreshCw className="size-4" aria-hidden="true" />Check gateway status</button>
      <p className="text-xs leading-relaxed text-muted-foreground">Your saved security key and phone pairing are kept. On macOS, the Setup guide also explains how to start the gateway automatically at login.</p>
    </section>}
    {busy && !activeCommand && <p className="text-xs text-muted-foreground">A call or connection request is in progress. These controls will be available when it finishes.</p>}
    {!supported && <p className="text-xs text-amber-600">Install gateway 0.3.0 or newer using Setup guide to enable these controls.</p>}
    {!connection.gatewayOnline && <p className="text-xs text-muted-foreground">Open the Updata gateway on the computer plugged into your bridge. Then choose Connect phone here. Setup guide explains the first installation.</p>}
    {activeCommand && <p role="status" className="text-xs" aria-live="polite">{actionLabels[command.action]}… {command.action === 'provision_key' ? 'Keep holding BOOT until the key is saved.' : 'Waiting for the computer to confirm. Your connection status will update automatically.'}</p>}
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

export function BridgeSetupGuide({ apiBase }: { apiBase: string }) {
  const [open, setOpen] = useState(false);
  const download = useMutation({ mutationFn: pairedPhoneApi.downloadGateway, onSuccess: blob => {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'updata-phone-gateway.tgz'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } });
  return <div><button className={button} onClick={() => setOpen(!open)} aria-expanded={open}><HelpCircle className="h-4 w-4" aria-hidden="true" />Setup guide<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" /></button>
    {open && <section aria-label="Phone bridge setup guide" className="mt-3 space-y-3 rounded-xl border border-border p-4 text-sm">
      <h3 className="font-semibold">Set up your own phone bridge</h3>
      <p>Each user pairs their own computer and phone. Your device and controls remain private to your CRM account. You need AI Calling write permission; a CRM administrator can assign it.</p>
      <ol className="list-decimal space-y-3 pl-5 text-xs">
        <li>Use a classic ESP32-WROOM-32 with Updata HFP firmware and a USB data cable. A first firmware installation is a separate local operation with image/layout verification and a backup. Routine CRM setup never erases or flashes the board.</li>
        <li>Install Node.js 20 or newer once. <button className={button} disabled={download.isPending} onClick={() => download.mutate()}>Download gateway</button> Extract it into a permanent folder, open Terminal in the extracted package folder and run <code>npm ci --omit=dev</code>.</li>
        <li>Choose Add paired phone, create your one-use code, and copy the pairing command. It must use your configured API URL: <code className="break-all">{apiBase}</code>.</li>
        <li>Run <code>node bin/updata-gateway.mjs run</code>. Open Phone setup in the device card and choose Save security key while holding BOOT. Release BOOT after success. You do not need a new key for reconnecting.</li>
        <li>Choose Pair a new phone in Phone setup, pair Android with the displayed bridge name and enable Phone calls. Choose the default calling SIM in Android, then Connect phone.</li>
        <li>Open Sound &amp; test call to adjust the AI voice volume and call your own second phone. Confirm both directions using Verify call audio.</li>
      </ol>
      <details><summary className="cursor-pointer font-medium">Start automatically at login</summary><p className="mt-2 text-xs">On macOS, stop the foreground gateway with Ctrl-C once, then run <code>node bin/updata-gateway.mjs service install</code>. Check it with <code>node bin/updata-gateway.mjs service status</code>. Keep the package folder in place. Removing the service preserves your pairing: <code>node bin/updata-gateway.mjs service uninstall</code>. On Linux and Windows, keep the foreground gateway running; automatic service installation is not yet supported there.</p></details>
      {download.isError && <p role="alert" className="text-xs text-rose-600">{errorMessage(download.error)}</p>}
    </section>}
  </div>;
}

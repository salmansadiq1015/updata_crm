'use client';

import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  AlertTriangle, BatteryMedium, Bluetooth, Check, CircleDashed, Copy, Cpu, KeyRound, Laptop, Loader2, Mic, Plus,
  RotateCw, Settings2, ShieldOff, Smartphone, X,
} from 'lucide-react';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { resolveApiUrl } from '@/lib/api/config';
import { showSuccess } from '@/lib/toast';
import { usePairedDeviceMutations, usePairedDevices } from '../hooks/use-paired-phone';
import type { DeviceLimits, PairedDevice } from '../types/ai-calling-types';

const ConfirmDialog = ConfirmDialogRaw as (props: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  confirmText?: string; cancelText?: string; variant?: string; isLoading?: boolean; onConfirm: () => void;
}) => ReactElement;

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';
const btn = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-60';

const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function gatewayApiBase() {
  const api = resolveApiUrl();
  return api.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${api}` : api;
}

/** Setup checklist derived only from what the gateway actually reported. */
export function deviceChecklist(d: PairedDevice) {
  const inCall = Boolean(d.state.call || d.state.callsetup);
  return [
    { key: 'gateway', label: 'Laptop gateway online', ok: d.online, detail: d.online ? `${d.gateway.platform || ''} · v${d.gateway.version || '?'} · seen ${ago(d.lastHeartbeatAt)}` : `last seen ${ago(d.lastHeartbeatAt)}`, icon: Laptop },
    { key: 'board', label: 'ESP32 board connected', ok: d.online && d.board.connected, detail: d.board.firmware ? `firmware ${d.board.firmware} · ESP-IDF ${d.board.idf || '?'}` : 'plug the board into the laptop', icon: Cpu },
    { key: 'key', label: 'Dial key provisioned', ok: d.keyState === 'provisioned' && d.board.keyProvisioned, detail: d.keyState === 'provisioned' ? 'only the CRM can authorize calls' : 'run: updata-gateway provision (hold BOOT)', icon: KeyRound },
    { key: 'phone', label: 'Phone connected (hands-free)', ok: d.online && d.board.connected && d.state.hfp === 'slc', detail: d.state.hfp === 'slc' ? `${d.state.peer || 'phone'}${d.state.signal != null ? ` · signal ${d.state.signal}/5` : ''}${d.state.battery != null ? ` · battery ${d.state.battery}/5` : ''}` : `Bluetooth: ${d.state.hfp}`, icon: Bluetooth },
    { key: 'audio', label: 'Two-way call audio verified', ok: d.audioVerified, detail: d.audioVerified ? `verified ${ago(d.audioVerifiedAt)}${d.audioVerification?.firmware ? ` on firmware ${d.audioVerification.firmware}` : ''}` : 'run the audio test call, then confirm it here', icon: Mic },
    ...(inCall ? [{ key: 'call', label: 'Phone is in a call', ok: true, detail: d.state.audio === 'on' ? 'call audio flowing' : 'no call audio yet', icon: Smartphone }] : []),
  ];
}

export function PairedPhonesPanel() {
  const { data: devices, isLoading, isError, refetch } = usePairedDevices();
  const [adding, setAdding] = useState(false);
  const visible = (devices ?? []).filter((d) => !d.revoked);
  const revoked = (devices ?? []).filter((d) => d.revoked);
  return (
    <section aria-labelledby="paired-phones-title" className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id="paired-phones-title" className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="h-4 w-4 text-brand-500" aria-hidden="true" /> Paired phones</h2>
          <p className="text-xs text-muted-foreground">Your Android phone and SIM, reached through an ESP32 Bluetooth bridge on your laptop.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
          <Plus className="h-3.5 w-3.5" /> Add paired phone
        </button>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center p-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Paired phones could not be loaded.
            <button type="button" onClick={() => refetch()} className="font-semibold text-brand-500 hover:underline">Try again</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <Smartphone className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">No paired phone yet</p>
            <p className="max-w-md text-xs text-muted-foreground">Plug a classic ESP32-WROOM-32 board into your laptop, pair it with your phone over Bluetooth, and the AI can call leads from your own SIM.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {visible.map((d) => <li key={d.id}><DeviceCard device={d} /></li>)}
          </ul>
        )}
        {revoked.length ? <p className="mt-3 text-xs text-muted-foreground">{revoked.length} revoked device{revoked.length > 1 ? 's' : ''} hidden.</p> : null}
      </div>
      {adding ? <AddDeviceDialog onClose={() => setAdding(false)} existingIds={(devices ?? []).map((d) => d.id)} /> : null}
    </section>
  );
}

function StatusDot({ ok, pending = false }: { ok: boolean; pending?: boolean }) {
  if (ok) return <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label="done" />;
  if (pending) return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="waiting" />;
  return <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="not yet" />;
}

function DeviceCard({ device: d }: { device: PairedDevice }) {
  const m = usePairedDeviceMutations();
  const [dialog, setDialog] = useState<null | 'verify' | 'limits' | 'revoke' | 'rotate' | 'clear'>(null);
  const checks = deviceChecklist(d);
  const inCall = Boolean(d.currentCallId);
  const headline = !d.online ? { text: 'Offline', cls: 'bg-muted text-muted-foreground' }
    : d.attention ? { text: 'Needs attention', cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' }
      : inCall ? { text: d.state.audio === 'on' ? 'In call · audio live' : 'In call', cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' }
        : d.readiness.ok ? { text: 'Ready to call', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
          : { text: 'Not ready', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' };
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:p-4" aria-label={`Paired phone ${d.name}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{d.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{d.phoneLabel || 'Android phone'}{d.board.bdaddr ? ` · bridge ${d.board.bdaddr}` : ''}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${headline.cls}`} role="status">{headline.text}</span>
      </header>

      {d.attention ? (
        <div className="flex flex-col gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-xs sm:flex-row sm:items-center">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
          <span className="flex-1">{d.attention.reason}</span>
          <button type="button" onClick={() => setDialog('clear')} className={`${btn} border border-rose-500/40 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300`}>Phone checked · clear</button>
        </div>
      ) : null}

      <ul className="space-y-1.5" aria-label="Setup checks">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-xs">
            <StatusDot ok={c.ok} />
            <span className="min-w-0">
              <span className={c.ok ? 'font-medium' : 'font-medium text-muted-foreground'}>{c.label}</span>
              <span className="block break-words text-muted-foreground">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      {!d.readiness.ok && d.online && !d.attention ? (
        <p className="rounded-lg bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Waiting: </span>{d.readiness.messages.join(' · ')}
        </p>
      ) : null}
      {d.lastError ? <p className="text-xs text-amber-700 dark:text-amber-400">Last error ({ago(d.lastError.at)}): {d.lastError.message || d.lastError.code}</p> : null}

      <dl className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">This hour</dt><dd className="font-semibold tabular-nums">{d.usage?.callsLastHour ?? 0}/{d.limits.maxCallsPerHour}</dd></div>
        <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">Today</dt><dd className="font-semibold tabular-nums">{d.usage?.callsToday ?? 0}/{d.limits.maxCallsPerDay}</dd></div>
        <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">Cooldown</dt><dd className="font-semibold tabular-nums">{d.limits.cooldownSeconds}s</dd></div>
      </dl>

      <div className="mt-auto flex flex-wrap gap-2">
        {!d.audioVerified ? (
          <button type="button" onClick={() => setDialog('verify')} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}><Mic className="h-3.5 w-3.5" /> Verify call audio</button>
        ) : null}
        <button type="button" onClick={() => setDialog('limits')} className={`${btn} border border-border hover:bg-muted`}><Settings2 className="h-3.5 w-3.5" /> Limits</button>
        <button type="button" onClick={() => setDialog('rotate')} disabled={inCall} className={`${btn} border border-border hover:bg-muted`}><RotateCw className="h-3.5 w-3.5" /> New dial key</button>
        <button type="button" onClick={() => setDialog('revoke')} className={`${btn} border border-rose-500/40 text-rose-600 hover:bg-rose-500/10`}><ShieldOff className="h-3.5 w-3.5" /> Revoke</button>
      </div>

      {dialog === 'verify' ? <VerifyAudioDialog device={d} onClose={() => setDialog(null)} /> : null}
      {dialog === 'limits' ? <LimitsDialog device={d} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog
        open={dialog === 'revoke'} onOpenChange={(v) => setDialog(v ? 'revoke' : null)}
        title={`Revoke ${d.name}?`}
        description="The laptop gateway is disconnected immediately and campaigns using this phone stop before their next call. To use it again you pair it from scratch."
        confirmText="Revoke" cancelText="Keep" variant="destructive" isLoading={m.revoke.isPending}
        onConfirm={() => m.revoke.mutate(d.id, { onSuccess: () => setDialog(null) })}
      />
      <ConfirmDialog
        open={dialog === 'rotate'} onOpenChange={(v) => setDialog(v ? 'rotate' : null)}
        title="Issue a new dial key?"
        description="The current key stops working at once: this phone can't place calls until you run `updata-gateway provision` on the laptop while holding the ESP32's BOOT button."
        confirmText="Issue new key" cancelText="Cancel" isLoading={m.rotateKey.isPending}
        onConfirm={() => m.rotateKey.mutate(d.id, { onSuccess: () => setDialog(null) })}
      />
      <ConfirmDialog
        open={dialog === 'clear'} onOpenChange={(v) => setDialog(v ? 'clear' : null)}
        title="Did you check the phone?"
        description="A call ended without a clear result. Look at the phone, end any call by hand, and review the call in the campaign. Clearing lets the device take new calls; the uncertain call is never redialed automatically."
        confirmText="Phone is idle · clear" cancelText="Not yet" isLoading={m.clear.isPending}
        onConfirm={() => m.clear.mutate(d.id, { onSuccess: () => setDialog(null) })}
      />
    </article>
  );
}

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-card focus:outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[88vh] sm:w-[calc(100%-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border sm:shadow-theme-lg"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <DialogPrimitive.Title className="text-base font-bold">{title}</DialogPrimitive.Title>
            <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CopyBlock({ text }: { text: string }) {
  return (
    <div className="group relative">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted px-3 py-2 pr-10 font-mono text-[11px] leading-relaxed">{text}</pre>
      <button
        type="button"
        aria-label="Copy command"
        onClick={() => { navigator.clipboard?.writeText(text).then(() => showSuccess('Copied')).catch(() => {}); }}
        className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddDeviceDialog({ onClose, existingIds }: { onClose: () => void; existingIds: string[] }) {
  const m = usePairedDeviceMutations();
  const { data: devices } = usePairedDevices();
  const [name, setName] = useState('My phone bridge');
  const [phoneLabel, setPhoneLabel] = useState('');
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [known] = useState(() => new Set(existingIds));
  const created = useMemo(() => (devices ?? []).find((d) => !known.has(d.id) && !d.revoked) || null, [devices, known]);
  const api = gatewayApiBase();

  return (
    <Modal
      title="Add a paired phone"
      onClose={onClose}
      footer={code ? <button type="button" onClick={onClose} className={`${btn} border border-border hover:bg-muted`}>Done</button> : (
        <button
          type="button"
          disabled={!name.trim() || m.pairingCode.isPending}
          onClick={() => m.pairingCode.mutate({ deviceName: name.trim(), phoneLabel: phoneLabel.trim() }, { onSuccess: setCode })}
          className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}
        >
          {m.pairingCode.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Create pairing code
        </button>
      )}
    >
      {!code ? (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">You need</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>A classic <strong>ESP32-WROOM-32</strong> DevKit (CP2102 USB). ESP32-S2, S3, C3 and C6 boards do <strong>not</strong> work: they have no Classic Bluetooth.</li>
              <li>The Updata bridge firmware flashed on it, and Node.js on the laptop.</li>
              <li>Your Android phone with its SIM, paired with the board over Bluetooth with <em>Phone calls</em> on.</li>
            </ul>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-medium">Device name</span>
            <input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block"><span className="mb-1 block text-xs font-medium">Phone / SIM label (optional)</span>
            <input className={inputCls} value={phoneLabel} maxLength={80} placeholder="e.g. TECNO · Jazz SIM" onChange={(e) => setPhoneLabel(e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-3 text-center">
            <p className="text-xs text-muted-foreground">Pairing code (one use, expires {new Date(code.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</p>
            <p className="mt-1 select-all font-mono text-2xl font-bold tracking-widest" aria-label="Pairing code" role="status">{code.code}</p>
          </div>
          <ol className="space-y-3 text-xs">
            <li><p className="mb-1 font-medium">1 · Pair the laptop gateway</p>
              <CopyBlock text={`cd server/phone-gateway && npm install\nnode bin/updata-gateway.mjs pair --api ${api} --code ${code.code}`} /></li>
            <li><p className="mb-1 font-medium">2 · Write the dial key into the ESP32 (hold its BOOT button)</p>
              <CopyBlock text="node bin/updata-gateway.mjs provision" /></li>
            <li><p className="mb-1 font-medium">3 · Keep the gateway running while campaigns call</p>
              <CopyBlock text="node bin/updata-gateway.mjs run" /></li>
            <li><p className="mb-1 font-medium">4 · Run the two-way audio test once, then confirm it on the device card</p>
              <p className="text-muted-foreground">docs/paired-phone/ESP32-FIRMWARE.md §4: a call to your own second phone proves both directions.</p></li>
          </ol>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="mb-2 text-xs font-medium">Live status</p>
            {created ? (
              <ul className="space-y-1.5">
                {deviceChecklist(created).map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-xs"><StatusDot ok={c.ok} pending={!c.ok} /><span>{c.label}<span className="block text-muted-foreground">{c.detail}</span></span></li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for the gateway to pair…</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function VerifyAudioDialog({ device, onClose }: { device: PairedDevice; onClose: () => void }) {
  const m = usePairedDeviceMutations();
  const [inbound, setInbound] = useState(false);
  const [outbound, setOutbound] = useState(false);
  const [note, setNote] = useState('');
  return (
    <Modal
      title="Verify two-way call audio"
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className={`${btn} border border-border hover:bg-muted`}>Cancel</button>
          <button
            type="button"
            disabled={!inbound || !outbound || m.verifyAudio.isPending}
            onClick={() => m.verifyAudio.mutate({ id: device.id, inboundPhraseHeard: inbound, outboundPhraseHeard: outbound, note }, { onSuccess: onClose })}
            className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}
          >
            {m.verifyAudio.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirm verified
          </button>
        </>
      )}
    >
      <div className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          Campaigns can only use this phone after a real call has carried speech in <strong>both</strong> directions. Run the probe from the laptop to a phone you own:
        </p>
        <CopyBlock text={'node bin/esp32-probe.mjs call --port <port> --number <your second phone> --i-own-this-number \\\n  --prompt prompts/prompt-en.wav --out evidence/audio-check'} />
        <p className="text-xs text-muted-foreground">
          The person answering says <em>“the blue whale crosses the river”</em>, then repeats the phrase the AI asks for. Transcribe <code>remote.wav</code> with <code>tools/audio-evidence.mjs</code>.
        </p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={inbound} onChange={(e) => setInbound(e.target.checked)} />
          <span>The remote person&apos;s phrase is in the <code>remote.wav</code> transcript (phone → AI works).</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={outbound} onChange={(e) => setOutbound(e.target.checked)} />
          <span>They heard the AI prompt clearly and repeated its phrase (AI → phone works).</span></label>
        <label className="block"><span className="mb-1 block text-xs font-medium">Evidence note (where the files are, who answered)</span>
          <textarea className={inputCls} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">Recorded with firmware {device.board.firmware || 'unknown'}. A firmware change asks for a new check.</p>
      </div>
    </Modal>
  );
}

function LimitsDialog({ device, onClose }: { device: PairedDevice; onClose: () => void }) {
  const m = usePairedDeviceMutations();
  const [limits, setLimits] = useState<DeviceLimits>({ ...device.limits });
  const field = (key: keyof DeviceLimits, label: string, min: number, max: number, hint: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium">{label}</span>
      <input type="number" className={inputCls} min={min} max={max} value={limits[key]}
        onChange={(e) => setLimits({ ...limits, [key]: Number(e.target.value) })}
        onBlur={() => setLimits((l) => ({ ...l, [key]: Math.min(max, Math.max(min, Math.round(Number(l[key]) || min))) }))} />
      <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>
    </label>
  );
  return (
    <Modal
      title={`Limits · ${device.name}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className={`${btn} border border-border hover:bg-muted`}>Cancel</button>
          <button type="button" disabled={m.update.isPending} onClick={() => m.update.mutate({ id: device.id, limits }, { onSuccess: onClose })} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
            {m.update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
          </button>
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field('cooldownSeconds', 'Pause between calls (s)', 20, 3600, 'Gives the phone and the SIM a rest.')}
        {field('ringTimeoutSeconds', 'Ring for (s)', 15, 90, 'Then the call counts as not answered.')}
        {field('maxCallsPerHour', 'Calls per hour', 1, 30, 'The ESP32 also enforces 30/hour itself.')}
        {field('maxCallsPerDay', 'Calls per day', 1, 500, 'Check your SIM plan and local rules.')}
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground"><BatteryMedium className="h-4 w-4 shrink-0" aria-hidden="true" /> A personal SIM is not a call-centre line: keep limits conservative and respect carrier terms and calling rules.</p>
    </Modal>
  );
}

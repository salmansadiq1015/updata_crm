'use client';

import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  AlertTriangle, BatteryMedium, Bluetooth, Check, ChevronDown, CircleDashed, Copy, Cpu, Info, KeyRound, Laptop, Loader2, Mic, Plus,
  RotateCw, Settings2, ShieldOff, Smartphone, X,
} from 'lucide-react';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { resolveApiUrl } from '@/lib/api/config';
import { showSuccess } from '@/lib/toast';
import { usePairedDeviceMutations, usePairedDevices } from '../hooks/use-paired-phone';
import { pairedPhoneConnection } from '../paired-phone-connection';
import type { DeviceLimits, PairedDevice } from '../types/ai-calling-types';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { BridgeSetupControls, BridgeSetupGuide } from './bridge-setup-controls';

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
export function deviceChecklist(d: PairedDevice, now = Date.now()) {
  const connection = pairedPhoneConnection(d, now);
  const inCall = connection.gatewayOnline && Boolean(d.state.call || d.state.callsetup);
  return [
    { key: 'gateway', label: 'Laptop gateway online', ok: connection.gatewayOnline, detail: connection.gatewayOnline ? `${d.gateway.platform || ''} · v${d.gateway.version || '?'} · seen ${ago(d.lastHeartbeatAt)}` : `last seen ${ago(d.lastHeartbeatAt)}`, icon: Laptop },
    { key: 'board', label: 'ESP32 board connected', ok: connection.board === 'connected', detail: d.board.firmware ? `firmware ${d.board.firmware} · ESP-IDF ${d.board.idf || '?'}` : 'plug the board into the laptop', icon: Cpu },
    { key: 'key', label: 'Calling security key saved', ok: d.keyState === 'provisioned' && d.board.keyProvisioned, detail: d.keyState === 'provisioned' && d.board.keyProvisioned ? 'Only your CRM account can authorize calls.' : 'Choose Finish setup, then hold BOOT while saving the security key.', icon: KeyRound },
    { key: 'phone', label: 'Phone connected (hands-free)', ok: connection.phone === 'connected', detail: connection.phone === 'connected' ? `${d.state.peer || 'phone'}${d.state.signal != null ? ` · signal ${d.state.signal}/5` : ''}${d.state.battery != null ? ` · battery ${d.state.battery}/5` : ''}` : connection.phone === 'unknown' ? 'awaiting a current gateway and board report' : `Bluetooth: ${d.state.hfp}`, icon: Bluetooth },
    { key: 'audio', label: 'Two-way call audio verified', ok: d.audioVerified, detail: d.audioVerified ? `verified ${ago(d.audioVerifiedAt)}${d.audioVerification?.firmware ? ` on firmware ${d.audioVerification.firmware}` : ''}` : 'run the audio test call, then confirm it here', icon: Mic },
    ...(inCall ? [{ key: 'call', label: 'Phone is in a call', ok: true, detail: d.state.audio === 'on' ? 'audio link open' : 'no call audio yet', icon: Smartphone }] : []),
  ];
}

export function PairedPhonesPanel() {
  const { hasPermission, isAdmin } = usePermissions();
  const canManage = isAdmin || ['ai-calling:write', 'ai-calling:admin', 'crm:write', 'crm:admin'].some(hasPermission);
  const { data: devices, isLoading, isFetching, isError, refetch } = usePairedDevices();
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const visible = (devices ?? []).filter((d) => !d.revoked);
  const revoked = (devices ?? []).filter((d) => d.revoked);
  return (
    <section aria-labelledby="paired-phones-title" className="rounded-2xl border border-blue-400/15 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id="paired-phones-title" className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="h-4 w-4 text-brand-500" aria-hidden="true" /> Paired phones</h2>
          <p className="mt-1 text-xs text-muted-foreground">Connect your Android phone to make calls from its SIM.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh bridge status" className={`${btn} border border-border text-muted-foreground hover:bg-muted`}>
          <RotateCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <button type="button" disabled={!canManage} onClick={() => setAdding(true)} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
          <Plus className="h-3.5 w-3.5" /> Add paired phone
        </button>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-3"><BridgeSetupGuide apiBase={gatewayApiBase()} /></div>
        {!canManage && <p className="mb-3 text-xs text-muted-foreground">Your role can view bridge status. Ask an administrator for AI Calling write permission to set up your own device.</p>}
        {isLoading ? (
          <div className="flex justify-center p-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Paired phones could not be loaded.
            <button type="button" onClick={() => refetch()} className="font-semibold text-brand-500 hover:underline">Try again</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <ConnectionTile label="ESP32 USB" value="Not linked to CRM" detail="Add this laptop gateway to report the board connection." icon={Cpu} />
              <ConnectionTile label="Phone Bluetooth" value="Waiting for gateway" detail="Link this Mac to display your phone's Bluetooth connection." icon={Bluetooth} />
            </div>
            <p className="text-sm font-medium">No paired phone yet</p>
            <p className="text-xs text-muted-foreground">Choose Add paired phone to generate a code and link this Mac. The ESP32 connects to the Mac by USB; your Android phone connects to the ESP32 by Bluetooth.</p>
          </div>
        ) : (
          <ul className={`grid grid-cols-1 gap-3 ${visible.length > 1 ? 'xl:grid-cols-2' : ''}`}>
            {visible.map((d) => <li key={d.id}><DeviceCard device={d} now={now} canManage={canManage} /></li>)}
          </ul>
        )}
        {revoked.length ? <p className="mt-3 text-xs text-muted-foreground">{revoked.length} revoked device{revoked.length > 1 ? 's' : ''} hidden.</p> : null}
      </div>
      {adding ? <AddDeviceDialog onClose={() => setAdding(false)} existingIds={(devices ?? []).map((d) => d.id)} /> : null}
    </section>
  );
}

function ConnectionTile({ label, value, detail, icon: Icon, connected = false }: {
  label: string; value: string; detail: string; icon: typeof Cpu; connected?: boolean;
}) {
  return (
    <div role="group" aria-label={`${label}: ${value}`} className={`min-w-0 rounded-xl border p-3 ${connected ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-muted/20'}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${connected ? 'text-emerald-400' : ''}`} aria-hidden="true" />{label}</div>
      <p aria-live="polite" className={`mt-1.5 text-sm font-semibold ${connected ? 'text-emerald-500 dark:text-emerald-300' : ''}`}>{value}</p>
      <p className="mt-1 break-words text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatusDot({ ok, pending = false }: { ok: boolean; pending?: boolean }) {
  if (ok) return <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label="done" />;
  if (pending) return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="waiting" />;
  return <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="not yet" />;
}

function DeviceCard({ device: d, now, canManage }: { device: PairedDevice; now: number; canManage: boolean }) {
  const [showMore, setShowMore] = useState(false);
  const setupActive = Boolean(d.setup?.command && ['pending', 'running'].includes(d.setup.command.state) && new Date(d.setup.command.expiresAt).getTime() > now);
  const m = usePairedDeviceMutations();
  const [dialog, setDialog] = useState<null | 'verify' | 'limits' | 'revoke' | 'rotate' | 'clear'>(null);
  const checks = deviceChecklist(d, now);
  const connection = pairedPhoneConnection(d, now);
  const inCall = Boolean(d.currentCallId || d.state.call || d.state.callsetup);
  const keyReady = d.keyState === 'provisioned' && d.board.keyProvisioned;
  const nextStep = !connection.gatewayOnline
    ? { title: 'Open the gateway on your computer', detail: 'The gateway is the small Updata program that links your USB bridge to this website. See Setup guide if it is not installed.' }
    : connection.board !== 'connected'
      ? { title: connection.board === 'fault' ? 'The USB bridge needs attention' : 'Reconnect the USB bridge', detail: 'Keep the bridge plugged into your computer, then choose Connect phone. If that fails, unplug and reconnect its USB cable. Your phone may still show Bluetooth connected while the computer cannot check it.' }
      : connection.phone !== 'connected'
        ? { title: 'Connect your phone', detail: 'Turn on Bluetooth on Android, then choose Connect phone. For first-time pairing, open Phone setup.' }
        : !keyReady
          ? { title: 'One security step left', detail: 'Your phone is connected. Choose Finish setup to save the security key that allows calls from your CRM account. Reconnecting does not need a new key.' }
          : !d.audioVerified
            ? { title: 'Check the call sound', detail: 'Open Sound & test call to call your own second phone. After you hear both sides clearly, confirm the sound check.' }
            : d.readiness.ok ? { title: 'Your phone is ready for CRM calls', detail: 'Keep Bluetooth on, the USB bridge plugged in, and the gateway running on your computer.' }
              : { title: inCall ? 'Your phone is handling a call' : 'Connected · calls are waiting', detail: d.readiness.reasons.includes('cooldown') ? 'A short pause between calls is in progress. Calling resumes automatically.' : d.readiness.reasons.some(r => ['hourly_cap', 'daily_cap'].includes(r)) ? 'Your call limit has been reached. Open Show more to review the limits.' : 'Open Show more for the current calling checks.' };
  const headline = !connection.gatewayOnline ? { text: 'Offline', cls: 'bg-muted text-muted-foreground' }
    : d.attention ? { text: 'Needs attention', cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' }
      : inCall ? { text: 'In call', cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' }
        : d.readiness.ok ? { text: 'Ready to call', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
          : { text: 'Not ready', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' };
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:p-4" aria-label={`Paired phone ${d.name}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{d.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{d.phoneLabel || 'Android phone'}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${headline.cls}`} role="status">{headline.text}</span>
      </header>

      <div className="grid gap-2 sm:grid-cols-3">
        <ConnectionTile label="Computer" value={connection.gatewayOnline ? 'Online' : 'Offline'}
          detail={connection.gatewayOnline ? 'Updata gateway is running.' : 'Open the Updata gateway on your computer.'} icon={Laptop} connected={connection.gatewayOnline} />
        <ConnectionTile label="ESP32 USB"
          value={connection.board === 'connected' ? 'Connected' : connection.board === 'fault' ? 'Needs attention' : connection.board === 'disconnected' ? 'Not reachable' : 'Cannot check yet'}
          detail={connection.board === 'connected' ? 'Computer is communicating with your bridge.' : connection.board === 'fault' ? 'Open Show more for the bridge report.' : connection.board === 'disconnected' ? 'Check the USB cable, then choose Connect phone.' : 'Waiting for your computer to come online.'}
          icon={Cpu} connected={connection.board === 'connected'} />
        <ConnectionTile label="Phone Bluetooth"
          value={connection.phone === 'connected' ? 'Connected' : connection.phone === 'connecting' ? 'Connecting…' : connection.phone === 'disconnected' ? 'Not connected' : 'Cannot check yet'}
          detail={connection.phone === 'connected' ? 'Phone calling connection confirmed by the bridge.' : connection.phone === 'connecting' ? 'Waiting for Android to enable phone calls.' : connection.phone === 'disconnected' ? 'Turn on phone Bluetooth, then choose Connect phone.' : 'Your phone may be connected. Restore the computer link to confirm.'}
          icon={Bluetooth} connected={connection.phone === 'connected'} />
      </div>

      {!d.attention && <div className="flex items-start gap-2.5 rounded-lg bg-muted/40 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
        <div><p className="text-sm font-medium">{nextStep.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{nextStep.detail}</p></div>
      </div>}
      {canManage && <BridgeSetupControls device={d} now={now} onVerifyAudio={() => setDialog('verify')} />}

      {d.attention ? (
        <div className="flex flex-col gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-xs sm:flex-row sm:items-center">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
          <span className="flex-1">{d.attention.reason}</span>
          <button type="button" onClick={() => setDialog('clear')} className={`${btn} border border-rose-500/40 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300`}>Phone checked · clear</button>
        </div>
      ) : null}

      <div className="border-t border-border pt-3">
        <button type="button" onClick={() => setShowMore(!showMore)} aria-expanded={showMore} className={`${btn} text-muted-foreground hover:bg-muted`}><Info className="h-4 w-4" aria-hidden="true" />{showMore ? 'Show less' : 'Show more'}<ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} aria-hidden="true" /></button>
      {showMore && <section aria-label="Bridge details" className="mt-3 space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Setup checks">
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
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">USB port</dt><dd className="break-all">{d.board.port || 'Not reported'}</dd></div>
        <div><dt className="text-muted-foreground">Bluetooth name</dt><dd>{d.board.bdaddr ? `Updata Phone Bridge ${d.board.bdaddr.replaceAll(':', '').slice(-4)}` : 'Not reported'}</dd></div>
        <div><dt className="text-muted-foreground">Bridge address</dt><dd>{d.board.bdaddr || 'Not reported'}</dd></div>
        <div><dt className="text-muted-foreground">Last computer report</dt><dd>{ago(d.lastHeartbeatAt)}</dd></div>
      </dl>

      {!d.readiness.ok && connection.gatewayOnline && !d.attention ? (
        <p className="rounded-lg bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Waiting: </span>{d.readiness.messages.join(' · ')}
        </p>
      ) : null}
      {d.lastError ? <p className="break-words text-xs text-amber-700 dark:text-amber-400">Last diagnostic ({ago(d.lastError.at)}): {d.lastError.message || d.lastError.code}</p> : null}

      <dl className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">This hour</dt><dd className="font-semibold tabular-nums">{d.usage?.callsLastHour ?? 0}/{d.limits.maxCallsPerHour}</dd></div>
        <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">Today</dt><dd className="font-semibold tabular-nums">{d.usage?.callsToday ?? 0}/{d.limits.maxCallsPerDay}</dd></div>
        <div className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">Cooldown</dt><dd className="font-semibold tabular-nums">{d.limits.cooldownSeconds}s</dd></div>
      </dl>

      <div className="mt-auto flex flex-wrap gap-2">
        <button type="button" disabled={!canManage} onClick={() => setDialog('limits')} className={`${btn} border border-border hover:bg-muted`}><Settings2 className="h-3.5 w-3.5" /> Limits</button>
        <button type="button" disabled={!canManage} onClick={() => setDialog('revoke')} className={`${btn} border border-rose-500/40 text-rose-600 hover:bg-rose-500/10`}><ShieldOff className="h-3.5 w-3.5" /> Revoke</button>
      </div>
      {canManage && <details className="text-xs"><summary className="cursor-pointer font-medium text-muted-foreground">Advanced security · replace dial key</summary>
        <p className="my-2 text-muted-foreground">Keep the existing key for normal USB or Bluetooth reconnection. Replacing it stops calls until the new key is written while holding BOOT.</p>
        {d.keyState === 'pending' ? <p className="text-amber-600">A new key is waiting. Choose Finish setup → Save security key while holding BOOT; you do not need another key or a reboot.</p> : <button type="button" onClick={() => setDialog('rotate')} disabled={inCall || setupActive} className={`${btn} border border-border hover:bg-muted`}><RotateCw className="h-3.5 w-3.5" /> New dial key</button>}
      </details>}
      </section>}
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
        description="Use this only to replace a lost or compromised key. Routine reconnects keep the existing key. Replacing it stops calls until you choose Finish setup → Save security key while holding BOOT. Firmware and Bluetooth pairing are preserved."
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
              <CopyBlock text={`# Run inside the extracted gateway package folder\nnode bin/updata-gateway.mjs pair --api '${api.replaceAll("'", "'\\''")}' --code ${code.code}`} /></li>
            <li><p className="mb-1 font-medium">2 · Keep the gateway running</p>
              <CopyBlock text="node bin/updata-gateway.mjs run" /></li>
            <li><p className="mb-1 font-medium">3 · Finish setup with the device card buttons</p><p className="text-muted-foreground">Open Phone setup. Choose Save security key while holding BOOT, then Pair a new phone and Connect phone. Routine reconnects do not need BOOT or a new key.</p></li>
            <li><p className="mb-1 font-medium">4 · Run Two-way audio test, then Verify call audio</p><p className="text-muted-foreground">Use your own second phone and confirm the AI voice and your spoken test phrase. Setup guide includes automatic startup on macOS.</p></li>
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
          First, use Sound &amp; test call to call your own second phone. Only confirm these checks after you heard clear speech in <strong>both</strong> directions during that call.
        </p>
        <details className="space-y-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Technical audio check</summary>
        <CopyBlock text={'node bin/esp32-probe.mjs call --port <port> --number <your second phone> --i-own-this-number \\\n  --prompt prompts/prompt-en.wav --out evidence/audio-check'} />
        <p className="text-xs text-muted-foreground">
          The person answering says <em>“the blue whale crosses the river”</em>, then repeats the phrase the AI asks for. Transcribe <code>remote.wav</code> with <code>tools/audio-evidence.mjs</code>.
        </p>
        </details>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={inbound} onChange={(e) => setInbound(e.target.checked)} />
          <span>The AI correctly heard and understood what I said on the second phone.</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={outbound} onChange={(e) => setOutbound(e.target.checked)} />
          <span>I heard the AI voice clearly on the second phone.</span></label>
        <label className="block"><span className="mb-1 block text-xs font-medium">Notes (optional)</span>
          <textarea className={inputCls} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">Sound checked with bridge firmware {device.board.firmware || 'unknown'}. Repeat the check after a firmware update.</p>
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

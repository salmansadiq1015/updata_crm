'use client';

import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  AlertTriangle, BatteryMedium, Bluetooth, Check, ChevronDown, CircleDashed, Copy, Cpu, Info, KeyRound, Laptop, Loader2, Mic, Plus,
  Archive, ArchiveRestore, Link2, MoreHorizontal, Pencil, RotateCw, Settings2, ShieldOff, Smartphone, Trash2, X,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { resolveApiUrl } from '@/lib/api/config';
import { showSuccess } from '@/lib/toast';
import { usePairedDeviceMutations, usePairedDevices } from '../hooks/use-paired-phone';
import { pairedPhoneConnection } from '../paired-phone-connection';
import type { PhonePairingCode } from '../services/paired-phone-api';
import type { DeviceLimits, PairedDevice } from '../types/ai-calling-types';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { BridgeSetupControls, BridgeSetupGuide, GatewayInstallSteps } from './bridge-setup-controls';

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
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const active = (devices ?? []).filter((d) => !d.revoked && !d.archived);
  const archived = (devices ?? []).filter((d) => !d.revoked && d.archived);
  const visible = view === 'active' ? active : archived;
  const revoked = (devices ?? []).filter((d) => d.revoked);
  const ready = active.filter((d) => pairedPhoneConnection(d, now).phone === 'connected' && d.readiness.ok).length;
  return (
    <section aria-labelledby="paired-phones-title" className="rounded-2xl border border-blue-400/15 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id="paired-phones-title" className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="h-4 w-4 text-brand-500" aria-hidden="true" /> Paired phones</h2>
          <p className="mt-1 text-xs text-muted-foreground">Make calls from your Android SIM. Add a phone, link its computer, then complete the checks below.</p>
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
        <div className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 text-xs sm:flex sm:items-center">
          <Info className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
          <p className="min-w-0 flex-1 leading-relaxed"><strong>Adding a phone is the first step.</strong> Calls work after the computer program, USB bridge, Bluetooth and sound test are ready. Keep the computer awake and the gateway running.</p>
          {!!active.length && <span className="col-start-2 justify-self-start whitespace-nowrap rounded-full bg-background px-2.5 py-1 font-semibold">{ready} of {active.length} ready to call</span>}
        </div>
        <div className="mb-3"><BridgeSetupGuide apiBase={gatewayApiBase()} /></div>
        <div role="group" aria-label="Phone list view" className="mb-4 flex flex-wrap gap-2">
          <button type="button" aria-pressed={view === 'active'} onClick={() => setView('active')} className={`${btn} border ${view === 'active' ? 'border-brand-500/30 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-border text-muted-foreground hover:bg-muted'}`}><Smartphone className="h-4 w-4" aria-hidden="true" />Active phones ({active.length})</button>
          <button type="button" aria-pressed={view === 'archived'} onClick={() => setView('archived')} className={`${btn} border ${view === 'archived' ? 'border-brand-500/30 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-border text-muted-foreground hover:bg-muted'}`}><Archive className="h-4 w-4" aria-hidden="true" />Archived phones ({archived.length})</button>
        </div>
        {!canManage && <p className="mb-3 text-xs text-muted-foreground">Your role can view bridge status. Ask an administrator for AI Calling write permission to set up your own device.</p>}
        {isError && devices && <p role="alert" className="mb-3 text-xs text-amber-600">Could not refresh phone status. Showing the last report; check your connection and try Refresh again.</p>}
        {isLoading ? (
          <div className="flex justify-center p-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : isError && !devices ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Paired phones could not be loaded.
            <button type="button" onClick={() => refetch()} className="font-semibold text-brand-500 hover:underline">Try again</button>
          </div>
        ) : view === 'archived' ? (
          <div className="space-y-3">
            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground"><Archive className="h-4 w-4 shrink-0" aria-hidden="true" />Archived phones cannot make CRM calls. Their setup and call history are kept. Restore a phone from its three-dot menu to make it available to campaigns again.</p>
            {archived.length ? <ul className="grid gap-3 xl:grid-cols-2">{archived.map((d) => <li key={d.id}><ArchivedDeviceCard device={d} canManage={canManage} /></li>)}</ul> : <p className="py-6 text-center text-sm text-muted-foreground">No archived phones</p>}
          </div>
        ) : visible.length === 0 ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <ConnectionTile label="ESP32 USB" value="Not linked to CRM" detail="Add your phone, then link the computer connected to its USB bridge." icon={Cpu} />
              <ConnectionTile label="Phone Bluetooth" value="Waiting for gateway" detail="Link your computer to check your phone's Bluetooth connection." icon={Bluetooth} />
            </div>
            <p className="text-sm font-medium">{archived.length ? 'No active phones' : 'No paired phone yet'}</p>
            <p className="text-xs text-muted-foreground">{archived.length ? 'Restore a phone from Archived phones or choose Add paired phone to set up another.' : 'Choose Add paired phone to save your phone and get a connection code. The ESP32 bridge connects to your computer by USB; your Android phone connects to the bridge by Bluetooth.'}</p>
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

function PhoneActions({ device, onEdit, onArchive, onRestore, onDelete, blocked = false, pending = false }: {
  device: PairedDevice; onEdit: () => void; onArchive?: () => void; onRestore?: () => void; onDelete: () => void; blocked?: boolean; pending?: boolean;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${device.name}`} disabled={pending} className={`${btn} h-9 w-9 border border-border p-0 text-muted-foreground hover:bg-muted hover:text-foreground`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-44">
      <DropdownMenuItem onSelect={onEdit} aria-label={`Edit ${device.name}`} className="px-3 py-2.5"><Pencil aria-hidden="true" />Edit</DropdownMenuItem>
      {onArchive && <DropdownMenuItem onSelect={onArchive} disabled={blocked} aria-label={`Archive ${device.name}`} className="px-3 py-2.5"><Archive aria-hidden="true" />Archive</DropdownMenuItem>}
      {onRestore && <DropdownMenuItem onSelect={onRestore} aria-label={`Restore ${device.name}`} className="px-3 py-2.5"><ArchiveRestore aria-hidden="true" />Restore</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onDelete} disabled={blocked} aria-label={`Delete ${device.name}`} variant="destructive" className="px-3 py-2.5"><Trash2 aria-hidden="true" />Delete</DropdownMenuItem>
      {blocked && <p className="max-w-52 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">Finish the call or setup action and clear any phone alert before archiving or deleting.</p>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

function ArchivedDeviceCard({ device: d, canManage }: { device: PairedDevice; canManage: boolean }) {
  const m = usePairedDeviceMutations();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  return <article aria-label={`Archived phone ${d.name}`} className="space-y-3 rounded-xl border border-border bg-background p-4">
    <header className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{d.name}</h3><p className="mt-1 text-xs text-muted-foreground">{d.phoneLabel || 'Android phone'}</p></div><div className="flex shrink-0 items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground"><Archive className="h-3 w-3" aria-hidden="true" />Archived</span>{canManage && <PhoneActions device={d} onEdit={() => setDialog('edit')} onRestore={() => m.restore.mutate(d.id)} onDelete={() => setDialog('delete')} pending={m.restore.isPending || m.remove.isPending} />}</div></header>
    <p className="text-xs leading-relaxed text-muted-foreground">Setup and call history saved. Restore this phone to use it for CRM calls again.</p>
    {dialog === 'edit' && <EditDeviceDialog device={d} onClose={() => setDialog(null)} />}
    <ConfirmDialog open={dialog === 'delete'} onOpenChange={open => setDialog(open ? 'delete' : null)} title={`Delete ${d.name}?`} description="This removes the archived phone and disconnects its computer. Past call history is kept. To use this phone again after deletion, add it and complete setup again." confirmText="Delete phone" cancelText="Keep phone" variant="destructive" isLoading={m.remove.isPending} onConfirm={() => m.remove.mutate(d.id, { onSuccess: () => setDialog(null) })} />
  </article>;
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
  const [dialog, setDialog] = useState<null | 'edit' | 'archive' | 'delete' | 'link' | 'verify' | 'limits' | 'revoke' | 'rotate' | 'clear'>(null);
  const checks = deviceChecklist(d, now);
  const connection = pairedPhoneConnection(d, now);
  const inCall = Boolean(d.currentCallId || d.state.call || d.state.callsetup);
  const deletionBlocked = Boolean(d.currentCallId || d.attention || setupActive || (connection.gatewayOnline && (d.state.call || d.state.callsetup)));
  const setupChecks = checks.filter((c) => c.key !== 'call');
  const completed = setupChecks.filter((c) => c.ok).length;
  const keyReady = d.keyState === 'provisioned' && d.board.keyProvisioned;
  const nextStep = !connection.gatewayOnline
    ? { title: 'Open the gateway on your computer', detail: 'The gateway is the small Updata program that links your USB bridge to this website. See Setup guide if it is not installed.' }
    : connection.board !== 'connected'
      ? { title: connection.board === 'fault' ? 'The USB bridge needs attention' : 'Reconnect the USB bridge', detail: 'Keep the bridge plugged into your computer, then choose Connect phone. If that fails, unplug and reconnect its USB cable. Your phone may still show Bluetooth connected while the computer cannot check it.' }
      : !keyReady
        ? { title: 'One security step left', detail: 'Choose Finish setup to save the security key that allows calls from your CRM account. Hold the bridge’s BOOT button while saving. Reconnecting does not need a new key.' }
        : connection.phone !== 'connected'
          ? { title: 'Connect your phone', detail: 'Turn on Bluetooth on Android, then choose Connect phone. For first-time pairing, open Phone setup.' }
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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`mr-1 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${headline.cls}`} role="status">{headline.text}</span>
          {canManage && <PhoneActions device={d} onEdit={() => setDialog('edit')} onArchive={() => setDialog('archive')} onDelete={() => setDialog('delete')} blocked={deletionBlocked} />}
        </div>
      </header>

      <div className="rounded-lg bg-muted/30 p-3" aria-label={`Setup progress: ${completed} of 5 checks complete`}>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="font-medium">Setup progress</span><span className="text-muted-foreground">{completed}/5 checks complete</span></div>
        <div className="grid grid-cols-5 gap-1" aria-hidden="true">{setupChecks.map((c) => <div key={c.key} className={`h-1.5 rounded-full ${c.ok ? 'bg-emerald-500' : 'bg-border'}`} />)}</div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Computer → USB bridge → security key → phone Bluetooth → sound test</p>
      </div>

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

      {!d.attention && <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${d.readiness.ok && connection.gatewayOnline ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{d.readiness.ok && connection.gatewayOnline ? 'Ready' : 'Next step'}</p><p className="text-sm font-semibold">{nextStep.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{nextStep.detail}</p></div>
      </div>}
      {canManage && <BridgeSetupControls device={d} now={now} apiBase={gatewayApiBase()} onVerifyAudio={() => setDialog('verify')} />}
      {canManage && !connection.gatewayOnline && <button type="button" onClick={() => setDialog('link')} className={`${btn} self-start border border-brand-500/30 text-brand-600 hover:bg-brand-500/10 dark:text-brand-400`}><Link2 className="h-4 w-4" aria-hidden="true" />Link computer<span className="font-normal text-muted-foreground">· first setup or lost connection settings</span></button>}

      {d.attention ? (
        <div className="flex flex-col gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-xs sm:flex-row sm:items-center">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
          <span className="flex-1">{d.attention.reason}</span>
          {canManage && <button type="button" onClick={() => setDialog('clear')} className={`${btn} border border-rose-500/40 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300`}>Phone checked · clear</button>}
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
      {dialog === 'edit' ? <EditDeviceDialog device={d} onClose={() => setDialog(null)} /> : null}
      {dialog === 'link' ? <AddDeviceDialog device={d} existingIds={[d.id]} onClose={() => setDialog(null)} /> : null}
      {dialog === 'limits' ? <LimitsDialog device={d} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog open={dialog === 'archive'} onOpenChange={open => setDialog(open ? 'archive' : null)} title={`Archive ${d.name}?`} description="This moves the phone to Archived phones and stops new CRM calls from it. Its setup and call history are kept. You can restore it later from its three-dot menu." confirmText="Archive phone" cancelText="Keep active" variant="default" isLoading={m.archive.isPending} onConfirm={() => m.archive.mutate(d.id, { onSuccess: () => setDialog(null) })} />
      <ConfirmDialog
        open={dialog === 'delete'} onOpenChange={(v) => setDialog(v ? 'delete' : null)}
        title={`Delete ${d.name}?`}
        description="This removes the phone from your list and disconnects its computer. Campaigns using it cannot make more calls until you select another ready phone. Past call history is kept. To use this phone again, add and set it up again."
        confirmText="Delete phone" cancelText="Keep phone" variant="destructive" isLoading={m.remove.isPending}
        onConfirm={() => m.remove.mutate(d.id, { onSuccess: () => setDialog(null) })}
      />
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

function EditDeviceDialog({ device, onClose }: { device: PairedDevice; onClose: () => void }) {
  const m = usePairedDeviceMutations();
  const [name, setName] = useState(device.name);
  const [phoneLabel, setPhoneLabel] = useState(device.phoneLabel || '');
  const changed = name.trim() !== device.name || phoneLabel.trim() !== (device.phoneLabel || '');
  return <Modal title="Edit phone" onClose={onClose} footer={<>
    <button type="button" disabled={m.update.isPending} onClick={onClose} className={`${btn} border border-border hover:bg-muted`}>Cancel</button>
    <button type="button" disabled={!name.trim() || !changed || m.update.isPending} onClick={() => m.update.mutate({ id: device.id, name: name.trim(), phoneLabel: phoneLabel.trim() }, { onSuccess: onClose })} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
      {m.update.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}Save changes
    </button>
  </>}>
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">Choose a name you recognize and an optional label for the phone or SIM. These labels help you choose the right phone for a campaign.</p>
      <label className="block"><span className="mb-1 block text-xs font-medium">Phone name</span><input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      <label className="block"><span className="mb-1 block text-xs font-medium">Phone / SIM label (optional)</span><input className={inputCls} value={phoneLabel} maxLength={80} placeholder="e.g. TECNO · Jazz SIM" onChange={(e) => setPhoneLabel(e.target.value)} /></label>
      {m.update.isError && <p role="alert" className="text-xs text-rose-600">Could not save changes. Check your connection and try again.</p>}
    </div>
  </Modal>;
}

function AddDeviceDialog({ onClose, existingIds, device }: { onClose: () => void; existingIds: string[]; device?: PairedDevice }) {
  const m = usePairedDeviceMutations();
  const { data: devices } = usePairedDevices();
  const [name, setName] = useState(device?.name || 'My phone bridge');
  const [phoneLabel, setPhoneLabel] = useState(device?.phoneLabel || '');
  const [code, setCode] = useState<PhonePairingCode | null>(null);
  const [known] = useState(() => new Set(existingIds));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const created = useMemo(() => (devices ?? []).find((d) => !d.revoked && (code?.deviceId ? d.id === code.deviceId : !known.has(d.id))) || null, [devices, known, code]);
  const api = gatewayApiBase();
  const expired = !!code && new Date(code.expiresAt).getTime() <= now;
  const linked = !!created && pairedPhoneConnection(created, now).gatewayOnline;
  const createCode = () => m.pairingCode.mutate({ deviceName: name.trim(), phoneLabel: phoneLabel.trim(), ...((code?.deviceId || device?.id) ? { deviceId: code?.deviceId || device?.id } : {}) }, { onSuccess: setCode });

  return (
    <Modal
      title={device ? `Link ${device.name} to a computer` : 'Add a paired phone'}
      onClose={onClose}
      footer={code ? <button type="button" onClick={onClose} className={`${btn} border border-border hover:bg-muted`}>{linked ? 'Continue on phone card' : 'Close · finish setup later'}</button> : (
        <button type="button" disabled={!name.trim() || m.pairingCode.isPending} onClick={createCode} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
          {m.pairingCode.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Create pairing code
        </button>
      )}
    >
      <div className="space-y-4 text-sm">
      {!code ? <>
        <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 text-xs leading-relaxed">
          <p className="mb-2 flex items-center gap-2 font-semibold"><Info className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />{device ? 'Reconnect this saved phone' : 'What you need before you start'}</p>
          {device ? <p>Stop the old gateway first (press Ctrl-C in its Terminal, or stop its automatic login service). This creates a new computer connection code for <strong>this phone</strong>. The saved phone, security key and call history are kept.</p> : <ul className="space-y-2 text-muted-foreground">
            <li className="flex gap-2"><Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><strong className="text-foreground">Android phone with an active SIM</strong>, Bluetooth on and enough calling credit.</span></li>
            <li className="flex gap-2"><Laptop className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><strong className="text-foreground">A computer that stays on</strong> with internet and the Updata gateway program.</span></li>
            <li className="flex gap-2"><Cpu className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><strong className="text-foreground">One prepared ESP32-WROOM-32 bridge per phone</strong> and a USB data cable. Ask your installer to load Updata firmware first. ESP32-S2, S3, C3 and C6 boards cannot be used.</span></li>
          </ul>}
        </div>
        {!device && <>
          <label className="block"><span className="mb-1 block text-xs font-medium">Device name</span><input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium">Phone / SIM label (optional)</span><input className={inputCls} value={phoneLabel} maxLength={80} placeholder="e.g. TECNO · Jazz SIM" onChange={(e) => setPhoneLabel(e.target.value)} /></label>
          <p className="text-xs leading-relaxed text-muted-foreground">Your phone is saved when you create its code. It will be ready for calls after you complete computer setup and the sound check. You can finish later using Link computer on its card.</p>
        </>}
      </> : <>
        <div className={`rounded-xl border p-3 text-center ${linked ? 'border-emerald-500/30 bg-emerald-500/5' : expired ? 'border-amber-500/30 bg-amber-500/5' : 'border-brand-500/30 bg-brand-500/5'}`}>
          <p className="text-sm font-semibold">{linked ? 'Computer connected · continue setup on the phone card' : expired ? 'This pairing code has expired' : 'Phone saved · now link your computer'}</p>
          {!linked && <>
            <p className="mt-2 text-xs text-muted-foreground">{expired ? 'Get a new code below. Your saved phone is kept.' : `One-use code · expires ${new Date(code.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</p>
            {!expired && <p className="mt-1 select-all font-mono text-2xl font-bold tracking-widest" aria-label="Pairing code" role="status">{code.code}</p>}
            <button type="button" disabled={m.pairingCode.isPending} onClick={createCode} className={`${btn} mt-2 border border-border hover:bg-muted`}><RotateCw className="h-3.5 w-3.5" aria-hidden="true" />{expired ? 'Get new code' : 'Replace pairing code'}</button>
          </>}
        </div>
        {!linked && <>
          <GatewayInstallSteps profile={code.deviceId} />
          {!expired && <div className="space-y-3 rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">2. Link this phone to your computer</p>
            <p className="text-xs leading-relaxed text-muted-foreground">In the same Terminal window, paste this command and press Enter. Use the new gateway download above if your installed copy does not recognize --profile.</p>
            <CopyBlock text={`node bin/updata-gateway.mjs pair --api '${api.replaceAll("'", "'\\''")}' --code ${code.code}${code.deviceId ? ` --profile ${code.deviceId}` : ''}`} />
            <p className="text-xs font-medium">Then start the gateway and keep this window open:</p>
            <CopyBlock text={`node bin/updata-gateway.mjs run${code.deviceId ? ` --profile ${code.deviceId}` : ''}`} />
            <p className="text-xs leading-relaxed text-muted-foreground">For more than one USB bridge on this computer, add <code>--port</code> followed by the correct USB port to the pairing command. Each phone needs its own bridge and gateway window. Run <code>node bin/updata-gateway.mjs status</code> to list available ports.</p>
          </div>}
        </>}
        <div className="space-y-2 rounded-xl border border-border p-3 text-xs">
          <p className="text-sm font-semibold">3. Finish on the phone card</p>
          <p><strong>Phone setup:</strong> save the security key while holding the bridge’s BOOT button. Then pair your Android phone and turn on Phone calls in its Bluetooth settings.</p>
          <p><strong>Sound &amp; test call:</strong> call your own second phone, check that both sides can hear each other, then choose Verify call audio.</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="mb-2 text-xs font-medium">Live connection status</p>
          {created?.lastHeartbeatAt ? <ul className="space-y-1.5">{deviceChecklist(created, now).map((c) => <li key={c.key} className="flex items-start gap-2 text-xs"><StatusDot ok={c.ok} /><span>{c.label}<span className="block text-muted-foreground">{c.detail}</span></span></li>)}</ul>
          : <p className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDashed className="h-4 w-4 shrink-0" aria-hidden="true" />Waiting for the gateway program. Creating the code alone does not connect your phone.</p>}
        </div>
      </>}
      {m.pairingCode.isError && <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-600 dark:text-rose-400">{(m.pairingCode.error as Error)?.message || 'Could not create a code. Check your connection and try again.'}</p>}
      </div>
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

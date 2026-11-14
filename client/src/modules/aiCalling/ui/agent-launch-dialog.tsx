'use client';
import { useEffect, useState } from 'react';
import { Bluetooth, CalendarClock, CheckCircle2, CircleHelp, Cloud, Cpu, Laptop, Loader2, PhoneCall, ShieldCheck, XCircle } from 'lucide-react';
import { useAgentMutations } from '../hooks/use-calling-agents';
import { usePairedDevices } from '../hooks/use-paired-phone';
import { useTelephonyHealth } from '../hooks/use-ai-calling';
import { pairedPhoneConnection } from '../paired-phone-connection';
import type { AgentLaunchInput, CallingAgent } from '../types/ai-calling-types';
import { localDateTimeToIso } from '../schedule-time';
import { CallingWindowFields } from './agent-settings-fields';
import { RecipientReasons } from './campaign-lead-picker';
import { AgentAvatar, AgentDialog, AgentField, inputClass, primaryClass, readableError, secondaryClass } from './calling-agent-primitives';

export function AgentLaunchDialog({ agent, onClose, onLaunched, onConnections }: { agent: CallingAgent; onClose: () => void; onLaunched: (id: string) => void; onConnections?: () => void }) {
  const { launch } = useAgentMutations();
  const devices = usePairedDevices();
  const telephony = useTelephonyHealth();
  const [remembered] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`agent-launch:${agent._id}`) || 'null') as (AgentLaunchInput & { localLaunch?: string; endDate?: string }) | null; } catch { return null; }
  });
  const [mode, setMode] = useState<'now' | 'scheduled'>(remembered?.mode || 'now');
  const [name, setName] = useState(remembered?.name || '');
  const [localLaunch, setLocalLaunch] = useState(remembered?.localLaunch || '');
  const [schedule, setSchedule] = useState(remembered?.schedule || agent.schedule);
  const [continueAcrossDays, setContinue] = useState(remembered?.continueAcrossDays || false);
  const [endDate, setEndDate] = useState(remembered?.endDate || '');
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(() => remembered?.idempotencyKey || crypto.randomUUID());
  const [transport, setTransport] = useState<NonNullable<AgentLaunchInput['transport']>>(remembered?.transport || agent.transport || 'cloud_sip');
  const [pairedDeviceId, setDeviceId] = useState(remembered?.pairedDeviceId || agent.pairedDeviceId || '');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (transport !== 'paired_phone') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [transport]);
  const phones = devices.data?.filter(d => !d.revoked && !d.archived) || [];
  const selectedPhone = phones.find(d => d.id === pairedDeviceId);
  const connection = selectedPhone && !devices.isError ? pairedPhoneConnection(selectedPhone, now) : null;
  const cloudUnavailable = telephony.data?.configured === false || telephony.data?.eligible === false;
  const routeError = transport === 'paired_phone'
    ? devices.isError ? 'Paired phones could not be loaded. Refresh the connection status.'
      : !selectedPhone ? 'Choose your paired phone below. Add your bridge in Connections if it is missing.'
        : !selectedPhone.audioVerified ? 'Verify two-way call sound for this phone in Connections.'
          : mode === 'now' && !connection?.gatewayOnline ? 'The computer gateway is offline. Reconnect it in Connections before starting.'
            : mode === 'now' && connection?.board !== 'connected' ? 'The ESP32 USB bridge is not connected. Check its cable and reconnect it in Connections.'
              : mode === 'now' && connection?.phone !== 'connected' ? 'Connect your phone over Bluetooth in Connections before starting.' : null
    : telephony.isError ? 'Cloud connection status could not be loaded. Refresh or choose your paired phone.'
      : cloudUnavailable ? 'Cloud calling is unavailable. Configure a cloud phone line in Connections, or choose My paired phone · SIM to use your ESP32.' : null;
  const connectionLoading = transport === 'paired_phone' ? devices.isLoading : telephony.isLoading;
  const status: ConnectionState = connectionLoading ? 'checking'
    : (transport === 'paired_phone' ? devices.isError : telephony.isError) ? 'unknown'
      : transport === 'paired_phone' ? !selectedPhone ? 'unselected'
        : connection?.phone === 'connected' ? 'connected' : connection?.phone === 'connecting' ? 'connecting' : 'disconnected'
        : telephony.data?.configured && telephony.data?.eligible ? 'connected' : telephony.data ? 'disconnected' : 'unknown';
  const chooseConnection = (next: NonNullable<AgentLaunchInput['transport']>, deviceId = '') => {
    setTransport(next); setDeviceId(next === 'paired_phone' ? deviceId || (phones.length === 1 ? phones[0].id : '') : '');
    setKey(crypto.randomUUID()); setError(null);
  };
  const start = async () => {
    setError(null);
    try {
      if (routeError) throw new Error(routeError);
      if (mode === 'scheduled' && !schedule.daysOfWeek?.length) throw new Error('Choose at least one permitted calling day.');
      if (mode === 'scheduled' && schedule.callWindow?.start === schedule.callWindow?.end) throw new Error('Calling window start and end must be different.');
      const scheduledAt = mode === 'scheduled' ? localDateTimeToIso(localLaunch, schedule.timezone || 'UTC') : null;
      if (scheduledAt && Date.parse(scheduledAt) <= Date.now()) throw new Error('Choose a future launch date and time.');
      const executionEndsAt = mode === 'scheduled' && continueAcrossDays && endDate ? localDateTimeToIso(`${endDate}T${schedule.callWindow?.end || '18:00'}`, schedule.timezone || 'UTC') : null;
      const input: AgentLaunchInput = { idempotencyKey: key, ...(name.trim() ? { name: name.trim() } : {}), mode, scheduledAt, schedule, continueAcrossDays, executionEndsAt, transport, pairedDeviceId: transport === 'paired_phone' ? pairedDeviceId : null };
      sessionStorage.setItem(`agent-launch:${agent._id}`, JSON.stringify({ ...input, localLaunch, endDate }));
      const campaign = await launch.mutateAsync({ id: agent._id, input });
      sessionStorage.removeItem(`agent-launch:${agent._id}`);
      onLaunched(campaign._id);
    } catch (e) { setError(readableError(e)); }
  };
  const missing = agent.readiness.missing.filter(item => item !== 'Paired phone');
  const blocked = missing.length > 0 || agent.availability !== 'active' || !agent.eligibility.eligible || agent.metrics.activeCampaigns > 0 || Boolean(routeError) || connectionLoading;
  const leadBlocker = launchLeadBlocker(agent);
  return <AgentDialog title="Start Campaign" description="Launch this agent with its saved questions, settings and assigned leads." onClose={() => { if (!launch.isPending) onClose(); }}>
    <div className="space-y-5">
      <div className="flex items-center gap-3"><AgentAvatar name={agent.name} url={agent.avatarUrl} /><div><p className="font-semibold">{agent.name}</p><p className="text-xs text-muted-foreground">{agent.title}</p></div></div>
      <div className="grid grid-cols-3 gap-3 rounded-xl border border-border p-3">{[['Assigned', agent.assignedLeadIds.length], ['Eligible', agent.eligibility.eligible], ['Ineligible', agent.eligibility.total - agent.eligibility.eligible]].map(([label, value]) => <div key={label}><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div>
      <AgentField label="Campaign name (optional)"><input className={inputClass} maxLength={160} placeholder={`${agent.name} outreach`} value={name} onChange={e => setName(e.target.value)} /></AgentField>
      <section aria-label="Campaign calling connection" className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Calling connection</h3>
          <div role="status" aria-label="Calling connection status" aria-live="polite" aria-atomic="true"><ConnectionBadge state={status} /></div>
        </div>
        <AgentField label="Calls from"><select className={inputClass} value={transport} disabled={launch.isPending} onChange={e => chooseConnection(e.target.value as typeof transport)}><option value="cloud_sip">Cloud phone line · LiveKit SIP</option><option value="paired_phone">My paired phone · SIM</option></select></AgentField>
        {transport === 'paired_phone' && <AgentField label="Paired phone"><select className={inputClass} value={pairedDeviceId} disabled={launch.isPending || devices.isLoading} onChange={e => chooseConnection('paired_phone', e.target.value)}><option value="">Choose a paired phone</option>{phones.map(phone => <option key={phone.id} value={phone.id}>{phone.name} · {devices.isError ? 'status unavailable' : pairedPhoneConnection(phone, now).phone === 'connected' ? 'connected' : 'offline or not connected'}</option>)}</select></AgentField>}
        {selectedPhone && transport === 'paired_phone' && <div aria-label="Phone connection details" className="grid min-w-0 gap-2 sm:grid-cols-3">
          {([
            ['Computer', Laptop, devices.isError ? 'unknown' : connection?.gatewayOnline ? 'connected' : 'disconnected'],
            ['ESP32 USB', Cpu, !connection || connection.board === 'unknown' ? 'unknown' : connection.board === 'connected' ? 'connected' : 'disconnected'],
            ['Phone Bluetooth', Bluetooth, !connection || connection.phone === 'unknown' ? 'unknown' : connection.phone === 'connected' ? 'connected' : connection.phone === 'connecting' ? 'connecting' : 'disconnected'],
          ] as const).map(([label, Icon, state]) => <div key={label} role="group" aria-label={`${label} connection`} className="min-w-0 space-y-2 rounded-lg border border-border bg-white/[0.02] p-2.5"><p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="size-3.5 shrink-0" aria-hidden="true" />{label}</p><ConnectionBadge state={state} compact /></div>)}
        </div>}
        {transport === 'cloud_sip' && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Cloud className="size-3.5 shrink-0" aria-hidden="true" />Cloud phone line · status checked with the calling provider</p>}
        {routeError && !connectionLoading && <p role="status" className="text-xs leading-relaxed text-amber-300">{routeError}</p>}
        {transport === 'cloud_sip' && cloudUnavailable && phones.length === 1 && <button type="button" className={secondaryClass} onClick={() => chooseConnection('paired_phone', phones[0].id)}>Use {phones[0].name}</button>}
        <div className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} disabled={devices.isFetching || telephony.isFetching} onClick={() => { void devices.refetch(); void telephony.refetch(); }}>Refresh connections</button>{onConnections && <button type="button" className={secondaryClass} onClick={onConnections}>Open Connections</button>}</div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{transport === 'paired_phone' ? 'Connection status updates automatically. ' : ''}This connection applies to this campaign. The agent&apos;s saved default stays the same.</p>
      </section>
      <fieldset className="space-y-2"><legend className="mb-2 text-xs font-medium text-muted-foreground">Launch mode</legend>{([
        ['now', 'Start Now', 'Activate immediately. No future launch date is needed.', PhoneCall],
        ['scheduled', 'Schedule Campaign', 'Activate automatically at a future date and time.', CalendarClock],
      ] as const).map(([value, label, detail, Icon]) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === value ? 'border-sky-400/60 bg-blue-500/10' : 'border-border'}`}><input type="radio" name="launch-mode" checked={mode === value} onChange={() => setMode(value)} className="mt-1" /><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></span></label>)}</fieldset>
      {mode === 'scheduled' && <AgentField label={`Launch date and time · ${schedule.timezone || 'UTC'}`}><input type="datetime-local" className={inputClass} value={localLaunch} onChange={e => setLocalLaunch(e.target.value)} /></AgentField>}
      {mode === 'scheduled' && <CallingWindowFields value={schedule} onChange={setSchedule} />}
      {mode === 'scheduled' && <div className="space-y-3"><label className="flex items-start gap-2 text-xs text-muted-foreground"><input className="mt-0.5" type="checkbox" checked={continueAcrossDays} onChange={e => setContinue(e.target.checked)} /><span>Continue unfinished leads on future permitted days<span className="mt-1 block text-muted-foreground">When off, this campaign ends after its first permitted calling window. Active calls can finish.</span></span></label>{continueAcrossDays && <AgentField label="Last calling date (optional)"><input type="date" className={inputClass} value={endDate} onChange={e => setEndDate(e.target.value)} /></AgentField>}</div>}
      <div className="space-y-2 rounded-xl border border-border p-3 text-xs"><p className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-emerald-400" />Campaign readiness</p><p className="text-muted-foreground">{missing.length === 0 ? `${agent.questionnaire.questions.length} saved questions · configuration complete` : `Complete: ${missing.join(', ')}`}</p>{agent.availability !== 'active' && <p className="text-amber-300">Activate this agent in Settings before launching.</p>}{agent.metrics.activeCampaigns > 0 && <p className="text-amber-300">This agent already has an active campaign. Open it to manage its queue.</p>}
        {leadBlocker && <p role="status" className="leading-relaxed text-amber-300">{leadBlocker}</p>}
        {agent.eligibility.leads.filter(l => !l.eligible).slice(0, 5).map(l => <div key={l.leadId}><span className="text-muted-foreground">{l.name}</span><RecipientReasons leadId={l.leadId} reasons={l.reasons} /></div>)}
      </div>
      <p className="rounded-lg border border-blue-400/15 bg-blue-400/5 p-3 text-xs leading-relaxed text-primary/80">{mode === 'now' ? 'Start Now begins calling immediately without waiting for saved calling hours. Connection checks, consent, retry delays and call limits still apply.' : 'Scheduled campaigns follow the selected calling days and hours, recipient quiet hours, consent and call limits.'}</p>
      {error && <p role="alert" className="rounded-lg border border-rose-400/25 p-3 text-sm text-rose-300">{error}</p>}
      <button type="button" className={`${primaryClass} w-full`} disabled={blocked || launch.isPending} onClick={() => void start()}>{launch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'now' ? <PhoneCall className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}{launch.isPending ? 'Preparing campaign…' : mode === 'now' ? 'Start Now' : 'Schedule Campaign'}</button>
    </div>
  </AgentDialog>;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Why no assigned lead can be called yet, in plain language with the next step. Null when some can. */
export function launchLeadBlocker(agent: Pick<CallingAgent, 'assignedLeadIds' | 'eligibility'>): string | null {
  if (!agent.assignedLeadIds.length) return 'No leads are assigned yet. Assign leads in the Leads tab to start a campaign. To try the agent without calling anyone, use “Test agent” — no leads needed.';
  if (agent.eligibility.eligible > 0) return null;
  const rc = agent.eligibility.reasonCounts || {};
  const consent = (rc.consent_required || 0) + (rc.consent_expired || 0);
  const parts = [
    rc.consent_revoked ? `${count(rc.consent_revoked, 'lead has', 'leads have')} asked not to be called (consent revoked)` : null,
    consent ? `${count(consent, 'lead has', 'leads have')} no valid call consent — open the lead (link below) and record verified consent` : null,
    rc.missing_phone ? `${count(rc.missing_phone, 'lead has', 'leads have')} no valid phone number` : null,
    rc.suppressed ? `${count(rc.suppressed, 'lead is', 'leads are')} on the do-not-call list` : null,
    rc.duplicate_phone ? `${count(rc.duplicate_phone, 'lead shares', 'leads share')} a phone number with another lead` : null,
  ].filter(Boolean);
  const total = agent.assignedLeadIds.length;
  return `None of the ${count(total, 'assigned lead', 'assigned leads')} can be called yet${parts.length ? `: ${parts.join('; ')}` : '. Check each lead’s phone number, consent and do-not-call status'}. “Test agent” lets you try the agent without calling anyone.`;
}

type ConnectionState = 'connected' | 'disconnected' | 'connecting' | 'checking' | 'unknown' | 'unselected';

function ConnectionBadge({ state, compact = false }: { state: ConnectionState; compact?: boolean }) {
  const { label, Icon, tone } = {
    connected: { label: 'Connected', Icon: CheckCircle2, tone: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' },
    disconnected: { label: 'Not connected', Icon: XCircle, tone: 'border-rose-400/20 bg-rose-400/10 text-rose-300' },
    connecting: { label: 'Connecting…', Icon: Loader2, tone: 'border-amber-400/20 bg-amber-400/10 text-amber-300' },
    checking: { label: 'Checking…', Icon: Loader2, tone: 'border-border bg-muted/50 text-muted-foreground' },
    unknown: { label: 'Status unavailable', Icon: CircleHelp, tone: 'border-amber-400/20 bg-amber-400/10 text-amber-300' },
    unselected: { label: 'Select a phone', Icon: CircleHelp, tone: 'border-border bg-muted/50 text-muted-foreground' },
  }[state];
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border py-1 text-[11px] font-medium leading-4 ${tone} ${compact ? 'px-2' : 'px-2.5'}`}><Icon className={`size-3.5 shrink-0 ${state === 'checking' || state === 'connecting' ? 'animate-spin' : ''}`} aria-hidden="true" /><span>{label}</span></span>;
}

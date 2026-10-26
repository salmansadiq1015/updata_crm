'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  Bot, CheckCircle2, ChevronRight, CircleAlert, Headphones, ListChecks, Mic,
  PhoneCall, ShieldCheck, Sparkles, Volume2, Wifi, X,
} from 'lucide-react';
import type { Campaign, TelephonyHealth } from '../types/ai-calling-types';
import { useActiveCalls } from '../hooks/use-ai-calling';
import { WebCallConsole, type WebCallStatus } from './web-call-console';
import { UpdataVoiceOrb } from './updata-voice-orb';

function supportsBrowserTest(campaign: Campaign): boolean {
  return campaign.channel !== 'web_link' || campaign.linkConfig?.voiceTier === 'premium';
}

function readableStyle(value?: string): string {
  if (!value) return 'Professional';
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

const INITIAL_STATUS: WebCallStatus = {
  phase: 'idle', callId: null, agentConnected: false, audioReady: false, muted: false, transcriptCount: 0,
};

export function AgentTestLauncher({
  campaigns,
  livekitReady,
  onOpen,
}: {
  campaigns: Campaign[];
  livekitReady: boolean;
  onOpen: () => void;
}) {
  const testable = campaigns.filter(supportsBrowserTest);
  const campaign = testable[0];

  return (
    <section
      aria-labelledby="agent-test-heading"
      className="relative shrink-0 overflow-hidden rounded-2xl border border-blue-400/15 bg-[linear-gradient(110deg,rgba(30,64,175,.17),rgba(15,23,42,.72)_45%,rgba(88,28,135,.12))] p-4 shadow-[0_18px_50px_rgba(2,6,23,.2)] sm:p-5"
    >
      <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <UpdataVoiceOrb state={livekitReady ? 'idle' : 'error'} size="sm" className="-m-3" />
          <div className="min-w-0 py-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="agent-test-heading" className="text-sm font-semibold text-slate-100">Agent test studio</h2>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                livekitReady
                  ? 'border-blue-400/20 bg-blue-400/8 text-blue-200'
                  : 'border-amber-400/20 bg-amber-400/8 text-amber-200'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${livekitReady ? 'bg-blue-400' : 'bg-amber-400'}`} />
                {livekitReady ? 'Voice route configured' : 'Setup needed'}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              {campaign
                ? <>Talk to <strong className="font-medium text-slate-200">{campaign.agentConfig.agentName}</strong> through your browser and verify the real campaign flow without dialling a lead.</>
                : 'Create a calling campaign, then talk to its configured AI agent before placing any phone calls.'}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5 text-blue-400" /> Browser mic + speaker</span>
              <span className="inline-flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5 text-violet-400" /> Real questions and rules</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Lead data isolated</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/25 transition hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
        >
          <Mic className="h-4 w-4" /> {campaign ? 'Open test studio' : 'Set up a test'}
        </button>
      </div>
    </section>
  );
}

export function AgentTestStudio({
  campaigns,
  telephony,
  onClose,
  onCreateCampaign,
}: {
  campaigns: Campaign[];
  telephony?: TelephonyHealth;
  onClose: () => void;
  onCreateCampaign: () => void;
}) {
  useEffect(() => {
    document.body.classList.add('agent-test-studio-open');
    return () => document.body.classList.remove('agent-test-studio-open');
  }, []);

  const testableCampaigns = useMemo(() => campaigns.filter(supportsBrowserTest), [campaigns]);
  const [campaignId, setCampaignId] = useState(() => testableCampaigns[0]?._id ?? '');
  const [webStatus, setWebStatus] = useState<WebCallStatus>(INITIAL_STATUS);
  const selected = testableCampaigns.find((campaign) => campaign._id === campaignId) ?? testableCampaigns[0] ?? null;
  const livekitReady = Boolean(telephony?.livekitReady || telephony?.configured);
  const noLeadContext = selected ? selected.summary.total < 1 : false;
  const disabledReason = !livekitReady
    ? 'Browser voice testing needs LiveKit, OpenAI and the voice-agent worker to be configured.'
    : noLeadContext
      ? 'This campaign has no leads. Add at least one lead so the test agent has realistic call context.'
      : undefined;
  const sessionActive = ['starting', 'connecting', 'live', 'reconnecting'].includes(webStatus.phase);
  const { data: activeCalls } = useActiveCalls(selected?._id ?? null, Boolean(selected && webStatus.callId && sessionActive));
  const currentCall = (activeCalls ?? []).find((call) => call.callId === webStatus.callId) ?? null;
  const questions = useMemo(
    () => [...(selected?.questionnaire.questions ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [selected],
  );
  const handleStatus = useCallback((status: WebCallStatus) => setWebStatus(status), []);

  function createCampaign() {
    onClose();
    onCreateCampaign();
  }

  function changeCampaign(id: string) {
    setWebStatus(INITIAL_STATUS);
    setCampaignId(id);
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#02040a]/80 backdrop-blur-sm data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby="agent-test-description"
          className="dark fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#080d1a] text-slate-100 focus:outline-none sm:left-1/2 sm:top-1/2 sm:h-[min(940px,94vh)] sm:w-[calc(100%-2rem)] sm:max-w-[1440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-[0_34px_110px_rgba(0,0,0,.72)]"
        >
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 bg-[#0a1020] px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-500/10 shadow-inner shadow-blue-400/5">
                <Bot className="h-5 w-5 text-blue-400" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogPrimitive.Title className="truncate text-base font-bold tracking-tight sm:text-lg">Agent Test Studio</DialogPrimitive.Title>
                  <span className="rounded-md border border-blue-400/15 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-blue-300">Preview</span>
                </div>
                <DialogPrimitive.Description id="agent-test-description" className="truncate text-xs text-slate-400 sm:text-sm">
                  Test the configured voice agent, questions and rules without modifying production lead data.
                </DialogPrimitive.Description>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close agent test studio" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
              <X className="h-4 w-4" />
            </button>
          </header>

          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <UpdataVoiceOrb state="idle" size="lg" />
              <div>
                <h2 className="text-base font-semibold">Create a voice campaign to test</h2>
                <p className="mt-1 max-w-md text-sm text-slate-400">
                  The studio uses a campaign’s real agent identity, objective, questions and qualification rules.
                </p>
              </div>
              <button type="button" onClick={createCampaign} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">
                <Sparkles className="h-4 w-4" /> Create calling campaign
              </button>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,2.2fr)_minmax(310px,1fr)] lg:overflow-hidden">
              <main className="min-h-[650px] bg-[#070b16] p-3 sm:p-5 lg:min-h-0 lg:overflow-y-auto">
                <div className="mx-auto h-full min-h-[620px] max-w-5xl overflow-hidden rounded-2xl border border-white/9 bg-[#090f1f] shadow-[0_22px_55px_rgba(0,0,0,.32)]">
                  <WebCallConsole
                    key={selected._id}
                    campaignId={selected._id}
                    agentName={selected.agentConfig.agentName}
                    disabledReason={disabledReason}
                    onStatusChange={handleStatus}
                  />
                </div>
              </main>

              <aside className="min-h-0 border-t border-white/8 bg-[#0b1120] p-4 lg:overflow-y-auto lg:border-l lg:border-t-0 sm:p-5">
                <div className="space-y-5">
                  <section>
                    <label htmlFor="test-campaign" className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Campaign</label>
                    <select
                      id="test-campaign"
                      value={selected._id}
                      onChange={(event) => changeCampaign(event.target.value)}
                      disabled={sessionActive}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-[#0e172b] px-3 py-2.5 text-sm font-semibold text-slate-100 outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {testableCampaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}
                    </select>
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      Uses the first campaign lead only as read-only context. The test record cannot update that lead.
                    </p>
                  </section>

                  <HealthCard configured={livekitReady} status={webStatus} disabledReason={disabledReason} />

                  <section aria-labelledby="test-agent-config" className="space-y-2">
                    <h2 id="test-agent-config" className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Voice agent</h2>
                    <div className="rounded-xl border border-white/9 bg-[#0e172b] p-3.5">
                      <div className="flex items-center gap-3">
                        <UpdataVoiceOrb state={webStatus.phase === 'live' ? 'listening' : 'idle'} size="sm" className="-m-2" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{selected.agentConfig.agentName}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{selected.agentConfig.voice || 'alloy'} · {readableStyle(selected.agentConfig.speakingStyle)}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{selected.agentConfig.language || 'default language'}</p>
                        </div>
                      </div>
                      {selected.agentConfig.objective ? (
                        <div className="mt-3 border-t border-white/8 pt-3">
                          <p className="text-[9px] font-bold uppercase tracking-[.16em] text-emerald-400">Objective</p>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{selected.agentConfig.objective}</p>
                        </div>
                      ) : (
                        <p className="mt-3 border-t border-white/8 pt-3 text-xs text-amber-200">No agent objective is configured for this campaign.</p>
                      )}
                    </div>
                  </section>

                  <section aria-labelledby="test-question-list">
                    <div className="flex items-center justify-between gap-2">
                      <h2 id="test-question-list" className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Conversation flow</h2>
                      <span className="text-[11px] text-slate-500">{questions.length} question{questions.length === 1 ? '' : 's'}</span>
                    </div>
                    {currentCall ? (
                      <div className="mt-2 rounded-lg border border-blue-400/20 bg-blue-400/8 px-3 py-2 text-[11px] text-blue-100">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">Live progress</span>
                          <span className="font-mono tabular-nums">{currentCall.answered}/{currentCall.total}</span>
                        </div>
                        <p className="mt-1 text-blue-200/75">{currentCall.currentQuestion ? `Current: ${currentCall.currentQuestion}` : currentCall.phase}</p>
                      </div>
                    ) : null}
                    {questions.length ? (
                      <ol className="mt-2 max-h-[360px] space-y-2 overflow-y-auto pr-0.5">
                        {questions.map((question, index) => {
                          const current = Boolean(currentCall?.currentQuestion && currentCall.currentQuestion === question.label);
                          const completed = Boolean(currentCall && index < currentCall.answered);
                          return (
                            <li key={question.fieldKey} className={`flex gap-2.5 rounded-xl border px-3 py-2.5 text-xs transition ${current ? 'border-blue-400/35 bg-blue-400/10' : 'border-white/8 bg-[#0e172b]'}`}>
                              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${completed ? 'bg-emerald-400/15 text-emerald-300' : current ? 'bg-blue-400 text-slate-950' : 'bg-slate-700/70 text-slate-300'}`}>
                                {completed ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
                              </span>
                              <span className="min-w-0 flex-1 leading-relaxed text-slate-300">{question.text}</span>
                              {current ? <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-300" /> : null}
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <div className="mt-2 rounded-xl border border-dashed border-amber-400/25 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100">
                        This campaign has no questions. The agent can use its objective, but there is no structured answer flow to verify.
                      </div>
                    )}
                  </section>
                </div>
              </aside>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function HealthCard({
  configured,
  status,
  disabledReason,
}: {
  configured: boolean;
  status: WebCallStatus;
  disabledReason?: string;
}) {
  const connected = status.phase === 'live';
  const healthy = connected && status.agentConnected && status.audioReady;
  const warning = status.phase === 'reconnecting' || status.phase === 'error' || Boolean(disabledReason);
  const title = healthy
    ? 'Browser audio is live'
    : connected
      ? 'Session connected · waiting for agent audio'
      : warning
        ? 'Voice test needs attention'
        : configured
          ? 'Voice route is configured'
          : 'Voice setup is incomplete';

  return (
    <section aria-label="Audio readiness" className={`rounded-xl border p-3.5 ${healthy ? 'border-emerald-400/25 bg-emerald-400/7' : warning ? 'border-amber-400/25 bg-amber-400/7' : 'border-blue-400/20 bg-blue-400/6'}`}>
      <div className="flex items-start gap-2.5">
        {healthy ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : warning ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> : <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-100">{title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {disabledReason || (status.phase === 'error'
              ? 'The last test stopped. The reason is shown under the voice orb; fix it, then press Test again.'
              : healthy
              ? 'Microphone and agent audio are connected through LiveKit. This is not a SIM or SIP phone call.'
              : configured
                ? 'Start the test to verify microphone permission, worker presence and agent audio. No SIP trunk is required.'
                : 'Configure LiveKit and OpenAI, then run the voice-agent worker. Text simulation remains available.')}
          </p>
        </div>
      </div>
      {status.phase !== 'idle' ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-white/8 pt-3 text-[10px]">
          <HealthFact icon={Wifi} label="Room" value={status.phase === 'error' ? 'closed' : status.phase} ok={connected} />
          <HealthFact icon={Bot} label="Agent" value={status.agentConnected ? 'connected' : 'waiting'} ok={status.agentConnected} />
          <HealthFact icon={Headphones} label="Audio" value={status.audioReady ? 'ready' : 'pending'} ok={status.audioReady} />
          <HealthFact icon={Mic} label="Mic" value={status.muted ? 'muted' : connected ? 'live' : 'pending'} ok={connected && !status.muted} />
        </dl>
      ) : null}
    </section>
  );
}

function HealthFact({ icon: Icon, label, value, ok }: { icon: typeof Wifi; label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg bg-black/15 px-2 py-1.5">
      <dt className="flex items-center gap-1 text-slate-500"><Icon className="h-3 w-3" />{label}</dt>
      <dd className={`mt-0.5 truncate font-semibold ${ok ? 'text-emerald-300' : 'text-slate-300'}`}>{value}</dd>
    </div>
  );
}

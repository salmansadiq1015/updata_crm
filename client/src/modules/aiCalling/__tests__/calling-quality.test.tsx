// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { translations } from '@/lib/i18n/translations';
import type { BenchmarkSuite, Experiment, FlaggedPage, QualitySummary } from '../types/calling-quality-types';

const api = vi.hoisted(() => ({
  summary: vi.fn(), flagged: vi.fn(), suites: vi.fn(), suite: vi.fn(), runs: vi.fn(), seedSample: vi.fn(),
  experiments: vi.fn(), experiment: vi.fn(), versions: vi.fn(), scriptState: vi.fn(), promote: vi.fn(), startExperiment: vi.fn(), pauseExperiment: vi.fn(), rollback: vi.fn(), snapshot: vi.fn(),
}));
vi.mock('../services/calling-quality-api', () => ({ callingQualityApi: api }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ isAdmin: true, hasPermission: () => true }) }));
vi.mock('../ui/call-detail-drawer', () => ({ CallDetailDrawer: ({ callId }: { callId: string }) => <div>Conversation {callId}</div> }));
vi.mock('../hooks/use-calling-agents', () => ({ useCallingAgents: () => ({ data: { data: [] } }) }));
vi.mock('../hooks/use-ai-calling', () => ({ useCampaigns: () => ({ data: { data: [] } }) }));

const { QualityDashboard } = await import('../ui/quality-dashboard');
const { BenchmarkWorkspace } = await import('../ui/benchmark-workspace');
const { ScriptExperiments } = await import('../ui/script-experiments');

const wrap = (node: ReactNode) => render(<LanguageProvider initialLocale="en"><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider></LanguageProvider>);
const block = { calls: 3, withTelemetry: 2, notRecorded: 1,
  latency: { p50Ms: 900, p95Ms: 4000, maxMs: 4000, samples: 4, callsWithSamples: 2, highLatencyCalls: 1, vadSilenceMs: 600 },
  transcripts: { recorded: 2, missing: 1, notPersisted: 0, missingRate: 0.5 }, audio: { recorded: 2, callsWithFailures: 1, rate: 0.5, pairedAudioLost: 0 },
  interruptions: { total: 2, perCall: 1 }, silenceEvents: { total: 4, perCall: 2 }, extraction: { recorded: 0, notRecorded: 3, errors: 0, rate: null, rejectedItems: 0 } };
const summary: QualitySummary = {
  latencyThresholdMs: 2000, totals: { ...block, flaggedCalls: 2 },
  failureTypes: [{ type: 'high_latency', calls: 1 }, { type: 'missing_transcript', calls: 1 }, { type: 'transcript_not_persisted', calls: 0 }, { type: 'audio_failure', calls: 1 }, { type: 'extraction_error', calls: 0 }],
  audioFailureTypes: [{ type: 'track_subscription_failed', count: 1 }],
  byDay: [{ date: '2026-10-28', calls: 2, withTelemetry: 1, flagged: 1, samples: 2, p50Ms: 900, p95Ms: 1200 }, { date: '2026-10-29', calls: 1, withTelemetry: 1, flagged: 1, samples: 2, p50Ms: 1000, p95Ms: 4000 }],
  breakdown: { byLanguage: [{ key: 'ur', label: 'ur', calls: 2, withTelemetry: 2, p50Ms: 900, p95Ms: 4000, missingTranscripts: 1, audioFailureCalls: 1, extractionErrors: 0, extractionRecorded: 0 }, { key: 'en', label: 'en', calls: 1, withTelemetry: 0, p50Ms: null, p95Ms: null, missingTranscripts: 0, audioFailureCalls: 0, extractionErrors: 0, extractionRecorded: 0 }], byProvider: [], byAgent: [] },
  facets: { agents: [{ id: 'a1', name: 'Aria' }], campaigns: [], languages: ['en', 'ur'], providers: ['livekit_sip'] }, truncated: false,
};
const flagged: FlaggedPage = { pagination: { page: 1, limit: 25, total: 1, pages: 1 }, latencyThresholdMs: 2000, truncated: false, calls: [{
  id: 'c1', internalCallId: 'call_1', at: '2026-10-29T10:00:00Z', leadId: 'l1', leadName: 'Bilal Traders', campaignId: 'k1', campaignName: 'Aria run', agentId: 'a1', agentName: 'Aria',
  provider: 'livekit_sip', language: 'ur', languageSource: 'detected', durationSeconds: 60, disposition: 'answered_partial', flags: ['high_latency', 'audio_failure'], telemetry: true,
  latency: { p50Ms: 900, p95Ms: 4000, maxMs: 4000, samples: 3 }, audioFailures: ['track_subscription_failed'], transcript: { turns: 3, leadTurns: 0, agentTurns: 3, missing: true, persistedTurns: 3 },
  extraction: null, experiment: { id: 'e1', arm: 'variant_1' },
}] };

beforeEach(() => { for (const fn of Object.values(api)) fn.mockReset(); });

describe('quality dashboard', () => {
  it('shows recorded metrics, labels missing telemetry as not recorded (never zero), and opens a flagged call', async () => {
    api.summary.mockResolvedValue(summary);
    api.flagged.mockResolvedValue(flagged);
    wrap(<QualityDashboard />);
    expect((await screen.findAllByText('900 ms')).length).toBeGreaterThan(0);
    expect(screen.getByText('2 with telemetry · 1 not recorded')).toBeTruthy();
    // Extraction was never recorded for these calls → "Not recorded", not 0.
    const extractionTile = screen.getByText('Extraction errors', { selector: 'div' }).parentElement!;
    expect(within(extractionTile).getByText('Not recorded')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Daily p50 and p95 response latency' })).toBeTruthy();
    fireEvent.click(await screen.findByText('Bilal Traders'));
    expect(screen.getByText('Conversation c1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Audio failure/ }));
    await waitFor(() => expect(api.flagged).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'audio_failure', page: 1 })));
  });
});

describe('benchmarks', () => {
  const suite: BenchmarkSuite = {
    _id: 's1', name: 'SAMPLE — Lead qualification', description: 'Starter', sample: true, agentId: null, archivedAt: null, updatedAt: '2026-10-29T10:00:00Z',
    questionnaire: { questions: [{ fieldKey: 'interested', type: 'boolean' }] }, cases: 1, reviewedCases: 0, lastRun: null,
    caseList: [{ _id: 'c1', suiteId: 's1', title: 'SAMPLE — English, clean line', notes: '', language: 'en', conditions: ['clean'], turns: [{ speaker: 'lead', text: 'Yes' }],
      groundTruth: { answers: [{ fieldKey: 'interested', expected: true }], extraction: [] }, sample: true, reviewed: false, reviewedBy: null, reviewedAt: null, reviewNote: '', revision: 1, updatedAt: '' }],
  };
  it('marks sample suites and unreviewed cases, and never shows a score without reviewed cases', async () => {
    api.suites.mockResolvedValue([suite]);
    api.suite.mockResolvedValue(suite);
    api.runs.mockResolvedValue([]);
    wrap(<BenchmarkWorkspace />);
    expect(await screen.findByText('SAMPLE')).toBeTruthy();
    expect(screen.getByText('No score')).toBeTruthy();
    fireEvent.click(screen.getByText('SAMPLE — Lead qualification'));
    expect(await screen.findByText(/illustrative SAMPLE cases/)).toBeTruthy();
    expect(screen.getByText('Not reviewed')).toBeTruthy();
  });
});

describe('script experiments', () => {
  const experiment: Experiment = {
    _id: 'e1', agentId: 'a1', name: 'Objective wording', hypothesis: 'Clearer objective', status: 'running',
    arms: [{ key: 'control', versionId: 'v1', weight: 50, version: { _id: 'v1', number: 1, label: 'base' } }, { key: 'variant_1', versionId: 'v2', weight: 50, version: { _id: 'v2', number: 2, label: 'friendly' } }],
    campaignIds: [], guardrails: { minCallsPerArm: 30, maxFailureRateIncrease: 0.1, maxOptOutRateIncrease: 0.05, maxMissingTranscriptRateIncrease: 0.1, maxAudioFailureRateIncrease: 0.1, maxP95LatencyIncreaseMs: 750 },
    guardrailStatus: { checkedAt: null, state: 'insufficient_data' }, guardrailEvents: [], startedAt: '2026-10-29T10:00:00Z', pausedAt: null, pausedReason: null, completedAt: null, promotedArm: null, version: 2, createdAt: '2026-10-29T10:00:00Z',
    stats: { minCallsPerArm: 30, totalCalls: 12, truncated: false,
      arms: ['control', 'variant_1'].map(key => ({ key, weight: 50, versionId: key, calls: 6, connected: 4, completed: 2, qualified: 1, failed: 0, optOuts: 0, connectRate: 0.6667, completionRate: 0.5, qualifiedRate: 0.25, failureRate: 0, optOutRate: 0, avgCost: 0.12,
        quality: { callsWithTelemetry: 0, notRecorded: 4, p50LatencyMs: null, p95LatencyMs: null, missingTranscriptRate: null, audioFailureRate: null }, underpowered: true })),
      comparisons: [{ arm: 'variant_1', ...Object.fromEntries(['connectRate', 'completionRate', 'qualifiedRate'].map(k => [k, { control: 0.5, variant: 0.5, diff: 0, ciLow: -0.5, ciHigh: 0.5, pValue: 1, underpowered: true, significant: false, n1: 6, n2: 6 }])) } as never] },
  };
  it('labels underpowered results and promotes only after confirmation', async () => {
    api.scriptState.mockResolvedValue({ agentId: 'a1', activeVersion: { _id: 'v1', number: 1, label: 'base' }, liveMatchesActive: true, canRollback: false, activations: [] });
    api.versions.mockResolvedValue([]);
    api.experiments.mockResolvedValue([experiment]);
    api.experiment.mockResolvedValue(experiment);
    api.promote.mockResolvedValue({ experiment: { ...experiment, status: 'completed' }, campaignsUpdated: 1 });
    wrap(<ScriptExperiments agentId="a1" />);
    fireEvent.click(await screen.findByText('Objective wording'));
    expect((await screen.findAllByText(/Underpowered/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Promote Variant 1' }));
    expect(api.promote).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Won' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Promote Variant 1' }));
    await waitFor(() => expect(api.promote).toHaveBeenCalledWith('e1', 'variant_1', 'Won'));
  });
});

describe('calling quality translations', () => {
  it('every aiQuality / aiBench / aiExp key exists in all four locales', () => {
    const keys = Object.keys(translations.en).filter(k => /^(aiQuality|aiBench|aiExp)\./.test(k));
    expect(keys.length).toBeGreaterThan(300);
    for (const locale of ['de', 'fr', 'ar'] as const) {
      const missing = keys.filter(k => typeof (translations as Record<string, Record<string, string>>)[locale][k] !== 'string' || (translations as Record<string, Record<string, string>>)[locale][k] === translations.en[k as keyof typeof translations.en] && !/^(p50|p95|Agent|Audio|Lead|Interruption|Description|Type|Options|Questions|Notes|Transcription|Extraction|Texte|Status)$/.test(translations.en[k as keyof typeof translations.en]));
      expect(missing.filter(k => locale === 'ar'), locale).toEqual([]);
    }
  });
});

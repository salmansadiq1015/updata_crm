import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoiceProviderSettingsPanel } from '../ui/voice-provider-settings';
import { ProviderCostComparisonPanel } from '../ui/provider-cost-comparison';
import { voiceProviderApi, type VoiceProviderSettings } from '../services/voice-provider-api';
vi.mock('../services/voice-provider-api', () => ({ voiceProviderApi: { get: vi.fn(), save: vi.fn(), test: vi.fn() } }));

const settings: VoiceProviderSettings = {
  primaryProvider: 'gemini', secondaryProvider: 'openai', primaryModel: 'gemini-3.8-live', secondaryModel: 'gpt-realtime-2.1-mini',
  experimentalModel: '', geminiVoice: 'Puck', fallbackEnabled: true, maxSessionSeconds: 300, maxCallCostUsd: 0,
  connectionTimeoutMs: 15000, credentials: { gemini: { stored: true, apiEnvironmentConfigured: false }, openai: { stored: false, apiEnvironmentConfigured: true } },
  health: {}, pricing: { 'gemini-3.8-live': { audioIn: 3, audioOut: 12, textIn: 0.75, textOut: 4.5 } }, pricingVerifiedAt: '2026-10-30',
};
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><VoiceProviderSettingsPanel /></QueryClientProvider>);
beforeEach(() => { vi.resetAllMocks(); vi.mocked(voiceProviderApi.get).mockResolvedValue(settings); vi.mocked(voiceProviderApi.save).mockResolvedValue(settings); });

describe('AI provider administration', () => {
  it('keeps saved keys out of inputs and sends only explicitly replaced credentials', async () => {
    mount(); const user = userEvent.setup();
    const key = await screen.findByLabelText('Replace gemini API key');
    expect(key).toHaveValue(''); expect(key).toHaveAttribute('type', 'password');
    await user.type(key, 'new-gemini-secret');
    await user.click(screen.getByLabelText('Enable automatic fallback during session establishment'));
    await user.click(screen.getByRole('button', { name: 'Save provider settings' }));
    await waitFor(() => expect(voiceProviderApi.save).toHaveBeenCalledWith(expect.objectContaining({ credentials: { gemini: 'new-gemini-secret' }, fallbackEnabled: false }), expect.anything()));
    await waitFor(() => expect(screen.getByLabelText('Replace gemini API key')).toHaveValue(''));
  });
  it('selects a preview only in the test-model control and labels model access accurately', async () => {
    mount(); const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Experimental Gemini model (test calls only)'), 'gemini-3.1-flash-live-preview');
    expect(screen.getByLabelText('Gemini production model')).toHaveValue('gemini-3.8-live');
    expect(screen.getByText(/This check tests API-server credential and model access/)).toBeInTheDocument();
  });
  it('does not fabricate costs or savings for empty cohorts', () => {
    render(<ProviderCostComparisonPanel data={{ providers: [], daily: [], monthly: [], errors: [], estimatedSavings: null, savingsStatus: 'requires_equivalent_measured_baseline' }} />);
    expect(screen.getAllByText('Not measured').length).toBeGreaterThan(0);
    expect(screen.getByText(/No measured savings or invoice reconciliation/)).toBeInTheDocument();
    expect(screen.queryByText('$0.000000')).not.toBeInTheDocument();
  });
});

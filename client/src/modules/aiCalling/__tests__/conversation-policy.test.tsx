// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConversationPolicyFields } from '../ui/conversation-policy-fields';
import { CallBehaviorTimeline } from '../ui/call-behavior-timeline';
import { voicePolicyTranslations } from '@/lib/i18n/voice-policy-translations';
import type { AgentConfig, CallRecord } from '../types/ai-calling-types';

vi.mock('../hooks/use-ai-calling', () => ({ useAgentLanguages: () => ({ data: { languages: [{ code: 'ar', name: 'Arabic', nativeName: 'العربية' }, { code: 'fr', name: 'French', nativeName: 'Français' }] } }) }));
vi.mock('../hooks/use-intel-t', () => ({ useIntelT: () => (_key: string, fallback: string) => fallback }));
function Settings() {
  const [value, onChange] = useState<Partial<AgentConfig>>({ language: 'ar' });
  return <><ConversationPolicyFields value={value} onChange={onChange} /><output data-testid="config">{JSON.stringify(value)}</output></>;
}
describe('conversation policy controls and factual behavior timeline', () => {
  it('edits retry counts, thresholds, language sensitivity and analytics without changing the configured opening language', () => {
    render(<Settings />);
    const max = screen.getByLabelText('Maximum repetition attempts');
    expect(max).toHaveValue(3); expect(max).not.toBeDisabled();
    fireEvent.change(max, { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Consecutive unanswered questions'), { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText('Automatic language switching'));
    fireEvent.change(screen.getByLabelText('Language switching sensitivity'), { target: { value: 'low' } });
    fireEvent.click(screen.getByLabelText('Save behavior event history'));
    expect(JSON.parse(screen.getByTestId('config').textContent || '{}')).toMatchObject({ language: 'ar', maxRepetitionAttempts: 2, maxUnansweredQuestions: 4, automaticLanguageSwitching: false, languageSwitchSensitivity: 'low', saveBehaviorHistory: false });
  });
  it('shows actual event evidence, language changes and missing latency as unknown', () => {
    const call = { answeredAt: '2026-11-03T10:00:00Z', conversationLanguage: { initial: 'ar', current: 'fr', switches: [{ at: '2026-11-03T10:00:42Z', from: 'ar', to: 'fr', mode: 'explicit' }] },
      conversationState: { events: [{ id: '1', at: '2026-11-03T10:00:42Z', type: 'language_switch', language: 'fr', evidence: 'Can you speak French?' }] },
      behaviorAnalytics: { totalQuestions: 2, answered: 0, unanswered: 1, repeats: 3, silenceEvents: 4, interruptions: 0, averageResponseMs: null, longestResponseMs: null, completionPercentage: 0, engagement: 'UNRESPONSIVE' },
    } as CallRecord;
    render(<CallBehaviorTimeline call={call} />);
    expect(screen.getByText('Can you speak French?')).toBeVisible(); expect(screen.getByText(/ar → fr/)).toBeVisible();
    expect(screen.getByText('Average response time').nextElementSibling).toHaveTextContent('—');
    expect(screen.getAllByText('0:42')).toHaveLength(2);
  });
  it('provides every policy and timeline label in all supported CRM locales', () => {
    for (const locale of ['de', 'en', 'fr', 'ar']) {
      expect(Object.keys(voicePolicyTranslations[locale])).toEqual(Object.keys(voicePolicyTranslations.en));
      expect(Object.values(voicePolicyTranslations[locale]).every(value => typeof value === 'string' && value.length > 0)).toBe(true);
    }
  });
});

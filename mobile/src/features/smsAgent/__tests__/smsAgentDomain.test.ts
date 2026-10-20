import { UNAVAILABLE_CAPABILITIES } from '@/services/telephony/telephonyService';

import { simCampaignActions, smsAgentReadiness, toSimCampaignInput } from '../domain/smsAgentDomain';

const caps = {
  ...UNAVAILABLE_CAPABILITIES,
  hasTelephony: true,
  simState: 'ready' as const,
  smsPermissionsDeclared: true,
  sendSmsGranted: true,
  receiveSmsGranted: true,
  notificationsGranted: true,
  directSmsSupported: true,
};

describe('smsAgentReadiness', () => {
  it('the Play build (or a binary without the SMS permissions) can never send', () => {
    expect(smsAgentReadiness('play', caps, true)).toEqual({
      blocked: 'unsupported',
      missing: [],
      canStart: false,
    });
    expect(smsAgentReadiness('private', { ...caps, smsPermissionsDeclared: false }, true).blocked).toBe(
      'unsupported',
    );
  });

  it('needs telephony and a SIM', () => {
    expect(smsAgentReadiness('private', { ...caps, hasTelephony: false }, true).blocked).toBe('noTelephony');
    expect(smsAgentReadiness('private', { ...caps, simState: 'absent' }, true).blocked).toBe('noTelephony');
  });

  it('requires SMS permissions; notifications and battery are listed but do not block', () => {
    expect(smsAgentReadiness('private', { ...caps, receiveSmsGranted: false }, true)).toMatchObject({
      missing: ['smsPermission'],
      canStart: false,
    });
    expect(smsAgentReadiness('private', { ...caps, notificationsGranted: false }, false)).toEqual({
      blocked: null,
      missing: ['notifications', 'battery'],
      canStart: true,
    });
    expect(smsAgentReadiness('private', caps, true)).toEqual({ blocked: null, missing: [], canStart: true });
  });
});

describe('toSimCampaignInput', () => {
  it('builds the server payload with deduplicated leads, ordered questions and conservative pacing', () => {
    const input = toSimCampaignInput({
      name: 'AI SMS',
      leadIds: ['a', 'b', 'a'],
      agentName: ' ',
      organization: ' Acme ',
      windowStart: '09:00',
      windowEnd: '18:00',
      timezone: 'Europe/Zurich',
      reminders: true,
      isTest: false,
      subscriptionId: 3,
      questions: [
        {
          fieldKey: 'interest',
          label: 'Interest',
          text: 'How interested?',
          type: 'single_choice',
          required: true,
          options: ['high', 'low'],
        },
      ] as never,
    });
    expect(input.leadIds).toEqual(['a', 'b']);
    expect(input.agent).toEqual({ agentName: 'Assistant', organizationName: 'Acme' });
    expect(input.questionnaire.questions[0]).toMatchObject({
      order: 1,
      options: [
        { value: 'high', label: 'high' },
        { value: 'low', label: 'low' },
      ],
    });
    expect(input.settings).toMatchObject({
      maxReminders: 1,
      minSecondsBetweenSends: 20,
      sendWindow: { start: '09:00', end: '18:00' },
    });
    expect(input.subscriptionId).toBe(3);
  });
});

describe('simCampaignActions', () => {
  it('mirrors the server transitions', () => {
    expect(simCampaignActions('draft')).toEqual(['start', 'cancel']);
    expect(simCampaignActions('running')).toEqual(['pause', 'cancel']);
    expect(simCampaignActions('paused')).toEqual(['start', 'cancel']);
    expect(simCampaignActions('completed')).toEqual([]);
  });
});

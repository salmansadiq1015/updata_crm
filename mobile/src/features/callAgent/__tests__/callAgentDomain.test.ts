import { defaultQuestions, type DefaultQuestionTexts } from '@/features/aiAgent/domain/agentDomain';

import {
  agentInitial,
  formFromDefaults,
  parseLimited,
  scheduleExtras,
  settingsErrors,
  testDraftInput,
  toDefaultsPayload,
  type SettingsFallbacks,
} from '../domain/agentSettings';
import { selectAllVisible, toggleSelection } from '../domain/leadSelection';
import { meDefaultsSchema, preferencesResponseSchema, savedDefaultsSchema } from '../types';

const texts = Object.fromEntries(
  ['decision_authority', 'need', 'interest', 'timeline', 'callback_time'].map((key) => [
    key,
    { label: `${key} label`, text: `${key}?` },
  ]),
) as DefaultQuestionTexts;

const fallbacks: SettingsFallbacks = {
  disclosure: 'Hi, this is an AI assistant calling on behalf of {company}.',
  questions: defaultQuestions(texts),
  timezone: 'Europe/Zurich',
  language: 'en',
};

const saved = savedDefaultsSchema.parse({
  agentConfig: {
    agentName: 'Mia',
    organizationName: 'Acme AG',
    objective: 'Maintenance',
    language: 'de-CH',
    voice: 'coral',
    disclosure: 'Hallo, hier spricht eine KI im Auftrag von {company}.',
  },
  questions: [
    {
      fieldKey: 'interest',
      label: 'Interest',
      text: 'Interested?',
      type: 'single_choice',
      required: true,
      order: 1,
      options: [{ value: 'high', label: 'high' }, 'low'],
      mapTo: 'qualification.interest',
    },
  ],
  schedule: {
    timezone: 'Europe/Berlin',
    callWindow: { start: '08:00', end: '17:30' },
    daysOfWeek: [1, 3, 5],
    maxAttemptsPerLead: 4,
    retryDelayMinutes: 30,
    maxCallsPerDay: 80,
  },
  sms: { purpose: 'support', templateId: '64b7f0c2a1b2c3d4e5f60799' },
  updatedAt: '2026-10-16T10:00:00.000Z',
});

describe('saved defaults parsing', () => {
  it('reads GET /users/me and tolerates users without defaults or malformed fields', () => {
    expect(meDefaultsSchema.parse({ id: 'u1', preferences: {} })).toBeNull();
    expect(meDefaultsSchema.parse({ id: 'u1' })).toBeNull();
    expect(meDefaultsSchema.parse({ preferences: { aiAgentDefaults: null } })).toBeNull();

    const parsed = meDefaultsSchema.parse({
      preferences: { aiAgentDefaults: { agentConfig: { agentName: 'Mia', voice: 42 }, schedule: 'x' } },
    });
    expect(parsed?.agentConfig).toMatchObject({ agentName: 'Mia', voice: null });
    expect(parsed?.schedule).toBeNull();
    expect(parsed?.questions).toBeNull();
  });

  it('normalizes server question options back to plain values', () => {
    expect(saved.questions?.[0]?.options).toEqual(['high', 'low']);
    expect(preferencesResponseSchema.parse({ preferences: { aiAgentDefaults: null } })).toBeNull();
  });
});

describe('settings form', () => {
  it('starts from the standard values when nothing is saved', () => {
    const form = formFromDefaults(null, fallbacks);
    expect(form).toMatchObject({
      agentName: 'Alex',
      voice: 'alloy',
      language: 'en',
      timezone: 'Europe/Zurich',
      windowStart: '09:00',
      windowEnd: '18:00',
      daysOfWeek: [1, 2, 3, 4, 5],
      maxAttemptsPerLead: '2',
      smsPurpose: 'promotional',
      smsTemplateId: null,
    });
    expect(form.questions).toHaveLength(5);
    expect(settingsErrors(form).fields).toEqual([]);
  });

  it('starts from the saved defaults, ignoring an unknown voice', () => {
    const form = formFromDefaults(saved, fallbacks);
    expect(form).toMatchObject({
      agentName: 'Mia',
      language: 'de-CH',
      voice: 'coral',
      timezone: 'Europe/Berlin',
      daysOfWeek: [1, 3, 5],
      retryDelayMinutes: '30',
      smsPurpose: 'support',
    });
    const odd = savedDefaultsSchema.parse({ agentConfig: { voice: 'robot', disclosure: '' } });
    expect(formFromDefaults(odd, fallbacks)).toMatchObject({
      voice: 'alloy',
      disclosure: fallbacks.disclosure,
    });
  });

  it('flags every invalid field the server would reject', () => {
    const form = {
      ...formFromDefaults(null, fallbacks),
      agentName: '  ',
      disclosure: '',
      windowStart: '9:00',
      windowEnd: '24:00',
      daysOfWeek: [],
      timezone: 'Mars/Olympus',
      maxAttemptsPerLead: '11',
      retryDelayMinutes: '0',
      maxCallsPerDay: 'abc',
      questions: [{ ...fallbacks.questions[0]!, text: '' }],
    };
    const errors = settingsErrors(form);
    expect(errors.fields.sort()).toEqual(
      [
        'agentName',
        'daysOfWeek',
        'disclosure',
        'maxAttemptsPerLead',
        'maxCallsPerDay',
        'questions',
        'retryDelayMinutes',
        'timezone',
        'windowEnd',
        'windowStart',
      ].sort(),
    );
    expect(errors.questions).toEqual([0]);
  });

  it('builds the server payload with trimmed text, sorted days and numbers', () => {
    const form = {
      ...formFromDefaults(saved, fallbacks),
      agentName: ' Mia ',
      daysOfWeek: [5, 1, 3, 1],
      maxCallsPerDay: '120',
    };
    const payload = toDefaultsPayload(form);
    expect(payload.agentConfig).toEqual({
      agentName: 'Mia',
      organizationName: 'Acme AG',
      objective: 'Maintenance',
      language: 'de-CH',
      voice: 'coral',
      disclosure: 'Hallo, hier spricht eine KI im Auftrag von {company}.',
    });
    expect(payload.schedule).toEqual({
      timezone: 'Europe/Berlin',
      callWindow: { start: '08:00', end: '17:30' },
      daysOfWeek: [1, 3, 5],
      maxAttemptsPerLead: 4,
      retryDelayMinutes: 30,
      maxCallsPerDay: 120,
    });
    expect(payload.questions[0]).toMatchObject({
      fieldKey: 'interest',
      order: 1,
      options: [
        { value: 'high', label: 'high' },
        { value: 'low', label: 'low' },
      ],
    });
    expect(payload.sms).toEqual({ purpose: 'support', templateId: '64b7f0c2a1b2c3d4e5f60799' });
  });

  it('parses limited numbers strictly', () => {
    expect(parseLimited('10', 'maxAttemptsPerLead')).toBe(10);
    expect(parseLimited('11', 'maxAttemptsPerLead')).toBeNull();
    expect(parseLimited('1.5', 'retryDelayMinutes')).toBeNull();
    expect(parseLimited('', 'maxCallsPerDay')).toBeNull();
  });
});

describe('campaign inputs from defaults', () => {
  it('passes the saved pacing to new campaigns, and nothing when unsaved', () => {
    expect(scheduleExtras(null)).toEqual({});
    expect(scheduleExtras(saved)).toEqual({
      daysOfWeek: [1, 3, 5],
      maxAttemptsPerLead: 4,
      retryDelayMinutes: 30,
      maxCallsPerDay: 80,
    });
  });

  it('builds an isTest draft for exactly one lead', () => {
    const input = testDraftInput(formFromDefaults(saved, fallbacks), '64b7f0c2a1b2c3d4e5f60718', 'Test');
    expect(input).toMatchObject({
      name: 'Test',
      isTest: true,
      selection: { mode: 'explicit', leadIds: ['64b7f0c2a1b2c3d4e5f60718'] },
      agentConfig: { agentName: 'Mia', voice: 'coral' },
    });
    expect(input.questionnaire.questions).toHaveLength(1);
  });

  it('derives the avatar initial', () => {
    expect(agentInitial('mia')).toBe('M');
    expect(agentInitial('  ')).toBe('A');
  });
});

describe('lead selection', () => {
  it('toggles ids in pick order without duplicates', () => {
    expect(toggleSelection([], 'a')).toEqual(['a']);
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleSelection(['a'], 'b', true)).toEqual(['b']);
    expect(selectAllVisible(['b'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });
});

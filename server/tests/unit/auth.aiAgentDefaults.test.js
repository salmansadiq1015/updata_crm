// PATCH /users/me/preferences — `aiAgentDefaults` (AI agent defaults used by the
// mobile "Call Agent" settings and to prefill new campaigns). In-memory MongoDB only.
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { describe, expect, test, beforeAll, afterEach, afterAll } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let User, Role, userController, userService, parseAiAgentDefaults, aiAgentDefaultsSchema, AI_AGENT_VOICES;
let createCampaign;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/permission.model.js');
  User = mongoose.model('User');
  Role = mongoose.model('Role');
  userController = (await import('../../src/modules/auth/user.controller.js')).default;
  userService = (await import('../../src/modules/auth/user.service.js')).default;
  ({ parseAiAgentDefaults, aiAgentDefaultsSchema, AI_AGENT_VOICES } = await import('../../src/modules/auth/user.validation.js'));
  ({ createCampaign } = await import('../../src/modules/aiCalling/aiCalling.validation.js'));
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

async function seedUser(overrides = {}) {
  const role = await Role.create({ name: `Role_${new mongoose.Types.ObjectId()}`, permissions: [], isSystem: true });
  return User.create({
    email: `user${new mongoose.Types.ObjectId()}@test.ch`,
    passwordHash: await bcrypt.hash('Test1234!', 4),
    firstName: 'Test',
    lastName: 'User',
    role: role._id,
    status: 'active',
    ...overrides,
  });
}

/** Calls the controller like Express would; resolves with { status, body }. */
function patchPreferences(userId, body) {
  return new Promise((resolve) => {
    const req = { user: { _id: userId }, body };
    const res = { success: (payload) => resolve({ ok: true, body: payload }) };
    userController.updatePreferences(req, res, (err) => resolve({ ok: false, error: err }));
  });
}

const VALID = {
  agentConfig: {
    agentName: '  Mia ',
    organizationName: 'Acme AG',
    objective: 'Qualify maintenance demand',
    language: 'de-ch',
    voice: 'coral',
    disclosure: 'Hi, this is an AI assistant calling on behalf of {company}.',
  },
  questions: [
    { fieldKey: 'need', label: 'Need', text: 'What do you need?', type: 'long_text', required: true, options: [] },
    {
      fieldKey: 'interest', label: 'Interest', text: 'How interested are you?', type: 'single_choice',
      required: true, options: ['high', 'low'], mapTo: 'qualification.interest',
    },
  ],
  schedule: {
    timezone: 'Europe/Zurich',
    callWindow: { start: '08:30', end: '17:00' },
    daysOfWeek: [1, 2, 3],
    maxAttemptsPerLead: 3,
    retryDelayMinutes: 90,
    maxCallsPerDay: 50,
  },
  sms: { purpose: 'transactional', templateId: null },
};

describe('aiAgentDefaults validation', () => {
  test('normalizes a valid payload with the campaign rules', () => {
    const value = parseAiAgentDefaults(VALID);
    expect(value.agentConfig).toMatchObject({ agentName: 'Mia', language: 'de-CH', voice: 'coral' });
    expect(value.schedule).toMatchObject({ timezone: 'Europe/Zurich', daysOfWeek: [1, 2, 3], maxAttemptsPerLead: 3 });
    expect(value.sms).toEqual({ purpose: 'transactional', templateId: null });
    expect(value.updatedAt).toBeInstanceOf(Date);
  });

  test('fills missing sections with campaign defaults', () => {
    const value = parseAiAgentDefaults({});
    expect(value.agentConfig).toMatchObject({ agentName: 'Assistant', language: 'en', voice: 'alloy' });
    expect(value.schedule).toMatchObject({ timezone: 'UTC', callWindow: { start: '09:00', end: '18:00' }, maxAttemptsPerLead: 2 });
    expect(value.sms).toEqual({ purpose: 'promotional', templateId: null });
  });

  test('saved defaults are accepted by the campaign create schema', () => {
    const { updatedAt: _updatedAt, questions, sms: _sms, ...rest } = parseAiAgentDefaults(VALID);
    const { error } = createCampaign.body.validate({
      name: 'From defaults',
      questionnaire: { questions },
      ...rest,
      selection: { mode: 'explicit', leadIds: [new mongoose.Types.ObjectId().toString()] },
    });
    expect(error).toBeUndefined();
  });

  test.each([
    ['unsupported language', { agentConfig: { language: 'xx-YY' } }, 'aiAgentDefaults.agentConfig.language'],
    ['unknown voice', { agentConfig: { voice: 'robot' } }, 'aiAgentDefaults.agentConfig.voice'],
    ['invalid time zone', { schedule: { timezone: 'Mars/Olympus' } }, 'aiAgentDefaults.schedule.timezone'],
    ['bad call window', { schedule: { callWindow: { start: '25:00', end: '18:00' } } }, 'aiAgentDefaults.schedule.callWindow.start'],
    ['attempts over the campaign limit', { schedule: { maxAttemptsPerLead: 11 } }, 'aiAgentDefaults.schedule.maxAttemptsPerLead'],
    ['retry delay under the campaign minimum', { schedule: { retryDelayMinutes: 0 } }, 'aiAgentDefaults.schedule.retryDelayMinutes'],
    ['no call days', { schedule: { daysOfWeek: [] } }, 'aiAgentDefaults.schedule.daysOfWeek'],
    ['unknown SMS purpose', { sms: { purpose: 'spam' } }, 'aiAgentDefaults.sms.purpose'],
  ])('rejects %s', (_name, input, field) => {
    expect.assertions(3);
    try {
      parseAiAgentDefaults(input);
    } catch (err) {
      expect(err.statusCode ?? err.status).toBe(400);
      expect(err.details.map((d) => d.field)).toContain(field);
      expect(err.message).toBe('Validation failed');
    }
  });

  test('voices are the OpenAI Realtime voices the worker accepts', () => {
    expect(AI_AGENT_VOICES).toEqual(expect.arrayContaining(['alloy', 'coral', 'verse']));
    expect(aiAgentDefaultsSchema.validate({ agentConfig: { voice: 'alloy' } }).error).toBeUndefined();
  });
});

describe('PATCH /users/me/preferences aiAgentDefaults', () => {
  test('saves the defaults and GET /users/me returns them', async () => {
    const user = await seedUser();
    const result = await patchPreferences(user._id, { aiAgentDefaults: VALID });
    expect(result.ok).toBe(true);
    expect(result.body.data.preferences.aiAgentDefaults.agentConfig).toMatchObject({ agentName: 'Mia', voice: 'coral' });

    const me = await userService.getMe(user._id);
    expect(me.preferences.aiAgentDefaults.agentConfig.language).toBe('de-CH');
    expect(me.preferences.aiAgentDefaults.questions).toHaveLength(2);
    expect(me.preferences.aiAgentDefaults.schedule.daysOfWeek).toEqual([1, 2, 3]);
  });

  test('does not wipe other preferences, and other preference updates keep the defaults', async () => {
    const departmentId = new mongoose.Types.ObjectId();
    const user = await seedUser({
      preferences: {
        preferredDepartmentId: departmentId,
        dashboard: { hiddenKpis: ['revenue'], hiddenTabs: ['tasks'] },
        siteDetail: { hiddenTabs: ['plans'] },
        startPage: '/crm/leads',
      },
    });

    await patchPreferences(user._id, { aiAgentDefaults: VALID });
    let saved = await User.findById(user._id).lean();
    expect(saved.preferences).toMatchObject({
      preferredDepartmentId: departmentId,
      dashboard: { hiddenKpis: ['revenue'], hiddenTabs: ['tasks'] },
      siteDetail: { hiddenTabs: ['plans'] },
      startPage: '/crm/leads',
    });

    await patchPreferences(user._id, { startPage: '/dashboard' });
    saved = await User.findById(user._id).lean();
    expect(saved.preferences.startPage).toBe('/dashboard');
    expect(saved.preferences.aiAgentDefaults.agentConfig.agentName).toBe('Mia');
  });

  test('rejects invalid defaults without writing anything', async () => {
    const user = await seedUser();
    const result = await patchPreferences(user._id, {
      startPage: '/dashboard',
      aiAgentDefaults: { agentConfig: { voice: 'robot' } },
    });
    expect(result.ok).toBe(false);
    expect(result.error.statusCode ?? result.error.status).toBe(400);
    const saved = await User.findById(user._id).lean();
    expect(saved.preferences.aiAgentDefaults ?? null).toBeNull();
    expect(saved.preferences.startPage ?? null).toBeNull();
  });

  test('null clears the defaults; existing users without defaults read null', async () => {
    const user = await seedUser();
    expect((await userService.getMe(user._id)).preferences.aiAgentDefaults ?? null).toBeNull();
    await patchPreferences(user._id, { aiAgentDefaults: VALID });
    await patchPreferences(user._id, { aiAgentDefaults: null });
    const saved = await User.findById(user._id).lean();
    expect(saved.preferences.aiAgentDefaults).toBeNull();
  });
});

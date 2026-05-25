import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let VoiceCommand;
let voiceCommandService;

beforeAll(async () => {
  await connectTestDb();
  ({ default: VoiceCommand } = await import('../../src/modules/ai/voiceCommand.model.js'));
  ({ default: voiceCommandService } = await import('../../src/modules/ai/voiceCommand.service.js'));
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('AI voice command matching', () => {
  test('matches Swiss German phrases through German command fallback', async () => {
    await VoiceCommand.create({
      intent: 'order.create',
      language: 'de',
      phrases: ['auftrag erstellen'],
      actionType: 'CREATE',
      actionTarget: 'orders',
      isActive: true,
    });

    const match = await voiceCommandService.matchCommand(
      'Bitte en Uftrag erstelle fuer huet',
      'de-CH',
    );

    expect(match).toMatchObject({
      intent: 'order.create',
      language: 'de',
      actionType: 'CREATE',
      actionTarget: 'orders',
    });
    expect(match.matchConfidence).toBeGreaterThanOrEqual(0.58);
  });

  test('supports longer BCP-47 dialect language codes', async () => {
    const created = await VoiceCommand.create({
      intent: 'report.open',
      language: 'gsw-CH',
      phrases: ['rapport oeffnen'],
      actionType: 'NAVIGATE',
      actionTarget: 'reports',
      isActive: true,
    });

    expect(created.language).toBe('gsw-CH');
  });
});

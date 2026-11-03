import { jest } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import CustomVocabulary from '../../src/modules/ai/customVocabulary.model.js';
import VoiceCommand from '../../src/modules/ai/voiceCommand.model.js';
import { seedAiVocabulary } from '../../src/seed/ai-vocabulary-seed.js';
import { seedAiCommands, COMMANDS } from '../../src/seed/ai-commands-seed.js';

beforeAll(async () => {
  await connectTestDb();
  await Promise.all([CustomVocabulary.init(), VoiceCommand.init()]);
});
beforeEach(clearTestDb);
afterEach(() => jest.restoreAllMocks());
afterAll(disconnectTestDb);

test('vocabulary seeds in one batch and preserves edits, timestamps, and deleted entries', async () => {
  const bulk = jest.spyOn(CustomVocabulary, 'bulkWrite');
  const individualReads = jest.spyOn(CustomVocabulary, 'findOne');
  const first = await seedAiVocabulary();
  expect(first.created).toBeGreaterThan(600);
  expect(bulk).toHaveBeenCalledTimes(1);
  expect(individualReads).not.toHaveBeenCalled();
  expect(await CustomVocabulary.countDocuments()).toBe(first.created);

  const original = await CustomVocabulary.findOne({ term: 'Viessmann', language: 'de' });
  expect(original.createdAt).toBeInstanceOf(Date);
  await CustomVocabulary.updateOne({ _id: original._id }, {
    $set: { status: 'DISABLED', aliases: ['office alias'] },
  });
  const edited = await CustomVocabulary.findById(original._id).lean();
  const deleted = await CustomVocabulary.findOneAndUpdate({ term: 'Vaillant', language: 'de' }, {
    $set: { isDeleted: true, deletedAt: new Date() },
  });

  expect((await seedAiVocabulary()).created).toBe(1);
  expect(await CustomVocabulary.findById(original._id).lean()).toEqual(edited);
  expect(await CustomVocabulary.findById(deleted._id).setOptions({ includeDeleted: true })).toMatchObject({ isDeleted: true });
  expect(await CustomVocabulary.countDocuments({ term: 'Vaillant', language: 'de', isDeleted: false })).toBe(1);
  expect((await seedAiVocabulary()).created).toBe(0);
});

test('commands load once, update changed definitions, and preserve unchanged disabled commands', async () => {
  const reads = jest.spyOn(VoiceCommand, 'find');
  const individualReads = jest.spyOn(VoiceCommand, 'findOne');
  expect(await seedAiCommands()).toMatchObject({ created: COMMANDS.length, updated: 0 });
  expect(reads).toHaveBeenCalledTimes(1);
  expect(individualReads).not.toHaveBeenCalled();

  const [changed, unchanged, deleted] = await VoiceCommand.find().limit(3);
  await VoiceCommand.updateOne({ _id: changed._id }, { $set: { phrases: ['outdated'], isActive: false } });
  await VoiceCommand.updateOne({ _id: unchanged._id }, { $set: { isActive: false } });
  await VoiceCommand.updateOne({ _id: deleted._id }, { $set: { isDeleted: true } });

  expect(await seedAiCommands()).toMatchObject({ created: 1, updated: 1 });
  const definition = COMMANDS.find((cmd) => cmd.intent === changed.intent && cmd.language === changed.language);
  expect(await VoiceCommand.findById(changed._id).lean()).toMatchObject({ phrases: definition.phrases, isActive: true });
  expect(await VoiceCommand.findById(unchanged._id).lean()).toMatchObject({ isActive: false });
  expect(await VoiceCommand.countDocuments({ isDeleted: false })).toBe(COMMANDS.length);
  expect(await seedAiCommands()).toMatchObject({ created: 0, updated: 0 });
});

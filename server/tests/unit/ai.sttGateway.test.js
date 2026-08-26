import { jest, describe, expect, test, beforeEach } from '@jest/globals';

const createSpy = jest.fn(async () => ({
  text: 'Hallo Welt',
  segments: [{ avg_logprob: -0.1 }],
  words: [{ word: 'Hallo', start: 0, end: 1 }],
}));

jest.unstable_mockModule('openai', () => ({
  default: class MockOpenAI {
    constructor() {
      this.audio = {
        transcriptions: { create: createSpy },
      };
    }
  },
}));

// The STT provider comes from validated config, not the raw environment.
const mockConfig = {
  ai: { apiKey: 'test-key', model: 'gpt-4o', baseUrl: '', sttProvider: 'whisper' },
  env: 'test',
  isDevelopment: false,
  isProduction: false,
  logging: { level: 'error' },
};
jest.unstable_mockModule('../../src/config/index.js', () => ({ default: mockConfig }));

describe('AI STT gateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.ai.sttProvider = 'whisper';
  });

  test('passes through the original audio mime type and file extension', async () => {
    const { default: sttGatewayService } = await import('../../src/modules/ai/sttGateway.service.js');
    const result = await sttGatewayService.transcribe(Buffer.from('audio-bytes'), {
      language: 'de-CH',
      mimeType: 'audio/mp3',
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload = createSpy.mock.calls[0][0];
    expect(payload.file.name).toBe('audio.mp3');
    expect(payload.file.type).toBe('audio/mpeg');
    expect(result.provider).toBe('whisper');
    expect(result.text).toBe('Hallo Welt');
  });

  test('writes Swiss German: no Eszett survives the transcription', async () => {
    createSpy.mockResolvedValueOnce({
      text: 'Das Ausdehnungsgefäß ist defekt, die Straße ist gesperrt.',
      segments: [{ avg_logprob: -0.1 }],
      words: [],
    });
    const { default: sttGatewayService } = await import('../../src/modules/ai/sttGateway.service.js');
    const result = await sttGatewayService.transcribe(Buffer.from('audio-bytes'), { language: 'de-CH' });

    expect(result.text).toBe('Das Ausdehnungsgefäss ist defekt, die Strasse ist gesperrt.');
  });

  test('prompts Whisper in the orthography it should answer in', async () => {
    const { default: sttGatewayService } = await import('../../src/modules/ai/sttGateway.service.js');
    await sttGatewayService.transcribe(Buffer.from('audio-bytes'), { language: 'de-CH' });

    // The prompt is a style example: written "fuer" and "Waermepumpe" it
    // taught the model to answer without umlauts and in lower case.
    const { prompt } = createSpy.mock.calls[0][0];
    expect(prompt).toContain('Wärmepumpe');
    expect(prompt).not.toMatch(/fuer|Waermepumpe|Stoerung/);
    expect(prompt).not.toMatch(/ß/);
  });

  test('caps the vocabulary prompt at what Whisper actually reads', async () => {
    const { default: sttGatewayService } = await import('../../src/modules/ai/sttGateway.service.js');
    const many = Array.from({ length: 700 }, (_, i) => `Fachbegriff${i}`);
    await sttGatewayService.transcribe(Buffer.from('audio-bytes'), {
      language: 'de-CH',
      customVocabulary: many,
    });

    const { prompt } = createSpy.mock.calls[0][0];
    expect(prompt.length).toBeLessThan(1200);
    expect(prompt).toContain('Fachbegriff0');
    expect(prompt).not.toContain('Fachbegriff699');
  });

  test('survives a caller that hands over vocabulary records instead of words', async () => {
    const { default: sttGatewayService } = await import('../../src/modules/ai/sttGateway.service.js');
    const result = await sttGatewayService.transcribe(Buffer.from('audio-bytes'), {
      language: 'de-CH',
      customVocabulary: [{ term: 'Viessmann' }, { term: 'Hoval' }],
    });

    expect(result.text).toBe('Hallo Welt');
  });

  test('rejects providers it cannot handle', async () => {
    mockConfig.ai.sttProvider = 'unknown-provider';
    const { default: sttGatewayService } = await import('../../src/modules/ai/sttGateway.service.js');

    await expect(
      sttGatewayService.transcribe(Buffer.from('audio-bytes'), { language: 'de-CH' }),
    ).rejects.toThrow('Unsupported STT provider');
  });

  test('declared but unimplemented providers fail with a clear message', async () => {
    mockConfig.ai.sttProvider = 'google';
    const { default: sttGatewayService } = await import('../../src/modules/ai/sttGateway.service.js');

    await expect(
      sttGatewayService.transcribe(Buffer.from('audio-bytes'), { language: 'de-CH' }),
    ).rejects.toThrow(/not configured|not implemented/i);
  });
});

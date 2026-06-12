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

describe('AI STT gateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STT_PROVIDER;
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

  test('rejects unsupported providers explicitly', async () => {
    process.env.STT_PROVIDER = 'unknown-provider';
    const { default: sttGatewayService } = await import('../../src/modules/ai/sttGateway.service.js');

    await expect(
      sttGatewayService.transcribe(Buffer.from('audio-bytes'), { language: 'de-CH' }),
    ).rejects.toThrow('Unsupported STT provider');
  });
});

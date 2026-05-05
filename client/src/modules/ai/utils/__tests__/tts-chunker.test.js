import { splitIntoChunks } from '../tts-chunker';

describe('splitIntoChunks', () => {
  it('returns empty array for empty string', () => {
    expect(splitIntoChunks('')).toEqual([]);
  });
  it('returns empty array for null', () => {
    expect(splitIntoChunks(null)).toEqual([]);
  });
  it('returns single chunk for short text', () => {
    expect(splitIntoChunks('Hello world.')).toEqual(['Hello world.']);
  });
  it('splits at sentence boundaries', () => {
    const result = splitIntoChunks('First sentence. Second sentence. Third one.');
    expect(result.length).toBeGreaterThan(1);
  });
  it('does not split mid-sentence', () => {
    const text = 'This is a single long sentence without any terminal punctuation that goes on';
    const result = splitIntoChunks(text);
    expect(result).toHaveLength(1);
  });
  it('chunks do not exceed 200 characters', () => {
    const long = 'A'.repeat(50) + '. ' + 'B'.repeat(50) + '. ' + 'C'.repeat(50) + '. ' + 'D'.repeat(50) + '.';
    splitIntoChunks(long).forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(200);
    });
  });
  it('filters chunks shorter than 3 words when multiple chunks exist', () => {
    const result = splitIntoChunks('Ok. This is a proper sentence here. Good.');
    result.forEach((chunk) => {
      expect(chunk.split(/\s+/).length).toBeGreaterThanOrEqual(3);
    });
  });
});

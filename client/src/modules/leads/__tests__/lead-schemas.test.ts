import { describe, expect, it } from 'vitest';
import { leadSchema } from '../schemas/lead-schemas';
import { makeLeadDTO } from './mocks/data';

const parse = (overrides: Record<string, unknown> = {}) => leadSchema.parse(makeLeadDTO(overrides));

describe('leadSchema — createdBy', () => {
  it('keeps extension source provenance instead of falling back to manual', () => {
    expect(parse({ source: 'extension' }).source).toBe('extension');
  });
  it('keeps the name fields of a populated creator', () => {
    const lead = parse({
      createdBy: { _id: 'u-9', firstName: 'Olivia', lastName: 'Keller', email: 'olivia@example.ch' },
    });

    expect(lead.createdBy).toEqual({
      id: 'u-9',
      firstName: 'Olivia',
      lastName: 'Keller',
      email: 'olivia@example.ch',
    });
  });

  it('reads the id from `id` as well as `_id`', () => {
    expect(parse({ createdBy: { id: 'u-9', firstName: 'Olivia', lastName: 'Keller' } }).createdBy).toMatchObject({
      id: 'u-9',
      firstName: 'Olivia',
    });
  });

  it('tolerates a populated creator with missing or blank fields', () => {
    expect(parse({ createdBy: { _id: 'u-9' } }).createdBy).toEqual({
      id: 'u-9',
      firstName: null,
      lastName: null,
      email: null,
    });
    expect(parse({ createdBy: { _id: 'u-9', firstName: '', lastName: '', email: 'o@example.ch' } }).createdBy).toEqual({
      id: 'u-9',
      firstName: null,
      lastName: null,
      email: 'o@example.ch',
    });
  });

  it('tolerates a bare id (a response that was not populated)', () => {
    expect(parse({ createdBy: 'u-2' }).createdBy).toBe('u-2');
  });

  it('is null when the creator is missing, empty or unusable', () => {
    expect(parse({ createdBy: null }).createdBy).toBeNull();
    expect(parse({ createdBy: undefined }).createdBy).toBeNull();
    expect(parse({ createdBy: '' }).createdBy).toBeNull();
    expect(parse({ createdBy: {} }).createdBy).toBeNull();
    expect(parse({ createdBy: [] }).createdBy).toBeNull();
  });

  it('still flattens a populated assignee to its id (the API populates both)', () => {
    const lead = parse({
      assignedTo: { _id: 'u-2', firstName: 'Noah', lastName: 'Frei', email: 'noah@example.ch' },
    });

    expect(lead.assignedTo).toBe('u-2');
  });
});

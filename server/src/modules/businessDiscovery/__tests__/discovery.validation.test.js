import { describe, expect, test } from '@jest/globals';
import { listResults } from '../discovery.validation.js';

describe('business discovery validation', () => {
  test('defaults result cursor pages to the 300-row initial load size', () => {
    const { error, value } = listResults.query.validate({
      sortBy: 'discoveredAt',
      sortOrder: 'desc',
    }, { convert: true });

    expect(error).toBeUndefined();
    expect(value).toEqual(expect.objectContaining({
      limit: 300,
      sortBy: 'discoveredAt',
      sortOrder: 'desc',
    }));
  });

  test('accepts bounded larger cursor pages for explicit load-more requests', () => {
    const { error, value } = listResults.query.validate({
      limit: '500',
      sortBy: 'discoveredAt',
      sortOrder: 'desc',
    }, { convert: true });

    expect(error).toBeUndefined();
    expect(value).toEqual(expect.objectContaining({
      limit: 500,
      sortBy: 'discoveredAt',
      sortOrder: 'desc',
    }));
  });

  test('accepts the client name sort alias used by the results UI', () => {
    const { error, value } = listResults.query.validate({
      limit: '500',
      sortBy: 'name',
      sortOrder: 'asc',
    }, { convert: true });

    expect(error).toBeUndefined();
    expect(value.sortBy).toBe('name');
  });
});

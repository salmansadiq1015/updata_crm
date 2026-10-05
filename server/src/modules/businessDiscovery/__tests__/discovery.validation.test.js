import { describe, expect, test } from '@jest/globals';
import { listResults } from '../discovery.validation.js';

describe('business discovery validation', () => {
  test('accepts 500-result cursor pages for optimized lead generation loading', () => {
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

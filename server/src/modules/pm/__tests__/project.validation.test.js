import { describe, expect, it } from '@jest/globals';
import { listProjectsSchema } from '../project.validation.js';

describe('project list validation', () => {
  it('accepts comma-separated valid project statuses for reference selectors', () => {
    const result = listProjectsSchema.query.validate({
      customerId: '64f000000000000000000100',
      status: 'DRAFT,PLANNING,IN_PROGRESS,ON_HOLD',
      limit: 50,
    });

    expect(result.error).toBeUndefined();
    expect(result.value.status).toBe('DRAFT,PLANNING,IN_PROGRESS,ON_HOLD');
  });

  it('rejects invalid project status aliases', () => {
    const result = listProjectsSchema.query.validate({
      customerId: '64f000000000000000000100',
      status: 'ACTIVE',
    });

    expect(result.error?.message).toContain('ACTIVE');
  });
});

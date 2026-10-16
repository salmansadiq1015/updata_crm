import { ApiError } from '@/services/api/apiErrors';

import { createQueryClient, shouldRetryQuery } from '../queryClient';

describe('query retry policy', () => {
  const network = new ApiError({ kind: 'network', message: 'x' });
  const notFound = new ApiError({ kind: 'http', status: 404, message: 'x' });

  it('retries transient read failures at most twice', () => {
    expect(shouldRetryQuery(0, network)).toBe(true);
    expect(shouldRetryQuery(1, network)).toBe(true);
    expect(shouldRetryQuery(2, network)).toBe(false);
  });

  it('never retries client errors or unknown errors', () => {
    expect(shouldRetryQuery(0, notFound)).toBe(false);
    expect(shouldRetryQuery(0, new Error('boom'))).toBe(false);
  });

  it('never auto-retries mutations (no duplicate calls, messages or activities)', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});

import { classifyDispatchError, classifyRunError } from '../retry-classifier';

describe('classifyDispatchError', () => {
  it('treats 429 as transient', () => {
    expect(classifyDispatchError({ status: 429 }).isTransient).toBe(true);
  });
  it('treats 503 as transient', () => {
    expect(classifyDispatchError({ status: 503 }).isTransient).toBe(true);
  });
  it('treats fetch network error (no status) as transient', () => {
    expect(classifyDispatchError({}).isTransient).toBe(true);
  });
  it('treats 403 as hard error', () => {
    expect(classifyDispatchError({ status: 403 }).isTransient).toBe(false);
  });
  it('treats 400 as hard error', () => {
    expect(classifyDispatchError({ status: 400 }).isTransient).toBe(false);
  });
  it('treats RBAC_DENIED code as hard error', () => {
    expect(classifyDispatchError({ status: 403, code: 'RBAC_DENIED' }).isTransient).toBe(false);
  });
});

describe('classifyRunError', () => {
  it('treats QUEUE_UNAVAILABLE as transient', () => {
    expect(classifyRunError({ code: 'QUEUE_UNAVAILABLE' }).isTransient).toBe(true);
  });
  it('treats AGENT_TIMEOUT as transient', () => {
    expect(classifyRunError({ code: 'AGENT_TIMEOUT' }).isTransient).toBe(true);
  });
  it('treats UNHANDLED_ERROR as transient', () => {
    expect(classifyRunError({ code: 'UNHANDLED_ERROR' }).isTransient).toBe(true);
  });
  it('treats NETWORK_ERROR as transient', () => {
    expect(classifyRunError({ code: 'NETWORK_ERROR' }).isTransient).toBe(true);
  });
  it('treats normalized network errors without a code as transient', () => {
    expect(classifyRunError({ isNetworkError: true }).isTransient).toBe(true);
  });
  it('treats RBAC_DENIED as hard', () => {
    expect(classifyRunError({ code: 'RBAC_DENIED' }).isTransient).toBe(false);
  });
  it('treats WORKFLOW_NOT_FOUND as hard', () => {
    expect(classifyRunError({ code: 'WORKFLOW_NOT_FOUND' }).isTransient).toBe(false);
  });
  it('returns false for unknown code', () => {
    expect(classifyRunError({ code: 'SOME_UNKNOWN' }).isTransient).toBe(false);
  });
  it('returns false for null error', () => {
    expect(classifyRunError(null).isTransient).toBe(false);
  });
});

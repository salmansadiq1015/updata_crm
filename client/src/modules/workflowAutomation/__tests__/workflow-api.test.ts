import { describe, expect, it, vi } from 'vitest';
const http = vi.hoisted(() => ({ delete: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ default: http }));
import { workflowApi } from '../services/workflow-api';

describe('bulk workflow deletion', () => {
  it('deduplicates IDs, bounds concurrency, and reports each failed or archived workflow', async () => {
    let active = 0; let peak = 0;
    http.delete.mockImplementation(async (path: string) => {
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      if (path.endsWith('/failure')) throw new Error('Unavailable');
      return { data: path.endsWith('/published') ? { archived: true } : { deleted: true } };
    });
    const ids = ['draft', 'published', 'failure', ...Array.from({ length: 9 }, (_, i) => `draft-${i}`)];
    const results = await workflowApi.removeMany([...ids, 'draft']);
    expect(http.delete).toHaveBeenCalledTimes(ids.length);
    expect(peak).toBeLessThanOrEqual(5);
    expect(results).toHaveLength(ids.length);
    expect(results.slice(0, 3)).toEqual([{ id: 'draft', deleted: true }, { id: 'published', archived: true }, { id: 'failure', failed: true }]);
    expect(results.filter((r) => r.deleted)).toHaveLength(10);
  });
});

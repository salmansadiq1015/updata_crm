import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useClientPagination } from './use-client-pagination';

const makeItems = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('useClientPagination', () => {
  it('returns the first page slice', () => {
    const { result } = renderHook(() => useClientPagination(makeItems(25), 10));
    expect(result.current.total).toBe(25);
    expect(result.current.pageItems).toEqual(makeItems(10));
    expect(result.current.page).toBe(1);
  });

  it('returns the requested page slice', () => {
    const { result } = renderHook(() => useClientPagination(makeItems(25), 10));
    act(() => result.current.setPage(3));
    expect(result.current.pageItems).toEqual([21, 22, 23, 24, 25]);
  });

  it('clamps back to page 1 when items shrink below the current page', () => {
    let items = makeItems(25);
    const { result, rerender } = renderHook(({ data }) => useClientPagination(data, 10), {
      initialProps: { data: items },
    });
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    items = makeItems(5);
    rerender({ data: items });
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toEqual([1, 2, 3, 4, 5]);
  });
});

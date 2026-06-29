import { useState, useMemo } from 'react';

export function useClientPagination(items, pageSize = 10) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Derive a clamped page during render instead of correcting it in an effect.
  // Keeps the page valid when `items` shrinks below the current page range,
  // without a setState-in-effect cascade.
  const safePage = Math.min(page, pageCount);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  return { page: safePage, setPage, pageItems, total, pageSize };
}

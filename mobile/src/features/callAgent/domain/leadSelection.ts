// Explicit lead selection for the AI agent (pure; unit-tested). Order is the order
// of picking, and ids are never duplicated.

/** Toggle one id. In single mode the new id replaces the previous choice. */
export function toggleSelection(current: readonly string[], id: string, single = false): string[] {
  if (current.includes(id)) return current.filter((value) => value !== id);
  return single ? [id] : [...current, id];
}

/** Add every visible id that is not selected yet ("Select all shown"). */
export function selectAllVisible(current: readonly string[], visible: readonly string[]): string[] {
  const seen = new Set(current);
  const result = [...current];
  for (const id of visible) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

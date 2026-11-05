/** Literal, token-based name/email search. Each token can match a different field. */
export function buildUserSearchFilter(search) {
  const term = typeof search === 'string' ? search.trim() : '';
  if (!term) return {};
  return {
    $and: term.split(/\s+/).map(token => {
      const regex = { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      return { $or: [{ firstName: regex }, { lastName: regex }, { email: regex }] };
    }),
  };
}

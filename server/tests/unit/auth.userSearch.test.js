import { describe, it, expect, jest } from '@jest/globals';
import { buildUserSearchFilter } from '../../src/modules/auth/userSearch.js';

const find = jest.fn();
jest.unstable_mockModule('../../src/modules/auth/user.model.js', () => ({ default: { find } }));
const { default: repository } = await import('../../src/modules/auth/user.repository.js');
const { encodeCursor } = await import('../../src/shared/utils/pagination.js');

function matches(user, search) {
  const filter = buildUserSearchFilter(search);
  return !filter.$and || filter.$and.every(clause => clause.$or.some(condition => {
    const [field, regex] = Object.entries(condition)[0];
    return new RegExp(regex.$regex, regex.$options).test(user[field] || '');
  }));
}

describe('literal user search', () => {
  it('matches full names, reversed names and combined name/email terms', () => {
    const user = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' };
    expect(matches(user, ' Ada   Lovelace ')).toBe(true);
    expect(matches(user, 'lovelace ADA')).toBe(true);
    expect(matches(user, 'Ada example.com')).toBe(true);
    expect(matches(user, 'Ada Charles')).toBe(false);
  });
  it('treats regex syntax as literal input, including invalid regex characters', () => {
    expect(matches({ firstName: 'Any' }, '.*')).toBe(false);
    expect(matches({ firstName: 'A[lice' }, '[')).toBe(true);
    expect(matches({ email: 'a+b@example.com' }, 'a+b')).toBe(true);
    expect(matches({ email: 'axb@example.com' }, 'a.b')).toBe(false);
    expect(buildUserSearchFilter('  ')).toEqual({});
  });
  it('preserves the cursor boundary and exact filters when searching', async () => {
    const chain = { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) };
    find.mockReturnValue(chain);
    const cursor = encodeCursor({ createdAt: '2026-01-01', _id: '123' }, 'createdAt');
    await repository.findWithCursor({ cursor, search: 'Ada Lovelace', filters: { status: 'active' } });
    const filter = find.mock.calls.at(-1)[0];
    expect(filter.status).toBe('active');
    expect(filter.$or).toHaveLength(2);
    expect(filter.$and).toHaveLength(2);
  });
});

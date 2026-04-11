/**
 * Pagination helpers for cursor-based and offset-based pagination.
 *
 * Cursor pagination:
 * - Encodes _id + sort field as base64 cursor.
 * - Fetches limit+1 to determine hasNext without count().
 * - O(log n) via index scan, vs O(n) for skip().
 *
 * Offset pagination:
 * - Uses skip/limit (acceptable for admin dashboards with known-small result sets).
 * - Includes totalItems and totalPages (requires count query — expensive at scale).
 */

/**
 * Encode cursor from a document.
 */
export function encodeCursor(doc, sortField = '_id') {
  const payload = {
    _id: doc._id.toString(),
  };
  if (sortField !== '_id' && doc[sortField] !== undefined) {
    payload[sortField] = doc[sortField] instanceof Date
      ? doc[sortField].toISOString()
      : doc[sortField];
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decode cursor into query conditions.
 */
export function decodeCursor(cursor) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Build cursor pagination query conditions.
 *
 * Returns a MongoDB filter for "next page after this cursor".
 * Uses compound sort on (sortField, _id) for deterministic ordering.
 */
export function buildCursorQuery(cursor, sortBy = 'createdAt', sortOrder = 'desc') {
  if (!cursor) return {};

  const decoded = decodeCursor(cursor);
  if (!decoded) return {};

  const isDesc = sortOrder === 'desc';
  const op = isDesc ? '$lt' : '$gt';

  // If sorting by a field other than _id, use compound condition
  // to handle ties in the sort field
  if (sortBy !== '_id' && decoded[sortBy] !== undefined) {
    return {
      $or: [
        { [sortBy]: { [op]: decoded[sortBy] } },
        { [sortBy]: decoded[sortBy], _id: { [op]: decoded._id } },
      ],
    };
  }

  return { _id: { [op]: decoded._id } };
}

/**
 * Build sort object for cursor pagination.
 */
export function buildCursorSort(sortBy = 'createdAt', sortOrder = 'desc') {
  const dir = sortOrder === 'desc' ? -1 : 1;
  if (sortBy === '_id') return { _id: dir };
  return { [sortBy]: dir, _id: dir };
}

/**
 * Build cursor pagination response.
 * Takes the fetched docs (limit+1) and returns { data, pagination }.
 */
export function buildCursorResponse(docs, limit, sortBy = 'createdAt') {
  const hasNext = docs.length > limit;
  const data = hasNext ? docs.slice(0, limit) : docs;
  const nextCursor = hasNext && data.length > 0
    ? encodeCursor(data[data.length - 1], sortBy)
    : null;

  return {
    data,
    pagination: {
      hasNext,
      nextCursor,
      limit,
    },
  };
}

/**
 * Build offset pagination response.
 */
export function buildOffsetResponse(docs, totalItems, page, pageSize) {
  return {
    data: docs,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}

export default {
  encodeCursor,
  decodeCursor,
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
  buildOffsetResponse,
};

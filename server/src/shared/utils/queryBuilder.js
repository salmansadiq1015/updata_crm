/**
 * Builds MongoDB filter and sort objects from Express query params.
 *
 * Whitelists allowed filter fields per endpoint to prevent
 * arbitrary query injection. Unknown params are silently ignored.
 */

/**
 * Build a MongoDB filter from query params.
 *
 * @param {object} query - Express req.query
 * @param {object} allowedFilters - { fieldName: 'exact' | 'regex' | 'in' | 'date' | 'boolean' }
 * @returns {object} MongoDB filter
 */
export function buildFilter(query, allowedFilters) {
  const filter = {};

  for (const [field, type] of Object.entries(allowedFilters)) {
    const value = query[field];
    if (value === undefined || value === '') continue;

    switch (type) {
      case 'exact':
        filter[field] = value;
        break;

      case 'objectId':
        filter[field] = value;
        break;

      case 'regex':
        // Case-insensitive search — only for short, indexed text fields
        filter[field] = { $regex: escapeRegex(value), $options: 'i' };
        break;

      case 'in':
        // Comma-separated values → $in
        filter[field] = { $in: value.split(',').map((v) => v.trim()) };
        break;

      case 'boolean':
        filter[field] = value === 'true' || value === '1';
        break;

      case 'dateFrom':
        if (!filter[field]) filter[field] = {};
        filter[field].$gte = new Date(value);
        break;

      case 'dateTo':
        if (!filter[field]) filter[field] = {};
        filter[field].$lte = new Date(value);
        break;

      case 'number':
        filter[field] = Number(value);
        break;

      case 'numberGte':
        if (!filter[field]) filter[field] = {};
        filter[field].$gte = Number(value);
        break;

      case 'numberLte':
        if (!filter[field]) filter[field] = {};
        filter[field].$lte = Number(value);
        break;

      default:
        break;
    }
  }

  return filter;
}

/**
 * Build a MongoDB sort object from query params.
 *
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - 'asc' or 'desc'
 * @param {string[]} allowedSortFields - Whitelist of sortable fields
 * @returns {object} MongoDB sort object
 */
export function buildSort(sortBy = 'createdAt', sortOrder = 'desc', allowedSortFields = ['createdAt', '_id']) {
  const field = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
  const dir = sortOrder === 'asc' ? 1 : -1;
  return { [field]: dir };
}

/**
 * Escape special regex characters in user input.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default { buildFilter, buildSort };

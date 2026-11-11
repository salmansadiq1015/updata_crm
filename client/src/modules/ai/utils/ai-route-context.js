/**
 * What the assistant knows about where the question was asked from.
 *
 * Standing on a record and asking "kann ich das abschliessen?" should not
 * require naming the project again. The page is the context.
 *
 * Only records the agent can actually resolve appear here. The server
 * understands eight kinds — customer, project, order, assignment,
 * installation, task, report and, through its site, a customer — and a route
 * whose record is none of those would send an identifier nothing reads.
 */
const ROUTE_CONTEXT_PATTERNS = [
  {
    pattern: /^\/field-ops\/orders\/([^/]+)/i,
    contextModule: 'field-ops',
    recordType: 'assignment',
  },
  {
    pattern: /^\/orders\/([^/]+)/i,
    contextModule: 'mobile',
    recordType: 'assignment',
  },
  {
    pattern: /^\/projects\/([^/]+)/i,
    contextModule: 'projects',
    recordType: 'project',
  },
  {
    pattern: /^\/crm\/customers\/([^/]+)/i,
    contextModule: 'crm',
    recordType: 'customer',
  },
  {
    pattern: /^\/crm\/installations\/([^/]+)/i,
    contextModule: 'crm',
    recordType: 'installation',
  },
  // The object page: the plants and the history hang off it, and the question
  // asked there is nearly always about the customer who owns it.
  {
    pattern: /^\/crm\/sites\/([^/]+)/i,
    contextModule: 'crm',
    recordType: 'site',
  },
  // A vehicle page: "set the meter to 90'000" means this vehicle.
  {
    pattern: /^\/vehicles\/([^/]+)/i,
    contextModule: 'vehicles',
    recordType: 'vehicle',
  },
  // A task lives two segments deep, under the list it belongs to.
  {
    pattern: /^\/tasks\/[^/]+\/([^/]+)/i,
    contextModule: 'tasks',
    recordType: 'task',
  },
];

/**
 * Pages that hold their record in the query rather than in the path. Both are
 * lists that open one row — the row is what the question is about.
 */
const QUERY_CONTEXT_PARAMS = [
  { param: 'reportId', contextModule: 'field-ops', recordType: 'report' },
  { param: 'assignmentId', contextModule: 'scheduling', recordType: 'assignment' },
];

const NON_RECORD_SEGMENTS = new Set(['create', 'new', 'dashboard', 'all']);

function cleanRecordId(value) {
  const raw = String(value || '').trim();
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  if (!decoded || NON_RECORD_SEGMENTS.has(decoded.toLowerCase())) return null;
  return decoded;
}

function shape({ contextModule, recordType, recordId, path }) {
  const context = {
    source: 'route',
    contextModule,
    recordType,
    recordId,
    pathname: path,
  };

  // An assignment is what the field calls an order, and the server reads it
  // under that name.
  if (recordType === 'assignment') {
    return {
      ...context,
      contextRecordType: 'order',
      contextRecordId: recordId,
      orderId: recordId,
    };
  }

  return {
    ...context,
    contextRecordType: recordType,
    contextRecordId: recordId,
  };
}

/**
 * @param {string} pathname
 * @param {URLSearchParams|string|null} [search] the current query, where the
 *   caller sits under a Suspense boundary and can read it.
 */
export function buildAiRouteContext(pathname, search = null) {
  const path = String(pathname || '').split(/[?#]/)[0];
  if (!path) return null;

  // The query wins: on a list that has opened one row, the row is the subject.
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  if (params) {
    for (const entry of QUERY_CONTEXT_PARAMS) {
      const recordId = cleanRecordId(params.get(entry.param));
      if (recordId) {
        return shape({ ...entry, recordId, path });
      }
    }
  }

  for (const route of ROUTE_CONTEXT_PATTERNS) {
    const match = path.match(route.pattern);
    const recordId = cleanRecordId(match?.[1]);
    if (!recordId) continue;
    return shape({ ...route, recordId, path });
  }

  return null;
}

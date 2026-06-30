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
];

const NON_RECORD_SEGMENTS = new Set(['create', 'new']);

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

export function buildAiRouteContext(pathname) {
  const path = String(pathname || '').split(/[?#]/)[0];
  if (!path) return null;

  for (const route of ROUTE_CONTEXT_PATTERNS) {
    const match = path.match(route.pattern);
    const recordId = cleanRecordId(match?.[1]);
    if (!recordId) continue;

    const context = {
      source: 'route',
      contextModule: route.contextModule,
      recordType: route.recordType,
      recordId,
      pathname: path,
    };

    if (route.recordType === 'assignment') {
      return {
        ...context,
        contextRecordType: 'order',
        contextRecordId: recordId,
        orderId: recordId,
      };
    }

    return {
      ...context,
      contextRecordType: route.recordType,
      contextRecordId: recordId,
    };
  }

  return null;
}

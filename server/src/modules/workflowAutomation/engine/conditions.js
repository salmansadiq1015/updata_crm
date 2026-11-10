/**
 * Condition evaluation (pure). The runner first resolves every referenced field
 * (collectFields → context resolver), then evaluates the tree synchronously, so the
 * decision is reproducible and can be stored with the step ("branch explanation").
 *
 * Tree: { op: 'and'|'or', rules: [ { field, operator, value } | <tree> ] }
 */

export function collectFields(tree, out = new Set()) {
  for (const rule of tree?.rules || []) {
    if (Array.isArray(rule?.rules)) collectFields(rule, out);
    else if (rule?.field) out.add(rule.field);
  }
  return out;
}

const lower = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v);
const asList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const asNumber = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' ? NaN : Number(v));
const asDate = (v) => (v instanceof Date ? v : (v ? new Date(v) : null));
const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const truthy = (v) => v === true || ['true', 'yes', '1', 'y', 'ja', 'oui'].includes(String(lower(v)));
const falsy = (v) => v === false || ['false', 'no', '0', 'n', 'nein', 'non'].includes(String(lower(v)));

function equalsLoose(actual, expected) {
  if (Array.isArray(actual)) return actual.some((a) => equalsLoose(a, expected));
  if (typeof actual === 'boolean' || typeof expected === 'boolean') {
    return (truthy(actual) && truthy(expected)) || (falsy(actual) && falsy(expected));
  }
  const na = asNumber(actual); const ne = asNumber(expected);
  if (Number.isFinite(na) && Number.isFinite(ne)) return na === ne;
  return String(lower(actual ?? '')) === String(lower(expected ?? ''));
}

export function evaluateRule(rule, actual, now = new Date()) {
  const { operator, value } = rule;
  switch (operator) {
    case 'equals': return !isEmpty(actual) && equalsLoose(actual, value);
    case 'not_equals': return !equalsLoose(actual, value);
    case 'contains': {
      if (Array.isArray(actual)) return actual.some((a) => String(lower(a)).includes(String(lower(value))));
      return !isEmpty(actual) && String(lower(actual)).includes(String(lower(value)));
    }
    case 'not_contains': return !evaluateRule({ operator: 'contains', value }, actual, now);
    case 'in': return asList(value).some((v) => equalsLoose(actual, v));
    case 'not_in': return !asList(value).some((v) => equalsLoose(actual, v));
    case 'gt': return asNumber(actual) > asNumber(value);
    case 'gte': return asNumber(actual) >= asNumber(value);
    case 'lt': return asNumber(actual) < asNumber(value);
    case 'lte': return asNumber(actual) <= asNumber(value);
    case 'exists': return !isEmpty(actual);
    case 'not_exists': return isEmpty(actual);
    case 'is_true': return truthy(actual);
    case 'is_false': return !truthy(actual);
    case 'before': { const a = asDate(actual); const b = asDate(value); return Boolean(a && b && a < b); }
    case 'after': { const a = asDate(actual); const b = asDate(value); return Boolean(a && b && a > b); }
    case 'within_last_hours': {
      const a = asDate(actual); const h = asNumber(value);
      return Boolean(a && Number.isFinite(h) && now - a <= h * 3_600_000 && a <= now);
    }
    case 'older_than_hours': {
      const a = asDate(actual); const h = asNumber(value);
      return Boolean(a && Number.isFinite(h) && now - a > h * 3_600_000);
    }
    default: return false;
  }
}

/**
 * @param {object} tree condition tree
 * @param {Map|object} values field → resolved value
 * @returns {{ result: boolean, trace: Array<{field, operator, value, actual, result}> }}
 */
export function evaluateCondition(tree, values, now = new Date()) {
  const get = (f) => (values instanceof Map ? values.get(f) : values?.[f]);
  const trace = [];
  const walk = (node) => {
    const rules = node?.rules || [];
    if (!rules.length) return false;
    const results = rules.map((rule) => {
      if (Array.isArray(rule?.rules)) return walk(rule);
      const actual = get(rule.field);
      const result = evaluateRule(rule, actual, now);
      trace.push({ field: rule.field, operator: rule.operator, value: rule.value ?? null, actual: summarize(actual), result });
      return result;
    });
    return node.op === 'or' ? results.some(Boolean) : results.every(Boolean);
  };
  return { result: walk(tree), trace };
}

function summarize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => (typeof v === 'object' ? String(v) : v));
  if (value && typeof value === 'object') return '[object]';
  if (typeof value === 'string') return value.slice(0, 200);
  return value ?? null;
}

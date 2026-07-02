const EMPTY_INTEGRATIONS = Object.freeze([]);

const ISSUE_STATUSES = new Set(['down', 'degraded']);

export function normalizeIntegrationListResponse(response) {
  const data = response?.data ?? response;
  return Array.isArray(data) ? data : EMPTY_INTEGRATIONS;
}

export function normalizeSyncHistoryResponse(response) {
  return {
    items: Array.isArray(response?.data) ? response.data : [],
    pagination: response?.pagination ?? null,
  };
}

export function calculateIntegrationSummary(items) {
  const integrations = Array.isArray(items) ? items : EMPTY_INTEGRATIONS;
  const total = integrations.length;
  const enabled = integrations.filter((item) => item.isEnabled).length;
  const healthy = integrations.filter((item) => item.status === 'healthy').length;
  const disabled = integrations.filter((item) => item.status === 'disabled' || !item.isEnabled).length;
  const issues = integrations.filter((item) => ISSUE_STATUSES.has(item.status)).length;
  const unknown = integrations.filter((item) => !item.status || item.status === 'unknown').length;
  const checksLast24h = integrations.reduce((sum, item) => sum + Number(item.checksLast24h || 0), 0);
  const avgResponseTimeMs = Math.round(
    integrations.reduce((sum, item) => sum + Number(item.avgResponseTimeMs || 0), 0) / Math.max(total, 1),
  );
  const averageErrorRate = Math.round(
    integrations.reduce((sum, item) => sum + Number(item.errorRate || 0), 0) / Math.max(total, 1),
  );
  const uptimePercent = total > 0 ? Math.round((healthy / total) * 100) : 0;

  return {
    total,
    enabled,
    healthy,
    disabled,
    issues,
    unknown,
    checksLast24h,
    avgResponseTimeMs,
    averageErrorRate,
    uptimePercent,
  };
}

export function filterIntegrations(items, filters = {}) {
  const integrations = Array.isArray(items) ? items : EMPTY_INTEGRATIONS;
  const search = String(filters.search || '').trim().toLowerCase();
  const status = filters.status || 'all';

  return integrations.filter((item) => {
    const matchesSearch = !search || [
      item.displayName,
      item.integrationKey,
      item.provider,
      item.status,
      item.lastErrorMessage,
    ].some((value) => String(value || '').toLowerCase().includes(search));

    if (!matchesSearch) return false;
    if (status === 'all') return true;
    if (status === 'active') return item.isEnabled;
    if (status === 'issues') return ISSUE_STATUSES.has(item.status);
    if (status === 'disabled') return item.status === 'disabled' || !item.isEnabled;
    return item.status === status;
  });
}

export function getIntegrationOperationalState(item) {
  if (!item) return 'unknown';
  if (!item.isEnabled || item.status === 'disabled') return 'disabled';
  if (ISSUE_STATUSES.has(item.status)) return 'attention';
  if (item.status === 'healthy') return 'operational';
  return 'unknown';
}

export function formatIntegrationConfigJson(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return '{}';
  return JSON.stringify(config, null, 2);
}

export function createIntegrationConfigFormValues(integration) {
  return {
    displayName: integration?.displayName || '',
    provider: integration?.provider || '',
    syncSchedule: integration?.syncSchedule || '',
    credentialsRef: integration?.credentialsRef || '',
    configJson: formatIntegrationConfigJson(integration?.config),
  };
}

export function buildIntegrationConfigPayload(formValues = {}) {
  let parsedConfig = {};
  const configText = String(formValues.configJson || '').trim();

  if (configText) {
    try {
      parsedConfig = JSON.parse(configText);
    } catch {
      return { ok: false, errorCode: 'invalid_json' };
    }

    if (!parsedConfig || typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
      return { ok: false, errorCode: 'invalid_json_object' };
    }
  }

  const payload = { config: parsedConfig };

  const displayName = String(formValues.displayName || '').trim();
  if (displayName) payload.displayName = displayName;

  for (const key of ['provider', 'syncSchedule', 'credentialsRef']) {
    const value = String(formValues[key] || '').trim();
    payload[key] = value || null;
  }

  return { ok: true, payload };
}

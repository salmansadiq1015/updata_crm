import { pathToFileURL } from 'node:url';

export function evaluatePreflightResponse(payload) {
  const readiness = payload?.data?.operations?.readiness;
  if (!readiness || !Array.isArray(readiness.checks)) {
    throw new Error('Messaging health response did not contain a deployment-preflight report');
  }
  return {
    exitCode: readiness.ready ? 0 : 1,
    ready: Boolean(readiness.ready),
    counts: readiness.counts,
    actionable: readiness.checks.filter((check) => check.status !== 'pass'),
  };
}

export async function runMessagingPreflight({
  apiUrl = process.env.MESSAGING_PREFLIGHT_API_URL || process.env.MESSAGING_PUBLIC_API_URL,
  token = process.env.MESSAGING_PREFLIGHT_BEARER_TOKEN,
  fetchImpl = globalThis.fetch,
  output = console,
} = {}) {
  if (!apiUrl) throw new Error('Set MESSAGING_PREFLIGHT_API_URL or MESSAGING_PUBLIC_API_URL');
  if (!token) throw new Error('Set MESSAGING_PREFLIGHT_BEARER_TOKEN to a current settings:read user token');
  const endpoint = new URL('/api/v1/messaging/settings/health', apiUrl).toString();
  const response = await fetchImpl(endpoint, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Messaging preflight request failed with HTTP ${response.status}`);
  }
  const report = evaluatePreflightResponse(payload);
  output.log(`Messaging deployment preflight: ${report.ready ? 'READY' : 'BLOCKED'}`);
  output.log(`Passed ${report.counts.pass}; warnings ${report.counts.warn}; failed ${report.counts.fail}`);
  for (const check of report.actionable) output.log(`[${check.status.toUpperCase()}] ${check.label}: ${check.detail}`);
  return report;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runMessagingPreflight()
    .then((report) => { process.exitCode = report.exitCode; })
    .catch((error) => {
      console.error(`Messaging deployment preflight could not run: ${error.message}`);
      process.exitCode = 2;
    });
}

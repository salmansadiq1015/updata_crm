import { CrmClient, normalizeApiBase } from './crmClient.js';

/** An explicit URL change keeps this phone's credentials, port and outbox.
 * Verify the existing token and phone identity before persisting a new target.
 */
export async function reconnectConfig(config, apiBase, { connect = client => client.connection() } = {}) {
  const target = normalizeApiBase(apiBase);
  const identity = await connect(new CrmClient({ apiBase: target, token: config.token }));
  if (identity?.deviceId !== config.deviceId) throw new Error('This CRM does not recognize the saved phone identity. The saved connection was not changed.');
  return { ...config, apiBase: target };
}

import CallConsent from '../modules/aiCalling/callConsent.model.js';
import CallProviderAttempt from '../modules/aiCalling/callProviderAttempt.model.js';

export const name = '024_ai_calling_security_indexes';

export async function up() {
  await Promise.all([CallConsent.createIndexes(), CallProviderAttempt.createIndexes()]);
}

export async function down() {
  // Evidence collections are intentionally retained. Rollback only removes the
  // migration marker; destructive data removal requires a separate operation.
}

export default { name, up, down };

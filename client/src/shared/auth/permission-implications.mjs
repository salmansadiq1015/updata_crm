/**
 * Client mirror of PERMISSION_IMPLICATIONS in server/src/shared/middleware/authenticate.js.
 * A coarse permission grants finer-grained ones (one hop, like the server's
 * satisfiesPermission). Keep it identical to the server map: the server test
 * tests/unit/permissionImplications.mirror.test.js fails when the two drift.
 */
export const PERMISSION_IMPLICATIONS = Object.freeze({
  'email:manage': ['email:read'],
  'email:write': ['email:read'],
  'email:send': ['email:read', 'email:write'],
  'email:ai': ['email:read'],
  'ai-calling:admin': ['ai-calling:read', 'ai-calling:write', 'inbound-calls:read', 'inbound-calls:write', 'inbound-calls:admin'],
  // Incoming calls use the same agents and phones as AI calling.
  'ai-calling:read': ['inbound-calls:read'],
  'ai-calling:write': ['inbound-calls:read', 'inbound-calls:write'],
  'inbound-calls:admin': ['inbound-calls:read', 'inbound-calls:write'],
  'inbound-calls:write': ['inbound-calls:read'],
  'projects:read': [
    'project:read',
    'project:documents:read',
    'project:prep-actions:read',
    'project:schedule:read',
    'project:status:read',
    'chat:read',
  ],
  'projects:write': [
    'project:create',
    'project:edit',
    'project:status:update',
    'project:prep-actions:manage',
    'project:schedule:manage',
    'project:documents:create',
    'project:documents:write',
    'chat:write',
  ],
  'projects:admin': [
    'project:status:override',
  ],
  'projects:delete': [
    'project:delete',
    'project:documents:delete',
  ],
  'project:documents:read': [
    'documents:read',
  ],
  'project:documents:write': [
    'documents:write',
    'files:upload',
  ],
  'project:documents:delete': [
    'documents:delete',
  ],
  'templates:read': [
    'documents:read',
  ],
  'templates:write': [
    'documents:write',
    'files:upload',
  ],
  'templates:delete': [
    'documents:delete',
  ],
  'quotations:read': [
    'documents:read',
  ],
  'invoicing:read': [
    'documents:read',
  ],
  'accounting:documents:read': [
    'documents:read',
  ],
  'accounting:documents:manage': [
    'documents:write',
    'files:upload',
  ],
  'crm:write': [
    'documents:write',
    'files:upload',
    // AI voice calling: anyone who can write CRM data can build/run call campaigns.
    'ai-calling:read',
    'ai-calling:write',
    'inbound-calls:read',
    'inbound-calls:write',
  ],
  // Reading leads/CRM data is enough to view call campaigns, history and analytics.
  'crm:read': [
    'ai-calling:read',
    'inbound-calls:read',
  ],
  'lead:read': [
    'ai-calling:read',
    'inbound-calls:read',
  ],
  // Full CRM administration covers the sensitive call operations (reconcile).
  'crm:admin': [
    'ai-calling:read',
    'ai-calling:write',
    'ai-calling:admin',
    'inbound-calls:read',
    'inbound-calls:write',
    'inbound-calls:admin',
    'analytics:attribution:read',
    'lead:assign-policy',
  ],
  'field-service:read': [
    'mobile:read',
    'chat:read',
    'field-ticket:read',
    'field-ticket:comment',
  ],
  'field-service:write': [
    'mobile:write',
    'chat:write',
    'files:upload',
    'field-ticket:write',
    'field-ticket:comment',
  ],
  'field-service:admin': [
    'field-ticket:read',
    'field-ticket:write',
    'field-ticket:assign',
    'field-ticket:comment',
    'field-ticket:admin',
  ],
  'field-ticket:write': [
    'field-ticket:read',
    'field-ticket:comment',
    'files:upload',
  ],
  'field-ticket:assign': [
    'field-ticket:read',
    'field-ticket:write',
  ],
  'field-ticket:admin': [
    'field-ticket:read',
    'field-ticket:write',
    'field-ticket:assign',
    'field-ticket:comment',
  ],
  // Platform governance: user administrators manage teams.
  'users:admin': [
    'team:read',
    'team:manage',
  ],
  'team:manage': [
    'team:read',
  ],
  'chat:write': [
    'chat:read',
  ],
  'chat:admin': [
    'chat:read',
    'chat:write',
  ],
  'time-tracking:write': [
    'time-tracking:read',
  ],
  'time-tracking:admin': [
    'time-tracking:read',
    'time-tracking:write',
    'time:release:override',
  ],
  'files:upload': [
    'files:view',
  ],
  'files:list': [
    'files:view',
  ],
  'catalog:write': [
    'catalog:manage',
  ],
  'catalog:admin': [
    'catalog:manage',
    'catalog:igh:manage',
    'catalog:pricing',
  ],
  'catalog:price': [
    'catalog:pricing',
  ],
  'catalog:pricing': [
    'catalog:price',
  ],
  'catalog:manage': [
    'catalog:write',
  ],
});
/** True when `required` is held directly or implied by any held permission (server semantics). */
export function satisfiesPermission(held, required) {
  if (held.includes(required)) return true;
  for (const p of held) {
    const implied = PERMISSION_IMPLICATIONS[p];
    if (implied && implied.includes(required)) return true;
  }
  return false;
}

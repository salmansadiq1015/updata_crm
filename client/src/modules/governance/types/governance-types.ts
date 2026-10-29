export type TeamMemberRole = 'member' | 'supervisor' | 'manager';

export interface TeamMember {
  userId: string;
  role: TeamMemberRole;
  addedAt?: string | null;
  user?: { id: string; firstName: string; lastName: string; email: string; status?: string | null } | null;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  leadScope: { shareUnassigned: boolean; sources: string[] };
  members: TeamMember[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TeamInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  leadScope?: { shareUnassigned?: boolean; sources?: string[] };
  members?: Array<{ userId: string; role: TeamMemberRole }>;
}

export interface GovernanceSettings {
  leadAccessMode: 'company' | 'team';
  accessReasonRequired: boolean;
  accessGrantMinutes: number;
  piiMaskingEnabled: boolean;
  piiMaskedForMe: boolean;
  canViewPii: boolean;
  canReadAllLeads: boolean;
  canReadAccessLog: boolean;
  simSmsCostRecorded: boolean;
}

export type RevealPurpose = 'view' | 'call' | 'sms' | 'whatsapp' | 'email';
export type RevealField = 'phone' | 'mobile' | 'email';

export interface RevealResult {
  leadId: string;
  purpose: RevealPurpose;
  values: Partial<Record<RevealField, string | null>>;
}

export interface AccessGrant {
  required: boolean;
  leadId: string;
  reason?: string;
  grantedAt?: string;
  expiresAt?: string;
}

export type AccessLogAction = 'grant' | 'access' | 'reveal' | 'export';

export interface AccessLogEntry {
  id: string;
  timestamp: string;
  eventType: string;
  result: 'success' | 'failure';
  userId: string | null;
  userName: string | null;
  leadId: string | null;
  leadName: string | null;
  action: string;
  reason: string | null;
  purpose: string | null;
  fields: string[] | null;
  path: string | null;
  piiMasked: boolean | null;
  ipAddress: string | null;
}

export interface AccessLogFilters {
  userId?: string;
  leadId?: string;
  action?: AccessLogAction;
  from?: string;
  to?: string;
}

export interface AccessLogPage {
  data: AccessLogEntry[];
  pagination: { hasNext: boolean; nextCursor: string | null; limit: number };
}

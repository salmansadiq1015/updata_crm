export type LeadCallLifecycle = {
  callId: string | null;
  campaignId: string | null;
  callStatus: string | null;
  qualificationStatus: string | null;
  outcome: string | null;
  evaluatedAt: string | null;
  missingFields: string[];
  recommendedAction: string | null;
};

export function readLeadCallLifecycle(value: unknown): LeadCallLifecycle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const str = (key: string) => typeof raw[key] === 'string' ? raw[key] as string : null;
  return {
    callId: str('callId'), campaignId: str('campaignId'), callStatus: str('callStatus'),
    qualificationStatus: str('qualificationStatus'), outcome: str('outcome'), evaluatedAt: str('evaluatedAt'),
    missingFields: Array.isArray(raw.missingFields) ? raw.missingFields.filter((v): v is string => typeof v === 'string') : [],
    recommendedAction: str('recommendedAction'),
  };
}

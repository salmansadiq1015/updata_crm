export type AttributionGroupBy = 'campaign' | 'channel' | 'agent';
export type AttributionModel = 'first' | 'last' | 'linear';

export interface AttributionRow {
  key: string;
  label: string | null;
  touches: number;
  leadsTouched: number;
  qualifiedLeads: number;
  convertedLeads: number;
  qualifiedCredit: number;
  convertedCredit: number;
  spend: number | null;
  spendByCurrency: Record<string, number>;
  revenue: number | null;
  revenueByCurrency: Record<string, number>;
  costPerQualifiedLead: number | null;
  costPerConversion: number | null;
  profit: number | null;
  roi: number | null;
  excluded: { touchesCostNotRecorded: number; conversionsRevenueNotRecorded: number; currenciesWithoutRate: string[] };
}

export interface AttributionReport {
  period: { from: string; to: string };
  groupBy: AttributionGroupBy;
  model: AttributionModel;
  currency: string;
  rows: AttributionRow[];
  totals: AttributionRow;
  timeline: Array<{ date: string; touches: number; spend: number | null; touchesCostNotRecorded: number }>;
  excluded: { leadsTouchedOnlyAfterConversion: number; touchesOutsideLeadScope: number; truncatedSources: string[] };
  exchangeRates: Array<{ from: string; to: string; rate: number | null; rateDate?: string; missing?: boolean }>;
  assumptions: { leadAccessMode: string; simSmsCostRecorded: boolean; revenueBasis: string };
}

export interface AttributionParams {
  from?: string;
  to?: string;
  groupBy: AttributionGroupBy;
  model: AttributionModel;
  currency: string;
  includeDiscovery?: boolean;
}

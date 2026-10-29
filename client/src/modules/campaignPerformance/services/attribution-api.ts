import api from '@/lib/api/client';
import type { AttributionParams, AttributionReport } from '../types/attribution-types';

/** Campaign performance / attribution — /api/v1/analytics/attribution. */
const root = '/analytics/attribution';

export const attributionApi = {
  async report(params: AttributionParams): Promise<AttributionReport> {
    const res = await api.get(root, { params }) as unknown as { data: AttributionReport };
    return res.data;
  },
  async exportCsv(params: AttributionParams): Promise<Blob> {
    const res = await api.get(`${root}/export`, { params, responseType: 'blob' }) as { _raw?: { data?: Blob }; data?: Blob };
    return (res?._raw?.data ?? res?.data) as Blob;
  },
};

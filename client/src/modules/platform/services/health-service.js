import axios from 'axios';
import { resolveApiOrigin } from '@/lib/api/config';

const BASE = resolveApiOrigin() || 'http://localhost:9097';

export const healthService = {
  async getStatus() {
    try {
      const res = await axios.get(`${BASE}/health/ready`, { timeout: 5000 });
      return res.data?.data || res.data || { status: 'healthy' };
    } catch {
      return { status: 'unhealthy' };
    }
  },
};

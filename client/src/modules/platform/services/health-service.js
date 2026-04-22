import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:9097';

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

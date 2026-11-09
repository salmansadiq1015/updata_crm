import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

export const liveVoiceService = {
  status: () => apiClient.get(ENDPOINTS.AI.VOICE_AGENT_STATUS).then((r) => r.data),
  createSession: (payload) => apiClient.post(ENDPOINTS.AI.VOICE_AGENT_SESSION, payload).then((r) => r.data),
  // Agent runs are awaited server-side; allow longer than the default 30 s.
  runTool: (payload) => apiClient.post(ENDPOINTS.AI.VOICE_AGENT_TOOL, payload, { timeout: 70000 }).then((r) => r.data),

  /** SDP offer → answer exchange with OpenAI using the ephemeral secret. */
  async exchangeSdp({ sdp, clientSecret, fetchImpl = fetch }) {
    const res = await fetchImpl(REALTIME_CALLS_URL, {
      method: 'POST',
      body: sdp,
      headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const error = new Error(`Realtime connection failed (${res.status})`);
      error.status = res.status;
      error.detail = detail.slice(0, 500);
      throw error;
    }
    return res.text();
  },
};

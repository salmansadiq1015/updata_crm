import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { ENDPOINTS } from '@/services/api/endpoints';

import {
  activeCallListSchema,
  pairedDeviceListSchema,
  pairedDeviceSchema,
  voiceSettingsSchema,
} from '../types';

const okSchema = z.object({ ok: z.boolean().optional() }).passthrough();

export const pairedPhoneApi = {
  async devices(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.pairedPhone.devices, pairedDeviceListSchema, { signal });
    return data.filter((d) => !d.revoked);
  },
  async clear(id: string) {
    const { data } = await api.post(ENDPOINTS.pairedPhone.clear(id), {}, pairedDeviceSchema);
    return data;
  },
  async voiceSettings(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.aiCalling.settings, voiceSettingsSchema, { signal });
    return data;
  },
  async setVoicePaused(voicePaused: boolean) {
    const { data } = await api.put(
      ENDPOINTS.aiCalling.settings,
      { voicePaused, reason: voicePaused ? 'Paused from the mobile app' : '' },
      voiceSettingsSchema,
    );
    return data;
  },
  async activeCalls(campaignId: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.aiCalling.activeCalls(campaignId), activeCallListSchema, {
      signal,
    });
    return data;
  },
  async takeover(recordId: string) {
    const { data } = await api.post(ENDPOINTS.pairedPhone.takeover(recordId), {}, okSchema);
    return data;
  },
  async hangup(recordId: string) {
    const { data } = await api.post(ENDPOINTS.pairedPhone.hangup(recordId), {}, okSchema);
    return data;
  },
};

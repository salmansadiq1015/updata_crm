import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { DeviceLimits, PairedDevice, VoiceSettings } from '../types/ai-calling-types';

// apiClient's response interceptor unwraps the envelope to { data, pagination }.
const unwrap = <T,>(res: unknown): T => ((res as { data?: T }).data ?? res) as T;

export const pairedPhoneApi = {
  async devices(): Promise<PairedDevice[]> {
    return unwrap<PairedDevice[]>(await apiClient.get(ENDPOINTS.PAIRED_PHONE.DEVICES));
  },
  async device(id: string): Promise<PairedDevice> {
    return unwrap<PairedDevice>(await apiClient.get(ENDPOINTS.PAIRED_PHONE.DEVICE(id)));
  },
  async pairingCode(input: { deviceName: string; phoneLabel?: string }): Promise<{ code: string; expiresAt: string }> {
    return unwrap(await apiClient.post(ENDPOINTS.PAIRED_PHONE.PAIRING_CODE, input));
  },
  async update(id: string, input: { name?: string; phoneLabel?: string; limits?: Partial<DeviceLimits> }): Promise<PairedDevice> {
    return unwrap<PairedDevice>(await apiClient.patch(ENDPOINTS.PAIRED_PHONE.DEVICE(id), input));
  },
  async revoke(id: string): Promise<PairedDevice> {
    return unwrap<PairedDevice>(await apiClient.post(ENDPOINTS.PAIRED_PHONE.REVOKE(id)));
  },
  async verifyAudio(id: string, input: { inboundPhraseHeard: boolean; outboundPhraseHeard: boolean; note: string }): Promise<PairedDevice> {
    return unwrap<PairedDevice>(await apiClient.post(ENDPOINTS.PAIRED_PHONE.VERIFY_AUDIO(id), input));
  },
  async rotateKey(id: string): Promise<PairedDevice> {
    return unwrap<PairedDevice>(await apiClient.post(ENDPOINTS.PAIRED_PHONE.ROTATE_KEY(id)));
  },
  async clear(id: string): Promise<PairedDevice> {
    return unwrap<PairedDevice>(await apiClient.post(ENDPOINTS.PAIRED_PHONE.CLEAR(id)));
  },
  async takeover(callRecordId: string) {
    return unwrap<{ ok: boolean }>(await apiClient.post(ENDPOINTS.PAIRED_PHONE.TAKEOVER(callRecordId)));
  },
  async hangup(callRecordId: string) {
    return unwrap<{ ok: boolean }>(await apiClient.post(ENDPOINTS.PAIRED_PHONE.HANGUP(callRecordId)));
  },
  async voiceSettings(): Promise<VoiceSettings> {
    return unwrap<VoiceSettings>(await apiClient.get(ENDPOINTS.AI_CALLING.SETTINGS));
  },
  async setVoicePaused(voicePaused: boolean, reason = ''): Promise<VoiceSettings> {
    return unwrap<VoiceSettings>(await apiClient.put(ENDPOINTS.AI_CALLING.SETTINGS, { voicePaused, reason }));
  },
};

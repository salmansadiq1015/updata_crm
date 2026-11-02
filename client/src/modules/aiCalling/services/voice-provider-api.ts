import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export interface VoiceProviderSettings {
  primaryProvider: 'gemini'; secondaryProvider: 'openai'; primaryModel: string; secondaryModel: string;
  experimentalModel: string; geminiVoice: string; fallbackEnabled: boolean;
  maxSessionSeconds: number; maxCallCostUsd: number; connectionTimeoutMs: number;
  credentials: Record<string, { stored: boolean; apiEnvironmentConfigured: boolean }>;
  health: Record<string, { status: string; scope: string; checkedAt?: string; at?: string; model: string }>;
  pricing: Record<string, Record<string, number>>; pricingVerifiedAt: string;
}
export type VoiceProviderUpdate = Partial<Pick<VoiceProviderSettings, 'primaryModel' | 'secondaryModel' | 'experimentalModel' | 'geminiVoice' | 'fallbackEnabled' | 'maxSessionSeconds' | 'maxCallCostUsd' | 'connectionTimeoutMs'>> & { credentials?: Record<string, string | null> };
const base = `${ENDPOINTS.AI_CALLING.SETTINGS}/providers`;
const unwrap = <T,>(response: unknown): T => ((response as { data?: T }).data ?? response) as T;
export const voiceProviderApi = {
  get: async () => unwrap<VoiceProviderSettings>(await apiClient.get(base)),
  save: async (body: VoiceProviderUpdate) => unwrap<VoiceProviderSettings>(await apiClient.put(base, body)),
  test: async (provider: string) => unwrap<{ status: string; liveSessionVerified: boolean }>(await apiClient.post(`${base}/${provider}/test`, {})),
};

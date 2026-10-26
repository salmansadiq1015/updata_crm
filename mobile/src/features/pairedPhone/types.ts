// Paired phone = the user's own Android phone + SIM, reached from the CRM through an ESP32
// Bluetooth hands-free bridge on a laptop (server/src/modules/pairedPhone). The app only shows
// status and offers the owner's safe actions; pairing and the audio test happen on the laptop.
import { z } from 'zod';

const str = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const num = z
  .number()
  .nullish()
  .transform((v) => v ?? null);

export const pairedDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  phoneLabel: z.string().catch(''),
  revoked: z.boolean().catch(false),
  online: z.boolean().catch(false),
  lastHeartbeatAt: str,
  gateway: z.object({ version: str, platform: str }).partial().catch({}),
  board: z
    .object({
      connected: z.boolean().catch(false),
      firmware: str,
      keyProvisioned: z.boolean().catch(false),
      bdaddr: str,
    })
    .catch({ connected: false, firmware: null, keyProvisioned: false, bdaddr: null }),
  state: z
    .object({
      hfp: z.string().catch('disconnected'),
      call: z.number().catch(0),
      callsetup: z.number().catch(0),
      audio: z.string().catch('off'),
      signal: num,
      battery: num,
    })
    .catch({ hfp: 'disconnected', call: 0, callsetup: 0, audio: 'off', signal: null, battery: null }),
  keyState: z.string().catch('pending'),
  audioVerified: z.boolean().catch(false),
  audioVerifiedAt: str,
  limits: z
    .object({ cooldownSeconds: z.number(), maxCallsPerHour: z.number(), maxCallsPerDay: z.number() })
    .catch({ cooldownSeconds: 60, maxCallsPerHour: 20, maxCallsPerDay: 100 }),
  currentCallId: str,
  attention: z
    .object({ reason: z.string().catch(''), at: str })
    .nullish()
    .transform((v) => v ?? null),
  readiness: z
    .object({ ok: z.boolean(), reasons: z.array(z.string()).catch([]) })
    .catch({ ok: false, reasons: [] }),
  usage: z
    .object({ callsLastHour: z.number(), callsToday: z.number() })
    .nullish()
    .transform((v) => v ?? null),
  lastError: z
    .object({ code: z.string(), message: str })
    .nullish()
    .transform((v) => v ?? null),
});
export type PairedDevice = z.infer<typeof pairedDeviceSchema>;
export const pairedDeviceListSchema = z.array(pairedDeviceSchema);

export const voiceSettingsSchema = z.object({
  voicePaused: z.boolean(),
  pausedByEnv: z.boolean().catch(false),
  pausedAt: str,
});
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;

/** GET /ai-calling/campaigns/:id/active-calls (aiCalling.service.activeCalls). */
export const activeCallSchema = z.object({
  callId: z.string(),
  recordId: z.string(),
  leadName: z.string().catch('—'),
  state: z.string(),
  currentQuestion: str,
  phase: z.string().catch(''),
  answered: z.number().catch(0),
  total: z.number().catch(0),
  elapsedSeconds: z.number().catch(0),
  transport: z.string().catch('cloud_sip'),
  gateway: z
    .object({
      state: str,
      audioOpen: z.boolean().catch(false),
      audioLost: z.boolean().catch(false),
      takenOver: z.boolean().catch(false),
      command: str,
      audioAgeSeconds: num,
      audio: z
        .object({ rxLevelDbfs: num, txLevelDbfs: num, firstAiAudioMs: num, downUnderruns: num })
        .nullish()
        .transform((v) => v ?? null),
    })
    .nullish()
    .transform((v) => v ?? null),
});
export type ActiveCall = z.infer<typeof activeCallSchema>;
export const activeCallListSchema = z.array(activeCallSchema);

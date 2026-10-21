import { z } from 'zod';

/** GET /sim-calls/readiness (server/src/modules/simCall). Unknown fields are ignored. */
export const serverReadinessSchema = z.object({
  serverTime: z.string().nullish(),
  ai: z.object({ configured: z.boolean() }).passthrough(),
  cloudCalling: z.object({ configured: z.boolean(), reason: z.string().nullish() }).passthrough(),
});
export type ServerReadiness = z.infer<typeof serverReadinessSchema>;

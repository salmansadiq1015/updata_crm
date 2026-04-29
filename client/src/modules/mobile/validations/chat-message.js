import { z } from 'zod';

export const chatMessageSchema = z.object({
  messageType: z.enum(['TEXT', 'PHOTO', 'DOCUMENT']).default('TEXT'),
  content: z.string().min(1, 'Nachricht erforderlich').max(5000),
  attachmentUrl: z.string().optional().or(z.literal('')),
  mentions: z.array(z.string()).optional().default([]),
});

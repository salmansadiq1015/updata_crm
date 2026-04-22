import { z } from 'zod';

export const NOTE_CATEGORIES = ['general', 'warning', 'access_info', 'technical'];

export const createNoteSchema = z.object({
  text: z.string().min(1, 'Text erforderlich').max(2000),
  category: z.enum(NOTE_CATEGORIES).default('general'),
  isPinned: z.boolean().optional().default(false),
  isWarning: z.boolean().optional().default(false),
});

export const updateNoteSchema = createNoteSchema.partial();

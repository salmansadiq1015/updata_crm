import { z } from 'zod';

export const IMAGE_CATEGORIES = ['nameplate', 'damage', 'before_after', 'general'];

export const createImageSchema = z.object({
  caption: z.string().trim().max(255).optional().or(z.literal('')),
  category: z.enum(IMAGE_CATEGORIES).default('general'),
  sortOrder: z.number().int().min(0).default(0),
});

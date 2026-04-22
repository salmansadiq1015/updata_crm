import { z } from 'zod';

export const uploadDocumentSchema = z.object({
  category: z.enum(['PLANS', 'CONTRACTS', 'PHOTOS', 'CORRESPONDENCE', 'REPORTS', 'OTHER']).optional().default('OTHER'),
  description: z.string().max(2000).nullable().optional(),
});

export const updateDocumentSchema = z.object({
  category: z.enum(['PLANS', 'CONTRACTS', 'PHOTOS', 'CORRESPONDENCE', 'REPORTS', 'OTHER']).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const generateDocumentSchema = z.object({
  templateType: z.string().trim().min(1, 'Template type is required').max(100),
});

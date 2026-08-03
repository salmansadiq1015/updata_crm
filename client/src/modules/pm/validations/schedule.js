import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid ID');

// Date inputs default to '' when empty; coercing '' yields an Invalid Date which
// fails validation. Treat empty/blank as "not provided" so unused date fields
// (e.g. milestoneDate on a phase) never block submission.
const optionalDate = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.date().optional(),
);

export const createEntrySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  entryType: z.enum(['PHASE', 'MILESTONE']),
  startDate: optionalDate,
  endDate: optionalDate,
  startHalf: z.enum(['morning', 'afternoon']).optional(),
  endHalf: z.enum(['morning', 'afternoon']).optional(),
  milestoneDate: optionalDate,
  responsibleType: z.enum(['INTERNAL_TEAM', 'PARTNER_COMPANY']).nullable().optional(),
  responsibleTeamId: objectId.nullable().optional(),
  partnerCompanyId: objectId.nullable().optional(),
  predecessorId: objectId.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
}).superRefine((data, ctx) => {
  if (data.entryType === 'PHASE') {
    if (!data.startDate) ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'Start date is required for phases' });
    if (!data.endDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date is required for phases' });
  }
  if (data.entryType === 'MILESTONE' && !data.milestoneDate) {
    ctx.addIssue({ code: 'custom', path: ['milestoneDate'], message: 'Milestone date is required' });
  }
});

export const updateEntrySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  entryType: z.enum(['PHASE', 'MILESTONE']).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  startHalf: z.enum(['morning', 'afternoon']).optional(),
  endHalf: z.enum(['morning', 'afternoon']).optional(),
  milestoneDate: optionalDate,
  responsibleType: z.enum(['INTERNAL_TEAM', 'PARTNER_COMPANY']).nullable().optional(),
  responsibleTeamId: objectId.nullable().optional(),
  partnerCompanyId: objectId.nullable().optional(),
  predecessorId: objectId.nullable().optional(),
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'WAIVED']).optional(),
  notes: z.string().max(5000).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const sendConfirmationSchema = z.object({
  partnerContactEmail: z.string().email('Valid email is required').trim().toLowerCase(),
  partnerCompanyId: objectId,
  partnerName: z.string().max(255).nullable().optional(),
  acknowledgeShortNotice: z.boolean().optional(),
});

export const updateConfirmationSchema = z.object({
  confirmationStatus: z.enum(['CONFIRMED', 'DECLINED', 'ALTERNATIVE_PROPOSED']),
  responseNotes: z.string().max(2000).nullable().optional(),
});

import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid ID');

// Empty date inputs register as '' which z.coerce.date() turns into an Invalid Date,
// failing validation silently. Treat '' (and undefined) as null before coercing.
const optionalDate = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.coerce.date().nullable().optional(),
);

const fundingDetailsSchema = z.object({
  fundingBody: z.string().trim().max(255).nullable().optional(),
  applicationAmount: z.coerce.number().min(0).nullable().optional(),
  approvedAmount: z.coerce.number().min(0).nullable().optional(),
  submissionDate: optionalDate,
  expectedDecisionDate: optionalDate,
  fundingStatus: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED']).optional().default('DRAFT'),
});

const materialItemSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(500),
  quantity: z.coerce.number().min(0, 'Quantity must be positive'),
  unit: z.string().trim().max(20).optional().default('Stk.'),
  catalogItemId: objectId.nullable().optional(),
});

const materialOrderDetailsSchema = z.object({
  supplier: z.string().trim().max(255).nullable().optional(),
  orderReference: z.string().trim().max(100).nullable().optional(),
  orderDate: optionalDate,
  expectedDeliveryDate: optionalDate,
  deliveryStatus: z.enum(['PENDING', 'ORDERED', 'PARTIALLY_DELIVERED', 'DELIVERED']).optional().default('PENDING'),
  items: z.array(materialItemSchema).optional(),
});

export const createPrepActionSchema = z.object({
  actionType: z.enum(['FUNDING_APPLICATION', 'MATERIAL_ORDER', 'SCHEDULING', 'OTHER']),
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().max(5000).nullable().optional(),
  isMandatory: z.boolean().optional().default(false),
  dueDate: optionalDate,
  assignedToId: objectId.nullable().optional(),
  externalReference: z.string().trim().max(255).nullable().optional(),
  fundingDetails: fundingDetailsSchema.optional(),
  materialOrderDetails: materialOrderDetailsSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.actionType !== 'FUNDING_APPLICATION' && data.fundingDetails) {
    ctx.addIssue({ code: 'custom', path: ['fundingDetails'], message: 'Funding details only allowed for funding applications' });
  }
  if (data.actionType !== 'MATERIAL_ORDER' && data.materialOrderDetails) {
    ctx.addIssue({ code: 'custom', path: ['materialOrderDetails'], message: 'Material order details only allowed for material orders' });
  }
});

export const updatePrepActionSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  isMandatory: z.boolean().optional(),
  status: z.enum(['CREATED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED']).optional(),
  dueDate: optionalDate,
  assignedToId: objectId.nullable().optional(),
  externalReference: z.string().trim().max(255).nullable().optional(),
  fundingDetails: fundingDetailsSchema.optional(),
  materialOrderDetails: materialOrderDetailsSchema.optional(),
});

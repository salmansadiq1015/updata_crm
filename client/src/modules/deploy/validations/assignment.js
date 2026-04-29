import { z } from 'zod';
import { recurrenceSchema } from './recurrence';
import { appointmentSchema } from './appointment';

export const createAssignmentSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1, 'Mindestens ein Mitarbeiter ist erforderlich'),
  orderId: z.string().optional().or(z.literal('')).nullable(),
  projectId: z.string().optional().or(z.literal('')).nullable(),
  assignmentType: z.enum(['SERVICE_CALL', 'PROJECT_WORK', 'MAINTENANCE', 'INSTALLATION', 'INSPECTION', 'OTHER'], {
    errorMap: () => ({ message: 'Einsatztyp ist erforderlich' }),
  }),
  title: z.string().max(255).optional().or(z.literal('')),
  startDatetime: z.string().min(1, 'Startzeit ist erforderlich'),
  endDatetime: z.string().min(1, 'Endzeit ist erforderlich'),
  isFullDay: z.boolean().default(false),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  instructions: z.string().max(5000).optional().or(z.literal('')),
  customerId: z.string().optional().or(z.literal('')).nullable(),
  siteId: z.string().optional().or(z.literal('')).nullable(),
  colorCode: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')).nullable(),
  isCustomerAppointment: z.boolean().default(false),
  recurrence: recurrenceSchema.optional().nullable(),
  appointment: appointmentSchema.optional().nullable(),
}).refine(
  (data) => {
    if (!data.startDatetime || !data.endDatetime) return true;
    return new Date(data.endDatetime) > new Date(data.startDatetime);
  },
  { message: 'Endzeit muss nach Startzeit liegen', path: ['endDatetime'] }
).refine(
  (data) => !data.isCustomerAppointment || data.appointment,
  { message: 'Termindetails sind erforderlich', path: ['appointment'] }
);

export const updateAssignmentSchema = z.object({
  version: z.number().int().min(1, 'Version ist erforderlich'),
  employeeIds: z.array(z.string().min(1)).optional(),
  orderId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  assignmentType: z.enum(['SERVICE_CALL', 'PROJECT_WORK', 'MAINTENANCE', 'INSTALLATION', 'INSPECTION', 'OTHER']).optional(),
  title: z.string().max(255).optional().nullable(),
  startDatetime: z.string().optional(),
  endDatetime: z.string().optional(),
  isFullDay: z.boolean().optional(),
  status: z.enum(['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).optional(),
  instructions: z.string().max(5000).optional().nullable(),
  customerId: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),
  colorCode: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

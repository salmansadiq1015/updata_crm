import { z } from 'zod';
import { getRecurrenceSchema, recurrenceSchema } from './recurrence';
import { getAppointmentSchema, appointmentSchema } from './appointment';

const ASSIGNMENT_TYPE_VALUES = ['SERVICE_CALL', 'PROJECT_WORK', 'MAINTENANCE', 'INSTALLATION', 'INSPECTION', 'OTHER'];
const ASSIGNMENT_STATUS_VALUES = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PRIORITY_VALUES = ['NORMAL', 'HIGH', 'URGENT'];
const defaultT = (_key, fallback) => fallback;

function buildCreateAssignmentSchema(t, nestedRecurrenceSchema, nestedAppointmentSchema) {
  return z.object({
    employeeIds: z.array(z.string().min(1)).min(1, t('deploy.validation.employeeRequired', 'Mindestens ein Mitarbeiter ist erforderlich')),
    orderId: z.string().optional().or(z.literal('')).nullable(),
    projectId: z.string().optional().or(z.literal('')).nullable(),
    assignmentType: z.enum(ASSIGNMENT_TYPE_VALUES, {
      errorMap: () => ({ message: t('deploy.validation.assignmentTypeRequired', 'Einsatztyp ist erforderlich') }),
    }),
    title: z.string().max(255).optional().or(z.literal('')).nullable(),
    startDatetime: z.string().min(1, t('deploy.validation.startRequired', 'Startzeit ist erforderlich')),
    endDatetime: z.string().min(1, t('deploy.validation.endRequired', 'Endzeit ist erforderlich')),
    isFullDay: z.boolean().default(false),
    priority: z.enum(PRIORITY_VALUES).default('NORMAL'),
    instructions: z.string().max(5000).optional().or(z.literal('')).nullable(),
    requiredSkills: z.string().max(1000).optional().or(z.literal('')).nullable(),
    recommendedSkills: z.string().max(1000).optional().or(z.literal('')).nullable(),
    requiredCertifications: z.string().max(1000).optional().or(z.literal('')).nullable(),
    recommendedCertifications: z.string().max(1000).optional().or(z.literal('')).nullable(),
    customerId: z.string().optional().or(z.literal('')).nullable(),
    siteId: z.string().optional().or(z.literal('')).nullable(),
    colorCode: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')).nullable(),
    isCustomerAppointment: z.boolean().default(false),
    recurrence: nestedRecurrenceSchema.optional().nullable(),
    appointment: nestedAppointmentSchema.optional().nullable(),
  }).refine(
    (data) => {
      if (!data.startDatetime || !data.endDatetime) return true;
      const start = data.isFullDay && /^\d{4}-\d{2}-\d{2}$/.test(data.startDatetime)
        ? new Date(`${data.startDatetime}T00:00:00`)
        : new Date(data.startDatetime);
      const end = data.isFullDay && /^\d{4}-\d{2}-\d{2}$/.test(data.endDatetime)
        ? new Date(`${data.endDatetime}T23:59:59`)
        : new Date(data.endDatetime);
      return end > start;
    },
    { message: t('deploy.validation.endAfterStart', 'Endzeit muss nach Startzeit liegen'), path: ['endDatetime'] }
  ).refine(
    (data) => !data.isCustomerAppointment || data.appointment,
    { message: t('deploy.validation.appointmentRequired', 'Termindetails sind erforderlich'), path: ['appointment'] }
  );
}

export function getCreateAssignmentSchema(t = defaultT) {
  return buildCreateAssignmentSchema(t, getRecurrenceSchema(t), getAppointmentSchema(t));
}

export const createAssignmentSchema = buildCreateAssignmentSchema(defaultT, recurrenceSchema, appointmentSchema);

export function getUpdateAssignmentSchema(t = defaultT) {
  return z.object({
    version: z.number().int().min(1, t('deploy.validation.versionRequired', 'Version ist erforderlich')),
    employeeIds: z.array(z.string().min(1)).optional(),
    orderId: z.string().optional().nullable(),
    projectId: z.string().optional().nullable(),
    assignmentType: z.enum(ASSIGNMENT_TYPE_VALUES).optional(),
    title: z.string().max(255).optional().nullable(),
    startDatetime: z.string().optional(),
    endDatetime: z.string().optional(),
    isFullDay: z.boolean().optional(),
    status: z.enum(ASSIGNMENT_STATUS_VALUES).optional(),
    priority: z.enum(PRIORITY_VALUES).optional(),
    instructions: z.string().max(5000).optional().nullable(),
    requiredSkills: z.union([z.array(z.string()), z.string()]).optional().nullable(),
    recommendedSkills: z.union([z.array(z.string()), z.string()]).optional().nullable(),
    requiredCertifications: z.union([z.array(z.string()), z.string()]).optional().nullable(),
    recommendedCertifications: z.union([z.array(z.string()), z.string()]).optional().nullable(),
    customerId: z.string().optional().nullable(),
    siteId: z.string().optional().nullable(),
    colorCode: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  });
}

export const updateAssignmentSchema = getUpdateAssignmentSchema();

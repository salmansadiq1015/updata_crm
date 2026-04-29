import { z } from 'zod';

const materialItemSchema = z.object({
  catalogSource: z.enum(['IGH', 'INTERNAL', 'CUSTOM']),
  catalogItemId: z.string().max(50).optional().or(z.literal('')),
  description: z.string().min(1, 'Beschreibung erforderlich').max(300),
  quantity: z.coerce.number().min(0, 'Menge muss >= 0 sein'),
  unit: z.string().min(1, 'Einheit erforderlich').max(20),
});

export const createReportSchema = z.object({
  reportDate: z.coerce.date(),
  arrivalTime: z.coerce.date(),
  departureTime: z.coerce.date(),
  workPerformed: z.string().min(1, 'Ausgeführte Arbeiten erforderlich').max(5000),
  findings: z.string().max(5000).optional().or(z.literal('')),
  nextSteps: z.string().max(5000).optional().or(z.literal('')),
  followUpNeeded: z.boolean().default(false),
  technicianNotes: z.string().max(5000).optional().or(z.literal('')),
  customerSignature: z.string().optional().or(z.literal('')),
  customerSignerName: z.string().max(255).optional().or(z.literal('')),
  materialItems: z.array(materialItemSchema).optional().default([]),
}).refine(
  (data) => data.departureTime > data.arrivalTime,
  { message: 'Abfahrt muss nach Ankunft liegen', path: ['departureTime'] }
);

const baseReportSchema = z.object({
  reportDate: z.coerce.date(),
  arrivalTime: z.coerce.date(),
  departureTime: z.coerce.date(),
  workPerformed: z.string().min(1, 'Ausgeführte Arbeiten erforderlich').max(5000),
  findings: z.string().max(5000).optional().or(z.literal('')),
  nextSteps: z.string().max(5000).optional().or(z.literal('')),
  followUpNeeded: z.boolean().default(false),
  technicianNotes: z.string().max(5000).optional().or(z.literal('')),
  customerSignature: z.string().optional().or(z.literal('')),
  customerSignerName: z.string().max(255).optional().or(z.literal('')),
  materialItems: z.array(materialItemSchema).optional().default([]),
});

export const updateReportSchema = baseReportSchema.partial().refine(
  (data) => {
    if (Object.keys(data).length === 0) return false;
    if (data.departureTime && data.arrivalTime) {
      return data.departureTime > data.arrivalTime;
    }
    return true;
  },
  { message: 'Abfahrt muss nach Ankunft liegen', path: ['departureTime'] }
);

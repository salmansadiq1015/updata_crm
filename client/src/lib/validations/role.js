import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(1, 'Rollenname ist erforderlich').max(100),
  description: z.string().max(500).optional().or(z.literal('')),
  permissions: z.array(z.string()).min(1, 'Mindestens eine Berechtigung auswählen'),
});

export const updateRoleSchema = createRoleSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Mindestens ein Feld muss geändert werden' }
);

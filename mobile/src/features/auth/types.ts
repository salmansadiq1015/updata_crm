import { z } from 'zod';

// The sanitized user returned by POST /auth/login and GET /users/me
// (server/src/modules/auth/auth.service.js). `role` is populated as `{ name }`
// on login and may be a bare name or id elsewhere. Its permissions arrive as
// unpopulated ids, so the app does not gate UI on them: the server enforces
// every permission and a 403 renders the forbidden state.
const OBJECT_ID = /^[0-9a-f]{24}$/i;

const roleNameSchema = z
  .union([z.object({ name: z.string().optional() }).loose(), z.string()])
  .nullish()
  .transform((role) => {
    if (!role) return null;
    if (typeof role === 'string') return OBJECT_ID.test(role) ? null : role;
    return role.name ?? null;
  });

export const userSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    email: z.string(),
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    fullName: z.string().nullish(),
    phone: z.string().nullish(),
    language: z.string().nullish(),
    avatarUrl: z.string().nullish(),
    role: roleNameSchema,
    status: z.string().nullish(),
  })
  .transform((raw, ctx) => {
    const id = raw.id ?? raw._id;
    if (!id) {
      ctx.addIssue({ code: 'custom', message: 'User has no id' });
      return z.NEVER;
    }
    const fullName = raw.fullName?.trim() || [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim();
    return {
      id,
      email: raw.email,
      firstName: raw.firstName ?? null,
      lastName: raw.lastName ?? null,
      fullName: fullName || raw.email,
      phone: raw.phone ?? null,
      language: raw.language ?? null,
      avatarUrl: raw.avatarUrl ?? null,
      roleName: raw.role,
      status: raw.status ?? null,
    };
  });

export type User = z.infer<typeof userSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().optional(),
  user: userSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

import { z } from 'zod';

export const taskStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);
export const taskPrioritySchema = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const nullableId = z
  .union([
    z.string(),
    z.object({ _id: z.string().optional(), id: z.string().optional() }).passthrough(),
    z.null(),
    z.undefined(),
  ])
  .transform((value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value._id ?? value.id ?? null;
  });

// The API populates projectId/orderId with the linked record, but nullableId
// reduces them to ids. Lift the display name out first so the UI can show
// "Kesselersatz Bäckerei Weber" instead of a raw object id.
const liftContextNames = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  const project = raw.projectId as Record<string, unknown> | null | undefined;
  const order = raw.orderId as Record<string, unknown> | null | undefined;
  return {
    ...raw,
    projectName: project && typeof project === 'object'
      ? (project.name ?? null)
      : (raw.projectName ?? null),
    orderName: order && typeof order === 'object'
      ? (order.title ?? order.assignmentNumber ?? null)
      : (raw.orderName ?? null),
  };
};

export const rawTaskSchema = z
  .preprocess(liftContextNames, z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    title: z.string().default(''),
    description: z.string().nullable().optional(),
    status: taskStatusSchema.default('OPEN'),
    priority: taskPrioritySchema.default('NONE'),
    listId: nullableId,
    assigneeId: nullableId,
    createdBy: nullableId,
    updatedBy: nullableId,
    parentTaskId: nullableId,
    projectId: nullableId,
    orderId: nullableId,
    startDate: z.union([z.string(), z.date(), z.null(), z.undefined()]).transform((value) => {
      if (!value) return null;
      return value instanceof Date ? value.toISOString() : value;
    }),
    dueDate: z.union([z.string(), z.date(), z.null(), z.undefined()]).transform((value) => {
      if (!value) return null;
      return value instanceof Date ? value.toISOString() : value;
    }),
    sortOrder: z.number().default(0),
    depth: z.number().default(0),
    subtaskCount: z.number().default(0),
    noteCount: z.number().default(0),
    attachmentCount: z.number().default(0),
    version: z.number().optional(),
    __v: z.number().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    updatedAt: z.union([z.string(), z.date()]).optional(),
    completedAt: z.union([z.string(), z.date(), z.null(), z.undefined()]),
    completedBy: nullableId,
    cancelledAt: z.union([z.string(), z.date(), z.null(), z.undefined()]),
    locked: z.boolean().optional(),
    lockedBy: nullableId,
    inPool: z.boolean().optional(),
    poolHelperId: nullableId,
    projectName: z.string().nullable().optional(),
    orderName: z.string().nullable().optional(),
  })
  .passthrough()
  .transform((raw) => {
    const id = raw.id ?? raw._id;
    if (!id) throw new Error('Task response is missing an id');
    const now = new Date().toISOString();
    const toIsoOrNull = (value: string | Date | null | undefined) => {
      if (!value) return null;
      return value instanceof Date ? value.toISOString() : value;
    };

    return {
      id,
      title: raw.title,
      description: raw.description ?? null,
      status: raw.status,
      priority: raw.priority,
      listId: raw.listId,
      assigneeId: raw.assigneeId,
      createdBy: raw.createdBy,
      updatedBy: raw.updatedBy,
      parentTaskId: raw.parentTaskId,
      projectId: raw.projectId,
      orderId: raw.orderId,
      startDate: raw.startDate ?? null,
      dueDate: raw.dueDate,
      sortOrder: raw.sortOrder,
      depth: raw.depth,
      subtaskCount: raw.subtaskCount,
      noteCount: raw.noteCount,
      attachmentCount: raw.attachmentCount,
      version: raw.version ?? raw.__v ?? 0,
      createdAt: toIsoOrNull(raw.createdAt) ?? now,
      updatedAt: toIsoOrNull(raw.updatedAt) ?? now,
      completedAt: toIsoOrNull(raw.completedAt),
      completedBy: raw.completedBy,
      cancelledAt: toIsoOrNull(raw.cancelledAt),
      locked: raw.locked ?? false,
      lockedBy: raw.lockedBy,
      inPool: raw.inPool ?? false,
      poolHelperId: raw.poolHelperId,
      projectName: raw.projectName ?? null,
      orderName: raw.orderName ?? null,
    };
  }));

export const rawTaskListSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    type: z.enum(['PERSONAL', 'GROUP']).default('PERSONAL'),
    ownerId: nullableId,
    color: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    sortOrder: z.number().default(0),
    isDefault: z.boolean().default(false),
    isArchived: z.boolean().default(false),
    openTaskCount: z.number().default(0),
  })
  .passthrough()
  .transform((raw) => {
    const id = raw.id ?? raw._id;
    if (!id) throw new Error('Task list response is missing an id');
    return {
      id,
      name: raw.name,
      type: raw.type,
      ownerId: raw.ownerId,
      color: raw.color ?? null,
      icon: raw.icon ?? null,
      sortOrder: raw.sortOrder,
      isDefault: raw.isDefault,
      isArchived: raw.isArchived,
      openTaskCount: raw.openTaskCount,
    };
  });

export const rawTaskFolderSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    color: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    sortOrder: z.number().default(0),
    ownerId: z.string().nullable().optional(),
    lists: z.array(z.unknown()).optional().default([]),
    createdAt: z.union([z.string(), z.date()]).optional(),
    updatedAt: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough()
  .transform((raw) => {
    const id = raw.id ?? raw._id;
    if (!id) throw new Error('TaskFolder response is missing an id');
    const now = new Date().toISOString();
    return {
      id,
      name: raw.name,
      color: raw.color ?? null,
      icon: raw.icon ?? null,
      sortOrder: raw.sortOrder ?? 0,
      ownerId: raw.ownerId ?? null,
      lists: (raw.lists ?? []).flatMap((l: unknown) => {
        try { return [rawTaskListSchema.parse(l)]; } catch { return []; }
      }),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    };
  });

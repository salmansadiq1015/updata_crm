import type { UseMutationResult } from '@tanstack/react-query';

type Mutation<TVariables> = UseMutationResult<unknown, Error, TVariables, unknown>;
type Callbacks = Partial<Record<
  'onCreate' | 'onUpdate' | 'onDelete' | 'onArchive' | 'onRestore' |
  'onDuplicate' | 'onBulkUpdate' | 'onBulkDelete' | 'onExport',
  (result: unknown) => void
>>;

export function useProjectMutations(callbacks?: Callbacks): {
  create: Mutation<Record<string, unknown>>;
  createFromTemplate: Mutation<{ templateId: string; name?: string } & Record<string, unknown>>;
  update: Mutation<{ id: string; data: Record<string, unknown> }>;
  remove: Mutation<string>;
  archive: Mutation<string>;
  restore: Mutation<string>;
  duplicate: Mutation<string>;
  bulkUpdate: Mutation<{ ids: string[]; data: Record<string, unknown> }>;
  bulkDelete: Mutation<string[]>;
  exportCsv: Mutation<Record<string, unknown>>;
};

import type { UseMutationResult } from '@tanstack/react-query';

type Mutation<TVariables> = UseMutationResult<unknown, Error, TVariables, unknown>;
type Callbacks = Partial<Record<
  'onUpload' | 'onDelete' | 'onRestore' | 'onGenerate' | 'onDraft' | 'onEmail',
  (result: unknown) => void
>>;

export function useDocumentMutations(projectId: string, callbacks?: Callbacks): {
  upload: Mutation<{ file: File; options?: Record<string, unknown> }>;
  updateMetadata: Mutation<{ docId: string; data: Record<string, unknown> }>;
  remove: Mutation<string>;
  restore: Mutation<string>;
  generate: Mutation<string | Record<string, unknown>>;
  saveDraft: Mutation<Record<string, unknown>>;
  emailDocument: Mutation<{ docId: string; to: string; message?: string }>;
  setVisum: Mutation<{ docId: string; visiert?: boolean }>;
  setArchived: Mutation<{ docId: string; archived?: boolean }>;
  setReleased: Mutation<{ docId: string; released?: boolean }>;
};

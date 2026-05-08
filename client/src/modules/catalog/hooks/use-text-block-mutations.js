import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { textBlockService } from '../services/text-block-service';

// Prefix invalidation — matches all textBlock queries regardless of filters
const TEXTBLOCKS_KEY_PREFIX = queryKeys.catalog.textBlocks({}).slice(0, 2);

export function useTextBlockMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: TEXTBLOCKS_KEY_PREFIX });

  const createTextBlock = useMutation({
    mutationFn: textBlockService.create,
    onSuccess: invalidate,
  });

  const updateTextBlock = useMutation({
    mutationFn: ({ id, data }) => textBlockService.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.catalog.textBlockDetail(id) });
      invalidate();
    },
  });

  const deleteTextBlock = useMutation({
    mutationFn: textBlockService.remove,
    onSuccess: invalidate,
  });

  return { createTextBlock, updateTextBlock, deleteTextBlock };
}

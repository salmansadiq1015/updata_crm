import { useMutation, useQueryClient } from '@tanstack/react-query';
import { textBlockService } from '../services/text-block-service';

export function useTextBlockMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['catalog', 'textBlocks'] });

  const createTextBlock = useMutation({
    mutationFn: textBlockService.create,
    onSuccess: invalidate,
  });

  const updateTextBlock = useMutation({
    mutationFn: ({ id, data }) => textBlockService.update(id, data),
    onSuccess: invalidate,
  });

  const deleteTextBlock = useMutation({
    mutationFn: textBlockService.remove,
    onSuccess: invalidate,
  });

  return { createTextBlock, updateTextBlock, deleteTextBlock };
}

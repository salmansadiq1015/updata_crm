import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { articleService } from '../services/article-service';
import { categoryService } from '../services/category-service';

export function useArticleMutations() {
  const qc = useQueryClient();

  const invalidateArticles = () => qc.invalidateQueries({ queryKey: ['catalog', 'articles'] });
  const invalidateCategories = () => qc.invalidateQueries({ queryKey: queryKeys.catalog.categories() });

  const createArticle = useMutation({
    mutationFn: articleService.create,
    onSuccess: invalidateArticles,
  });

  const updateArticle = useMutation({
    mutationFn: ({ id, data }) => articleService.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.catalog.articleDetail(id) });
      invalidateArticles();
    },
  });

  const removeArticle = useMutation({
    mutationFn: (id) => articleService.remove(id),
    onSuccess: invalidateArticles,
  });

  const updatePrice = useMutation({
    mutationFn: articleService.updatePrice,
    onSuccess: invalidateArticles,
  });

  const uploadImage = useMutation({
    mutationFn: ({ articleId, file }) => articleService.uploadImage(articleId, file),
    onSuccess: (_, { articleId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.catalog.articleImages(articleId) });
    },
  });

  const deleteImage = useMutation({
    mutationFn: ({ articleId, imageId }) => articleService.deleteImage(articleId, imageId),
    onSuccess: (_, { articleId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.catalog.articleImages(articleId) });
    },
  });

  const bulkImport = useMutation({
    mutationFn: (file) => {
      const form = new FormData();
      form.append('file', file);
      return articleService.bulkImport(form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog', 'articles'] });
    },
  });

  return { createArticle, updateArticle, removeArticle, updatePrice, uploadImage, deleteImage, bulkImport };
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.catalog.categories() });

  const createCategory = useMutation({ mutationFn: categoryService.create, onSuccess: invalidate });
  const updateCategory = useMutation({
    mutationFn: ({ id, data }) => categoryService.update(id, data),
    onSuccess: invalidate,
  });
  const deactivateCategory = useMutation({ mutationFn: categoryService.deactivate, onSuccess: invalidate });

  return { createCategory, updateCategory, deactivateCategory };
}

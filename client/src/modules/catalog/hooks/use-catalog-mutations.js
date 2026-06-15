import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { articleService } from '../services/article-service';
import { categoryService } from '../services/category-service';

export function useArticleMutations() {
  const qc = useQueryClient();

  const invalidateArticles = () => qc.invalidateQueries({ queryKey: ['catalog', 'articles'] });
  const invalidateFacets = () => qc.invalidateQueries({ queryKey: ['catalog', 'facets'] });
  const invalidateCategories = () => {
    qc.invalidateQueries({ queryKey: queryKeys.catalog.categories() });
    qc.invalidateQueries({ queryKey: queryKeys.catalog.categoryTree() });
  };

  const createArticle = useMutation({
    mutationFn: articleService.create,
    onSuccess: () => { invalidateArticles(); invalidateFacets(); invalidateCategories(); },
  });

  const updateArticle = useMutation({
    mutationFn: ({ id, data }) => articleService.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.catalog.articleDetail(id) });
      invalidateArticles();
      invalidateFacets();
      invalidateCategories();
    },
  });

  const removeArticle = useMutation({
    mutationFn: (id) => articleService.remove(id),
    onSuccess: () => { invalidateArticles(); invalidateFacets(); invalidateCategories(); },
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
    mutationFn: articleService.bulkImport,
    onSuccess: () => {
      invalidateArticles();
      invalidateFacets();
      invalidateCategories();
    },
  });

  return { createArticle, updateArticle, removeArticle, updatePrice, uploadImage, deleteImage, bulkImport };
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.catalog.categories() });
    qc.invalidateQueries({ queryKey: queryKeys.catalog.categoryTree() });
  };

  const createCategory = useMutation({ mutationFn: categoryService.create, onSuccess: invalidate });
  const updateCategory = useMutation({
    mutationFn: ({ id, data }) => categoryService.update(id, data),
    onSuccess: invalidate,
  });
  const deactivateCategory = useMutation({ mutationFn: categoryService.deactivate, onSuccess: invalidate });
  const moveCategory = useMutation({
    mutationFn: ({ id, newParentId }) => categoryService.move(id, { newParentId }),
    onSuccess: invalidate,
  });

  return { createCategory, updateCategory, deactivateCategory, moveCategory };
}

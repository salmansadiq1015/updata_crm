import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { articleService } from '../services/article-service';
import { categoryService } from '../services/category-service';
import { normalizeListResponse } from '../services/catalog-normalizers';

export function useCatalogCategories() {
  return useQuery({
    queryKey: queryKeys.catalog.categories(),
    queryFn: categoryService.list,
    select: (data) => (Array.isArray(data) ? data : (data?.data ?? [])),
    staleTime: 5 * 60_000,
  });
}

export function useCatalogCategoryTree(params = {}) {
  return useQuery({
    queryKey: queryKeys.catalog.categoryTree(),
    queryFn: () => categoryService.tree(params),
    select: (data) => (Array.isArray(data) ? data : (data?.data ?? [])),
    staleTime: 5 * 60_000,
  });
}

export function useCatalogCategoryOptions(params = {}) {
  return useQuery({
    queryKey: [...queryKeys.catalog.categories(), 'options', params],
    queryFn: () => categoryService.selectOptions(params),
    select: (data) => (Array.isArray(data) ? data : (data?.data ?? [])),
    staleTime: 5 * 60_000,
  });
}

export function useArticles(filters = {}) {
  return useQuery({
    queryKey: queryKeys.catalog.articles(filters),
    queryFn: () => articleService.list(filters),
    select: normalizeListResponse,
  });
}

export function useArticleFacets(filters = {}) {
  return useQuery({
    queryKey: queryKeys.catalog.facets(filters),
    queryFn: () => articleService.getFacets(filters).then((r) => r.data ?? r),
    staleTime: 30_000,
  });
}

export function useRecentCatalogSearches() {
  return useQuery({
    queryKey: queryKeys.catalog.recentSearches(),
    queryFn: () => articleService.getRecentSearches({ limit: 10 }),
    select: (data) => (Array.isArray(data) ? data : (data?.data ?? [])),
    staleTime: 30_000,
  });
}

export function useArticleDetail(id) {
  return useQuery({
    queryKey: queryKeys.catalog.articleDetail(id),
    queryFn: () => articleService.getById(id),
    enabled: !!id,
  });
}

export function useArticleVersions(id) {
  return useQuery({
    queryKey: queryKeys.catalog.articleVersions(id),
    queryFn: () => articleService.getVersions(id),
    enabled: !!id,
    select: (data) => (Array.isArray(data) ? data : (data?.data ?? [])),
  });
}

export function usePriceHistory(id) {
  return useQuery({
    queryKey: queryKeys.catalog.priceHistory(id),
    queryFn: () => articleService.getPriceHistory(id),
    enabled: !!id,
    select: (data) => (Array.isArray(data) ? data : (data?.data ?? [])),
  });
}

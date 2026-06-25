'use client';

import { useState, useMemo } from 'react';
import { Pencil, Trash2, Search, Type } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ListPage } from '@/components/ui/list-page';
import { EmptyState } from '@/components/ui/empty-state';
import { TablePagination } from '@/components/ui/table-pagination';
import { useTextBlocks } from '../hooks/use-text-block-queries';
import { useTextBlockMutations } from '../hooks/use-text-block-mutations';
import { useCatalogCategories } from '../hooks/use-catalog-queries';
import { TextBlockFormDialog } from './text-block-form-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useClientPagination } from '@/shared/hooks/use-client-pagination';

const ALL = '__all__';
const PAGE_SIZE = 10;

export function TextBlockTable() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [dialogBlock, setDialogBlock] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const debouncedSearch = useDebounce(search, 300);

  const { data: blocks = [], isLoading, isError } = useTextBlocks({ q: debouncedSearch || undefined });
  const { data: categories = [] } = useCatalogCategories();
  const { deleteTextBlock } = useTextBlockMutations();

  const filtered = useMemo(() => blocks.filter((b) => {
    const catId = b.categoryId ?? b.category?._id;
    if (categoryFilter !== ALL && catId !== categoryFilter) return false;
    if (statusFilter !== ALL && b.status !== statusFilter) return false;
    return true;
  }), [blocks, categoryFilter, statusFilter]);

  const { page, setPage, pageItems, total } = useClientPagination(filtered, PAGE_SIZE);

  const openCreate = () => { setDialogBlock(null); setDialogKey((k) => k + 1); setDialogOpen(true); };
  const openEdit = (b) => { setDialogBlock(b); setDialogKey((k) => k + 1); setDialogOpen(true); };

  return (
    <ListPage>
      <ListPage.Toolbar>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={t('catalog.textBlocks.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t('common.category')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('catalog.textBlocks.allCategories', 'All categories')}</SelectItem>
            {categories.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t('common.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('catalog.textBlocks.allStatuses', 'All statuses')}</SelectItem>
            <SelectItem value="ACTIVE">{t('catalog.articles.statusActive')}</SelectItem>
            <SelectItem value="INACTIVE">{t('catalog.articles.statusInactive')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{total} {t('common.results', 'results')}</span>
          <Button size="sm" onClick={openCreate}>+ {t('catalog.textBlocks.create')}</Button>
        </div>
      </ListPage.Toolbar>

      <ListPage.Body
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && total === 0}
        errorMessage={t('common.errorLoading', 'Could not load data')}
        empty={{ icon: Type, title: t('catalog.textBlocks.empty'), description: t('catalog.textBlocks.emptyHint', 'Create your first text block.'), action: <Button size="sm" onClick={openCreate}>+ {t('catalog.textBlocks.create')}</Button> }}
      >
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.title')}</TableHead>
                <TableHead>{t('common.category')}</TableHead>
                <TableHead className="w-28">{t('catalog.priceChf')}</TableHead>
                <TableHead className="w-24">{t('common.status')}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((block) => (
                <TableRow key={block._id}>
                  <TableCell className="font-medium">{block.title}</TableCell>
                  <TableCell>{block.category?.name ?? '—'}</TableCell>
                  <TableCell>{block.price ? Number(block.price).toFixed(2) : '—'}</TableCell>
                  <TableCell><Badge variant={block.status === 'ACTIVE' ? 'default' : 'secondary'}>{block.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(block)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('catalog.textBlocks.deleteTitle', null, { title: block.title })}</AlertDialogTitle>
                            <AlertDialogDescription>{t('catalog.textBlocks.deleteDescription')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTextBlock.mutate(block._id)}>
                              {t('common.delete')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </ListPage.Body>

      <TextBlockFormDialog key={dialogKey} open={dialogOpen} onClose={() => setDialogOpen(false)} textBlock={dialogBlock} />
    </ListPage>
  );
}

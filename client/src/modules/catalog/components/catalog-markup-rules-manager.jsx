'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Percent, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ListPage } from '@/components/ui/list-page';
import { TablePagination } from '@/components/ui/table-pagination';
import { useLanguage } from '@/lib/i18n/language-context';
import { useCatalogCategoryOptions, useCatalogMarkupRules } from '../hooks/use-catalog-queries';
import { useCatalogMarkupMutations } from '../hooks/use-catalog-mutations';
import { useClientPagination } from '@/shared/hooks/use-client-pagination';

const ALL = '__all__';
const PAGE_SIZE = 10;
const SCOPES = ['GLOBAL', 'MANUFACTURER', 'CATEGORY', 'PRODUCT_GROUP', 'ARTICLE'];

const DEFAULT_VALUES = {
  name: '', scope: 'GLOBAL', priority: 100, manufacturerName: '', supplierId: '',
  categoryId: '', productGroup: '', articleId: '', markupPercent: '', marginPercent: '', isActive: true,
};

function unwrapList(result) {
  return result?.data ?? [];
}

export function CatalogMarkupRulesManager() {
  const { t } = useLanguage();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const { data: result = { data: [] }, isLoading, isError } = useCatalogMarkupRules({ limit: 100 });
  const { createMarkup, updateMarkup, removeMarkup } = useCatalogMarkupMutations();
  const rules = unwrapList(result);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (q && !String(r.name ?? '').toLowerCase().includes(q)) return false;
      if (scopeFilter !== ALL && r.scope !== scopeFilter) return false;
      if (statusFilter === 'ACTIVE' && !r.isActive) return false;
      if (statusFilter === 'INACTIVE' && r.isActive) return false;
      return true;
    });
  }, [rules, search, scopeFilter, statusFilter]);

  const { page, setPage, pageItems, total } = useClientPagination(filtered, PAGE_SIZE);

  const openCreate = () => { setEditing(null); setFormOpen(true); };

  return (
    <ListPage>
      <ListPage.Toolbar>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={t('catalog.markups.searchPlaceholder', 'Search rules...')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t('catalog.markups.scope')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('catalog.markups.allScopes', 'All scopes')}</SelectItem>
            {SCOPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t('common.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('catalog.markups.allStatuses', 'All statuses')}</SelectItem>
            <SelectItem value="ACTIVE">{t('common.active')}</SelectItem>
            <SelectItem value="INACTIVE">{t('common.inactive')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{total} {t('common.results', 'results')}</span>
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />{t('catalog.markups.add')}
          </Button>
        </div>
      </ListPage.Toolbar>

      <ListPage.Body
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && total === 0}
        errorMessage={t('catalog.markups.loadError')}
        empty={{ icon: Percent, title: t('catalog.markups.empty'), description: t('catalog.markups.emptyHint', 'Create a markup or margin rule to control pricing.'), action: <Button variant="outline" size="sm" onClick={openCreate}><Plus className="mr-1.5 h-3.5 w-3.5" />{t('catalog.markups.createFirst')}</Button> }}
      >
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.markups.table.rule')}</th>
                <th className="w-36 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.markups.table.scope')}</th>
                <th className="w-48 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.markups.table.target')}</th>
                <th className="w-36 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.markups.table.pricing')}</th>
                <th className="w-28 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.markups.table.status')}</th>
                <th className="w-24 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.markups.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageItems.map((rule) => {
                const id = rule._id || rule.id;
                return (
                  <tr key={id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="truncate font-medium">{rule.name}</div>
                      <div className="text-xs text-muted-foreground">{t('catalog.markups.priorityValue', null, { priority: rule.priority ?? 100 })}</div>
                    </td>
                    <td className="px-4 py-3"><Badge variant="outline">{rule.scope}</Badge></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{describeTarget(rule, t)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rule.markupPercent !== null && rule.markupPercent !== undefined ? `${rule.markupPercent}% ${t('catalog.markups.markupSuffix')}` : ''}
                      {rule.marginPercent !== null && rule.marginPercent !== undefined ? `${rule.marginPercent}% ${t('catalog.markups.marginSuffix')}` : ''}
                    </td>
                    <td className="px-4 py-3"><Badge variant={rule.isActive ? 'default' : 'outline'}>{rule.isActive ? t('common.active') : t('common.inactive')}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(rule); setFormOpen(true); }} aria-label={t('common.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" aria-label={t('common.delete')}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('catalog.markups.deleteTitle', 'Delete this rule?')}</AlertDialogTitle>
                              <AlertDialogDescription>{t('common.cannotUndo')}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => removeMarkup.mutate(id)}>
                                {t('common.delete')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <TablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </ListPage.Body>

      <MarkupRuleDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editing}
        onCreate={(data) => createMarkup.mutateAsync(data)}
        onUpdate={(id, data) => updateMarkup.mutateAsync({ id, data })}
      />
    </ListPage>
  );
}

function describeTarget(rule, t) {
  if (rule.scope === 'GLOBAL') return t('catalog.markups.target.allItems');
  if (rule.scope === 'MANUFACTURER') return rule.manufacturerName || '-';
  if (rule.scope === 'SUPPLIER') return rule.supplierId?.name || rule.supplierId || '-';
  if (rule.scope === 'CATEGORY') return rule.categoryId?.name || rule.categoryId || '-';
  if (rule.scope === 'PRODUCT_GROUP') return rule.productGroup || '-';
  if (rule.scope === 'ARTICLE') return rule.articleId?.name || rule.articleId || '-';
  return '-';
}

function MarkupRuleDialog({ open, onOpenChange, rule, onCreate, onUpdate }) {
  const { t } = useLanguage();
  const { data: categories = [] } = useCatalogCategoryOptions();
  const {
    register, handleSubmit, reset, setValue, control, formState: { isSubmitting },
  } = useForm({ defaultValues: DEFAULT_VALUES });
  const scope = useWatch({ control, name: 'scope' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const isActive = useWatch({ control, name: 'isActive' });
  const scopes = useMemo(() => SCOPES, []);

  useEffect(() => {
    if (!open) return;
    reset(rule ? {
      ...DEFAULT_VALUES, ...rule,
      categoryId: rule.categoryId?._id || rule.categoryId || '',
      articleId: rule.articleId?._id || rule.articleId || '',
      markupPercent: rule.markupPercent ?? '',
      marginPercent: rule.marginPercent ?? '',
    } : DEFAULT_VALUES);
  }, [open, reset, rule]);

  const onSubmit = async (values) => {
    if (rule) await onUpdate(rule._id || rule.id, values);
    else await onCreate(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{rule ? t('catalog.markups.editTitle') : t('catalog.markups.createTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('catalog.markups.dialogDescription')}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={t('catalog.markups.fieldName')} className="sm:col-span-2"><Input {...register('name', { required: true })} className="h-8" /></Field>
              <Field label={t('catalog.markups.priority')}><Input {...register('priority')} type="number" min="0" className="h-8" /></Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('catalog.markups.scope')}>
                <Select value={scope} onValueChange={(value) => setValue('scope', value)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{scopes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {scope === 'MANUFACTURER' && <Field label={t('catalog.articles.manufacturer')}><Input {...register('manufacturerName')} className="h-8" /></Field>}
              {scope === 'CATEGORY' && (
                <Field label={t('catalog.categories.category')}>
                  <Select value={categoryId} onValueChange={(value) => setValue('categoryId', value)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder={t('catalog.categories.category')} /></SelectTrigger>
                    <SelectContent>{categories.map((category) => <SelectItem key={category._id || category.id} value={category._id || category.id}>{category.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              )}
              {scope === 'PRODUCT_GROUP' && <Field label={t('catalog.articles.productGroup')}><Input {...register('productGroup')} className="h-8" /></Field>}
              {scope === 'ARTICLE' && <Field label={t('catalog.markups.articleId')}><Input {...register('articleId')} className="h-8" /></Field>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('catalog.markups.markupPercent')}><Input {...register('markupPercent')} type="number" step="0.01" className="h-8" /></Field>
              <Field label={t('catalog.markups.marginPercent')}><Input {...register('marginPercent')} type="number" step="0.01" className="h-8" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={Boolean(isActive)} onCheckedChange={(value) => setValue('isActive', Boolean(value))} />
              {t('common.active')}
            </label>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>{isSubmitting ? t('common.saving') : t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

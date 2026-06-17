'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Percent, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useLanguage } from '@/lib/i18n/language-context';
import { useCatalogCategoryOptions, useCatalogMarkupRules } from '../hooks/use-catalog-queries';
import { useCatalogMarkupMutations } from '../hooks/use-catalog-mutations';

const DEFAULT_VALUES = {
  name: '',
  scope: 'GLOBAL',
  priority: 100,
  manufacturerName: '',
  supplierId: '',
  categoryId: '',
  productGroup: '',
  articleId: '',
  markupPercent: '',
  marginPercent: '',
  isActive: true,
};

function unwrapList(result) {
  return result?.data ?? [];
}

export function CatalogMarkupRulesManager() {
  const { t } = useLanguage();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const { data: result = { data: [] }, isLoading, isError } = useCatalogMarkupRules({ limit: 100 });
  const { createMarkup, updateMarkup, removeMarkup } = useCatalogMarkupMutations();
  const rules = unwrapList(result);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5" />
          {t('catalog.markups.add')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-12 text-sm text-destructive">
            {t('catalog.markups.loadError')}
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Percent className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('catalog.markups.empty')}</p>
            <Button variant="outline" size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t('catalog.markups.createFirst')}
            </Button>
          </div>
        ) : (
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
              {rules.map((rule) => {
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => confirm(t('catalog.markups.deleteConfirm')) && removeMarkup.mutate(id)}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <MarkupRuleDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editing}
        onCreate={(data) => createMarkup.mutateAsync(data)}
        onUpdate={(id, data) => updateMarkup.mutateAsync({ id, data })}
      />
    </div>
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
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { isSubmitting },
  } = useForm({ defaultValues: DEFAULT_VALUES });
  const scope = useWatch({ control, name: 'scope' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const isActive = useWatch({ control, name: 'isActive' });
  const scopes = useMemo(() => ['GLOBAL', 'MANUFACTURER', 'CATEGORY', 'PRODUCT_GROUP', 'ARTICLE'], []);

  useEffect(() => {
    if (!open) return;
    reset(rule ? {
      ...DEFAULT_VALUES,
      ...rule,
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? t('catalog.markups.editTitle') : t('catalog.markups.createTitle')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('catalog.markups.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

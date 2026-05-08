'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useArticleMutations } from '../hooks/use-catalog-mutations';
import { useCatalogCategories } from '../hooks/use-catalog-queries';
import { ARTICLE_TYPES, ARTICLE_STATUSES } from '../constants/catalog-constants';
import { useLanguage } from '@/lib/i18n/language-context';
import { ArticleImageGallery } from './article-image-gallery';

export function CatalogArticleFormDialog({ open, onOpenChange, onClose, article }) {
  const { locale: language, t } = useLanguage();
  const de = language === 'de';

  // Support both onOpenChange (existing usage) and onClose (new API)
  const handleClose = onOpenChange ?? onClose ?? (() => {});

  const { createArticle, updateArticle, uploadImage, deleteImage } = useArticleMutations();
  const { data: categories = [] } = useCatalogCategories();
  const isEdit = !!article;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      articleNumber: '',
      name: '',
      description: '',
      supplierRef: '',
      ighArticleNumber: '',
      type: 'MATERIAL',
      status: 'ACTIVE',
      categoryId: '__none__',
      unit: 'Stk',
      buyPrice: '',
      sellPrice: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset(article
        ? {
            articleNumber: article.articleNumber ?? '',
            name: article.name ?? '',
            description: article.description ?? '',
            supplierRef: article.supplierRef ?? '',
            ighArticleNumber: article.ighArticleNumber ?? '',
            type: article.type ?? 'MATERIAL',
            status: article.status ?? 'ACTIVE',
            categoryId: article.categoryId ?? '__none__',
            unit: article.unit ?? 'Stk',
            buyPrice: article.buyPrice ?? '',
            sellPrice: article.sellPrice ?? '',
          }
        : {
            articleNumber: '',
            name: '',
            description: '',
            supplierRef: '',
            ighArticleNumber: '',
            type: 'MATERIAL',
            status: 'ACTIVE',
            categoryId: '__none__',
            unit: 'Stk',
            buyPrice: '',
            sellPrice: '',
          }
      );
    }
  }, [open, article, reset]);

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      buyPrice: values.buyPrice !== '' ? parseFloat(values.buyPrice) : undefined,
      sellPrice: values.sellPrice !== '' ? parseFloat(values.sellPrice) : undefined,
      categoryId: (values.categoryId && values.categoryId !== '__none__') ? values.categoryId : undefined,
      supplierRef: values.supplierRef || undefined,
      ighArticleNumber: values.ighArticleNumber || undefined,
    };
    if (isEdit) {
      await updateArticle.mutateAsync({ id: article._id || article.id, data: payload });
    } else {
      await createArticle.mutateAsync(payload);
    }
    handleClose(false);
  };

  const type = watch('type');
  const status = watch('status');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? (de ? 'Artikel bearbeiten' : 'Edit Article')
              : (de ? 'Neuer Artikel' : 'New Article')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="articleNumber">{de ? 'Art.-Nr.' : 'Article No.'}</Label>
              <Input id="articleNumber" {...register('articleNumber')} placeholder="ART-001" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">{de ? 'Einheit' : 'Unit'}</Label>
              <Input id="unit" {...register('unit')} placeholder="Stk" className="h-8 text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">{de ? 'Bezeichnung' : 'Name'} *</Label>
            <Input
              id="name"
              {...register('name', { required: true })}
              placeholder={de ? 'Artikelbezeichnung' : 'Article name'}
              className="h-8 text-sm"
            />
            {errors.name && <p className="text-xs text-destructive">{de ? 'Pflichtfeld' : 'Required'}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">{de ? 'Beschreibung' : 'Description'}</Label>
            <Input
              id="description"
              {...register('description')}
              placeholder={de ? 'Kurzbeschreibung' : 'Short description'}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplierRef">{t('catalog.articles.supplierRef')}</Label>
            <Input
              id="supplierRef"
              {...register('supplierRef')}
              placeholder="e.g. SUP-10023"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ighArticleNumber">{t('catalog.articles.ighNumber')}</Label>
            <Input
              id="ighArticleNumber"
              {...register('ighArticleNumber')}
              placeholder="e.g. IGH-98001"
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{de ? 'Typ' : 'Type'}</Label>
              <Select value={type} onValueChange={(v) => setValue('type', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARTICLE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{de ? 'Status' : 'Status'}</Label>
              <Select value={status} onValueChange={(v) => setValue('status', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARTICLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{de ? 'Kategorie' : 'Category'}</Label>
            <Select value={watch('categoryId')} onValueChange={(v) => setValue('categoryId', v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={de ? 'Keine Kategorie' : 'No category'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{de ? 'Keine Kategorie' : 'No category'}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c._id || c.id} value={c._id || c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="buyPrice">{de ? 'EK-Preis (CHF)' : 'Buy Price (CHF)'}</Label>
              <Input
                id="buyPrice"
                {...register('buyPrice')}
                type="number" step="0.01" min="0"
                placeholder="0.00"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sellPrice">{de ? 'VK-Preis (CHF)' : 'Sell Price (CHF)'}</Label>
              <Input
                id="sellPrice"
                {...register('sellPrice')}
                type="number" step="0.01" min="0"
                placeholder="0.00"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {article && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('catalog.images.upload')}</p>
              <p className="text-xs text-muted-foreground">{t('catalog.images.maxSize')}</p>
              <ArticleImageGallery
                articleId={article._id}
                onUpload={(file) => uploadImage.mutate({ articleId: article._id, file })}
                onDelete={(imageId) => deleteImage.mutate({ articleId: article._id, imageId })}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => handleClose(false)}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting
                ? (de ? 'Speichert...' : 'Saving...')
                : (de ? 'Speichern' : 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

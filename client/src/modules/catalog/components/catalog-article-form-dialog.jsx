'use client';

import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useArticleMutations } from '../hooks/use-catalog-mutations';
import { useCatalogCategoryOptions } from '../hooks/use-catalog-queries';
import { useUnits } from '../hooks/use-unit-queries';
import { ARTICLE_TYPES, ARTICLE_STATUSES } from '../constants/catalog-constants';
import { useLanguage } from '@/lib/i18n/language-context';
import { ArticleImageGallery } from './article-image-gallery';

const DEFAULT_VALUES = {
  articleNumber: '',
  name: '',
  description: '',
  supplierReference: '',
  ighArticleNumber: '',
  type: 'MATERIAL',
  status: 'ACTIVE',
  categoryId: '',
  unitOfMeasure: 'STK',
  basePrice: '',
  currency: 'CHF',
};

export function CatalogArticleFormDialog({ open, onOpenChange, onClose, article }) {
  const { locale: language, t } = useLanguage();
  const de = language === 'de';
  const handleClose = onOpenChange ?? onClose ?? (() => {});
  const { createArticle, updateArticle, uploadImage, deleteImage } = useArticleMutations();
  const { data: categories = [] } = useCatalogCategoryOptions();
  const { data: units = [] } = useUnits();
  const isEdit = Boolean(article);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: DEFAULT_VALUES });

  useEffect(() => {
    if (!open) return;
    reset(article
      ? {
        articleNumber: article.articleNumber ?? '',
        name: article.name ?? '',
        description: article.description ?? '',
        supplierReference: article.supplierReference ?? article.supplierRef ?? '',
        ighArticleNumber: article.ighArticleNumber ?? '',
        type: article.type ?? 'MATERIAL',
        status: article.status ?? 'ACTIVE',
        categoryId: article.categoryId?._id || article.categoryId || '',
        unitOfMeasure: article.unitOfMeasure || article.unit || 'STK',
        basePrice: article.basePrice ?? article.buyPrice ?? '',
        currency: article.currency || 'CHF',
      }
      : DEFAULT_VALUES);
  }, [open, article, reset]);

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      basePrice: values.basePrice !== '' ? Number(values.basePrice) : 0,
      supplierReference: values.supplierReference || undefined,
      ighArticleNumber: values.ighArticleNumber || undefined,
      version: article?.version,
    };

    if (isEdit) {
      await updateArticle.mutateAsync({ id: article._id || article.id, data: payload });
    } else {
      await createArticle.mutateAsync(payload);
    }
    handleClose(false);
  };

  const type = useWatch({ control, name: 'type' });
  const status = useWatch({ control, name: 'status' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const unitOfMeasure = useWatch({ control, name: 'unitOfMeasure' });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? (de ? 'Artikel bearbeiten' : 'Edit Article') : (de ? 'Neuer Artikel' : 'New Article')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {de
              ? 'Artikelnummer, Einheit, Kategorie, Preis und IGH-Referenzen verwalten.'
              : 'Manage article number, unit, category, price, and IGH references.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="articleNumber">{de ? 'Art.-Nr.' : 'Article No.'} *</Label>
              <Input
                id="articleNumber"
                {...register('articleNumber', { required: true, maxLength: 20 })}
                disabled={isEdit}
                placeholder="ART-001"
                className="h-8 text-sm"
              />
              {errors.articleNumber && <p className="text-xs text-destructive">{de ? 'Pflichtfeld, max. 20 Zeichen' : 'Required, max 20 characters'}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{de ? 'Einheit' : 'Unit'} *</Label>
              <Select value={unitOfMeasure} onValueChange={(value) => setValue('unitOfMeasure', value)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={de ? 'Einheit wählen' : 'Select unit'} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.code} value={unit.code}>
                      {unit.code} - {unit.nameDe || unit.nameFr || unit.nameIt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">{de ? 'Bezeichnung' : 'Name'} *</Label>
            <Input id="name" {...register('name', { required: true })} className="h-8 text-sm" />
            {errors.name && <p className="text-xs text-destructive">{de ? 'Pflichtfeld' : 'Required'}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">{de ? 'Beschreibung' : 'Description'}</Label>
            <Input id="description" {...register('description')} className="h-8 text-sm" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplierReference">{t('catalog.articles.supplierRef')}</Label>
              <Input id="supplierReference" {...register('supplierReference')} className="h-8 text-sm" maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ighArticleNumber">{t('catalog.articles.ighNumber')}</Label>
              <Input id="ighArticleNumber" {...register('ighArticleNumber')} className="h-8 text-sm" maxLength={50} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{de ? 'Typ' : 'Type'}</Label>
              <Select value={type} onValueChange={(value) => setValue('type', value)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ARTICLE_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{de ? 'Status' : 'Status'}</Label>
              <Select value={status} onValueChange={(value) => setValue('status', value)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ARTICLE_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="basePrice">{de ? 'Basispreis (CHF)' : 'Base Price (CHF)'} *</Label>
              <Input id="basePrice" {...register('basePrice', { required: true })} type="number" step="0.01" min="0" className="h-8 text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{de ? 'Kategorie' : 'Category'} *</Label>
            <Select value={categoryId} onValueChange={(value) => setValue('categoryId', value)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={de ? 'Kategorie wählen' : 'Select category'} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category._id || category.id} value={category._id || category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!categoryId && <p className="text-xs text-muted-foreground">{de ? 'Eine aktive Kategorie ist erforderlich.' : 'An active category is required.'}</p>}
          </div>

          {article && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('catalog.images.upload')}</p>
              <p className="text-xs text-muted-foreground">{t('catalog.images.maxSize')}</p>
              <ArticleImageGallery
                articleId={article._id || article.id}
                onUpload={(file) => uploadImage.mutate({ articleId: article._id || article.id, file })}
                onDelete={(imageId) => deleteImage.mutate({ articleId: article._id || article.id, imageId })}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => handleClose(false)}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting || !categoryId}>
              {isSubmitting ? (de ? 'Speichert...' : 'Saving...') : (de ? 'Speichern' : 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

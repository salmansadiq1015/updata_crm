'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  ArrowLeft,
  ArrowRight,
  BadgeInfo,
  Boxes,
  CircleDollarSign,
  Image as ImageIcon,
  Loader2,
  PackageCheck,
  Truck,
} from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { StepIndicator } from '@/components/ui/form-stepper';
import { cn } from '@/lib/utils';
import { useArticleMutations } from '../hooks/use-catalog-mutations';
import { useCatalogCategoryOptions } from '../hooks/use-catalog-queries';
import { useUnits } from '../hooks/use-unit-queries';
import {
  ARTICLE_TYPES,
  ARTICLE_STATUSES,
  ARTICLE_SOURCES,
  ARTICLE_AVAILABILITY_STATUSES,
} from '../constants/catalog-constants';
import { useLanguage } from '@/lib/i18n/language-context';
import { ArticleImageGallery } from './article-image-gallery';

const DEFAULT_VALUES = {
  articleNumber: '',
  name: '',
  description: '',
  supplierReference: '',
  supplierName: '',
  manufacturerName: '',
  manufacturerPartNumber: '',
  productGroup: '',
  ighArticleNumber: '',
  type: 'MATERIAL',
  status: 'ACTIVE',
  source: 'INTERNAL',
  availabilityStatus: 'UNKNOWN',
  availableQuantity: '',
  categoryId: '',
  unitOfMeasure: 'STK',
  purchasePrice: '',
  salesPrice: '',
  basePrice: '',
  currency: 'CHF',
};

const STEP_FIELD_NAMES = {
  basics: ['articleNumber', 'name'],
  classification: ['categoryId'],
  pricing: ['salesPrice'],
  supplier: [],
};

function buildArticleDefaults(article) {
  return article
    ? {
      articleNumber: article.articleNumber ?? '',
      name: article.name ?? '',
      description: article.description ?? '',
      supplierReference: article.supplierReference ?? article.supplierRef ?? '',
      supplierName: article.supplierName ?? '',
      manufacturerName: article.manufacturerName ?? '',
      manufacturerPartNumber: article.manufacturerPartNumber ?? '',
      productGroup: article.productGroup ?? '',
      ighArticleNumber: article.ighArticleNumber ?? '',
      type: article.type ?? 'MATERIAL',
      status: article.status ?? 'ACTIVE',
      source: article.source ?? 'INTERNAL',
      availabilityStatus: article.availabilityStatus ?? 'UNKNOWN',
      availableQuantity: article.availableQuantity ?? '',
      categoryId: article.categoryId?._id || article.categoryId || '',
      unitOfMeasure: article.unitOfMeasure || article.unit || 'STK',
      purchasePrice: article.purchasePrice ?? article.buyPrice ?? '',
      salesPrice: article.salesPrice ?? article.sellPrice ?? article.basePrice ?? '',
      basePrice: article.basePrice ?? article.salesPrice ?? article.sellPrice ?? '',
      currency: article.currency || 'CHF',
    }
    : DEFAULT_VALUES;
}

function buildArticlePayload(values, version) {
  const salesPrice = values.salesPrice !== ''
    ? Number(values.salesPrice)
    : Number(values.basePrice || 0);

  return {
    ...values,
    purchasePrice: values.purchasePrice !== '' ? Number(values.purchasePrice) : 0,
    salesPrice,
    basePrice: salesPrice,
    availableQuantity: values.availableQuantity !== '' ? Number(values.availableQuantity) : null,
    supplierReference: values.supplierReference || undefined,
    ighArticleNumber: values.ighArticleNumber || undefined,
    version,
  };
}

function Field({ id, label, required, error, help, className, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

function StepSurface({ title, description, children }) {
  return (
    <section className="space-y-5 rounded-2xl border border-border/70 bg-background/55 p-4 shadow-sm sm:p-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function CatalogArticleFormDialog({ open, onOpenChange, onClose, article }) {
  const { t } = useLanguage();
  const handleClose = onOpenChange ?? onClose ?? (() => {});
  const { createArticle, updateArticle, uploadImage, deleteImage } = useArticleMutations();
  const { data: categories = [] } = useCatalogCategoryOptions();
  const { data: units = [] } = useUnits();
  const [currentStep, setCurrentStep] = useState(0);
  const isEdit = Boolean(article);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: DEFAULT_VALUES });

  const steps = useMemo(() => [
    { id: 'basics', label: t('catalog.articles.stepBasics', 'Basics'), icon: BadgeInfo },
    { id: 'classification', label: t('catalog.articles.stepClassification', 'Classification'), icon: Boxes },
    { id: 'pricing', label: t('catalog.articles.stepPricing', 'Pricing'), icon: CircleDollarSign },
    { id: 'supplier', label: t('catalog.articles.stepSupplier', 'Supplier'), icon: Truck },
  ], [t]);

  useEffect(() => {
    if (!open) return;
    reset(buildArticleDefaults(article));
  }, [open, article, reset]);

  const onSubmit = async (values) => {
    const payload = buildArticlePayload(values, article?.version);

    if (isEdit) {
      await updateArticle.mutateAsync({ id: article._id || article.id, data: payload });
    } else {
      await createArticle.mutateAsync(payload);
    }
    handleClose(false);
  };

  const type = useWatch({ control, name: 'type' });
  const status = useWatch({ control, name: 'status' });
  const source = useWatch({ control, name: 'source' });
  const availabilityStatus = useWatch({ control, name: 'availabilityStatus' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const unitOfMeasure = useWatch({ control, name: 'unitOfMeasure' });
  const description = useWatch({ control, name: 'description' });

  const setFormValue = (name, value) => {
    setValue(name, value, { shouldDirty: true, shouldValidate: true });
  };

  const validateCurrentStep = async () => {
    const step = steps[currentStep];
    const fieldNames = STEP_FIELD_NAMES[step.id] ?? [];
    if (!fieldNames.length) return true;
    return trigger(fieldNames, { shouldFocus: true });
  };

  const goNext = async () => {
    const isValid = await validateCurrentStep();
    if (!isValid) return;
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  };

  const goBack = () => {
    setCurrentStep((step) => Math.max(step - 1, 0));
  };

  const submitCurrent = async () => {
    if (currentStep < steps.length - 1) {
      await goNext();
      return;
    }
    await handleSubmit(onSubmit)();
  };

  const isBusy = isSubmitting || createArticle.isPending || updateArticle.isPending;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[94dvh] max-w-[calc(100vw-1rem)] sm:max-w-[78rem]">
        <form onSubmit={(event) => event.preventDefault()} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="gap-4">
            <div className="flex items-start gap-3 pr-10">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-sm">
                <PackageCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle>
                  {isEdit ? t('catalog.articles.edit') : t('catalog.articles.create')}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {t(
                    'catalog.articles.dialogDescription',
                    'Maintain catalog identity, pricing, supplier references and rich item notes in one guided flow.',
                  )}
                </DialogDescription>
              </div>
            </div>
            <StepIndicator
              steps={steps}
              currentStep={currentStep}
              onStepClick={setCurrentStep}
            />
          </DialogHeader>

          <DialogBody className="bg-muted/10">
            <input type="hidden" {...register('categoryId', { required: t('catalog.categories.activeRequired') })} />
            <input type="hidden" {...register('description')} />

            {currentStep === 0 && (
              <StepSurface
                title={t('catalog.articles.basicsTitle', 'Article basics')}
                description={t('catalog.articles.basicsDescription', 'Capture the article number, unit, name and full customer-facing description.')}
              >
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Field
                    id="articleNumber"
                    label={t('catalog.articles.articleNumberShort')}
                    required
                    error={errors.articleNumber && t('catalog.articles.articleNumberRequired')}
                  >
                    <Input
                      id="articleNumber"
                      {...register('articleNumber', { required: true, maxLength: 20 })}
                      disabled={isEdit}
                      placeholder="ART-001"
                    />
                  </Field>
                  <Field id="unitOfMeasure" label={t('catalog.articles.unit')} required>
                    <Select value={unitOfMeasure} onValueChange={(value) => setFormValue('unitOfMeasure', value)}>
                      <SelectTrigger id="unitOfMeasure">
                        <SelectValue placeholder={t('catalog.articles.selectUnit')} />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit.code} value={unit.code}>
                            {unit.code} - {unit.nameDe || unit.nameFr || unit.nameIt || unit.name || unit.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field
                  id="name"
                  label={t('catalog.articles.name')}
                  required
                  error={errors.name && t('catalog.articles.required')}
                >
                  <Input id="name" {...register('name', { required: true })} />
                </Field>

                <Field
                  id="description"
                  label={t('catalog.articles.description')}
                  help={t('catalog.articles.descriptionHelp', 'Use formatted text for long product descriptions, installation notes and service guidance.')}
                >
                  <RichTextEditor
                    value={description}
                    onChange={(value) => setFormValue('description', value)}
                    placeholder={t('catalog.articles.descriptionPlaceholder', 'Write the full product description or technical notes...')}
                    maxLength={8000}
                    minHeight={220}
                    disabled={isBusy}
                  />
                </Field>
              </StepSurface>
            )}

            {currentStep === 1 && (
              <StepSurface
                title={t('catalog.articles.classificationTitle', 'Classification')}
                description={t('catalog.articles.classificationDescription', 'Place the item in the right category and define lifecycle metadata.')}
              >
                <Field
                  id="categoryId"
                  label={t('catalog.categories.category')}
                  required
                  error={errors.categoryId && t('catalog.categories.activeRequired')}
                >
                  <Select value={categoryId} onValueChange={(value) => setFormValue('categoryId', value)}>
                    <SelectTrigger id="categoryId">
                      <SelectValue placeholder={t('catalog.categories.selectCategory')} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category._id || category.id} value={category._id || category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Field id="type" label={t('catalog.articles.type')}>
                    <Select value={type} onValueChange={(value) => setFormValue('type', value)}>
                      <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ARTICLE_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="status" label={t('catalog.articles.status')}>
                    <Select value={status} onValueChange={(value) => setFormValue('status', value)}>
                      <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ARTICLE_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="source" label={t('catalog.articles.source')}>
                    <Select value={source} onValueChange={(value) => setFormValue('source', value)}>
                      <SelectTrigger id="source"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ARTICLE_SOURCES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field id="productGroup" label={t('catalog.articles.productGroup')}>
                  <Input id="productGroup" {...register('productGroup')} maxLength={100} />
                </Field>
              </StepSurface>
            )}

            {currentStep === 2 && (
              <StepSurface
                title={t('catalog.articles.pricingTitle', 'Pricing and stock')}
                description={t('catalog.articles.pricingDescription', 'Define sales price, purchasing cost, currency and availability without crowding the form.')}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <Field id="purchasePrice" label={t('catalog.articles.purchase')}>
                    <Input id="purchasePrice" {...register('purchasePrice')} type="number" step="0.01" min="0" />
                  </Field>
                  <Field
                    id="salesPrice"
                    label={t('catalog.articles.sales')}
                    required
                    error={errors.salesPrice && t('catalog.articles.required')}
                  >
                    <Input id="salesPrice" {...register('salesPrice', { required: true })} type="number" step="0.01" min="0" />
                  </Field>
                  <Field id="currency" label={t('catalog.articles.currency', 'Currency')}>
                    <Input id="currency" {...register('currency')} maxLength={3} />
                  </Field>
                  <Field id="availableQuantity" label={t('catalog.articles.stock')}>
                    <Input id="availableQuantity" {...register('availableQuantity')} type="number" step="0.01" min="0" />
                  </Field>
                </div>

                <Field id="availabilityStatus" label={t('catalog.articles.availability')}>
                  <Select value={availabilityStatus} onValueChange={(value) => setFormValue('availabilityStatus', value)}>
                    <SelectTrigger id="availabilityStatus"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ARTICLE_AVAILABILITY_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </StepSurface>
            )}

            {currentStep === 3 && (
              <StepSurface
                title={t('catalog.articles.supplierTitle', 'Supplier and media')}
                description={t('catalog.articles.supplierDescription', 'Add procurement identifiers, manufacturer metadata and article images.')}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field id="supplierReference" label={t('catalog.articles.supplierRef')}>
                    <Input id="supplierReference" {...register('supplierReference')} maxLength={100} />
                  </Field>
                  <Field id="ighArticleNumber" label={t('catalog.articles.ighNumber')}>
                    <Input id="ighArticleNumber" {...register('ighArticleNumber')} maxLength={50} />
                  </Field>
                  <Field id="supplierName" label={t('catalog.articles.supplier')}>
                    <Input id="supplierName" {...register('supplierName')} maxLength={255} />
                  </Field>
                  <Field id="manufacturerName" label={t('catalog.articles.manufacturer')}>
                    <Input id="manufacturerName" {...register('manufacturerName')} maxLength={255} />
                  </Field>
                  <Field id="manufacturerPartNumber" label={t('catalog.articles.manufacturerPartNumber')}>
                    <Input id="manufacturerPartNumber" {...register('manufacturerPartNumber')} maxLength={100} />
                  </Field>
                </div>

                {article ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t('catalog.images.upload')}</p>
                        <p className="text-xs text-muted-foreground">{t('catalog.images.maxSize')}</p>
                      </div>
                    </div>
                    <ArticleImageGallery
                      articleId={article._id || article.id}
                      onUpload={(file) => uploadImage.mutate({ articleId: article._id || article.id, file })}
                      onDelete={(imageId) => deleteImage.mutate({ articleId: article._id || article.id, imageId })}
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    {t('catalog.images.createFirstHint', 'Save the article first to attach product images.')}
                  </div>
                )}
              </StepSurface>
            )}
          </DialogBody>

          <DialogFooter className="items-center justify-between sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border bg-background px-2.5 py-1">
                {currentStep + 1} / {steps.length}
              </span>
              <span>{steps[currentStep]?.label}</span>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {currentStep === 0 ? (
                <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                  {t('common.cancel')}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={goBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('common.back', 'Back')}
                </Button>
              )}
              <Button type="button" onClick={submitCurrent} disabled={isBusy}>
                {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLastStep ? (isBusy ? t('common.saving') : t('common.save')) : (
                  <>
                    {t('common.next', 'Next')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

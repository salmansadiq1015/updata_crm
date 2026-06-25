'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { useTextBlockMutations } from '../hooks/use-text-block-mutations';
import { useCatalogCategories } from '../hooks/use-catalog-queries';
import { useLanguage } from '@/lib/i18n/language-context';

const schema = z.object({
  title: z.string().min(1).max(200),
  categoryId: z.string().optional(),
  price: z.preprocess((v) => (v === '' || v === undefined ? 0 : Number(v)), z.number().min(0)),
  unit: z.string().max(20).optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

function buildTextBlockDefaults(textBlock) {
  return textBlock
    ? {
      title: textBlock.title,
      categoryId: textBlock.categoryId ?? '__none__',
      price: textBlock.price ?? '',
      unit: textBlock.unit ?? '',
      status: textBlock.status ?? 'ACTIVE',
    }
    : { title: '', categoryId: '__none__', price: '', unit: '', status: 'ACTIVE' };
}

export function TextBlockFormDialog({ open, onClose, textBlock }) {
  const { t } = useLanguage();
  const { createTextBlock, updateTextBlock } = useTextBlockMutations();
  const { data: categories = [] } = useCatalogCategories();
  const isEdit = !!textBlock;

  const [bodyHtml, setBodyHtml] = useState(() => textBlock?.bodyHtml ?? '');

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: buildTextBlockDefaults(textBlock),
  });

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      bodyHtml,
      categoryId: values.categoryId === '__none__' ? undefined : values.categoryId,
      unit: values.unit || undefined,
    };
    try {
      if (isEdit) {
        await updateTextBlock.mutateAsync({ id: textBlock._id, data: payload });
      } else {
        await createTextBlock.mutateAsync(payload);
      }
      onClose();
    } catch {
      // mutation error is available via createTextBlock.error / updateTextBlock.error
    }
  };

  const isPending = createTextBlock.isPending || updateTextBlock.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>
                {isEdit ? t('catalog.textBlocks.edit') : t('catalog.textBlocks.create')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {isEdit ? t('catalog.textBlocks.editDescription') : t('catalog.textBlocks.createDescription')}
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.title')}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.category')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder={t('catalog.textBlocks.noCategory')} /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">{t('catalog.textBlocks.noCategory')}</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalog.articles.status')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ACTIVE">{t('catalog.articles.statusActive')}</SelectItem>
                          <SelectItem value="INACTIVE">{t('catalog.articles.statusInactive')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalog.articles.basePrice')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalog.articles.unitOfMeasure')}</FormLabel>
                      <FormControl><Input {...field} placeholder={t('catalog.textBlocks.unitPlaceholder')} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">{t('catalog.textBlocks.bodyHtml')}</p>
                <RichTextEditor
                  value={bodyHtml}
                  onChange={setBodyHtml}
                  placeholder={t('catalog.textBlocks.bodyPlaceholder', '')}
                  maxLength={5000}
                />
              </div>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={isPending}>{isPending ? t('common.saving') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

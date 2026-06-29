'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUnitMutations } from '../hooks/use-unit-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

const schema = z.object({
  code: z.string().min(1).max(10),
  nameDe: z.string().min(1).max(50),
  nameFr: z.string().min(1).max(50),
  nameIt: z.string().min(1).max(50),
  baseUnitCode: z.string().max(10).optional().or(z.literal('')),
  conversionFactor: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : Number(v)),
    z.number().positive().optional()
  ),
});

export function UomFormDialog({ open, onClose, unit }) {
  const { t } = useLanguage();
  const { createUnit, updateUnit } = useUnitMutations();
  const isEdit = !!unit;

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { code: '', nameDe: '', nameFr: '', nameIt: '', baseUnitCode: '', conversionFactor: '' },
  });

  useEffect(() => {
    if (unit) {
      form.reset({
        code: unit.code,
        nameDe: unit.nameDe,
        nameFr: unit.nameFr,
        nameIt: unit.nameIt,
        baseUnitCode: unit.baseUnitCode ?? '',
        conversionFactor: unit.conversionFactor ?? '',
      });
    } else {
      form.reset({ code: '', nameDe: '', nameFr: '', nameIt: '', baseUnitCode: '', conversionFactor: '' });
    }
  }, [form, unit, open]);

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      baseUnitCode: values.baseUnitCode || undefined,
      conversionFactor: values.conversionFactor || undefined,
    };
    if (isEdit) {
      await updateUnit.mutateAsync({ code: unit.code, data: payload });
    } else {
      await createUnit.mutateAsync(payload);
    }
    onClose();
  };

  const isPending = createUnit.isPending || updateUnit.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>{isEdit ? t('catalog.units.edit') : t('catalog.units.create')}</DialogTitle>
              <DialogDescription className="sr-only">
                {isEdit ? t('catalog.units.edit') : t('catalog.units.create')}
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.units.code')}</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isEdit} placeholder={t('catalog.units.codePlaceholder')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {['nameDe', 'nameFr', 'nameIt'].map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t(`catalog.units.${name}`)}</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="baseUnitCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalog.units.baseUnit')}</FormLabel>
                      <FormControl><Input {...field} placeholder={t('catalog.units.baseUnitPlaceholder')} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="conversionFactor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalog.units.conversionFactor')}</FormLabel>
                      <FormControl><Input {...field} type="number" step="any" placeholder={t('catalog.units.conversionFactorPlaceholder')} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
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

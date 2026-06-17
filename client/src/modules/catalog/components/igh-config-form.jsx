'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useIghConfig } from '../hooks/use-igh-queries';
import { useIghMutations } from '../hooks/use-igh-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

const schema = z.object({
  enabled: z.boolean(),
  endpointUrl: z.string().optional(),
  apiKey: z.string().optional(),
  syncSchedule: z.string().optional(),
});

export function IghConfigForm() {
  const { t } = useLanguage();
  const { data: config, isLoading } = useIghConfig();
  const { saveConfig } = useIghMutations();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { enabled: false, endpointUrl: '', apiKey: '', syncSchedule: '' },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        enabled: config.isEnabled ?? false,
        endpointUrl: config.endpointUrl ?? '',
        apiKey: '',
        syncSchedule: config.syncSchedule ?? '',
      });
    }
  }, [config, form]);

  const onSubmit = async (values) => {
    const payload = {
      isEnabled: values.enabled,
      endpointUrl: values.endpointUrl || undefined,
      syncSchedule: values.syncSchedule || undefined,
    };
    if (values.apiKey) {
      payload.credentials = { apiKey: values.apiKey };
    }
    try {
      await saveConfig.mutateAsync(payload);
    } catch {
      // error accessible via mutation state
    }
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground animate-pulse">{t('common.loading')}</div>;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md border p-4">
              <div>
                <FormLabel className="text-sm font-medium">{t('catalog.igh.config.enableIntegration')}</FormLabel>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('catalog.igh.config.enableDescription')}
                </p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="endpointUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('catalog.connections.endpointUrl')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder="https://data.igh.ch/api/catalog" type="url" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('catalog.connections.apiKey')}</FormLabel>
              <FormControl>
                <Input {...field} type="password" placeholder={t('catalog.igh.config.apiKeyPlaceholder')} />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                {t('catalog.igh.config.apiKeyDescription')}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="syncSchedule"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('catalog.igh.config.syncSchedule')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('catalog.igh.config.syncPlaceholder')} />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                {t('catalog.igh.config.syncDescription')}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={saveConfig.isPending}>
          {saveConfig.isPending ? t('common.saving') : t('catalog.igh.configure')}
        </Button>
      </form>
    </Form>
  );
}

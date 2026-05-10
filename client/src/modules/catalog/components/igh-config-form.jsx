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
  }, [config]);

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

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground animate-pulse">Loading...</div>;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md border p-4">
              <div>
                <FormLabel className="text-sm font-medium">Enable IGH Integration</FormLabel>
                <p className="text-xs text-muted-foreground mt-1">
                  When disabled, no syncs run and the import section is hidden.
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
              <FormLabel>Endpoint URL</FormLabel>
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
              <FormLabel>API Key</FormLabel>
              <FormControl>
                <Input {...field} type="password" placeholder="Leave blank to keep current key" />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Stored encrypted. Leave blank to keep the current value.
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
              <FormLabel>Sync Schedule (cron)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="0 3 * * 0 (every Sunday 3am)" />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Standard cron syntax. Leave blank to disable automatic sync.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={saveConfig.isPending}>
          {saveConfig.isPending ? 'Saving...' : t('catalog.igh.configure')}
        </Button>
      </form>
    </Form>
  );
}

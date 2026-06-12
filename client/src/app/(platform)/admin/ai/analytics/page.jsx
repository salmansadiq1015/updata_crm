'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Plus, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { aiAdminService } from '@/modules/ai/services/ai-admin-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import {
  AiAdminBackLink,
  AiAdminEmptyState,
  AiAdminHeader,
  AiAdminPageShell,
} from '@/modules/ai/components/admin/ai-admin-ui';

function currentPeriod() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function asArray(payload) {
  const value = payload?.data || payload?.items || payload || [];
  return Array.isArray(value) ? value : [];
}

function formatRate(value) {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '-';
}

function getCorrectionRate(metric) {
  const total = Number(metric.totalInteractions || 0);
  if (!total) return null;
  return Number(metric.correctedCount || 0) / total;
}

export default function AiAnalyticsAdminPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const period = currentPeriod();

  const accuracyQuery = useQuery({
    queryKey: ['ai', 'admin', 'accuracy', period],
    queryFn: () => aiAdminService.getAccuracy({ period }),
  });

  const usageQuery = useQuery({
    queryKey: ['ai', 'admin', 'usage'],
    queryFn: () => {
      const to = new Date();
      const from = new Date();
      from.setMonth(from.getMonth() - 1);
      return aiAdminService.getUsage({
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
      });
    },
  });

  const correctionsQuery = useQuery({
    queryKey: ['ai', 'admin', 'corrections'],
    queryFn: () => aiAdminService.getTopCorrections({ limit: 10 }),
  });

  const promoteMutation = useMutation({
    mutationFn: (term) => aiAdminService.createVocabulary({ term, category: 'GENERAL', language: 'de', status: 'ACTIVE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai', 'admin', 'vocabulary'] });
      showSuccess(t('ai.admin.addedToVocabulary'));
    },
    onError: (err) => showError(err),
  });

  const metrics = asArray(accuracyQuery.data);
  const usage = usageQuery.data?.data || usageQuery.data || {};
  const corrections = asArray(correctionsQuery.data);
  const avgMs = usage.processingTime?.avgMs ?? usage.avgProcessingTimeMs ?? null;
  const isLoading = accuracyQuery.isLoading || usageQuery.isLoading || correctionsQuery.isLoading;

  return (
    <AiAdminPageShell className="space-y-6">
      <AiAdminBackLink label={t('ai.admin.back')} />

      <AiAdminHeader
        icon={BarChart3}
        title={t('ai.admin.accuracy')}
        subtitle={t('ai.admin.accuracyUsageDesc')}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-border bg-card/70 p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t('ai.admin.totalSessions')}</p>
          {usageQuery.isLoading ? (
            <Skeleton className="mt-4 h-8 w-24" />
          ) : (
            <p className="mt-3 text-3xl font-semibold text-foreground">{usage.totalSessions ?? '-'}</p>
          )}
        </section>
        <section className="rounded-xl border border-border bg-card/70 p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t('ai.admin.avgProcessing')}</p>
          {usageQuery.isLoading ? (
            <Skeleton className="mt-4 h-8 w-24" />
          ) : (
            <p className="mt-3 text-3xl font-semibold text-foreground">{avgMs != null ? `${Math.round(avgMs)} ms` : '-'}</p>
          )}
        </section>
        <section className="rounded-xl border border-border bg-card/70 p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t('ai.admin.metricsPeriod', null, { period })}</p>
          {accuracyQuery.isLoading ? (
            <Skeleton className="mt-4 h-8 w-24" />
          ) : (
            <p className="mt-3 text-3xl font-semibold text-foreground">{metrics.length}</p>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card/70 shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">{t('ai.admin.metricsPeriod', null, { period })}</h2>
        </div>
        {accuracyQuery.isError ? (
          <div className="px-4 py-6 text-sm text-destructive">{t('ai.admin.loadFailed')}</div>
        ) : accuracyQuery.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
          </div>
        ) : metrics.length === 0 ? (
          <div className="p-4">
            <AiAdminEmptyState icon={TrendingUp} title={t('ai.admin.noAggregatedData')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('ai.admin.feature')}</th>
                  <th className="px-4 py-3 font-medium">{t('ai.admin.language')}</th>
                  <th className="px-4 py-3 font-medium">{t('ai.admin.accuracy')}</th>
                  <th className="px-4 py-3 font-medium">{t('ai.admin.correctionRate')}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={`${metric.feature}-${metric.language}`} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{metric.feature}</td>
                    <td className="px-4 py-3 text-muted-foreground">{metric.language}</td>
                    <td className="px-4 py-3">{formatRate(metric.accuracyRate ?? metric.accuracy)}</td>
                    <td className="px-4 py-3">{formatRate(metric.correctionRate ?? getCorrectionRate(metric))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card/70 shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">{t('ai.admin.topCorrections')}</h2>
        </div>
        {correctionsQuery.isError ? (
          <div className="px-4 py-6 text-sm text-destructive">{t('ai.admin.loadFailed')}</div>
        ) : isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
          </div>
        ) : corrections.length === 0 ? (
          <div className="p-4">
            <AiAdminEmptyState icon={TrendingUp} title={t('ai.admin.noCorrections')} />
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {corrections.map((correction, index) => (
              <div key={`${correction.original}-${correction.correctedTo}-${index}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate">
                  {correction.original} -&gt; <span className="font-medium text-foreground">{correction.correctedTo}</span>
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{correction.count}x</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={correction.correctedTo === '<redacted>' || promoteMutation.isPending}
                    onClick={() => promoteMutation.mutate(correction.correctedTo)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('ai.admin.promote')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AiAdminPageShell>
  );
}

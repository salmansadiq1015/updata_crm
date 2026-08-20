'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock4, Loader2, Plus, Tags, Trash2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { IconActionButton } from '@/shared/components/icon-action-button';
import { showError, showSuccess } from '@/lib/toast';

/**
 * Working-time configuration: the company break rule applied to office hours,
 * and the categories those hours can be split into.
 */
export function WorkTimeSettings() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('time-tracking:admin');

  return (
    <div className="space-y-6">
      <BreakRuleCard t={t} canManage={canManage} />
      <CategoriesCard t={t} canManage={canManage} />
    </div>
  );
}

function BreakRuleCard({ t, canManage }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mobile', 'work-time-settings'],
    queryFn: async () => (await apiClient.get('/mobile/work-time-settings'))?.data,
  });

  // Seed the form once the stored rule arrives.
  useEffect(() => {
    if (data && !form) {
      setForm({
        breakDurationMin: data.breakDurationMin ?? 30,
        breakThresholdHours: data.breakThresholdHours ?? 6,
        billingHourlyRate: data.billingHourlyRate ?? 0,
      });
    }
  }, [data, form]);

  const save = useMutation({
    mutationFn: () => apiClient.put('/mobile/work-time-settings', {
      breakDurationMin: Number(form.breakDurationMin),
      breakThresholdHours: Number(form.breakThresholdHours),
      billingHourlyRate: Number(form.billingHourlyRate) || 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile', 'work-time-settings'] });
      showSuccess(t('timeTracking.settings.saved', 'Einstellungen gespeichert'));
    },
    onError: (err) => showError(err),
  });

  if (isLoading || !form) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Clock4 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t('timeTracking.settings.breakTitle', 'Mittagspause')}</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {t('timeTracking.settings.breakHint', 'Wird bei Büroarbeiten automatisch abgezogen und bleibt pro Eintrag anpassbar.')}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t('timeTracking.settings.breakDuration', 'Dauer (Minuten)')}</Label>
          <Input
            type="number" min="0" max="240"
            value={form.breakDurationMin}
            onChange={(e) => setForm((c) => ({ ...c, breakDurationMin: e.target.value }))}
            disabled={!canManage || save.isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('timeTracking.settings.breakThreshold', 'Ab wie vielen Stunden')}</Label>
          <Input
            type="number" min="0" max="24" step="0.5"
            value={form.breakThresholdHours}
            onChange={(e) => setForm((c) => ({ ...c, breakThresholdHours: e.target.value }))}
            disabled={!canManage || save.isPending}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-border/60 pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('timeTracking.settings.hourlyRate', 'Stundensatz für Verrechnung (CHF)')}</Label>
            <Input
              type="number" min="0" max="10000" step="0.05"
              value={form.billingHourlyRate}
              onChange={(e) => setForm((c) => ({ ...c, billingHourlyRate: e.target.value }))}
              disabled={!canManage || save.isPending}
            />
            <p className="text-xs text-muted-foreground">
              {t('timeTracking.settings.hourlyRateHint', 'Wird beim Erstellen einer Rechnung aus einem Arbeitsrapport als Preis pro Stunde vorgeschlagen.')}
            </p>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" className="gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('common.save', 'Speichern')}
          </Button>
        </div>
      )}
    </section>
  );
}

function CategoriesCard({ t, canManage }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['mobile', 'office-categories'],
    queryFn: async () => (await apiClient.get('/mobile/office-categories'))?.data ?? [],
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['mobile', 'office-categories'] });

  const create = useMutation({
    mutationFn: () => apiClient.post('/mobile/office-categories', {
      name: name.trim(), sortOrder: categories.length,
    }),
    onSuccess: () => { invalidate(); setName(''); showSuccess(t('timeTracking.settings.categoryAdded', 'Kategorie hinzugefügt')); },
    onError: (err) => showError(err),
  });

  const remove = useMutation({
    mutationFn: (id) => apiClient.delete(`/mobile/office-categories/${id}`),
    onSuccess: () => { invalidate(); showSuccess(t('timeTracking.settings.categoryRemoved', 'Kategorie deaktiviert')); },
    onError: (err) => showError(err),
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Tags className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t('timeTracking.settings.categoriesTitle', 'Kategorien für Büroarbeiten')}</h2>
        <span className="text-xs text-muted-foreground">({categories.length})</span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {t('timeTracking.settings.categoriesHint', 'Zum Beispiel Administration, Sitzungen, Weiterbildung, interne Arbeiten.')}
      </p>

      {isLoading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : (
        <ul className="divide-y divide-border/60">
          {categories.map((category) => (
            <li key={category._id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{category.name}</span>
              {canManage && (
                <IconActionButton
                  label={t('common.delete', 'Löschen')}
                  icon={Trash2}
                  destructive
                  onClick={() => remove.mutate(category._id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('timeTracking.settings.categoryPlaceholder', 'Neue Kategorie')}
            disabled={create.isPending}
          />
          <Button type="submit" size="sm" className="shrink-0 gap-1.5" disabled={!name.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {t('common.add', 'Hinzufügen')}
          </Button>
        </form>
      )}
    </section>
  );
}

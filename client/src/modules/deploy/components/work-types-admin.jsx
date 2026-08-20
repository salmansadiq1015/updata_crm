'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock4, Loader2, Plus, Trash2, Wrench } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { EmptyState } from '@/shared/components/empty-state';
import { IconActionButton } from '@/shared/components/icon-action-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { showError, showSuccess } from '@/lib/toast';

/** "1.5" ⇄ 90 minutes — the catalogue stores minutes, people think in hours. */
const toHours = (min) => (Number(min || 0) / 60).toString();
const toMinutes = (hours) => Math.round(Number(String(hours).replace(',', '.') || 0) * 60);

/**
 * Catalogue of works with their standard duration. The duration is what the
 * scheduler proposes when planning an assignment; it stays editable there.
 */
export function WorkTypesAdmin() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('scheduling:admin');

  const [name, setName] = useState('');
  const [hours, setHours] = useState('');

  const { data: workTypes = [], isLoading } = useQuery({
    queryKey: ['scheduling', 'work-types'],
    queryFn: async () => (await apiClient.get('/scheduling/work-types'))?.data ?? [],
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['scheduling', 'work-types'] });

  const create = useMutation({
    mutationFn: () => apiClient.post('/scheduling/work-types', {
      name: name.trim(),
      standardDurationMin: toMinutes(hours),
      sortOrder: workTypes.length,
    }),
    onSuccess: () => { invalidate(); setName(''); setHours(''); showSuccess(t('deploy.workTypes.added', 'Arbeit hinzugefügt')); },
    onError: (err) => showError(err),
  });

  const update = useMutation({
    mutationFn: ({ id, standardDurationMin }) => apiClient.put(`/scheduling/work-types/${id}`, { standardDurationMin }),
    onSuccess: () => { invalidate(); showSuccess(t('deploy.workTypes.saved', 'Standardzeit gespeichert')); },
    onError: (err) => showError(err),
  });

  const remove = useMutation({
    mutationFn: (id) => apiClient.delete(`/scheduling/work-types/${id}`),
    onSuccess: () => { invalidate(); showSuccess(t('deploy.workTypes.removed', 'Arbeit deaktiviert')); },
    onError: (err) => showError(err),
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t('deploy.workTypes.title', 'Standardarbeiten und -zeiten')}</h2>
        <span className="text-xs text-muted-foreground">({workTypes.length})</span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {t('deploy.workTypes.hint', 'Diese Zeiten werden bei der Einsatzplanung vorgeschlagen und bleiben dort anpassbar.')}
      </p>

      {isLoading ? (
        <Skeleton className="h-28 rounded-lg" />
      ) : workTypes.length === 0 ? (
        <EmptyState
          icon={Clock4}
          title={t('deploy.workTypes.empty', 'Keine Standardarbeiten')}
          description={t('deploy.workTypes.emptyDesc', 'Zum Beispiel «Waschtisch ersetzen 1.5 h» oder «Thermostat ersetzen 0.75 h».')}
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {workTypes.map((workType) => (
            <li key={workType._id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{workType.name}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <Input
                  type="number" step="0.25" min="0"
                  defaultValue={toHours(workType.standardDurationMin)}
                  onBlur={(e) => {
                    const next = toMinutes(e.target.value);
                    if (next !== workType.standardDurationMin) update.mutate({ id: workType._id, standardDurationMin: next });
                  }}
                  disabled={!canManage}
                  className="h-8 w-20 text-right text-[13px]"
                />
                <span className="text-[12px] text-muted-foreground">h</span>
              </div>
              {canManage && (
                <IconActionButton
                  label={t('common.delete', 'Löschen')}
                  icon={Trash2}
                  destructive
                  onClick={() => remove.mutate(workType._id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); if (name.trim() && hours) create.mutate(); }}
        >
          <div className="flex-1 space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">{t('deploy.workTypes.name', 'Arbeit')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Waschtisch ersetzen" disabled={create.isPending} />
          </div>
          <div className="w-28 space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">{t('deploy.workTypes.duration', 'Stunden')}</Label>
            <Input type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="1.5" disabled={create.isPending} />
          </div>
          <Button type="submit" size="sm" className="shrink-0 gap-1.5" disabled={!name.trim() || !hours || create.isPending}>
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {t('common.add', 'Hinzufügen')}
          </Button>
        </form>
      )}
    </section>
  );
}

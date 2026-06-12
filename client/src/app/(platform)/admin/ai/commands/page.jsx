'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mic, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import { aiAdminService } from '@/modules/ai/services/ai-admin-service';
import {
  AiAdminBackLink,
  AiAdminEmptyState,
  AiAdminField,
  AiAdminFormPanel,
  AiAdminHeader,
  AiAdminPageShell,
  AiAdminSelect,
} from '@/modules/ai/components/admin/ai-admin-ui';

const EMPTY_FORM = {
  intent: '',
  language: 'de',
  actionType: 'NAVIGATE',
  actionTarget: '',
  phrases: '',
  requiresConfirmation: false,
};

const LANGUAGES = ['de', 'fr', 'it', 'en'];
const ACTION_TYPES = ['NAVIGATE', 'SEARCH', 'UPDATE', 'CREATE'];

export default function AiCommandsAdminPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const listQuery = useQuery({
    queryKey: ['ai', 'admin', 'commands'],
    queryFn: () => aiAdminService.listCommands({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => aiAdminService.createCommand(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai', 'admin', 'commands'] }),
    onError: (err) => showError(err),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => aiAdminService.updateCommand(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai', 'admin', 'commands'] }),
    onError: (err) => showError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => aiAdminService.deleteCommand(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai', 'admin', 'commands'] }),
    onError: (err) => showError(err),
  });

  const items = useMemo(() => {
    const payload = listQuery.data?.data || listQuery.data?.items || listQuery.data || [];
    return Array.isArray(payload) ? payload : [];
  }, [listQuery.data]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (item) => {
    setEditingId(item._id);
    setForm({
      intent: item.intent || '',
      language: item.language || 'de',
      actionType: item.actionType || 'NAVIGATE',
      actionTarget: item.actionTarget || '',
      phrases: Array.isArray(item.phrases) ? item.phrases.join(', ') : '',
      requiresConfirmation: !!item.requiresConfirmation,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      intent: form.intent.trim(),
      language: form.language,
      actionType: form.actionType,
      actionTarget: form.actionTarget.trim(),
      phrases: form.phrases.split(',').map((phrase) => phrase.trim()).filter(Boolean),
      requiresConfirmation: form.requiresConfirmation,
    };
    if (!payload.intent || !payload.actionTarget || payload.phrases.length === 0) return;
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      resetForm();
    } catch {
      // Mutation onError already renders the user-facing failure state.
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isFormValid =
    form.intent.trim().length > 0 &&
    form.actionTarget.trim().length > 0 &&
    form.phrases.split(',').some((phrase) => phrase.trim().length > 0);

  return (
    <AiAdminPageShell className="space-y-6">
      <AiAdminBackLink label={t('ai.admin.back')} />

      <AiAdminHeader
        icon={Mic}
        title={t('ai.admin.commands')}
        subtitle={t('ai.admin.activeCommands', null, { count: items.length })}
        actions={editingId && (
          <Button type="button" variant="outline" onClick={resetForm} className="gap-1">
            <X className="h-4 w-4" />
            {t('common.cancel')}
          </Button>
        )}
      />

      <AiAdminFormPanel onSubmit={handleSubmit}>
        <div className="grid gap-4 lg:grid-cols-12">
          <AiAdminField label={t('ai.admin.intent')} className="lg:col-span-5">
            <Input
              value={form.intent}
              onChange={(e) => setForm((prev) => ({ ...prev, intent: e.target.value }))}
              className="h-11 rounded-lg bg-background/80"
            />
          </AiAdminField>

          <AiAdminField label={t('ai.admin.language')} className="lg:col-span-2">
            <AiAdminSelect
              value={form.language}
              onValueChange={(language) => setForm((prev) => ({ ...prev, language }))}
              options={LANGUAGES}
            />
          </AiAdminField>

          <AiAdminField label={t('ai.admin.action')} className="lg:col-span-3">
            <AiAdminSelect
              value={form.actionType}
              onValueChange={(actionType) => setForm((prev) => ({ ...prev, actionType }))}
              options={ACTION_TYPES}
            />
          </AiAdminField>

          <AiAdminField label={t('ai.admin.target')} className="lg:col-span-2">
            <Input
              value={form.actionTarget}
              onChange={(e) => setForm((prev) => ({ ...prev, actionTarget: e.target.value }))}
              className="h-11 rounded-lg bg-background/80"
            />
          </AiAdminField>

          <AiAdminField label={t('ai.admin.phrases')} className="lg:col-span-12">
            <Input
              value={form.phrases}
              onChange={(e) => setForm((prev) => ({ ...prev, phrases: e.target.value }))}
              placeholder={t('ai.admin.commaSeparated')}
              className="h-11 rounded-lg bg-background/80"
            />
          </AiAdminField>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Checkbox
              checked={form.requiresConfirmation}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, requiresConfirmation: checked === true }))}
            />
            {t('ai.admin.requiresConfirmation')}
          </label>
          <Button type="submit" disabled={!isFormValid || isSaving} className="gap-1">
            {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingId ? t('ai.admin.save') : t('ai.admin.add')}
          </Button>
        </div>
      </AiAdminFormPanel>

      {listQuery.isError ? (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('ai.admin.loadFailed')}
        </div>
      ) : listQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-card/70 p-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-4 border-b border-border/60 py-4 last:border-0">
              <div className="w-full space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-80 max-w-full" />
              </div>
              <Skeleton className="h-9 w-32 shrink-0" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <AiAdminEmptyState
          icon={Mic}
          title={t('ai.admin.emptyCommands')}
          description={t('ai.admin.emptyCommandsDesc')}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/70 shadow-sm">
          {items.map((cmd) => (
            <div key={cmd._id} className="grid gap-4 border-b border-border/60 px-4 py-4 text-sm last:border-0 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{cmd.intent}</span>
                  <Badge variant="outline">{cmd.language}</Badge>
                  <Badge variant="secondary">{cmd.actionType}</Badge>
                  {cmd.requiresConfirmation && (
                    <Badge variant="warning">{t('ai.admin.confirmation')}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{cmd.phrases?.join(' - ')}</p>
                <p className="truncate font-mono text-xs text-foreground/80">{cmd.actionTarget}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => startEdit(cmd)} className="gap-1">
                  <Pencil className="h-4 w-4" />
                  {t('ai.admin.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(cmd._id)}
                  disabled={deleteMutation.isPending}
                  className="gap-1 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('ai.admin.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AiAdminPageShell>
  );
}

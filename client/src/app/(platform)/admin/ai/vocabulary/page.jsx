'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  term: '',
  category: 'EQUIPMENT',
  language: 'de',
  status: 'ACTIVE',
};

const CATEGORIES = ['EQUIPMENT', 'PART', 'BRAND', 'LOCATION', 'GENERAL'];
const LANGUAGES = ['de', 'fr', 'it', 'en'];
const STATUSES = ['ACTIVE', 'PENDING_REVIEW', 'DISABLED'];

export default function AiVocabularyAdminPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const listQuery = useQuery({
    queryKey: ['ai', 'admin', 'vocabulary'],
    queryFn: () => aiAdminService.listVocabulary({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => aiAdminService.createVocabulary(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai', 'admin', 'vocabulary'] }),
    onError: (err) => showError(err),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => aiAdminService.updateVocabulary(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai', 'admin', 'vocabulary'] }),
    onError: (err) => showError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => aiAdminService.deleteVocabulary(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai', 'admin', 'vocabulary'] }),
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
      term: item.term || '',
      category: item.category || 'EQUIPMENT',
      language: item.language || 'de',
      status: item.status || 'ACTIVE',
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      term: form.term.trim(),
      category: form.category,
      language: form.language,
      status: form.status,
    };
    if (!payload.term) return;
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
  const isFormValid = form.term.trim().length > 0;

  return (
    <AiAdminPageShell className="space-y-6">
      <AiAdminBackLink label={t('ai.admin.back')} />

      <AiAdminHeader
        icon={BookOpen}
        title={t('ai.admin.vocabulary')}
        subtitle={t('ai.admin.activeEntries', null, { count: items.length })}
        actions={editingId && (
          <Button type="button" variant="outline" onClick={resetForm} className="gap-1">
            <X className="h-4 w-4" />
            {t('common.cancel')}
          </Button>
        )}
      />

      <AiAdminFormPanel onSubmit={handleSubmit}>
        <div className="grid gap-4 lg:grid-cols-12">
          <AiAdminField label={t('ai.admin.term')} className="lg:col-span-6">
            <Input
              value={form.term}
              onChange={(e) => setForm((prev) => ({ ...prev, term: e.target.value }))}
              className="h-11 rounded-lg bg-background/80"
            />
          </AiAdminField>

          <AiAdminField label={t('ai.admin.category')} className="lg:col-span-2">
            <AiAdminSelect
              value={form.category}
              onValueChange={(category) => setForm((prev) => ({ ...prev, category }))}
              options={CATEGORIES}
            />
          </AiAdminField>

          <AiAdminField label={t('ai.admin.language')} className="lg:col-span-2">
            <AiAdminSelect
              value={form.language}
              onValueChange={(language) => setForm((prev) => ({ ...prev, language }))}
              options={LANGUAGES}
            />
          </AiAdminField>

          <AiAdminField label={t('ai.admin.status')} className="lg:col-span-2">
            <AiAdminSelect
              value={form.status}
              onValueChange={(status) => setForm((prev) => ({ ...prev, status }))}
              options={STATUSES}
            />
          </AiAdminField>
        </div>

        <div className="mt-5 flex justify-end border-t border-border pt-4">
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
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-4 border-b border-border/60 py-4 last:border-0">
              <div className="w-full space-y-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
              <Skeleton className="h-9 w-32 shrink-0" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <AiAdminEmptyState
          icon={BookOpen}
          title={t('ai.admin.emptyVocabulary')}
          description={t('ai.admin.emptyVocabularyDesc')}
        />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card/70 shadow-sm">
          {items.map((item) => (
            <div key={item._id} className="grid gap-4 border-b border-border/60 px-4 py-4 text-sm last:border-0 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{item.term}</span>
                  <Badge variant="outline">{item.category}</Badge>
                  <Badge variant="secondary">{item.language}</Badge>
                  <Badge variant={item.status === 'ACTIVE' ? 'success' : item.status === 'DISABLED' ? 'destructive' : 'warning'}>
                    {item.status}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => startEdit(item)} className="gap-1">
                  <Pencil className="h-4 w-4" />
                  {t('ai.admin.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(item._id)}
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

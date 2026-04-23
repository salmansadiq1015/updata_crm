'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { noteService } from '@/modules/crm/services/note-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { NoteForm } from './note-form';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { RichTextContent } from '@/components/ui/rich-text-content';
import { PermissionGate } from '@/shared/components/permission-gate';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconActionButton } from '@/shared/components/icon-action-button';
import { Skeleton } from '@/components/ui/skeleton';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, Pin, AlertTriangle, FileText } from 'lucide-react';
import { NOTE_CATEGORY_META } from '@/modules/crm/constants/crm-constants';

/**
 * Polymorphic notes panel for sites and installations.
 * @param {Object} props
 * @param {'site'|'installation'} props.entityType
 * @param {string} props.entityId
 */
export function NotesPanel({ entityType, entityId }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  const [formOpen, setFormOpen] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const queryKey = entityType === 'site'
    ? queryKeys.crm.notes.bySite(entityId)
    : queryKeys.crm.notes.byInstallation(entityId);

  const { data: notes = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => noteService.listByEntity(entityType, entityId),
    enabled: !!entityId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const createMut = useMutation({
    mutationFn: (data) => noteService.createForEntity(entityType, entityId, data),
    onSuccess: () => { invalidate(); showSuccess(t('crm.notes.createdToast', 'Notiz erstellt')); },
    onError: (err) => showError(err.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => noteService.update(id, data),
    onSuccess: () => { invalidate(); showSuccess(t('crm.notes.updatedToast', 'Notiz aktualisiert')); },
    onError: (err) => showError(err.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => noteService.delete(id),
    onSuccess: () => { invalidate(); showSuccess(t('crm.notes.deletedToast', 'Notiz gelöscht')); setDeleteTarget(null); },
    onError: (err) => showError(err.message),
  });

  // Pinned notes first, then by createdAt desc
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [notes]);

  const handleSubmit = async (data) => {
    if (editNote?._id) await updateMut.mutateAsync({ id: editNote._id, data });
    else await createMut.mutateAsync(data);
    setEditNote(null);
  };

  if (isLoading) return <NotesSkeleton />;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('crm.notes.title', 'Notizen')}</h3>
            <span className="text-xs text-muted-foreground">({notes.length})</span>
          </div>
          <PermissionGate permission="crm:write">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditNote(null); setFormOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> {t('crm.notes.newNote', 'Neue Notiz')}
            </Button>
          </PermissionGate>
        </div>

        {notes.length === 0 ? (
          <EmptyState title={t('crm.notes.empty', 'Keine Notizen')} description={t('crm.notes.emptyDesc', 'Fügen Sie interne Hinweise hinzu.')} />
        ) : (
          <div className="space-y-2">
            {sortedNotes.map((n) => (
              <NoteItem
                key={n._id}
                note={n}
                canWrite={canWrite}
                canDelete={canDelete}
                onEdit={() => { setEditNote(n); setFormOpen(true); }}
                onDelete={() => setDeleteTarget(n)}
                t={t}
              />
            ))}
          </div>
        )}
      </CardContent>

      <NoteForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={editNote}
        isLoading={createMut.isPending || updateMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={t('crm.notes.confirmDelete', 'Notiz löschen?')}
        description={t('crm.notes.deleteDesc', 'Diese Aktion kann nicht rückgängig gemacht werden.')}
        onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending}
        confirmText={t('common.delete', 'Löschen')}
        variant="destructive"
      />
    </Card>
  );
}

function NoteItem({ note: n, canWrite, canDelete, onEdit, onDelete, t }) {
  const meta = NOTE_CATEGORY_META[n.category] || NOTE_CATEGORY_META.general;
  const Icon = meta.icon;
  const date = n.createdAt ? new Date(n.createdAt).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <div className={cn(
      'group/note relative rounded-xl border bg-card p-3.5 transition-all',
      n.isPinned && 'border-amber-500/30 ring-1 ring-amber-500/5',
      n.isWarning && 'border-red-500/30 bg-red-500/[0.02] ring-1 ring-red-500/5',
      !n.isPinned && !n.isWarning && 'border-border',
    )}>
      <div className="flex gap-3">
        <div className={cn('h-8 w-8 shrink-0 rounded-lg flex items-center justify-center', meta.bg)}>
          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-medium">{t(`crm.notes.category.${n.category}`, meta.label)}</span>
            {n.isPinned && <Pin className="h-3 w-3 text-amber-500 fill-current" />}
            {n.isWarning && <AlertTriangle className="h-3 w-3 text-red-500" />}
            <span className="text-[10px] text-muted-foreground ml-auto">{date}</span>
          </div>
          <RichTextContent html={n.text} className="text-sm break-words" />
        </div>

        <div className="flex items-start gap-0.5">
          {canWrite && (
            <IconActionButton label={t('common.edit', 'Edit')} icon={Pencil} onClick={onEdit} />
          )}
          {canDelete && (
            <IconActionButton label={t('common.delete', 'Delete')} icon={Trash2} destructive onClick={onDelete} />
          )}
        </div>
      </div>
    </div>
  );
}

function NotesSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-28" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3.5 flex gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

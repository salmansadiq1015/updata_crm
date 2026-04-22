'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contactService } from '@/modules/crm/services/contact-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { ContactForm } from './contact-form';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PermissionGate } from '@/shared/components/permission-gate';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconActionButton } from '@/shared/components/icon-action-button';
import { Skeleton } from '@/components/ui/skeleton';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  Plus, Pencil, Trash2, User, Mail, Phone, Smartphone,
  Star, StarOff, UsersIcon, Copy,
} from 'lucide-react';

export function ContactsPanel({ customerId }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: queryKeys.crm.contacts.byCustomer(customerId),
    queryFn: () => contactService.listByCustomer(customerId),
    enabled: !!customerId,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: queryKeys.crm.contacts.byCustomer(customerId) });

  const createMut = useMutation({
    mutationFn: (data) => contactService.createForCustomer(customerId, data),
    onSuccess: () => {
      invalidate();
      showSuccess(t('crm.contacts.createdToast', 'Kontakt erstellt'));
    },
    onError: (err) => showError(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => contactService.update(id, data),
    onSuccess: () => {
      invalidate();
      showSuccess(t('crm.contacts.updatedToast', 'Kontakt aktualisiert'));
    },
    onError: (err) => showError(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => contactService.delete(id),
    onSuccess: () => {
      invalidate();
      showSuccess(t('crm.contacts.deletedToast', 'Kontakt gelöscht'));
      setDeleteTarget(null);
    },
    onError: (err) => showError(err.message),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids) => contactService.bulkDelete(ids),
    onSuccess: ({ deletedCount, failed }) => {
      invalidate();
      if (deletedCount > 0) {
        showSuccess(
          t('crm.contacts.bulkDeletedToast', '{count} Kontakt(e) gelöscht', { count: deletedCount }),
        );
      }
      if (failed > 0) {
        showError(
          t('crm.contacts.bulkFailedToast', '{count} Kontakt(e) konnten nicht gelöscht werden', {
            count: failed,
          }),
        );
      }
      setSelectedIds([]);
      setBulkOpen(false);
    },
    onError: (err) => showError(err.message),
  });

  const setPrimaryMut = useMutation({
    mutationFn: (id) => contactService.setPrimary(id),
    onSuccess: () => {
      invalidate();
      showSuccess(t('crm.contacts.primarySetToast', 'Primärkontakt gesetzt'));
    },
    onError: (err) => showError(err.message),
  });

  const handleSubmit = async (data) => {
    if (editContact?._id) {
      await updateMut.mutateAsync({ id: editContact._id, data });
    } else {
      await createMut.mutateAsync(data);
    }
    setEditContact(null);
  };

  const handleRequestDelete = (contact) => {
    if (contact.isPrimary) {
      showError(
        t(
          'crm.contacts.primaryProtected',
          'Primärkontakt kann nicht gelöscht werden. Weisen Sie zuerst einen anderen Kontakt als Primär zu.',
        ),
      );
      return;
    }
    setDeleteTarget(contact);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    const deletable = contacts.filter((c) => !c.isPrimary).map((c) => c._id);
    const allSelected = deletable.length > 0 && deletable.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : deletable);
  };

  // Only non-primary contacts can be deleted in bulk — filter primaries out even if caller sneaks them in.
  const deletableSelectedIds = useMemo(
    () =>
      selectedIds.filter((id) => {
        const c = contacts.find((x) => x._id === id);
        return c && !c.isPrimary;
      }),
    [selectedIds, contacts],
  );

  if (isLoading) return <ContactsSkeleton />;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('crm.contacts.title', 'Kontakte')}</h3>
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
              {contacts.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {canDelete && contacts.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {selectedIds.length > 0
                  ? t('common.deselectAll', 'Auswahl aufheben')
                  : t('common.selectAll', 'Alle auswählen')}
              </button>
            )}
            <PermissionGate permission="crm:write">
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => {
                  setEditContact(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('crm.contacts.newContact', 'Neuer Kontakt')}
              </Button>
            </PermissionGate>
          </div>
        </div>

        {/* Bulk actions bar (appears above list when selection is non-empty) */}
        {selectedIds.length > 0 && (
          <BulkActionsBar
            count={selectedIds.length}
            onClear={() => setSelectedIds([])}
          >
            <PermissionGate permission="crm:delete">
              {deletableSelectedIds.length > 0 ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setBulkOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {t('crm.contacts.bulkDeleteAction', '{count} löschen', {
                    count: deletableSelectedIds.length,
                  })}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  {t('crm.contacts.primaryProtectedShort', 'Primärkontakt kann nicht gelöscht werden')}
                </span>
              )}
            </PermissionGate>
          </BulkActionsBar>
        )}

        {/* List / Empty */}
        {contacts.length === 0 ? (
          <EmptyState
            title={t('crm.contacts.empty', 'Keine Kontakte angelegt')}
            description={t(
              'crm.contacts.emptyDesc',
              'Fügen Sie den ersten Kontakt hinzu, um Ansprechpartner zu verwalten.',
            )}
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {contacts.map((c) => (
              <ContactCard
                key={c._id}
                contact={c}
                canWrite={canWrite}
                canDelete={canDelete}
                selected={selectedIds.includes(c._id)}
                onToggleSelect={() => toggleSelect(c._id)}
                onEdit={() => {
                  setEditContact(c);
                  setFormOpen(true);
                }}
                onDelete={() => handleRequestDelete(c)}
                onSetPrimary={() => setPrimaryMut.mutate(c._id)}
                isSettingPrimary={
                  setPrimaryMut.isPending && setPrimaryMut.variables === c._id
                }
                t={t}
              />
            ))}
          </div>
        )}
      </CardContent>

      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={editContact}
        isLoading={createMut.isPending || updateMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={t('crm.contacts.confirmDelete', 'Kontakt löschen?')}
        description={
          deleteTarget
            ? t(
                'crm.contacts.deleteDesc',
                'Möchten Sie "{name}" wirklich löschen?',
                { name: `${deleteTarget.firstName} ${deleteTarget.lastName}` },
              )
            : ''
        }
        onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending}
        confirmText={t('common.delete', 'Löschen')}
        variant="destructive"
      />

      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={t('crm.contacts.bulkDeleteTitle', '{count} Kontakte löschen?', {
          count: deletableSelectedIds.length,
        })}
        description={t(
          'crm.contacts.bulkDeleteDesc',
          'Die ausgewählten Kontakte werden unwiderruflich gelöscht. Primärkontakte werden übersprungen.',
        )}
        onConfirm={() => bulkDeleteMut.mutate(deletableSelectedIds)}
        loading={bulkDeleteMut.isPending}
        confirmText={t('crm.contacts.bulkDelete', 'Alle löschen')}
        variant="destructive"
      />
    </Card>
  );
}

function ContactCard({
  contact: c,
  canWrite,
  canDelete,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onSetPrimary,
  isSettingPrimary,
  t,
}) {
  const copy = (val, label) => {
    navigator.clipboard.writeText(val);
    showSuccess(t('common.copied', '{label} kopiert', { label }));
  };

  return (
    <div
      className={cn(
        'group/card relative rounded-xl border bg-card p-3.5 transition-all hover:shadow-theme-sm',
        selected
          ? 'border-primary/50 ring-1 ring-primary/20'
          : c.isPrimary
          ? 'border-amber-500/40 ring-1 ring-amber-500/10'
          : 'border-border',
      )}
    >
      {c.isPrimary && (
        <span className="absolute -top-2 left-3 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-theme-sm">
          <Star className="h-2.5 w-2.5 fill-current" />
          {t('crm.contacts.primaryBadge', 'Primär')}
        </span>
      )}

      <div className="flex items-start gap-3">
        {/* Selection checkbox — disabled for primary to signal it can't be bulk-deleted */}
        {canDelete && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            disabled={c.isPrimary}
            title={
              c.isPrimary
                ? t('crm.contacts.primaryProtectedShort', 'Primärkontakt kann nicht gelöscht werden')
                : undefined
            }
            className={cn(
              'h-4 w-4 rounded border-border accent-primary mt-0.5',
              c.isPrimary ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer',
            )}
          />
        )}

        <div
          className={cn(
            'h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ring-1',
            c.isPrimary ? 'bg-amber-500/10 ring-amber-500/20' : 'bg-sky-500/10 ring-sky-500/20',
          )}
        >
          <User className={cn('h-4 w-4', c.isPrimary ? 'text-amber-500' : 'text-sky-500')} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">
            {c.firstName} {c.lastName}
          </p>
          {c.functionTitle && (
            <p className="text-xs text-muted-foreground truncate">{c.functionTitle}</p>
          )}

          <div className="mt-1.5 space-y-0.5 text-xs">
            {c.email && (
              <button
                type="button"
                onClick={() => copy(c.email, t('crm.email', 'E-Mail'))}
                className="group/item inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                <Mail className="h-3 w-3" />
                <span className="truncate max-w-[180px]">{c.email}</span>
                <Copy className="h-2.5 w-2.5 opacity-0 group-hover/item:opacity-100" />
              </button>
            )}
            {c.phone && (
              <button
                type="button"
                onClick={() => copy(c.phone, t('crm.phone', 'Telefon'))}
                className="group/item flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                <Phone className="h-3 w-3" />
                <span>{c.phone}</span>
                <Copy className="h-2.5 w-2.5 opacity-0 group-hover/item:opacity-100" />
              </button>
            )}
            {c.mobile && (
              <button
                type="button"
                onClick={() => copy(c.mobile, t('crm.mobile', 'Mobil'))}
                className="group/item flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                <Smartphone className="h-3 w-3" />
                <span>{c.mobile}</span>
                <Copy className="h-2.5 w-2.5 opacity-0 group-hover/item:opacity-100" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {canWrite && !c.isPrimary && (
            <IconActionButton
              label={t('crm.contacts.setPrimary', 'Set as primary')}
              icon={StarOff}
              onClick={onSetPrimary}
              disabled={isSettingPrimary}
            />
          )}
          {canWrite && (
            <IconActionButton label={t('common.edit', 'Edit')} icon={Pencil} onClick={onEdit} />
          )}
          {canDelete && !c.isPrimary && (
            <IconActionButton label={t('common.delete', 'Delete')} icon={Trash2} destructive onClick={onDelete} />
          )}
        </div>
      </div>
    </div>
  );
}

function ContactsSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3.5">
              <div className="flex gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

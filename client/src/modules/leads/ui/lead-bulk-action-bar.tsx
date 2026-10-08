'use client';

import { useState } from 'react';
import { Loader2, Mail, MessageCircle, Sparkles, Trash2, UserPlus, UserRound, UserX, X } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useLanguage,
} from './lead-ui-kit';
import { getUserDisplayName } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';

type LeadBulkActionBarProps = {
  /** Ids of the selected, currently visible leads. The bar hides itself when empty. */
  selectedIds: string[];
  users?: LeadUser[];
  canAssign?: boolean;
  canDelete?: boolean;
  canEmail?: boolean;
  canWhatsApp?: boolean;
  canEnrich?: boolean;
  /** A bulk request is running: actions are disabled until it settles. */
  isBusy?: boolean;
  /** `null` clears the assignment. */
  onAssign: (userId: string | null) => void;
  onDelete: () => void;
  onEmail?: () => void;
  onWhatsApp?: () => void;
  onEnrich?: () => void;
  onClear: () => void;
};

/**
 * Floating bar shown while rows are selected (mirrors the tasks bulk bar):
 * selection count, assign, delete (behind a confirmation) and clear.
 */
export function LeadBulkActionBar({
  selectedIds,
  users = [],
  canAssign = true,
  canDelete = true,
  canEmail = false,
  canWhatsApp = false,
  canEnrich = false,
  isBusy = false,
  onAssign,
  onDelete,
  onEmail,
  onWhatsApp,
  onEnrich,
  onClear,
}: LeadBulkActionBarProps) {
  const { t } = useLanguage();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const count = selectedIds.length;

  if (count === 0) return null;

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('leads.bulk.deleteTitle', 'Delete {count} leads?', { count })}
        description={t(
          'leads.bulk.deleteDescription',
          '{count} lead(s) will be removed from your pipeline. This action cannot be undone.',
          { count },
        )}
        confirmText={isBusy
          ? t('leads.bulk.deleting', 'Deleting {count} leads…', { count })
          : t('leads.bulk.deleteConfirm', 'Delete {count} leads', { count })}
        cancelText={t('common.cancel', 'Cancel')}
        loading={isBusy}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />

      <div
        role="region"
        aria-label={t('leads.bulk.region', 'Bulk actions')}
        className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-2xl animate-in slide-in-from-bottom-2"
      >
        <span aria-live="polite" className="whitespace-nowrap text-sm font-medium text-foreground">
          {t('common.selectedCountShort', '{count} selected', { count })}
        </span>

        {(canEmail || canWhatsApp || canEnrich || canAssign || canDelete) && (
          <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        )}

        {canEmail && (
          <Button variant="outline" size="sm" className="gap-1.5" disabled={isBusy} onClick={onEmail}>
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leads.bulk.email', 'Email')}
          </Button>
        )}

        {canWhatsApp && (
          <Button variant="outline" size="sm" className="gap-1.5" disabled={isBusy} onClick={onWhatsApp}>
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leads.bulk.whatsapp', 'WhatsApp')}
          </Button>
        )}

        {canEnrich && (
          <Button variant="outline" size="sm" className="gap-1.5" disabled={isBusy} onClick={onEnrich}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leads.bulk.enrich', 'Enrich')}
          </Button>
        )}

        {canAssign && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={isBusy}>
                {isBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t('leads.bulk.assign', 'Assign to')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="max-h-72 w-64">
              <DropdownMenuItem onSelect={() => onAssign(null)} className="gap-2">
                <UserX className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {t('leads.bulk.unassign', 'Unassign')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {users.length === 0 ? (
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {t('leads.bulk.noUsers', 'No team members found')}
                </DropdownMenuLabel>
              ) : (
                users.map((user) => (
                  <DropdownMenuItem key={user.id} onSelect={() => onAssign(user.id)} className="gap-2">
                    <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{getUserDisplayName(user)}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isBusy}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t('common.delete', 'Delete')}
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClear}
          disabled={isBusy}
          aria-label={t('common.clearSelection', 'Clear selection')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </>
  );
}

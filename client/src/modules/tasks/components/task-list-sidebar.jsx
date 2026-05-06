'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTaskLists } from '../hooks/use-task-queries';
import { useTaskListMutations } from '../hooks/use-task-mutations';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Plus, List, Star, MoreHorizontal, Pencil, Trash2, Archive } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── List form dialog ──────────────────────────────────────────────────────────

function ListFormDialog({ open, onOpenChange, onSubmit, initial, isLoading, de }) {
  const [name, setName] = useState(initial?.name || '');

  const handleSave = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? (de ? 'Liste bearbeiten' : 'Edit List') : (de ? 'Neue Liste' : 'New List')}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={de ? 'Listenname...' : 'List name...'}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button onClick={handleSave} disabled={isLoading || !name.trim()}>
            {isLoading ? (de ? 'Speichern...' : 'Saving...') : (de ? 'Speichern' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sidebar item ──────────────────────────────────────────────────────────────

function ListItem({ list, active, de, onEdit, onDelete, onArchive }) {
  return (
    <div className={cn(
      'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
      active ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60 text-foreground',
    )}>
      <List className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 text-sm font-medium truncate">{list.name}</span>
      {list.isDefault && <Star className="h-3 w-3 text-amber-500 shrink-0" />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-background/80 transition-opacity"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(list); }}>
            <Pencil className="h-3.5 w-3.5 mr-2" />{de ? 'Bearbeiten' : 'Edit'}
          </DropdownMenuItem>
          {!list.isDefault && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(list); }}>
              <Archive className="h-3.5 w-3.5 mr-2" />{de ? 'Archivieren' : 'Archive'}
            </DropdownMenuItem>
          )}
          {!list.isDefault && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(list); }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />{de ? 'Löschen' : 'Delete'}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export function TaskListSidebar({ activeListId, onSelectList }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useTaskLists();
  const { createList, updateList, removeList, archiveList } = useTaskListMutations();

  const lists = Array.isArray(data) ? data : [];
  const activeLists = lists.filter((l) => !l.isArchived);
  const archivedLists = lists.filter((l) => l.isArchived);

  const handleCreate = (data) => {
    createList.mutate(data, { onSuccess: () => setShowCreate(false) });
  };

  const handleUpdate = (data) => {
    if (!editTarget) return;
    updateList.mutate({ id: editTarget.id, data }, { onSuccess: () => setEditTarget(null) });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    removeList.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        if (activeListId === deleteTarget.id) onSelectList(null);
      },
    });
  };

  return (
    <div className="flex flex-col h-full w-56 border-r bg-card px-2 py-4 gap-1">
      {/* All tasks */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium',
          !activeListId ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
        )}
        onClick={() => onSelectList(null)}
      >
        <List className="h-3.5 w-3.5" />
        {de ? 'Alle Aufgaben' : 'All Tasks'}
      </div>

      <div className="my-1 border-t" />

      {/* Lists */}
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {de ? 'Listen' : 'Lists'}
        </span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {isLoading && (
        <div className="px-3 py-2 text-xs text-muted-foreground">{de ? 'Laden...' : 'Loading...'}</div>
      )}

      {activeLists.map((list) => (
        <div key={list.id} onClick={() => onSelectList(list.id)}>
          <ListItem
            list={list}
            active={activeListId === list.id}
            de={de}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
            onArchive={(l) => archiveList.mutate(l.id)}
          />
        </div>
      ))}

      {archivedLists.length > 0 && (
        <>
          <div className="my-1 border-t" />
          <div className="px-3 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {de ? 'Archiviert' : 'Archived'}
            </span>
          </div>
          {archivedLists.map((list) => (
            <div key={list.id} onClick={() => onSelectList(list.id)} className="opacity-60">
              <ListItem
                list={list}
                active={activeListId === list.id}
                de={de}
                onEdit={setEditTarget}
                onDelete={setDeleteTarget}
                onArchive={(l) => archiveList.mutate(l.id)}
              />
            </div>
          ))}
        </>
      )}

      {/* Dialogs */}
      <ListFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={handleCreate}
        isLoading={createList.isPending}
        de={de}
      />
      <ListFormDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSubmit={handleUpdate}
        initial={editTarget}
        isLoading={updateList.isPending}
        de={de}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={de ? 'Liste löschen?' : 'Delete list?'}
        description={de
          ? `"${deleteTarget?.name}" und alle darin enthaltenen Aufgaben werden dauerhaft gelöscht.`
          : `"${deleteTarget?.name}" and all tasks in it will be permanently deleted.`}
        confirmLabel={de ? 'Löschen' : 'Delete'}
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={removeList.isPending}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  ClipboardList,
  Folder as FolderIcon,
  LayoutList,
  MoreHorizontal,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { FOLDER_COLOR_OPTIONS } from './task-ui-constants';
import { ListColorDialog, FolderColorDialog } from './color-picker-dialog';

// ── Types ─────────────────────────────────────────────────────────────────────

type FolderAction = 'rename' | 'changeColor' | 'delete' | 'addList';
type ListAction = 'rename' | 'changeColor' | 'moveToFolder' | 'archive' | 'delete';

type TaskSidebarProps = {
  folders: any[];           // TaskFolderWithLists[]
  standaloneLists: any[];   // TaskList[] not in any folder
  activeListId: string | undefined;
  activeSavedView: string;  // 'none' | 'dueToday' | 'overdue'
  collapsed: boolean;
  collapsedFolderIds: string[];
  onCollapseChange: (collapsed: boolean) => void;
  onToggleFolder: (folderId: string) => void;
  onSelectList: (listId: string | undefined) => void;
  onSelectSavedView: (view: string) => void;
  onCreateFolder: () => void;
  onCreateList: (folderId?: string) => void;
  onFolderAction: (action: FolderAction, folder: any) => void;
  onListAction: (action: ListAction, list: any, folderId: string | null) => void;
  onListColorChange?: (listId: string, folderId: string | null, color: string | null) => void;
  onFolderColorChange?: (folderId: string, color: string | null) => void;
};

// ── Color helpers ─────────────────────────────────────────────────────────────

const FOLDER_COLOR_CLASS_MAP: Record<string, string> = Object.fromEntries(
  FOLDER_COLOR_OPTIONS.map((opt) => [opt.value, opt.class])
);

function getFolderColorStyle(color: string | null | undefined): { className?: string; style?: React.CSSProperties } {
  if (!color) return {};
  if (color.startsWith('#') || color.startsWith('rgb')) {
    return { style: { color } };
  }
  return { className: FOLDER_COLOR_CLASS_MAP[color] ?? '' };
}

// ── ListItem ─────────────────────────────────────────────────────────────────

function ListItem({
  list,
  folderId,
  activeListId,
  onSelectList,
  onListAction,
  onChangeColor,
}: {
  list: any;
  folderId: string | null;
  activeListId: string | undefined;
  onSelectList: (listId: string | undefined) => void;
  onListAction: (action: ListAction, list: any, folderId: string | null) => void;
  onChangeColor?: () => void;
}) {
  const isActive = activeListId === list.id;

  return (
    <div className="group/listitem relative">
      <button
        type="button"
        onClick={() => onSelectList(list.id)}
        className={cn(
          'w-full flex items-center gap-2 rounded-md px-2 h-8 text-sm text-left pr-8',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground',
        )}
      >
        {list.color ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full flex-none"
            style={{ backgroundColor: list.color }}
          />
        ) : list.type === 'GROUP' ? (
          <Users className="h-4 w-4 shrink-0" />
        ) : (
          <ClipboardList className="h-4 w-4 shrink-0" />
        )}
        <span className="flex-1 truncate">{list.name}</span>
        {list.openTaskCount > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">{list.openTaskCount}</span>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="absolute right-1 top-1 opacity-0 group-hover/listitem:opacity-100 h-6 w-6 flex items-center justify-center rounded hover:bg-accent transition-opacity"
            aria-label={`Options for list ${list.name}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => onListAction('rename', list, folderId)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChangeColor?.()}>
            <Palette className="mr-2 h-3.5 w-3.5" />
            Change color
          </DropdownMenuItem>
          {folderId && (
            <DropdownMenuItem onClick={() => onListAction('moveToFolder', list, folderId)}>
              <FolderIcon className="mr-2 h-3.5 w-3.5" />
              Move to folder
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onListAction('archive', list, folderId)}>
            Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onListAction('delete', list, folderId)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── FolderItem ────────────────────────────────────────────────────────────────

function FolderItem({
  folder,
  isCollapsed: isFolderCollapsed,
  activeListId,
  onToggle,
  onSelectList,
  onListAction,
  onFolderAction,
  onCreateList,
  onChangeFolderColor,
  onChangeListColor,
}: {
  folder: any;
  isCollapsed: boolean;
  activeListId: string | undefined;
  onToggle: () => void;
  onSelectList: (listId: string | undefined) => void;
  onListAction: (action: ListAction, list: any, folderId: string | null) => void;
  onFolderAction: (action: FolderAction, folder: any) => void;
  onCreateList: (folderId?: string) => void;
  onChangeFolderColor?: () => void;
  onChangeListColor?: (list: any) => void;
}) {
  const colorProps = getFolderColorStyle(folder.color);

  return (
    <div>
      <div className="group/folder flex items-center gap-1 rounded-md px-1 h-8 hover:bg-accent/50">
        <button
          type="button"
          onClick={onToggle}
          className="h-5 w-5 shrink-0 flex items-center justify-center text-muted-foreground"
          aria-label={isFolderCollapsed ? `Expand folder ${folder.name}` : `Collapse folder ${folder.name}`}
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform duration-150', !isFolderCollapsed && 'rotate-90')}
          />
        </button>

        <FolderIcon
          className={cn('h-4 w-4 shrink-0', colorProps.className)}
          style={colorProps.style}
        />

        <span className="flex-1 truncate text-sm">{folder.name}</span>

        {(folder.lists?.length ?? 0) > 0 && (
          <span className="text-[10px] text-muted-foreground opacity-0 group-hover/folder:opacity-0 tabular-nums">
            {folder.lists.length}
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="opacity-0 group-hover/folder:opacity-100 h-6 w-6 flex items-center justify-center rounded hover:bg-accent transition-opacity"
              aria-label={`Options for folder ${folder.name}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => onFolderAction('rename', folder)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChangeFolderColor?.()}>
              <Palette className="mr-2 h-3.5 w-3.5" />
              Change color
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onCreateList(folder.id)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add list
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onFolderAction('delete', folder)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!isFolderCollapsed && (
        <div className="ml-5 space-y-0.5 mt-0.5">
          {(folder.lists ?? []).map((list: any) => (
            <ListItem
              key={list.id}
              list={list}
              folderId={folder.id}
              activeListId={activeListId}
              onSelectList={onSelectList}
              onListAction={onListAction}
              onChangeColor={() => onChangeListColor?.(list)}
            />
          ))}
          {(folder.lists ?? []).length === 0 && (
            <button
              type="button"
              onClick={() => onCreateList(folder.id)}
              className="w-full flex items-center gap-2 px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 rounded-md"
            >
              <Plus className="h-3 w-3" />
              Add a list
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── SavedViewButton ───────────────────────────────────────────────────────────

function SavedViewButton({
  view,
  label,
  icon: Icon,
  activeSavedView,
  onSelectSavedView,
}: {
  view: string;
  label: string;
  icon: React.ElementType;
  activeSavedView: string;
  onSelectSavedView: (view: string) => void;
}) {
  const isActive = activeSavedView === view;
  return (
    <button
      type="button"
      onClick={() => onSelectSavedView(isActive ? 'none' : view)}
      className={cn(
        'w-full flex items-center gap-2 rounded-md px-2 h-8 text-sm text-left transition-colors',
        isActive
          ? view === 'dueToday'
            ? 'bg-warning/10 text-warning'
            : 'bg-danger/10 text-danger'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

// ── TaskSidebar (main export) ─────────────────────────────────────────────────

export function TaskSidebar({
  folders,
  standaloneLists,
  activeListId,
  activeSavedView,
  collapsed,
  collapsedFolderIds,
  onCollapseChange,
  onToggleFolder,
  onSelectList,
  onSelectSavedView,
  onCreateFolder,
  onCreateList,
  onFolderAction,
  onListAction,
  onListColorChange,
  onFolderColorChange,
}: TaskSidebarProps) {
  const isAllTasksActive = !activeListId && activeSavedView === 'none';

  // Color picker state
  const [listColorTarget, setListColorTarget] = useState<{ list: any; folderId: string | null } | null>(null);
  const [folderColorTarget, setFolderColorTarget] = useState<any | null>(null);

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-64',
      )}
      aria-label="Task workspace navigation"
    >
      {/* HEADER */}
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        {!collapsed && (
          <span className="text-sm font-semibold text-foreground">Tasks</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8 shrink-0', collapsed && 'mx-auto')}
          onClick={() => onCollapseChange(!collapsed)}
          aria-label={collapsed ? 'Expand task sidebar' : 'Collapse task sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* SCROLL AREA */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-1 px-2">

        {/* ALL TASKS */}
        <button
          type="button"
          onClick={() => {
            onSelectList(undefined);
            onSelectSavedView('none');
          }}
          className={cn(
            'w-full flex items-center gap-2 rounded-md px-2 h-8 text-sm transition-colors',
            isAllTasksActive
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground',
          )}
          aria-label="All tasks"
        >
          <LayoutList className="h-4 w-4 shrink-0" />
          {!collapsed && <span>All Tasks</span>}
        </button>

        {!collapsed && (
          <>
            {/* FOLDERS SECTION */}
            {folders.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Folders
                  </span>
                  <button
                    type="button"
                    onClick={onCreateFolder}
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    aria-label="Create folder"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-0.5">
                  {folders.map((folder) => (
                    <FolderItem
                      key={folder.id}
                      folder={folder}
                      isCollapsed={collapsedFolderIds.includes(folder.id)}
                      activeListId={activeListId}
                      onToggle={() => onToggleFolder(folder.id)}
                      onSelectList={onSelectList}
                      onListAction={onListAction}
                      onFolderAction={onFolderAction}
                      onCreateList={onCreateList}
                      onChangeFolderColor={() => setFolderColorTarget(folder)}
                      onChangeListColor={(list) => setListColorTarget({ list, folderId: folder.id })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* LISTS SECTION — standalone lists */}
            <div className="mt-3">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Lists
                </span>
                <button
                  type="button"
                  onClick={() => onCreateList()}
                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  aria-label="Create list"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-0.5">
                {standaloneLists.map((list) => (
                  <ListItem
                    key={list.id}
                    list={list}
                    folderId={null}
                    activeListId={activeListId}
                    onSelectList={onSelectList}
                    onListAction={onListAction}
                    onChangeColor={() => setListColorTarget({ list, folderId: null })}
                  />
                ))}
                {standaloneLists.length === 0 && folders.length === 0 && (
                  <button
                    type="button"
                    onClick={() => onCreateList()}
                    className="w-full flex items-center gap-2 px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 rounded-md"
                  >
                    <Plus className="h-3 w-3" />
                    Create your first list
                  </button>
                )}
              </div>
            </div>

            {/* SAVED VIEWS */}
            <div className="mt-3">
              <div className="px-1 mb-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Views
                </span>
              </div>
              <div className="space-y-0.5">
                <SavedViewButton
                  view="dueToday"
                  label="Due Today"
                  icon={Calendar}
                  activeSavedView={activeSavedView}
                  onSelectSavedView={onSelectSavedView}
                />
                <SavedViewButton
                  view="overdue"
                  label="Overdue"
                  icon={AlertCircle}
                  activeSavedView={activeSavedView}
                  onSelectSavedView={onSelectSavedView}
                />
              </div>
            </div>
          </>
        )}

        {/* COLLAPSED: show create folder/list icons */}
        {collapsed && (
          <div className="mt-2 flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={onCreateFolder}
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              aria-label="Create folder"
            >
              <FolderIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onCreateList()}
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              aria-label="Create list"
            >
              <ClipboardList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onSelectSavedView(activeSavedView === 'dueToday' ? 'none' : 'dueToday')}
              className={cn(
                'h-8 w-8 flex items-center justify-center rounded hover:bg-accent',
                activeSavedView === 'dueToday' ? 'text-warning' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label="Due Today"
            >
              <Calendar className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onSelectSavedView(activeSavedView === 'overdue' ? 'none' : 'overdue')}
              className={cn(
                'h-8 w-8 flex items-center justify-center rounded hover:bg-accent',
                activeSavedView === 'overdue' ? 'text-danger' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label="Overdue"
            >
              <AlertCircle className="h-4 w-4" />
            </button>
          </div>
        )}
      </nav>

      {/* List color picker dialog */}
      <ListColorDialog
        open={Boolean(listColorTarget)}
        currentColor={listColorTarget?.list?.color ?? null}
        onColorChange={(color) => {
          if (listColorTarget) {
            onListColorChange?.(listColorTarget.list.id, listColorTarget.folderId, color);
          }
        }}
        onClose={() => setListColorTarget(null)}
      />

      {/* Folder color picker dialog */}
      <FolderColorDialog
        open={Boolean(folderColorTarget)}
        currentColor={folderColorTarget?.color ?? null}
        onColorChange={(color) => {
          if (folderColorTarget) {
            onFolderColorChange?.(folderColorTarget.id, color);
          }
        }}
        onClose={() => setFolderColorTarget(null)}
      />
    </aside>
  );
}

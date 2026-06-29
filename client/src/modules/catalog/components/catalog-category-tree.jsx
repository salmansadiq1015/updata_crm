'use client';

import { useState } from 'react';
import {
  Ban,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { useCatalogCategoryOptions, useCatalogCategoryTree } from '../hooks/use-catalog-queries';
import { useCategoryMutations } from '../hooks/use-catalog-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

const ROOT_VALUE = '__root__';

function buildCategoryForm(category) {
  return category
    ? {
      code: category.code || '',
      name: category.name || '',
      description: category.description || '',
      parentId: category.parentId || ROOT_VALUE,
      sortOrder: category.sortOrder || 0,
    }
    : { code: '', name: '', description: '', parentId: ROOT_VALUE, sortOrder: 0 };
}

function CategoryNode({ node, selectedId, onSelect, onEdit, onDeactivate, depth = 0 }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(depth === 0);
  const id = node._id || node.id;
  const hasChildren = node.children?.length > 0;
  const isSelected = selectedId === id;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors',
          isSelected ? 'bg-primary/10 font-medium text-primary' : 'text-foreground/80 hover:bg-muted/60',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <button
          type="button"
          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? t('catalog.categories.collapse') : t('catalog.categories.expand')}
        >
          {hasChildren ? (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : null}
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(id)}>
          {isSelected || open
            ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            : <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{node.name}</span>
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {node.articleCount ?? 0}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onEdit(node)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDeactivate(node)} disabled={node.status === 'INACTIVE'}>
              <Ban className="mr-2 h-3.5 w-3.5" />
              {t('catalog.articles.deactivate')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && hasChildren && node.children.map((child) => (
        <CategoryNode
          key={child._id || child.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onDeactivate={onDeactivate}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function CategoryDialog({ open, onOpenChange, category, categories }) {
  const { t } = useLanguage();
  const { createCategory, updateCategory, moveCategory } = useCategoryMutations();
  const [form, setForm] = useState(() => buildCategoryForm(category));
  const isEdit = Boolean(category);

  const save = async () => {
    const parentId = form.parentId === ROOT_VALUE ? null : form.parentId;
    if (isEdit) {
      await updateCategory.mutateAsync({
        id: category._id || category.id,
        data: {
          code: form.code,
          name: form.name,
          description: form.description,
          sortOrder: Number(form.sortOrder) || 0,
        },
      });
      if (String(parentId || '') !== String(category.parentId || '')) {
        await moveCategory.mutateAsync({ id: category._id || category.id, newParentId: parentId });
      }
    } else {
      await createCategory.mutateAsync({
        code: form.code,
        name: form.name,
        description: form.description,
        parentId,
        sortOrder: Number(form.sortOrder) || 0,
      });
    }
    onOpenChange(false);
  };

  const blockedParentIds = new Set([category?._id || category?.id].filter(Boolean).map(String));
  const parentOptions = categories.filter((item) => !blockedParentIds.has(String(item._id || item.id)));
  const isSaving = createCategory.isPending || updateCategory.isPending || moveCategory.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1rem)] sm:max-w-3xl">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!form.code || !form.name || isSaving) return;
            save();
          }}
        >
          <DialogHeader>
            <div className="flex items-start gap-3 pr-10">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-sm">
                <FolderPlus className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>{isEdit ? t('catalog.categories.edit') : t('catalog.categories.create')}</DialogTitle>
                <DialogDescription className="mt-1">
                  {t('catalog.categories.dialogDescription', 'Organize material and service articles with clear category metadata and rich internal notes.')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-5 bg-muted/10">
            <section className="space-y-4 rounded-2xl border border-border/70 bg-background/55 p-4 shadow-sm sm:p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="category-code" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('catalog.categories.code')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="category-code"
                    value={form.code}
                    onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category-sort" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('catalog.categories.sort')}
                  </Label>
                  <Input
                    id="category-sort"
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('catalog.categories.name')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="category-name"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('catalog.categories.description')}
                </Label>
                <RichTextEditor
                  value={form.description}
                  onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
                  placeholder={t('catalog.categories.descriptionPlaceholder', 'Add category notes, inclusion rules or buying guidance...')}
                  maxLength={4000}
                  minHeight={180}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('catalog.categories.parent')}
                </Label>
                <Select value={form.parentId || ROOT_VALUE} onValueChange={(value) => setForm((prev) => ({ ...prev, parentId: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT_VALUE}>{t('catalog.categories.root')}</SelectItem>
                    {parentOptions.map((item) => (
                      <SelectItem key={item._id || item.id} value={item._id || item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={!form.code || !form.name || isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogCategoryTree({ selectedId, onSelect }) {
  const { t } = useLanguage();
  const { data: tree = [], isLoading, isError } = useCatalogCategoryTree();
  const { data: categoryOptions = [] } = useCatalogCategoryOptions({ includeInactive: true });
  const { deactivateCategory } = useCategoryMutations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [dialogKey, setDialogKey] = useState(0);

  const openCreate = () => { setEditing(null); setDialogKey((key) => key + 1); setDialogOpen(true); };
  const openEdit = (category) => { setEditing(category); setDialogKey((key) => key + 1); setDialogOpen(true); };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('catalog.categories.title')}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openCreate} aria-label={t('catalog.categories.create')}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <button
          type="button"
          className={cn(
            'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
            !selectedId ? 'bg-primary/10 font-medium text-primary' : 'text-foreground/80 hover:bg-muted/60',
          )}
          onClick={() => onSelect(null)}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{t('catalog.categories.allArticles')}</span>
        </button>

        {isLoading && <div className="px-3 py-4 text-xs text-muted-foreground">{t('common.loading')}</div>}
        {isError && <div className="px-3 py-4 text-xs text-destructive">{t('catalog.categories.loadError')}</div>}
        {!isLoading && !isError && tree.map((node) => (
          <CategoryNode
            key={node._id || node.id}
            node={node}
            selectedId={selectedId}
            onSelect={onSelect}
            onEdit={openEdit}
            onDeactivate={(category) => deactivateCategory.mutate(category._id || category.id)}
          />
        ))}
      </div>

      <CategoryDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
        categories={categoryOptions}
      />
    </div>
  );
}

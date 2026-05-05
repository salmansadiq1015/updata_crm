'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, FolderOpen, Folder, Plus, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCatalogCategories } from '../hooks/use-catalog-queries';
import { useCategoryMutations } from '../hooks/use-catalog-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

function buildTree(categories) {
  const map = {};
  const roots = [];
  for (const c of categories) map[c._id || c.id] = { ...c, children: [] };
  for (const c of categories) {
    if (c.parentId && map[c.parentId]) {
      map[c.parentId].children.push(map[c._id || c.id]);
    } else {
      roots.push(map[c._id || c.id]);
    }
  }
  return roots;
}

function CategoryNode({ node, selectedId, onSelect, onEdit, depth = 0 }) {
  const [open, setOpen] = useState(depth === 0);
  const id = node._id || node.id;
  const hasChildren = node.children?.length > 0;
  const isSelected = selectedId === id;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors',
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/60 text-foreground/80',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(id)}
      >
        <button
          className="shrink-0 h-4 w-4 flex items-center justify-center text-muted-foreground"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        >
          {hasChildren ? (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : null}
        </button>
        {isSelected || open
          ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          : <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="flex-1 truncate">{node.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(node); }}>
              Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <CategoryNode
              key={child._id || child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={onEdit}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CatalogCategoryTree({ selectedId, onSelect }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const { data: categories = [], isLoading } = useCatalogCategories();
  const tree = buildTree(categories);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {de ? 'Kategorien' : 'Categories'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {/* All articles option */}
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors mb-1',
            !selectedId ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/60 text-foreground/80',
          )}
          onClick={() => onSelect(null)}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{de ? 'Alle Artikel' : 'All Articles'}</span>
        </div>

        {isLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">{de ? 'Lädt...' : 'Loading...'}</div>
        ) : (
          tree.map((node) => (
            <CategoryNode
              key={node._id || node.id}
              node={node}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={() => {}}
            />
          ))
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookOpen, Search } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

function useTextBlockPicker(search) {
  return useQuery({
    queryKey: ['catalog', 'picker', 'textBlocks', search],
    queryFn: () => apiClient.get(ENDPOINTS.CATALOG.PICKER_TEXT_BLOCKS, { params: { q: search, limit: 30 } }),
    select: (r) => (Array.isArray(r.data) ? r.data : r.data?.items ?? []),
    staleTime: 60 * 1000,
  });
}

export function TextBlockPicker({ onSelect }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: blocks = [], isLoading } = useTextBlockPicker(search);

  const handleSelect = (block) => {
    const text = block.bodyText || block.bodyHtml?.replace(/<[^>]+>/g, '') || block.title || '';
    onSelect(text);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          title={t('qop.textBlock.insertTitle', 'Textbaustein einfügen')}
        >
          <BookOpen className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="bottom">
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            className="border-0 h-9 focus-visible:ring-0 text-sm"
            placeholder={t('qop.textBlock.search', 'Textbausteine suchen...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-60 overflow-y-auto">
          {isLoading && (
            <div className="py-4 text-center text-xs text-muted-foreground">{t('common.loading', 'Laden...')}</div>
          )}
          {!isLoading && blocks.length === 0 && (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {search ? t('qop.textBlock.noResults', 'Keine Textbausteine gefunden') : t('qop.textBlock.empty', 'Keine Textbausteine vorhanden')}
            </div>
          )}
          {blocks.map((block) => (
            <button
              key={block._id ?? block.id}
              type="button"
              onClick={() => handleSelect(block)}
              className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b last:border-0"
            >
              <p className="text-sm font-medium truncate">{block.title}</p>
              {block.bodyText && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {block.bodyText.slice(0, 120)}
                </p>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

'use client';

import { useState } from 'react';
import { Search, FileText } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { textBlockService } from '../services/text-block-service';
import { useDebounce } from '@/shared/hooks/use-debounce';

function toSnapshot(block) {
  return {
    catalogTextBlockId: block._id,
    title: block.title,
    bodyHtml: block.bodyHtml ?? '',
    price: block.price ?? 0,
    unit: block.unit ?? '',
  };
}

export function TextBlockPickerDialog({ open, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);

  const closeDialog = () => {
    setQuery('');
    onClose();
  };

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: queryKeys.catalog.pickerTextBlocks({ q: debouncedQuery }),
    queryFn: () =>
      textBlockService
        .picker(debouncedQuery)
        .then((r) => (Array.isArray(r) ? r : (r?.data ?? []))),
    enabled: open && debouncedQuery.trim().length > 0,
    staleTime: 15_000,
  });

  const handleSelect = (block) => {
    onSelect(toSnapshot(block));
    closeDialog();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle>Select Text Block</DialogTitle>
        </DialogHeader>

        <div className="px-4 pt-3 pb-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-8"
              placeholder="Search text blocks..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="max-h-80">
          {isLoading && (
            <div className="px-4 py-6 text-sm text-center text-muted-foreground animate-pulse">
              Searching...
            </div>
          )}

          <div className="py-1">
            {blocks.map((block) => (
              <button
                key={block._id}
                type="button"
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 text-left transition-colors"
                onClick={() => handleSelect(block)}
              >
                <FileText className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{block.title}</p>
                  {(block.price ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      CHF {block.price.toFixed(2)} / {block.unit || '—'}
                    </p>
                  )}
                </div>
              </button>
            ))}
            {!isLoading && blocks.length === 0 && (
              <div className="px-4 py-6 text-sm text-center text-muted-foreground">
                {query ? 'No text blocks found.' : 'Start typing to search text blocks.'}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

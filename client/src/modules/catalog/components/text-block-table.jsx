'use client';

import { useState } from 'react';
import { Pencil, Trash2, Search } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useTextBlocks } from '../hooks/use-text-block-queries';
import { useTextBlockMutations } from '../hooks/use-text-block-mutations';
import { TextBlockFormDialog } from './text-block-form-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';

export function TextBlockTable() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [dialogBlock, setDialogBlock] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const { data: blocks = [], isLoading } = useTextBlocks({ q: debouncedSearch || undefined });
  const { deleteTextBlock } = useTextBlockMutations();

  const openCreate = () => { setDialogBlock(null); setDialogOpen(true); };
  const openEdit = (b) => { setDialogBlock(b); setDialogOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search text blocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={openCreate}>+ {t('catalog.textBlocks.create')}</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.title')}</TableHead>
              <TableHead>{t('common.category')}</TableHead>
              <TableHead className="w-28">{t('catalog.priceChf')}</TableHead>
              <TableHead className="w-24">{t('common.status')}</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading...</TableCell>
              </TableRow>
            ) : blocks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No text blocks found.</TableCell>
              </TableRow>
            ) : blocks.map((block) => (
              <TableRow key={block._id}>
                <TableCell className="font-medium">{block.title}</TableCell>
                <TableCell>{block.category?.name ?? '—'}</TableCell>
                <TableCell>{block.price ? Number(block.price).toFixed(2) : '—'}</TableCell>
                <TableCell>
                  <Badge variant={block.status === 'ACTIVE' ? 'default' : 'secondary'}>{block.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(block)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete &quot;{block.title}&quot;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Existing uses in quotations and reports will not be affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteTextBlock.mutate(block._id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TextBlockFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        textBlock={dialogBlock}
      />
    </div>
  );
}

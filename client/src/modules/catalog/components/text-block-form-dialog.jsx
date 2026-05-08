'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { useTextBlockMutations } from '../hooks/use-text-block-mutations';
import { useCatalogCategories } from '../hooks/use-catalog-queries';
import { useLanguage } from '@/lib/i18n/language-context';

const schema = z.object({
  title: z.string().min(1).max(200),
  categoryId: z.string().optional(),
  price: z.preprocess((v) => (v === '' || v === undefined ? 0 : Number(v)), z.number().min(0)),
  unit: z.string().max(20).optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

function RichTextEditor({ value, onChange }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value || '', false);
    }
  }, [value]); // eslint-disable-line

  return (
    <div className="border border-input rounded-md overflow-hidden">
      <div className="flex gap-1 px-2 py-1 border-b border-input bg-muted/40">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-muted font-bold ${editor?.isActive('bold') ? 'bg-muted' : ''}`}
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-muted italic ${editor?.isActive('italic') ? 'bg-muted' : ''}`}
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }}
          className={`px-1.5 py-0.5 text-xs rounded hover:bg-muted ${editor?.isActive('bulletList') ? 'bg-muted' : ''}`}
        >
          • List
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-2 min-h-20 focus-within:outline-none text-sm [&_.ProseMirror]:outline-none"
      />
    </div>
  );
}

export function TextBlockFormDialog({ open, onClose, textBlock }) {
  const { t } = useLanguage();
  const { createTextBlock, updateTextBlock } = useTextBlockMutations();
  const { data: categories = [] } = useCatalogCategories();
  const isEdit = !!textBlock;

  const [bodyHtml, setBodyHtml] = useState(textBlock?.bodyHtml ?? '');

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: '', categoryId: '__none__', price: '', unit: '', status: 'ACTIVE' },
  });

  useEffect(() => {
    if (open) {
      if (textBlock) {
        form.reset({
          title: textBlock.title,
          categoryId: textBlock.categoryId ?? '__none__',
          price: textBlock.price ?? '',
          unit: textBlock.unit ?? '',
          status: textBlock.status ?? 'ACTIVE',
        });
      } else {
        form.reset({ title: '', categoryId: '__none__', price: '', unit: '', status: 'ACTIVE' });
      }
      setBodyHtml(textBlock?.bodyHtml ?? '');
    }
  }, [textBlock, open]); // eslint-disable-line

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      bodyHtml,
      categoryId: values.categoryId === '__none__' ? undefined : values.categoryId,
      unit: values.unit || undefined,
    };
    try {
      if (isEdit) {
        await updateTextBlock.mutateAsync({ id: textBlock._id, data: payload });
      } else {
        await createTextBlock.mutateAsync(payload);
      }
      onClose();
    } catch {
      // mutation error is available via createTextBlock.error / updateTextBlock.error
    }
  };

  const isPending = createTextBlock.isPending || updateTextBlock.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('catalog.textBlocks.edit') : t('catalog.textBlocks.create')}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="No category" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No category</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.articles.status')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">{t('catalog.articles.statusActive')}</SelectItem>
                        <SelectItem value="INACTIVE">{t('catalog.articles.statusInactive')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.articles.basePrice')}</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.articles.unitOfMeasure')}</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. h" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">{t('catalog.textBlocks.bodyHtml')}</p>
              <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

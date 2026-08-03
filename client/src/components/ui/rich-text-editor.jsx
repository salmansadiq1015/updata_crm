'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Minus, Code2, TableIcon,
  Link as LinkIcon, ImageIcon, Upload,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Undo2, Redo2, Loader2,
} from 'lucide-react';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

const dragHasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

function ToolbarButton({ pressed, onPressedChange, children, title, disabled }) {
  return (
    <Toggle
      size="sm"
      pressed={pressed}
      onPressedChange={onPressedChange}
      disabled={disabled}
      aria-label={title}
      title={title}
    >
      {children}
    </Toggle>
  );
}

function ToolbarGroup({ children }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function EditorToolbar({ editor, showImage = true, onImageUpload, uploading }) {
  const { t } = useLanguage();
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageOpen, setImageOpen] = useState(false);
  const fileInputRef = useRef(null);

  if (!editor) return null;

  const addLink = () => {
    if (linkUrl) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    }
    setLinkUrl('');
    setLinkOpen(false);
  };

  const addImage = () => {
    if (imageUrl) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
    }
    setImageUrl('');
    setImageOpen(false);
  };

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && onImageUpload) {
      onImageUpload(file);
    }
    // Reset so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5">
      <ToolbarGroup>
        <ToolbarButton pressed={editor.isActive('bold')} onPressedChange={() => editor.chain().focus().toggleBold().run()} title={t('editor.bold', 'Bold')}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('italic')} onPressedChange={() => editor.chain().focus().toggleItalic().run()} title={t('editor.italic', 'Italic')}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('underline')} onPressedChange={() => editor.chain().focus().toggleUnderline().run()} title={t('editor.underline', 'Underline')}>
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('strike')} onPressedChange={() => editor.chain().focus().toggleStrike().run()} title={t('editor.strikethrough', 'Strikethrough')}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <ToolbarButton pressed={editor.isActive('heading', { level: 1 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title={t('editor.heading1', 'Heading 1')}>
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('heading', { level: 2 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title={t('editor.heading2', 'Heading 2')}>
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('heading', { level: 3 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title={t('editor.heading3', 'Heading 3')}>
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <ToolbarButton pressed={editor.isActive('bulletList')} onPressedChange={() => editor.chain().focus().toggleBulletList().run()} title={t('editor.bulletList', 'Bullet List')}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('orderedList')} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()} title={t('editor.orderedList', 'Ordered List')}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('taskList')} onPressedChange={() => editor.chain().focus().toggleTaskList().run()} title={t('editor.taskList', 'Task List')}>
          <ListChecks className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <ToolbarButton pressed={editor.isActive('blockquote')} onPressedChange={() => editor.chain().focus().toggleBlockquote().run()} title={t('editor.quote', 'Quote')}>
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={false} onPressedChange={() => editor.chain().focus().setHorizontalRule().run()} title={t('editor.divider', 'Divider')}>
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('codeBlock')} onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()} title={t('editor.codeBlock', 'Code Block')}>
          <Code2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={false} onPressedChange={addTable} title={t('editor.table', 'Table')}>
          <TableIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <div>
              <ToolbarButton pressed={editor.isActive('link')} onPressedChange={() => setLinkOpen(true)} title={t('editor.link', 'Link')}>
                <LinkIcon className="h-3.5 w-3.5" />
              </ToolbarButton>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-2">
              <Label className="text-xs">{t('editor.url', 'URL')}</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="h-8"
                onKeyDown={(e) => e.key === 'Enter' && addLink()}
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-7" onClick={addLink}>{t('common.add', 'Add')}</Button>
                {editor.isActive('link') && (
                  <Button size="sm" variant="outline" className="h-7" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkOpen(false); }}>{t('common.remove', 'Remove')}</Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {showImage && (
          onImageUpload ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleFileSelect}
              />
              <ToolbarButton
                pressed={false}
                onPressedChange={() => fileInputRef.current?.click()}
                title={t('editor.uploadImage', 'Upload image')}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              </ToolbarButton>
              <Popover open={imageOpen} onOpenChange={setImageOpen}>
                <PopoverTrigger asChild>
                  <div>
                    <ToolbarButton pressed={false} onPressedChange={() => setImageOpen(true)} title={t('editor.image', 'Image')}>
                      <ImageIcon className="h-3.5 w-3.5" />
                    </ToolbarButton>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="start">
                  <div className="space-y-2">
                    <Label className="text-xs">{t('editor.orPasteUrl', 'or paste URL')}</Label>
                    <Input
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://..."
                      className="h-8"
                      onKeyDown={(e) => e.key === 'Enter' && addImage()}
                    />
                    <Button size="sm" className="h-7" onClick={addImage}>{t('common.insert', 'Insert')}</Button>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          ) : (
            <Popover open={imageOpen} onOpenChange={setImageOpen}>
              <PopoverTrigger asChild>
                <div>
                  <ToolbarButton pressed={false} onPressedChange={() => setImageOpen(true)} title={t('editor.image', 'Image')}>
                    <ImageIcon className="h-3.5 w-3.5" />
                  </ToolbarButton>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-2">
                  <Label className="text-xs">{t('editor.imageUrl', 'Image URL')}</Label>
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-8"
                    onKeyDown={(e) => e.key === 'Enter' && addImage()}
                  />
                  <Button size="sm" className="h-7" onClick={addImage}>{t('common.insert', 'Insert')}</Button>
                </div>
              </PopoverContent>
            </Popover>
          )
        )}
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <ToolbarButton pressed={editor.isActive({ textAlign: 'left' })} onPressedChange={() => editor.chain().focus().setTextAlign('left').run()} title={t('editor.alignLeft', 'Align Left')}>
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive({ textAlign: 'center' })} onPressedChange={() => editor.chain().focus().setTextAlign('center').run()} title={t('editor.alignCenter', 'Align Center')}>
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive({ textAlign: 'right' })} onPressedChange={() => editor.chain().focus().setTextAlign('right').run()} title={t('editor.alignRight', 'Align Right')}>
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive({ textAlign: 'justify' })} onPressedChange={() => editor.chain().focus().setTextAlign('justify').run()} title={t('editor.justify', 'Justify')}>
          <AlignJustify className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <ToolbarButton pressed={false} onPressedChange={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title={t('common.undo', 'Undo')}>
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={false} onPressedChange={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title={t('common.redo', 'Redo')}>
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  maxLength = 5000,
  minHeight = 192,
  disabled = false,
  error,
  // The CRM customer form hides this: users mistook it for a file upload.
  showImage = true,
  onImageUpload,
}) {
  const { t } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragDepth = useRef(0);
  const editorRef = useRef(null);
  const onImageUploadRef = useRef(onImageUpload);

  // Keep refs up to date
  useEffect(() => { onImageUploadRef.current = onImageUpload; }, [onImageUpload]);

  const handleImageFile = useCallback(async (file) => {
    const upload = onImageUploadRef.current;
    const ed = editorRef.current;
    if (!upload || !ed) return;

    if (!file.type.startsWith('image/')) {
      showError(t('editor.invalidImageType', 'Only image files allowed'));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      showError(t('editor.imageTooLarge', 'Image is too large (max. 5 MB)'));
      return;
    }

    setUploading(true);
    try {
      const result = await upload(file);
      if (result) {
        // Support both string (URL) and { url, fileId } return values
        const src = typeof result === 'string' ? result : result.url;
        const fileId = typeof result === 'object' ? result.fileId : null;
        const attrs = { src };
        if (fileId) attrs['data-file-id'] = fileId;
        ed.chain().focus().setImage(attrs).run();
      }
    } catch {
      showError(t('editor.imageUploadError', 'Image upload failed'));
    } finally {
      setUploading(false);
    }
  }, [t]);

  // Stable ref for editorProps callbacks
  const handleImageFileRef = useRef(handleImageFile);
  useEffect(() => { handleImageFileRef.current = handleImageFile; }, [handleImageFile]);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            'data-file-id': {
              default: null,
              parseHTML: (el) => el.getAttribute('data-file-id'),
              renderHTML: (attrs) =>
                attrs['data-file-id'] ? { 'data-file-id': attrs['data-file-id'] } : {},
            },
          };
        },
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: maxLength }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
    editorProps: onImageUpload
      ? {
          handlePaste: (view, event) => {
            const items = Array.from(event.clipboardData?.items || []);
            const imageItem = items.find((item) => item.type.startsWith('image/'));
            if (imageItem) {
              event.preventDefault();
              const file = imageItem.getAsFile();
              if (file) handleImageFileRef.current(file);
              return true;
            }
            return false;
          },
          handleDrop: (view, event) => {
            const files = Array.from(event.dataTransfer?.files || []);
            const imageFile = files.find((f) => f.type.startsWith('image/'));
            if (imageFile) {
              event.preventDefault();
              handleImageFileRef.current(imageFile);
              return true;
            }
            return false;
          },
        }
      // Must be an object, never undefined: passing editorProps: undefined
      // overrides Tiptap's default {} and crashes createView (reading
      // 'dispatchTransaction' of undefined) for every editor without image
      // upload — e.g. the component form, quotation intro/T&C, task notes.
      : {},
  });

  // Keep editor ref in sync
  useEffect(() => { editorRef.current = editor; }, [editor]);

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  // Drag & drop handlers (only when onImageUpload is provided)
  const canDrop = !!onImageUpload && !disabled;

  const handleDragEnter = useCallback((e) => {
    if (!canDrop || !dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }, [canDrop]);

  const handleDragOver = useCallback((e) => {
    if (canDrop && dragHasFiles(e)) e.preventDefault();
  }, [canDrop]);

  const handleDragLeave = useCallback((e) => {
    if (!canDrop || !dragHasFiles(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  }, [canDrop]);

  const handleDrop = useCallback((e) => {
    if (!canDrop || !dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageFileRef.current(file);
  }, [canDrop]);

  const charCount = editor?.storage.characterCount.characters() ?? 0;
  const isNearLimit = maxLength && charCount > maxLength * 0.9;
  const isOverLimit = maxLength && charCount > maxLength;

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-card transition-colors',
        'hover:border-border focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20',
        disabled && 'cursor-not-allowed opacity-50',
        error && 'border-destructive ring-[3px] ring-destructive/20',
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <EditorToolbar
        editor={editor}
        showImage={showImage}
        onImageUpload={onImageUpload ? handleImageFile : undefined}
        uploading={uploading}
      />
      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none px-3 py-2 text-sm',
          '[&_.tiptap]:outline-none [&_.tiptap]:min-h-[inherit]',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0',
        )}
        style={{ minHeight }}
      />
      {maxLength && (
        <div className={cn(
          'flex justify-end px-3 py-1.5 border-t text-[11px]',
          isOverLimit ? 'text-destructive font-medium' : isNearLimit ? 'text-amber-500' : 'text-muted-foreground',
        )}>
          {charCount} / {maxLength}
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-30 m-2 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm">
          <Upload className="h-9 w-9 text-primary" />
          <p className="text-sm font-medium text-primary">
            {t('editor.dropImageHere', 'Drop image here')}
          </p>
        </div>
      )}

      {/* Upload spinner overlay */}
      {uploading && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('editor.uploading', 'Uploading...')}
          </div>
        </div>
      )}
    </div>
  );
}

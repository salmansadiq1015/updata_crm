'use client';

import { useEffect } from 'react';
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
import { cn } from '@/lib/utils';
import { useState } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Minus, Code2, TableIcon,
  Link as LinkIcon, ImageIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Undo2, Redo2,
} from 'lucide-react';

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

function EditorToolbar({ editor }) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageOpen, setImageOpen] = useState(false);

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

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5">
      <ToolbarGroup>
        <ToolbarButton pressed={editor.isActive('bold')} onPressedChange={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('italic')} onPressedChange={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('underline')} onPressedChange={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('strike')} onPressedChange={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <ToolbarButton pressed={editor.isActive('heading', { level: 1 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('heading', { level: 2 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('heading', { level: 3 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <ToolbarButton pressed={editor.isActive('bulletList')} onPressedChange={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('orderedList')} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered List">
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('taskList')} onPressedChange={() => editor.chain().focus().toggleTaskList().run()} title="Task List">
          <ListChecks className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <ToolbarButton pressed={editor.isActive('blockquote')} onPressedChange={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={false} onPressedChange={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive('codeBlock')} onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()} title="Code Block">
          <Code2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={false} onPressedChange={addTable} title="Table">
          <TableIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <div>
              <ToolbarButton pressed={editor.isActive('link')} onPressedChange={() => setLinkOpen(true)} title="Link">
                <LinkIcon className="h-3.5 w-3.5" />
              </ToolbarButton>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-2">
              <Label className="text-xs">URL</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="h-8"
                onKeyDown={(e) => e.key === 'Enter' && addLink()}
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-7" onClick={addLink}>Add</Button>
                {editor.isActive('link') && (
                  <Button size="sm" variant="outline" className="h-7" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkOpen(false); }}>Remove</Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Popover open={imageOpen} onOpenChange={setImageOpen}>
          <PopoverTrigger asChild>
            <div>
              <ToolbarButton pressed={false} onPressedChange={() => setImageOpen(true)} title="Image">
                <ImageIcon className="h-3.5 w-3.5" />
              </ToolbarButton>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-2">
              <Label className="text-xs">Image URL</Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="h-8"
                onKeyDown={(e) => e.key === 'Enter' && addImage()}
              />
              <Button size="sm" className="h-7" onClick={addImage}>Insert</Button>
            </div>
          </PopoverContent>
        </Popover>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <ToolbarButton pressed={editor.isActive({ textAlign: 'left' })} onPressedChange={() => editor.chain().focus().setTextAlign('left').run()} title="Align Left">
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive({ textAlign: 'center' })} onPressedChange={() => editor.chain().focus().setTextAlign('center').run()} title="Align Center">
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive({ textAlign: 'right' })} onPressedChange={() => editor.chain().focus().setTextAlign('right').run()} title="Align Right">
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={editor.isActive({ textAlign: 'justify' })} onPressedChange={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify">
          <AlignJustify className="h-3.5 w-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarGroup>
        <ToolbarButton pressed={false} onPressedChange={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton pressed={false} onPressedChange={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
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
}) {
  const editor = useEditor({
    immediatelyRender: false,
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
      Image,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: maxLength }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

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

  const charCount = editor?.storage.characterCount.characters() ?? 0;
  const isNearLimit = maxLength && charCount > maxLength * 0.9;
  const isOverLimit = maxLength && charCount > maxLength;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-colors',
        'hover:border-border focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20',
        disabled && 'cursor-not-allowed opacity-50',
        error && 'border-destructive ring-[3px] ring-destructive/20',
      )}
    >
      <EditorToolbar editor={editor} />
      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none px-3 py-2 text-sm',
          '[&_.tiptap]:outline-none [&_.tiptap]:min-h-[inherit]',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0',
        )}
        style={{ minHeight: 192 }}
      />
      {maxLength && (
        <div className={cn(
          'flex justify-end px-3 py-1.5 border-t text-[11px]',
          isOverLimit ? 'text-destructive font-medium' : isNearLimit ? 'text-amber-500' : 'text-muted-foreground',
        )}>
          {charCount} / {maxLength}
        </div>
      )}
    </div>
  );
}

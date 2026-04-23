# Rich Text Editor & Form Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Tiptap-based rich text editor, replace 8 long-form textarea fields across PM and CRM modules, and enhance project stepper form validation.

**Architecture:** A `RichTextEditor` component wraps Tiptap with a shadcn/ui-styled toolbar, bubble menu, and character counter. A `RichTextContent` component renders stored HTML read-only. A `stripEmptyHtml()` utility cleans editor output before save. All 8 target fields switch from `register()` to `Controller` to integrate with the custom editor. Validation schemas get date cross-validation and budget max.

**Tech Stack:** Tiptap, React 19, React Hook Form (Controller), Zod, shadcn/ui (Toggle, Separator, Popover), Tailwind CSS v4 + Typography plugin, Lucide React

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `client/src/lib/utils/html.js` | `stripEmptyHtml()` utility |
| Create | `client/src/components/ui/rich-text-editor.jsx` | Tiptap editor with toolbar + bubble menu + char count |
| Create | `client/src/components/ui/rich-text-content.jsx` | Read-only HTML renderer with prose styling |
| Modify | `client/src/app/globals.css` | Add `@plugin "@tailwindcss/typography"` |
| Modify | `client/src/modules/pm/validations/project.js` | Date cross-validation, budget max |
| Modify | `client/src/modules/pm/components/project-form-steps.jsx` | Replace Description + Notes textareas |
| Modify | `client/src/modules/pm/components/project-form.jsx` | Strip HTML in submit handler |
| Modify | `client/src/modules/pm/components/prep-actions-tab.jsx` | Replace Description textarea |
| Modify | `client/src/modules/pm/components/documents-tab.jsx` | Replace Description textarea |
| Modify | `client/src/modules/pm/components/schedule-tab.jsx` | Replace Notes textarea |
| Modify | `client/src/modules/crm/components/note-form.jsx` | Replace Text textarea |
| Modify | `client/src/modules/crm/components/installation-form.jsx` | Replace Technical Notes textarea |
| Modify | `client/src/modules/crm/components/customer-form.jsx` | Replace Notes textarea |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install Tiptap packages and Tailwind Typography**

```bash
cd client && npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-highlight @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-image @tiptap/extension-link @tiptap/extension-text-align @tiptap/extension-placeholder @tiptap/extension-character-count @tailwindcss/typography
```

- [ ] **Step 2: Add typography plugin to globals.css**

In `client/src/app/globals.css`, add this line after the existing `@import "shadcn/tailwind.css";` line:

```css
@plugin "@tailwindcss/typography";
```

- [ ] **Step 3: Verify install succeeded**

Run: `cd client && npm ls @tiptap/react`
Expected: Shows `@tiptap/react` version in the tree

- [ ] **Step 4: Commit**

```bash
git add client/package.json client/package-lock.json client/src/app/globals.css
git commit -m "feat: install Tiptap rich text editor and Tailwind typography dependencies"
```

---

### Task 2: HTML Utility

**Files:**
- Create: `client/src/lib/utils/html.js`

- [ ] **Step 1: Create the stripEmptyHtml utility**

Create `client/src/lib/utils/html.js`:

```js
const EMPTY_PATTERNS = [
  /^<p>\s*<\/p>$/,
  /^<p><br\s*\/?>\s*<\/p>$/,
  /^<p>\s*<br\s*\/?>\s*<\/p>$/,
  /^\s*$/,
];

export function stripEmptyHtml(html) {
  if (!html) return null;
  const trimmed = html.trim();
  if (!trimmed) return null;
  for (const pattern of EMPTY_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }
  return trimmed;
}

export function htmlToPlainText(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/utils/html.js
git commit -m "feat: add HTML utility functions for rich text editor"
```

---

### Task 3: RichTextEditor Component

**Files:**
- Create: `client/src/components/ui/rich-text-editor.jsx`

- [ ] **Step 1: Create the RichTextEditor component**

Create `client/src/components/ui/rich-text-editor.jsx`:

```jsx
'use client';

import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
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
  minHeight = 120,
  disabled = false,
  error,
}) {
  const editor = useEditor({
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
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 150 }} className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg">
          <ToolbarButton pressed={editor.isActive('bold')} onPressedChange={() => editor.chain().focus().toggleBold().run()} title="Bold">
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton pressed={editor.isActive('italic')} onPressedChange={() => editor.chain().focus().toggleItalic().run()} title="Italic">
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton pressed={editor.isActive('underline')} onPressedChange={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton pressed={editor.isActive('link')} onPressedChange={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run();
            } else {
              const url = window.prompt('URL');
              if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
            }
          }} title="Link">
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
        </BubbleMenu>
      )}
      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none px-3 py-2 text-sm',
          '[&_.tiptap]:outline-none',
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
    </div>
  );
}
```

- [ ] **Step 2: Verify the file exists**

Run: `ls client/src/components/ui/rich-text-editor.jsx`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/rich-text-editor.jsx
git commit -m "feat(ui): add RichTextEditor component with Tiptap and shadcn toolbar"
```

---

### Task 4: RichTextContent Component

**Files:**
- Create: `client/src/components/ui/rich-text-content.jsx`

- [ ] **Step 1: Create the read-only HTML renderer**

Create `client/src/components/ui/rich-text-content.jsx`:

```jsx
import { cn } from '@/lib/utils';

export function RichTextContent({ html, className }) {
  if (!html) return null;

  return (
    <div
      className={cn('prose prose-sm dark:prose-invert max-w-none', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ui/rich-text-content.jsx
git commit -m "feat(ui): add RichTextContent read-only HTML renderer"
```

---

### Task 5: Enhanced Project Stepper Validation

**Files:**
- Modify: `client/src/modules/pm/validations/project.js`
- Modify: `client/src/modules/pm/components/project-form-steps.jsx` (date warning)

- [ ] **Step 1: Update projectStep3Schema with date cross-validation**

In `client/src/modules/pm/validations/project.js`, replace the existing `projectStep3Schema`:

Find:
```js
export const projectStep3Schema = z.object({
  projectManagerId: objectId,
  plannedStartDate: z.coerce.date().nullable().optional(),
  plannedEndDate: z.coerce.date().nullable().optional(),
});
```

Replace with:
```js
export const projectStep3Schema = z.object({
  projectManagerId: objectId,
  plannedStartDate: z.coerce.date().nullable().optional(),
  plannedEndDate: z.coerce.date().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.plannedStartDate && data.plannedEndDate) {
    if (new Date(data.plannedEndDate) <= new Date(data.plannedStartDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be after start date',
        path: ['plannedEndDate'],
      });
    }
  }
});
```

- [ ] **Step 2: Update projectStep4Schema with budget max**

In the same file, find:
```js
export const projectStep4Schema = z.object({
  estimatedBudget: z.coerce.number().min(0).nullable().optional(),
```

Replace with:
```js
export const projectStep4Schema = z.object({
  estimatedBudget: z.coerce.number().min(0).max(999999999, 'Budget too large').nullable().optional(),
```

- [ ] **Step 3: Add past-date warning in Step3ManagerDates**

In `client/src/modules/pm/components/project-form-steps.jsx`, in the `Step3ManagerDates` function, after the date inputs grid (after the closing `</div>` of the grid), add a warning hint:

Find in `Step3ManagerDates`:
```jsx
        <Field label={t('pm.plannedEnd', 'Planned End')} error={errors.plannedEndDate}>
          <Input type="date" {...register('plannedEndDate')} />
        </Field>
      </div>
    </div>
```

Replace with:
```jsx
        <Field label={t('pm.plannedEnd', 'Planned End')} error={errors.plannedEndDate}>
          <Input type="date" {...register('plannedEndDate')} />
        </Field>
      </div>
      {watch('plannedStartDate') && new Date(watch('plannedStartDate')) < new Date(new Date().toISOString().split('T')[0]) && (
        <p className="text-xs text-amber-500">{language === 'de' ? 'Startdatum liegt in der Vergangenheit' : 'Start date is in the past'}</p>
      )}
    </div>
```

Also add `watch` to the destructured form methods at the top of `Step3ManagerDates`. Find:
```jsx
  const { register, watch, setValue, formState: { errors } } = form;
```
This already includes `watch`, so no change needed.

- [ ] **Step 4: Commit**

```bash
git add client/src/modules/pm/validations/project.js client/src/modules/pm/components/project-form-steps.jsx
git commit -m "feat(pm): enhance stepper validation with date cross-check and budget max"
```

---

### Task 6: Replace Textareas in Project Stepper Steps

**Files:**
- Modify: `client/src/modules/pm/components/project-form-steps.jsx`
- Modify: `client/src/modules/pm/components/project-form.jsx`

- [ ] **Step 1: Update imports in project-form-steps.jsx**

In `client/src/modules/pm/components/project-form-steps.jsx`, replace the Textarea import:

Find:
```jsx
import { Textarea } from '@/components/ui/textarea';
```

Replace with:
```jsx
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
```

- [ ] **Step 2: Replace Description textarea in Step1Overview**

Find in `Step1Overview`:
```jsx
      <Field label={t('pm.description', 'Description')} error={errors.description}>
        <Textarea {...register('description')} rows={3} />
      </Field>
```

Replace with:
```jsx
      <Field label={t('pm.description', 'Description')} error={errors.description}>
        <Controller
          name="description"
          control={form.control}
          render={({ field }) => (
            <RichTextEditor
              value={field.value}
              onChange={field.onChange}
              placeholder={language === 'de' ? 'Projektbeschreibung...' : 'Project description...'}
              maxLength={5000}
              minHeight={100}
              error={errors.description}
            />
          )}
        />
      </Field>
```

- [ ] **Step 3: Replace Notes textarea in Step4BudgetNotes**

Find in `Step4BudgetNotes`:
```jsx
      <Field label={t('pm.notes', 'Notes')} error={errors.notes}>
        <Textarea {...register('notes')} rows={3} />
      </Field>
```

Replace with:
```jsx
      <Field label={t('pm.notes', 'Notes')} error={errors.notes}>
        <Controller
          name="notes"
          control={form.control}
          render={({ field }) => (
            <RichTextEditor
              value={field.value}
              onChange={field.onChange}
              placeholder={language === 'de' ? 'Notizen...' : 'Notes...'}
              maxLength={5000}
              minHeight={100}
              error={errors.notes}
            />
          )}
        />
      </Field>
```

- [ ] **Step 4: Add HTML stripping in project-form.jsx submit handler**

In `client/src/modules/pm/components/project-form.jsx`, add the import at the top:

Find:
```jsx
import { ENDPOINTS } from '@/lib/api/endpoints';
```

Add before it:
```jsx
import { stripEmptyHtml } from '@/lib/utils/html';
```

Then in the `handleNext` callback, find the submit cleaning section:

```jsx
      const cleaned = { ...values };
      if (!cleaned.siteId) delete cleaned.siteId;
      if (!cleaned.teamId) delete cleaned.teamId;
      if (!cleaned.estimatedBudget && cleaned.estimatedBudget !== 0) delete cleaned.estimatedBudget;
      if (!cleaned.notes) delete cleaned.notes;
      if (!cleaned.description) delete cleaned.description;
```

Replace with:
```jsx
      const cleaned = { ...values };
      cleaned.description = stripEmptyHtml(cleaned.description);
      cleaned.notes = stripEmptyHtml(cleaned.notes);
      if (!cleaned.siteId) delete cleaned.siteId;
      if (!cleaned.teamId) delete cleaned.teamId;
      if (!cleaned.estimatedBudget && cleaned.estimatedBudget !== 0) delete cleaned.estimatedBudget;
      if (!cleaned.notes) delete cleaned.notes;
      if (!cleaned.description) delete cleaned.description;
```

- [ ] **Step 5: Verify the dev server compiles**

Run: `cd client && npm run dev`

Open the browser, navigate to Projects, click "New Project". Step 1 should show the rich text editor for Description. Step 4 should show the rich text editor for Notes.

- [ ] **Step 6: Commit**

```bash
git add client/src/modules/pm/components/project-form-steps.jsx client/src/modules/pm/components/project-form.jsx
git commit -m "feat(pm): replace project form textareas with RichTextEditor"
```

---

### Task 7: Replace Textareas in PM Module (prep-actions, documents, schedule)

**Files:**
- Modify: `client/src/modules/pm/components/prep-actions-tab.jsx`
- Modify: `client/src/modules/pm/components/documents-tab.jsx`
- Modify: `client/src/modules/pm/components/schedule-tab.jsx`

- [ ] **Step 1: Replace textarea in prep-actions-tab.jsx**

In `client/src/modules/pm/components/prep-actions-tab.jsx`:

Replace the import (line 24):
```jsx
import { Textarea } from '@/components/ui/textarea';
```
With:
```jsx
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
```

Find the textarea usage (around line 251-253):
```jsx
<div className="space-y-1.5">
  <Label className="text-xs">{t('pm.description', 'Description')}</Label>
  <Textarea {...register('description')} rows={2} />
</div>
```

Replace with (note: the form variable name in this file — check if it uses `register` directly or `form.register`. Based on the exploration it uses `register` directly from `useForm`):
```jsx
<div className="space-y-1.5">
  <Label className="text-xs">{t('pm.description', 'Description')}</Label>
  <Controller
    name="description"
    control={control}
    render={({ field }) => (
      <RichTextEditor
        value={field.value}
        onChange={field.onChange}
        placeholder={language === 'de' ? 'Beschreibung...' : 'Description...'}
        maxLength={5000}
        minHeight={80}
      />
    )}
  />
</div>
```

Make sure `control` is destructured from `useForm` alongside `register`. If the file uses `const { register, ... } = useForm(...)`, add `control` to that destructuring.

- [ ] **Step 2: Replace textarea in documents-tab.jsx**

In `client/src/modules/pm/components/documents-tab.jsx`:

Replace the import (line 20):
```jsx
import { Textarea } from '@/components/ui/textarea';
```
With:
```jsx
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
```

Find the textarea usage (around line 365-367):
```jsx
<div className="space-y-1.5">
  <Label className="text-xs">{t('pm.description', 'Description')}</Label>
  <Textarea {...metaForm.register('description')} rows={3} />
</div>
```

Replace with:
```jsx
<div className="space-y-1.5">
  <Label className="text-xs">{t('pm.description', 'Description')}</Label>
  <Controller
    name="description"
    control={metaForm.control}
    render={({ field }) => (
      <RichTextEditor
        value={field.value}
        onChange={field.onChange}
        placeholder={language === 'de' ? 'Beschreibung...' : 'Description...'}
        maxLength={5000}
        minHeight={80}
      />
    )}
  />
</div>
```

- [ ] **Step 3: Replace schedule entry notes textarea in schedule-tab.jsx**

In `client/src/modules/pm/components/schedule-tab.jsx`:

The import (line 23) `import { Textarea } from '@/components/ui/textarea';` — **keep it** because this file also has a confirmation response notes textarea that stays as plain textarea. Add the new imports alongside:

Find:
```jsx
import { Textarea } from '@/components/ui/textarea';
```

Replace with:
```jsx
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
```

Find the schedule entry notes textarea (around line 509-511):
```jsx
<div className="space-y-1.5">
  <Label className="text-xs">{t('pm.notes', 'Notes')}</Label>
  <Textarea {...entryForm.register('notes')} rows={2} />
</div>
```

Replace with:
```jsx
<div className="space-y-1.5">
  <Label className="text-xs">{t('pm.notes', 'Notes')}</Label>
  <Controller
    name="notes"
    control={entryForm.control}
    render={({ field }) => (
      <RichTextEditor
        value={field.value}
        onChange={field.onChange}
        placeholder={language === 'de' ? 'Notizen...' : 'Notes...'}
        maxLength={5000}
        minHeight={80}
      />
    )}
  />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add client/src/modules/pm/components/prep-actions-tab.jsx client/src/modules/pm/components/documents-tab.jsx client/src/modules/pm/components/schedule-tab.jsx
git commit -m "feat(pm): replace textareas with RichTextEditor in prep-actions, documents, schedule tabs"
```

---

### Task 8: Replace Textareas in CRM Module (note, installation, customer)

**Files:**
- Modify: `client/src/modules/crm/components/note-form.jsx`
- Modify: `client/src/modules/crm/components/installation-form.jsx`
- Modify: `client/src/modules/crm/components/customer-form.jsx`

- [ ] **Step 1: Replace textarea in note-form.jsx**

In `client/src/modules/crm/components/note-form.jsx`:

Replace the import (line 11):
```jsx
import { Textarea } from '@/components/ui/textarea';
```
With:
```jsx
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
```

Find the textarea usage (around line 64-68):
```jsx
<div className="space-y-1.5">
  <Label className="text-xs font-medium">{t('crm.notes.text', 'Text')}*</Label>
  <Textarea rows={4} {...register('text')} autoFocus placeholder={t('crm.notes.textPlaceholder', 'Notiz...')} />
  {errors.text && <p className="text-xs text-destructive">{errors.text.message}</p>}
</div>
```

Replace with (need `control` from the form — check if it's destructured):
```jsx
<div className="space-y-1.5">
  <Label className="text-xs font-medium">{t('crm.notes.text', 'Text')}*</Label>
  <Controller
    name="text"
    control={control}
    render={({ field }) => (
      <RichTextEditor
        value={field.value}
        onChange={field.onChange}
        placeholder={t('crm.notes.textPlaceholder', 'Notiz...')}
        maxLength={5000}
        minHeight={120}
        error={errors.text}
      />
    )}
  />
  {errors.text && <p className="text-xs text-destructive">{errors.text.message}</p>}
</div>
```

Make sure `control` is destructured from the form hook alongside `register`.

- [ ] **Step 2: Replace textarea in installation-form.jsx**

In `client/src/modules/crm/components/installation-form.jsx`:

Replace the import (line 12):
```jsx
import { Textarea } from '@/components/ui/textarea';
```
With:
```jsx
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
```

Find the textarea usage (around line 162-164):
```jsx
<FormField label={t('crm.installations.technicalNotes', 'Technische Notizen')} error={errors.technicalNotes?.message}>
  <Textarea rows={3} {...register('technicalNotes')} />
</FormField>
```

Replace with:
```jsx
<FormField label={t('crm.installations.technicalNotes', 'Technische Notizen')} error={errors.technicalNotes?.message}>
  <Controller
    name="technicalNotes"
    control={control}
    render={({ field }) => (
      <RichTextEditor
        value={field.value}
        onChange={field.onChange}
        placeholder={language === 'de' ? 'Technische Notizen...' : 'Technical notes...'}
        maxLength={5000}
        minHeight={100}
      />
    )}
  />
</FormField>
```

Make sure `control` is destructured from the form hook alongside `register`.

- [ ] **Step 3: Replace textarea in customer-form.jsx**

In `client/src/modules/crm/components/customer-form.jsx`:

Replace the import (line 16):
```jsx
import { Textarea } from '@/components/ui/textarea';
```
With:
```jsx
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
```

Find the textarea usage (around line 431-438):
```jsx
<Field label={t('crm.notes', 'Notizen')} error={errors.notes}>
  <Textarea
    rows={4}
    placeholder={t('crm.notesPlaceholder', 'Allgemeine Notizen zum Kunden...')}
    className="resize-none"
    {...register('notes')}
  />
</Field>
```

Replace with:
```jsx
<Field label={t('crm.notes', 'Notizen')} error={errors.notes}>
  <Controller
    name="notes"
    control={form.control}
    render={({ field }) => (
      <RichTextEditor
        value={field.value}
        onChange={field.onChange}
        placeholder={t('crm.notesPlaceholder', 'Allgemeine Notizen zum Kunden...')}
        maxLength={5000}
        minHeight={120}
        error={errors.notes}
      />
    )}
  />
</Field>
```

Note: `customer-form.jsx` may use `form.control` or destructured `control` — check the file's form hook pattern and match accordingly.

- [ ] **Step 4: Commit**

```bash
git add client/src/modules/crm/components/note-form.jsx client/src/modules/crm/components/installation-form.jsx client/src/modules/crm/components/customer-form.jsx
git commit -m "feat(crm): replace textareas with RichTextEditor in note, installation, customer forms"
```

---

### Task 9: Review Step HTML Display Fix

**Files:**
- Modify: `client/src/modules/pm/components/project-form-steps.jsx`

The review step currently shows raw HTML in the Description and Notes `ReviewRow` values. It should strip tags for the summary display.

- [ ] **Step 1: Import htmlToPlainText and use it in ReviewRow values**

In `client/src/modules/pm/components/project-form-steps.jsx`, add the import:

Find:
```jsx
import { cn } from '@/lib/utils';
```

Add after it:
```jsx
import { htmlToPlainText } from '@/lib/utils/html';
```

Then in `Step5Review`, update the Description and Notes rows to strip HTML for display:

Find:
```jsx
        { label: t('pm.description', 'Description'), value: values.description, changed: isChanged('description') },
```

Replace with:
```jsx
        { label: t('pm.description', 'Description'), value: htmlToPlainText(values.description), changed: isChanged('description') },
```

Find:
```jsx
        { label: t('pm.notes', 'Notes'), value: values.notes, changed: isChanged('notes') },
```

Replace with:
```jsx
        { label: t('pm.notes', 'Notes'), value: htmlToPlainText(values.notes), changed: isChanged('notes') },
```

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/pm/components/project-form-steps.jsx
git commit -m "fix(pm): strip HTML tags in review step summary display"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Install Tiptap + Typography deps | `package.json`, `globals.css` |
| 2 | HTML utility functions | `lib/utils/html.js` |
| 3 | RichTextEditor component | `components/ui/rich-text-editor.jsx` |
| 4 | RichTextContent component | `components/ui/rich-text-content.jsx` |
| 5 | Enhanced stepper validation | `pm/validations/project.js`, `project-form-steps.jsx` |
| 6 | Replace textareas in project stepper | `project-form-steps.jsx`, `project-form.jsx` |
| 7 | Replace textareas in PM tabs | `prep-actions-tab.jsx`, `documents-tab.jsx`, `schedule-tab.jsx` |
| 8 | Replace textareas in CRM forms | `note-form.jsx`, `installation-form.jsx`, `customer-form.jsx` |
| 9 | Fix review step HTML display | `project-form-steps.jsx` |

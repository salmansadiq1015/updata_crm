# Rich Text Editor & Form Validation Design

**Date:** 2026-04-23
**Scope:** Reusable Tiptap-based rich text editor component, replace 8 long-form textarea fields app-wide, enhance project stepper form validation

---

## Overview

Build a premium reusable `<RichTextEditor>` component using Tiptap (headless ProseMirror wrapper), styled with shadcn/ui + Tailwind to match the existing design system. Replace all long-form textarea fields (descriptions, notes) with the rich editor. Short-form comment fields (status reasons, access instructions) stay as plain textareas. Additionally, add cross-field date validation and other high-level validation to the project stepper form.

## Approach

Tiptap headless editor with per-extension installation. Toolbar built from shadcn `Toggle` buttons. Content stored as HTML strings. No new backend changes — existing `z.string()` validators accept HTML. A companion `<RichTextContent>` component renders stored HTML in read-only contexts with Tailwind prose styling.

---

## Tiptap Extensions

| Category | Extensions | Package |
|----------|-----------|---------|
| Core | Document, Paragraph, Text, HardBreak, Dropcursor, Gapcursor, History | `@tiptap/starter-kit` |
| Text formatting | Bold, Italic, Underline, Strike, Code, Highlight | starter-kit + `@tiptap/extension-underline`, `@tiptap/extension-highlight` |
| Headings | H1, H2, H3 | starter-kit |
| Lists | Bullet list, Ordered list, Task list | starter-kit + `@tiptap/extension-task-list`, `@tiptap/extension-task-item` |
| Structure | Blockquote, Horizontal rule, Code block, Table | starter-kit + `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header` |
| Media | Image, Link | `@tiptap/extension-image`, `@tiptap/extension-link` |
| Alignment | Text align (left, center, right, justify) | `@tiptap/extension-text-align` |
| Utility | Placeholder, Character count | `@tiptap/extension-placeholder`, `@tiptap/extension-character-count` |

---

## Component: RichTextEditor

### Toolbar Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ B I U S  │  H1 H2 H3  │  • 1. ☑  │  ❝ ─ </>  │  🔗 🖼  │  ↩ ↪  │
│ format   │  headings   │  lists   │  blocks    │  media  │  undo  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Editor content area                                                │
│  (min-height configurable, auto-grows)                              │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                              142 / 5000 characters  │
└─────────────────────────────────────────────────────────────────────┘
```

### Visual Design

- Toolbar uses shadcn `Toggle` buttons with `variant="outline"` and `size="sm"`, grouped by category with `Separator` dividers
- Active formatting state highlighted via Toggle's pressed state (matches shadcn primary color)
- Editor area has the same border, focus ring, and error styling as the existing `Input`/`Textarea` components
- Bubble menu (floating toolbar) appears on text selection for quick bold/italic/underline/link
- Slash command menu (`/`) for inserting blocks (heading, list, image, table, code block, divider)
- Character count in footer — muted text, turns destructive color when approaching limit
- Toolbar is sticky when content is tall enough to scroll

### Component API

```jsx
<RichTextEditor
  value={htmlString}
  onChange={(html) => ...}
  placeholder="Enter description..."
  maxLength={5000}
  minHeight={120}
  disabled={false}
  error={errors.description}
/>
```

### React Hook Form Integration

Wrapped with `Controller` from react-hook-form:

```jsx
<Controller
  name="description"
  control={form.control}
  render={({ field }) => (
    <RichTextEditor
      value={field.value}
      onChange={field.onChange}
      placeholder="..."
      maxLength={5000}
      error={errors.description}
    />
  )}
/>
```

---

## Component: RichTextContent

Read-only renderer for stored HTML content, used on detail pages, notes lists, etc.

```jsx
<RichTextContent html={project.description} />
```

- Renders HTML with Tailwind Typography plugin (`prose prose-sm`) for proper heading/list/table/link styling
- No Tiptap instance needed — pure styled HTML output
- Handles `null`/empty gracefully (renders nothing)

---

## Fields to Replace (8 fields)

| Module | File | Field | Max Length |
|--------|------|-------|-----------|
| PM | `project-form-steps.jsx` | Project Description | 5000 |
| PM | `project-form-steps.jsx` | Project Notes | 5000 |
| PM | `prep-actions-tab.jsx` | Action Description | 5000 |
| PM | `documents-tab.jsx` | Document Description | 5000 |
| PM | `schedule-tab.jsx` | Schedule Entry Notes | 5000 |
| CRM | `note-form.jsx` | Note Content | 5000 |
| CRM | `installation-form.jsx` | Technical Notes | 5000 |
| CRM | `customer-form.jsx` | Customer Notes | 5000 |

### Fields Staying as Plain Textarea (5 fields)

- `status-transition-dialog.jsx` — Status comment, Override reason (short required comments)
- `schedule-tab.jsx` — Confirmation response notes (short response)
- `site-form.jsx` — Access instructions (short plain text)
- `role-form.jsx` — Role description (admin-only, plain text sufficient)

---

## Project Stepper Validation Enhancements

### Step 1 — Overview

| Field | Current | Enhanced |
|-------|---------|----------|
| Project Name | `min(1).max(255)` | No change needed |
| Project Type | `enum(...)` | No change needed |
| Description | `string().max(5000)` | Strip empty HTML (`<p></p>`) to null before save. Validate text content length (excluding tags) against max 5000. |

### Step 2 — Customer & Site

| Field | Current | Enhanced |
|-------|---------|----------|
| Customer | `objectId` required | No change needed |
| Site | `objectId.nullable()` | No change needed |

### Step 3 — Manager & Dates

| Field | Current | Enhanced |
|-------|---------|----------|
| Project Manager | `objectId` required | No change needed |
| Planned Start | `z.coerce.date().nullable()` | Add amber warning hint (not blocking) if date is in the past: "Start date is in the past" |
| Planned End | `z.coerce.date().nullable()` | **Cross-field validation:** if both start and end are set, end must be after start. Inline error: "End date must be after start date" |

Implementation: Add `.superRefine()` to `projectStep3Schema` for date cross-validation.

### Step 4 — Budget & Notes

| Field | Current | Enhanced |
|-------|---------|----------|
| Budget | `number().min(0)` | Add `.max(999999999)` to prevent absurd values |
| Currency | `string().max(3)` | No change needed |
| Notes | `string().max(5000)` | Same HTML stripping as Description |

### Step 5 — Review

- Full `createProjectSchema` validation before submit (already in place)
- HTML fields cleaned (empty tags stripped to null) in the `onFormSubmit` handler before calling `onSubmit`

---

## HTML Sanitization

### Client-side (before submit)

- Strip empty Tiptap content (`<p></p>`, `<p><br></p>`, whitespace-only) to `null`
- Tiptap's schema-based approach prevents `<script>` tags and event handlers by design — only nodes/marks defined in extensions can exist in the document
- Utility function: `stripEmptyHtml(html)` returns `null` if content is effectively empty, otherwise returns the HTML string

### Character Count

Character count tracks **text content only** (HTML tags stripped) via Tiptap's built-in `CharacterCount` extension. The Zod max length validation should also validate against the plain text length extracted from the HTML, not the raw HTML string length.

### Read-only Rendering

`<RichTextContent>` uses `dangerouslySetInnerHTML` with Tailwind prose classes. Since all content passed through Tiptap's schema on input, it's safe to render.

---

## Component File Structure

```
components/ui/rich-text-editor.jsx      — Main editor (toolbar + Tiptap + footer)
components/ui/rich-text-content.jsx     — Read-only HTML renderer
lib/utils/html.js                       — stripEmptyHtml() utility

modules/pm/components/project-form-steps.jsx  — Replace Description + Notes textareas
modules/pm/components/prep-actions-tab.jsx    — Replace Action Description textarea
modules/pm/components/documents-tab.jsx       — Replace Document Description textarea
modules/pm/components/schedule-tab.jsx        — Replace Schedule Notes textarea
modules/crm/components/note-form.jsx          — Replace Note Content textarea
modules/crm/components/installation-form.jsx  — Replace Technical Notes textarea
modules/crm/components/customer-form.jsx      — Replace Customer Notes textarea

modules/pm/validations/project.js             — Enhanced date cross-validation, budget max, HTML stripping
```

---

## npm Packages to Install

```
@tiptap/react
@tiptap/starter-kit
@tiptap/extension-underline
@tiptap/extension-highlight
@tiptap/extension-task-list
@tiptap/extension-task-item
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-cell
@tiptap/extension-table-header
@tiptap/extension-image
@tiptap/extension-link
@tiptap/extension-text-align
@tiptap/extension-placeholder
@tiptap/extension-character-count
@tailwindcss/typography
```

---

## Tailwind Typography Setup

The `@tailwindcss/typography` plugin provides `prose` classes for rendering rich HTML content. In Tailwind v4, plugins are imported via CSS: add `@plugin "@tailwindcss/typography";` to the main CSS file (`app/globals.css`). No `tailwind.config` changes needed.

---

## i18n

All toolbar tooltips, placeholder text, slash command labels, and validation messages support the existing `useLanguage()` hook with German and English translations. The editor component accepts a `placeholder` prop; toolbar tooltips are handled internally with `t()`.

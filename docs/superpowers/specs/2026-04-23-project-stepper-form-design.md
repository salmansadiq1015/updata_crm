# Project Stepper Form Design

**Date:** 2026-04-23
**Module:** PM (Project Management)
**Scope:** Convert the "New Project" dialog from a single-page form to a 5-step stepper wizard

---

## Overview

Replace the existing single-page `ProjectForm` modal dialog with a premium multi-step stepper wizard. The stepper provides a guided, modern experience for creating and editing projects — splitting the form into logical sections with per-step validation, animated transitions, and a final review step before submission.

## Approach

Custom reusable `<FormStepper>` component built from scratch using existing shadcn/ui primitives + Framer Motion for animations. No new dependencies required.

**Why custom over library:** Full control over premium design, matches ClickUp-style theme, reusable across the ERP (quotation wizard, onboarding, etc.), leverages existing Framer Motion dependency.

---

## Steps

| # | Name | Icon (Lucide) | Required Fields |
|---|------|---------------|-----------------|
| 1 | Overview | `FileText` | `name`, `projectType` |
| 2 | Customer & Site | `Building2` | `customerId` |
| 3 | Manager & Dates | `CalendarClock` | `projectManagerId` |
| 4 | Budget & Notes | `Wallet` | None |
| 5 | Review | `ClipboardCheck` | Full schema (before submit) |

---

## Stepper Visual Design

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ① ──────── ② ──────── ③ ──────── ④ ──────── ⑤            │
│  Overview   Customer   Manager    Budget     Review         │
│             & Site     & Dates    & Notes                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│              [ Step Content Area ]                          │
│              Form fields for current step                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                              [ Back ]  [ Next / Create ]    │
└─────────────────────────────────────────────────────────────┘
```

### Step Indicator States

- **Completed:** Filled purple circle with `Check` icon, solid purple connecting line
- **Active:** Purple outlined circle with step icon, subtle pulsing/glowing ring animation
- **Upcoming:** Muted gray circle with step icon, gray dashed connecting line

### Icons per Step

Each step circle contains a contextual Lucide icon with the step label displayed below the circle.

### Animations (Framer Motion)

- Step content slides in from right (forward navigation) or left (backward navigation) using `AnimatePresence`
- Progress connecting line fills with a smooth width transition
- Completed circle scales up briefly as the checkmark icon appears

---

## Step Content & Field Layout

### Step 1 — Overview

| Field | Component | Required | Constraints |
|-------|-----------|----------|-------------|
| Project Name | `Input` | Yes | max 255 chars, placeholder "e.g. Heating renovation" |
| Project Type | `Select` | Yes | 5 options with icons from `PROJECT_TYPE_CONFIG` |
| Description | `Textarea` | No | max 5000 chars, resizable |

**Layout:** Name + Type side-by-side (`grid-cols-2`), Description full-width below.

### Step 2 — Customer & Site

| Field | Component | Required | Constraints |
|-------|-----------|----------|-------------|
| Customer | Searchable Combobox (Popover) | Yes | Existing customer search component |
| Site | Dependent Select | No | Enabled only when customer selected, loads customer's sites |

**Layout:** Side-by-side (`grid-cols-2`). Site shows hint "Select a customer first" when disabled.

### Step 3 — Manager & Dates

| Field | Component | Required | Constraints |
|-------|-----------|----------|-------------|
| Project Manager | `Select` | Yes | Users dropdown, defaults to current user |
| Planned Start | Date Picker | No | — |
| Planned End | Date Picker | No | Must be after start date |

**Layout:** Manager full-width top row, Start + End side-by-side below.

### Step 4 — Budget & Notes

| Field | Component | Required | Constraints |
|-------|-----------|----------|-------------|
| Estimated Budget | Number Input | No | min 0 |
| Currency | `Select` | No | CHF / EUR, defaults CHF |
| Notes | `Textarea` | No | max 5000 chars |

**Layout:** Budget + Currency side-by-side, Notes full-width below.

### Step 5 — Review

Read-only summary card grouped by the 4 previous sections:
- Each section shows its step icon + header
- Key-value pairs of all entered fields
- Empty optional fields display "—" in muted text
- "Edit" button per section jumps back to that step
- Bottom: prominent "Create Project" button + secondary "Back" button

---

## Navigation & Validation

### Per-Step Validation

The existing Zod `createProjectSchema` is split into per-step partial schemas. "Next" validates only the current step's fields. Errors appear inline; the step does not advance until valid.

### Navigation Rules

- **Next** button validates current step, then advances
- **Back** button always works without validation
- Clicking a **completed** step circle jumps directly to it
- Clicking an **upcoming** step circle is disabled (sequential forward only)
- **Enter** key advances to next step (except when focused on textareas)

### Footer Buttons

| Step | Left Button | Right Button |
|------|-------------|--------------|
| Step 1 | Cancel | Next |
| Steps 2–4 | Back | Next |
| Step 5 | Back | Create Project |

"Create Project" shows a loading spinner during submission.

---

## Dialog Container

- Same `Dialog` component (Radix-based) as current form
- Width: `max-w-2xl` (wider than current to accommodate stepper bar)
- Fixed minimum content height (~400px) to prevent dialog resizing between steps
- Step indicator fixed at top, footer fixed at bottom, content area scrolls if needed
- Close (X) button prompts "Discard changes?" confirmation if any fields have been touched

---

## Edit Mode

When editing an existing project:
- All fields are pre-filled from existing data
- Submit button label changes to "Update Project"
- Review step shows a small colored dot (accent purple) next to fields whose values differ from the original, so the user can see what they changed at a glance

---

## Component Structure

```
components/ui/form-stepper.jsx          — Reusable stepper component
  ├── StepIndicator                     — Top bar with circles + lines
  ├── StepContent                       — AnimatePresence wrapper
  └── StepFooter                        — Back / Next / Submit buttons

modules/pm/components/project-form.jsx  — Refactored to use FormStepper
  ├── Step1Overview                     — Name, Type, Description fields
  ├── Step2CustomerSite                 — Customer combobox, Site select
  ├── Step3ManagerDates                 — Manager select, date pickers
  ├── Step4BudgetNotes                  — Budget, Currency, Notes fields
  └── Step5Review                       — Read-only summary with edit links

modules/pm/validations/project.js       — Split schema into per-step partials
```

---

## i18n

All step labels, button text, field labels, and validation messages support the existing `useLanguage()` hook with both German and English translations.

---

## Reusability

The `<FormStepper>` component is generic and can be reused for:
- Quotation creation wizard (QOP module)
- Customer onboarding flow (CRM module)
- Any future multi-step form in the ERP

It accepts a `steps` config array defining icons, labels, content components, and validation schemas per step.

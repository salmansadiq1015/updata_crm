# ClickUp-Style Theme Overhaul -- MB Boiler ERP

**Date:** 2026-04-13
**Scope:** Full theme overhaul across all pages, components, and interactions
**Style:** Modern SaaS Dashboard UI with dark minimalism and data-dense productivity design (ClickUp-style)
**Approach:** Layer-by-Layer (foundation → layout → components → pages → polish)

---

## 1. Design System Foundation

### 1.1 Color Palette (OKLCH)

**Primary -- Purple gradient system:**
- `--primary`: #7B61FF (vibrant purple)
- `--primary-hover`: #9F7AEA (lighter purple)
- Gradient: `linear-gradient(135deg, #7B61FF, #9F7AEA)`

**Accent/Secondary -- Blue (repurposed from current sky-600):**
- `--accent`: Sky-500 for links, info badges, secondary actions

**Neutrals:**
- Dark mode backgrounds: `#0F0F11`, `#16161A`, `#1C1C21` (not pure black)
- Light mode backgrounds: `#FAFAFA`, `#F4F4F5`, `#E4E4E7`

**Semantic colors:**
- Success: Emerald `#10B981`
- Warning: Amber `#F59E0B`
- Destructive: Rose `#F43F5E`
- Info: Sky-500 (current blue repurposed)

### 1.2 Typography

- **Body:** Inter (keep current)
- **Headings:** DM Sans (keep current, weights 600/700/800)
- **Mono:** JetBrains Mono (keep current)
- **Scale:** Tighter heading sizes for data-dense feel, generous line-height on body text

### 1.3 Shadows & Depth

Soft layered shadows, no harsh drop-shadows:
- `--shadow-sm`: `0 1px 2px oklch(0 0 0 / 0.05)`
- `--shadow-md`: `0 4px 12px oklch(0 0 0 / 0.08)`
- `--shadow-lg`: `0 8px 24px oklch(0 0 0 / 0.12)`
- Dark mode: Subtle border-based depth instead of shadows

### 1.4 Borders & Radius

- Borders: Very subtle (`border-gray-200` light, `border-gray-800` dark)
- Cards: `rounded-xl`
- Inputs/Buttons: `rounded-lg`
- Modals/Drawers: `rounded-2xl`

### 1.5 Glass & Effects

- Glassmorphism for overlays and floating elements
- Backdrop-blur on topbar and command palette
- Gradient accents on primary CTAs

---

## 2. Layout Shell

### 2.1 Sidebar

- **Width:** 260px expanded, 64px collapsed (icon-only mode)
- **Toggle:** Smooth animated collapse with Framer Motion (200ms ease)
- **Structure:**
  - Top: Logo/brand mark (compact icon when collapsed)
  - Navigation groups with section labels (e.g., "MAIN", "SETTINGS", "ADMIN")
  - Each item: Icon + label + optional badge/count
  - Nested sub-items that expand/collapse per group
  - Bottom: User avatar + name + quick settings dropdown
- **Styling:** Dark background in both themes (ClickUp signature). Active item gets purple left-border accent + subtle purple background tint
- **Hover:** Subtle background highlight, tooltip with label when collapsed
- **Persistence:** Collapse state saved in existing `sidebar-store`

### 2.2 Topbar

- **Height:** 48px (compact, data-dense)
- **Left:** Breadcrumb trail (page context)
- **Right:** Global search trigger (`Ctrl+K` hint badge), notification bell with unread count, theme toggle (sun/moon), user avatar dropdown
- **Styling:** Backdrop-blur glass effect, subtle bottom border, sticky top

### 2.3 Main Content Area

- **Padding:** Consistent `p-6` with `max-w-full` (no artificial max-width)
- **Page pattern:** PageHeader (title + description + primary action button) → content

### 2.4 Right Drawer (Detail Panel)

- **Width:** 480px
- **Behavior:** Slides in from right with Framer Motion. Desktop: pushes main content left (side-by-side). Tablet/mobile: overlays with backdrop
- **Use cases:** User detail, role detail, session detail -- replaces navigating to `/[id]` pages
- **Header:** Title + close button + optional action buttons
- **Footer:** Sticky action bar (Save, Delete, etc.)
- **Backdrop:** Subtle overlay on mobile, no overlay on desktop (side-by-side)

### 2.5 Responsive Strategy

- **Desktop (>1280px):** Full sidebar + content + drawer side-by-side
- **Tablet (768-1280px):** Collapsed sidebar, drawer overlays
- **Mobile (<768px):** Sidebar as sheet overlay, drawer as full-screen panel

---

## 3. Component Styling

### 3.1 Buttons

- **Primary:** Purple gradient background, white text, subtle shadow, hover brightens gradient
- **Secondary:** Ghost style with purple text, subtle purple border on hover
- **Destructive:** Rose background, white text
- **Sizes:** `sm` (28px), `default` (36px), `lg` (44px)
- **Press feedback:** Slight scale-down (0.97) on click via Framer Motion

### 3.2 Cards

- Soft shadow, `rounded-xl`, subtle border
- Dark mode: `bg-[#1C1C21]` with `border-gray-800`
- Light mode: `bg-white` with `border-gray-200`
- Hover: Slight shadow elevation for interactive cards

### 3.3 Data Tables (Full ClickUp-style)

- **Row height:** Compact (40px), dense but readable
- **Row hover:** Subtle background highlight + action icons appear on right
- **Inline editing:** Click a cell to edit in place (text, select, date)
- **Column resizing:** Drag column borders to resize
- **Bulk selection:** Checkbox column, selecting rows reveals floating bulk action bar at bottom
- **Column visibility:** Toggle dropdown to show/hide columns
- **Header:** Sticky, sortable with direction indicators
- **Pagination:** Bottom bar with page size selector + page navigation
- **Empty state:** Illustrated empty state with action CTA
- **Loading:** Skeleton rows matching table structure

### 3.4 Forms & Inputs

- **Height:** 40px default
- **Border:** Subtle gray, purple border on focus with soft purple glow ring
- **Labels:** Above input, small text, muted color
- **Validation:** Inline error messages in rose, success checkmark in emerald
- **Selects/Dropdowns:** Custom styled with Radix, smooth open animation

### 3.5 Dialogs & Modals

- `rounded-2xl`, soft shadow, backdrop blur overlay
- Slide-up + fade-in animation (200ms)
- Confirmation dialogs: Icon + message + action buttons

### 3.6 Badges & Tags

- Pill-shaped (`rounded-full`), small text
- Semantic colors: purple (active), emerald (success), amber (warning), rose (error), sky (info)
- Subtle background tint with matching text color

### 3.7 Avatars

- Rounded-full, purple gradient fallback when no image
- Size variants matching button sizes
- Group stacking with overlap for multi-user displays

### 3.8 Tooltips & Popovers

- Dark background in light mode, lighter background in dark mode
- `rounded-lg`, subtle shadow, 150ms fade-in
- Arrow pointer

### 3.9 Skeleton Loading

- Pulse animation with purple-tinted shimmer
- Matches exact layout of content being loaded

---

## 4. Command Palette & Interactions

### 4.1 Command Palette (Ctrl+K)

- **Trigger:** Global keyboard shortcut + clickable from topbar search area
- **Overlay:** Centered modal with backdrop blur, `rounded-2xl`
- **Search input:** Large, autofocused, icon prefix, no border
- **Result groups:** Categorized with section headers -- "Pages", "Users", "Roles", "Recent", "Actions"
- **Result items:** Icon + label + description + keyboard shortcut hint (right-aligned)
- **Navigation:** Arrow keys to move, Enter to select, Esc to close
- **Actions:** Quick actions like "Create User", "Toggle Theme", "Go to Dashboard"
- **Animation:** Scale-up + fade-in (150ms), results list animates as you type

### 4.2 Hover & Interaction Patterns

- **Table rows:** Background highlight + action icons fade in on right
- **Sidebar items:** Background tint + slight indent on hover
- **Cards:** Shadow elevation increase on hover for interactive cards
- **Buttons:** Brightness shift on hover, scale(0.97) on press
- **Links:** Underline on hover, color transition

### 4.3 Notification System

- **Toasts:** Bottom-right stack, `rounded-lg`, icon + message + optional action link, auto-dismiss with progress bar
- **Bell dropdown:** Notification list panel, unread indicator dot, mark-all-read action

### 4.4 Loading States

- **Page transitions:** Quick fade (100ms) between routes
- **Data loading:** Skeleton screens matching content layout
- **Button loading:** Spinner icon replaces label, button disabled
- **Table loading:** Skeleton rows with shimmer effect

### 4.5 Keyboard Shortcuts

- `Ctrl+K` -- Command palette
- `Ctrl+/` -- Toggle sidebar
- `Esc` -- Close drawer/modal/palette
- `Ctrl+N` -- Quick create (context-aware)

---

## 5. Page Designs

### 5.1 Landing Page (Premium Marketing)

- **Hero:** Full-width gradient background (dark purple → deep blue), large heading with `text-gradient` effect, animated floating UI mockup/illustration, primary CTA with glow effect
- **Navbar:** Transparent on hero, glass-blur on scroll, purple logo mark
- **Features section:** Bento grid layout (mixed card sizes), each card with icon + title + description, hover lift animation
- **Modules showcase:** Horizontal scroll or tab-based showcase of ERP modules with screenshots/illustrations
- **CTA section:** Gradient background, bold heading, dual buttons (primary + ghost)
- **Footer:** Dark background, organized link columns, subtle separator
- **Micro-interactions:** Intersection-based fade-in/slide-up on scroll, subtle parallax on hero elements

### 5.2 Dashboard

- **Stats grid:** 4-column cards with icon, metric value, trend indicator (up/down arrow + percentage), sparkline mini-chart
- **Charts:** Recharts styled with theme colors, purple primary data series, rounded bars, smooth area fills
- **Recent activity:** Timeline-style list with avatars, action descriptions, relative timestamps
- **System health:** Status indicators (green/amber/red dots), progress bars for resource usage
- **Quick actions:** Card or button row for common tasks

### 5.3 User Management (/settings/users)

- **List view:** Full ClickUp-style data table with columns: avatar+name, email, role badge, status badge, last login, actions
- **Row click:** Opens right drawer with user detail (replaces `/users/[id]` navigation)
- **Drawer content:** Avatar upload, profile form, role assignment, activity history tabs
- **Bulk actions:** Select multiple users → floating bar with "Deactivate", "Change Role", "Delete"

### 5.4 Role Management (/settings/roles)

- **List view:** Table with role name, user count badge, permission summary, created date
- **Drawer:** Role form + permission matrix (grouped checkboxes by module)

### 5.5 Audit Logs (/settings/audit)

- **Dense table:** Timestamp, user avatar+name, action type badge, resource, IP address
- **Filters:** Topbar filter row with date range, user, action type selects
- **No inline editing** (read-only)

### 5.6 Sessions (/settings/sessions)

- **Table:** Device info, IP, location, last active, status badge
- **Actions:** Revoke button per row, bulk revoke selected

### 5.7 Profile Page

- **Two-column layout:** Left panel (avatar, name, quick info), right panel (tabbed: Profile Form, Change Password, Activity)
- **Avatar upload:** Drag-and-drop zone with preview

### 5.8 Auth Pages (Login, Activate, Reset Password)

- **Split layout:** Left side -- gradient background with brand illustration/graphic. Right side -- form card centered
- **Form cards:** `rounded-2xl`, soft shadow, compact inputs
- **Primary button:** Full-width purple gradient
- **Links:** Sky-blue accent color for secondary actions

### 5.9 Admin Pages (Health, Jobs)

- **Health:** Status cards grid with green/amber/red indicators, uptime chart
- **Jobs:** Queue table with job name, status badge, progress bar, timestamps

### 5.10 System Settings

- **Grouped sections** with card containers
- **Toggle switches** for feature flags
- **Save bar:** Sticky bottom bar appears when changes are unsaved

---

## 6. Implementation Order

| Layer | Scope | Description |
|-------|-------|-------------|
| 1 | Design system tokens | Colors, shadows, radius, typography in globals.css |
| 2 | Layout shell | Sidebar, topbar, right drawer, responsive breakpoints |
| 3 | Base components | Buttons, cards, inputs, tables, dialogs, badges, skeletons |
| 4 | Command palette | Global search + quick actions with cmdk |
| 5 | Platform pages | Dashboard, users, roles, audit, sessions, profile, admin, system settings |
| 6 | Auth pages | Login, activate, reset password -- split layout |
| 7 | Landing page | Premium marketing redesign with scroll animations |
| 8 | Polish pass | Animations, micro-interactions, loading states, keyboard shortcuts |

---

## 7. Technical Notes

- **Color format:** Convert hex values to OKLCH for globals.css (maintaining perceptual uniformity)
- **Framer Motion:** Use for sidebar toggle, drawer slide, modal animations, button press, scroll-triggered animations
- **cmdk:** Already installed, build command palette on top of it
- **TanStack Table:** Extend current setup with inline editing, column resize, bulk selection
- **next-themes:** Keep class-based theming, update CSS variables for both modes
- **Zustand stores:** Extend sidebar-store for collapse state, add drawer-store for right panel state
- **Existing [id] pages:** Convert to drawer-based views, keep routes for direct-link access as fallback

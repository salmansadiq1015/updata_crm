/**
 * Typed façade over the untyped (.jsx) UI primitives and shared components the
 * Leads UI builds on.
 *
 * The design-system primitives (`@/components/ui/*`), `DataTableShell`,
 * `RowActionsMenu`, the shared `ConfirmDialog` and `useLanguage` are plain
 * JavaScript. Under `strict`, TypeScript infers every un-defaulted destructured
 * prop of such a component as *required* (`className`, `type`, ...) and the
 * language context as `never`, so a `.tsx` file cannot use them without errors.
 *
 * This file is a pure typing layer: each export is the original component,
 * re-typed with the props the Leads UI actually passes. There is no runtime
 * behaviour here, and nothing outside `modules/leads/ui` depends on it.
 */
import type {
  ComponentProps,
  ComponentPropsWithRef,
  ComponentType,
  HTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import type {
  Dialog as RadixDialog,
  DropdownMenu as RadixDropdownMenu,
  RadioGroup as RadixRadioGroup,
  Select as RadixSelect,
} from 'radix-ui';

import { Button as ButtonImpl } from '@/components/ui/button';
import { Input as InputImpl } from '@/components/ui/input';
import { Textarea as TextareaImpl } from '@/components/ui/textarea';
import { Label as LabelImpl } from '@/components/ui/label';
import {
  Select as SelectImpl,
  SelectContent as SelectContentImpl,
  SelectItem as SelectItemImpl,
  SelectTrigger as SelectTriggerImpl,
  SelectValue as SelectValueImpl,
} from '@/components/ui/select';
import {
  Dialog as DialogImpl,
  DialogBody as DialogBodyImpl,
  DialogContent as DialogContentImpl,
  DialogDescription as DialogDescriptionImpl,
  DialogFooter as DialogFooterImpl,
  DialogHeader as DialogHeaderImpl,
  DialogTitle as DialogTitleImpl,
} from '@/components/ui/dialog';
import {
  DropdownMenu as DropdownMenuImpl,
  DropdownMenuContent as DropdownMenuContentImpl,
  DropdownMenuItem as DropdownMenuItemImpl,
  DropdownMenuLabel as DropdownMenuLabelImpl,
  DropdownMenuSeparator as DropdownMenuSeparatorImpl,
  DropdownMenuTrigger as DropdownMenuTriggerImpl,
} from '@/components/ui/dropdown-menu';
import { RadioGroup as RadioGroupImpl, RadioGroupItem as RadioGroupItemImpl } from '@/components/ui/radio-group';
import {
  Alert as AlertImpl,
  AlertTitle as AlertTitleImpl,
  AlertDescription as AlertDescriptionImpl,
} from '@/components/ui/alert';
import { DataTableShell as DataTableShellImpl } from '@/shared/components/data-table/data-table-shell';
import { RowActionsMenu as RowActionsMenuImpl } from '@/shared/components/data-table/row-actions-menu';
import { ConfirmDialog as ConfirmDialogImpl } from '@/shared/components/confirm-dialog';
import { useLanguage as useLanguageImpl } from '@/lib/i18n/language-context';

// ── i18n ─────────────────────────────────────────────────────────────────────

export type TranslateVars = Record<string, string | number | null | undefined>;

/** `t('leads.some.key', 'English fallback', { count })` */
export type TranslateFn = (key: string, fallback?: string | null, vars?: TranslateVars) => string;

export type LanguageApi = {
  locale: string;
  language: string;
  t: TranslateFn;
  dir?: 'ltr' | 'rtl';
  isRTL?: boolean;
};

export const useLanguage = useLanguageImpl as unknown as () => LanguageApi;

// ── Button / inputs ──────────────────────────────────────────────────────────

export type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
};

export const Button = ButtonImpl as unknown as ComponentType<ButtonProps>;
export const Input = InputImpl as unknown as ComponentType<ComponentPropsWithRef<'input'>>;
export const Textarea = TextareaImpl as unknown as ComponentType<ComponentPropsWithRef<'textarea'>>;
export const Label = LabelImpl as unknown as ComponentType<ComponentPropsWithRef<'label'>>;

// ── Select ───────────────────────────────────────────────────────────────────

export const Select = SelectImpl as unknown as ComponentType<ComponentProps<typeof RadixSelect.Root>>;
export const SelectTrigger = SelectTriggerImpl as unknown as ComponentType<
  ComponentProps<typeof RadixSelect.Trigger> & { size?: 'default' | 'sm' }
>;
export const SelectValue = SelectValueImpl as unknown as ComponentType<ComponentProps<typeof RadixSelect.Value>>;
export const SelectContent = SelectContentImpl as unknown as ComponentType<
  ComponentProps<typeof RadixSelect.Content>
>;
export const SelectItem = SelectItemImpl as unknown as ComponentType<ComponentProps<typeof RadixSelect.Item>>;

// ── Radio group ──────────────────────────────────────────────────────────────

export const RadioGroup = RadioGroupImpl as unknown as ComponentType<
  ComponentProps<typeof RadixRadioGroup.Root>
>;
export const RadioGroupItem = RadioGroupItemImpl as unknown as ComponentType<
  ComponentProps<typeof RadixRadioGroup.Item>
>;

// ── Alert ────────────────────────────────────────────────────────────────────

export const Alert = AlertImpl as unknown as ComponentType<
  HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' }
>;
export const AlertTitle = AlertTitleImpl as unknown as ComponentType<HTMLAttributes<HTMLDivElement>>;
export const AlertDescription = AlertDescriptionImpl as unknown as ComponentType<
  HTMLAttributes<HTMLDivElement>
>;

// ── Dialog ───────────────────────────────────────────────────────────────────

export const Dialog = DialogImpl as unknown as ComponentType<ComponentProps<typeof RadixDialog.Root>>;
export const DialogContent = DialogContentImpl as unknown as ComponentType<
  ComponentProps<typeof RadixDialog.Content> & {
    showCloseButton?: boolean;
    hideClose?: boolean;
    dismissableOnOutsideClick?: boolean;
  }
>;
export const DialogHeader = DialogHeaderImpl as unknown as ComponentType<HTMLAttributes<HTMLDivElement>>;
export const DialogBody = DialogBodyImpl as unknown as ComponentType<HTMLAttributes<HTMLDivElement>>;
export const DialogFooter = DialogFooterImpl as unknown as ComponentType<
  HTMLAttributes<HTMLDivElement> & { showCloseButton?: boolean }
>;
export const DialogTitle = DialogTitleImpl as unknown as ComponentType<ComponentProps<typeof RadixDialog.Title>>;
export const DialogDescription = DialogDescriptionImpl as unknown as ComponentType<
  ComponentProps<typeof RadixDialog.Description>
>;

// ── Dropdown menu ────────────────────────────────────────────────────────────

export const DropdownMenu = DropdownMenuImpl as unknown as ComponentType<
  ComponentProps<typeof RadixDropdownMenu.Root>
>;
export const DropdownMenuTrigger = DropdownMenuTriggerImpl as unknown as ComponentType<
  ComponentProps<typeof RadixDropdownMenu.Trigger>
>;
export const DropdownMenuContent = DropdownMenuContentImpl as unknown as ComponentType<
  ComponentProps<typeof RadixDropdownMenu.Content>
>;
export const DropdownMenuItem = DropdownMenuItemImpl as unknown as ComponentType<
  ComponentProps<typeof RadixDropdownMenu.Item> & { inset?: boolean; variant?: 'default' | 'destructive' }
>;
export const DropdownMenuLabel = DropdownMenuLabelImpl as unknown as ComponentType<
  ComponentProps<typeof RadixDropdownMenu.Label>
>;
export const DropdownMenuSeparator = DropdownMenuSeparatorImpl as unknown as ComponentType<
  ComponentProps<typeof RadixDropdownMenu.Separator>
>;

// ── Shared composites ────────────────────────────────────────────────────────

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  onConfirm: () => void;
  loading?: boolean;
  variant?: 'destructive' | 'default';
  confirmText?: string;
  cancelText?: string;
};

export const ConfirmDialog = ConfirmDialogImpl as unknown as ComponentType<ConfirmDialogProps>;

export type RowActionItem = {
  type?: 'separator' | 'label';
  label?: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
};

export type RowActionsMenuProps = {
  items?: RowActionItem[];
  label?: string;
  align?: 'start' | 'center' | 'end';
};

export const RowActionsMenu = RowActionsMenuImpl as unknown as ComponentType<RowActionsMenuProps>;

// ── DataTableShell (cursor pagination flavour) ───────────────────────────────

export type ShellRowRef<TData> = { original: TData };

export type ShellColumn<TData> = {
  id?: string;
  accessorKey?: string;
  accessorFn?: (row: TData) => unknown;
  header?: ReactNode;
  size?: number;
  enableSorting?: boolean;
  /** First click sorts descending (right for dates). */
  sortDescFirst?: boolean;
  /** Custom cell renderer; DataTableShell calls it with `{ row }`. */
  Cell?: (context: { row: ShellRowRef<TData> }) => ReactNode;
};

export type ShellSorting = Array<{ id: string; desc: boolean }>;
export type ShellRowSelection = Record<string, boolean>;
export type ShellUpdater<TState> = TState | ((previous: TState) => TState);

export type ShellCursorPagination = {
  pageSize: number;
  onPageSizeChange?: (size: number) => void;
  hasNext: boolean;
  hasPrev: boolean;
  isFetching: boolean;
  onNext: () => void;
  onPrev: () => void;
};

export type DataTableShellProps<TData> = {
  columns: ShellColumn<TData>[];
  data: TData[];
  isLoading?: boolean;
  rowCount?: number;
  manualPagination?: boolean;
  manualSorting?: boolean;
  manualFiltering?: boolean;
  enableGlobalFilter?: boolean;
  enableRowSelection?: boolean;
  rowSelection?: ShellRowSelection;
  onRowSelectionChange?: (updater: ShellUpdater<ShellRowSelection>) => void;
  sorting?: ShellSorting;
  onSortingChange?: (updater: ShellUpdater<ShellSorting>) => void;
  getRowId?: (row: TData) => string;
  /** DataTableShell hands over `row.original`, not the TanStack row. */
  onRowClick?: (row: TData) => void;
  emptyState?: ReactNode;
  renderRowActions?: (context: { row: ShellRowRef<TData> }) => ReactNode;
  cursorPagination?: ShellCursorPagination;
};

export const DataTableShell = DataTableShellImpl as unknown as <TData>(
  props: DataTableShellProps<TData>,
) => ReactElement;

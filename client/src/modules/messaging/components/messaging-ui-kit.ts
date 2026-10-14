/**
 * Typed façade for messaging screens that consume the CRM's JavaScript design
 * system. Runtime exports are unchanged; these casts only describe the optional
 * props that the JSX primitives already support so strict TypeScript can check
 * messaging code without treating every destructured JS prop as required.
 */
import type { ComponentProps, ComponentType, HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Progress as RadixProgress, Switch as RadixSwitch, Tabs as RadixTabs } from 'radix-ui';

import { Badge as BadgeImpl } from '@/components/ui/badge';
import {
  Card as CardImpl,
  CardContent as CardContentImpl,
  CardHeader as CardHeaderImpl,
  CardTitle as CardTitleImpl,
} from '@/components/ui/card';
import { EmptyState as EmptyStateImpl } from '@/components/ui/empty-state';
import { Progress as ProgressImpl } from '@/components/ui/progress';
import { Skeleton as SkeletonImpl } from '@/components/ui/skeleton';
import {
  Table as TableImpl,
  TableBody as TableBodyImpl,
  TableCell as TableCellImpl,
  TableHead as TableHeadImpl,
  TableHeader as TableHeaderImpl,
  TableRow as TableRowImpl,
} from '@/components/ui/table';
import {
  Tabs as TabsImpl,
  TabsContent as TabsContentImpl,
  TabsList as TabsListImpl,
  TabsTrigger as TabsTriggerImpl,
} from '@/components/ui/tabs';
import { Switch as SwitchImpl } from '@/components/ui/switch';

export {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/modules/leads/ui/lead-ui-kit';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline' | 'ghost';
  asChild?: boolean;
};

export const Badge = BadgeImpl as unknown as ComponentType<BadgeProps>;

type CardProps = HTMLAttributes<HTMLDivElement>;
export const Card = CardImpl as unknown as ComponentType<CardProps>;
export const CardContent = CardContentImpl as unknown as ComponentType<CardProps>;
export const CardHeader = CardHeaderImpl as unknown as ComponentType<CardProps>;
export const CardTitle = CardTitleImpl as unknown as ComponentType<CardProps>;

type EmptyStateProps = {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};
export const EmptyState = EmptyStateImpl as unknown as ComponentType<EmptyStateProps>;

type ProgressProps = ComponentProps<typeof RadixProgress.Root> & { value?: number | null };
export const Progress = ProgressImpl as unknown as ComponentType<ProgressProps>;
export const Skeleton = SkeletonImpl as unknown as ComponentType<HTMLAttributes<HTMLDivElement>>;

export const Table = TableImpl as unknown as ComponentType<ComponentProps<'table'>>;
export const TableHeader = TableHeaderImpl as unknown as ComponentType<ComponentProps<'thead'>>;
export const TableBody = TableBodyImpl as unknown as ComponentType<ComponentProps<'tbody'>>;
export const TableRow = TableRowImpl as unknown as ComponentType<ComponentProps<'tr'>>;
export const TableHead = TableHeadImpl as unknown as ComponentType<ComponentProps<'th'>>;
export const TableCell = TableCellImpl as unknown as ComponentType<ComponentProps<'td'>>;

export const Tabs = TabsImpl as unknown as ComponentType<ComponentProps<typeof RadixTabs.Root>>;
export const TabsList = TabsListImpl as unknown as ComponentType<
  ComponentProps<typeof RadixTabs.List> & { variant?: 'default' | 'line' }
>;
export const TabsTrigger = TabsTriggerImpl as unknown as ComponentType<ComponentProps<typeof RadixTabs.Trigger>>;
export const TabsContent = TabsContentImpl as unknown as ComponentType<ComponentProps<typeof RadixTabs.Content>>;

export const Switch = SwitchImpl as unknown as ComponentType<
  ComponentProps<typeof RadixSwitch.Root> & { size?: 'default' | 'sm' }
>;

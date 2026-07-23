import { createElement } from 'react';
import {
  Bell,
  CalendarClock,
  CheckSquare,
  DollarSign,
  FileText,
  FolderKanban,
  MessageSquare,
  Package,
  Settings,
  Users,
  Wrench,
} from 'lucide-react';

export const NOTIFICATION_CATEGORIES = [
  'ALL',
  'TASK',
  'ORDER',
  'CHAT',
  'SYSTEM',
  'FINANCE',
  'MAINTENANCE',
  'DOCUMENT',
  'CRM',
  'PROJECT',
  'SCHEDULING',
];

export const NOTIFICATION_CATEGORY_ICONS = {
  TASK: CheckSquare,
  ORDER: Package,
  CHAT: MessageSquare,
  SYSTEM: Settings,
  FINANCE: DollarSign,
  MAINTENANCE: Wrench,
  DOCUMENT: FileText,
  CRM: Users,
  PROJECT: FolderKanban,
  SCHEDULING: CalendarClock,
};

export const NOTIFICATION_CATEGORY_COLORS = {
  TASK: 'text-emerald-600 bg-emerald-500/10',
  ORDER: 'text-blue-600 bg-blue-500/10',
  CHAT: 'text-brand-600 bg-brand-500/10',
  SYSTEM: 'text-slate-500 bg-slate-500/10',
  FINANCE: 'text-amber-600 bg-amber-500/10',
  MAINTENANCE: 'text-orange-600 bg-orange-500/10',
  DOCUMENT: 'text-sky-600 bg-sky-500/10',
  CRM: 'text-pink-600 bg-pink-500/10',
  PROJECT: 'text-indigo-600 bg-indigo-500/10',
  SCHEDULING: 'text-teal-600 bg-teal-500/10',
};

export const NOTIFICATION_CATEGORY_LABELS = {
  ALL: { key: 'notifications.category.ALL', fallback: 'All' },
  TASK: { key: 'notifications.category.TASK', fallback: 'Tasks' },
  ORDER: { key: 'notifications.category.ORDER', fallback: 'Orders' },
  CHAT: { key: 'notifications.category.CHAT', fallback: 'Chat' },
  SYSTEM: { key: 'notifications.category.SYSTEM', fallback: 'System' },
  FINANCE: { key: 'notifications.category.FINANCE', fallback: 'Finance' },
  MAINTENANCE: { key: 'notifications.category.MAINTENANCE', fallback: 'Maintenance' },
  DOCUMENT: { key: 'notifications.category.DOCUMENT', fallback: 'Documents' },
  CRM: { key: 'notifications.category.CRM', fallback: 'CRM' },
  PROJECT: { key: 'notifications.category.PROJECT', fallback: 'Projects' },
  SCHEDULING: { key: 'notifications.category.SCHEDULING', fallback: 'Scheduling' },
};

export const NOTIFICATION_PRIORITY_STYLES = {
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  NORMAL: null,
  LOW: null,
};

export function getNotificationCategoryIcon(category) {
  return NOTIFICATION_CATEGORY_ICONS[category] || Bell;
}

export function renderNotificationCategoryIcon(category, className = 'h-4 w-4') {
  const Icon = getNotificationCategoryIcon(category);
  return createElement(Icon, { className, 'aria-hidden': true });
}

export function getNotificationCategoryColor(category) {
  return NOTIFICATION_CATEGORY_COLORS[category] || 'text-slate-500 bg-slate-500/10';
}

export function getNotificationCategoryLabel(category, t) {
  const label = NOTIFICATION_CATEGORY_LABELS[category] || NOTIFICATION_CATEGORY_LABELS.SYSTEM;
  return typeof t === 'function' ? t(label.key, label.fallback) : label.fallback;
}

export function getNotificationPriorityLabel(priority, t) {
  const key = `notifications.priority.${priority || 'NORMAL'}`;
  const fallback = priority === 'CRITICAL' ? 'Critical' : priority === 'HIGH' ? 'High' : priority || 'Normal';
  return typeof t === 'function' ? t(key, fallback) : fallback;
}

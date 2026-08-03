import {
  ClipboardList, FolderKanban, ClipboardCheck, Building2, Wrench, FileText,
  Mail, Package, Receipt, File, Users, Flame, Droplet,
} from 'lucide-react';

// Herkunft (origin) of a task → icon + label + accent colour.
export const TASK_SOURCE_META = {
  MANUAL: { icon: ClipboardList, labelDe: 'Manuelle Aufgabe', labelEn: 'Manual task', color: 'text-slate-500', bg: 'bg-slate-500/10' },
  PROJECT: { icon: FolderKanban, labelDe: 'Projekt', labelEn: 'Project', color: 'text-violet-500', bg: 'bg-violet-500/10' },
  ORDER: { icon: ClipboardCheck, labelDe: 'Auftrag', labelEn: 'Order', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  SITE: { icon: Building2, labelDe: 'Objekt', labelEn: 'Object', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  MAINTENANCE: { icon: Wrench, labelDe: 'Wartungsmeldung', labelEn: 'Maintenance', color: 'text-red-500', bg: 'bg-red-500/10' },
  QUOTATION: { icon: FileText, labelDe: 'Angebot', labelEn: 'Quotation', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  CUSTOMER_INQUIRY: { icon: Mail, labelDe: 'Kundenanfrage', labelEn: 'Customer inquiry', color: 'text-teal-500', bg: 'bg-teal-500/10' },
  DISPOSITION: { icon: Package, labelDe: 'Disposition', labelEn: 'Disposition', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  INVOICE: { icon: Receipt, labelDe: 'Rechnung', labelEn: 'Invoice', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  DOCUMENT: { icon: File, labelDe: 'Dokument', labelEn: 'Document', color: 'text-slate-500', bg: 'bg-slate-500/10' },
  MEETING: { icon: Users, labelDe: 'Sitzung', labelEn: 'Meeting', color: 'text-sky-500', bg: 'bg-sky-500/10' },
};

export const TASK_SOURCE_TYPES = Object.keys(TASK_SOURCE_META);
export const sourceMeta = (type) => TASK_SOURCE_META[type] || TASK_SOURCE_META.MANUAL;

// Department icon (stored as a lucide name string on the Department record).
const DEPT_ICONS = { Flame, Droplet, FolderKanban, Wrench, ClipboardList, Receipt, Building2, Users, Package };
export const departmentIcon = (name) => DEPT_ICONS[name] || Building2;

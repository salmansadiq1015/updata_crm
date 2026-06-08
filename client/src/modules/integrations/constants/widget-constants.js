import { Flame, Wrench, PackagePlus, MessageCircle, Package, Clock, CheckCircle2, Copy as CopyIcon, AlertOctagon, ShowerHead } from 'lucide-react';

export const REQUEST_TYPE_META = Object.freeze({
  heizungsstoerung:  { label: 'Heizungsstörung',    icon: Flame,         color: 'text-red-500',     bg: 'bg-red-500/10' },
  wartung:           { label: 'Wartung',             icon: Wrench,        color: 'text-amber-500',   bg: 'bg-amber-500/10' },
  neuinstallation:   { label: 'Neuinstallation',     icon: PackagePlus,   color: 'text-violet-500',  bg: 'bg-violet-500/10' },
  beratung:          { label: 'Beratung',            icon: MessageCircle, color: 'text-sky-500',     bg: 'bg-sky-500/10' },
  sanitaer:          { label: 'Sanitär',             icon: ShowerHead,    color: 'text-cyan-500',    bg: 'bg-cyan-500/10' },
  other:             { label: 'Sonstiges',           icon: Package,       color: 'text-slate-500',   bg: 'bg-slate-500/10' },
});

export const PROCESSING_STATUS_META = Object.freeze({
  pending:   { label: 'Offen',       icon: Clock,         color: 'text-amber-600', bg: 'bg-amber-500/10', dot: 'bg-amber-500' },
  processed: { label: 'Bearbeitet',  icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' },
  duplicate: { label: 'Duplikat',    icon: CopyIcon,      color: 'text-slate-600', bg: 'bg-slate-500/10', dot: 'bg-slate-500' },
  spam:      { label: 'Spam',        icon: AlertOctagon,  color: 'text-red-600', bg: 'bg-red-500/10', dot: 'bg-red-500' },
});

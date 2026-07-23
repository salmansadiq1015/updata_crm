/**
 * Shared CRM constants (installation types, fuel types, maintenance types,
 * note categories, image categories) with German labels, accent colours,
 * and Lucide icons for consistent UI rendering across CRM entities.
 */
import {
  Flame, Zap, Sun, Radio, Wind, Droplet, Package,
  Wrench, Filter, Factory, ClipboardCheck, HelpCircle,
  AlertTriangle, Key, Cpu, Info, Pin,
  Image as ImageIcon, Camera, AlertOctagon, SplitSquareHorizontal,
} from 'lucide-react';

export const INSTALLATION_TYPE_META = Object.freeze({
  boiler:          { label: 'Heizkessel',       icon: Flame,   color: 'text-orange-500',  bg: 'bg-orange-500/10',  ring: 'ring-orange-500/20' },
  heat_pump:       { label: 'Wärmepumpe',      icon: Zap,     color: 'text-sky-500',     bg: 'bg-sky-500/10',     ring: 'ring-sky-500/20' },
  solar_thermal:   { label: 'Solarthermie',     icon: Sun,     color: 'text-amber-500',   bg: 'bg-amber-500/10',   ring: 'ring-amber-500/20' },
  radiator_system: { label: 'Heizkörpersystem',icon: Radio,   color: 'text-rose-500',    bg: 'bg-rose-500/10',    ring: 'ring-rose-500/20' },
  ventilation:     { label: 'Lüftung',          icon: Wind,    color: 'text-teal-500',    bg: 'bg-teal-500/10',    ring: 'ring-teal-500/20' },
  hot_water:       { label: 'Wassererwärmer',   icon: Droplet, color: 'text-blue-500',    bg: 'bg-blue-500/10',    ring: 'ring-blue-500/20' },
  other:           { label: 'Sonstige',         icon: Package, color: 'text-slate-500',   bg: 'bg-slate-500/10',   ring: 'ring-slate-500/20' },
});

export const FUEL_TYPE_META = Object.freeze({
  gas:      { label: 'Gas',       color: 'text-orange-600' },
  oil:      { label: 'Öl',        color: 'text-amber-700' },
  electric: { label: 'Strom',     color: 'text-sky-600' },
  pellet:   { label: 'Pellet',    color: 'text-emerald-600' },
  other:    { label: 'Sonstige',  color: 'text-slate-600' },
});

export const MAINTENANCE_TYPE_META = Object.freeze({
  annual_service:     { label: 'Jährlicher Service',    icon: Wrench,        color: 'text-brand-500', bg: 'bg-brand-500/10' },
  filter_change:      { label: 'Filterwechsel',          icon: Filter,        color: 'text-sky-500',    bg: 'bg-sky-500/10' },
  chimney_sweep:      { label: 'Kaminfeger',             icon: Factory,       color: 'text-slate-500',  bg: 'bg-slate-500/10' },
  general_inspection: { label: 'Allgemeine Inspektion',  icon: ClipboardCheck,color: 'text-emerald-500',bg: 'bg-emerald-500/10' },
  other:              { label: 'Sonstige',               icon: HelpCircle,    color: 'text-muted-foreground', bg: 'bg-muted' },
});

export const MAINTENANCE_STATUS_META = Object.freeze({
  ok:        { label: 'OK',          color: 'text-emerald-600', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' },
  due:       { label: 'Fällig',      color: 'text-amber-600',   bg: 'bg-amber-500/10',   dot: 'bg-amber-500' },
  overdue:   { label: 'Überfällig',  color: 'text-red-600',     bg: 'bg-red-500/10',     dot: 'bg-red-500' },
  scheduled: { label: 'Geplant',     color: 'text-sky-600',     bg: 'bg-sky-500/10',     dot: 'bg-sky-500' },
});

export const SITE_TYPE_META = Object.freeze({
  residential: { label: 'Wohnobjekt',   color: 'text-sky-600',     bg: 'bg-sky-500/10' },
  commercial:  { label: 'Geschäftlich', color: 'text-brand-600',  bg: 'bg-brand-500/10' },
  industrial:  { label: 'Industriell',  color: 'text-slate-600',   bg: 'bg-slate-500/10' },
});

export const NOTE_CATEGORY_META = Object.freeze({
  general:     { label: 'Allgemein',       icon: Info,           color: 'text-slate-500',  bg: 'bg-slate-500/10' },
  warning:     { label: 'Warnung',         icon: AlertTriangle,  color: 'text-red-500',    bg: 'bg-red-500/10' },
  access_info: { label: 'Zugangsinfos',    icon: Key,            color: 'text-amber-500',  bg: 'bg-amber-500/10' },
  technical:   { label: 'Technisch',       icon: Cpu,            color: 'text-brand-500', bg: 'bg-brand-500/10' },
});

export const IMAGE_CATEGORY_META = Object.freeze({
  nameplate:    { label: 'Typenschild', icon: Camera,                   color: 'text-sky-500',   bg: 'bg-sky-500/10' },
  damage:       { label: 'Schaden',     icon: AlertOctagon,             color: 'text-red-500',   bg: 'bg-red-500/10' },
  before_after: { label: 'Vorher/Nachher', icon: SplitSquareHorizontal, color: 'text-brand-500',bg: 'bg-brand-500/10' },
  general:      { label: 'Allgemein',   icon: ImageIcon,                color: 'text-slate-500', bg: 'bg-slate-500/10' },
});

export const SPARE_PART_CATEGORY_META = Object.freeze({
  filter:        { label: 'Filter',          color: 'text-sky-500',    bg: 'bg-sky-500/10' },
  gasket:        { label: 'Dichtung',        color: 'text-amber-500',  bg: 'bg-amber-500/10' },
  pump_part:     { label: 'Pumpenteil',      color: 'text-blue-500',   bg: 'bg-blue-500/10' },
  valve:         { label: 'Ventil',          color: 'text-teal-500',   bg: 'bg-teal-500/10' },
  sensor:        { label: 'Sensor',          color: 'text-brand-500', bg: 'bg-brand-500/10' },
  igniter:       { label: 'Zündung',         color: 'text-orange-500', bg: 'bg-orange-500/10' },
  burner_part:   { label: 'Brennerteil',     color: 'text-rose-500',   bg: 'bg-rose-500/10' },
  control_board: { label: 'Steuerplatine',   color: 'text-emerald-500',bg: 'bg-emerald-500/10' },
  other:         { label: 'Sonstige',        color: 'text-slate-500',  bg: 'bg-slate-500/10' },
});

export const SPARE_PART_ORDER_STATUS_META = Object.freeze({
  requested: { label: 'Angefragt',  color: 'text-amber-600',   bg: 'bg-amber-500/10',   dot: 'bg-amber-500' },
  ordered:   { label: 'Bestellt',   color: 'text-sky-600',     bg: 'bg-sky-500/10',     dot: 'bg-sky-500' },
  received:  { label: 'Erhalten',   color: 'text-emerald-600', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' },
  cancelled: { label: 'Storniert',  color: 'text-slate-500',   bg: 'bg-slate-500/10',   dot: 'bg-slate-500' },
});

export const SPARE_PART_ORDER_URGENCY_META = Object.freeze({
  low:    { label: 'Niedrig',  color: 'text-slate-500',  bg: 'bg-slate-500/10' },
  normal: { label: 'Normal',   color: 'text-sky-500',    bg: 'bg-sky-500/10' },
  high:   { label: 'Hoch',     color: 'text-amber-500',  bg: 'bg-amber-500/10' },
  urgent: { label: 'Dringend', color: 'text-red-500',    bg: 'bg-red-500/10' },
});

export const PIN_ICON = Pin;

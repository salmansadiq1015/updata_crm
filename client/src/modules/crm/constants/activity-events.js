import {
  UserPlus, Edit3, Archive, RotateCcw, GitMerge, Contact, UserCheck, Trash2,
  Building2, MapPin, Power, Wrench, PowerOff, Image as ImageIcon, StickyNote,
  Mail, CalendarClock, Layers, Package, FileText, ShoppingCart, Receipt, Send,
  ThumbsUp, ThumbsDown, CheckCircle, CalendarPlus, Activity,
} from 'lucide-react';

// Icon + colour tone + English fallback for every CRM activity event type.
// The German label lives in translations.js under crm.event.<type>; other
// languages fall back to `en` here. One map, used by both the customer
// activity panel and the object (site) history timeline, so a new event type
// is added once.
export const ACTIVITY_EVENT_META = {
  // Customer
  'customer.created':       { icon: UserPlus,   tone: 'emerald', en: 'Customer created' },
  'customer.updated':       { icon: Edit3,      tone: 'blue',    en: 'Customer updated' },
  'customer.deactivated':   { icon: Archive,    tone: 'muted',   en: 'Customer deactivated' },
  'customer.reactivated':   { icon: RotateCcw,  tone: 'emerald', en: 'Customer reactivated' },
  'customer.merged':        { icon: GitMerge,   tone: 'amber',   en: 'Customers merged' },
  'customer.mergeUndone':   { icon: RotateCcw,  tone: 'amber',   en: 'Merge undone' },
  // Contact
  'contact.created':        { icon: Contact,    tone: 'emerald', en: 'Contact created' },
  'contact.updated':        { icon: Edit3,      tone: 'blue',    en: 'Contact updated' },
  'contact.deleted':        { icon: Trash2,     tone: 'red',     en: 'Contact deleted' },
  'contact.set_primary':    { icon: UserCheck,  tone: 'sky',     en: 'Primary contact set' },
  // Site (object)
  'site.created':           { icon: Building2,  tone: 'emerald', en: 'Object created' },
  'site.updated':           { icon: Edit3,      tone: 'blue',    en: 'Object updated' },
  'site.deactivated':       { icon: Archive,    tone: 'muted',   en: 'Object deactivated' },
  // Installation (component)
  'installation.created':        { icon: Wrench,   tone: 'emerald', en: 'Component created' },
  'installation.updated':        { icon: Edit3,    tone: 'blue',    en: 'Component updated' },
  'installation.decommissioned': { icon: PowerOff, tone: 'muted',   en: 'Component decommissioned' },
  // Images
  'image.linked':           { icon: ImageIcon,  tone: 'sky',     en: 'Image added' },
  'image.unlinked':         { icon: ImageIcon,  tone: 'muted',   en: 'Image removed' },
  // Notes
  'note.created':           { icon: StickyNote, tone: 'blue',    en: 'Note created' },
  'note.updated':           { icon: Edit3,      tone: 'blue',    en: 'Note updated' },
  'note.deleted':           { icon: Trash2,     tone: 'red',     en: 'Note deleted' },
  // Newsletter
  'newsletter.created':     { icon: Mail,       tone: 'blue',    en: 'Newsletter created' },
  'newsletter.updated':     { icon: Edit3,      tone: 'blue',    en: 'Newsletter updated' },
  'newsletter.scheduled':   { icon: CalendarClock, tone: 'sky',  en: 'Newsletter scheduled' },
  'newsletter.sent':        { icon: Send,       tone: 'emerald', en: 'Newsletter sent' },
  'newsletter.cancelled':   { icon: Archive,    tone: 'muted',   en: 'Newsletter cancelled' },
  'newsletter.deleted':     { icon: Trash2,     tone: 'red',     en: 'Newsletter deleted' },
  // Maintenance
  'asset_maintenance.scheduled':             { icon: CalendarClock, tone: 'sky', en: 'Maintenance scheduled' },
  'asset_maintenance.bulk_interval_created': { icon: Layers,        tone: 'sky', en: 'Maintenance intervals created' },
  // Spare parts
  'spare_part.created':              { icon: Package, tone: 'emerald', en: 'Spare part created' },
  'spare_part.updated':              { icon: Edit3,   tone: 'blue',    en: 'Spare part updated' },
  'spare_part.deleted':              { icon: Trash2,  tone: 'red',     en: 'Spare part deleted' },
  'spare_part.imported':             { icon: Package, tone: 'sky',     en: 'Spare parts imported' },
  'spare_part.linked':               { icon: Package, tone: 'sky',     en: 'Spare part linked' },
  'spare_part.unlinked':             { icon: Package, tone: 'muted',   en: 'Spare part unlinked' },
  'spare_part.order_flagged':        { icon: ShoppingCart, tone: 'amber', en: 'Spare part flagged for order' },
  'spare_part.order_status_updated': { icon: ShoppingCart, tone: 'blue',  en: 'Order status updated' },
  // QOP — quotations / orders / invoices
  'quotation.created':      { icon: FileText,     tone: 'blue',    en: 'Quotation created' },
  'quotation.sent':         { icon: Send,         tone: 'sky',     en: 'Quotation sent' },
  'quotation.accepted':     { icon: ThumbsUp,     tone: 'emerald', en: 'Quotation accepted' },
  'quotation.declined':     { icon: ThumbsDown,   tone: 'red',     en: 'Quotation declined' },
  'order.created':          { icon: ShoppingCart, tone: 'emerald', en: 'Order created' },
  'invoice.created':        { icon: Receipt,      tone: 'orange',  en: 'Invoice created' },
  'invoice.sent':           { icon: Send,         tone: 'sky',     en: 'Invoice sent' },
  'invoice.paid':           { icon: CheckCircle,  tone: 'emerald', en: 'Invoice paid' },
  // Meetings (client feedback: visible on customer and object)
  'meeting.created':        { icon: CalendarPlus, tone: 'violet',  en: 'Meeting scheduled' },
  'meeting.updated':        { icon: Edit3,        tone: 'blue',    en: 'Meeting updated' },
};

const FALLBACK_META = { icon: Activity, tone: 'violet', en: '' };

/** Resolve icon + tone for an event type (never null). */
export function getActivityEventMeta(eventType) {
  return ACTIVITY_EVENT_META[eventType] || { ...FALLBACK_META, en: eventType || '' };
}

/** Translated label for an event type, falling back to English then the raw type. */
export function getActivityEventLabel(t, eventType) {
  const meta = getActivityEventMeta(eventType);
  return t(`crm.event.${eventType}`, meta.en || eventType);
}

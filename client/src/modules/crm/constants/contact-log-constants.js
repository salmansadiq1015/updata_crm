import { Phone, Mail, MessageCircle, Users, FileText, MessageSquare, CircleDot } from 'lucide-react';

/**
 * Contact channels, mirroring CONTACT_CHANNELS on the server. `other` pairs
 * with a free label so the list stays open-ended.
 */
export const CONTACT_CHANNEL_META = Object.freeze({
  phone:     { label: 'Telefon',              icon: Phone,          color: 'text-sky-600',     bg: 'bg-sky-500/10',     dot: 'bg-sky-500' },
  email:     { label: 'E-Mail',               icon: Mail,           color: 'text-brand-600',   bg: 'bg-brand-500/10',   dot: 'bg-brand-500' },
  whatsapp:  { label: 'WhatsApp',             icon: MessageCircle,  color: 'text-emerald-600', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' },
  in_person: { label: 'Persönliches Gespräch', icon: Users,         color: 'text-violet-600',  bg: 'bg-violet-500/10',  dot: 'bg-violet-500' },
  letter:    { label: 'Brief',                icon: FileText,       color: 'text-amber-600',   bg: 'bg-amber-500/10',   dot: 'bg-amber-500' },
  sms:       { label: 'SMS',                  icon: MessageSquare,  color: 'text-teal-600',    bg: 'bg-teal-500/10',    dot: 'bg-teal-500' },
  other:     { label: 'Sonstiges',            icon: CircleDot,      color: 'text-slate-600',   bg: 'bg-slate-500/10',   dot: 'bg-slate-500' },
});

export const CONTACT_CHANNELS = Object.keys(CONTACT_CHANNEL_META);

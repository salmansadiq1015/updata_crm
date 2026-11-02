'use client';
import { useState, type ReactNode } from 'react';
import { Dialog, Tabs } from 'radix-ui';
import { Bot, X } from 'lucide-react';
import { useOptionalLanguage } from '@/lib/i18n/language-context';
import { translations } from '@/lib/i18n/translations';

export const panelClass = 'updata-agent-panel p-4 sm:p-5';
export const inputClass = 'updata-agent-input';
export const primaryClass = 'updata-agent-primary';
export const secondaryClass = 'updata-agent-secondary';

export function AgentAvatar({ name, url, large = false }: { name: string; url?: string | null; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-sky-300/20 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 ${large ? 'h-20 w-20' : 'h-14 w-14'}`}>
    {url && failedUrl !== url ? <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setFailedUrl(url)} className="h-full w-full object-cover" /> : name ? <span className={`${large ? 'text-2xl' : 'text-lg'} font-semibold text-primary`}>{name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase()}</span> : <Bot className="h-6 w-6 text-primary" />}
  </span>;
}
export function AgentTabs({ value, onChange, items, children, label }: {
  value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }>;
  children: ReactNode; label: string;
}) {
  return <Tabs.Root value={value} onValueChange={onChange} className="min-w-0 space-y-5">
    <Tabs.List aria-label={label} className="flex max-w-full gap-1 overflow-x-auto border-b border-border pb-px">
      {items.map(item => <Tabs.Trigger key={item.value} value={item.value} className="relative shrink-0 px-3.5 py-3 text-sm font-medium text-muted-foreground outline-none transition after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-blue-500 after:to-cyan-400 after:opacity-0 after:transition hover:text-foreground focus-visible:bg-muted data-[state=active]:text-primary data-[state=active]:after:opacity-100">{item.label}</Tabs.Trigger>)}
    </Tabs.List>
    <Tabs.Content key={value} value={value} className="space-y-5 outline-none">{children}</Tabs.Content>
  </Tabs.Root>;
}
export function AgentDialog({ title, description, onClose, children, wide = false, footer }: { title: string; description: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const language = useOptionalLanguage();
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
    <Dialog.Content className={`fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl outline-none ${wide ? 'max-w-4xl' : 'max-w-xl'}`}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-5"><div><Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title><Dialog.Description className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</Dialog.Description></div><button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label={language?.t('common.close') || translations.en['common.close']} onClick={onClose}><X className="h-4 w-4" /></button></div>
      <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      {footer && <div className="shrink-0 border-t border-border bg-card px-5 py-4">{footer}</div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
export function AgentField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="flex min-w-0 flex-col gap-2.5 text-xs font-medium leading-5 text-muted-foreground"><span className="block">{label}</span>{children}{hint && <span className="block text-[11px] font-normal leading-relaxed text-muted-foreground">{hint}</span>}</label>;
}
export function AgentMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="updata-agent-panel updata-agent-metric"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-semibold text-foreground">{value}</p></div>;
}
export const readableError = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'The request could not be completed. Try again.';

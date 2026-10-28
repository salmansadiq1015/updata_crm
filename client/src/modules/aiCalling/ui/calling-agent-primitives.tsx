'use client';
import { useState, type ReactNode } from 'react';
import { Dialog, Tabs } from 'radix-ui';
import { Bot, X } from 'lucide-react';

export const panelClass = 'rounded-2xl border border-white/10 bg-[#0c1425] p-4 sm:p-5';
export const inputClass = 'block min-h-11 w-full min-w-0 rounded-xl border border-white/12 bg-[#090f1e] px-3.5 py-3 text-sm leading-5 text-slate-100 placeholder:text-slate-500 outline-none transition-colors hover:border-white/20 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15 disabled:opacity-50';
export const primaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/20 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-40';
export const secondaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/3 px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-40';

export function AgentAvatar({ name, url, large = false }: { name: string; url?: string | null; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-300/20 bg-gradient-to-br from-blue-500/20 to-violet-500/20 ${large ? 'h-20 w-20' : 'h-14 w-14'}`}>
    {url && failedUrl !== url ? <img src={url} alt={`${name} avatar`} onError={() => setFailedUrl(url)} className="h-full w-full object-cover" /> : name ? <span className={`${large ? 'text-2xl' : 'text-lg'} font-semibold text-violet-200`}>{name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase()}</span> : <Bot className="h-6 w-6 text-violet-300" />}
  </span>;
}
export function AgentTabs({ value, onChange, items, children, label }: {
  value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }>;
  children: ReactNode; label: string;
}) {
  return <Tabs.Root value={value} onValueChange={onChange} className="min-w-0 space-y-5">
    <Tabs.List aria-label={label} className="flex max-w-full gap-1 overflow-x-auto border-b border-white/10 pb-px">
      {items.map(item => <Tabs.Trigger key={item.value} value={item.value} className="shrink-0 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-400 outline-none transition hover:text-slate-100 focus-visible:bg-white/8 data-[state=active]:border-violet-400 data-[state=active]:text-violet-300">{item.label}</Tabs.Trigger>)}
    </Tabs.List>
    <Tabs.Content key={value} value={value} className="space-y-5 outline-none">{children}</Tabs.Content>
  </Tabs.Root>;
}
export function AgentDialog({ title, description, onClose, children, wide = false, footer }: { title: string; description: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
    <Dialog.Content className={`dark fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0b1223] text-slate-100 shadow-2xl outline-none ${wide ? 'max-w-4xl' : 'max-w-xl'}`}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 p-5"><div><Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title><Dialog.Description className="mt-1 text-xs leading-relaxed text-slate-400">{description}</Dialog.Description></div><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-white/8" aria-label={`Close ${title}`} onClick={onClose}><X className="h-4 w-4" /></button></div>
      <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      {footer && <div className="shrink-0 border-t border-white/10 bg-[#0b1223] px-5 py-4">{footer}</div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
export function AgentField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="flex min-w-0 flex-col gap-2.5 text-xs font-medium leading-5 text-slate-300"><span className="block">{label}</span>{children}{hint && <span className="block text-[11px] font-normal leading-relaxed text-slate-400">{hint}</span>}</label>;
}
export function AgentMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-white/8 bg-[#0c1425] p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">{value}</p></div>;
}
export const readableError = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'The request could not be completed. Try again.';

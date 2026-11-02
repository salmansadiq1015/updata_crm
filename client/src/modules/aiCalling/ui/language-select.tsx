'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useAgentLanguages } from '../hooks/use-ai-calling';
import type { AgentLanguage } from '../types/ai-calling-types';

/** Case/diacritic-insensitive match on code, English name and native name. */
export function filterAgentLanguages(languages: AgentLanguage[], query: string): AgentLanguage[] {
  const fold = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = fold(query.trim());
  if (!q) return languages;
  return languages.filter((l) => [l.code, l.name, l.nativeName].some((v) => fold(v).includes(q)));
}

const label = (l: AgentLanguage) => (l.nativeName && l.nativeName !== l.name ? `${l.nativeName} — ${l.name}` : l.name);

/**
 * Searchable picker for agentConfig.language, fed by GET /ai-calling/languages
 * (the server's allow-list). A stored code the list does not contain (legacy
 * regional variant) is still shown so editing never silently changes it.
 */
export function LanguageSelect({ value, onChange, className }: { value: string; onChange: (code: string) => void; className?: string }) {
  const { data, isLoading, isError } = useAgentLanguages();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const languages = useMemo(() => data?.languages ?? [], [data]);
  const filtered = useMemo(() => filterAgentLanguages(languages, query), [languages, query]);
  const selected = languages.find((l) => l.code.toLowerCase() === value.toLowerCase());

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (code: string) => { onChange(code); setOpen(false); setQuery(''); };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`${className ?? ''} flex items-center justify-between gap-2 text-start`}
        aria-haspopup="listbox"
        aria-label="Conversation language"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={isLoading}
      >
        <span className="truncate">
          {isLoading ? 'Loading languages…' : selected ? label(selected) : value}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {isError ? <p className="mt-1 text-[11px] text-rose-600">Could not load the language list. The current value is kept.</p> : null}
      {selected?.support === 'limited' ? (
        <p className="mt-1 text-[11px] text-amber-600">Limited support: speech recognition quality for this language is not documented and may be lower.</p>
      ) : null}
      {open ? (
        <div className="absolute z-20 mt-1 w-72 max-w-[90vw] rounded-lg border border-border bg-card shadow-theme-lg">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Search languages"
              aria-label="Search languages"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); choose(filtered[0].code); }
              }}
            />
          </div>
          <ul role="listbox" aria-label="AI agent language" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? <li className="px-3 py-2 text-xs text-muted-foreground">No matching language</li> : null}
            {filtered.map((l) => {
              const active = l.code.toLowerCase() === value.toLowerCase();
              return (
                <li key={l.code} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => choose(l.code)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-sm hover:bg-muted ${active ? 'font-semibold' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate" dir={l.rtl ? 'rtl' : undefined}>{l.nativeName}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{l.name} · {l.code}{l.support === 'limited' ? ' · limited' : ''}</span>
                    </span>
                    {active ? <Check className="h-4 w-4 shrink-0 text-brand-500" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

'use client';
import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronDown, Coins } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CURRENCIES } from '@/shared/data/currencies';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAccountingCurrency } from '../state/accounting-currency';
import styles from './banking-workspace.module.css';

export function CurrencyPicker({ value, onValueChange, label = 'Currency', id, disabled, required }) {
  const [open, setOpen] = useState(false);
  const { locale } = useLanguage();
  const options = useMemo(() => {
    let names;
    try { names = new Intl.DisplayNames([locale || 'en'], { type: 'currency' }); } catch { /* Use source names. */ }
    return CURRENCIES.map(row => ({ ...row, label: names?.of(row.code) || row.name }));
  }, [locale]);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open} aria-required={required || undefined} disabled={disabled} className={`${styles.selectTrigger} justify-between`}><Coins className="size-4 shrink-0 text-muted-foreground" /><span className="flex-1 text-left">{value || 'Select currency'}</span><ChevronDown className="size-3.5 text-muted-foreground" /></Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl">
      <Command label="Search currencies" className="w-full">
        <Command.Input aria-label="Search currencies" placeholder={locale === 'de' ? 'Währung suchen…' : 'Search code or currency…'} className="h-11 w-full border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground" />
        <Command.List className="max-h-72 overflow-y-auto overscroll-contain p-1" aria-label="Currencies">
          <Command.Empty className="p-5 text-center text-xs text-muted-foreground">{locale === 'de' ? 'Keine Währung gefunden' : 'No currency found'}</Command.Empty>
          {options.map(row => <Command.Item key={row.code} value={`${row.code} ${row.label} ${row.name}`} onSelect={() => { onValueChange(row.code); setOpen(false); }} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary"><span className="w-10 shrink-0 font-mono text-xs font-semibold">{row.code}</span><span className="min-w-0 flex-1 truncate text-xs">{row.label}</span>{row.code === value && <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary" />}</Command.Item>)}
        </Command.List>
      </Command>
    </PopoverContent>
  </Popover>;
}

export function GlobalAccountingCurrency() {
  const { currency, setCurrency } = useAccountingCurrency();
  const { locale } = useLanguage();
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
    <div><p className="text-xs font-semibold">{locale === 'de' ? 'Globale Finanzwährung' : 'Global accounting currency'}</p><p className="mt-1 text-[11px] text-muted-foreground">{locale === 'de' ? 'Gemeinsame Auswahl für Banking, Prognosen und Berichte. Keine automatische Umrechnung.' : 'Shared across banking, forecasts, and reports. Existing amounts keep their original currency.'}</p></div>
    <div className="w-36"><CurrencyPicker id="global-accounting-currency" label="Global currency" value={currency} onValueChange={setCurrency} /></div>
  </div>;
}

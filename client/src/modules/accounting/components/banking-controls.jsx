'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import styles from './banking-workspace.module.css';

export function BankingSelect({ value, onValueChange, options, label, id, placeholder, icon: Icon, disabled, required, className }) {
  return (
    <Select value={String(value ?? '')} onValueChange={onValueChange} disabled={disabled} required={required}>
      <SelectTrigger id={id} aria-label={label} className={cn(styles.selectTrigger, className)}>
        {Icon && <Icon className={styles.selectIcon} aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate text-left"><SelectValue placeholder={placeholder} /></span>
      </SelectTrigger>
      <SelectContent align="start" sideOffset={6} className={styles.selectMenu}>
        {options.map(option => <SelectItem key={option.value} value={String(option.value)} className={styles.selectOption}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

import { cn } from '@/lib/utils';
import { ORDER_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
import { useLanguage } from '@/lib/i18n/language-context';

export function FieldOpsOrderStatusBadge({ status, size = 'md' }) {
  const { language } = useLanguage();
  const cfg = ORDER_STATUS_CONFIG[status] || {};
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      cfg.badge,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dot)} />
      {language === 'de' ? cfg.label : cfg.labelEn}
    </span>
  );
}

import { cn } from '@/lib/utils';
import { PROJECT_STATUS_CONFIG } from '@/modules/pm/constants/pm-constants';
import { useLanguage } from '@/lib/i18n/language-context';

export function ProjectStatusBadge({ status, size = 'default' }) {
  const { language } = useLanguage();
  const cfg = PROJECT_STATUS_CONFIG[status];
  if (!cfg) return null;

  const label = language === 'de' ? cfg.label : cfg.labelEn;
  const isSmall = size === 'sm';

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 font-medium rounded-full',
      cfg.bgColor, cfg.textColor,
      isSmall ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
    )}>
      <span className={cn('rounded-full shrink-0', cfg.dotColor, isSmall ? 'h-1.5 w-1.5' : 'h-2 w-2')} />
      {label}
    </span>
  );
}

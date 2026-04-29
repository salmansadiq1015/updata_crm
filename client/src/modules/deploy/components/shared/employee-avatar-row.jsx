'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function EmployeeAvatarRow({ name, className }) {
  const { t } = useLanguage();

  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-medium">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-sm font-medium">{name || t('deploy.common.unknown', 'Unbekannt')}</span>
    </div>
  );
}

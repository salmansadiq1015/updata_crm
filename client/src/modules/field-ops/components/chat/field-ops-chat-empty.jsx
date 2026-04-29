'use client';

import { MessageSquare } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export function FieldOpsChatEmpty() {
  const { t } = useLanguage();

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <MessageSquare className="h-12 w-12 opacity-30" />
      <div className="text-center">
        <p className="text-sm font-medium">{t('fieldOps.chat.selectProject', 'Select a project')}</p>
        <p className="text-xs mt-1 opacity-70">
          {t('fieldOps.chat.selectProjectDesc', 'Choose a conversation from the list')}
        </p>
      </div>
    </div>
  );
}

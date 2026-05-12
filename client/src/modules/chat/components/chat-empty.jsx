import { MessageSquare } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export function ChatEmpty() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-1 flex-col items-center justify-center h-full gap-4 bg-muted/10">
      <div className="rounded-full bg-primary/10 p-6">
        <MessageSquare className="h-12 w-12 text-primary/60" />
      </div>
      <div className="text-center space-y-1">
        <h3 className="text-xl font-semibold text-foreground">{t('chat.emptyTitle', 'Your conversations')}</h3>
        <p className="text-sm text-muted-foreground max-w-60">
          {t('chat.emptyDesc', 'Select a chat to start messaging or create a new conversation')}
        </p>
      </div>
    </div>
  );
}

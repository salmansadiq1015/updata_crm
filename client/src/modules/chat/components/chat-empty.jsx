import { Bot, FileText, MessageSquare, Search, Users, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/lib/i18n/language-context';

const HIGHLIGHTS = [
  { icon: MessageSquare, labelKey: 'chat.emptyDirect', fallback: 'Direct messaging' },
  { icon: Users, labelKey: 'chat.emptyGroups', fallback: 'Project and team groups' },
  { icon: FileText, labelKey: 'chat.emptyFiles', fallback: 'Files, images, and voice' },
  { icon: Bot, labelKey: 'chat.emptyAi', fallback: 'AI summaries and actions' },
];

export function ChatEmpty() {
  const { t } = useLanguage();

  return (
    <div className="flex h-full flex-1 items-center justify-center overflow-hidden bg-background p-6">
      <div className="w-full max-w-3xl">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] border border-primary/25 bg-primary/10 text-primary shadow-sm">
          <MessageSquare className="h-9 w-9" />
        </div>

        <div className="mt-6 text-center">
          <div className="mb-3 flex justify-center">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              <Zap className="mr-1.5 h-3.5 w-3.5 text-primary" />
              {t('chat.communicationHub', 'Communication hub')}
            </Badge>
          </div>
          <h3 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('chat.emptyTitle', 'Your conversations')}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {t('chat.emptyDesc', 'Select a chat to start messaging or create a new conversation')}
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.labelKey} className="rounded-3xl border border-border/70 bg-card/70 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-medium">{t(item.labelKey, item.fallback)}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          {t('chat.emptySearchHint', 'Use conversation search for messages, files, and history.')}
        </div>
      </div>
    </div>
  );
}

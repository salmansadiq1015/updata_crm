'use client';
import { useState } from 'react';
import { MessageSquare, SquarePen, UserPlus, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { UserSearchDialog } from './user-search-dialog';
import { LeadChatDialog } from './lead-chat-dialog';

export function ChatEmpty() {
  const { t } = useLanguage();
  const tr = key => t(`chat.workspace.${key}`);
  const { hasPermission } = usePermissions();
  const [direct, setDirect] = useState(false);
  const [lead, setLead] = useState(false);
  return <div className="chat-empty flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-12">
    <div className="max-w-lg"><span className="chat-empty-mark mb-6 inline-flex size-16 items-center justify-center rounded-[22px] border border-primary/15 bg-primary/5 text-primary"><MessageSquare className="size-7" /></span><p className="mb-2 text-xs font-medium tracking-wide text-primary">{tr('workspace')}</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tr('emptyTitle')}</h1><p className="mt-4 text-sm leading-7 text-muted-foreground">{tr('emptyDescription')}</p>
      <div className="mt-7 flex flex-wrap gap-3">{hasPermission('chat:write') && <Button onClick={() => setDirect(true)}><SquarePen className="size-4" />{t('chat.newMessage')}</Button>}{hasPermission('chat:write') && hasPermission('lead:read') && <Button variant="outline" onClick={() => setLead(true)}><UserPlus className="size-4" />{tr('newLeadChat')}</Button>}</div>
      <div className="mt-9 space-y-3 border-t border-border pt-6 text-xs text-muted-foreground"><p className="flex items-center gap-2"><ArrowUpRight className="size-3.5 text-primary" />{tr('internalHint')}</p><p className="flex items-center gap-2"><ArrowUpRight className="size-3.5 text-primary" />{tr('externalShortHint')}</p></div>
    </div><UserSearchDialog open={direct} onClose={() => setDirect(false)} />{lead && <LeadChatDialog open onOpenChange={setLead} />}
  </div>;
}

'use client';

import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { toFieldOpsOrderItems } from '@/modules/field-ops/utils/order-option-utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { FieldOpsChatSidebarItem } from './field-ops-chat-sidebar-item';
import { MessageSquare } from 'lucide-react';

export function FieldOpsChatSidebar({ activeProjectId }) {
  const { data: ordersResponse, isLoading } = useFieldOpsOrders({});
  const { t } = useLanguage();

  const orders = useMemo(() => toFieldOpsOrderItems(ordersResponse), [ordersResponse]);
  const conversations = useMemo(
    () => orders.filter((order) => order.projectId || order.project_id),
    [orders],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b shrink-0">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t('fieldOps.chat.title', 'Chat')}
        </h2>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
                  <div className="h-2.5 bg-muted animate-pulse rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground px-4 text-center">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t('fieldOps.chat.noProjects', 'No projects with chat')}</p>
          </div>
        ) : (
          <div className="py-1">
            {conversations.map((order) => (
              <FieldOpsChatSidebarItem
                key={order._id}
                order={order}
                isActive={(order.projectId || order.project_id) === activeProjectId}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
